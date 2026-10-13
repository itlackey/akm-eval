#!/usr/bin/env bun
// longmemeval: long-term chat memory question answering, with akm as the memory. Each question is
// answered twice by the same model, once with the whole chat history (without akm) and once with only
// the sessions akm retrieves (with akm), and a judge grades both. See ../README.md.
//
//   benchmarks/longmemeval/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--label NAME]
//                              [--sample-seed N] [--retrieval-only] [--semantic] [--resume DIR]

import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, akmBuild, akmUsage, akmVersion, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit as commitOf, slug } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, resolveCorpora } from "../../../lib/corpus.ts";
import { type RunManifest, buildManifest, caseDigests, completionOf, corpusFolderOf, readManifest } from "../../../lib/manifest.ts";
import { JUDGE_OPTIONS, MODEL_OPTIONS, type ModelEntry, type ModelSettings, judgeUsage, modelUsage, useJudge, useModel } from "../../../lib/models.ts";
import { type EngineSetting, canonical, endpointHost, harnessSha256, sha256File } from "../../../lib/provenance.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { clearRunning, makeResultsDir, markRunning } from "../../../lib/results.ts";
import { Akm, PROJECTION_LIMIT, type SearchMode } from "./akm.ts";
import { type Context, NAME, READER_ORDER, TOP_K, collectQuestion, openSandbox, sampling } from "./collect.ts";
import { DATA_FILE, ensureDataset, loadQuestions, readLock, sampleQuestions, type Sample } from "./dataset.ts";
import { CHAT_TIMEOUT_MS, TEMPERATURE, type Endpoint } from "./llm.ts";
import { digestFiles, readGenerated } from "./manifest.ts";
import { MEASUREMENT } from "./measurement.ts";
import type { Rate } from "./metrics.ts";
import { type Row, summarize } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
const DEFAULT_SAMPLE_SEED = 42;
const GIVE_UP_AFTER = 3; // questions in a row that failed the same way, before the first one that did not

const USAGE = `Usage: benchmarks/longmemeval/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--label NAME]
                                  [--sample-seed N] [--retrieval-only] [--semantic] [--resume DIR]
                                  [--model ID] [--judge-model ID] [--akm COMMAND]

Answers LongMemEval questions with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME, twice: with
the whole chat history, and with only the sessions akm retrieves. The judge in JUDGE_BASE_URL, JUDGE_API_KEY
and JUDGE_MODEL grades both answers; a judge with no JUDGE_BASE_URL goes to the model's endpoint. Settings come from
.env at the repository root.

  --corpus          public (default) fetches the pinned dataset into assets/ if it is not there. custom reads
                    private/longmemeval/assets/, made by ./generate-assets. all runs both and prints the two
                    results side by side.
  --cases DIR       a custom corpus of your own: a folder with ${DATA_FILE}, in the dataset's format.
                    It is --corpus custom. See "Corpora" in README.md. The run says which model and judge it sends the
                    chats to and asks first.
  -y, --yes         send the chats of --cases without asking.
  --limit N         ask N questions, drawn at random under the sample seed in proportion to question type
  --sample-seed N   the seed of that draw (default ${DEFAULT_SAMPLE_SEED}). It is recorded in summary.json as sample_seed,
                    apart from seed, the seed that made the custom dataset.
  --repeat N        run each corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
                    <UTC date>-<label>-repeat-summary.json beside them. Every run asks the same questions. It does not go with --resume.
  --retrieval-only  no model and no judge: ingest, search, and score what akm retrieves against the
                    sessions that hold the answer
  --semantic        search with akm's semantic search as well as its keyword index: akm embeds each question's sessions
                    with its built-in model (bge-small-en-v1.5, 133 MB, downloaded once into .cache/models/) as it
                    indexes them, so a question takes longer. A search that does not come back as semantic is an
                    errored call. Default: keyword search only. It is recorded in summary.json as search_mode.
  --label NAME      names the results folder: <UTC date>-<label>. Default: the model name.
  --resume DIR      carry on a stopped run in its results folder: with the same manifest (corpus, questions, eval version,
                    model, judge and their endpoints, akm version, command, build and uncommitted changes, and config) and
                    code (harness_sha256), it asks only the questions that are not done.
                    Rows made by other code are refused, not carried on: start a new run, without --resume
${modelUsage}
${judgeUsage}
${akmUsage}

Needs akm on PATH, or in AKM_BIN.`;

type Build = ReturnType<typeof akmBuild>;

interface Summary extends ReturnType<typeof summarize> {
  eval: string;
  /** `public` or `custom` (see lib/corpus.ts). */
  corpus: string;
  /** The folder of the questions of a custom corpus from the repository root (corpusFolderOf), so that scripts/rescore finds them. Null for the public corpus, and for a folder outside the repository, which is never recorded: rescore takes --cases DIR for it. */
  corpus_folder: string | null;
  label: string;
  date: string;
  /** True when the run asked every question it set out to. A summary written after each question says false until the last one. */
  complete: boolean;
  /** The rows include earlier work whose full wall time is not recorded. */
  resumed: boolean;
  /** "aborted" for a run that did not finish what it set out to do, and then aborted_reason says why. A run still going, or killed, has not finished either. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  git_commit: string;
  /** A digest of the eval's source files and of the shared code in lib/ that the run used (see harnessSha256 in lib/provenance.ts). */
  harness_sha256: string;
  model: string | null;
  judge_model: string | null;
  /** The host the model and the judge are called at. Never the path, which can name a deployment or carry a key. Null when the run has no model. */
  model_endpoint: string | null;
  judge_endpoint: string | null;
  /** What every model and judge request sends: the temperature, and the most tokens each may answer with. Null when the run has no model. */
  temperature: number | null;
  max_tokens: { model: number; judge: number } | null;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  /** A sha256 over the changes to that checkout that are not committed (see dirtyFingerprint in lib/akm/akm.ts), which tells two edits of one commit apart. Null for a clean checkout and for a release. */
  akm_build_fingerprint: string | null;
  top_k: number;
  /** How akm searched: keyword, or semantic (--semantic), in which every search was checked to have come back semantic. */
  search_mode: SearchMode;
  /** The akm config the eval wrote for the sandbox, as the file has it, with any secret redacted. For --semantic it holds the embedder's model and query timeout. */
  config: unknown;
  /** The order the sessions akm returns go to the reader in: the haystack's, which is the order the baseline reads. */
  reader_order: string;
  retrieval_only: boolean;
  /** "retrieval-only" for a run with no model, null for the rest. Another mode is another measurement (see the manifest). */
  mode: string | null;
  dataset: Record<string, unknown>;
  /** One digest over the dataset files the run read (the lock or rewrite.json, and the questions), by name. */
  assets_sha256: string;
  /** The seed of the rewrite that made the custom dataset, as a decimal string: the one in generated.json beside the assets, which is not private/seed when generate-assets ran with --seed. Null for the public corpus and for a corpus of your own. */
  seed: string | null;
  /** The seed of the draw of the questions (--sample-seed), a different thing from `seed`. Null when no draw was made because every question was asked. The same number is in sample.seed. */
  sample_seed: number | null;
  sample: Omit<Sample, "items">;
  /** What the run was made of (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
}

let commit: string | undefined;
const gitCommit = (): string => (commit ??= commitOf(ROOT)); // asked once: the summary is written after every question

/** Why a summary that is not complete says aborted when nothing gave up: the run was cut short, or is still going and writes it again after the next question. */
const UNFINISHED = "the run had not asked every question when this summary was written";

const questions = (n: number): string => `${n} question${n === 1 ? "" : "s"}`;
const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const fixed = (x: number | null): string => (x === null ? "n/a" : x.toFixed(2));
const points = (x: number | null): string => (x === null ? "n/a" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} points`);

function printSummary(s: Summary): void {
  const r = s.metrics.retrieval;
  console.log(`\n${NAME} (${s.corpus}) | ${s.n_run} of ${s.sample.total} questions | model ${s.model ?? "none"} | judge ${s.judge_model ?? "none"} | akm ${s.akm_version}, ${s.search_mode} search`);
  const acc = s.metrics.accuracy;
  if (acc) {
    const line = (title: string, a: Rate & { n_errored: number }) => console.log(`  ${title}  ${a.correct}/${a.n}  ${pct(a.rate)}  (errored ${a.n_errored})`);
    line("without akm", acc.without_akm);
    line("with akm   ", acc.with_akm);
    const d = acc.difference;
    const ci = d.ci95 ? `, 95% interval ${points(d.ci95[0])} to ${points(d.ci95[1])}` : "";
    console.log(`  difference   ${points(d.value)} over ${questions(d.n)} both arms scored${ci}`);
    console.log(`               only with akm ${d.only_with_akm}, only without ${d.only_without_akm}, both ${d.both_correct}, neither ${d.neither}`);
  }
  const abstention = s.metrics.retrieval_abstention.n;
  console.log(`  retrieval    top ${r.k}: hit ${pct(r.hit_rate)}, recall ${fixed(r.recall)}, precision ${fixed(r.precision)}, mrr ${fixed(r.mrr)}, ndcg ${fixed(r.ndcg)}, no results ${pct(r.zero_hit_rate)} (${questions(r.n)}${abstention > 0 ? `, and ${questions(abstention)} of abstention left out` : ""})`);
  if (s.sessions_loaded > 0) console.log(`  sessions     ${s.sessions_over_projection_limit} of ${s.sessions_loaded} loaded into akm are longer than ${PROJECTION_LIMIT.toLocaleString("en-US")} characters, where its keyword index cuts a body`);
  if (s.timeouts > 0) console.log(`  timeouts     akm timed out on ${questions(s.timeouts)}`);
  for (const note of s.notes) console.log(`  note: ${note}`);
  console.log(`  results      ${s.results_dir}/`);
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(a: Summary, b: Summary): void {
  const arm = (s: Summary, which: "without_akm" | "with_akm") => (s.metrics.accuracy ? `${s.metrics.accuracy[which].correct}/${s.metrics.accuracy[which].n}  ${pct(s.metrics.accuracy[which].rate)}` : "n/a");
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["without akm", arm(a, "without_akm"), arm(b, "without_akm")],
    ["with akm", arm(a, "with_akm"), arm(b, "with_akm")],
    ["difference", points(a.metrics.accuracy?.difference.value ?? null), points(b.metrics.accuracy?.difference.value ?? null)],
    ["retrieval hit", pct(a.metrics.retrieval.hit_rate), pct(b.metrics.retrieval.hit_rate)],
    ["retrieval recall", fixed(a.metrics.retrieval.recall), fixed(b.metrics.retrieval.recall)],
    ["questions run", String(a.n_run), String(b.n_run)],
    ["questions errored", String(a.n_errored), String(b.n_errored)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`\n${NAME}: public and custom side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

/** The settings of the model or the judge as the manifest keeps them: the host of the endpoint, never the path. */
const engineOf = (e: Endpoint): EngineSetting => ({ model: e.model, endpoint: endpointHost(e.baseUrl), temperature: TEMPERATURE, enableThinking: null, timeoutMs: CHAT_TIMEOUT_MS });

/**
 * What differs between the manifest of a stored run and the manifest of this run, each as a clause for a message: "a different akm build
 * (v1, now v2)". A resume is the same run only when none differs. An endpoint is told by its host.
 */
export function manifestDifferences(prior: RunManifest, now: RunManifest): string[] {
  const out: string[] = [];
  const show = (x: unknown) => (x === null || x === undefined ? "none" : String(x));
  const note = (what: string, was: unknown, is: unknown) => {
    if (was !== is) out.push(`a different ${what} (${show(was)}, now ${show(is)})`);
  };
  note("eval", prior.eval, now.eval);
  note("corpus", prior.corpus, now.corpus);
  note("mode", prior.mode, now.mode);
  note("version", prior.collector.version, now.collector.version);
  note("harness version", prior.harness_version, now.harness_version);
  note("akm version", prior.akm.version, now.akm.version);
  note("akm command", prior.akm.bin, now.akm.bin);
  note("akm build", prior.akm.build, now.akm.build);
  note("akm build fingerprint", prior.akm.build_fingerprint, now.akm.build_fingerprint); // two edits of one commit are two builds
  note("akm config", prior.config.sha256, now.config.sha256);
  note("settings", canonical(prior.settings), canonical(now.settings));
  note("treatment hints", canonical(prior.treatment_hints), canonical(now.treatment_hints));
  for (const role of ["model", "judge"]) {
    const was = prior.engines[role];
    const is = now.engines[role];
    const rest = (e: EngineSetting | undefined) => (e === undefined ? null : canonical({ ...e, model: null, endpoint: null }));
    note(role, was?.model, is?.model);
    note(`${role} endpoint`, was?.endpoint, is?.endpoint);
    note(`${role} settings`, rest(was), rest(is));
  }
  const ids = [...new Set([...Object.keys(prior.cases), ...Object.keys(now.cases)])];
  const differ = ids.filter((id) => canonical(prior.cases[id]) !== canonical(now.cases[id]));
  if (differ.length > 0) out.push(`different questions (${differ.length} of ${ids.length} differ in what they present or are judged by, or are not asked now)`);
  return out;
}

/**
 * The rows of an earlier run in `dir` that need no redoing, for --resume. The run must be the same one, which its manifest says: the same
 * corpus, the questions (each by the digest of what it presents and of what it is judged by), the eval's version, the model, the
 * judge and the endpoints they are called at, akm (version, command, build with the fingerprint of its uncommitted changes, and config), and
 * harness. A question with an arm that errored is asked again. A run made by other code is refused, not continued: the summary would name
 * this run's code for rows that code did not make, and there is no mixed-version mode. A summary with no manifest or no harness_sha256 is
 * from before it was recorded, so its code is unknown, and it is refused the same way.
 */
export function resumableRows(dir: string, now: { manifest: RunManifest; retrievalOnly: boolean }): Row[] {
  const summaryPath = join(dir, "summary.json");
  if (!existsSync(summaryPath)) fail(`${dir} has no summary.json, so it is not a run to resume`);
  const prior = JSON.parse(readFileSync(summaryPath, "utf8")) as Summary;
  const reading = readManifest(prior);
  if (reading.kind === "legacy") fail(`${dir} was run by an older version of this eval, before the run manifest, whose rows are not comparable to the ones it would add. Run again without --resume.`);
  if (reading.kind === "invalid") fail(`${dir} has a manifest that is not sound (${reading.problems.join("; ")}). Run again without --resume.`);
  if (reading.manifest.rescored_from !== undefined) fail(`${dir} is the result of scripts/rescore, not a run, so there is nothing in it to carry on. Resume the folder it was made from.`);
  if (prior.harness_sha256 !== HARNESS) {
    fail(`${dir} was run by other code than this run's: its harness_sha256 is ${prior.harness_sha256 ?? "not recorded (the summary is from before it was)"}, and this run's is ${HARNESS}. Its rows are not carried into a summary that names this code. Start a new run, without --resume.`);
  }
  const [different] = manifestDifferences(reading.manifest, now.manifest);
  if (different !== undefined) fail(`${dir} was run with ${different}. Run again with the same settings, or without --resume.`);
  const lines = readFileSync(join(dir, "samples.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "");
  const rows: Row[] = [];
  for (const [i, line] of lines.entries()) {
    try {
      rows.push(JSON.parse(line) as Row);
    } catch {
      if (i < lines.length - 1) fail(`${join(dir, "samples.jsonl")} line ${i + 1} is not valid JSON`);
    }
  }
  return rows.filter((r) => r.retrieval !== null && (now.retrievalOnly || (r.without_akm?.ok === true && r.with_akm?.ok === true)));
}

export async function runCorpus(
  corpus: ResolvedCorpus,
  args: { limit?: number; label: string; sampleSeed: number; resume?: string },
  ctx: Context & { version: string; build?: Build },
  folders: { results?: string } = {},
): Promise<Summary> {
  const assets = corpus.folder;
  const isPublic = corpus.name === "public";
  const parent = folders.results ?? (isPublic ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"));
  // The seed of a rewrite is the one in its generated.json, whatever private/seed holds now.
  const seed = corpus.rewrite ? readGenerated(dirname(assets))?.seed ?? null : null;
  const searchMode = ctx.akm.mode;
  const retrievalOnly = ctx.model === null;
  const config = ctx.akm.config();
  const build = ctx.build ?? akmBuild();
  let dataset: Record<string, unknown>;
  let datasetFiles: string[];
  if (isPublic) {
    const lock = readLock(assets);
    dataset = { name: lock.dataset, source: lock.source, licence: lock.licence, revision: lock.revision, file: DATA_FILE, sha256: lock.files[DATA_FILE].sha256 };
    datasetFiles = ["ASSETS.lock", DATA_FILE];
  } else if (corpus.rewrite) {
    dataset = { ...JSON.parse(readFileSync(join(assets, "rewrite.json"), "utf8")), file: DATA_FILE };
    datasetFiles = ["rewrite.json", DATA_FILE];
  } else {
    dataset = { name: "custom", file: DATA_FILE, sha256: sha256File(join(assets, DATA_FILE)) };
    datasetFiles = [DATA_FILE];
  }
  const path = isPublic ? await ensureDataset(assets) : join(assets, DATA_FILE);
  // Before the questions are read, so the file is not held twice. The custom file is hashed as it is, not as rewrite.json says.
  const assets_sha256 = digestFiles(assets, datasetFiles);
  const sample = sampleQuestions(loadQuestions(path), args.limit, args.sampleSeed);
  const selected = sample.items.map((q) => q.question_id);
  const rows: Row[] = [];
  const digests = caseDigests(MEASUREMENT, sample.items);
  // What the run is made of, apart from how far it got. A resume has to be the same.
  const manifestOf = (completion: { selected: string[]; scored: string[]; errored: string[] }): RunManifest =>
    buildManifest({
      measurement: MEASUREMENT,
      corpus: corpus.name,
      mode: retrievalOnly ? "retrieval-only" : null,
      cases: digests,
      akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
      config,
      engines: ctx.model && ctx.judge ? { model: engineOf(ctx.model), judge: engineOf(ctx.judge) } : {},
      settings: { seed },
      completion,
    });
  let dir: string;
  if (args.resume === undefined) {
    dir = makeResultsDir(parent, args.label);
    writeFileSync(join(dir, "samples.jsonl"), "");
  } else {
    dir = resolve(args.resume);
    rows.push(...resumableRows(dir, { manifest: manifestOf({ selected, scored: [], errored: [] }), retrievalOnly }));
    writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
    markRunning(dir); // makeResultsDir marks a new folder, so a resumed one is marked here, once it is known to be this run's
  }
  const samples = join(dir, "samples.jsonl");
  console.log(`${NAME} (${corpus.name}): ${sample.n} of ${sample.total} questions${sample.seed === null ? "" : `, drawn with sample seed ${sample.seed}`}${rows.length > 0 ? `, ${rows.length} already done` : ""}`);
  if (ctx.model && sample.n > 50) console.log("  Each question sends the whole history, about 115k tokens, in the without-akm arm. Use --limit for a shorter run.");

  const save = (complete: boolean, abortedReason?: string) => {
    const summary: Summary = {
      eval: NAME,
      corpus: corpus.name,
      corpus_folder: isPublic ? null : corpusFolderOf(assets),
      label: args.label,
      date: new Date().toISOString(),
      complete,
      resumed: args.resume !== undefined,
      status: complete ? "complete" : "aborted",
      aborted_reason: complete ? null : (abortedReason ?? UNFINISHED),
      git_commit: gitCommit(),
      harness_sha256: HARNESS,
      model: ctx.model?.model ?? null,
      judge_model: ctx.judge?.model ?? null,
      model_endpoint: ctx.model ? endpointHost(ctx.model.baseUrl) : null,
      judge_endpoint: ctx.judge ? endpointHost(ctx.judge.baseUrl) : null,
      ...sampling(retrievalOnly),
      akm_version: ctx.version,
      ...build,
      top_k: TOP_K,
      search_mode: searchMode,
      config,
      reader_order: READER_ORDER,
      retrieval_only: retrievalOnly,
      mode: retrievalOnly ? "retrieval-only" : null,
      dataset,
      assets_sha256,
      seed,
      sample_seed: sample.seed,
      sample: { order: sample.order, seed: sample.seed, n: sample.n, total: sample.total, per_type: sample.per_type },
      ...summarize(rows),
      manifest: manifestOf(completionOf(MEASUREMENT, selected, rows)),
      results_dir: relative(ROOT, dir),
    };
    const { results_dir: _dir, ...stored } = summary;
    writeFileSync(join(dir, "summary.json.tmp"), `${JSON.stringify(stored, null, 2)}\n`);
    renameSync(join(dir, "summary.json.tmp"), join(dir, "summary.json"));
    return summary;
  };

  let failedInARow = 0;
  let anyScored = false;
  let searchFailedInARow = 0;
  let anySearched = false;
  let gaveUp: string | undefined;
  let gaveUpOn: "akm" | "model" = "model";
  const done = new Set(rows.map((r) => r.id));
  for (const q of sample.items) {
    if (done.has(q.question_id)) continue;
    const row = await collectQuestion(q, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    save(false);
    const word = (a: Row["with_akm"]) => (a === null ? "-" : a.ok ? (a.correct ? "correct" : "wrong") : "error");
    const seconds = (a: Row["with_akm"]) => (a?.seconds === null || a === null ? "" : ` ${a.seconds}s`);
    const hit = row.retrieval ? `hit ${row.retrieval.hit ? "yes" : "no"}, recall ${fixed(row.retrieval.recall)}` : `error ${row.retrieval_error?.slice(0, 80)}`;
    console.log(`  [${String(rows.length).padStart(String(sample.n).length)}/${sample.n}] ${q.question_type.padEnd(25)} ${q.question_id.slice(0, 14).padEnd(14)}  without akm: ${word(row.without_akm)}${seconds(row.without_akm)} | with akm: ${word(row.with_akm)}${seconds(row.with_akm)} | retrieval: ${hit}`);
    for (const arm of [row.without_akm, row.with_akm]) if (arm?.error) console.log(`      ${arm.error.slice(0, 160)}`);
    if (row.retrieval !== null) anySearched = true;
    searchFailedInARow = row.retrieval === null ? searchFailedInARow + 1 : 0;
    if (!anySearched && searchFailedInARow >= GIVE_UP_AFTER) {
      gaveUp = row.retrieval_error ?? "no error was reported";
      gaveUpOn = "akm";
      break;
    }
    if (ctx.model) {
      const scored = [row.without_akm, row.with_akm].some((a) => a?.ok);
      if (scored) anyScored = true;
      failedInARow = scored ? 0 : failedInARow + 1;
      if (!anyScored && failedInARow >= GIVE_UP_AFTER) {
        gaveUp = row.without_akm?.error ?? row.with_akm?.error ?? "no error was reported";
        break;
      }
    }
  }
  const stopped = gaveUp === undefined ? undefined : gaveUpOn === "akm" ? `akm could not search the first ${GIVE_UP_AFTER} questions, so the run stopped. Last error: ${gaveUp}` : `the first ${GIVE_UP_AFTER} questions could not be answered and graded, so the run stopped. Last error: ${gaveUp}`;
  const summary = save(stopped === undefined && rows.length === sample.n, stopped);
  clearRunning(dir); // this folder is done: under --corpus all the next corpus runs in this process, which is alive
  printSummary(summary);
  if (stopped !== undefined) {
    if (gaveUpOn === "akm") fail(`${stopped}\nCheck that \`${process.env.AKM_BIN?.trim() || "akm"} index\` and \`search\` work.`, 1);
    fail(`${stopped}\nCheck the MODEL_ and JUDGE_ settings in .env, and the context size of the model server: the whole history is about 115k tokens.`, 1);
  }
  return summary;
}

const toEndpoint = (m: ModelSettings): Endpoint => ({ baseUrl: m.baseUrl, model: m.name, apiKey: m.apiKey });

/**
 * The model under test and the judge. The model is resolved first (useModel also writes it to MODEL_* in `env`), and its endpoint and
 * key are the judge's fallback: a judge with no JUDGE_BASE_URL of its own, and no models.json line, goes where the model goes, which
 * for `--model` naming a models.json line is that line's URL and not the gateway in .env.
 */
export function resolveEndpoints(values: { model?: string; "judge-model"?: string }, failWith: (message: string) => never, env: Record<string, string | undefined> = process.env, entries?: Record<string, ModelEntry>): { model: Endpoint; judge: Endpoint } {
  const model = useModel(values, failWith, env, entries);
  const judge = useJudge(values, failWith, env, entries, { baseUrl: model.baseUrl, apiKey: model.apiKey });
  return { model: toEndpoint(model), judge: toEndpoint(judge) };
}

async function main(): Promise<void> {
  let values: { model?: string; "judge-model"?: string; akm?: string; corpus?: string; cases?: string; yes?: boolean; limit?: string; repeat?: string; label?: string; "sample-seed"?: string; "retrieval-only"?: boolean; semantic?: boolean; resume?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...MODEL_OPTIONS, ...JUDGE_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, "sample-seed": { type: "string" }, "retrieval-only": { type: "boolean" }, semantic: { type: "boolean" }, resume: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`longmemeval: ${(e as Error).message}\n\n${USAGE}`);
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
  if (repeat !== undefined && values.resume !== undefined) fail("--resume carries on one run, so it does not go with --repeat");
  const sampleSeed = values["sample-seed"] === undefined ? DEFAULT_SAMPLE_SEED : Number(values["sample-seed"]);
  if (!Number.isInteger(sampleSeed) || sampleSeed < 0) fail("--sample-seed must be a non-negative integer");
  if (values.resume !== undefined && corpora.length > 1) fail("--resume carries on one run, so pick one corpus with --corpus public or --corpus custom");
  const retrievalOnly = values["retrieval-only"] === true;
  const searchMode: SearchMode = values.semantic === true ? "semantic" : "keyword";
  useAkm(values, fail);
  const endpoints = retrievalOnly ? null : resolveEndpoints(values, fail);
  for (const c of corpora) {
    if (c.name === "public") continue;
    if (!existsSync(join(c.folder, DATA_FILE))) {
      fail(c.rewrite ? `the custom assets are missing (${relative(ROOT, join(c.folder, DATA_FILE))}). Make them with: ./generate-assets --only ${NAME}` : `${c.flag} needs ${DATA_FILE} in its folder, in the dataset's format`);
    }
  }
  const label = values.label ?? slug(endpoints?.model.model ?? "retrieval");
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  await confirmCases(values, endpoints === null ? [] : [{ role: "model", name: endpoints.model.model, baseUrl: endpoints.model.baseUrl }, { role: "judge", name: endpoints.judge.model, baseUrl: endpoints.judge.baseUrl }]);

  const sandbox = openSandbox(searchMode);
  try {
    const akm = new Akm(sandbox, searchMode);
    const version = await akmVersion(sandbox).catch((e: Error) => fail(e.message));
    const summaries: Summary[] = [];
    for (const c of corpora) {
      // Every run of a repeat asks the same questions of the same sandbox, which `load` empties for each question.
      await repeatRuns(repeat, label, async (runLabel) => {
        const summary = await runCorpus(c, { limit, label: runLabel, sampleSeed, resume: values.resume }, { akm, model: endpoints?.model ?? null, judge: endpoints?.judge ?? null, version });
        summaries.push(summary);
        // The summary names its folder from the repository root, and a repeat summary goes beside the folders: an absolute path says where whatever the working folder. A run with no model has none.
        return { ...summary, model: summary.model ?? undefined, results_dir: resolve(ROOT, summary.results_dir) };
      });
    }
    if (summaries.length === 2 && repeat === undefined) printSideBySide(summaries[0] as Summary, summaries[1] as Summary);
  } finally {
    removeSandbox(sandbox);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`longmemeval: ${e.message}`);
    process.exit(e.code);
  }
}
