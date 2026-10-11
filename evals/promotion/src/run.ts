#!/usr/bin/env bun
// promotion: plants labelled promotion proposals in akm's queue, runs akm's drain with its judgment tier, with the model
// under test as the judge, and counts which proposals it accepts. See ../README.md.
//
//   evals/promotion/run [--corpus public|own|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { Database } from "bun:sqlite";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmBuild, akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson, writeConfig, AKM_OPTIONS, akmUsage, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, failureMessage, gitCommit, hideEndpoint, slug } from "../../../lib/cli.ts";
import { MODEL_OPTIONS, modelUsage, privateModelError, useModel } from "../../../lib/models.ts";
import { OVERRIDE_OPTIONS, type Overrides, defaultOverrides, overrideSummary, overridesUsage, parseOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { type EngineSettings, engineSettings, redactConfig } from "../../../lib/provenance.ts";
import { BAD, type Case, type Drained, EVENT_COLUMNS, type Metrics, PROPOSAL_COLUMNS, type Row, STRATEGY, assetsSha256, corpusSeed, dispatchFailures, metrics, parseCases, pct, promotionConfig, memoryOf, proposalRow, rowsFromDrain, schemaProblem, selectCases } from "./lib.ts";

const NAME = "promotion";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const DRAIN_TIMEOUT_MS = 2 * 60 * 60_000; // one call per proposal, one at a time, on a slow local model
const STEP_TIMEOUT_MS = 30 * 60_000;

const USAGE = `Usage: evals/promotion/run [--corpus public|own|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Plants labelled promotion proposals in akm's queue, runs \`akm proposal drain --judgment\` with the model in MODEL_BASE_URL,
MODEL_API_KEY and MODEL_NAME as the judge, and counts which proposals it accepts. Settings come from .env at the repository root.

  --corpus  public (default) reads assets/ (cases.jsonl and library/). own reads private/promotion/own/, and runs only against a
            model marked "private": true in models.json. all runs both and prints the two results side by side.
  --cases   DIR: run the own corpus from DIR (cases.jsonl and library/, the format of private/promotion/own/) in place of
            private/promotion/own/. Like own, it runs only against a model marked "private": true in models.json. A relative
            DIR is from the repository root. Results go where own results go.
  --limit   run N proposals, one of each category in turn
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm on PATH, or in AKM_BIN.`;

type Corpus = "public" | "own";

interface Folders {
  cases: string; // cases.jsonl
  library: string; // a folder with knowledge/ in it: the notes already in the bundle
  results: string;
  seed?: string; // private/seed, unless a test names another
}

/** The folders of a corpus. `casesDir` is the own corpus somewhere else than private/promotion/own/. */
export const foldersFor = (corpus: Corpus, casesDir = join(ROOT, "private", NAME, "own")): Folders =>
  corpus === "public"
    ? { cases: join(EVAL_DIR, "assets", "cases.jsonl"), library: join(EVAL_DIR, "assets", "library"), results: join(EVAL_DIR, "results") }
    : { cases: join(casesDir, "cases.jsonl"), library: join(casesDir, "library"), results: join(ROOT, "private", NAME, "results") };

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  git_commit: string;
  model: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  limit: number | null;
  /** The strategy akm ran, and the config patch (path and SHA-256) merged into the config, if any. */
  strategy: string;
  config_patch: { path: string; sha256: string } | null;
  /** The akm config the eval wrote, with secrets redacted, and the settings of its engine: temperature, thinking, endpoint host. */
  config: Record<string, unknown>;
  engine: EngineSettings;
  /** One digest over the cases file and the library's knowledge/ files, named relative to their folders. */
  assets_sha256: string;
  /** private/seed for the own corpus when there is one. Null for the public corpus and when there is none. */
  seed: string | null;
  /** "aborted" when no proposal got a verdict, so the numbers say nothing. Then aborted_reason says why. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  n_cases: number;
  n_run: number;
  n_errored: number;
  /** Of the errored proposals, how many failed because the model call timed out, by the text akm gave. */
  timeouts: number;
  seconds: number;
  calls: { n: number; failures: number; served: Record<string, number> } | null;
  metrics: Metrics;
  results_dir: string;
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

/**
 * The model calls the drain made, from akm's usage events: how many, how many failed, and the model names the endpoint reported.
 * Null, with the reason on stderr, when the events cannot be read: the calls are a side measure, and the run goes on without them.
 */
export function callStats(sandbox: Sandbox): Summary["calls"] {
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

function printSummary(s: Summary): void {
  const m = s.metrics;
  const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} proposals, ${(s.seconds / 60).toFixed(1)} min`);
  console.log(`  good in the set   ${cell(m.proposals.good, m.proposals.n, m.proposals.share_good)}`);
  console.log(`  accepted          ${m.accepted.n}: ${m.accepted.good} good, ${m.accepted.n - m.accepted.good} bad`);
  console.log(`  recall            ${cell(m.recall.accepted, m.recall.of, m.recall.value)}   good proposals accepted`);
  console.log(`  precision         ${cell(m.precision.good, m.precision.of, m.precision.value)}   accepted proposals that are good`);
  console.log(`  bad accepted      ${cell(m.bad_accepted.accepted, m.bad_accepted.of, m.bad_accepted.value)}`);
  for (const c of BAD) console.log(`    ${c.padEnd(10)}      ${cell(m.by_category[c].accepted, m.by_category[c].n, m.by_category[c].rate)}`);
  console.log(`  errored           ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}${s.calls ? `   (${s.calls.n} model calls, ${s.calls.failures} failed)` : ""}`);
  console.log(`  results           ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
  const one = (s: Summary) => [
    cell(s.metrics.proposals.good, s.metrics.proposals.n, s.metrics.proposals.share_good),
    cell(s.metrics.recall.accepted, s.metrics.recall.of, s.metrics.recall.value),
    cell(s.metrics.precision.good, s.metrics.precision.of, s.metrics.precision.value),
    cell(s.metrics.bad_accepted.accepted, s.metrics.bad_accepted.of, s.metrics.bad_accepted.value),
    ...BAD.map((c) => cell(s.metrics.by_category[c].accepted, s.metrics.by_category[c].n, s.metrics.by_category[c].rate)),
    String(s.n_errored),
  ];
  const labels = ["", "good in the set", "recall", "precision", "bad accepted", ...BAD.map((c) => `  ${c}`), "errored"];
  const [x, y] = [[a.corpus, ...one(a)], [b.corpus, ...one(b)]];
  const w = [Math.max(...labels.map((l) => l.length)), Math.max(...x.map((v) => v.length)), Math.max(...y.map((v) => v.length))];
  console.log(`\n${NAME}: public and own side by side (not pooled)`);
  labels.forEach((l, i) => console.log(`  ${l.padEnd(w[0])}  ${x[i].padEnd(w[1])}  ${y[i].padEnd(w[2])}`));
}

export async function runCorpus(
  corpus: Corpus,
  ctx: { sandbox: Sandbox; version: string; model: string; baseUrl: string; label: string; limit?: number; overrides?: Overrides },
  folders: Folders = foldersFor(corpus),
): Promise<Summary> {
  const all = parseCases(readFileSync(folders.cases, "utf8"), folders.cases);
  const cases = selectCases(all, ctx.limit);
  const assetsDigest = assetsSha256(folders.cases, folders.library);
  const dir = makeResultsDir(folders.results, ctx.label);
  console.log(`${NAME} (${corpus}): ${cases.length} of ${all.length} proposals`);

  const t0 = performance.now();
  await plant(ctx.sandbox, cases, folders.library);
  console.log("  planted; the judge reads them one at a time");
  const args = ["proposal", "drain", "--judgment", "--strategy", (ctx.overrides ?? defaultOverrides(STRATEGY)).strategy, "--yes"];
  const drain = await runAkm(ctx.sandbox, [...args, "--format", "json"], { timeoutMs: DRAIN_TIMEOUT_MS });
  if (drain.code !== 0) fail(hideEndpoint(failureMessage("akm proposal drain", drain.code, drain.stderr), ctx.baseUrl), 1);
  let drained: Drained;
  try {
    drained = JSON.parse(drain.stdout) as Drained;
  } catch {
    return fail("akm proposal drain printed no JSON result", 1);
  }
  const rejected = await runAkmJson<{ proposals?: { id: string; review?: { reason?: string } }[] }>(ctx.sandbox, ["proposal", "list", "--status", "rejected", "--detail", "full"], { timeoutMs: STEP_TIMEOUT_MS });
  const reasons = new Map((rejected.proposals ?? []).map((p) => [p.id, p.review?.reason ?? ""]));
  // An accepted or deferred proposal stays pending, with the judge's reason in its gate decision (and, for a defer, akm's own reason: a reply it could not read, or a failed call).
  const pending = await runAkmJson<{ proposals?: { id: string; gateDecision?: { reason?: string; judgeReason?: string } }[] }>(ctx.sandbox, ["proposal", "list", "--status", "pending", "--detail", "full"], { timeoutMs: STEP_TIMEOUT_MS });
  for (const p of pending.proposals ?? []) {
    const why = p.gateDecision?.judgeReason || p.gateDecision?.reason;
    if (why) reasons.set(p.id, why);
  }
  const seconds = Number(((performance.now() - t0) / 1000).toFixed(1));

  // akm names the endpoint in some of its errors, and rows get shared, so no row carries it.
  const rows = JSON.parse(hideEndpoint(JSON.stringify(rowsFromDrain(cases, drained, reasons, dispatchFailures(drain.stderr))), ctx.baseUrl)) as Row[];
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  const errored = rows.filter((r) => r.outcome === "error").length;
  const aborted = errored === rows.length ? `no proposal got a verdict. First error: ${rows[0]?.error}` : undefined;
  const config = JSON.parse(readFileSync(join(ctx.sandbox.dir, "config", "config.json"), "utf8")) as Record<string, unknown>; // what akm was given: the patch is in it
  const summary: Summary = {
    eval: NAME,
    corpus,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    model: ctx.model,
    akm_version: ctx.version,
    ...akmBuild(),
    limit: ctx.limit ?? null,
    ...overrideSummary(ctx.overrides ?? defaultOverrides(STRATEGY)),
    config: redactConfig(config),
    engine: engineSettings(config),
    assets_sha256: assetsDigest,
    seed: corpusSeed(corpus, folders.seed ?? join(ROOT, "private", "seed")),
    status: aborted ? "aborted" : "complete",
    aborted_reason: aborted ?? null,
    n_cases: all.length,
    n_run: rows.length,
    n_errored: errored,
    timeouts: rows.filter((r) => r.timed_out).length,
    seconds,
    calls: callStats(ctx.sandbox),
    metrics: metrics(rows),
    results_dir: dir,
  };
  // The summary is written before the run fails, and says so: a reader of the folder must not take it for a whole run.
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (aborted) fail(`${aborted}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; akm?: string; corpus?: string; cases?: string; limit?: string; repeat?: string; strategy?: string; "config-patch"?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, cases: { type: "string" }, limit: { type: "string" }, repeat: { type: "string" }, ...OVERRIDE_OPTIONS, ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`promotion: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (values.cases !== undefined && values.corpus !== undefined && values.corpus !== "own") fail("--cases is an own corpus: use it alone or with --corpus own");
  const casesDir = values.cases === undefined ? undefined : resolve(values.cases);
  const corpus = values.corpus ?? (casesDir ? "own" : "public");
  if (corpus !== "public" && corpus !== "own" && corpus !== "all") fail(`--corpus must be public, own or all, not "${corpus}"`);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  const overrides = parseOverrides(values, STRATEGY, fail);
  const corpora: Corpus[] = corpus === "all" ? ["public", "own"] : [corpus];

  useAkm(values, fail);
  const settings = useModel(values, fail);
  const { baseUrl, name: model, hasKey } = settings;
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  if (corpora.includes("own")) {
    const f = foldersFor("own", casesDir);
    if (!existsSync(f.cases) || !existsSync(join(f.library, "knowledge"))) fail(`the own set is missing (${relative(ROOT, f.cases)} and ${relative(ROOT, f.library)}/knowledge/). See "Run your own set" in evals/promotion/README.md.`);
    const refusal = privateModelError(settings, casesDir ? "--cases" : "--corpus own", "notes");
    if (refusal) fail(refusal);
  }

  const summaries: Summary[] = [];
  for (const c of corpora) {
    const runs = await repeatRuns(repeat, label, async (runLabel) => {
      const sandbox = createSandbox(NAME, { keepModelKey: true, semantic: true }); // the config names the model key as $MODEL_API_KEY; semantic: the embedder's model is kept in .cache/
      try {
        writeConfig(sandbox, patchedConfig(promotionConfig(baseUrl, model, hasKey), overrides));
        const version = await akmVersion(sandbox).catch((e: Error) => fail(e.message));
        return await runCorpus(c, { sandbox, version, model, baseUrl, label: runLabel, limit, overrides }, foldersFor(c, casesDir));
      } catch (e) {
        if (e instanceof Fatal) throw e;
        return fail(hideEndpoint((e as Error).message, baseUrl), 1); // a failed akm command: its message, not a stack
      } finally {
        removeSandbox(sandbox);
      }
    });
    summaries.push(...runs);
  }
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0], summaries[1]);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`promotion: ${e.message}`);
    process.exit(e.code);
  }
}
