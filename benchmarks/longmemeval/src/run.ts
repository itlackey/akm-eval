#!/usr/bin/env bun
// longmemeval: long-term chat memory question answering, with akm as the memory. Each question is
// answered twice by the same model, once with the whole chat history (without akm) and once with only
// the sessions akm retrieves (with akm), and a judge grades both. See ../README.md.
//
//   benchmarks/longmemeval/run [--corpus public|private|all] [--limit N] [--label NAME]
//                              [--sample-seed N] [--retrieval-only] [--resume DIR]

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { Akm } from "./akm.ts";
import { DATA_FILE, ensureDataset, loadQuestions, readLock, sampleQuestions, type Question, type Sample } from "./dataset.ts";
import { type ChatResult, type Endpoint, chat } from "./llm.ts";
import { type PairedDifference, type Rate, type Retrieval, type RetrievalSummary, pairedDifference, rate, retrievalMetrics, summarizeRetrieval } from "./metrics.ts";
import { type SessionView, isDecidable, isYes, judgePrompt, readerPrompt } from "./prompts.ts";

const NAME = "longmemeval";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const TOP_K = 5;
const DEFAULT_SAMPLE_SEED = 42;
const MAX_ANSWER_TOKENS = 512;
const MAX_JUDGE_TOKENS = 64;
const GIVE_UP_AFTER = 3; // questions in a row that failed the same way, before the first one that did not
const BENCHMARK_JUDGE = "gpt-4o-2024-08-06"; // the judge the benchmark's evaluate_qa.py uses for "gpt-4o"

const USAGE = `Usage: benchmarks/longmemeval/run [--corpus public|private|all] [--limit N] [--label NAME]
                                  [--sample-seed N] [--retrieval-only] [--resume DIR]

Answers LongMemEval questions with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME, twice: with
the whole chat history, and with only the sessions akm retrieves. The judge in JUDGE_BASE_URL, JUDGE_API_KEY
and JUDGE_MODEL grades both answers. Settings come from .env at the repository root.

  --corpus          public (default) fetches the pinned dataset into assets/ if it is not there. private
                    reads private/longmemeval/assets/, made by ./generate-assets. all runs both and prints
                    the two results side by side.
  --limit N         ask N questions, drawn at random under the sample seed in proportion to question type
  --sample-seed N   the seed of that draw (default ${DEFAULT_SAMPLE_SEED}). It is recorded in summary.json.
  --retrieval-only  no model and no judge: ingest, search, and score what akm retrieves against the
                    sessions that hold the answer
  --label NAME      names the results folder: <UTC date>-<label>. Default: the model name.
  --resume DIR      carry on a stopped run in its results folder: with the same corpus, model, judge and
                    sample settings, it asks only the questions that are not done

Needs akm on PATH, or in AKM_BIN.`;

type Corpus = "public" | "private";

class Fatal extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}
function fail(message: string, code = 2): never {
  throw new Fatal(message, code);
}

interface Arm {
  ok: boolean;
  correct: boolean | null;
  hypothesis: string | null;
  verdict: string | null;
  decidable: boolean | null;
  error: string | null;
  seconds: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  finish_reason: string | null;
  model: string | null;
  judge_model: string | null;
}

interface Row {
  question_id: string;
  question_type: string;
  abstention: boolean;
  question: string;
  expected: string;
  retrieval: Retrieval | null;
  retrieved_session_ids: string[] | null;
  retrieval_error: string | null;
  without_akm: Arm | null;
  with_akm: Arm | null;
}

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  complete: boolean;
  git_commit: string;
  model: string | null;
  judge_model: string | null;
  observed_models: string[];
  observed_judge_models: string[];
  akm_version: string;
  top_k: number;
  retrieval_only: boolean;
  dataset: Record<string, unknown>;
  sample: Omit<Sample, "items">;
  n_run: number;
  n_scored: number;
  n_errored: number;
  metrics: {
    accuracy: { without_akm: Rate & { n_errored: number }; with_akm: Rate & { n_errored: number }; difference: PairedDifference } | null;
    by_type: Record<string, { n: number; without_akm: Rate; with_akm: Rate }> | null;
    retrieval: RetrievalSummary;
  };
  judge_undecidable: number;
  notes: string[];
  results_dir: string;
}

let commit: string | undefined;
function gitCommit(): string {
  if (commit !== undefined) return commit;
  const run = (args: string[]) => Bun.spawnSync(["git", "-C", ROOT, ...args], { stderr: "ignore" });
  const head = run(["rev-parse", "--short", "HEAD"]);
  if (head.exitCode !== 0) return (commit = "unknown");
  const dirty = run(["status", "--porcelain", "--untracked-files=no"]).stdout.toString().trim() !== "";
  return (commit = head.stdout.toString().trim() + (dirty ? "-dirty" : ""));
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function makeResultsDir(parent: string, label: string): string {
  const base = join(parent, `${new Date().toISOString().slice(0, 10)}-${label}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(dir, { recursive: true });
  return dir;
}

const failedArm = (error: string, partial: Partial<Arm> = {}): Arm => ({ ok: false, correct: null, hypothesis: null, verdict: null, decidable: null, error, seconds: null, prompt_tokens: null, completion_tokens: null, finish_reason: null, model: null, judge_model: null, ...partial });

/** One answer from the model, and the judge's verdict on it. */
async function answer(prompt: string, q: Question, model: Endpoint, judge: Endpoint): Promise<Arm> {
  let reply: ChatResult;
  try {
    reply = await chat(model, prompt, { maxTokens: MAX_ANSWER_TOKENS });
  } catch (e) {
    return failedArm((e as Error).message);
  }
  const hypothesis = reply.text.trim();
  const got = { hypothesis, seconds: reply.seconds, prompt_tokens: reply.promptTokens, completion_tokens: reply.completionTokens, finish_reason: reply.finishReason, model: reply.model };
  try {
    const verdictReply = await chat(judge, judgePrompt(q.question_type, q.question, String(q.answer), hypothesis, q.question_id.endsWith("_abs")), { maxTokens: MAX_JUDGE_TOKENS });
    const verdict = verdictReply.text.trim();
    return { ...failedArm(""), ...got, ok: true, error: null, verdict: verdict.slice(0, 200), decidable: isDecidable(verdict), correct: isYes(verdict), judge_model: verdictReply.model };
  } catch (e) {
    return failedArm(`judge: ${(e as Error).message}`, got);
  }
}

interface Context {
  akm: Akm;
  model: Endpoint | null;
  judge: Endpoint | null;
}

async function ask(q: Question, ctx: Context): Promise<Row> {
  const sessions: SessionView[] = q.haystack_sessions.map((turns, i) => ({ date: q.haystack_dates[i], turns: turns.map((t) => ({ role: t.role, content: t.content })) }));
  const row: Row = { question_id: q.question_id, question_type: q.question_type, abstention: q.question_id.endsWith("_abs"), question: q.question, expected: String(q.answer), retrieval: null, retrieved_session_ids: null, retrieval_error: null, without_akm: null, with_akm: null };

  let retrieved: SessionView[] = [];
  try {
    const names = await ctx.akm.load(sessions, q.question_id);
    const hits = await ctx.akm.search(q.question, TOP_K);
    const indices = hits.map((name) => {
      const i = names.get(name);
      if (i === undefined) throw new Error(`akm returned ${name}, which this run did not add`);
      return i;
    });
    row.retrieved_session_ids = indices.map((i) => q.haystack_session_ids[i]);
    row.retrieval = retrievalMetrics(q.answer_session_ids, row.retrieved_session_ids, TOP_K);
    retrieved = indices.map((i) => sessions[i]);
  } catch (e) {
    row.retrieval_error = (e as Error).message;
  }
  if (!ctx.model || !ctx.judge) return row;

  row.without_akm = await answer(readerPrompt(sessions, q.question_date, q.question), q, ctx.model, ctx.judge);
  row.with_akm = row.retrieval_error === null ? await answer(readerPrompt(retrieved, q.question_date, q.question), q, ctx.model, ctx.judge) : failedArm(`akm: ${row.retrieval_error}`);
  return row;
}

function armStats(rows: Row[], arm: "without_akm" | "with_akm") {
  const ran = rows.filter((r) => r[arm] !== null);
  const scored = ran.filter((r) => r[arm]?.ok);
  return { ...rate(scored.filter((r) => r[arm]?.correct).length, scored.length), n_errored: ran.length - scored.length };
}

export function buildSummary(rows: Row[], ctx: { corpus: Corpus; label: string; model: Endpoint | null; judge: Endpoint | null; version: string; dataset: Record<string, unknown>; sample: Sample; dir: string; complete: boolean }): Summary {
  const retrievalOnly = ctx.model === null;
  const both = rows.filter((r) => r.without_akm?.ok && r.with_akm?.ok);
  const scoredQuestions = retrievalOnly ? rows.filter((r) => r.retrieval).length : both.length;
  const arms = rows.flatMap((r) => [r.without_akm, r.with_akm]).filter((a): a is Arm => a !== null);
  const undecidable = arms.filter((a) => a.ok && a.decidable === false).length;
  const notes: string[] = [];
  const seen = (arm: "without_akm" | "with_akm", key: "model" | "judge_model") => [...new Set(rows.map((r) => r[arm]?.[key]).filter((m): m is string => !!m))].sort();
  const observedJudges = [...new Set([...seen("without_akm", "judge_model"), ...seen("with_akm", "judge_model")])];
  if (!retrievalOnly) {
    // The name the endpoint answers with counts, since a name such as "gpt-4o" can mean any snapshot.
    const judges = observedJudges.length > 0 ? observedJudges : [ctx.judge?.model ?? ""];
    if (!judges.every((j) => j.toLowerCase() === BENCHMARK_JUDGE)) notes.push(`The judge is not ${BENCHMARK_JUDGE}, the judge the benchmark specifies (it answered as ${judges.join(", ")}). These scores are not comparable to published LongMemEval numbers.`);
    if (undecidable > 0.02 * Math.max(arms.filter((a) => a.ok).length, 1)) notes.push(`The judge gave an answer other than yes or no for ${undecidable} of ${arms.filter((a) => a.ok).length} verdicts. Use a judge that answers directly.`);
  }
  const types = [...new Set(rows.map((r) => r.question_type))].sort();
  const withType = (t: string, arm: "without_akm" | "with_akm"): Rate => {
    const scored = rows.filter((r) => r.question_type === t && r[arm]?.ok);
    return rate(scored.filter((r) => r[arm]?.correct).length, scored.length);
  };
  return {
    eval: NAME,
    corpus: ctx.corpus,
    label: ctx.label,
    date: new Date().toISOString(),
    complete: ctx.complete,
    git_commit: gitCommit(),
    model: ctx.model?.model ?? null,
    judge_model: ctx.judge?.model ?? null,
    observed_models: [...new Set([...seen("without_akm", "model"), ...seen("with_akm", "model")])],
    observed_judge_models: observedJudges,
    akm_version: ctx.version,
    top_k: TOP_K,
    retrieval_only: retrievalOnly,
    dataset: ctx.dataset,
    sample: { order: ctx.sample.order, seed: ctx.sample.seed, n: ctx.sample.n, total: ctx.sample.total, per_type: ctx.sample.per_type },
    n_run: rows.length,
    n_scored: scoredQuestions,
    n_errored: rows.length - scoredQuestions,
    metrics: {
      accuracy: retrievalOnly ? null : { without_akm: armStats(rows, "without_akm"), with_akm: armStats(rows, "with_akm"), difference: pairedDifference(both.map((r) => ({ without: !!r.without_akm?.correct, with: !!r.with_akm?.correct }))) },
      by_type: retrievalOnly ? null : Object.fromEntries(types.map((t) => [t, { n: rows.filter((r) => r.question_type === t).length, without_akm: withType(t, "without_akm"), with_akm: withType(t, "with_akm") }])),
      retrieval: summarizeRetrieval(rows.flatMap((r) => (r.retrieval ? [r.retrieval] : [])), TOP_K),
    },
    judge_undecidable: undecidable,
    notes,
    results_dir: ctx.dir,
  };
}

const questions = (n: number): string => `${n} question${n === 1 ? "" : "s"}`;
const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const fixed = (x: number | null): string => (x === null ? "n/a" : x.toFixed(2));
const points = (x: number | null): string => (x === null ? "n/a" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)} points`);

function printSummary(s: Summary): void {
  const r = s.metrics.retrieval;
  console.log(`\n${NAME} (${s.corpus}) | ${s.n_run} of ${s.sample.total} questions | model ${s.model ?? "none"} | judge ${s.judge_model ?? "none"} | akm ${s.akm_version}`);
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
  console.log(`  retrieval    top ${r.k}: hit ${pct(r.hit_rate)}, recall ${fixed(r.recall)}, precision ${fixed(r.precision)}, mrr ${fixed(r.mrr)}, ndcg ${fixed(r.ndcg)}, no results ${pct(r.zero_hit_rate)} (${questions(r.n)})`);
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
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

/**
 * The rows of an earlier run in `dir` that need no redoing, for --resume. The run must be the same one: the
 * same corpus, model, judge, akm, dataset and sample. A question with an arm that errored is asked again.
 */
export function resumableRows(dir: string, now: { corpus: Corpus; model: Endpoint | null; judge: Endpoint | null; dataset: Record<string, unknown>; sample: Sample; version: string }): Row[] {
  const summaryPath = join(dir, "summary.json");
  if (!existsSync(summaryPath)) fail(`${dir} has no summary.json, so it is not a run to resume`);
  const prior = JSON.parse(readFileSync(summaryPath, "utf8")) as Summary;
  const same: [string, unknown, unknown][] = [
    ["corpus", prior.corpus, now.corpus],
    ["model", prior.model, now.model?.model ?? null],
    ["judge", prior.judge_model, now.judge?.model ?? null],
    ["akm version", prior.akm_version, now.version],
    ["dataset", JSON.stringify(prior.dataset), JSON.stringify(now.dataset)],
    ["sample seed", prior.sample.seed, now.sample.seed],
    ["sample size", prior.sample.n, now.sample.n],
  ];
  for (const [what, was, is] of same) if (was !== is) fail(`${dir} was run with a different ${what} (${was}, now ${is}). Run again with the same settings, or without --resume.`);
  const lines = readFileSync(join(dir, "samples.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "");
  const rows: Row[] = [];
  for (const [i, line] of lines.entries()) {
    try {
      rows.push(JSON.parse(line) as Row);
    } catch {
      if (i < lines.length - 1) fail(`${join(dir, "samples.jsonl")} line ${i + 1} is not valid JSON`);
    }
  }
  return rows.filter((r) => r.retrieval !== null && (now.model === null || (r.without_akm?.ok === true && r.with_akm?.ok === true)));
}

export async function runCorpus(
  corpus: Corpus,
  args: { limit?: number; label: string; sampleSeed: number; resume?: string },
  ctx: Context & { version: string },
  folders = {
    assets: corpus === "public" ? join(EVAL_DIR, "assets") : join(ROOT, "private", NAME, "assets"),
    results: corpus === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"),
  },
): Promise<Summary> {
  const { assets, results: parent } = folders;
  let dataset: Record<string, unknown>;
  if (corpus === "public") {
    const lock = readLock(assets);
    dataset = { name: lock.dataset, source: lock.source, licence: lock.licence, revision: lock.revision, file: DATA_FILE, sha256: lock.files[DATA_FILE].sha256 };
  } else {
    dataset = { ...JSON.parse(readFileSync(join(assets, "rewrite.json"), "utf8")), file: DATA_FILE };
  }
  const path = corpus === "public" ? await ensureDataset(assets) : join(assets, DATA_FILE);
  const sample = sampleQuestions(loadQuestions(path), args.limit, args.sampleSeed);
  const rows: Row[] = [];
  let dir: string;
  if (args.resume === undefined) {
    dir = makeResultsDir(parent, args.label);
    writeFileSync(join(dir, "samples.jsonl"), "");
  } else {
    dir = resolve(args.resume);
    rows.push(...resumableRows(dir, { corpus, model: ctx.model, judge: ctx.judge, dataset, sample, version: ctx.version }));
    writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  }
  const samples = join(dir, "samples.jsonl");
  console.log(`${NAME} (${corpus}): ${sample.n} of ${sample.total} questions${sample.seed === null ? "" : `, drawn with sample seed ${sample.seed}`}${rows.length > 0 ? `, ${rows.length} already done` : ""}`);
  if (ctx.model && sample.n > 50) console.log("  Each question sends the whole history, about 115k tokens, in the without-akm arm. Use --limit for a shorter run.");

  const base = { corpus, label: args.label, model: ctx.model, judge: ctx.judge, version: ctx.version, dataset, sample, dir: relative(ROOT, dir) };
  const save = (complete: boolean) => {
    const summary = buildSummary(rows, { ...base, complete });
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
  const done = new Set(rows.map((r) => r.question_id));
  for (const q of sample.items) {
    if (done.has(q.question_id)) continue;
    const row = await ask(q, ctx);
    rows.push(row);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    save(false);
    const word = (a: Arm | null) => (a === null ? "-" : a.ok ? (a.correct ? "correct" : "wrong") : "error");
    const seconds = (a: Arm | null) => (a?.seconds === null || a === null ? "" : ` ${a.seconds}s`);
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
  const summary = save(gaveUp === undefined && rows.length === sample.n);
  printSummary(summary);
  if (gaveUp !== undefined) {
    if (gaveUpOn === "akm") fail(`akm could not search the first ${GIVE_UP_AFTER} questions, so the run stopped. Last error: ${gaveUp}\nCheck that \`${process.env.AKM_BIN?.trim() || "akm"} index\` and \`search\` work.`, 1);
    fail(`the first ${GIVE_UP_AFTER} questions could not be answered and graded, so the run stopped. Last error: ${gaveUp}\nCheck the MODEL_ and JUDGE_ settings in .env, and the context size of the model server: the whole history is about 115k tokens.`, 1);
  }
  return summary;
}

function endpointFromEnv(prefix: "MODEL" | "JUDGE", modelVar: "MODEL_NAME" | "JUDGE_MODEL"): Endpoint {
  const baseUrl = process.env[`${prefix}_BASE_URL`]?.trim();
  const model = process.env[modelVar]?.trim();
  if (!baseUrl || !model) fail(`set ${prefix}_BASE_URL and ${modelVar} in .env (and ${prefix}_API_KEY if the endpoint needs one). See .env.example.`);
  return { baseUrl: baseUrl as string, model: model as string, apiKey: process.env[`${prefix}_API_KEY`]?.trim() ?? "" };
}

async function main(): Promise<void> {
  let values: { corpus?: string; limit?: string; label?: string; "sample-seed"?: string; "retrieval-only"?: boolean; resume?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, label: { type: "string" }, "sample-seed": { type: "string" }, "retrieval-only": { type: "boolean" }, resume: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`longmemeval: ${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "private" && corpus !== "all") fail(`--corpus must be public, private or all, not "${corpus}"`);
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) fail("--limit must be a positive integer");
  const sampleSeed = values["sample-seed"] === undefined ? DEFAULT_SAMPLE_SEED : Number(values["sample-seed"]);
  if (!Number.isInteger(sampleSeed) || sampleSeed < 0) fail("--sample-seed must be a non-negative integer");
  const corpora: Corpus[] = corpus === "all" ? ["public", "private"] : [corpus];
  if (values.resume !== undefined && corpora.length > 1) fail("--resume carries on one run, so pick one corpus with --corpus public or --corpus private");
  for (const c of corpora) {
    if (c === "private" && !existsSync(join(ROOT, "private", NAME, "assets", DATA_FILE))) {
      fail(`the private assets are missing (private/${NAME}/assets/${DATA_FILE}). Make them with: ./generate-assets --only ${NAME}`);
    }
  }
  const retrievalOnly = values["retrieval-only"] === true;
  const model = retrievalOnly ? null : endpointFromEnv("MODEL", "MODEL_NAME");
  const judge = retrievalOnly ? null : endpointFromEnv("JUDGE", "JUDGE_MODEL");
  const label = values.label ?? slug(model?.model ?? "retrieval");
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const sandbox = createSandbox(NAME);
  try {
    const akm = new Akm(sandbox);
    const version = await akmVersion(sandbox).catch((e: Error) => fail(e.message));
    const summaries: Summary[] = [];
    for (const c of corpora) summaries.push(await runCorpus(c, { limit, label, sampleSeed, resume: values.resume }, { akm, model, judge, version }));
    if (summaries.length === 2) printSideBySide(summaries[0], summaries[1]);
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
