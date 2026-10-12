// What the bakeoff eval reads and what generate writes: the cases of a corpus folder and the files they name, the checks on them, the digests
// of a corpus, and the name of the generated.json that generate writes beside a private corpus.
// Neither the scorer nor the collector (see measurement.ts): run.ts, generate.ts and measurement.ts use it.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import type { LoadedCase } from "./collect.ts";
import { type Expected, PROCESSES, type Process, refOf } from "./score.ts";

/** The cases of a corpus folder. */
export const CASES_FILE = "cases.json";

// --- Reading a corpus --------------------------------------------------------------------------------------------

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string" && s !== "");

/** What a case of each process must expect: the keys it needs, as the scorer reads them. */
const EXPECTS: Record<Process, (e: Record<string, unknown>) => string[]> = {
  "memory-inference": (e) => [...(isStrings(e.required) && e.required.length > 0 ? [] : ["required needs a list of terms"]), ...(e.forbidden === undefined || isStrings(e.forbidden) ? [] : ["forbidden needs a list of terms"]), ...(e.date === undefined || typeof e.date === "string" ? [] : ["date needs a string"])],
  "remember-enrich": (e) => [...(e.observed_at === null || (typeof e.observed_at === "string" && e.observed_at !== "") ? [] : ["observed_at needs a date, or null for a memory that writes none"]), ...(isStrings(e.keywords) && e.keywords.length > 0 ? [] : ["keywords needs a list of terms"])],
  "schema-repair": (e) => [...(isStrings(e.keywords) && e.keywords.length > 0 ? [] : ["keywords needs a list of terms"]), ...(isStrings(e.trigger) && e.trigger.length > 0 ? [] : ["trigger needs a list of terms"])],
  "session-summary": (e) => [...(isStrings(e.required) && e.required.length > 0 ? [] : ["required needs a list of terms"]), ...(isStrings(e.topics) && e.topics.length > 0 ? [] : ["topics needs a list of terms"]), ...(e.forbidden === undefined || isStrings(e.forbidden) ? [] : ["forbidden needs a list of terms"])],
  "consolidate-promote": (e) => [...(isStrings(e.promote) ? [] : ["promote needs a list of refs"]), ...(e.protected === undefined || isStrings(e.protected) ? [] : ["protected needs a list of refs"]), ...(e.strict === undefined || typeof e.strict === "boolean" ? [] : ["strict needs true or false"])],
};

/** The extension of the file a process reads. */
const EXTENSION: Record<Process, string> = { "memory-inference": ".md", "remember-enrich": ".md", "schema-repair": ".md", "session-summary": ".jsonl", "consolidate-promote": ".md" };

/** The expected keys that hold refs: each must be the ref of one of the case's files. */
const REF_KEYS = ["promote", "protected"] as const;

/** What a case expects that is a term: it is looked for in the output, or kept out of it. generate keeps each term matching the files the way it did in the public assets. */
const TERM_KEYS = ["required", "forbidden", "keywords", "topics", "trigger", "date", "observed_at"] as const;

/** What is wrong with the cases of a corpus, as messages; empty when they are sound. `cases` come with the text of their files. */
export function caseProblems(cases: LoadedCase[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of cases) {
    const at = c.id;
    if (seen.has(c.id)) out.push(`${at}: the id is used twice`);
    seen.add(c.id);
    if (!PROCESSES.includes(c.process)) {
      out.push(`${at}: unknown process "${c.process}". The processes are ${PROCESSES.join(", ")}`);
      continue;
    }
    if (c.process === "consolidate-promote" ? c.files.length < 2 : c.files.length !== 1) out.push(`${at}: ${c.process} reads ${c.process === "consolidate-promote" ? "a pool of two files or more" : "one file"}, not ${c.files.length}`);
    for (const file of c.files) {
      if (isAbsolute(file) || file.split("/").includes("..")) out.push(`${at}: ${file} is not a path inside the corpus folder`);
      else if (!file.endsWith(EXTENSION[c.process])) out.push(`${at}: ${c.process} reads ${EXTENSION[c.process]} files, not ${file}`);
      else if (!(c.texts[file] ?? "").trim()) out.push(`${at}: ${file} is missing or empty`);
    }
    out.push(...EXPECTS[c.process](c.expected as Record<string, unknown>).map((p) => `${at}: ${p}`));
    const refs = new Set(c.files.map(refOf));
    for (const key of REF_KEYS) for (const ref of (c.expected[key] as string[] | undefined) ?? []) if (!refs.has(ref)) out.push(`${at}: the ${key} ref ${JSON.stringify(ref)} is not the ref of one of its files`);
  }
  return out;
}

/** The cases of a `cases.json`, as written. Throws a message when the file is not a list of cases. */
export function parseCases(content: string, where = CASES_FILE): Omit<LoadedCase, "texts">[] {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (e) {
    throw new Error(`${where} is not valid JSON (${(e as Error).message})`);
  }
  if (!Array.isArray(json) || json.length === 0) throw new Error(`${where} must hold a list of cases`);
  return json.map((row, i) => {
    if (!isObject(row) || typeof row.id !== "string" || row.id === "" || typeof row.process !== "string" || !isStrings(row.files) || row.files.length === 0 || !isObject(row.expected)) {
      throw new Error(`${where}: case ${i + 1} needs an id, a process, a list of files and an expected object`);
    }
    return { id: row.id, process: row.process as Process, files: row.files, expected: row.expected as Expected };
  });
}

/** The cases of the corpus folder `dir`, each with the text of its files. Throws a message that says what is wrong with the folder. */
export function loadCases(dir: string): LoadedCase[] {
  const file = join(dir, CASES_FILE);
  if (!existsSync(file)) throw new Error(`${file} is missing`);
  const cases = parseCases(readFileSync(file, "utf8"), file).map((c) => ({ ...c, texts: Object.fromEntries(c.files.map((f) => [f, existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : ""])) }));
  const problems = caseProblems(cases);
  if (problems.length > 0) throw new Error(`${file} has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n  ${problems.join("\n  ")}`);
  return cases;
}

/** The first N cases, taken from each process in turn, so a short run covers every process. A `process` keeps that process only. */
export function selectCases<C extends { process: Process }>(cases: C[], limit?: number, process?: Process): C[] {
  const pool = process === undefined ? cases : cases.filter((c) => c.process === process);
  if (limit === undefined) return pool;
  const lists = PROCESSES.map((p) => pool.filter((c) => c.process === p)).filter((l) => l.length > 0);
  const picked = new Set<C>();
  for (let round = 0; picked.size < limit && round < pool.length; round++) for (const list of lists) if (picked.size < limit && round < list.length) picked.add(list[round] as C);
  return pool.filter((c) => picked.has(c));
}

// --- Terms: what generate keeps ----------------------------------------------------------------------------------

const flatten = (x: unknown): string[] => (typeof x === "string" ? [x] : Array.isArray(x) ? x.flatMap(flatten) : []);

/**
 * Cases made from other cases must keep what each expects: a term that is in a case's files in `against` is in them here, and one that is
 * not stays out. `here` and `against` are the cases of two corpora, in the same order.
 */
export function termProblems(here: LoadedCase[], against: LoadedCase[]): string[] {
  if (here.length !== against.length) return [`${here.length} cases against ${against.length}`];
  const text = (c: LoadedCase): string => c.files.map((f) => c.texts[f] ?? "").join("\n").toLowerCase();
  const out: string[] = [];
  here.forEach((mine, i) => {
    const theirs = against[i] as LoadedCase;
    for (const key of TERM_KEYS) {
      const a = flatten((mine.expected as Record<string, unknown>)[key]);
      const b = flatten((theirs.expected as Record<string, unknown>)[key]);
      if (a.length !== b.length) {
        out.push(`${theirs.id}: ${key} has a different number of terms`);
        continue;
      }
      a.forEach((term, j) => {
        if (text(mine).includes(term.toLowerCase()) !== text(theirs).includes((b[j] as string).toLowerCase())) out.push(`${theirs.id}: the ${key} term ${JSON.stringify(b[j])} is now ${JSON.stringify(term)}, and it does not match the files the way it did`);
      });
    }
  });
  return out;
}

// --- Digests -----------------------------------------------------------------------------------------------------

/** One digest over every file under `dir`, by relative path and content, so another machine gets the same one. */
export function treeSha256(dir: string): string {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.isFile()) files.push(relative(dir, join(d, e.name)).split(sep).join("/"));
    }
  };
  walk(dir);
  return sha256Text([...files].sort().map((rel) => `${rel}\0${sha256File(join(dir, rel))}\n`).join(""));
}

/** assets_sha256: the digest of everything a run reads from a corpus folder: cases.json and the files the cases name. */
export const assetsSha256 = (assets: string): string => treeSha256(assets);

// --- generated.json ----------------------------------------------------------------------------------------------

/** The file generate writes beside the private assets: the seed they were made with. */
export const GENERATED = "generated.json";
