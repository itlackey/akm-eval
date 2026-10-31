// The LongMemEval case source of memory-utility: a case is one LongMemEval question with its evidence sessions and K seeded distractor
// sessions from the same history, each kept whole as one memory. The dataset, the sampling, the memory text and the judge are the
// longmemeval benchmark's own; this file only picks which sessions of a question make the case and which questions are dev or held out.
// Labels (the answer, the evidence ids, the evidence turns) are carried by the case for scoring and never reach inference or the reader.

import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { DATA_FILE, type Question, QUESTION_TYPES, loadQuestions, mulberry32, sampleQuestions } from "../../../benchmarks/longmemeval/src/dataset.ts";
import { memoryText, overProjectionLimit } from "../../../benchmarks/longmemeval/src/akm.ts";
import { READER_INSTRUCTION, type SessionView, isAbstentionQuestion } from "../../../benchmarks/longmemeval/src/prompts.ts";
import type { Packed } from "./protocol.ts";

/** The salt of the split. Fixed and public: the split is a procedure, not a secret. A new salt is a new split, and needs a new pre-registration. */
export const SPLIT_SALT = "akm-eval/memory-utility/longmemeval-split/v1";
/** The size of the dev split. The rest of the 500 questions are held out. */
export const DEV_QUESTIONS = 100;
/** The seed of the draw of the questions (the benchmark's own default), from which each question's distractor seed is derived. */
export const DEFAULT_SAMPLE_SEED = 42;
/** Distractor sessions per question, and the memory budgets (estimated tokens) every case is read at. */
export const DEFAULT_HAYSTACK = 16;
export const DEFAULT_BUDGETS = [4096, 8192];
/** The budget of the primary comparison. The others are secondary. */
export const PRIMARY_BUDGET = 4096;

export type Split = "dev" | "heldout";

const hash = (text: string): string => createHash("sha256").update(text).digest("hex");

/**
 * The dev and held-out questions. Each question type gives dev its share of `devSize` (largest remainder, ties by the order of
 * QUESTION_TYPES), and within a type the questions with the smallest sha256(salt:question_id) are dev. It depends only on the ids and
 * types, not on the order of the file, so the same split holds for the public data and for its rewrite, which keeps the ids.
 * Both lists keep the order of `questions`.
 */
export function splitQuestions(questions: Question[], salt = SPLIT_SALT, devSize = DEV_QUESTIONS): { dev: Question[]; heldout: Question[] } {
  const types = QUESTION_TYPES.filter(t => questions.some(q => q.question_type === t));
  const exact = new Map(types.map(t => [t, devSize * questions.filter(q => q.question_type === t).length / questions.length]));
  const quota = new Map(types.map(t => [t, Math.floor(exact.get(t)!)]));
  let left = devSize - [...quota.values()].reduce((a, b) => a + b, 0);
  for (const t of [...types].sort((a, b) => (exact.get(b)! - quota.get(b)!) - (exact.get(a)! - quota.get(a)!) || types.indexOf(a) - types.indexOf(b))) {
    if (left-- <= 0) break;
    quota.set(t, quota.get(t)! + 1);
  }
  const dev = new Set<string>();
  for (const t of types) {
    const ranked = questions.filter(q => q.question_type === t).map(q => ({ id: q.question_id, key: hash(`${salt}:${q.question_id}`) })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    for (const r of ranked.slice(0, quota.get(t)!)) dev.add(r.id);
  }
  return { dev: questions.filter(q => dev.has(q.question_id)), heldout: questions.filter(q => !dev.has(q.question_id)) };
}

/** The distractor seed of a question: derived from the sample seed and the question id, so a question's distractors do not depend on which others are drawn. */
export const distractorSeed = (sampleSeed: number, questionId: string): number => parseInt(hash(`${sampleSeed}:${questionId}`).slice(0, 8), 16);

/** One LongMemEval case: the memories it is made of, and the labels it is scored against. */
export interface LmeCase {
  kind: "longmemeval";
  /** The question id. */
  id: string;
  /** The question type. */
  category: string;
  question: string;
  question_date: string;
  /** One memory per session, in the order of the history, as the benchmark writes them. This and the question are all inference and the reader see. */
  notes: string[];
  // ---- labels: scoring and diagnostics only ----
  answer: string;
  abstention: boolean;
  /** The haystack id of each note. */
  session_ids: string[];
  /** The ids among them that hold the answer (the dataset's answer_session_ids). */
  evidence_ids: string[];
  /** For each evidence session, its has_answer turns as `role: text` lines, as the memory writes them. A session with none is not in it. */
  evidence_turns: Record<string, string[]>;
  haystack_size: number;
  sessions_over_projection_limit: number;
}
export const isLmeCase = (c: unknown): c is LmeCase => (c as { kind?: string } | null)?.kind === "longmemeval";

/** The case of a question: its evidence sessions and `haystack` distractors drawn under the seed from its other sessions (all of them when there are fewer), in history order. */
export function buildLmeCase(q: Question, haystack: number, sampleSeed: number): LmeCase {
  const evidence = new Set(q.answer_session_ids);
  for (const id of evidence) if (!q.haystack_session_ids.includes(id)) throw new Error(`${q.question_id}: evidence session ${id} is not in its haystack`);
  const others = q.haystack_session_ids.map((id, i) => evidence.has(id) ? -1 : i).filter(i => i >= 0);
  const random = mulberry32(distractorSeed(sampleSeed, q.question_id));
  const take = Math.min(haystack, others.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (others.length - i));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  const chosen = [...q.haystack_session_ids.map((id, i) => evidence.has(id) ? i : -1).filter(i => i >= 0), ...others.slice(0, take)].sort((a, b) => a - b);
  const views: SessionView[] = chosen.map(i => ({ date: q.haystack_dates[i]!, turns: q.haystack_sessions[i]!.map(t => ({ role: t.role, content: t.content })) }));
  const evidence_turns: Record<string, string[]> = {};
  for (const i of chosen) {
    const id = q.haystack_session_ids[i]!;
    const flagged = q.haystack_sessions[i]!.filter(t => (t as { has_answer?: boolean }).has_answer === true).map(t => `${t.role}: ${t.content}`);
    if (evidence.has(id) && flagged.length) evidence_turns[id] = flagged;
  }
  return { kind: "longmemeval", id: q.question_id, category: q.question_type, question: q.question, question_date: q.question_date, notes: views.map(memoryText),
    answer: String(q.answer), abstention: isAbstentionQuestion(q.question_id), session_ids: chosen.map(i => q.haystack_session_ids[i]!),
    evidence_ids: chosen.map(i => q.haystack_session_ids[i]!).filter(id => evidence.has(id)), evidence_turns,
    haystack_size: q.haystack_sessions.length, sessions_over_projection_limit: overProjectionLimit(views) };
}

/** The cases of a run: the split's questions, `limit` of them drawn in proportion to type under the sample seed (all when there is no limit), each with its distractors. */
export function lmeCases(questions: Question[], opts: { split: Split; limit?: number; haystack: number; sampleSeed: number }) {
  const inSplit = splitQuestions(questions)[opts.split];
  const sample = sampleQuestions(inSplit, opts.limit, opts.sampleSeed);
  return { sample, cases: sample.items.map(q => buildLmeCase(q, opts.haystack, opts.sampleSeed)) };
}

/** What the reader is sent: the benchmark's instruction, the packed memory in place of the history chats, the date and the question. No label is in it. */
export function lmePrompt(c: Pick<LmeCase, "question" | "question_date">, memory: Packed): string {
  return [READER_INSTRUCTION, "", "History Chats:", "", memory.text.trim() ? memory.text : "(there are no chats)", "", `Current Date: ${c.question_date}`, `Question: ${c.question}`, "Answer:"].join("\n");
}

/**
 * The cases a saved LongMemEval run was made of, from the settings its summary records (corpus, split, limit, haystack, sample seed), read
 * from `root`. It is how a stored run is scored again: the draw and the distractors are deterministic.
 */
export function loadLmeCases(root: string, summary: Record<string, any>): LmeCase[] {
  const folder = summary.corpus === "public" ? join(root, "benchmarks/longmemeval/assets")
    : summary.corpus === "custom" && typeof summary.corpus_folder === "string" ? resolve(root, summary.corpus_folder)
    : null;
  if (folder === null) throw new Error("the summary does not say which folder holds its LongMemEval questions (a custom corpus outside the repository is not recorded), so there are no labels to score against");
  for (const key of ["split", "haystack", "sample_seed"]) if (summary[key] === undefined) throw new Error(`the summary does not record ${key}, so its LongMemEval cases cannot be rebuilt`);
  return lmeCases(loadQuestions(join(folder, DATA_FILE)), { split: summary.split, limit: summary.limit ?? undefined, haystack: summary.haystack, sampleSeed: summary.sample_seed }).cases;
}
