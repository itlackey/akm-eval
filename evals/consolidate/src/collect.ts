// The collector of the consolidate eval, for the per-case run and for `--pool`: puts the notes in a sandbox, runs akm's consolidate on them
// with the model under test as the engine, and builds each row from what akm returned. It is the COLLECTOR part of the eval's measurement (see
// measurement.ts and lib/manifest.ts): the akm config it writes, the commands it runs, the files it plants and what it records of the answer.
// The scoring is score.ts and pool-score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, engineConfig, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { type Embedder, embedderEnv, noteAges, withEmbedder } from "./sandbox.ts";
import type { Case } from "./cases.ts";
import { type PairPass, type Raw, type RetireProposal, type Row, type UsageRow, makeRow, nameOfRef } from "./score.ts";
import type { Cluster, Pool, PoolRaw, RunRaw } from "./pool-score.ts";

export const NAME = "consolidate";
/** The strategy akm ships for consolidate alone. */
export const STRATEGY = "consolidate";
/** The strategy the pool run gives akm unless --strategy names another. The one place to change it. */
export const POOL_STRATEGY = "consolidate";

const INDEX_TIMEOUT_MS = 2 * 60_000;
const REAL_INDEX_TIMEOUT_MS = 30 * 60_000; // the real embedder loads its model to index, and the first run downloads it (133 MB)
export const IMPROVE_TIMEOUT_MS = 30 * 60_000; // up to three model calls on a slow local model
const RATE_LIMIT_TRIES = 4; // times a case is tried again when the endpoint rate limits it
const RATE_LIMIT_WAIT_MS = 10_000; // the wait before the first new try, doubled before each one after it
export const POOL_DEFAULT_BUDGET_MS = 2 * 60 * 60_000; // akm improve's own wall-clock budget when --timeout-ms is not given
const POOL_KILL_SLACK_MS = 10 * 60_000; // how long past akm's budget the eval waits before it kills akm

/**
 * The akm config consolidate runs under: one LLM engine, the model under test, as the default engine, and semantic search on,
 * because consolidate finds its candidate pairs among the notes' nearest neighbours by embedding. Requests use temperature 0 and
 * ask for no thinking, as distill's and extract's do, so a run does not depend on akm's default sampling.
 */
export function consolidateConfig(baseUrl: string, model: string, hasKey: boolean, embedder: Embedder = "deterministic", provider = "openai"): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "consolidate", provider);
  config.engines.consolidate.temperature = 0;
  config.engines.consolidate.enableThinking = false;
  return withEmbedder(config, embedder);
}

/** What runAkmJson throws, and what a caller writes, when the eval's time limit killed akm: `akm index timed out after 120s`. */
export const timeoutMessage = (command: string, timeoutMs: number): string => `akm ${command} timed out after ${+(timeoutMs / 1000).toFixed(1)}s`;
export const isTimeout = (message: string): boolean => /^akm [\w-]+ timed out after [\d.]+s$/.test(message);

/** What a run needs of its context: how to make a sandbox, the model, its endpoint and provider kind, the strategy and patch, the embedder, and the time limit. */
export type CollectContext = {
  newSandbox: () => Sandbox;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  /** The provider kind of akm's engine. Default: openai. */
  provider?: string;
  /**
   * --timeout-ms, which a run always sets. A pair's `improve` gets all of it, and `index` and `proposal list` have shorter limits of their own that it never
   * lengthens. In the pool run it is akm's own wall-clock budget for the one `improve` (see collectPool). Without it the defaults of this file apply.
   */
  timeoutMs?: number;
  rateLimitWaitMs?: number;
  overrides?: Overrides;
  /** How akm embeds the notes. The sandbox newSandbox makes has to match it: see sandboxOptions. Default: deterministic. */
  embedder?: Embedder;
};

/** The pool run's context. `improveTimeoutMs` is the time after which the eval kills akm, in place of the budget and its slack: for tests. */
export type PoolContext = CollectContext & { overrides: Overrides; improveTimeoutMs?: number };

const embedderOf = (ctx: { embedder?: Embedder }): Embedder => ctx.embedder ?? "deterministic";
/** The real embedder loads its model to index, and the first run downloads it, so it gets longer than the hash one. */
const indexTimeout = (ctx: CollectContext): number => (embedderOf(ctx) === "real" ? REAL_INDEX_TIMEOUT_MS : INDEX_TIMEOUT_MS);
/** `limit`, or --timeout-ms if that is shorter: no command of a pair's run takes longer than the run says. */
const atMost = (limit: number, ctx: CollectContext): number => Math.min(limit, ctx.timeoutMs ?? limit);

/** The akm config a run writes: the eval's own, with the config patch merged into it. summary.json records it. */
export const effectiveConfig = (ctx: Pick<CollectContext, "baseUrl" | "model" | "hasKey" | "provider" | "embedder" | "overrides">): Record<string, any> => patchedConfig(consolidateConfig(ctx.baseUrl, ctx.model, ctx.hasKey, embedderOf(ctx), ctx.provider), ctx.overrides ?? defaultOverrides(STRATEGY));

// --- What akm printed, as raw output -----------------------------------------------------------------------------

/** A raw output as JSON, which is how a row stores it: what is stored is what is scored, so a field akm left out is not there. */
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** The retire proposals of consolidate's pair pass in `akm proposal list --detail full --format json`, with what the scorer reads of each. Its other proposals are promotions. */
export function retireProposals(listing: unknown): RetireProposal[] {
  const all = (listing as { proposals?: unknown })?.proposals;
  if (!Array.isArray(all)) return [];
  return json(
    all
      .filter((p) => p?.source === "consolidate-pair" && typeof p?.retirement?.retiredRef === "string")
      .map((p) => {
        const { retiredRef, successorRef, judgeLabel, judgeReason, onlyInRetired, onlyInSuccessor } = p.retirement;
        return { source: "consolidate-pair" as const, retirement: { retiredRef, successorRef, judgeLabel, judgeReason, onlyInRetired, onlyInSuccessor }, ...(p.gateDecision ? { gateDecision: { outcome: p.gateDecision.outcome } } : {}) };
      }),
  );
}

/** The usage report's rows of a run, with what the scorer reads of each. */
export function usageRows(improve: unknown): UsageRow[] {
  const rows = (improve as { usageReport?: { byProcessEngineModel?: unknown } })?.usageReport?.byProcessEngineModel;
  return Array.isArray(rows) ? json(rows.map((r) => ({ model: r?.model, calls: r?.calls, failures: r?.failures, promptTokens: r?.promptTokens, completionTokens: r?.completionTokens }))) : [];
}

const consolidation = (improve: unknown): Record<string, any> => (improve as { consolidation?: Record<string, any> })?.consolidation ?? {};

/** The raw output of a case from the result of `akm improve` and the proposal list. `hint` is what akm's stderr says about a failure (see failureHint). */
export function rawFromRun(improve: unknown, proposals: unknown, seconds: number, hint = ""): Raw {
  const pass = consolidation(improve).pairPass;
  const pair_pass: PairPass | null = pass && typeof pass === "object" ? json({ pairsConsidered: pass.pairsConsidered, pairsJudged: pass.pairsJudged, failedJudgments: pass.failedJudgments, labelCounts: pass.labelCounts }) : null;
  return { pair_pass, retire_proposals: retireProposals(proposals), usage: usageRows(improve), ...(hint ? { hint } : {}), seconds };
}

/** The first line akm printed that looks like a failure, to say why its judge gave no verdict. */
export function failureHint(stderr: string): string {
  const line = stderr.split("\n").find((l) => /^[A-Za-z]/.test(l) && /error|fail|refus|unauthori|unable|invalid|timed out|not found|rate.?limit/i.test(l));
  return line ? ` (akm said: ${line.trim().slice(0, 150)})` : "";
}

// --- One case ----------------------------------------------------------------------------------------------------

/** Puts the case's two notes in the sandbox's bundle as memories, with the file times akm reads as their dates. */
export function writeNotes(sandbox: Sandbox, c: Case): void {
  const dir = join(sandbox.dir, "bundle", "memories");
  mkdirSync(dir, { recursive: true });
  const ages = noteAges(c.older);
  const now = Date.now();
  for (const side of ["a", "b"] as const) {
    const file = join(dir, `${c[side].name}.md`);
    writeFileSync(file, c[side].text);
    const when = new Date(now - ages[side] * 86_400_000);
    utimesSync(file, when, when);
  }
}

/** akm says so when the endpoint turns a call away for sending too many. */
const isRateLimited = (text: string): boolean => /rate.?limit|\(429\)/i.test(text);

/** One try at a case: a fresh sandbox with the pair as its bundle, indexed, consolidate run on it, and the proposals read back. `rateLimited` is true when the endpoint turned the call away. */
async function tryCase(c: Case, ctx: CollectContext): Promise<{ raw: Raw; rateLimited: boolean }> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const sandbox = ctx.newSandbox();
  try {
    const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
    const improveTimeoutMs = ctx.timeoutMs ?? IMPROVE_TIMEOUT_MS;
    writeConfig(sandbox, effectiveConfig(ctx));
    Object.assign(sandbox.env, embedderEnv(embedderOf(ctx)));
    writeNotes(sandbox, c);
    await runAkmJson(sandbox, ["index", "--full"], { timeoutMs: atMost(indexTimeout(ctx), ctx) });
    const improve = await runAkm(sandbox, ["improve", "--strategy", overrides.strategy, "--no-sync", "--json-to-stdout", "--format", "json"], { timeoutMs: improveTimeoutMs });
    if (improve.timedOut) throw new Error(timeoutMessage("improve", improveTimeoutMs));
    if (improve.code !== 0) throw new Error(`akm improve failed (exit ${improve.code}): ${improve.stderr.trim().slice(-300)}`);
    const proposals = await runAkmJson(sandbox, ["proposal", "list", "--detail", "full"], { timeoutMs: atMost(INDEX_TIMEOUT_MS, ctx) });
    const raw = rawFromRun(JSON.parse(improve.stdout), proposals, seconds(), hideEndpoint(failureHint(improve.stderr), ctx.baseUrl));
    return { raw, rateLimited: makeRow(c, raw).outcome === "error" && isRateLimited(improve.stderr) };
  } catch (e) {
    const message = (e as Error).message.slice(0, 300);
    return { raw: { error: hideEndpoint(message, ctx.baseUrl), timedOut: isTimeout(message), seconds: seconds() }, rateLimited: isRateLimited(message) };
  } finally {
    removeSandbox(sandbox);
  }
}

/** A case, tried again after a wait when the endpoint rate limits it, up to RATE_LIMIT_TRIES times. A case that is still turned away is an errored row that says how many tries it took. */
export async function runCase(c: Case, ctx: CollectContext): Promise<Row> {
  for (let tries = 0; ; tries++) {
    const { raw, rateLimited } = await tryCase(c, ctx);
    if (!rateLimited || tries === RATE_LIMIT_TRIES) return makeRow(c, tries > 0 ? { ...raw, retried: tries } : raw);
    const wait = (ctx.rateLimitWaitMs ?? RATE_LIMIT_WAIT_MS) * 2 ** tries;
    console.log(`  ${c.id}: the endpoint rate limited it, so it will be tried again in ${wait / 1000}s`);
    await Bun.sleep(wait);
  }
}

// --- The pool ----------------------------------------------------------------------------------------------------

/** Puts every note in the sandbox's bundle as a memory, with the file time akm reads as its date. */
export function writePoolNotes(sandbox: Sandbox, pool: Pick<Pool, "texts" | "ages">, now = Date.now()): void {
  const dir = join(sandbox.dir, "bundle", "memories");
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(pool.texts)) {
    const file = join(dir, `${name}.md`);
    writeFileSync(file, text);
    const when = new Date(now - (pool.ages[name] ?? 2) * 86_400_000);
    utimesSync(file, when, when);
  }
}

/** The arguments of the one akm run. `--timeout-ms` is akm's wall-clock budget for the run; leave it out for akm's own, which is POOL_DEFAULT_BUDGET_MS. */
export function poolImproveArgs(strategy: string, timeoutMs?: number): string[] {
  return ["improve", "--strategy", strategy, "--no-sync", "--json-to-stdout", "--format", "json", ...(timeoutMs ? ["--timeout-ms", String(timeoutMs)] : [])];
}

/** The raw output of the whole run from the result of `akm improve` and the proposal list, and each retire proposal by the cluster that holds the note it retires. */
export function rawFromPoolRun(pool: { clusters: Pick<Cluster, "id" | "notes">[] }, improve: unknown, proposals: unknown, seconds: number): { run: RunRaw; byCluster: Map<string, RetireProposal[]> } {
  const c = consolidation(improve);
  const pass = c.pairPass;
  const byCluster = new Map<string, RetireProposal[]>(pool.clusters.map((cl) => [cl.id, []]));
  const outside: string[] = [];
  for (const p of retireProposals(proposals)) {
    const name = nameOfRef(p.retirement.retiredRef);
    const cluster = pool.clusters.find((cl) => cl.notes.includes(name));
    if (cluster) byCluster.get(cluster.id)?.push(p);
    else outside.push(p.retirement.retiredRef);
  }
  const run: RunRaw = json({
    pair_pass: pass && typeof pass === "object" ? { initiators: pass.initiators, pairsConsidered: pass.pairsConsidered, pairsJudged: pass.pairsJudged, failedJudgments: pass.failedJudgments, labelCounts: pass.labelCounts } : null,
    usage: usageRows(improve),
    chunks: { totalChunks: c.totalChunks, failedChunks: c.failedChunks, deferredMemories: c.deferredMemories, planned: Array.isArray(c.planned) ? c.planned.length : 0 },
    warnings: Array.isArray(c.warnings) ? c.warnings.filter((w: unknown): w is string => typeof w === "string") : [],
    outside,
    seconds,
  });
  return { run, byCluster };
}

/** What the pool run collected: the raw output of each cluster, and akm's result as it printed it (null when akm printed none). */
export interface PoolCollected {
  raw: Map<string, PoolRaw>;
  improve: unknown;
}

/**
 * One sandbox with every note of the pool as a memory, indexed, and one `akm improve` with the strategy (consolidate unless --strategy says
 * another); the proposals are read back. Not tried again on a rate limit: the run is one long call sequence, and the calls the endpoint
 * turned away show in the usage report. A run that fails (a failed command, a timeout) gives every cluster the same error.
 *
 * `ctx.timeoutMs` is akm's wall-clock budget for the improve run, and the eval kills akm POOL_KILL_SLACK_MS after it. A run with the default budget
 * leaves `--timeout-ms` out of akm's arguments, as it always did: the default is akm's own.
 */
export async function collectPool(pool: Pool, ctx: PoolContext): Promise<PoolCollected> {
  const sandbox = ctx.newSandbox();
  let improveJson: unknown = null;
  let seconds = 0;
  try {
    const budget = ctx.timeoutMs ?? POOL_DEFAULT_BUDGET_MS;
    const improveTimeoutMs = ctx.improveTimeoutMs ?? budget + POOL_KILL_SLACK_MS;
    writeConfig(sandbox, effectiveConfig(ctx));
    Object.assign(sandbox.env, embedderEnv(embedderOf(ctx)));
    writePoolNotes(sandbox, pool);
    await runAkmJson(sandbox, ["index", "--full"], { timeoutMs: indexTimeout(ctx) });
    const improve = await runAkm(sandbox, poolImproveArgs(ctx.overrides.strategy, budget === POOL_DEFAULT_BUDGET_MS ? undefined : budget), { timeoutMs: improveTimeoutMs });
    seconds = Number((improve.ms / 1000).toFixed(1));
    if (improve.timedOut) throw new Error(timeoutMessage("improve", improveTimeoutMs));
    if (improve.code !== 0) throw new Error(`akm improve failed (exit ${improve.code}): ${improve.stderr.trim().slice(-300)}`);
    improveJson = JSON.parse(improve.stdout);
    const proposals = await runAkmJson(sandbox, ["proposal", "list", "--detail", "full"], { timeoutMs: INDEX_TIMEOUT_MS });
    const { run, byCluster } = rawFromPoolRun(pool, improveJson, proposals, seconds);
    return { raw: new Map(pool.clusters.map((cl) => [cl.id, { run, retire_proposals: byCluster.get(cl.id) ?? [] }])), improve: improveJson };
  } catch (e) {
    const message = (e as Error).message;
    const error: PoolRaw = { error: hideEndpoint(message.slice(0, 300), ctx.baseUrl), timedOut: isTimeout(message), seconds };
    return { raw: new Map(pool.clusters.map((cl) => [cl.id, error])), improve: improveJson };
  } finally {
    removeSandbox(sandbox);
  }
}
