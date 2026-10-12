// The collector of the distill eval: runs akm's distill on one memory at a time in a sandbox of its own, with the model under test as the
// engine, and builds each case's row from what akm returned. It is the COLLECTOR part of the eval's measurement (see measurement.ts and
// lib/manifest.ts): the akm config it writes, the commands it runs and what it records of the answer. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { cpSync } from "node:fs";
import { join } from "node:path";
import { createSandbox, engineConfig, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { exitMessage, hideEndpoint } from "../../../lib/cli.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { type LoadedCase, type Proposal, type Row, conceptId, distillAction, makeRow } from "./score.ts";

export const NAME = "distill";

/** The strategy that runs distill and nothing else. */
export const STRATEGY = "distill-only";

/** How long one akm command of a case may run, in milliseconds: one case is two model calls on a slow local model. */
export const IMPROVE_TIMEOUT_MS = 15 * 60_000;

/** The states a proposal can be in. The queue is read back for each. */
export const STATES = ["pending", "accepted", "rejected", "reverted"];

/** One LLM engine, the model under test, and a strategy that runs distill alone. Requests use temperature 0 and ask for no thinking. */
export function distillConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey);
  config.engines.model.temperature = 0;
  config.engines.model.enableThinking = false;
  config.defaults.improveStrategy = STRATEGY;
  const off = { enabled: false };
  config.improve = {
    strategies: {
      [STRATEGY]: {
        engine: "model",
        processes: { reflect: off, distill: { enabled: true, allowedTypes: ["memory"] }, consolidate: off, memoryInference: off, extract: off, validation: off, triage: off, proactiveMaintenance: off },
        sync: off,
      },
    },
  };
  return config;
}

/** The akm config of a run: the engine at temperature 0 with thinking off, and the strategy, with the config patch merged in. */
export const configFor = (ctx: { baseUrl: string; model: string; hasKey: boolean; overrides?: Overrides }): Record<string, unknown> =>
  patchedConfig(distillConfig(ctx.baseUrl, ctx.model, ctx.hasKey), ctx.overrides ?? defaultOverrides(STRATEGY));

/** The ref of a memory in a case, which `akm improve` takes as its scope. */
export const memoryRef = (c: Pick<LoadedCase, "name">): string => `memories/${c.name}`;

/** Did the command run past its timeout? runAkm ends the stderr of a command it killed with "akm timed out after <N>s", and runAkmJson throws a message that says so. */
export const timedOutMessage = (message: string): boolean => /\btimed out after [\d.]+s\b/.test(message);

/** The gate reason akm gives a proposal that extends an existing lesson (distill, akm #1090). */
export const UPDATE_REASON = "distill-update";

/** The lesson proposals distill queued, new lessons and updates to existing ones, from the lists `akm proposal list --detail full` printed for each state. */
export function lessonProposals(listed: { status: string; proposals?: unknown[] }[]): Proposal[] {
  const found: Proposal[] = [];
  for (const { status, proposals } of listed) {
    for (const p of (proposals ?? []) as Record<string, any>[]) {
      if (p?.source !== "distill" || typeof p.ref !== "string" || !conceptId(p.ref).startsWith("lessons/")) continue;
      const gate = p.gateDecision ? `${p.gateDecision.outcome}/${p.gateDecision.reason}` : null;
      const reason = typeof p.gateDecision?.judgeReason === "string" ? p.gateDecision.judgeReason : null;
      found.push({ ref: p.ref, status, gate, scores: p.gateDecision?.scores ?? null, reason, content: typeof p.payload?.content === "string" ? p.payload.content : "", update: p.gateDecision?.reason === UPDATE_REASON });
    }
  }
  return found;
}

/** What the scorer reads of `akm improve`'s result: the distill action, and the models and calls of the usage report. */
export interface Improved {
  actions: { mode?: string; result: Record<string, unknown> }[];
  usageReport?: { byProcessEngineModel: { model?: unknown; calls?: unknown }[] };
}

/** The fields of the distill action's result that the scorer reads. */
const RESULT_FIELDS = ["outcome", "skipReason", "message", "reason", "error", "criteria", "rejectedContent"];

/**
 * `akm improve`'s result cut to what the scorer reads, which is what a row keeps of it (see `Raw`): the one action the scorer looks at, with
 * the fields of its result that it reads, and the usage report's rows with their model and calls. The rest of the result is not kept.
 */
export function trimImprove(improve: unknown): Improved {
  const action = distillAction(improve);
  const result = action?.result ?? {};
  const kept = Object.fromEntries(RESULT_FIELDS.filter((k) => k in result).map((k) => [k, result[k]]));
  const rows = (improve as { usageReport?: { byProcessEngineModel?: unknown } } | null)?.usageReport?.byProcessEngineModel;
  return {
    actions: action === undefined ? [] : [{ mode: action.mode, result: kept }],
    ...(Array.isArray(rows) ? { usageReport: { byProcessEngineModel: rows.map((r: { model?: unknown; calls?: unknown } | null) => ({ model: r?.model, calls: r?.calls })) } } : {}),
  };
}

/** What one case needs of the run: the akm config, the model's endpoint (to keep it out of what akm says), the strategy and patch, and the time limit of the improve command. */
export interface CaseContext {
  config: Record<string, unknown>;
  baseUrl: string;
  overrides?: Overrides;
  /** How long `akm improve` may run, in milliseconds. The default is IMPROVE_TIMEOUT_MS. */
  improveTimeoutMs?: number;
}

/** One case: a new sandbox with the case's bundle, distill run on its memory alone, and the queue read back. */
export async function runCase(c: LoadedCase, ctx: CaseContext): Promise<Row> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const hide = <T>(value: T): T => hideEndpoint(value, ctx.baseUrl); // akm's errors name the endpoint it called, and results get shared
  const failed = (message: string, timedOut = false): Row => makeRow(c, { error: hide(message), seconds: seconds(), timedOut });
  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  try {
    writeConfig(sandbox, ctx.config);
    cpSync(c.dir, join(sandbox.dir, "bundle"), { recursive: true });
    if (c.feedback?.length) await runAkm(sandbox, ["index"]); // akm records feedback only against an indexed asset
    for (const f of c.feedback ?? []) {
      const fb = await runAkm(sandbox, ["feedback", memoryRef(c), f.signal === "positive" ? "--positive" : "--negative", ...(f.reason ? ["--reason", f.reason] : [])]);
      if (fb.code !== 0) return failed(exitMessage(fb.code, fb.stderr, fb.stdout), fb.timedOut);
    }
    const args = ["improve", memoryRef(c), "--strategy", (ctx.overrides ?? defaultOverrides(STRATEGY)).strategy, "--no-sync", "--require-engines", "--json-to-stdout", "--format", "json"];
    const { stdout, stderr, code, timedOut } = await runAkm(sandbox, args, { timeoutMs: ctx.improveTimeoutMs ?? IMPROVE_TIMEOUT_MS });
    if (timedOut) return failed(exitMessage(code, stderr, stdout), true);
    let improve: unknown;
    try {
      improve = JSON.parse(stdout);
    } catch {
      return failed(exitMessage(code, stderr, stdout));
    }
    if (code !== 0) return failed(exitMessage(code, stderr, stdout));
    const listed = [];
    for (const status of STATES) listed.push({ status, ...(await runAkmJson<{ proposals?: unknown[] }>(sandbox, ["proposal", "list", "--status", status, "--detail", "full"])) });
    return makeRow(c, { improve: hide(trimImprove(improve)), proposals: lessonProposals(listed), seconds: seconds() });
  } catch (e) {
    const message = (e as Error).message;
    return failed(message, timedOutMessage(message));
  } finally {
    removeSandbox(sandbox);
  }
}
