#!/usr/bin/env bun
// nightly: runs one night of akm improve on a library that holds planted items whose right outcome is known: index, the day's
// feedback, `akm improve` with the default strategy, then `akm proposal drain`, as the lab's nightly does. It checks every
// item, what changed outside the items, the lessons accepted and the model calls that failed. See ../README.md.
//
//   evals/nightly/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--embedder deterministic|real] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit, hideEndpoint, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import { buildManifest, caseDigests, completionOf, corpusFolderOf, type RunManifest } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { OVERRIDE_OPTIONS, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "../../../lib/akm/overrides.ts";
import { harnessSha256 } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { type RunInputs, privateAssetsProblem, runInputs } from "../../consolidate/src/inputs.ts";
import { EMBEDDER_OPTIONS, embedderUsage, parseEmbedder } from "../../consolidate/src/lib.ts";
import { type Embedder, sandboxOptions } from "../../consolidate/src/sandbox.ts";
import { atLeast } from "../../reflect/src/lib.ts";
import { type CallRow, type CollectContext, NAME, STRATEGY, callStats, effectiveConfig, haveNight, rawOfNight } from "./collect.ts";
import { KINDS } from "./items.ts";
import { MEASUREMENT } from "./measurement.ts";
import { loadNight, nightFiles, planted, selectItems } from "./night.ts";
import { type Metrics, type Row, makeRow, summarize } from "./score.ts";
import { pct } from "./lib.ts";

export const MIN_AKM = "0.9.26"; // the first release with the pair judge's claim lists, exact fixes and lessons that wait for review
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir, { also: ["consolidate", "distill", "reflect"].map((name) => join(ROOT, "evals", name, "src")) });

const USAGE = `Usage: evals/nightly/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--embedder deterministic|real] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Runs one night of akm improve, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as its engine, on a library
of planted items, then drains the proposals as the nightly does, and checks the result. Settings come from .env at the
repository root.

${corpusUsage}
            The default custom corpus is private/nightly/assets, made by ./generate-assets; the run stops if it is missing.
  --limit   plant only N items, taking the first of each kind in turn
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
${embedderUsage}
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm ${MIN_AKM} or later, on PATH or in AKM_BIN.`;

/** What the summary of a run records of its corpus: public or custom, and the folder of a custom corpus if that is inside the repository (null for the public one and for a folder outside it, for scripts/rescore: lib/manifest.ts corpusFolderOf). Never an absolute path. */
interface CorpusFields {
  corpus: "public" | "custom";
  corpus_folder: string | null;
}

export const corpusFields = (c: ResolvedCorpus): CorpusFields => ({ corpus: c.name, corpus_folder: c.name === "custom" ? corpusFolderOf(c.folder) : null });

interface Summary extends RunInputs, CorpusFields {
  eval: string;
  label: string;
  date: string;
  /** A night that fails writes no summary, so this is "complete". It is here so every eval's summary says whether the run was cut short. */
  status: "complete";
  aborted_reason: null;
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
  /** How akm embedded the notes to find pairs: its deterministic word-hash embedder, or its built-in model. */
  embedder: Embedder;
  limit: number | null;
  /** The strategy akm ran, and the config patch (path and SHA-256) merged into the config, if any. */
  strategy: string;
  config_patch: { path: string; sha256: string } | null;
  n_items: number;
  n_planted: number;
  /** Items akm reports an error for: a model call failed, or the run's budget ran out at them. */
  n_errored: number;
  /** Wall-clock seconds of each step of the night. */
  seconds: { index: number; feedback: number; improve: number; drain: number; total: number };
  /** What akm says of the improve run: false when it did not run to its end. */
  improve_ok: boolean;
  /** Processes akm skipped because their engine could not be used. */
  skipped_processes: string[];
  /** What the drain did: proposals promoted, rejected, left for review and failed. */
  drain: { promoted: number; rejected: number; deferred: number; failed: number };
  /** Paths no item owns that changed, appeared or vanished. */
  outside_changed: string[];
  /** The pair pass of consolidate: pairs judged, judgments that failed and the labels given. */
  pair_pass: { pairs_judged: number; failed_judgments: number; labels: Record<string, number> } | null;
  /** The improve run's model calls by process and the model name the endpoint reported. A gateway may serve one name from several providers. */
  calls_by: CallRow[];
  metrics: Metrics;
  /** What the run was made of (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

const cell = (n: number, of: number, x: number | null) => `${n}/${of}  ${pct(x)}`;
const minutes = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(0)} s`);

function printSummary(s: Summary, rows: Row[]): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_planted} of ${s.n_items} items`);
  console.log(`  items right        ${cell(m.items.ok, m.items.n, m.items.rate)}`);
  console.log(`  harm               ${m.harm.items} items, ${m.harm.outside_changed} paths changed outside the items, ${m.harm.lessons_accepted} lessons accepted`);
  console.log(`  model calls        ${m.calls.n}, ${m.calls.failures} failed`);
  if (m.proactive) console.log(`  proactive lane     picked ${m.proactive.selected} of ${m.proactive.due} due, ${m.proactive.on_silent} proposals on silent defects, ${m.proactive.on_others} on other notes`);
  console.log(`  night              ${minutes(s.seconds.total)} (index ${minutes(s.seconds.index)}, feedback ${minutes(s.seconds.feedback)}, improve ${minutes(s.seconds.improve)}, drain ${minutes(s.seconds.drain)})`);
  console.log(`  drain              ${s.drain.promoted} promoted, ${s.drain.rejected} rejected, ${s.drain.deferred} left for review, ${s.drain.failed} failed`);
  if (!s.improve_ok) console.log("  akm reported the improve run as not ok");
  if (s.skipped_processes.length > 0) console.log(`  skipped            ${s.skipped_processes.join(", ")}`);
  if (s.pair_pass) console.log(`  pair judge         ${s.pair_pass.pairs_judged} pairs judged as ${Object.entries(s.pair_pass.labels).map(([l, n]) => `${l} ${n}`).join(", ") || "nothing"}, ${s.pair_pass.failed_judgments} judgments failed`);
  for (const r of s.calls_by.filter((r) => r.failures > 0)) console.log(`  failed calls       ${r.process} on ${r.model}: ${r.failures} of ${r.calls}`);
  for (const k of KINDS) {
    const c = m.by_kind[k];
    if (c) console.log(`    ${k.padEnd(10)} ${c.ok}/${c.n}`);
  }
  for (const r of rows.filter((r) => !r.ok)) console.log(`  ${r.harm ? "HARM" : "miss"}  ${r.id.padEnd(24)} ${Object.entries(r.checks).filter(([, pass]) => !pass).map(([name]) => name).join(", ")} | ${r.state}${r.error ? ` | ${r.error}` : ""}`);
  for (const p of s.outside_changed) console.log(`  HARM  changed outside the items: ${p}`);
  console.log(`  results            ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const col = (s: Summary) => ({
    right: cell(s.metrics.items.ok, s.metrics.items.n, s.metrics.items.rate),
    harm: `${s.metrics.harm.items} items, ${s.metrics.harm.outside_changed} outside, ${s.metrics.harm.lessons_accepted} lessons`,
    calls: `${s.metrics.calls.n} calls, ${s.metrics.calls.failures} failed`,
    night: minutes(s.seconds.total),
  });
  const [x, y] = [col(a), col(b)];
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["items right", x.right, y.right],
    ["harm", x.harm, y.harm],
    ["model calls", x.calls, y.calls],
    ["night", x.night, y.night],
    ...KINDS.filter((k) => a.metrics.by_kind[k] || b.metrics.by_kind[k]).map((k): [string, string, string] => {
      const c = (s: Summary) => (s.metrics.by_kind[k] ? `${s.metrics.by_kind[k]?.ok}/${s.metrics.by_kind[k]?.n}` : "-");
      return [`  ${k}`, c(a), c(b)];
    }),
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => (r[i] as string).length)));
  console.log(`\n${NAME}: public and custom side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0] as number)}  ${r[1].padEnd(w[1] as number)}  ${r[2].padEnd(w[2] as number)}`);
}

/** What a run needs besides the collector's: the akm version, the label of its results folder and the limit of items. */
type RunContext = CollectContext & { version: string; label: string; limit?: number };

export async function runCorpus(corpus: ResolvedCorpus, ctx: RunContext, resultsParent = corpus.name === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results")): Promise<Summary> {
  const night = loadNight(corpus.folder);
  const items = selectItems(night.items, ctx.limit);
  console.log(`${NAME} (${corpus.name}): ${items.length} of ${night.items.length} items, one night, one model call at a time`);
  const t0 = performance.now();
  const done = await haveNight(items, night.files, ctx);
  const total = Number(((performance.now() - t0) / 1000).toFixed(1));

  // akm names the endpoint in some of its errors, and rows get shared, so no row carries it (rawOfNight writes <MODEL_BASE_URL> in its place).
  const raws = rawOfNight(items, done, ctx.baseUrl);
  const rows = items.map((item, i) => makeRow(item, raws[i] as never));
  const counts = summarize(rows);
  const calls = callStats(done.improve);
  const result = done.improve as { ok?: boolean; skippedProcesses?: { process?: string }[]; consolidation?: { pairPass?: { pairsJudged?: number; failedJudgments?: number; labelCounts?: Record<string, number> } } };
  const pairPass = result.consolidation?.pairPass;

  const dir = makeResultsDir(resultsParent, ctx.label);
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
  const embedder = ctx.embedder ?? "deterministic";
  const config = effectiveConfig(ctx);
  const seed = corpus.seed;
  const build = akmBuild();
  const summary: Summary = {
    eval: NAME,
    ...corpusFields(corpus),
    label: ctx.label,
    date: new Date().toISOString(),
    status: "complete",
    aborted_reason: null,
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    embedder,
    limit: ctx.limit ?? null,
    ...overrideSummary(overrides),
    ...runInputs(config, (text) => hideEndpoint(text, ctx.baseUrl), { dir: corpus.folder, files: nightFiles(corpus.folder) }, seed),
    n_items: night.items.length,
    n_planted: items.length,
    n_errored: counts.n_errored,
    seconds: { ...done.seconds, total },
    improve_ok: result.ok !== false,
    skipped_processes: (result.skippedProcesses ?? []).map((p) => String(p.process)),
    drain: done.drain,
    outside_changed: counts.outside_changed,
    pair_pass: pairPass ? { pairs_judged: Number(pairPass.pairsJudged ?? 0), failed_judgments: Number(pairPass.failedJudgments ?? 0), labels: Object.fromEntries(Object.entries(pairPass.labelCounts ?? {}).filter(([, n]) => n > 0)) } : null,
    calls_by: calls.by.map((r) => ({ ...r, model: hideEndpoint(r.model, ctx.baseUrl) })),
    metrics: counts.metrics,
    manifest: buildManifest({
      measurement: MEASUREMENT,
      corpus: corpus.name,
      cases: caseDigests(MEASUREMENT, planted(items, night.files)),
      akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
      config,
      settings: { strategy: overrides.strategy, config_patch_sha256: overrides.configPatch?.sha256 ?? null, timeout_ms: null, seed },
      treatment_hints: { embedder },
      completion: completionOf(MEASUREMENT, items.map((i) => i.id), rows),
    }),
    results_dir: dir,
  };
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary, rows);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; akm?: string; corpus?: string; cases?: string; yes?: boolean; limit?: string; repeat?: string; embedder?: string; strategy?: string; "config-patch"?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...EMBEDDER_OPTIONS, ...OVERRIDE_OPTIONS, ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`${NAME}: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const publicAssets = join(EVAL_DIR, "assets");
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: publicAssets, fail });
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  const embedder = parseEmbedder(values.embedder, fail);
  const overrides = parseOverrides(values, STRATEGY, fail);

  useAkm(values, fail);
  const settings = useModel(values, fail);
  const { baseUrl, name: model, hasKey } = settings;
  for (const c of corpora) {
    if (c.name === "public") continue;
    const problem = c.rewrite ? privateAssetsProblem(NAME, dirname(c.folder), "items.jsonl") : existsSync(join(c.folder, "items.jsonl")) ? null : `${c.flag}: ${join(c.folder, "items.jsonl")} is missing. A custom corpus of nightly is a folder with an items.jsonl and a library/, as assets/README.md describes`;
    if (problem) fail(problem);
  }
  const label = values.label ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  await confirmCases(values, [{ role: "model", name: model, baseUrl }]);

  const newSandbox = () => createSandbox(NAME, sandboxOptions(embedder)); // the config names the model key as $MODEL_API_KEY; the real embedder's model is kept in .cache/
  const probe = newSandbox();
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }

  if (!atLeast(version, MIN_AKM)) fail(`akm ${version} is older than this eval is written for. It needs akm ${MIN_AKM} or later.`);

  const ctx = { newSandbox, baseUrl, model, hasKey, version, label, limit, overrides, embedder };
  const summaries: Summary[] = [];
  for (const c of corpora) summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { ...ctx, label: runLabel }))));
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0] as Summary, summaries[1] as Summary);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`${NAME}: ${e.message}`);
    process.exit(e.code);
  }
}
