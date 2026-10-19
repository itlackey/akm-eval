#!/usr/bin/env bun
// pass-bar: re-routes the judge's scores of distill runs under two pass bars and counts the good and the bad lessons each lets
// through. akm's judge scores a lesson on reusable, nonRedundancy and grounding. It passes a lesson whose reusable and nonRedundancy
// are 4 or more, whatever grounding is, and rejects one with a score of 2 or less. The other bar puts grounding into the pass test and
// the mean too. See ../README.md.
//
//   evals/distill/pass-bar [--rescore] [--cases DIR] RESULTS_DIR...

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { atLeast } from "../../reflect/src/lib.ts";
import { type LoadedCase, NAME, checkLesson, corpusFolder, lessonText, loadCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

/** The first akm release that names the judge's first criterion `reusable`. Before it, the criterion is called `novelty`. */
export const RENAMED_IN = "0.9.27-alpha.2";

const USAGE = `Usage: evals/distill/pass-bar [--rescore] [--cases DIR] RESULTS_DIR...

Takes the results folders of distill runs (each has a summary.json and a samples.jsonl; --repeat makes one per run, <label>-r1 ...),
on one corpus, and counts, for each pass bar, the good and the bad lessons that pass, go to review and are rejected.
A lesson is good when it passes the distill eval's checks for its case; a lesson for a case that expects none is bad.

The checks use the current cases, memories and scorer to judge the saved lessons.

  --rescore  omit rows whose case no longer exists, reporting the missing case ids.
  --cases    the folder of the cases of a custom run whose folder was outside the repository, so the summary does not record it.

Prints JSON, with "inputs": for each run, the corpus folder read and what differs.
Exits 1, with a message, when no lesson of the runs could be judged.`;

export type Bar = "shipped" | "with-grounding";
export type Verdict = "pass" | "review" | "reject";
export interface Scores {
  reusable: number;
  nonRedundancy: number;
  grounding: number;
}

/**
 * What akm's judge does with the scores (src/commands/improve/stage.ts): a score of 2 or less on any criterion rejects. Otherwise the
 * lesson passes when the criteria that count are all 4 or more, is sent to review when their mean is 2.5 or more, and is rejected below.
 * The shipped bar counts reusable and nonRedundancy. The other counts grounding too.
 */
export function route(s: Scores, bar: Bar): Verdict {
  const all = [s.reusable, s.nonRedundancy, s.grounding];
  if (Math.min(...all) <= 2) return "reject";
  const counted = bar === "shipped" ? [s.reusable, s.nonRedundancy] : all;
  if (Math.min(...counted) >= 4) return "pass";
  return counted.reduce((a, b) => a + b, 0) / counted.length >= 2.5 ? "review" : "reject";
}

/** What akm did with the lesson in a row, from its outcome and gate: the check that route() agrees with the judge it replays. */
export function actual(row: { outcome: string; gate: string | null }): Verdict | undefined {
  if (row.outcome === "rejected") return "reject";
  if (row.gate?.endsWith("distill-review")) return "pass";
  if (row.gate?.endsWith("quality-review")) return "review";
  return undefined;
}

export interface Judged {
  id: string;
  scores: Scores;
  /** The verdict akm gave, when the row says. */
  actual?: Verdict;
  /** Is the lesson good: the case's checks pass. A lesson for a case that expects none is bad. */
  good: boolean;
}

type Cell = { good: number; bad: number };
export interface Report {
  /** Judged lessons counted. */
  n: number;
  /** Rows whose verdict under the shipped bar differs from the one akm gave: should be 0. */
  mismatch: number;
  bars: Record<Bar, Record<Verdict, Cell>>;
  /** The lessons the two bars treat differently. */
  differ: { id: string; scores: Scores; good: boolean; shipped: Verdict; "with-grounding": Verdict }[];
}

export function report(judged: Judged[]): Report {
  const empty = (): Record<Verdict, Cell> => ({ pass: { good: 0, bad: 0 }, review: { good: 0, bad: 0 }, reject: { good: 0, bad: 0 } });
  const out: Report = { n: judged.length, mismatch: 0, bars: { shipped: empty(), "with-grounding": empty() }, differ: [] };
  for (const j of judged) {
    const shipped = route(j.scores, "shipped");
    const withGrounding = route(j.scores, "with-grounding");
    if (j.actual !== undefined && j.actual !== shipped) out.mismatch++;
    out.bars.shipped[shipped][j.good ? "good" : "bad"]++;
    out.bars["with-grounding"][withGrounding][j.good ? "good" : "bad"]++;
    if (shipped !== withGrounding) out.differ.push({ id: j.id, scores: j.scores, good: j.good, shipped, "with-grounding": withGrounding });
  }
  return out;
}

/** Does the akm of a run name the judge's first criterion `reusable`? Null when the version is not known or is not a version. */
export function namesReusable(version: string | null): boolean | null {
  if (version === null) return null;
  try {
    return atLeast(version, RENAMED_IN);
  } catch {
    return null;
  }
}

/**
 * The judge's scores of a row as `Scores`, or undefined when the row has none. `reusable` is read as it is, and `novelty` as its historical spelling. The recorded fields determine what can be read; the version remains provenance. Anything else is not a score this tool can read: it throws,
 * naming the release and the keys, so that a run is never reported as empty for want of the name.
 */
export function readScores(scores: Record<string, unknown> | null, id: string, version: string | null): Scores | undefined {
  if (!scores) return undefined;
  const num = (k: string): number | undefined => (typeof scores[k] === "number" ? (scores[k] as number) : undefined);
  const first = num("reusable") ?? num("novelty");
  const [nonRedundancy, grounding] = [num("nonRedundancy"), num("grounding")];
  if (first !== undefined && nonRedundancy !== undefined && grounding !== undefined) return { reusable: first, nonRedundancy, grounding };
  const was = version === null ? "an akm whose version the summary does not record" : `akm ${version}`;
  const rename = namesReusable(version) === true ? `${was} names it reusable` : `before akm ${RENAMED_IN} it is called novelty (this run: ${was})`;
  throw new Error(`the judge's scores of the case ${id} are ${Object.keys(scores).sort().join(", ") || "empty"}, and this tool reads reusable, nonRedundancy and grounding: the first criterion is called reusable from akm ${RENAMED_IN}, and ${rename}`);
}

/** What a read of a distill run used, for the report: the corpus and the scorer the run recorded, and the ones the read used. */
export interface Inputs {
  /** "stored" when every case of the run is here now. "rescore" when --rescore was given: rows of missing cases are left out. */
  mode: "stored" | "rescore";
  corpus: string;
  /** The folder of the cases the read used, from the repository root. */
  assets: string;
  /** The akm release of the run, and the name its judge's first criterion had in the rows that were judged (null when none was). */
  akm_version: string | null;
  judge_first_criterion: "reusable" | "novelty" | null;
  /** The case ids of the run that the cases here now lack. Their rows are left out. */
  missing_cases: string[];
}

export interface ReplayOptions {
  /** The repository the cases are read from. This one, but for tests. */
  root?: string;
  /** Read a run with case ids the cases here no longer have, leaving those rows out. */
  rescore?: boolean;
  /** The folder of the cases, from the repository root or absolute, when the summary does not say where they are. */
  cases?: string;
}

type SampleRow = { id: string; class: string; outcome: string; gate: string | null; scores: Record<string, unknown> | null; lesson: string | null; rejected_lesson: string | null };

const some = (ids: string[], n = 5): string => `${ids.slice(0, n).join(", ")}${ids.length > n ? `, and ${ids.length - n} more` : ""}`;

/** Judge saved lessons using the current cases and checks. */
export function judgedLessons(resultsDir: string, options: ReplayOptions = {}): { judged: Judged[]; skipped: number; noScores: number; inputs: Inputs } {
  const root = options.root ?? ROOT;
  const summary = JSON.parse(readFileSync(join(resultsDir, "summary.json"), "utf8")) as Record<string, any>;
  if (summary.eval !== NAME) throw new Error(`${resultsDir} is a run of ${JSON.stringify(summary.eval)}, not of ${NAME}`);
  const assets = options.cases !== undefined ? resolve(root, options.cases) : corpusFolder(root, summary);
  const where = relative(root, assets);
  const cases = new Map(loadCases(assets).map((c) => [c.id, c]));

  const rows = readFileSync(join(resultsDir, "samples.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as SampleRow);
  const ids = [...new Set(rows.map((r) => r.id))];
  const missing = ids.filter((id) => !cases.has(id));
  if (!options.rescore && missing.length > 0) {
    const lines = [...(missing.length > 0 ? [`the run has ${missing.length === 1 ? "a case id" : "case ids"} that ${where}/cases.json lacks: ${missing.join(", ")}`] : [])];
    throw new Error(`${resultsDir} cannot be judged by the cases and the scorer here now:\n  - ${lines.join("\n  - ")}\nA lesson would be good or bad by cases, memories and checks other than the run's. To judge its stored lessons by what is here now on purpose, add --rescore.`);
  }

  const version = typeof summary.akm_version === "string" ? summary.akm_version : summary.manifest?.akm?.version ?? null;
  const judged: Judged[] = [];
  let skipped = 0;
  let noScores = 0;
  let novelty = false;
  for (const row of rows) {
    const c = cases.get(row.id);
    if (!c) continue; // a case that is gone: named in inputs.missing_cases
    if (!row.scores) {
      noScores++; // a skip, an error, or a judge that gave no scores
      continue;
    }
    const text = row.lesson ?? (row.rejected_lesson === null ? null : lessonText(row.rejected_lesson));
    if (text === null || c.class === "lesson-update") {
      skipped++;
      continue;
    }
    const scores = readScores(row.scores, row.id, version) as Scores; // throws, naming the release, for scores it cannot read
    novelty ||= !("reusable" in row.scores);
    judged.push({ id: row.id, scores, actual: actual(row), good: c.expect === "lesson" && checkLesson(c, text, c.memory).good });
  }
  const inputs: Inputs = {
    mode: options.rescore ? "rescore" : "stored",
    corpus: String(summary.corpus),
    assets: where,
    akm_version: version,
    judge_first_criterion: judged.length === 0 ? null : novelty ? "novelty" : "reusable",
    missing_cases: missing,
  };
  return { judged, skipped, noScores, inputs };
}

function main(): void {
  const fail = (message: string): never => {
    console.error(`pass-bar: ${message}\n\n${USAGE}`);
    process.exit(2);
  };
  let values: { rescore?: boolean; cases?: string; help?: boolean };
  let dirs: string[];
  try {
    ({ values, positionals: dirs } = parseArgs({ args: Bun.argv.slice(2), options: { rescore: { type: "boolean" }, cases: { type: "string" }, help: { type: "boolean", short: "h" } }, allowPositionals: true, strict: true }));
  } catch (e) {
    return fail((e as Error).message);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (dirs.length === 0) fail("name at least one results folder");
  const all: Judged[] = [];
  const inputs: (Inputs & { results: string })[] = [];
  let skipped = 0;
  let noScores = 0;
  for (const dir of dirs) {
    let r: ReturnType<typeof judgedLessons>;
    try {
      r = judgedLessons(resolve(dir), { rescore: values.rescore, cases: values.cases });
    } catch (e) {
      return fail((e as Error).message);
    }
    all.push(...r.judged.map((j) => ({ ...j, id: `${dir.split("/").pop()}/${j.id}` })));
    inputs.push({ results: dir, ...r.inputs });
    skipped += r.skipped;
    noScores += r.noScores;
  }
  console.log(JSON.stringify({ ...report(all), skipped_without_text: skipped, without_scores: noScores, inputs }, null, 2));
  if (all.length === 0) {
    console.error(`pass-bar: no lesson could be judged, so n is 0. Of the rows, ${noScores} have no judge scores (a skip, an error, a judge that failed) and ${skipped} are a lesson update, or have scores and no lesson text (an akm that does not report a rejected lesson).`);
    process.exit(1);
  }
}

if (import.meta.main) main();
