import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { READER_INSTRUCTION } from "../../../benchmarks/longmemeval/src/prompts.ts";
import { loadCases, type Case } from "./inputs.ts";
import { type LmeCase, isLmeCase, loadLmeCases } from "./lme.ts";
import { type LmeRaw, type LmeRow, isLmeRow, lmeErrored, lmeRawOf, lmeUnfinished, makeLmeRow, summarizeLme } from "./lme-score.ts";
import { PROMPT } from "./protocol.ts";
import { type Raw, type Row, errored, unfinished, makeRow, rawOf, summarize } from "./score.ts";

type AnyCase = Case | LmeCase;
type AnyRaw = Raw | LmeRaw;
type AnyRow = Row | LmeRow;

/**
 * Two kinds of case: the 24 public synthetic ones (exact-scored, three arms at one budget) and LongMemEval ones (`--split`: judged, three
 * arms at several budgets). A saved run holds one kind; the summary's `case_source` says which, and each row says its own.
 */
export const MEASUREMENT: Measurement<AnyCase, AnyRaw, AnyRow> = {
  eval: "memory-utility", version: "0.2",
  loadCases(root, summary) {
    if (summary.case_source === "longmemeval") return loadLmeCases(root, summary);
    if (summary.corpus === "public") return loadCases(join(root, "evals/memory-utility/assets"));
    if (summary.corpus !== "custom" || typeof summary.corpus_folder !== "string") throw new Error("custom memory-utility corpus needs --cases DIR");
    return loadCases(resolve(root, summary.corpus_folder));
  },
  caseId: c => c.id,
  input: c => isLmeCase(c) ? { source: "longmemeval", notes: c.notes, question: c.question, question_date: c.question_date, prompt: READER_INSTRUCTION }
    : { notes: c.notes, common: c.common, question: c.question, fields: Object.keys(c.fields).sort(), prompt: PROMPT },
  labels: c => isLmeCase(c) ? { category: c.category, answer: c.answer, abstention: c.abstention, evidence_ids: c.evidence_ids, evidence_turns: c.evidence_turns }
    : { category: c.category, fields: c.fields },
  rawOf: row => isLmeRow(row) ? lmeRawOf(row) : rawOf(row),
  score: (c, raw) => isLmeCase(c) ? makeLmeRow(c, raw as LmeRaw) : makeRow(c as Case, raw as Raw),
  errored: row => isLmeRow(row) ? lmeErrored(row) : errored(row as Row),
  unfinished: row => isLmeRow(row) ? lmeUnfinished(row) : unfinished(row as Row),
  summarize: rows => rows.some(isLmeRow) ? summarizeLme(rows as LmeRow[]) : summarize(rows as Row[]),
};
