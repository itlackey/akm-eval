#!/usr/bin/env bun
// extract: runs akm's extract on each session, with the model under test as akm's engine, and scores the memories it
// saves. See ../README.md.
//
//   evals/extract/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmBuild, akmVersion, createSandbox, removeSandbox, AKM_OPTIONS, akmUsage, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit, hideEndpoint, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import { buildManifest, caseDigests, completionOf, corpusFolderOf, lockedParts, type RunManifest } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { OVERRIDE_OPTIONS, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "../../../lib/akm/overrides.ts";
import { engineSettings, harnessSha256, redactConfig, type EngineSettings } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { type CaseContext, NAME, STRATEGY, configFor, runCase } from "./collect.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Metrics, type Row, assetsDigest, atLeast, generatedProblem, loadCases, pct, selectCases, summarize } from "./lib.ts";

export { runCase };
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
export const MIN_AKM = "0.9.26"; // the release this eval was built on: its `proposal extract` flags, its result and its queue are the ones the README describes
const GIVE_UP_AFTER = 5; // consecutive cases that errored: the endpoint is down or rate limiting, and more cases would only hit it again

const USAGE = `Usage: evals/extract/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Runs akm's extract on each session, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as
akm's engine, and scores the memories it saves. Settings come from .env at the repository root.

${corpusUsage}
            The default custom corpus is private/extract/assets, made by ./generate-assets.
  --limit   run N sessions, taken from each class in turn
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm ${MIN_AKM} or later on PATH, or in AKM_BIN.`;

interface Summary {
  eval: string;
  /** `public` or `custom` (see lib/corpus.ts). */
  corpus: string;
  /** The folder of a custom corpus from the repository root, null when it is outside it and for the public corpus (see corpusFolderOf in lib/manifest.ts): what `scripts/rescore` reads the cases from. */
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
  limit: number | null;
  /** The strategy akm ran, and the config patch (path and SHA-256) merged into the config, if any. */
  strategy: string;
  config_patch: { path: string; sha256: string } | null;
  /** The akm config the eval wrote for every session, as the sandbox's config file has it, with any secret redacted and the model's endpoint written as <MODEL_BASE_URL> (its host is in `engine`). */
  config: unknown;
  /** The settings of the model under test in that config: temperature, thinking switch, time limit, and the host of its endpoint. */
  engine: EngineSettings;
  /** One sha256 over cases.json and the session files of the corpus, named by their place in assets/. It covers every case, whatever --limit picked. */
  assets_sha256: string;
  /** The seed that made a rewritten corpus, null for the public corpus and for your own. */
  seed: string | null;
  /** "aborted" when the run gave up (the endpoint down or rate limiting) and so may have run fewer sessions than it selected. Then aborted_reason says why. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** Of the errored sessions, those where akm did not answer within the time limit. */
  timeouts: number;
  metrics: Metrics;
  /** What the run was made of: the parts that decide whether it compares with another run (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

interface Ctx extends CaseContext {
  version: string;
  label: string;
  limit?: number;
}

const cell = (c: { n: number; correct: number; rate: number | null }): string => `${c.correct}/${c.n}  ${pct(c.rate)}`;

function printSummary(s: Summary): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} sessions`);
  console.log(`  insights  ${cell(m.insights)}   of the sessions that hold an insight or a preference: a memory that states every fact`);
  console.log(`  routine   ${cell(m.routine)}   of the routine sessions: left empty`);
  console.log(`  planted   ${cell(m.planted)}   of the sessions with a planted instruction: ${m.planted.saved_instruction} saved it${m.planted.ambiguous > 0 ? `, ${m.planted.ambiguous} to read (a negation over a verb the rule does not list)` : ""}`);
  for (const [klass, c] of Object.entries(m.classes)) {
    const failed = Object.entries(c.failed).filter(([, n]) => n > 0).map(([name, n]) => `${name} ${n}`).join(", ");
    console.log(`    ${klass.padEnd(11)} ${`${c.correct}/${c.n}`.padEnd(5)} saved ${c.outcomes.saved}, empty ${c.outcomes.empty}, unusable ${c.outcomes.unusable}; ${c.memories} memories${failed ? `; failed: ${failed}` : ""}`);
  }
  console.log(`  errored   ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`);
  console.log(`  results   ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["insights", cell(a.metrics.insights), cell(b.metrics.insights)],
    ["routine", cell(a.metrics.routine), cell(b.metrics.routine)],
    ["planted", cell(a.metrics.planted), cell(b.metrics.planted)],
    ["planted instruction saved", String(a.metrics.planted.saved_instruction), String(b.metrics.planted.saved_instruction)],
    ["planted instruction to read", String(a.metrics.planted.ambiguous), String(b.metrics.planted.ambiguous)],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ["timed out", String(a.timeouts), String(b.timeouts)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: ${a.corpus} and ${b.corpus} side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

export async function runCorpus(
  corpus: ResolvedCorpus,
  ctx: Ctx,
  results = corpus.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"),
): Promise<Summary> {
  const parts = lockedParts(MEASUREMENT); // stops the run, before it collects anything, when MEASUREMENT.lock has no entry for the eval
  const all = loadCases(corpus.folder);
  const cases = selectCases(all, ctx.limit);
  const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
  const config = configFor(ctx); // the config every session runs with
  const assetsSha256 = assetsDigest(corpus.folder, all); // before the calls, since it says what the run read
  const dir = makeResultsDir(results, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus.name}): ${cases.length} of ${all.length} sessions, one at a time`);

  const rows: Row[] = [];
  let consecutiveErrors = 0;
  let aborted: string | undefined;

  for (const c of cases) {
    const row = await runCase(c, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const checks = [row.missing.length > 0 && `missing ${row.missing.join(", ")}`, row.forbidden.length > 0 && `asserts ${row.forbidden.join(", ")}`, row.ambiguous.length > 0 && `read ${row.ambiguous.join(", ")}`].filter(Boolean).join("; ");
    const shown = row.outcome === "error" ? `error  ${row.error?.slice(0, 120)}` : `${row.correct ? "ok  " : "FAIL"}   ${row.outcome}${row.saved.length > 0 ? ` ${row.saved.length}` : ""}${checks ? ` (${checks.slice(0, 80)})` : ""}`;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.id.padEnd(13)} ${row.seconds}s  ${shown}`);
    consecutiveErrors = row.outcome === "error" ? consecutiveErrors + 1 : 0;
    if (consecutiveErrors >= GIVE_UP_AFTER) {
      aborted = row.error || "no message";
      break;
    }
  }

  const abortedReason = `${GIVE_UP_AFTER} sessions in a row errored, so the run stopped after ${rows.length} of ${cases.length}. Last error: ${aborted}`;
  const build = akmBuild();
  const seed = corpus.seed;
  const counts = summarize(rows);
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    parts,
    corpus: corpus.name,
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
    config,
    settings: { strategy: overrides.strategy, config_patch_sha256: overrides.configPatch?.sha256 ?? null, timeout_ms: ctx.timeoutMs ?? null, seed },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows),
  });
  const summary: Summary = {
    eval: NAME,
    corpus: corpus.name,
    corpus_folder: corpus.name === "public" ? null : corpusFolderOf(corpus.folder),
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    limit: ctx.limit ?? null,
    ...overrideSummary(overrides),
    config: redactConfig(hideEndpoint(config, ctx.baseUrl)),
    engine: engineSettings(config),
    assets_sha256: assetsSha256,
    seed,
    status: aborted ? "aborted" : "complete",
    aborted_reason: aborted ? abortedReason : null,
    n_cases: all.length,
    ...counts,
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
    console.error(`extract: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  try {
    lockedParts(MEASUREMENT); // MEASUREMENT.lock must have an entry for this eval: every run records the versions it was made with
  } catch (e) {
    fail((e as Error).message);
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  const overrides = parseOverrides(values, STRATEGY, fail);
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: join(EVAL_DIR, "assets"), fail });
  useAkm(values, fail);
  const settings = useModel(values, fail);

  for (const c of corpora) {
    if (c.name === "public") continue;
    if (!existsSync(join(c.folder, "cases.json"))) fail(`the custom corpus is missing (${corpusFolderOf(c.folder) ?? c.folder}/cases.json). A rewrite of the public cases is made with: ./generate-assets --only ${NAME}`);
    const stale = c.rewrite ? generatedProblem(dirname(c.folder), join(EVAL_DIR, "assets")) : undefined;
    if (stale) fail(`the private assets cannot be used: ${stale}. Make them again with: ./generate-assets --only ${NAME}`);
  }
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
  if (!atLeast(version, MIN_AKM)) fail(`akm ${version} is older than this eval is written for. It needs akm ${MIN_AKM} or later.`);
  const ctx: Ctx = { baseUrl, model, hasKey, version, label, limit, overrides };
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { ...ctx, label: runLabel }))));
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0], summaries[1]);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`extract: ${e.message}`);
    process.exit(e.code);
  }
}
