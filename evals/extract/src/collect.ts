// The collector of the extract eval: runs akm's extract on one session at a time in a sandbox of its own, with the model under test as the
// engine, and builds each case's row from what akm returned. It is the COLLECTOR part of the eval's measurement (see measurement.ts and
// lib/manifest.ts): the akm config it writes, the commands it runs and what it records of the answer. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSandbox, engineConfig, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { exitMessage, hideEndpoint } from "../../../lib/cli.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import type { LoadedCase } from "./lib.ts";
import { type Case, type Outcome, type Row, type Saved, makeRow } from "./score.ts";

export const NAME = "extract";
const EXTRACT_TIMEOUT_MS = 15 * 60_000; // one session, on a slow local model: one call, and one more if the reply cannot be read

/** The strategy that gives extract its engine and settings. */
export const STRATEGY = "extract-only";

/**
 * One LLM engine, the model under test, and a strategy that gives extract that engine. Requests use temperature 0
 * and ask for no thinking. Session assets are off, so a session takes one model call and not two. The heuristic
 * triage gate is off too, which akm's default strategy turns on, so every session reaches the model.
 */
export function extractConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey);
  config.engines.model.temperature = 0;
  config.engines.model.enableThinking = false;
  config.improve = { strategies: { [STRATEGY]: { engine: "model", processes: { extract: { enabled: true, indexSessions: false, triage: { enabled: false } } } } } };
  return config;
}

// ---- What akm did ----------------------------------------------------------------------------------------------

const KINDS: Record<string, Saved["type"]> = { memories: "memory", lessons: "lesson", knowledge: "knowledge" };
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** The memories extract proposed, from the list `akm proposal list --detail full` printed. Extract queues them as pending proposals. */
export function savedMemories(listed: { proposals?: unknown[] }): Saved[] {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const found: Saved[] = [];
  for (const p of (listed.proposals ?? []) as Record<string, any>[]) {
    if (p?.source !== "extract" || typeof p.ref !== "string") continue;
    const front = p.payload?.frontmatter ?? {};
    const body = text(p.payload?.content).replace(FRONTMATTER, "").trim();
    const kind = (p.ref.includes("//") ? p.ref.slice(p.ref.indexOf("//") + 2) : p.ref).split("/")[0];
    found.push({ ref: p.ref, type: KINDS[kind] ?? "other", confidence: typeof front.confidence === "number" ? front.confidence : null, text: [text(front.description), text(front.when_to_use), body].filter(Boolean).join("\n") });
  }
  return found;
}

/** The result `akm proposal extract` printed. */
export interface ExtractResult {
  ok?: boolean;
  proposals?: string[];
  sessions?: { sessionId?: string; candidateCount?: number; proposalIds?: string[]; skipped?: boolean; skipReason?: string; rationaleIfEmpty?: string; warnings?: string[] }[];
  warnings?: string[];
}

/**
 * What akm says extract did with the session. A reply it could not read, even after its one corrective retry, is
 * `unusable`: the model failed. A skip for any other reason, such as a call that failed or timed out, is an `error`.
 */
export function extractOutcome(id: string, result: ExtractResult): { outcome: Outcome; detail: string } {
  const session = result.sessions?.find((s) => s.sessionId === id);
  const warnings = (session?.warnings ?? []).join("; ");
  if (!result.ok || !session) return { outcome: "error", detail: (result.warnings ?? [])[0] ?? `akm did not process the session ${id}` };
  if (session.skipped) return { outcome: session.skipReason === "malformed_model_output" ? "unusable" : "error", detail: `${session.skipReason}${warnings ? `: ${warnings}` : ""}` };
  if ((session.candidateCount ?? 0) === 0) return { outcome: "empty", detail: session.rationaleIfEmpty ?? "" };
  if ((session.proposalIds ?? []).length === 0) return { outcome: "unusable", detail: warnings || "akm queued none of the candidates" };
  return { outcome: "saved", detail: warnings };
}

/**
 * Did akm say it queued anything for the session? It says so twice, in the result's list of proposals and in the
 * session's own `proposalIds`, and the outcome goes by the second. The queue is read when either says so.
 */
export function queuedAny(id: string, result: ExtractResult): boolean {
  const own = result.sessions?.find((s) => s.sessionId === id)?.proposalIds ?? [];
  return (result.proposals ?? []).length > 0 || own.length > 0;
}

/** Is this the message of an akm command that timed out? runAkmJson throws "akm <command> timed out after <N>s", and a command that failed on its own is "akm <command> failed (exit N): ...". */
export const timedOutIn = (message: string): boolean => /^akm \S+ timed out after \d+(?:\.\d+)?s$/.test(message.trim());

/** What one case's akm run left behind. */
export interface CaseRun {
  result: ExtractResult;
  saved: Saved[];
  seconds: number;
}

/** The row for a case from what akm did: the outcome its result gives, and the queue read back. */
export function scoreCase(c: Case, run: CaseRun): Row {
  const { outcome, detail } = extractOutcome(c.id, run.result);
  return makeRow(c, { outcome, detail, saved: run.saved, seconds: run.seconds });
}

// ---- Running a case --------------------------------------------------------------------------------------------

/** What one case needs of the run: the model and its endpoint, the strategy and patch, and the time limit of an akm command. */
export interface CaseContext {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  overrides?: Overrides;
  /** How long akm may take on a session, in milliseconds. */
  timeoutMs?: number;
}

/** The akm config of a run: the engine at temperature 0 with thinking off, and the strategy, with the config patch merged in. */
export const configFor = (ctx: Pick<CaseContext, "baseUrl" | "model" | "hasKey" | "overrides">): Record<string, any> => patchedConfig(extractConfig(ctx.baseUrl, ctx.model, ctx.hasKey), ctx.overrides ?? defaultOverrides(STRATEGY));

/**
 * One case: a new sandbox with the session where akm reads Claude Code sessions, extract run on that session alone,
 * and the queue read back.
 */
export async function runCase(c: LoadedCase, ctx: CaseContext): Promise<Row> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const hide = (text: string): string => hideEndpoint(text, ctx.baseUrl); // akm's errors name the endpoint it called, and results get shared
  const failed = (message: string, timedOut = false): Row => makeRow(c, { outcome: "error", detail: message, saved: [], seconds: seconds(), timedOut });
  const timeoutMs = ctx.timeoutMs ?? EXTRACT_TIMEOUT_MS;
  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  try {
    writeConfig(sandbox, configFor(ctx));
    // Claude Code keeps a session at <projects>/<project>/<id>.jsonl. akm looks in AKM_CLAUDE_PROJECTS_DIR, so it
    // finds this one and never reads the caller's own sessions.
    const projects = join(sandbox.dir, "projects");
    mkdirSync(join(projects, c.project), { recursive: true });
    cpSync(c.file, join(projects, c.project, `${c.id}.jsonl`));
    sandbox.env.AKM_CLAUDE_PROJECTS_DIR = projects;
    const strategy = (ctx.overrides ?? defaultOverrides(STRATEGY)).strategy;
    const args = ["proposal", "extract", "--type", "claude", "--location", projects, "--session-id", c.id, "--strategy", strategy, "--format", "json"];
    const { stdout, stderr, code, timedOut } = await runAkm(sandbox, args, { timeoutMs });
    if (timedOut) return failed(`akm proposal extract timed out after ${+(timeoutMs / 1000).toFixed(1)}s`, true);
    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      return failed(hide(exitMessage(code, stderr, stdout)));
    }
    // The queue is read when akm says it queued something, in its list of proposals or in the session's own.
    const listed = queuedAny(c.id, result) ? await runAkmJson<{ proposals?: unknown[] }>(sandbox, ["proposal", "list", "--status", "pending", "--detail", "full"], { timeoutMs }) : {};
    return scoreCase(c, { result, saved: savedMemories(listed), seconds: seconds() });
  } catch (e) {
    const message = (e as Error).message;
    return failed(hide(message), timedOutIn(message));
  } finally {
    removeSandbox(sandbox);
  }
}
