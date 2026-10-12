#!/usr/bin/env bun
// judge-gate: runs akm's reflect quality judge, with the model under test as the judge, on labelled
// proposals. See ../README.md.
//
//   evals/judge-gate/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmBuild, akmVersion, removeSandbox, AKM_OPTIONS, akmUsage, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import { buildManifest, caseDigests, completionOf, corpusFolderOf, lockedParts, type RunManifest } from "../../../lib/manifest.ts";
import { OVERRIDE_OPTIONS, type Overrides, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "../../../lib/akm/overrides.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { type EngineSettings, engineSettings, harnessSha256, redactConfig } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { CASES, casesSha256, privateAssetsProblem, rubricVersion } from "./inputs.ts";
import { CONCURRENCY, NAME, STRATEGY, judgeCase, openSandbox } from "./collect.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Case, type Rate, type Row, atLeast, hasVerdict, hideEndpoints, metrics, parseCases, pct, selectCases, summarize } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
const MIN_AKM = "0.9.25-alpha.2"; // the first release with `akm improve judge`
const GIVE_UP_AFTER = 5; // consecutive cases with no verdict, at any point of the run

const USAGE = `Usage: evals/judge-gate/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Runs akm's reflect quality judge, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as the
judge, on labelled proposals. Settings come from .env at the repository root.

${corpusUsage}
            The default custom corpus is private/judge-gate/assets, made by ./generate-assets: a light rewrite of the same
            cases, not held-out data. It stops when they were made from public cases that have changed since: make them again.
  --limit   run N cases, in the good/bad proportion of the whole set, with at least one of each from 2 cases on
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm 0.9.25-alpha.2 or later on PATH, or in AKM_BIN.`;

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
  /** The improve strategy the config makes the default, and the config patch (path and SHA-256) merged into the config, if any. */
  strategy: string;
  config_patch: { path: string; sha256: string } | null;
  /** `complete` when the run went through its cases, `aborted` when it stopped early (see aborted_reason), and then the numbers cover the n_run cases that ran. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** The cases where akm ran into its time limit and was killed. They are errored too: a slower akm shows here, not as unexplained errors. */
  timeouts: number;
  /** The akm config the eval wrote, with any secret redacted and the endpoint written as <MODEL_BASE_URL>, and the settings of its LLM engine: the model, the endpoint's host, temperature, thinking and the time limit. */
  config: unknown;
  engine: EngineSettings;
  /** The digest of the cases file the run read. It changes when a case or a label does. */
  assets_sha256: string;
  /** The version of the rubric the labels were adjudicated under (assets/README.md). Scores from other versions do not compare. */
  rubric_version: number;
  /** The seed that made a rewritten corpus, null for the public corpus and for your own. */
  seed: string | null;
  metrics: ReturnType<typeof metrics>;
  /** What the run was made of: the parts that decide whether it compares with another run (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

interface Ctx {
  sandbox: Sandbox;
  version: string;
  model: string;
  /** The model endpoint, masked in the rows. */
  baseUrl: string;
  label: string;
  limit?: number;
  overrides?: Overrides;
  /** The time limit of one case. Tests shorten it. */
  timeoutMs?: number;
}

const cell = (r: Rate): string => `${r.passed}/${r.n}  ${pct(r.rate)}`;
const erroredText = (s: Summary): string => `${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`;

function printSummary(s: Summary): void {
  const m = s.metrics;
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(12)} ${text}`);
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | rubric ${s.rubric_version} | ${s.n_run} of ${s.n_cases} cases`);
  line("good passed", cell(m.good));
  line("bad passed", cell(m.bad));
  line("  harmful", cell(m.bad_harmful));
  line("  churn", cell(m.bad_churn));
  line("precision", `${m.precision.passed_good}/${m.precision.passed}  ${pct(m.precision.value)}`);
  line("errored", erroredText(s));
  if (s.status === "aborted") line("status", `aborted: ${s.aborted_reason}`);
  line("results", `${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["good passed", cell(a.metrics.good), cell(b.metrics.good)],
    ["bad passed", cell(a.metrics.bad), cell(b.metrics.bad)],
    ["  harmful", cell(a.metrics.bad_harmful), cell(b.metrics.bad_harmful)],
    ["  churn", cell(a.metrics.bad_churn), cell(b.metrics.bad_churn)],
    ["precision", `${a.metrics.precision.passed_good}/${a.metrics.precision.passed}  ${pct(a.metrics.precision.value)}`, `${b.metrics.precision.passed_good}/${b.metrics.precision.passed}  ${pct(b.metrics.precision.value)}`],
    ["errored", erroredText(a), erroredText(b)],
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
  const assets = corpus.folder;
  const rubric = rubricVersion(join(EVAL_DIR, "assets")); // the private cases are a rewrite of the public ones, so their labels are the public rubric's
  const all = parseCases(readFileSync(join(assets, CASES), "utf8"), join(assets, CASES));
  const cases = selectCases(all, ctx.limit);
  const dir = makeResultsDir(results, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus.name}): ${cases.length} of ${all.length} cases, ${CONCURRENCY} at a time`);

  const rows: Row[] = [];
  let next = 0;
  let consecutiveFailures = 0;
  let aborted: string | undefined;

  const worker = async () => {
    while (next < cases.length && !aborted) {
      const index = next++;
      const c: Case = cases[index];
      const row = await judgeCase(c, ctx);
      rows.push(row);
      appendFileSync(samples, `${JSON.stringify(row)}\n`);
      const note = row.error ?? (hasVerdict(row) ? "" : row.reason);
      console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.label.padEnd(4)} ${row.outcome.padEnd(6)} ${row.seconds}s  ${c.id.slice(0, 8)}${note ? `  ${note.slice(0, 120)}` : ""}`);
      if (hasVerdict(row)) consecutiveFailures = 0;
      else if (++consecutiveFailures >= GIVE_UP_AFTER) aborted ??= note || "no verdict";
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cases.length) }, worker));

  const written = redactConfig(JSON.parse(readFileSync(join(ctx.sandbox.dir, "config", "config.json"), "utf8"))); // the endpoint is whole here, for the engine's host
  const config = hideEndpoints(written);
  const abortedReason = aborted === undefined ? null : `${GIVE_UP_AFTER} cases in a row got no verdict, so the run stopped after ${rows.length} of ${cases.length}. Last: ${aborted}`;
  const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
  const build = akmBuild();
  const seed = corpus.seed;
  const counts = summarize(rows);
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    parts,
    corpus: corpus.name,
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
    config: written,
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
    status: abortedReason === null ? "complete" : "aborted",
    aborted_reason: abortedReason,
    n_cases: all.length,
    ...counts,
    config,
    engine: engineSettings(written),
    assets_sha256: casesSha256(assets),
    rubric_version: rubric,
    seed,
    manifest,
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (abortedReason !== null) fail(`${abortedReason}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and whether the model answers in the JSON akm asks for.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; akm?: string; corpus?: string; cases?: string; yes?: boolean; limit?: string; repeat?: string; strategy?: string; "config-patch"?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...OVERRIDE_OPTIONS, ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`judge-gate: ${(e as Error).message}\n\n${USAGE}`);
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
    const where = corpusFolderOf(c.folder) ?? c.folder; // from the repository root when it is inside, else as it was given
    const problem = c.rewrite ? privateAssetsProblem(c.folder, join(EVAL_DIR, "assets"), where) : existsSync(join(c.folder, CASES)) ? undefined : `the custom corpus is missing (${where}/${CASES})`;
    if (problem) fail(problem);
  }
  const { baseUrl, name: model, hasKey } = settings;
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  await confirmCases(values, [{ role: "model", name: model, baseUrl }]);

  const sandbox = openSandbox(baseUrl, model, hasKey, overrides);
  try {
    const version = await akmVersion(sandbox).catch((e: Error) => fail(e.message));
    if (!atLeast(version, MIN_AKM)) fail(`akm ${version} has no \`improve judge\` command. This eval needs akm ${MIN_AKM} or later.`);

    const summaries: Summary[] = [];
    for (const c of corpora) {
      summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { sandbox, version, model, baseUrl, label: runLabel, limit, overrides }))));
    }
    if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0], summaries[1]);
  } finally {
    removeSandbox(sandbox);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`judge-gate: ${e.message}`);
    process.exit(e.code);
  }
}
