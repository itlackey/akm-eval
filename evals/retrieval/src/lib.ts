// Pure helpers for the retrieval eval: the queries and the judgments, the pool, the judge's prompt, scoring.
// run.ts, label.ts and generate.ts use them.

import { type Retrieval, mean, retrievalMetrics } from "../../../lib/ir.ts";

export const NON_TASK_KINDS = ["chitchat", "notification", "log", "status"];

/** The grade from which an asset counts as relevant: 2 is "relevant and clearly useful". */
export const RELEVANT = 2;
/** How many results the eval asks of search and of curate, and how deep each system goes into the label pool. */
export const DEPTH = 10;

export interface Query {
  id: string;
  query: string;
  kind: string;
  /** The assets the author expected to answer a task query, from reading the library. Empty when the library has no answer. They join the label pool and are graded like any other pooled asset. */
  expected?: string[];
}

export interface Qrel {
  id: string;
  ref: string;
  grade: number;
  reason: string;
}

export const isTask = (q: Query): boolean => !NON_TASK_KINDS.includes(q.kind);

function parseLines<T>(text: string, where: string, check: (row: Record<string, unknown>) => string | null): T[] {
  const rows: T[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new Error(`${where}:${i + 1} is not valid JSON`);
    }
    const problem = check(row);
    if (problem) throw new Error(`${where}:${i + 1} ${problem}`);
    rows.push(row as T);
  });
  if (rows.length === 0) throw new Error(`${where} has no lines`);
  return rows;
}

export function parseQueries(text: string, where = "queries"): Query[] {
  const queries = parseLines<Query>(text, where, (r) => {
    for (const key of ["id", "query", "kind"]) if (typeof r[key] !== "string" || !r[key]) return `has no string "${key}"`;
    if (r.expected !== undefined && !(Array.isArray(r.expected) && r.expected.every((x) => typeof x === "string" && x))) return 'has an "expected" that is not a list of refs';
    return null;
  });
  const ids = new Set<string>();
  for (const q of queries) {
    if (ids.has(q.id)) throw new Error(`${where} has the id ${q.id} twice`);
    ids.add(q.id);
  }
  return queries;
}

export function parseQrels(text: string, where = "qrels"): Qrel[] {
  return parseLines<Qrel>(text, where, (r) => {
    if (typeof r.id !== "string" || typeof r.ref !== "string") return 'has no string "id" and "ref"';
    if (!Number.isInteger(r.grade) || (r.grade as number) < 0 || (r.grade as number) > 3) return `has grade ${JSON.stringify(r.grade)}, expected 0 to 3`;
    return null;
  });
}

/** Query id to ref to grade. A pair that appears twice keeps its last grade. */
export function gradesByQuery(qrels: Qrel[]): Map<string, Record<string, number>> {
  const by = new Map<string, Record<string, number>>();
  for (const r of qrels) {
    const grades = by.get(r.id) ?? {};
    grades[r.ref] = r.grade;
    by.set(r.id, grades);
  }
  return by;
}

/**
 * The queries a run uses. Without a limit, all of them. With one, N queries in the same task and non-task
 * proportion as the whole set, each kind taken in file order. The file is shuffled, so a prefix mixes the kinds.
 */
export function selectQueries(queries: Query[], limit?: number): Query[] {
  if (limit === undefined || limit >= queries.length) return queries;
  const task = queries.filter(isTask);
  const rest = queries.filter((q) => !isTask(q));
  const taskQuota = Math.min(task.length, Math.round((limit * task.length) / queries.length));
  const restQuota = Math.min(rest.length, limit - taskQuota);
  const picked = new Set([...task.slice(0, taskQuota), ...rest.slice(0, restQuota)]);
  return queries.filter((q) => picked.has(q));
}

/** akm names a section of an asset as `ref#section`. The eval scores assets, so the sections fold into one, at the first place. */
export function foldRefs(refs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const full of refs) {
    const ref = full.split("#")[0].trim();
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      out.push(ref);
    }
  }
  return out;
}

/** The union of the top `depth` of each ranked list, each ref once, in the order first seen. */
export function pool(lists: string[][], depth: number): string[] {
  return [...new Set(lists.flatMap((l) => l.slice(0, depth)))];
}

// The judge. The prompt is umbrela-akm-v1, the grading prompt of the lab's earlier retrieval harness: one asset at
// a time, pointwise, grades 0 to 3.

export const PROMPT_VERSION = "umbrela-akm-v1";
export const MAX_DOC_CHARS = 1500;

export const JUDGE_SYSTEM_PROMPT =
  "You are grading search-and-retrieval results for an AI coding agent's knowledge base " +
  "(the akm tool). For the given query and ONE candidate asset, grade how useful loading " +
  "this asset would be, on this scale:\n" +
  "3 = exactly the asset an agent should load for this query or task; it directly answers " +
  "or performs the request.\n" +
  "2 = relevant and clearly useful, though not the single best asset for the query.\n" +
  "1 = same general topic as the query, but would not actually help complete this specific " +
  "query or task.\n" +
  "0 = unrelated to the query.\n" +
  'Reply with ONLY a JSON object: {"grade": <integer 0-3>, "reason": "<=25 words"}.';

export const GRADE_SCHEMA = {
  type: "object",
  properties: { grade: { type: "integer", minimum: 0, maximum: 3 }, reason: { type: "string" } },
  required: ["grade", "reason"],
  additionalProperties: false,
};

export interface Asset {
  ref: string;
  type: string;
  name: string;
  description: string;
  /** The file, relative to the library. */
  path: string;
}

/** The text of an asset as the judge reads it: the body without its front matter. */
export function stripFrontmatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  return (m ? text.slice(m[0].length) : text).trim();
}

export function judgeMessages(query: string, asset: Asset, text: string): { role: "system" | "user"; content: string }[] {
  const user =
    `Query: ${query}\n\n` +
    "Candidate asset:\n" +
    `Type: ${asset.type}\n` +
    `Ref: ${asset.ref}\n` +
    `Name: ${asset.name}\n` +
    `Description: ${asset.description}\n\n` +
    `Content:\n${stripFrontmatter(text).slice(0, MAX_DOC_CHARS)}`;
  return [
    { role: "system", content: JUDGE_SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

/**
 * The grade and reason in a judge's reply, or null when the reply holds no grade from 0 to 3. A reasoning model can
 * leave its thinking in the reply, so when the whole reply is not the JSON object, the last object in it that
 * holds a grade is taken.
 */
export function parseGrade(reply: string): { grade: number; reason: string } | null {
  const cleaned = reply
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi, "")
    .trim();
  for (const candidate of [cleaned, ...(cleaned.match(/\{[^{}]*\}/g) ?? []).reverse()]) {
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const v = value as { grade?: unknown; reason?: unknown };
    const grade = Math.round(Number(v.grade));
    if (v.grade === null || v.grade === undefined || !(grade >= 0 && grade <= 3)) continue;
    return { grade, reason: String(v.reason ?? "").replace(/\s+/g, " ").trim() };
  }
  return null;
}

// Scoring.

export interface Scored {
  ndcg_10: number;
  p_5: number;
  success_5: boolean;
  mrr: number;
  recall_10: number;
  /** The share of the results among the first 10 that someone graded for this query. 1 when there are no results. */
  judged_10: number;
}

/** One query's results against its grades. Only the first 10 results count. */
export function scoreQuery(grades: Record<string, number>, refs: string[]): Scored {
  const at10: Retrieval = retrievalMetrics(grades, refs, 10, RELEVANT);
  const at5: Retrieval = retrievalMetrics(grades, refs, 5, RELEVANT);
  const top = refs.slice(0, 10);
  const judged = top.filter((r) => Object.hasOwn(grades, r)).length;
  return { ndcg_10: at10.ndcg, p_5: at5.precision, success_5: at5.hit, mrr: at10.mrr, recall_10: at10.recall, judged_10: top.length === 0 ? 1 : judged / top.length };
}

export interface SystemMetrics {
  n: number;
  ndcg_10: number | null;
  p_5: number | null;
  success_5: number | null;
  mrr: number | null;
  recall_10: number | null;
  judged_10: number | null;
}

export function summarize(rows: Scored[]): SystemMetrics {
  return {
    n: rows.length,
    ndcg_10: mean(rows.map((r) => r.ndcg_10)),
    p_5: mean(rows.map((r) => r.p_5)),
    success_5: mean(rows.map((r) => (r.success_5 ? 1 : 0))),
    mrr: mean(rows.map((r) => r.mrr)),
    recall_10: mean(rows.map((r) => r.recall_10)),
    judged_10: mean(rows.map((r) => r.judged_10)),
  };
}

export interface Abstention {
  n: number;
  /** How many of the n got no result at all. */
  abstained: number;
  rate: number | null;
}

export function abstention(returned: number[]): Abstention {
  const abstained = returned.filter((n) => n === 0).length;
  return { n: returned.length, abstained, rate: returned.length === 0 ? null : Number((abstained / returned.length).toFixed(4)) };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
export const fixed = (x: number | null): string => (x === null ? "n/a" : x.toFixed(3));
