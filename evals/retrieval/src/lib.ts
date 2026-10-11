// Pure helpers for the retrieval eval: the queries and the judgments, the pool, the judge's prompt, scoring.
// run.ts, label.ts and generate.ts use them.

import { type Retrieval, mean, retrievalMetrics } from "../../../lib/ir.ts";
import { sha256Text } from "../../../lib/provenance.ts";

export const NON_TASK_KINDS = ["chitchat", "notification", "log", "status", "nontask"];

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
  /** The asset must never rank above a relevant one: a decoy, or an asset that is out of date. It has grade 0. */
  banned?: boolean;
  // Where a grade came from. label writes these four; a row made before it did has none of them, and a set of your own may leave them out.
  /** The judge model that graded the pair. */
  judge?: string;
  /** PROMPT_SHA256 when the pair was graded: the prompt and the window the judge read. */
  prompt_sha256?: string;
  /** The UTC day the pair was graded, such as 2026-10-11. */
  date?: string;
  /** assetSha256 of what the judge read of the asset. A pair whose asset has another digest now is graded again. */
  asset_sha256?: string;
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
    if (r.banned !== undefined && !(r.banned === true && r.grade === 0)) return 'has a "banned" that is not true on a grade 0 pair';
    for (const key of ["judge", "prompt_sha256", "date", "asset_sha256"]) if (r[key] !== undefined && (typeof r[key] !== "string" || !r[key])) return `has a "${key}" that is not a string`;
    return null;
  });
}

/** Query id to the refs it bans. */
export function bannedByQuery(qrels: Qrel[]): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const r of qrels) if (r.banned) by.set(r.id, [...(by.get(r.id) ?? []), r.ref]);
  return by;
}

/** The last row of each pair of a query and an asset: a pair graded again has two rows, and the later one replaces the earlier. */
function lastRows(qrels: Qrel[]): Qrel[] {
  const last = new Map<string, Qrel>();
  for (const r of qrels) last.set(`${r.id}\t${r.ref}`, r);
  return [...last.values()];
}

/**
 * What the qrels say of who graded them: the distinct judges and prompts that the last row of each pair records, and how many of those rows
 * record no judge (rows made before label wrote one). A row that a later row of its pair has replaced no longer counts: grading a pair again
 * clears it. One judge is the aim: grades of two judges, or of two prompts, do not mix cleanly.
 */
export function qrelProvenance(qrels: Qrel[]): { judges: string[]; prompts: string[]; unrecorded: number } {
  const rows = lastRows(qrels);
  const distinct = (values: (string | undefined)[]): string[] => [...new Set(values.filter((v): v is string => v !== undefined))].sort();
  return { judges: distinct(rows.map((r) => r.judge)), prompts: distinct(rows.map((r) => r.prompt_sha256)), unrecorded: rows.filter((r) => r.judge === undefined).length };
}

/**
 * A sentence for run to warn with when the qrels hold the grades of more than one judge (or prompt), or null when they do not. Rows that record
 * no judge count as one more judge once any row records one: they were graded by someone, and their grades sit beside the new ones.
 * A set where no row records a judge, as the library's was before label wrote them, is not a mix.
 */
export function mixedJudgesWarning(qrels: Qrel[], where = "qrels.jsonl"): string | null {
  const { judges, prompts, unrecorded } = qrelProvenance(qrels);
  const mixedJudges = judges.length > 1 || (judges.length === 1 && unrecorded > 0);
  if (!mixedJudges && prompts.length < 2) return null;
  const what = [mixedJudges ? `${judges.length} ${judges.length === 1 ? "judge" : "judges"} (${judges.join(", ")})` : "", prompts.length > 1 ? `${prompts.length} prompts` : ""].filter(Boolean).join(" and ");
  return `${where} holds grades from ${what}${unrecorded > 0 ? `, and ${unrecorded} rows that record no judge` : ""}. Grades of different judges or prompts do not mix cleanly: compare only runs on the same qrels, and grade the set again with one judge before you trust a difference.`;
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
/**
 * How much of an asset the judge reads. The lab's earlier harness read 1500 characters. In this library 80% of the
 * assets are longer, and the part that answers a query is often further in, so the judge reads 16,000: 95% of the
 * assets whole.
 */
export const MAX_DOC_CHARS = 16_000;

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
  /** The file, relative to the library, or absolute where akm names it so (a bundle that is indexed in place). */
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
 * A digest of the prompt the judge is given, for the qrels rows: the prompt's version, its system text, the layout of the user message
 * around the query and the asset, and how much of an asset the judge reads. Another prompt, or another window, is another digest.
 */
export const PROMPT_SHA256 = sha256Text(
  JSON.stringify({
    version: PROMPT_VERSION,
    system: JUDGE_SYSTEM_PROMPT,
    user: judgeMessages("{query}", { ref: "{ref}", type: "{type}", name: "{name}", description: "{description}", path: "" }, "{content}")[1].content,
    max_doc_chars: MAX_DOC_CHARS,
  }),
);

/**
 * A digest of an asset as the judge reads it: its ref, its front matter (the name and description the judge is shown come from there) and
 * the text after it, cut at the judge's window. It is of the file and not of what akm says of it, so another akm gives the same digest.
 * A change past the window, which the judge does not see, does not change it.
 */
export const assetSha256 = (ref: string, text: string): string => sha256Text(JSON.stringify({ ref, front_matter: /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text)?.[0] ?? "", content: stripFrontmatter(text).slice(0, MAX_DOC_CHARS) }));

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
  /**
   * nDCG@10 of the judged results alone: the results nobody graded for this query are taken out of the list and the rest move up,
   * against the same ideal order. Unjudged results count as not relevant in ndcg_10, so a ranker that surfaces assets nobody graded
   * is penalised for it there. This is the other bound: it is never lower than ndcg_10, and the two meet when judged_10 is 1.
   */
  ndcg_10_condensed: number;
  p_5: number;
  success_5: boolean;
  mrr: number;
  recall_10: number;
  /** The share of the results among the first 10 that someone graded for this query. null when there are no results. */
  judged_10: number | null;
  /** A banned asset is among the first 10 and ranks above a relevant one, the last of them: a relevant asset that is not among the first 10 ranks below every result. null when the query bans none. */
  banned_above: boolean | null;
  /** A banned asset is among the first 10 and ranks above the first relevant asset. A relevant asset that is missing does not count here unless every one is. null when the query bans none. */
  banned_above_first: boolean | null;
}

/**
 * One query's results against its grades. Only the first 10 results count. A relevant asset that is not among the first
 * 10 ranks below every result, so any banned asset that is returned ranks above it.
 */
export function scoreQuery(grades: Record<string, number>, refs: string[], banned: string[] = []): Scored {
  const at10: Retrieval = retrievalMetrics(grades, refs, 10, RELEVANT);
  const at5: Retrieval = retrievalMetrics(grades, refs, 5, RELEVANT);
  const top = refs.slice(0, 10);
  const judgedRefs = top.filter((r) => Object.hasOwn(grades, r));
  const condensed: Retrieval = retrievalMetrics(grades, judgedRefs, 10, RELEVANT);
  const rank = (ref: string): number => {
    const i = top.indexOf(ref);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const relevant = Object.keys(grades).filter((r) => grades[r] >= RELEVANT);
  const bannedRank = Math.min(...banned.map(rank));
  const bannedAbove = banned.length === 0 ? null : bannedRank < Math.max(...relevant.map(rank));
  const bannedAboveFirst = banned.length === 0 ? null : relevant.length > 0 && bannedRank < Math.min(...relevant.map(rank));
  return {
    ndcg_10: at10.ndcg,
    ndcg_10_condensed: condensed.ndcg,
    p_5: at5.precision,
    success_5: at5.hit,
    mrr: at10.mrr,
    recall_10: at10.recall,
    judged_10: top.length === 0 ? null : judgedRefs.length / top.length,
    banned_above: bannedAbove,
    banned_above_first: bannedAboveFirst,
  };
}

export interface SystemMetrics {
  n: number;
  ndcg_10: number | null;
  /** The mean of Scored.ndcg_10_condensed: nDCG@10 over the judged results only, next to ndcg_10 to bound the bias of unjudged results. */
  ndcg_10_condensed: number | null;
  p_5: number | null;
  success_5: number | null;
  mrr: number | null;
  recall_10: number | null;
  /** The mean share of judged results, over the queries that returned any. */
  judged_10: number | null;
  /** The share of the queries that ban an asset where one ranks above a relevant asset, the last of them. Lower is better. null when no query bans one. */
  banned_above: number | null;
  /** The same share for a banned asset that ranks above the first relevant asset: it leaves out the queries where only a missing relevant asset puts one above. */
  banned_above_first: number | null;
}

export function summarize(rows: Scored[]): SystemMetrics {
  const share = (f: (r: Scored) => boolean | null): number | null => mean(rows.flatMap((r) => (f(r) === null ? [] : [f(r) ? 1 : 0])));
  return {
    n: rows.length,
    ndcg_10: mean(rows.map((r) => r.ndcg_10)),
    ndcg_10_condensed: mean(rows.map((r) => r.ndcg_10_condensed)),
    p_5: mean(rows.map((r) => r.p_5)),
    success_5: mean(rows.map((r) => (r.success_5 ? 1 : 0))),
    mrr: mean(rows.map((r) => r.mrr)),
    recall_10: mean(rows.map((r) => r.recall_10)),
    judged_10: mean(rows.flatMap((r) => (r.judged_10 === null ? [] : [r.judged_10]))),
    banned_above: share((r) => r.banned_above),
    banned_above_first: share((r) => r.banned_above_first),
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
