#!/usr/bin/env bun
// reflect: runs akm's reflect on one asset at a time, with the model under test as its engine, and scores what it
// proposes with checks that need no judge. See ../README.md.
//
//   evals/reflect/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--retrieval-queries] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmBuild, akmVersion, createSandbox, removeSandbox, AKM_OPTIONS, akmUsage, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit, hideEndpoint, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, corpusUsage, resolveCorpora } from "../../../lib/corpus.ts";
import { caseDigests, buildManifest, completionOf, corpusFolderOf, type RunManifest } from "../../../lib/manifest.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "../../../lib/models.ts";
import { OVERRIDE_OPTIONS, type Overrides, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "../../../lib/akm/overrides.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { makeResultsDir } from "../../../lib/results.ts";
import { type EngineSettings, engineSettings, harnessSha256, redactConfig } from "../../../lib/provenance.ts";
import { type CaseContext, NAME, STRATEGY, configFor, refOf, runCase } from "./collect.ts";
import { MEASUREMENT } from "./measurement.ts";
import { retrievalSearches } from "./queries.ts";
import { type Metrics, type Row, CLASSES, assetsSha256, atLeast, parseCases, pct, selectCases, summarize } from "./lib.ts";

export { runCase };
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
export const MIN_AKM = "0.9.25-alpha.3"; // the first release where reflect changes only the frontmatter
const GIVE_UP_AFTER = 5; // consecutive cases that error, before any case gets an outcome

const USAGE = `Usage: evals/reflect/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--retrieval-queries] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND]

Runs akm's reflect on each case's note, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as
its engine, and scores the proposal. Settings come from .env at the repository root.

${corpusUsage}
            The default custom corpus is private/reflect/assets, made by ./generate-assets. A folder of your own holds cases.jsonl.
  --limit   run the first N cases. The first ten hold each class once.
  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them
  --retrieval-queries  record the retrieval eval's labelled queries for each note as searches that found it, so the retrieval
            check of akm's reflect (it runs after the quality judge passes an edit: see patches/judge-on.json) has queries to grade.
            The queries are those of the public notes: a rewrite takes them through its own map.json, matched by public ref. Not for an own corpus.
${overridesUsage(STRATEGY)}
${modelUsage}
${akmUsage}
  --label   names the results folder: <UTC date>-<label>. Default: the model name.

Needs akm ${MIN_AKM} or later on PATH, or in AKM_BIN.`;

interface Summary {
  eval: string;
  /** "public", or "custom" for any other folder of cases. */
  corpus: string;
  /** The folder of a custom corpus from the repository root, for scripts/rescore. Null for the public corpus, and for a folder outside the repository: its name can say what is in it, so it is not recorded. */
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
  /** The digest of the corpus's cases.jsonl, named relative to the corpus folder. */
  assets_sha256: string;
  /** The seed a rewrite was made with, from its generated.json. Null for every other corpus. */
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
  /** With --retrieval-queries, how many of the cases had queries recorded. */
  retrieval_queries: { cases: number } | null;
  /** The model names that answered, as the responses give them, with how many cases each answered. */
  served: Record<string, number>;
  metrics: Metrics;
  /** What the run was made of (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

interface Ctx extends CaseContext {
  version: string;
  label: string;
  limit?: number;
}

const cell = (n: { correct: number; n: number } | undefined): string => (n ? `${n.correct}/${n.n}` : "-");

function printSummary(s: Summary): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  defects fixed   ${cell(m.defects)}  ${pct(m.defects.rate)}`);
  console.log(`  controls right  ${cell(m.controls)}  ${pct(m.controls.rate)}`);
  console.log(`  proposals       ${m.proposals.n}, ${m.proposals.touched_body} touched the body`);
  const r = m.refused;
  if (r.filter + r.judge + r.retrieval + r.other > 0) console.log(`  refused         ${r.filter} by akm's defect filter, ${r.judge} by the judge, ${r.retrieval} by the retrieval check${r.other ? `, ${r.other} other` : ""}`);
  console.log(`  errored         ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`);
  if (Object.keys(s.served).length > 0) console.log(`  served by       ${Object.entries(s.served).map(([name, n]) => `${name} ${n}`).join(", ")}`);
  for (const cls of CLASSES) {
    const k = m.classes[cls];
    if (!k) continue;
    const failed = Object.entries(k.failed).map(([name, n]) => `${name} ${n}`).join(", ");
    const other = (["none", "refused", "unusable", "error"] as const).filter((o) => k.outcomes[o] > 0 && (o !== "none" || k.correct < k.n)).map((o) => `${o} ${k.outcomes[o]}`).join(", ");
    console.log(`    ${cls.padEnd(22)} ${cell(k).padEnd(5)} ${[failed && `failed: ${failed}`, other && `outcomes: ${other}`].filter(Boolean).join("; ")}`);
  }
  console.log(`  results         ${relative(ROOT, s.results_dir)}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["defects fixed", `${cell(a.metrics.defects)}  ${pct(a.metrics.defects.rate)}`, `${cell(b.metrics.defects)}  ${pct(b.metrics.defects.rate)}`],
    ["controls right", `${cell(a.metrics.controls)}  ${pct(a.metrics.controls.rate)}`, `${cell(b.metrics.controls)}  ${pct(b.metrics.controls.rate)}`],
    ["touched the body", `${a.metrics.proposals.touched_body} of ${a.metrics.proposals.n}`, `${b.metrics.proposals.touched_body} of ${b.metrics.proposals.n}`],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ...CLASSES.filter((cls) => a.metrics.classes[cls] || b.metrics.classes[cls]).map((cls): [string, string, string] => [`  ${cls}`, cell(a.metrics.classes[cls]), cell(b.metrics.classes[cls])]),
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => (r[i] as string).length)));
  console.log(`\n${NAME}: ${a.corpus} and ${b.corpus} side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0] as number)}  ${r[1].padEnd(w[1] as number)}  ${r[2].padEnd(w[2] as number)}`);
}

/** What the summary records as `corpus_folder`: the folder of a custom corpus from the repository root, null when it is outside it, and null for the public corpus. */
export const corpusFolder = (corpus: ResolvedCorpus, root = ROOT): string | null => (corpus.name === "custom" ? corpusFolderOf(corpus.folder, root) : null);

/** The public results go to the eval's own folder, and those of a custom corpus to private/, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => (corpus.name === "public" ? join(root, "evals", NAME, "results") : join(root, "private", NAME, "results"));

export async function runCorpus(corpus: ResolvedCorpus, ctx: Ctx, resultsParent: string = defaultResults(corpus)): Promise<Summary> {
  const assets = corpus.folder;
  const all = parseCases(readFileSync(join(assets, "cases.jsonl"), "utf8"), join(assets, "cases.jsonl"));
  const cases = selectCases(all, ctx.limit);
  const assetsDigest = assetsSha256(assets);
  const dir = makeResultsDir(resultsParent, ctx.label);
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${NAME} (${corpus.name}): ${cases.length} of ${all.length} cases, one at a time`);

  const rows: Row[] = [];
  let consecutiveErrors = 0;
  let anyOutcome = false;
  let aborted: string | undefined;
  for (const c of cases) {
    const row = await runCase(c, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    const verdict = row.outcome === "error" ? `error  ${(row.error ?? "").slice(0, 120)}` : `${row.outcome.padEnd(8)} ${row.correct ? "ok" : `FAIL ${Object.entries(row.checks ?? {}).filter(([, ok]) => !ok).map(([name]) => name).join(",")}`}`;
    console.log(`  [${String(rows.length).padStart(String(cases.length).length)}/${cases.length}] ${c.id.padEnd(26)} ${verdict}  ${row.seconds}s`);
    if (row.outcome === "error") {
      consecutiveErrors++;
      if (!anyOutcome && consecutiveErrors >= GIVE_UP_AFTER) {
        aborted = row.error || "no message";
        break;
      }
    } else {
      anyOutcome = true;
      consecutiveErrors = 0;
    }
  }

  const abortedReason = `the first ${GIVE_UP_AFTER} cases got no outcome, so the run stopped. Last error: ${aborted}`;
  const config = configFor(ctx);
  const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
  const seed = corpus.seed;
  const build = akmBuild();
  const counts = summarize(rows);
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: corpus.name,
    // what each case presented to akm includes the searches this run recorded for its note, so a run with --retrieval-queries is not the run without it (#37)
    cases: caseDigests(MEASUREMENT, cases, (c) => ctx.queries?.get(refOf(c.path)) ?? []),
    akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
    config,
    settings: { strategy: overrides.strategy, config_patch_sha256: overrides.configPatch?.sha256 ?? null, timeout_ms: ctx.timeoutMs ?? null, seed },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows),
  });
  const summary: Summary = {
    eval: NAME,
    corpus: corpus.name,
    corpus_folder: corpusFolder(corpus),
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    harness_sha256: HARNESS,
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    limit: ctx.limit ?? null,
    ...overrideSummary(overrides),
    config: hideEndpoint(redactConfig(config), ctx.baseUrl), // the endpoint is written as <MODEL_BASE_URL>; engine and manifest hold its host
    engine: engineSettings(config),
    assets_sha256: assetsDigest,
    seed,
    status: aborted ? "aborted" : "complete",
    aborted_reason: aborted ? abortedReason : null,
    n_cases: all.length,
    n_run: counts.n_run,
    n_scored: counts.n_scored,
    n_errored: counts.n_errored,
    timeouts: counts.timeouts,
    retrieval_queries: ctx.queries ? { cases: cases.filter((c) => (ctx.queries?.get(refOf(c.path))?.length ?? 0) > 0).length } : null,
    served: counts.served,
    metrics: counts.metrics,
    manifest,
    results_dir: dir,
  };
  // The summary is written before the run fails, and says it was cut short: a reader of the folder must not take it for a whole run.
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  printSummary(summary);
  if (aborted) fail(`${abortedReason}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env.`, 1);
  return summary;
}

async function main(): Promise<void> {
  let values: { model?: string; akm?: string; corpus?: string; cases?: string; yes?: boolean; limit?: string; repeat?: string; "retrieval-queries"?: boolean; strategy?: string; "config-patch"?: string; label?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, "retrieval-queries": { type: "boolean" }, ...OVERRIDE_OPTIONS, ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`reflect: ${(e as Error).message}\n\n${USAGE}`);
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
  const corpora = resolveCorpora({ eval: NAME, values, publicFolder: join(EVAL_DIR, "assets"), fail });
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const repeat = values.repeat === undefined ? undefined : Number(values.repeat);
  if (repeat !== undefined && !(Number.isInteger(repeat) && repeat > 0)) fail("--repeat must be a positive integer");
  const overrides = parseOverrides(values, STRATEGY, fail);
  useAkm(values, fail);
  const settings = useModel(values, fail);
  const { baseUrl, name: model, hasKey } = settings;

  for (const c of corpora) {
    if (c.name === "public") continue;
    const shown = relative(ROOT, c.folder);
    if (!existsSync(join(c.folder, "cases.jsonl"))) {
      fail(c.rewrite ? `the private assets are missing (${shown}/cases.jsonl). Make them with: ./generate-assets --only ${NAME}` : `${c.flag}: ${shown}/cases.jsonl does not exist. The folder of a custom corpus holds cases.jsonl, as assets/ does`);
    }
  }
  // The searches of every corpus are made now, so that a file that is missing stops the run here and not after the first corpus has run.
  const searches = new Map<ResolvedCorpus, Map<string, string[]>>();
  if (values["retrieval-queries"]) {
    for (const c of corpora) {
      try {
        searches.set(c, retrievalSearches(c, ROOT));
      } catch (e) {
        fail((e as Error).message);
      }
    }
  }
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
  if (!atLeast(version, MIN_AKM)) fail(`akm ${version} still rewrites the body. This eval needs akm ${MIN_AKM} or later.`);

  const ctx: Ctx = { baseUrl, model, hasKey, version, label, limit, overrides };
  const summaries: Summary[] = [];
  for (const c of corpora) {
    const queries = searches.get(c);
    summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(c, { ...ctx, label: runLabel, queries }))));
  }
  if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0] as Summary, summaries[1] as Summary);
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`reflect: ${e.message}`);
    process.exit(e.code);
  }
}
