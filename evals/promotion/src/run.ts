#!/usr/bin/env bun
// promotion: plants labelled promotion proposals in akm's queue, runs akm's drain with its judgment tier, with the model
// under test as the judge, and counts which proposals it accepts. See ../README.md.
//
//   evals/promotion/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmBuild, akmVersion, removeSandbox, AKM_OPTIONS, akmUsage, useAkm } from "../../../lib/akm/akm.ts";
import { type ModelCalls, takeModelCalls, tallyCalls } from "../../../lib/akm/usage.ts";
import { Fatal, fail, gitCommit, hideEndpoint, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import { buildManifest, caseDigests, completionOf, corpusFolderOf, type RunManifest } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { OVERRIDE_OPTIONS, type Overrides, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "../../../lib/akm/overrides.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { type EngineSettings, engineSettings, harnessSha256, redactConfig } from "../../../lib/provenance.ts";
import { type Calls, NAME, STRATEGY, callStats, collect, openSandbox } from "./collect.ts";
import { assetsSha256, bundleSha256, parseCases, selectCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { BAD, type Metrics, pct, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);

const USAGE = `Usage: evals/promotion/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Plants labelled promotion proposals in akm's queue, runs \`akm proposal drain --judgment\` with the model in MODEL_BASE_URL,
MODEL_API_KEY and MODEL_NAME as the judge, and counts which proposals it accepts. Settings come from .env at the repository root.

${corpusUsage}
            promotion has no rewrite: its custom corpus is --cases DIR only. The folder holds cases.jsonl and library/ (see "Run your own
            set" in evals/promotion/README.md). Results of a custom corpus go to private/promotion/results/.
  --limit   run N proposals, one of each category in turn
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm on PATH, or in AKM_BIN.`;

/** The cases file and the library of a corpus: a folder of cases.jsonl and library/. */
const casesOf = (c: ResolvedCorpus): string => join(c.folder, "cases.jsonl");
const libraryOf = (c: ResolvedCorpus): string => join(c.folder, "library");

/** Where the results of a corpus go: the eval's results/ for the public cases, private/promotion/results/ for a custom corpus, which is not published. */
export const resultsOf = (c: ResolvedCorpus): string => (c.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"));

interface Summary {
  eval: string;
  /** `public` for the committed cases, `custom` for a folder of your own. */
  corpus: string;
  /** A custom corpus: its folder from the repository root, or null when it is outside it (the path would name what is in it). Null for the public cases. Rescore reads the cases of a custom run from it. */
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
  /** The akm config the eval wrote, with secrets redacted, and the settings of its engine: temperature, thinking, endpoint host. */
  config: Record<string, unknown>;
  engine: EngineSettings;
  /** One digest over the cases file and the library's knowledge/ files, named relative to their folders. */
  assets_sha256: string;
  /** The seed of a rewrite corpus. Null for the public cases and for your own notes, which no seed made. */
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
  calls: Calls | null;
  metrics: Metrics;
  /** What the run was made of (see lib/manifest.ts). */
  /** The run's model calls, from akm's own record of them (lib/akm/usage.ts). */
  model_calls: ModelCalls | null;
  manifest: RunManifest;
  results_dir: string;
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
  console.log(`\n${NAME}: public and custom side by side (not pooled)`);
  labels.forEach((l, i) => console.log(`  ${l.padEnd(w[0])}  ${x[i].padEnd(w[1])}  ${y[i].padEnd(w[2])}`));
}

export async function runCorpus(
  corpus: ResolvedCorpus,
  ctx: { sandbox: Sandbox; version: string; model: string; baseUrl: string; label: string; limit?: number; overrides?: Overrides },
  results: string = resultsOf(corpus),
): Promise<Summary> {
  const [casesFile, library] = [casesOf(corpus), libraryOf(corpus)];
  const all = parseCases(readFileSync(casesFile, "utf8"), casesFile);
  const cases = selectCases(all, ctx.limit);
  const assetsDigest = assetsSha256(casesFile, library);
  const dir = makeResultsDir(results, ctx.label);
  console.log(`${NAME} (${corpus.name}): ${cases.length} of ${all.length} proposals`);

  const { rows, seconds } = await collect(ctx.sandbox, cases, library, ctx);
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  const counts = summarize(rows);
  const aborted = counts.n_errored === rows.length ? `no proposal got a verdict. First error: ${rows[0]?.error}` : undefined;
  const config = JSON.parse(readFileSync(join(ctx.sandbox.dir, "config", "config.json"), "utf8")) as Record<string, unknown>; // what akm was given: the patch is in it
  const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
  const seed = corpus.seed;
  const build = akmBuild();
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: corpus.name,
    // what each case presented to akm includes the notes of the bundle it was planted among
    cases: caseDigests(MEASUREMENT, cases, () => bundleSha256(library, cases)),
    akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
    config,
    settings: { strategy: overrides.strategy, config_patch_sha256: overrides.configPatch?.sha256 ?? null, timeout_ms: null, seed },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows),
  });
  tallyCalls(ctx.sandbox.env.AKM_DATA_DIR); // the sandbox outlives the run, so its calls are read now
  const summary: Summary = {
    eval: NAME,
    corpus: corpus.name,
    corpus_folder: corpus.name === "custom" ? corpusFolderOf(corpus.folder) : null,
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    limit: ctx.limit ?? null,
    ...overrideSummary(overrides),
    config: redactConfig(hideEndpoint(config, ctx.baseUrl)), // the endpoint is written as <MODEL_BASE_URL>; engine and manifest hold its host
    engine: engineSettings(config),
    assets_sha256: assetsDigest,
    seed,
    status: aborted ? "aborted" : "complete",
    aborted_reason: aborted ?? null,
    n_cases: all.length,
    n_run: counts.n_run,
    n_errored: counts.n_errored,
    timeouts: counts.timeouts,
    seconds,
    calls: callStats(ctx.sandbox),
    metrics: counts.metrics,
    model_calls: takeModelCalls(),
    manifest,
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
  let values: { model?: string; akm?: string; corpus?: string; cases?: string; yes?: boolean; limit?: string; repeat?: string; strategy?: string; "config-patch"?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...OVERRIDE_OPTIONS, ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`promotion: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  const overrides = parseOverrides(values, STRATEGY, fail);
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: join(EVAL_DIR, "assets"), rewrite: false, fail });

  useAkm(values, fail);
  const settings = useModel(values, fail);
  const { baseUrl, name: model, hasKey } = settings;
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  for (const c of corpora) {
    if (!existsSync(casesOf(c)) || !existsSync(join(libraryOf(c), "knowledge"))) fail(`the ${c.name} set is missing (${relative(ROOT, casesOf(c))} and ${relative(ROOT, libraryOf(c))}/knowledge/). See "Run your own set" in evals/promotion/README.md.`);
  }

  await confirmCases(values, [{ role: "model", name: model, baseUrl }]);

  const summaries: Summary[] = [];
  for (const c of corpora) {
    const runs = await repeatRuns(repeat, label, async (runLabel) => {
      const sandbox = openSandbox({ baseUrl, model, hasKey, overrides });
      try {
        const version = await akmVersion(sandbox).catch((e: Error) => fail(e.message));
        return await runCorpus(c, { sandbox, version, model, baseUrl, label: runLabel, limit, overrides }, resultsOf(c));
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
