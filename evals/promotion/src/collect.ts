// The collector of the promotion eval: plants the labelled proposals in akm's queue, runs the drain with its judgment tier and the model under
// test as the judge, and builds each proposal's row from what the drain did. It is the COLLECTOR part of the eval's measurement (see
// measurement.ts and lib/manifest.ts): the akm config it writes, the sandbox, the commands it runs and what it records of the answer. The
// scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, createSandbox, engineConfig, runAkm, runAkmJson, semanticConfig, writeConfig } from "../../../lib/akm/akm.ts";
import { fail, failureMessage, hideEndpoint } from "../../../lib/cli.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { type Case, type Raw, type Row, makeRow } from "./score.ts";

export const NAME = "promotion";

/** The name akm gives the sandbox's one bundle, which its refs carry: `bundle//knowledge/<name>`. */
export const BUNDLE = "bundle";
export const STRATEGY = "promotion";

const DRAIN_TIMEOUT_MS = 2 * 60 * 60_000; // one call per proposal, one at a time, on a slow local model
const STEP_TIMEOUT_MS = 30 * 60_000;

/** A UUID made from the case id, so a planted proposal has the id shape akm gives its own, and the same id on every run. */
export function uuidOf(id: string): string {
  const h = createHash("sha1").update(`promotion-eval:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * The akm config of a run: the model under test as the one engine, and a strategy whose triage block is the one the lab runs,
 * judgment on, except that it stages what the judge accepts and does not write it. The drain decides the same either way: the
 * judgment tier only judges, and promotion lint does not block (akm 0.9.26 prints its findings as non-blocking).
 * The bundle is indexed with akm's built-in embedder, as retrieval and skillret do, because a judge that is shown the nearest
 * notes of a promotion's source memory finds them by their stored vectors. The engine runs at temperature 0 with thinking off, as distill's does.
 */
export function promotionConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "judge");
  config.engines.judge.temperature = 0;
  config.engines.judge.enableThinking = false;
  const { semanticSearchMode, embedding } = semanticConfig();
  config.semanticSearchMode = semanticSearchMode;
  config.embedding = embedding;
  config.improve = { strategies: { [STRATEGY]: { engine: "judge", processes: { triage: { enabled: true, applyMode: "queue", judgment: { enabled: true } } } } } };
  return config;
}

/** What a run needs of the model and the strategy to write the akm config. */
export interface ConfigContext {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  overrides?: Overrides;
}

/** The akm config of a run: the promotion config with the strategy and the config patch merged in. */
export const configFor = (ctx: ConfigContext): Record<string, any> => patchedConfig(promotionConfig(ctx.baseUrl, ctx.model, ctx.hasKey), ctx.overrides ?? defaultOverrides(STRATEGY));

/** A sandbox for one run, with the config written. The config names the model key as $MODEL_API_KEY; semantic: the embedder's model is kept in .cache/. */
export function openSandbox(ctx: ConfigContext): Sandbox {
  const sandbox = createSandbox(NAME, { keepModelKey: true, semantic: true });
  writeConfig(sandbox, configFor(ctx));
  return sandbox;
}

/** The memory a case's promotion names as its source, `memories/<name>.md` in the bundle. */
export const memoryOf = (c: Case): string => `memories/${c.ref.split("/").pop()}.md`;

/** The columns of akm's `proposals` table that the eval writes, in the order `proposalRow` gives their values. akm's schema is private: see "Depends on akm's private schema" in the README. */
export const PROPOSAL_COLUMNS = ["id", "stash_dir", "ref", "status", "source", "created_at", "updated_at", "content", "frontmatter_json", "metadata_json"] as const;

/** The columns of akm's `events` table that the eval reads, to count the model calls of a drain. */
export const EVENT_COLUMNS = ["event_type", "metadata_json"] as const;

/** The minimum of a SQLite handle that `schemaProblem` needs, which bun:sqlite's Database has. */
export interface SchemaDb {
  query(sql: string): { all(): unknown[] };
}

/**
 * Why a table of akm's state.db cannot be used the way the eval uses it, or undefined when it has every column in `needed`.
 * The tables are akm's own and its schema is not a contract, so a build that renames a column or moves a table is found here
 * and not by a SQL error, or by a count that is quietly zero.
 */
export function schemaProblem(db: SchemaDb, table: string, needed: readonly string[]): string | undefined {
  const have = (db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (have.length === 0) return `akm's state.db has no ${table} table`;
  const missing = needed.filter((c) => !have.includes(c));
  return missing.length > 0 ? `akm's ${table} table has no column ${missing.join(", ")} (it has ${have.join(", ")})` : undefined;
}

/** The values of one row of akm's `proposals` table, for a pending promotion of consolidate, as akm itself writes it. The order is PROPOSAL_COLUMNS. */
export function proposalRow(c: Case, bundleDir: string, now: string): (string | null)[] {
  const meta = {
    changes: [{ path: `${c.ref}.md`, op: "create" }],
    proposedTarget: { source: BUNDLE, root: bundleDir },
    sourceRun: "promotion-eval",
    confidence: 0.95,
    promotionSource: memoryOf(c).replace(/\.md$/, ""),
  };
  return [uuidOf(c.id), bundleDir, `${BUNDLE}//${c.ref}`, "pending", "consolidate", now, now, c.content, null, JSON.stringify(meta)];
}

/** What `akm proposal drain --format json` printed. A staged id is a proposal the judge accepted. */
export interface Drained {
  staged?: string[];
  promoted?: string[];
  rejected?: string[];
  deferred?: { id: string }[];
  failed?: { id: string; reason?: string; detail?: string }[];
}

/** The line akm warns with on stderr when a judgment call fails. The proposal stays undecided, like a defer. */
const DISPATCH_FAILED = /\[triage\] judgment dispatch failed for (\S+): (.*)/g;

export function dispatchFailures(stderr: string): Map<string, string> {
  return new Map([...stderr.matchAll(DISPATCH_FAILED)].map((m) => [m[1], m[2].trim()]));
}

/** The raw output of each case: what the drain did with its proposal. `reasons` holds the judge's reason for each rejection, accept and defer, by proposal id. */
export function rawFromDrain(cases: Case[], drained: Drained, reasons: Map<string, string>, failures: Map<string, string>): Raw[] {
  const accepted = new Set([...(drained.staged ?? []), ...(drained.promoted ?? [])]);
  const rejected = new Set(drained.rejected ?? []);
  const deferred = new Set((drained.deferred ?? []).map((d) => d.id));
  const failed = new Map((drained.failed ?? []).map((f) => [f.id, f.detail || f.reason || "failed"]));
  return cases.map((c): Raw => {
    const id = uuidOf(c.id);
    const failure = failures.get(id) ?? failed.get(id);
    if (failure !== undefined) return { outcome: "error", reason: "", error: failure };
    if (accepted.has(id)) return { outcome: "accept", reason: reasons.get(id) ?? "" };
    if (rejected.has(id)) return { outcome: "reject", reason: reasons.get(id) ?? "" };
    if (deferred.has(id)) return { outcome: "defer", reason: reasons.get(id) ?? "" };
    return { outcome: "error", reason: "", error: "the drain did not list the proposal" };
  });
}

/**
 * Makes the bundle the proposals are judged against and queues them. The bundle is the library's knowledge/ folder without the
 * notes the cases would write: a proposal creates its note, and the notes already there are what it may duplicate. Each case
 * is queued as a pending promotion of consolidate, in akm's own table, since no command queues a proposal without a model.
 * A promotion names the memory it was made from, and a judge that is shown the nearest notes finds them from that memory's
 * vector, so each case's note is also written as that memory, `memories/<name>`, before the bundle is indexed with embeddings.
 */
export async function plant(sandbox: Sandbox, cases: Case[], libraryDir: string): Promise<void> {
  const bundle = join(sandbox.dir, "bundle");
  cpSync(join(libraryDir, "knowledge"), join(bundle, "knowledge"), { recursive: true });
  for (const c of cases) rmSync(join(bundle, `${c.ref}.md`), { force: true });
  mkdirSync(join(bundle, "memories"), { recursive: true });
  for (const c of cases) writeFileSync(join(bundle, memoryOf(c)), c.content);
  const indexed = await runAkmJson<{ totalEntries?: number; verification?: { embeddingCount?: number; message?: string } }>(sandbox, ["index", "--full"], { timeoutMs: STEP_TIMEOUT_MS }); // makes state.db and indexes the notes
  if (typeof indexed.totalEntries !== "number" || indexed.verification?.embeddingCount !== indexed.totalEntries) fail(`akm embedded ${indexed.verification?.embeddingCount ?? "no"} of ${indexed.totalEntries ?? "an unknown number of"} assets: ${indexed.verification?.message}. Its embedding model may not have downloaded: see .cache/models.`, 1);
  const stash = realpathSync(bundle);
  const now = new Date().toISOString();
  const db = new Database(join(sandbox.env.AKM_DATA_DIR, "state.db"));
  try {
    // akm's tables are its own: a build that lays them out differently is named here, and not found in a SQL error.
    const problem = schemaProblem(db, "proposals", PROPOSAL_COLUMNS);
    if (problem) fail(`${problem}. The eval writes its proposals into that table, so it needs a build of akm that lays it out as akm 0.9.26 does. See "Depends on akm's private schema" in evals/promotion/README.md.`, 1);
    const insert = db.prepare(`INSERT INTO proposals (${PROPOSAL_COLUMNS.join(", ")}) VALUES (${PROPOSAL_COLUMNS.map(() => "?").join(", ")})`);
    for (const c of cases) insert.run(...proposalRow(c, stash, now));
  } finally {
    db.close();
  }
  const queued = await runAkmJson<{ totalCount?: number }>(sandbox, ["proposal", "list", "--status", "pending"], { timeoutMs: STEP_TIMEOUT_MS });
  if (queued.totalCount !== cases.length) fail(`akm lists ${queued.totalCount ?? "no"} pending proposals, and ${cases.length} were queued. This akm may keep its proposals another way.`, 1);
}

/** The model calls of a drain: how many, how many failed, and the model names the endpoint reported. */
export interface Calls {
  n: number;
  failures: number;
  served: Record<string, number>;
}

/**
 * The model calls the drain made, from akm's usage events. Null, with the reason on stderr, when the events cannot be read: the calls are
 * a side measure, and the run goes on without them.
 */
export function callStats(sandbox: Sandbox): Calls | null {
  const none = (reason: string): null => {
    console.error(`promotion: no model call counts in the summary: ${reason}`);
    return null;
  };
  try {
    const db = new Database(join(sandbox.env.AKM_DATA_DIR, "state.db"), { readonly: true });
    try {
      const problem = schemaProblem(db, "events", EVENT_COLUMNS);
      if (problem) return none(problem);
      const rows = db.query("SELECT metadata_json FROM events WHERE event_type = 'llm_usage'").all() as { metadata_json: string }[];
      const served: Record<string, number> = {};
      let failures = 0;
      for (const r of rows) {
        const m = JSON.parse(r.metadata_json) as { outcome?: string; model?: string };
        if (m.outcome !== "success") failures++;
        if (m.model) served[m.model] = (served[m.model] ?? 0) + 1;
      }
      return { n: rows.length, failures, served };
    } finally {
      db.close();
    }
  } catch (e) {
    return none((e as Error).message);
  }
}

/** What the collection needs of the run: the model's endpoint, to keep it out of the rows, and the strategy the drain runs. */
export interface CollectContext {
  baseUrl: string;
  overrides?: Overrides;
}

/**
 * The rows of a run: the proposals are planted, the drain judges them, and each row is built from what the drain did with its proposal.
 * `seconds` is how long that took. A failed drain ends the run with a message.
 */
export async function collect(sandbox: Sandbox, cases: Case[], libraryDir: string, ctx: CollectContext): Promise<{ rows: Row[]; seconds: number }> {
  const t0 = performance.now();
  await plant(sandbox, cases, libraryDir);
  console.log("  planted; the judge reads them one at a time");
  const args = ["proposal", "drain", "--judgment", "--strategy", (ctx.overrides ?? defaultOverrides(STRATEGY)).strategy, "--yes"];
  const drain = await runAkm(sandbox, [...args, "--format", "json"], { timeoutMs: DRAIN_TIMEOUT_MS });
  if (drain.code !== 0) fail(hideEndpoint(failureMessage("akm proposal drain", drain.code, drain.stderr), ctx.baseUrl), 1);
  let drained: Drained;
  try {
    drained = JSON.parse(drain.stdout) as Drained;
  } catch {
    return fail("akm proposal drain printed no JSON result", 1);
  }
  const rejected = await runAkmJson<{ proposals?: { id: string; review?: { reason?: string } }[] }>(sandbox, ["proposal", "list", "--status", "rejected", "--detail", "full"], { timeoutMs: STEP_TIMEOUT_MS });
  const reasons = new Map((rejected.proposals ?? []).map((p) => [p.id, p.review?.reason ?? ""]));
  // An accepted or deferred proposal stays pending, with the judge's reason in its gate decision (and, for a defer, akm's own reason: a reply it could not read, or a failed call).
  const pending = await runAkmJson<{ proposals?: { id: string; gateDecision?: { reason?: string; judgeReason?: string } }[] }>(sandbox, ["proposal", "list", "--status", "pending", "--detail", "full"], { timeoutMs: STEP_TIMEOUT_MS });
  for (const p of pending.proposals ?? []) {
    const why = p.gateDecision?.judgeReason || p.gateDecision?.reason;
    if (why) reasons.set(p.id, why);
  }
  const seconds = Number(((performance.now() - t0) / 1000).toFixed(1));
  // akm names the endpoint in some of its errors, and rows get shared, so no row carries it.
  const raws = rawFromDrain(cases, drained, reasons, dispatchFailures(drain.stderr)).map((raw) => hideEndpoint(raw, ctx.baseUrl));
  return { rows: cases.map((c, i) => makeRow(c, raws[i] as Raw)), seconds };
}
