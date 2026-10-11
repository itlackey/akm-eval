#!/usr/bin/env bun
// longmemeval: long-term chat memory question answering, with akm as the memory. Each question is
// answered twice by the same model, once with the whole chat history (without akm) and once with only
// the sessions akm retrieves (with akm), and a judge grades both. See ../README.md.
//
//   benchmarks/longmemeval/run [--corpus public|private|all] [--limit N] [--label NAME]
//                              [--sample-seed N] [--retrieval-only] [--semantic] [--resume DIR]

import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal, fail, gitCommit as commitOf, slug } from "../../../lib/cli.ts";
import { JUDGE_OPTIONS, MODEL_OPTIONS, type ModelEntry, type ModelSettings, judgeUsage, modelUsage, useJudge, useModel } from "../../../lib/models.ts";
import { type Retrieval, type RetrievalSummary, retrievalMetrics, summarizeRetrieval } from "../../../lib/ir.ts";
import { harnessSha256 } from "../../../lib/provenance.ts";
import { clearRunning, makeResultsDir, markRunning } from "../../../lib/results.ts";
import { Akm, PROJECTION_LIMIT, type SearchMode, isAkmTimeout, overProjectionLimit } from "./akm.ts";
import { DATA_FILE, ensureDataset, loadQuestions, readLock, sampleQuestions, type Question, type Sample } from "./dataset.ts";
import { type ChatResult, type Endpoint, TEMPERATURE, chat, endpointHost } from "./llm.ts";
import { digestFiles, readGenerated, treeProblem } from "./manifest.ts";
import { type PairedDifference, type Rate, pairedDifference, rate } from "./metrics.ts";
import { type SessionView, isDecidable, isYes, judgePrompt, readerPrompt } from "./prompts.ts";

const NAME = "longmemeval";
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
// The code this process loaded, digested once at the start: an edit made while a run goes is not what it ran.
const HARNESS = harnessSha256(import.meta.dir);
const TOP_K = 5;
const DEFAULT_SAMPLE_SEED = 42;
const MAX_ANSWER_TOKENS = 512;
const MAX_JUDGE_TOKENS = 10; // the benchmark's own: evaluate_qa.py asks the judge for 10 tokens
const GIVE_UP_AFTER = 3; // questions in a row that failed the same way, before the first one that did not
const BENCHMARK_JUDGE = "gpt-4o-2024-08-06"; // the judge the benchmark's evaluate_qa.py uses for "gpt-4o"

const USAGE = `Usage: benchmarks/longmemeval/run [--corpus public|private|all] [--limit N] [--label NAME]
                                  [--sample-seed N] [--retrieval-only] [--semantic] [--resume DIR]
                                  [--model ID] [--judge-model ID] [--akm COMMAND]

Answers LongMemEval questions with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME, twice: with
the whole chat history, and with only the sessions akm retrieves. The judge in JUDGE_BASE_URL, JUDGE_API_KEY
and JUDGE_MODEL grades both answers; a judge with no JUDGE_BASE_URL goes to the model's endpoint. Settings come from
.env at the repository root.

  --corpus          public (default) fetches the pinned dataset into assets/ if it is not there. private
                    reads private/longmemeval/assets/, made by ./generate-assets, and refuses them when
                    private/longmemeval/generated.json is missing or does not match the files, the public
                    lock or the generator. all runs both and prints the two results side by side.
  --limit N         ask N questions, drawn at random under the sample seed in proportion to question type
  --sample-seed N   the seed of that draw (default ${DEFAULT_SAMPLE_SEED}). It is recorded in summary.json as sample_seed,
                    apart from seed, the seed that made the private dataset.
  --retrieval-only  no model and no judge: ingest, search, and score what akm retrieves against the
                    sessions that hold the answer
  --semantic        search with akm's semantic search as well as its keyword index: akm embeds each question's sessions
                    with its built-in model (bge-small-en-v1.5, 133 MB, downloaded once into .cache/models/) as it
                    indexes them, so a question takes longer. A search that does not come back as semantic is an
                    errored call. Default: keyword search only. It is recorded in summary.json as search_mode.
  --label NAME      names the results folder: <UTC date>-<label>. Default: the model name.
  --resume DIR      carry on a stopped run in its results folder: with the same corpus, model, judge, endpoints,
                    akm (version, command, build and config), search mode, dataset files and sample settings, it asks
                    only the questions that are not done
${modelUsage}
${judgeUsage}
${akmUsage}

Needs akm on PATH, or in AKM_BIN.`;

type Corpus = "public" | "private";

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
  /** How many sessions the question's haystack has, and how many of them are longer than akm's keyword index keeps (PROJECTION_LIMIT). */
  n_sessions: number;
  sessions_over_projection_limit: number;
  /** Scored for every question akm searched. The means leave out the abstention questions, which have no session to find. */
  retrieval: Retrieval | null;
  /** The sessions akm returned, in its rank order. */
  retrieved_session_ids: string[] | null;
  retrieval_error: string | null;
  /** The akm call of this question timed out, which is not the same as akm failing. */
  timed_out: boolean;
  without_akm: Arm | null;
  with_akm: Arm | null;
}

interface Summary {
  eval: string;
  corpus: Corpus;
  label: string;
  date: string;
  /** True when the run asked every question it set out to. A summary written after each question says false until the last one. */
  complete: boolean;
  /** "aborted" for a run that did not finish what it set out to do, and then aborted_reason says why. A run still going, or killed, has not finished either. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  git_commit: string;
  /** A digest of the eval's source files and of the shared code in lib/ that the run used (see harnessSha256 in lib/provenance.ts). */
  harness_sha256: string;
  model: string | null;
  judge_model: string | null;
  observed_models: string[];
  observed_judge_models: string[];
  /** The host (and port) of the model's and the judge's endpoint, null when the run has no model. */
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
  dataset: Record<string, unknown>;
  /** One digest over the dataset files the run read (the lock or rewrite.json, and the questions), by name. */
  assets_sha256: string;
  /** The seed of the rewrite that made the private dataset, as a decimal string: the one in generated.json beside the assets, which is not private/seed when generate-assets ran with --seed. Null for the public corpus. */
  seed: string | null;
  /** The seed of the draw of the questions (--sample-seed), a different thing from `seed`. Null when no draw was made because every question was asked. The same number is in sample.seed. */
  sample_seed: number | null;
  sample: Omit<Sample, "items">;
  /** The sessions loaded into akm (one count per question, since every question loads its own haystack), and those over akm's keyword body cut. */
  sessions_loaded: number;
  sessions_over_projection_limit: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** Questions whose akm call timed out. They are part of n_errored. */
  timeouts: number;
  metrics: {
    accuracy: { without_akm: Rate & { n_errored: number }; with_akm: Rate & { n_errored: number }; difference: PairedDifference } | null;
    by_type: Record<string, { n: number; without_akm: Rate; with_akm: Rate }> | null;
    /** Over the questions with an answer in the history. The abstention questions are counted in retrieval_abstention and left out. */
    retrieval: RetrievalSummary;
    retrieval_abstention: { n: number };
  };
  judge_undecidable: number;
  notes: string[];
  results_dir: string;
}

let commit: string | undefined;
const gitCommit = (): string => (commit ??= commitOf(ROOT)); // asked once: the summary is written after every question

/** The benchmark's rule for an abstention question, from evaluate_qa.py and print_retrieval_metrics.py: "_abs" is somewhere in the question id. */
export const isAbstention = (questionId: string): boolean => questionId.includes("_abs");

/** Why a summary that is not complete says aborted when nothing gave up: the run was cut short, or is still going and writes it again after the next question. */
const UNFINISHED = "the run had not asked every question when this summary was written";

/** The sessions go to the reader in the order of the haystack, as the baseline reads them, and not in akm's rank order. */
const READER_ORDER = "haystack";

/** The temperature and token limits a run sends, as summary.json holds them. A run with no model sends nothing. */
const sampling = (retrievalOnly: boolean) => ({ temperature: retrievalOnly ? null : TEMPERATURE, max_tokens: retrievalOnly ? null : { model: MAX_ANSWER_TOKENS, judge: MAX_JUDGE_TOKENS } });

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
    const verdictReply = await chat(judge, judgePrompt(q.question_type, q.question, String(q.answer), hypothesis, isAbstention(q.question_id)), { maxTokens: MAX_JUDGE_TOKENS });
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
  const row: Row = { question_id: q.question_id, question_type: q.question_type, abstention: isAbstention(q.question_id), question: q.question, expected: String(q.answer), n_sessions: sessions.length, sessions_over_projection_limit: overProjectionLimit(sessions), retrieval: null, retrieved_session_ids: null, retrieval_error: null, timed_out: false, without_akm: null, with_akm: null };

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
    // The baseline reads the haystack in its order, so the reader gets these sessions in that order too and not by rank.
    // The order is signal for a question about what changed or came first. A session akm returned twice is read once.
    retrieved = [...new Set(indices)].sort((a, b) => a - b).map((i) => sessions[i]);
  } catch (e) {
    row.retrieval_error = (e as Error).message;
    row.timed_out = isAkmTimeout(row.retrieval_error);
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

type Build = ReturnType<typeof akmBuild>;

export function buildSummary(rows: Row[], ctx: { corpus: Corpus; label: string; model: Endpoint | null; judge: Endpoint | null; version: string; build: Build; searchMode: SearchMode; config: unknown; dataset: Record<string, unknown>; assets_sha256: string; seed: string | null; sample: Sample; dir: string; complete: boolean; abortedReason?: string }): Summary {
  const retrievalOnly = ctx.model === null;
  const both = rows.filter((r) => r.without_akm?.ok && r.with_akm?.ok);
  const scoredQuestions = retrievalOnly ? rows.filter((r) => r.retrieval).length : both.length;
  const arms = rows.flatMap((r) => [r.without_akm, r.with_akm]).filter((a): a is Arm => a !== null);
  const undecidable = arms.filter((a) => a.ok && a.decidable === false).length;
  const timeouts = rows.filter((r) => r.timed_out === true).length;
  const searched = rows.filter((r) => r.retrieval !== null);
  const notes: string[] = [];
  const seen = (arm: "without_akm" | "with_akm", key: "model" | "judge_model") => [...new Set(rows.map((r) => r[arm]?.[key]).filter((m): m is string => !!m))].sort();
  const observedJudges = [...new Set([...seen("without_akm", "judge_model"), ...seen("with_akm", "judge_model")])];
  if (!retrievalOnly) {
    // The name the endpoint answers with counts, since a name such as "gpt-4o" can mean any snapshot.
    const judges = observedJudges.length > 0 ? observedJudges : [ctx.judge?.model ?? ""];
    if (!judges.every((j) => j.toLowerCase() === BENCHMARK_JUDGE)) notes.push(`The judge is not ${BENCHMARK_JUDGE}, the judge the benchmark specifies (it answered as ${judges.join(", ")}). These scores are not comparable to published LongMemEval numbers.`);
    if (undecidable > 0.02 * Math.max(arms.filter((a) => a.ok).length, 1)) notes.push(`The judge gave an answer other than yes or no for ${undecidable} of ${arms.filter((a) => a.ok).length} verdicts. Use a judge that answers directly.`);
  }
  if (timeouts > 0) notes.push(`akm timed out on ${timeouts} of ${rows.length} questions (an index or a search took longer than its limit), and they count as errored. A slower akm shows up here.`);
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
    status: ctx.complete ? "complete" : "aborted",
    aborted_reason: ctx.complete ? null : (ctx.abortedReason ?? UNFINISHED),
    git_commit: gitCommit(),
    harness_sha256: HARNESS,
    model: ctx.model?.model ?? null,
    judge_model: ctx.judge?.model ?? null,
    observed_models: [...new Set([...seen("without_akm", "model"), ...seen("with_akm", "model")])],
    observed_judge_models: observedJudges,
    model_endpoint: ctx.model ? endpointHost(ctx.model.baseUrl) : null,
    judge_endpoint: ctx.judge ? endpointHost(ctx.judge.baseUrl) : null,
    ...sampling(retrievalOnly),
    akm_version: ctx.version,
    ...ctx.build,
    top_k: TOP_K,
    search_mode: ctx.searchMode,
    config: ctx.config,
    reader_order: READER_ORDER,
    retrieval_only: retrievalOnly,
    dataset: ctx.dataset,
    assets_sha256: ctx.assets_sha256,
    seed: ctx.seed,
    sample_seed: ctx.sample.seed,
    sample: { order: ctx.sample.order, seed: ctx.sample.seed, n: ctx.sample.n, total: ctx.sample.total, per_type: ctx.sample.per_type },
    sessions_loaded: rows.reduce((n, r) => n + (r.n_sessions ?? 0), 0),
    sessions_over_projection_limit: rows.reduce((n, r) => n + (r.sessions_over_projection_limit ?? 0), 0),
    n_run: rows.length,
    n_scored: scoredQuestions,
    n_errored: rows.length - scoredQuestions,
    timeouts,
    metrics: {
      accuracy: retrievalOnly ? null : { without_akm: armStats(rows, "without_akm"), with_akm: armStats(rows, "with_akm"), difference: pairedDifference(both.map((r) => ({ without: !!r.without_akm?.correct, with: !!r.with_akm?.correct }))) },
      by_type: retrievalOnly ? null : Object.fromEntries(types.map((t) => [t, { n: rows.filter((r) => r.question_type === t).length, without_akm: withType(t, "without_akm"), with_akm: withType(t, "with_akm") }])),
      // Upstream leaves the abstention questions out of retrieval: they have no session to find. Their count is all that is kept.
      retrieval: summarizeRetrieval(searched.flatMap((r) => (r.abstention || !r.retrieval ? [] : [r.retrieval])), TOP_K),
      retrieval_abstention: { n: searched.filter((r) => r.abstention).length },
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
  console.log(`\n${NAME}: public and private side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`);
}

/**
 * The rows of an earlier run in `dir` that need no redoing, for --resume. The run must be the same one: the same corpus,
 * model, judge and the hosts they are called at, akm (version, command, build with the fingerprint of its uncommitted changes, and
 * config), search mode, dataset, the digest of its files and sample. A question with an arm that errored is asked again.
 */
export function resumableRows(dir: string, now: { corpus: Corpus; model: Endpoint | null; judge: Endpoint | null; dataset: Record<string, unknown>; assets_sha256: string; sample: Sample; version: string; build: Build; searchMode: SearchMode; config: unknown }): Row[] {
  const summaryPath = join(dir, "summary.json");
  if (!existsSync(summaryPath)) fail(`${dir} has no summary.json, so it is not a run to resume`);
  const prior = JSON.parse(readFileSync(summaryPath, "utf8")) as Summary;
  // A summary without a search mode, a config or a digest is from before the summary held the endpoints, the sampling settings and the inputs, and before the reader got the sessions in the haystack's order.
  if (prior.search_mode === undefined || prior.config === undefined || prior.assets_sha256 === undefined) fail(`${dir} was run by an older version of this eval, whose rows are not comparable to the ones it would add. Run again without --resume.`);
  const host = (e: Endpoint | null) => (e ? endpointHost(e.baseUrl) : null);
  const settings = (retrievalOnly: boolean) => JSON.stringify(sampling(retrievalOnly));
  const same: [string, unknown, unknown][] = [
    ["corpus", prior.corpus, now.corpus],
    ["model", prior.model, now.model?.model ?? null],
    ["model endpoint", prior.model_endpoint, host(now.model)],
    ["judge", prior.judge_model, now.judge?.model ?? null],
    ["judge endpoint", prior.judge_endpoint, host(now.judge)],
    ["akm version", prior.akm_version, now.version],
    ["akm command", prior.akm_bin, now.build.akm_bin],
    ["akm build", prior.akm_build, now.build.akm_build],
    ["akm build fingerprint", prior.akm_build_fingerprint ?? null, now.build.akm_build_fingerprint], // two edits of one commit are two builds; a summary that predates the fingerprint has none
    ["search mode", prior.search_mode, now.searchMode],
    ["akm config", JSON.stringify(prior.config), JSON.stringify(now.config)],
    ["reader order", prior.reader_order, READER_ORDER],
    ["sampling settings", JSON.stringify({ temperature: prior.temperature, max_tokens: prior.max_tokens }), settings(now.model === null)],
    ["dataset", JSON.stringify(prior.dataset), JSON.stringify(now.dataset)],
    ["assets sha256", prior.assets_sha256, now.assets_sha256],
    ["sample seed", prior.sample.seed, now.sample.seed],
    ["sample size", prior.sample.n, now.sample.n],
  ];
  const show = (x: unknown) => (x === null ? "none" : String(x));
  for (const [what, was, is] of same) if (was !== is) fail(`${dir} was run with a different ${what} (${show(was)}, now ${show(is)}). Run again with the same settings, or without --resume.`);
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

/**
 * Why the private assets in `tree` (private/longmemeval) may not be used, or undefined when generated.json vouches for them. The
 * public lock is the one in `publicAssets`.
 */
export const privateProblem = (tree: string, publicAssets = join(EVAL_DIR, "assets"), where = relative(ROOT, tree) || tree): string | undefined => treeProblem(tree, publicAssets, where);

export async function runCorpus(
  corpus: Corpus,
  args: { limit?: number; label: string; sampleSeed: number; resume?: string },
  ctx: Context & { version: string; build?: Build },
  folders: { assets: string; results: string; publicAssets?: string } = {
    assets: corpus === "public" ? join(EVAL_DIR, "assets") : join(ROOT, "private", NAME, "assets"),
    results: corpus === "public" ? join(EVAL_DIR, "results") : join(ROOT, "private", NAME, "results"),
  },
): Promise<Summary> {
  const { assets, results: parent } = folders;
  // The private assets are used only when generated.json vouches for them. Its seed is the rewrite's seed, whatever private/seed holds now.
  let seed: string | null = null;
  if (corpus === "private") {
    const problem = privateProblem(dirname(assets), folders.publicAssets);
    if (problem !== undefined) fail(problem);
    seed = readGenerated(dirname(assets))?.seed ?? null;
  }
  const searchMode = ctx.akm.mode;
  const config = ctx.akm.config();
  const build = ctx.build ?? akmBuild();
  let dataset: Record<string, unknown>;
  if (corpus === "public") {
    const lock = readLock(assets);
    dataset = { name: lock.dataset, source: lock.source, licence: lock.licence, revision: lock.revision, file: DATA_FILE, sha256: lock.files[DATA_FILE].sha256 };
  } else {
    dataset = { ...JSON.parse(readFileSync(join(assets, "rewrite.json"), "utf8")), file: DATA_FILE };
  }
  const path = corpus === "public" ? await ensureDataset(assets) : join(assets, DATA_FILE);
  // Before the questions are read, so the file is not held twice. The private file is hashed as it is, not as rewrite.json says.
  const assets_sha256 = digestFiles(assets, [corpus === "public" ? "ASSETS.lock" : "rewrite.json", DATA_FILE]);
  const sample = sampleQuestions(loadQuestions(path), args.limit, args.sampleSeed);
  const rows: Row[] = [];
  let dir: string;
  if (args.resume === undefined) {
    dir = makeResultsDir(parent, args.label);
    writeFileSync(join(dir, "samples.jsonl"), "");
  } else {
    dir = resolve(args.resume);
    rows.push(...resumableRows(dir, { corpus, model: ctx.model, judge: ctx.judge, dataset, assets_sha256, sample, version: ctx.version, build, searchMode, config }));
    writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
    markRunning(dir); // makeResultsDir marks a new folder, so a resumed one is marked here, once it is known to be this run's
  }
  const samples = join(dir, "samples.jsonl");
  console.log(`${NAME} (${corpus}): ${sample.n} of ${sample.total} questions${sample.seed === null ? "" : `, drawn with sample seed ${sample.seed}`}${rows.length > 0 ? `, ${rows.length} already done` : ""}`);
  if (ctx.model && sample.n > 50) console.log("  Each question sends the whole history, about 115k tokens, in the without-akm arm. Use --limit for a shorter run.");

  const base = { corpus, label: args.label, model: ctx.model, judge: ctx.judge, version: ctx.version, build, searchMode, config, dataset, assets_sha256, seed, sample, dir: relative(ROOT, dir) };
  const save = (complete: boolean, abortedReason?: string) => {
    const summary = buildSummary(rows, { ...base, complete, abortedReason });
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
  let values: { model?: string; "judge-model"?: string; akm?: string; corpus?: string; limit?: string; label?: string; "sample-seed"?: string; "retrieval-only"?: boolean; semantic?: boolean; resume?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, ...MODEL_OPTIONS, ...JUDGE_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, "sample-seed": { type: "string" }, "retrieval-only": { type: "boolean" }, semantic: { type: "boolean" }, resume: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
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
    // Before the first corpus runs: under --corpus all the public run takes hours, and the private one would refuse after it.
    const problem = c === "private" ? privateProblem(join(ROOT, "private", NAME)) : undefined;
    if (problem !== undefined) fail(problem);
  }
  const retrievalOnly = values["retrieval-only"] === true;
  const searchMode: SearchMode = values.semantic === true ? "semantic" : "keyword";
  useAkm(values, fail);
  const { model, judge } = retrievalOnly ? { model: null, judge: null } : resolveEndpoints(values, fail);
  const label = values.label ?? slug(model?.model ?? "retrieval");
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const sandbox = createSandbox(NAME, searchMode === "semantic" ? { semantic: true } : {});
  try {
    const akm = new Akm(sandbox, searchMode);
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
