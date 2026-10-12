// The collector of the longmemeval benchmark: for one question, the sessions go into akm as memories, akm searches them with the question,
// the model answers twice (with the whole history and with only the sessions akm returned), and the judge grades both answers. It builds
// each question's row from what came back with the scorer's `makeRow`. It is the COLLECTOR part of the benchmark's measurement (see
// measurement.ts and lib/manifest.ts): the akm config of the sandbox, the commands, the prompts the model and the judge are sent, and
// what is recorded of their answers. The scoring is score.ts.
//
// A change to this file, or to the files it imports (akm.ts, llm.ts, prompts.ts, lib/akm), changes what akm, the model or the judge is
// asked, or what is recorded of the answer. Raw outputs from before the change are no longer comparable with raw outputs after it. It is a
// measurement change: bump the collector in MEASUREMENT.lock (scripts/measurement/run bump longmemeval collector --reason "...") in the
// same change.

import { type Sandbox, createSandbox } from "../../../lib/akm/akm.ts";
import { Akm, type SearchMode, isAkmTimeout, overProjectionLimit } from "./akm.ts";
import type { Question } from "./dataset.ts";
import { type ChatResult, type Endpoint, TEMPERATURE, chat } from "./llm.ts";
import { type SessionView, isAbstentionQuestion, judgePrompt, readerPrompt } from "./prompts.ts";
import { type Raw, type RawArm, type Row, makeRow } from "./score.ts";

export const NAME = "longmemeval";

/** How many sessions akm is asked for, and the reader is given. */
export const TOP_K = 5;
export const MAX_ANSWER_TOKENS = 512;
export const MAX_JUDGE_TOKENS = 10; // the benchmark's own: evaluate_qa.py asks the judge for 10 tokens

/** The sessions go to the reader in the order of the haystack, as the baseline reads them, and not in akm's rank order. */
export const READER_ORDER = "haystack";

/** The temperature and token limits a run sends, as summary.json holds them. A run with no model sends nothing. */
export const sampling = (retrievalOnly: boolean) => ({ temperature: retrievalOnly ? null : TEMPERATURE, max_tokens: retrievalOnly ? null : { model: MAX_ANSWER_TOKENS, judge: MAX_JUDGE_TOKENS } });

/** The sandbox a run asks its questions in: akm's own config and folders, with its built-in embedder when the search is semantic. */
export const openSandbox = (mode: SearchMode): Sandbox => createSandbox(NAME, mode === "semantic" ? { semantic: true } : {});

const failedArm = (error: string, partial: Partial<RawArm> = {}): RawArm => ({ hypothesis: null, verdict: null, error, seconds: null, prompt_tokens: null, completion_tokens: null, finish_reason: null, model: null, judge_model: null, ...partial });

/** One answer from the model, and the judge's verdict on it. */
async function answer(prompt: string, q: Question, model: Endpoint, judge: Endpoint): Promise<RawArm> {
  let reply: ChatResult;
  try {
    reply = await chat(model, prompt, { maxTokens: MAX_ANSWER_TOKENS });
  } catch (e) {
    return failedArm((e as Error).message);
  }
  const hypothesis = reply.text.trim();
  const got = { hypothesis, seconds: reply.seconds, prompt_tokens: reply.promptTokens, completion_tokens: reply.completionTokens, finish_reason: reply.finishReason, model: reply.model };
  try {
    const verdictReply = await chat(judge, judgePrompt(q.question_type, q.question, String(q.answer), hypothesis, isAbstentionQuestion(q.question_id)), { maxTokens: MAX_JUDGE_TOKENS });
    return { ...failedArm(""), ...got, error: null, verdict: verdictReply.text.trim().slice(0, 200), judge_model: verdictReply.model };
  } catch (e) {
    return failedArm(`judge: ${(e as Error).message}`, got);
  }
}

export interface Context {
  akm: Akm;
  model: Endpoint | null;
  judge: Endpoint | null;
}

/** Asks one question, and returns its scored row. A run with no model or no judge only searches. */
export async function collectQuestion(q: Question, ctx: Context): Promise<Row> {
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
    raw.without_akm = await answer(readerPrompt(sessions, q.question_date, q.question), q, ctx.model, ctx.judge);
    raw.with_akm = raw.retrieval_error === null ? await answer(readerPrompt(retrieved, q.question_date, q.question), q, ctx.model, ctx.judge) : failedArm(`akm: ${raw.retrieval_error}`);
  }
  return makeRow(q, raw);
}
