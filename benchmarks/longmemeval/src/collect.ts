// The collector of the longmemeval benchmark: for one question, the sessions go into akm as memories, akm searches them with the question,
// the model answers twice (with the whole history and with only the sessions akm returned), and the judge grades both answers. It builds
// each question's row from what came back with the scorer's `makeRow`. It is the COLLECTOR part of the benchmark's measurement (see
// measurement.ts and lib/manifest.ts): the akm config of the sandbox, the commands, the prompts the model and the judge are sent, and
// what is recorded of their answers. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { type Sandbox, createSandbox } from "../../../lib/akm/akm.ts";
import { Akm, type SearchMode, isAkmTimeout, overProjectionLimit } from "./akm.ts";
import type { Question } from "./dataset.ts";
import { type CallUsage, type ChatResult, type Endpoint, ChatError, chat, temperatureOf, tokenLimit } from "./llm.ts";
import { type SessionView, isAbstentionQuestion, judgePrompt, readerPrompt, stripReasoning } from "./prompts.ts";
import { type Raw, type RawArm, type Row, makeRow, isDecidable } from "./score.ts";

export const NAME = "longmemeval";

/** How many sessions akm is asked for, and the reader is given. */
export const TOP_K = 5;
export const MAX_ANSWER_TOKENS = 512;
export const MAX_JUDGE_TOKENS = 10; // the benchmark's own: evaluate_qa.py asks the judge for 10 tokens

/** The sessions go to the reader in the order of the haystack, as the baseline reads them, and not in akm's rank order. */
export const READER_ORDER = "haystack";

/** The temperature of the reader and of the judge, and their token limits, as a run sends them and summary.json holds them. A run with no model sends nothing. */
export const sampling = (retrievalOnly: boolean, model: Endpoint | null = null, judge: Endpoint | null = null) => ({
  temperature: retrievalOnly ? null : temperatureOf(model),
  judge_temperature: retrievalOnly ? null : temperatureOf(judge),
  max_tokens: retrievalOnly ? null : { model: tokenLimit(model, MAX_ANSWER_TOKENS), judge: tokenLimit(judge, MAX_JUDGE_TOKENS) },
});

/** The sandbox a run asks its questions in: akm's own config and folders, with its built-in embedder when the search is semantic. */
export const openSandbox = (mode: SearchMode): Sandbox => createSandbox(NAME, mode === "semantic" ? { semantic: true } : {});

const failedArm = (error: string, partial: Partial<RawArm> = {}): RawArm => ({ hypothesis: null, verdict: null, error, seconds: null, prompt_tokens: null, completion_tokens: null, finish_reason: null, model: null, judge_model: null, ...partial });

/** What the judge made of one answer. */
export type Grade =
  /** The judge call itself failed (a request that did not return), so there is no reply to read. */
  | { failed: string; judge_usage?: CallUsage }
  /** A reply. `error` says why it is not a verdict (it is not exactly yes or no); null for a verdict. */
  | { failed: null; error: string | null; verdict: string; judge_model: string | null; judge_usage: CallUsage | null; judge_cached: boolean };

/**
 * The judge's verdict on an answer, with the benchmark's grading prompt for the question's type. The judge is sent the answer without its
 * reasoning. Identical prompts share one verdict through `cache`, and the reuse is `judge_cached`. A reply that is not exactly yes or no
 * is a grading error, and the answer is not scored.
 */
export async function grade(q: Pick<Question, "question_type" | "question_id" | "question" | "answer">, hypothesis: string, judge: Endpoint, cache: Map<string, ChatResult>): Promise<Grade> {
  try {
    const prompt = judgePrompt(q.question_type, q.question, String(q.answer), hypothesis, isAbstentionQuestion(q.question_id));
    const key = JSON.stringify([judge.baseUrl, judge.model, judge.chat, prompt]);
    const cached = cache.get(key);
    const verdictReply = cached ?? await chat(judge, prompt, { maxTokens: MAX_JUDGE_TOKENS });
    cache.set(key, verdictReply);
    // A judge that thinks first is read as the reader is: by what follows its reasoning. A reply that is only reasoning has no verdict, and the error shows how it began.
    const verdict = stripReasoning(verdictReply.text).slice(0, 200);
    const said = verdict || verdictReply.text.trim().slice(0, 200);
    return { failed: null, error: isDecidable(verdict) ? null : `judge: undecidable verdict: ${said}${verdictReply.finishReason === "length" ? " (cut off at the token limit)" : ""}`,
      verdict, judge_model: verdictReply.model, judge_usage: cached ? null : verdictReply.usage, judge_cached: !!cached };
  } catch (e) {
    return { failed: `judge: ${(e as Error).message}`, ...(e instanceof ChatError ? { judge_usage: e.usage } : {}) };
  }
}

/** One answer from the model, and the judge's verdict on it. */
async function answer(prompt: string, q: Question, model: Endpoint, judge: Endpoint, cache: Map<string, ChatResult>): Promise<RawArm> {
  let reply: ChatResult;
  try {
    reply = await chat(model, prompt, { maxTokens: MAX_ANSWER_TOKENS });
  } catch (e) {
    return failedArm((e as Error).message, e instanceof ChatError ? { reader_usage: e.usage } : {});
  }
  // The judge is sent the answer without its reasoning. A reply that was only reasoning (a thinking model cut off at the token limit) has
  // no answer: it is recorded as empty, the judge is not asked about it, and the scorer counts it wrong.
  const hypothesis = stripReasoning(reply.text);
  const got = { hypothesis, seconds: reply.seconds, prompt_tokens: reply.promptTokens, completion_tokens: reply.completionTokens, finish_reason: reply.finishReason, model: reply.model, reader_usage: reply.usage };
  if (hypothesis === "") return { ...failedArm(""), ...got, error: null };
  const graded = await grade(q, hypothesis, judge, cache);
  if (graded.failed !== null) return failedArm(graded.failed, { ...got, ...(graded.judge_usage ? { judge_usage: graded.judge_usage } : {}) });
  return { ...failedArm(""), ...got, error: graded.error, verdict: graded.verdict, judge_model: graded.judge_model, judge_usage: graded.judge_usage, judge_cached: graded.judge_cached };
}

export interface Context {
  akm: Akm;
  model: Endpoint | null;
  judge: Endpoint | null;
  judgeCache?: Map<string, ChatResult>;
}

/** Asks one question, and returns its scored row. A run with no model or no judge only searches. */
export async function collectQuestion(q: Question, ctx: Context): Promise<Row> {
  const cache = ctx.judgeCache ?? new Map<string, ChatResult>();
  const sessions: SessionView[] = q.haystack_sessions.map((turns, i) => ({ date: q.haystack_dates[i], turns: turns.map((t) => ({ role: t.role, content: t.content })) }));
  const raw: Raw = { n_sessions: sessions.length, sessions_over_projection_limit: overProjectionLimit(sessions), retrieved_session_ids: null, retrieval_error: null, timed_out: false, without_akm: null, with_akm: null };

  let retrieved: SessionView[] = [];
  try {
    const names = await ctx.akm.load(sessions, q.question_id);
    const hits = await ctx.akm.search(q.question, TOP_K);
    const indices = hits.map((name) => {
      const i = names.get(name);
      if (i === undefined) throw new Error(`akm returned ${name}, which this run did not add`);
      return i;
    });
    raw.retrieved_session_ids = indices.map((i) => q.haystack_session_ids[i]);
    // The baseline reads the haystack in its order, so the reader gets these sessions in that order too and not by rank.
    // The order is signal for a question about what changed or came first. A session akm returned twice is read once.
    retrieved = [...new Set(indices)].sort((a, b) => a - b).map((i) => sessions[i]);
  } catch (e) {
    raw.retrieval_error = (e as Error).message;
    raw.timed_out = isAkmTimeout(raw.retrieval_error);
  }
  if (ctx.model && ctx.judge) {
    raw.without_akm = await answer(readerPrompt(sessions, q.question_date, q.question), q, ctx.model, ctx.judge, cache);
    raw.with_akm = raw.retrieval_error === null ? await answer(readerPrompt(retrieved, q.question_date, q.question), q, ctx.model, ctx.judge, cache) : failedArm(`akm: ${raw.retrieval_error}`);
  }
  return makeRow(q, raw);
}
