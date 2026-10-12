#!/usr/bin/env bun
// distill: runs akm's distill on the memory of each case, with the model under test as akm's engine, and scores
// the lessons it queues. See ../README.md.
//
//   evals/distill/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmBuild, akmVersion, createSandbox, removeSandbox, AKM_OPTIONS, akmUsage, useAkm } from "../../../lib/akm/akm.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import { Fatal, fail, gitCommit, hideEndpoint, slug } from "../../../lib/cli.ts";
import { buildManifest, caseDigests, completionOf, corpusFolderOf, type RunManifest } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { OVERRIDE_OPTIONS, type Overrides, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "../../../lib/akm/overrides.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { type EngineSettings, engineSettings, harnessSha256, redactConfig } from "../../../lib/provenance.ts";
import { type CaseContext, IMPROVE_TIMEOUT_MS, NAME, STRATEGY, configFor, runCase } from "./collect.ts";
import { assetsSha256, loadCases, selectCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Metrics, type Row, pct, summarize } from "./score.ts";

export { runCase };
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
const GIVE_UP_AFTER = 5; // consecutive cases that errored: the endpoint is down or rate limiting, and more cases would only hit it again

const USAGE = `Usage: evals/distill/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Runs akm's distill on the memory of each case, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME
as akm's engine, and scores the lessons it queues. Settings come from .env at the repository root.

${corpusUsage}
            Your own labelled memories are a custom corpus too: --cases DIR, with the feedback recorded about them in the cases that carry it.
  --limit   run N cases, taken from each class in turn
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm on PATH, or in AKM_BIN.`;

interface Summary {
  eval: string;
  /** `public` or `custom`. */
  corpus: string;
  /** For a custom corpus, its folder from the repository root, or null when it is outside it; null for the public corpus. scripts/rescore reads the cases from here (--cases DIR when it is null). */
  corpus_folder: string | null;
  label: string;
  date: string;
  git_commit: string;
  /** A digest of the eval's source files and of the shared code in lib/ that the run used (see harnessSha256 in lib/provenance.ts). */
  harness_sha256: string;
  model: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  /** A sha256 over the changes to that checkout that are not committed (see dirtyFingerprint in lib/akm/akm.ts), which tells two edits of one commit apart. Null for a clean checkout and for a release. */
  akm_build_fingerprint: string | null;
  /** The model names the endpoint said answered. A gateway may serve one name with another model. */
  served_models: string[];
  limit: number | null;
  /** The strategy akm ran, and the config patch (path and SHA-256) merged into the config, if any. */
  strategy: string;
  config_patch: { path: string; sha256: string } | null;
  /** The akm config the eval wrote, with secrets redacted and the endpoint written as <MODEL_BASE_URL>, and the settings of its engine: temperature, thinking, endpoint host. */
  config: Record<string, unknown>;
  engine: EngineSettings;
  /** One digest over the corpus's cases.json and bundle files, named relative to the corpus folder. */
  assets_sha256: string;
  /** The seed of a rewrite, from its generated.json. Null for the public corpus and for your own notes, which no seed made. */
  seed: string | null;
  /** "aborted" when the run gave up (the endpoint down or rate limiting) and so may have run fewer cases than it selected. Then aborted_reason says why. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** Of the errored cases, how many ended because akm ran past its timeout. */
  timeouts: number;
  metrics: Metrics;
  /** What the run was made of (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

function printSummary(s: Summary): void {
  const m = s.metrics;
  const served = s.served_models.length > 0 && s.served_models.join() !== s.model ? ` (served as ${s.served_models.join(", ")})` : "";
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model}${served} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  good lessons   ${m.good_lessons.good}/${m.good_lessons.n}  ${pct(m.good_lessons.rate)}   of the cases that expect a lesson`);
  console.log(`  wrong lessons  ${m.wrong_lessons.wrong}/${m.wrong_lessons.n}  ${pct(m.wrong_lessons.rate)}   of the cases that expect none`);
  if (m.lesson_updates.n > 0) console.log(`  lesson updates ${m.lesson_updates.right}/${m.lesson_updates.n}  ${pct(m.lesson_updates.rate)}   of the cases that expect an update to a lesson the library holds`);
  const toRead = m.good_lessons.ambiguous + m.lesson_updates.ambiguous;
  if (toRead > 0) console.log(`  to read        ${toRead}  lessons that hold a phrase only behind a negation the rule cannot read (ambiguous in samples.jsonl)`);
  for (const [klass, c] of Object.entries(m.by_class)) console.log(`    ${klass.padEnd(16)} ${c.good !== undefined ? `${c.good}/${c.n} good` : c.right !== undefined ? `${c.right}/${c.n} right` : `${c.wrong}/${c.n} wrong`}`);
  console.log(`  errored        ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`);
  console.log(`  results        ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["good lessons", cell(a.metrics.good_lessons.good, a.metrics.good_lessons.n, a.metrics.good_lessons.rate), cell(b.metrics.good_lessons.good, b.metrics.good_lessons.n, b.metrics.good_lessons.rate)],
    ["wrong lessons", cell(a.metrics.wrong_lessons.wrong, a.metrics.wrong_lessons.n, a.metrics.wrong_lessons.rate), cell(b.metrics.wrong_lessons.wrong, b.metrics.wrong_lessons.n, b.metrics.wrong_lessons.rate)],
    ["lesson updates", cell(a.metrics.lesson_updates.right, a.metrics.lesson_updates.n, a.metrics.lesson_updates.rate), cell(b.metrics.lesson_updates.right, b.metrics.lesson_updates.n, b.metrics.lesson_updates.rate)],
    ["lessons to read", String(a.metrics.good_lessons.ambiguous + a.metrics.lesson_updates.ambiguous), String(b.metrics.good_lessons.ambiguous + b.metrics.lesson_updates.ambiguous)],
    ["errored", String(a.n_errored), String(b.n_errored)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and custom side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

/** Where the results of a corpus go: the eval's results/ for the public cases, and private/distill/ for a custom corpus (your notes in own/, the feedback ones apart). */
export function resultsFolder(c: ResolvedCorpus): string {
  if (c.name === "public") return join(EVAL_DIR, "results");
  const priv = join(ROOT, "private", NAME);
  if (c.folder === join(priv, "assets")) return join(priv, "results");
  if (c.folder === join(priv, "own", "assets-feedback")) return join(priv, "own", "results-feedback");
  return join(priv, "own", "results");
}

interface Ctx extends CaseContext {
  version: string;
  model: string;
  label: string;
  limit?: number;
}

export async function runCorpus(corpus: ResolvedCorpus, ctx: Ctx, results: string = resultsFolder(corpus)): Promise<Summary> {
  const all = loadCases(corpus.folder);
  const cases = selectCases(all, ctx.limit);
  const assetsDigest = assetsSha256(corpus.folder);
  const dir = makeResultsDir(results, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus.name}): ${cases.length} of ${all.length} cases, one at a time`);

  const rows: Row[] = [];
  let consecutiveErrors = 0;
  let aborted: string | undefined;

  for (const c of cases) {
    const row = await runCase(c, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const shown = row.verdict === "error" ? `error  ${row.error?.slice(0, 120)}` : `${row.verdict.padEnd(6)} ${row.outcome}${row.detail ? ` (${row.detail.slice(0, 60)})` : ""}`;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.id.padEnd(10)} ${row.seconds}s  ${shown}`);
    consecutiveErrors = row.verdict === "error" ? consecutiveErrors + 1 : 0;
    if (consecutiveErrors >= GIVE_UP_AFTER) {
      aborted = row.error || "no message";
      break;
    }
  }

  const abortedReason = `${GIVE_UP_AFTER} cases in a row errored, so the run stopped after ${rows.length} of ${cases.length}. Last error: ${aborted}`;
  const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
  const build = akmBuild();
  const seed = corpus.seed; // a rewrite has one, your own notes do not: no seed made them
  const counts = summarize(rows);
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: corpus.name,
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
    config: ctx.config,
    settings: { strategy: overrides.strategy, config_patch_sha256: overrides.configPatch?.sha256 ?? null, timeout_ms: ctx.improveTimeoutMs ?? IMPROVE_TIMEOUT_MS, seed },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows),
  });
  const summary: Summary = {
    eval: NAME,
    corpus: corpus.name,
    corpus_folder: corpus.name === "custom" ? corpusFolderOf(corpus.folder) : null, // the cases of a public run are where the repository has them
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    served_models: counts.served_models,
    limit: ctx.limit ?? null,
    ...overrideSummary(overrides),
    config: hideEndpoint(redactConfig(ctx.config), ctx.baseUrl), // the endpoint is written as <MODEL_BASE_URL>; engine and manifest hold its host and the digest of its identity
    engine: engineSettings(ctx.config),
    assets_sha256: assetsDigest,
    seed,
    status: aborted ? "aborted" : "complete",
    aborted_reason: aborted ? abortedReason : null,
    n_cases: all.length,
    n_run: counts.n_run,
    n_scored: counts.n_scored,
    n_errored: counts.n_errored,
    timeouts: counts.timeouts,
    metrics: counts.metrics,
    manifest,
    results_dir: dir,
  };
  // The summary is written before the run fails, and says it was cut short: a reader of the folder must not take it for a whole run.
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (aborted) fail(`${abortedReason}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and whether the endpoint is rate limiting you.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; akm?: string; corpus?: string; cases?: string; yes?: boolean; limit?: string; repeat?: string; strategy?: string; "config-patch"?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...OVERRIDE_OPTIONS, ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`distill: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  try {
  } catch (e) {
    fail((e as Error).message);
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  const overrides = parseOverrides(values, STRATEGY, fail);
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: join(EVAL_DIR, "assets"), fail });

  for (const c of corpora) {
    if (c.name === "public") continue;
    if (!existsSync(join(c.folder, "cases.json"))) {
      fail(`${c.flag} has no cases.json in ${corpusFolderOf(c.folder) ?? c.folder}.${c.rewrite ? ` Make the rewrite with: ./generate-assets --only ${NAME}` : ""}`);
    }
  }
  useAkm(values, fail);
  const settings = useModel(values, fail);
  const { baseUrl, name: model, hasKey } = settings;
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  await confirmCases(values, [{ role: "model", name: model, baseUrl }]);

  const probe = createSandbox(NAME);
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }
  const config = configFor({ baseUrl, model, hasKey, overrides });
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { config, baseUrl, version, model, label: runLabel, limit, overrides }))));
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0], summaries[1]);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`distill: ${e.message}`);
    process.exit(e.code);
  }
}
