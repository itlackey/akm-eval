// The collector of the nightly eval: plants the items in a sandbox, runs one night of akm improve on them with the model under test as the engine, drains
// the proposals as the lab's nightly does, and keeps what akm and the library show of each item. It is the COLLECTOR part of the eval's measurement (see
// measurement.ts and lib/manifest.ts): the akm config it writes, the commands it runs, the files it plants and what it records of the night. The scoring is
// score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Sandbox, engineConfig, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { indexedRef, indexedRefs } from "../../../lib/akm/indexed-refs.ts";
import { Fatal, fail, failureMessage, hideEndpoint } from "../../../lib/cli.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { type Embedder, embedderEnv, noteAges, withEmbedder } from "../../consolidate/src/sandbox.ts";
import { type Feedback, type Item, refOf } from "./items.ts";
import { readLibrary } from "./library.ts";
import { type Action, type Lane, type Proposal, type Raw, conceptId, outsideChanges, watchedPaths, watchedRefs } from "./score.ts";

export const NAME = "nightly";
/** The strategy akm ships, and the one the lab runs. */
export const STRATEGY = "default";

const STEP_TIMEOUT_MS = 5 * 60_000; // an akm command that calls no model
const REAL_INDEX_TIMEOUT_MS = 30 * 60_000; // the real embedder loads its model to index, and the first run downloads it (133 MB)
const IMPROVE_BUDGET_MS = 45 * 60_000; // akm's own wall-clock budget for the improve run: it skips what it has not reached
const IMPROVE_TIMEOUT_MS = IMPROVE_BUDGET_MS + 10 * 60_000; // and this ends akm if it does not stop
const STATES = ["pending", "accepted", "rejected", "reverted"]; // the states a proposal can be in
const DAY_MS = 86_400_000;

/** What runAkmJson throws, and what a caller writes, when the eval's time limit killed akm: `akm index timed out after 120s`. */
export const timeoutMessage = (command: string, timeoutMs: number): string => `akm ${command} timed out after ${+(timeoutMs / 1000).toFixed(1)}s`;

/**
 * The akm config of a night: one LLM engine, the model under test, for every process, and semantic search on, which the pair pass needs.
 * The strategy is akm's own `default`. Requests use temperature 0 and ask for no thinking, as distill's and extract's do, so a night
 * does not depend on akm's default sampling. The embedder is the deterministic one unless `real` says akm's built-in model.
 */
export function nightlyConfig(baseUrl: string, model: string, hasKey: boolean, embedder: Embedder = "deterministic"): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "nightly");
  config.engines.nightly.temperature = 0;
  config.engines.nightly.enableThinking = false;
  return withEmbedder(config, embedder);
}

// --- What akm says -----------------------------------------------------------------------------------------------

/** The proposals in the lists `akm proposal list --status <state> --detail full` printed for each state. */
export function parseProposals(listed: { status: string; proposals?: unknown[] }[]): Proposal[] {
  const found: Proposal[] = [];
  for (const { status, proposals } of listed) {
    for (const p of (proposals ?? []) as Record<string, any>[]) {
      if (typeof p?.id !== "string" || typeof p.ref !== "string" || typeof p.source !== "string") continue;
      const g = p.gateDecision;
      const r = p.retirement;
      found.push({
        id: p.id,
        ref: conceptId(p.ref),
        status,
        source: p.source,
        gate: g ? `${g.outcome}/${g.reason}` : null,
        judgeReason: typeof g?.judgeReason === "string" ? g.judgeReason : null,
        retirement: typeof r?.retiredRef === "string" ? { retired: conceptId(r.retiredRef), successor: conceptId(String(r.successorRef ?? "")), label: String(r.judgeLabel ?? ""), reason: String(r.judgeReason ?? "") } : null,
        content: typeof p.payload?.content === "string" ? p.payload.content : "",
      });
    }
  }
  return found;
}

/** What the improve result says of the proactive lane: how many refs it picked of how many were due, and which. Null when the lane did not run (it is off, or akm does not report it). */
export function proactiveLane(improve: unknown): Lane | null {
  const lane = (improve as { proactiveMaintenance?: { selected?: unknown; dueTotal?: unknown; selectedRefs?: unknown } } | null)?.proactiveMaintenance;
  if (!lane || !Array.isArray(lane.selectedRefs)) return null;
  return { selected: Number(lane.selected ?? lane.selectedRefs.length), due: Number(lane.dueTotal ?? 0), refs: lane.selectedRefs.map((r) => conceptId(String(r))) };
}

export interface CallRow {
  process: string;
  /** The model name the endpoint reported. A call that got no answer is filed under the name that was asked for. */
  model: string;
  calls: number;
  failures: number;
  prompt_tokens: number;
  completion_tokens: number;
}

/** The night's model calls from akm's usage report: how many, how many failed, and the rows by process and model. */
export function callStats(improve: unknown): { calls: number; failures: number; by: CallRow[] } {
  const rows = (improve as { usageReport?: { byProcessEngineModel?: Record<string, unknown>[] } } | null)?.usageReport?.byProcessEngineModel;
  const by: CallRow[] = [];
  for (const r of Array.isArray(rows) ? rows : []) by.push({ process: String(r.process), model: String(r.model), calls: Number(r.calls ?? 0), failures: Number(r.failures ?? 0), prompt_tokens: Number(r.promptTokens ?? 0), completion_tokens: Number(r.completionTokens ?? 0) });
  return { calls: by.reduce((n, r) => n + r.calls, 0), failures: by.reduce((n, r) => n + r.failures, 0), by };
}

/** The actions of the improve result, with what the scorer reads of each: the ref, the mode and the strings of the result that say why. */
export function actionsOf(improve: unknown): Action[] {
  const actions = (improve as { actions?: unknown })?.actions;
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((a) => typeof a?.ref === "string" && typeof a?.mode === "string")
    .map((a) => {
      const r = a.result;
      return { ref: a.ref, mode: a.mode, ...(r && typeof r === "object" ? { result: { reason: r.reason, error: r.error, outcome: r.outcome, skipReason: r.skipReason, message: r.message } } : {}) };
    });
}

// --- The night ---------------------------------------------------------------------------------------------------

/** Puts the items' files in the sandbox's bundle. The notes of a pair carry the file times akm reads as their dates. */
export function plant(sandbox: Sandbox, items: Item[], files: Map<string, string>): void {
  const now = Date.now();
  for (const item of items) {
    for (const path of item.files) {
      const file = join(sandbox.dir, "bundle", path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, files.get(path) as string);
      if (item.kind === "pair") {
        const when = new Date(now - noteAges(item.older)[path === item.a ? "a" : "b"] * DAY_MS);
        utimesSync(file, when, when);
      }
    }
  }
}

/** The arguments of `akm feedback`. A fix carries its exact edits and its source. */
export function feedbackArgs(f: Feedback): string[] {
  const args = ["feedback", f.ref, `--${f.signal}`, "--reason", f.reason];
  if (f.fix) {
    const fix = f.fix;
    fix.replace.forEach((old, i) => args.push(`--replace=${old}`, `--with=${fix.with[i]}`));
    args.push(`--source=${fix.source}`);
  }
  return args;
}

/** What a night needs of its context: how to make a sandbox, the model and its endpoint, the strategy and patch, the embedder and, for a test, the time limit. */
export type CollectContext = {
  newSandbox: () => Sandbox;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  overrides?: Overrides;
  /** How akm embeds the notes. The sandbox newSandbox makes has to match it: see sandboxOptions. Default: deterministic. */
  embedder?: Embedder;
  /** The time limit of the improve run, in milliseconds, in place of the eval's own: for tests. */
  improveTimeoutMs?: number;
};

const embedderOf = (ctx: { embedder?: Embedder }): Embedder => ctx.embedder ?? "deterministic";

/** The akm config a night writes: the eval's own, with the config patch merged into it. summary.json records it. */
export const effectiveConfig = (ctx: CollectContext): Record<string, any> => patchedConfig(nightlyConfig(ctx.baseUrl, ctx.model, ctx.hasKey, embedderOf(ctx)), ctx.overrides ?? defaultOverrides(STRATEGY));

const seconds = (ms: number): number => Number((ms / 1000).toFixed(1));

/** What the night left: the library before and after, akm's improve result, every proposal in every state, what the drain did and how long each step took. */
export interface Collected {
  /** Actual indexed refs of the planted files, before feedback or improve. */
  refs: Record<string, string>;
  before: Map<string, string>;
  after: Map<string, string>;
  improve: unknown;
  proposals: Proposal[];
  drain: { promoted: number; rejected: number; deferred: number; failed: number };
  seconds: { index: number; feedback: number; improve: number; drain: number };
}

/** The night: a sandbox with the planted library, indexed, the feedback recorded, improve run, the proposals drained and read back. */
export async function haveNight(items: Item[], files: Map<string, string>, ctx: CollectContext): Promise<Collected> {
  const sandbox = ctx.newSandbox();
  try {
    return await runNight(sandbox, items, files, ctx);
  } catch (e) {
    if (e instanceof Fatal) throw e;
    return fail(hideEndpoint((e as Error).message, ctx.baseUrl), 1); // a failed akm command: its message, not a stack
  } finally {
    removeSandbox(sandbox);
  }
}

async function runNight(sandbox: Sandbox, items: Item[], files: Map<string, string>, ctx: CollectContext): Promise<Collected> {
  const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
  const improveTimeoutMs = ctx.improveTimeoutMs ?? IMPROVE_TIMEOUT_MS;
  writeConfig(sandbox, effectiveConfig(ctx));
  Object.assign(sandbox.env, embedderEnv(embedderOf(ctx)));
  plant(sandbox, items, files);
  const bundle = join(sandbox.dir, "bundle");
  const before = readLibrary(bundle);
  const step = async <T>(name: string, f: () => Promise<T>): Promise<[T, number]> => {
    const t0 = performance.now();
    const value = await f();
    console.log(`  ${name} ${seconds(performance.now() - t0)}s`);
    return [value, seconds(performance.now() - t0)];
  };

  const [, index] = await step("index", () => runAkmJson(sandbox, ["index", "--full"], { timeoutMs: embedderOf(ctx) === "real" ? REAL_INDEX_TIMEOUT_MS : STEP_TIMEOUT_MS }));
  const refs = indexedRefs(sandbox);
  const plantedRefs = new Map(items.flatMap((item) => item.files).map((path) => [refOf(path), indexedRef(refs, path)]));
  const [, feedback] = await step("feedback", async () => {
    for (const item of items) for (const f of item.feedback) {
      const ref = plantedRefs.get(f.ref);
      if (!ref) throw new Error(`Feedback ref ${f.ref} does not identify a planted file`);
      await runAkmJson(sandbox, feedbackArgs({ ...f, ref }), { timeoutMs: STEP_TIMEOUT_MS });
    }
  });
  const improveArgs = ["improve", "--strategy", overrides.strategy, "--require-engines", "--no-sync", "--timeout-ms", String(IMPROVE_BUDGET_MS), "--json-to-stdout", "--format", "json"];
  const [improved, improveSeconds] = await step("improve", () => runAkm(sandbox, improveArgs, { timeoutMs: improveTimeoutMs }));
  if (improved.timedOut) fail(timeoutMessage("improve", improveTimeoutMs), 1); // it was killed in the middle of the night: there is no result to score
  if (improved.code !== 0) fail(hideEndpoint(failureMessage(`akm ${improveArgs[0]}`, improved.code, improved.stderr), ctx.baseUrl), 1);
  let improve: unknown;
  try {
    improve = JSON.parse(improved.stdout);
  } catch {
    fail("akm improve printed no JSON result", 1);
  }
  type Drained = { promoted?: unknown[]; rejected?: unknown[]; deferred?: unknown[]; failed?: unknown[] };
  const [drained, drain] = await step("drain", () => runAkmJson<Drained>(sandbox, ["proposal", "drain", "--promote", "--strategy", overrides.strategy, "--yes"], { timeoutMs: STEP_TIMEOUT_MS }));
  const listed = [];
  for (const status of STATES) listed.push({ status, ...(await runAkmJson<{ proposals?: unknown[] }>(sandbox, ["proposal", "list", "--status", status, "--detail", "full"], { timeoutMs: STEP_TIMEOUT_MS })) });
  const count = (x: unknown[] | undefined) => (Array.isArray(x) ? x.length : 0);
  return {
    refs: Object.fromEntries(refs),
    before,
    after: readLibrary(bundle),
    improve,
    proposals: parseProposals(listed),
    drain: { promoted: count(drained.promoted), rejected: count(drained.rejected), deferred: count(drained.deferred), failed: count(drained.failed) },
    seconds: { index, feedback, improve: improveSeconds, drain },
  };
}

/**
 * The raw output of each item of a night, in the order of `items`: the item's files (and the lesson file distill writes for its memory) before and after,
 * the proposals and actions on its refs, and the whole night's part (the paths changed outside the items, the model calls, the proactive lane and the
 * proposals that exist), which every row holds. akm names the endpoint in some of its errors, and rows get shared, so no row carries it.
 */
export function rawOfNight(items: Item[], night: Pick<Collected, "before" | "after" | "improve" | "proposals"> & { refs?: Collected["refs"] }, baseUrl: string): Raw[] {
  // Scorers identify cases by their file paths. Preserve the actual indexed refs
  // alongside the raw data and translate only those known planted identities.
  const logical = new Map(Object.entries(night.refs ?? {}).map(([path, ref]) => [ref, refOf(path)]));
  const normalize = (ref: string) => logical.get(conceptId(ref)) ?? conceptId(ref);
  const proposals = night.proposals.map((p) => ({ ...p, ref: normalize(p.ref), retirement: p.retirement ? { ...p.retirement, retired: normalize(p.retirement.retired), successor: normalize(p.retirement.successor) } : null }));
  const calls = callStats(night.improve);
  const lane = proactiveLane(night.improve);
  const whole = { outside: outsideChanges(night.before, night.after, items), calls: { calls: calls.calls, failures: calls.failures }, lane: lane ? { ...lane, refs: lane.refs.map(normalize) } : null, proposals: proposals.map((p) => ({ ref: p.ref, source: p.source, status: p.status })) };
  const actions = actionsOf(night.improve).map((a) => ({ ...a, ref: normalize(a.ref) }));
  return items.map((item) => {
    const paths = new Set(watchedPaths(item));
    const refs = new Set(watchedRefs(item));
    const pick = (library: Map<string, string>) => Object.fromEntries([...paths].filter((p) => library.has(p)).map((p) => [p, library.get(p) as string]));
    const raw: Raw = {
      ...(night.refs ? { indexed_refs: Object.fromEntries(Object.entries(night.refs).filter(([path]) => item.files.includes(path))) } : {}),
      before: pick(night.before),
      after: pick(night.after),
      proposals: proposals.filter((p) => refs.has(p.ref) || (p.retirement !== null && (refs.has(p.retirement.retired) || refs.has(p.retirement.successor)))),
      actions: actions.filter((a) => refs.has(conceptId(a.ref))),
      night: whole,
    };
    return hideEndpoint(JSON.parse(JSON.stringify(raw)) as Raw, baseUrl); // as JSON, which is how a row stores it: what is stored is what is scored
  });
}
