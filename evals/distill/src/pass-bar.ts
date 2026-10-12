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
import { caseDigests, currentDigests, readManifest } from "../../../lib/manifest.ts";
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

The checks read the cases, the memories and the scorer of the code here now, not the ones the run was given. So the manifest in the
summary.json of a run must hold the scorer digest of this code and, for every case of the run, the input and the label digests of the
case as it is now, and every case id of the run must be in the corpus. Otherwise the run is not read, and the message says what differs.
A run from before the manifest has none to compare.

The judge's first score is called reusable from akm ${RENAMED_IN}, and novelty before. A run of an older akm is read with novelty as
reusable. A run whose scores have other names, or whose akm version is not known, is refused, and the message names the release.

  --rescore  read the runs anyway, and judge their stored lessons by the cases and the checks here now, when a run was scored by another
             scorer, has cases with other inputs or labels, has no manifest, or has a case id that is gone. The report names the stored
             and the current digests, and the case ids left out.
  --cases    the folder of the cases of a custom run whose folder was outside the repository, so the summary does not record it.

Prints JSON, with "inputs": for each run, the corpus folder read, the scorer digest stored and current, and what differs.
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
 * The judge's scores of a row as `Scores`, or undefined when the row has none. `reusable` is read as it is, and `novelty` as `reusable` for a
 * run of an akm before 0.9.27-alpha.2, which is when the criterion was renamed. Anything else is not a score this tool can read: it throws,
 * naming the release and the keys, so that a run is never reported as empty for want of the name.
 */
export function readScores(scores: Record<string, unknown> | null, id: string, version: string | null): Scores | undefined {
  if (!scores) return undefined;
  const num = (k: string): number | undefined => (typeof scores[k] === "number" ? (scores[k] as number) : undefined);
  const first = num("reusable") ?? (namesReusable(version) === false ? num("novelty") : undefined);
  const [nonRedundancy, grounding] = [num("nonRedundancy"), num("grounding")];
  if (first !== undefined && nonRedundancy !== undefined && grounding !== undefined) return { reusable: first, nonRedundancy, grounding };
  const was = version === null ? "an akm whose version the summary does not record" : `akm ${version}`;
  const rename = namesReusable(version) === true ? `${was} names it reusable` : `before akm ${RENAMED_IN} it is called novelty (this run: ${was})`;
  throw new Error(`the judge's scores of the case ${id} are ${Object.keys(scores).sort().join(", ") || "empty"}, and this tool reads reusable, nonRedundancy and grounding: the first criterion is called reusable from akm ${RENAMED_IN}, and ${rename}`);
}

/** What a read of a distill run used, for the report: the corpus and the scorer the run recorded, and the ones the read used. */
export interface Inputs {
  /** "stored" when the run was scored by the scorer and against the cases here now. "rescore" when --rescore was given. */
  mode: "stored" | "rescore";
  corpus: string;
  /** The folder of the cases the read used, from the repository root. */
  assets: string;
  /** Whether the summary has a manifest. A run from before harness-v3 has none, and nothing to compare. */
  manifest: "manifest" | "legacy";
  /** The akm release of the run, and the name its judge's first criterion had in the rows that were judged (null when none was). */
  akm_version: string | null;
  judge_first_criterion: "reusable" | "novelty" | null;
  /** The digest of the scorer that scored the run (null when it has no manifest), and of the scorer here now. */
  scorer_sha256: { stored: string | null; current: string };
  /** What a read without --rescore would have stopped on. Empty when nothing does. */
  differences: string[];
  /** The cases of the run whose input or labels are not the ones here now. */
  changed_cases: string[];
  /** The case ids of the run that the cases here now lack. Their rows are left out. */
  missing_cases: string[];
}

export interface ReplayOptions {
  /** The repository the cases are read from. This one, but for tests. */
  root?: string;
  /** Read a run that was scored by another scorer or against other cases, and report both. */
  rescore?: boolean;
  /** The folder of the cases, from the repository root or absolute, when the summary does not say where they are. */
  cases?: string;
}

type SampleRow = { id: string; class: string; outcome: string; gate: string | null; scores: Record<string, unknown> | null; lesson: string | null; rejected_lesson: string | null };

const some = (ids: string[], n = 5): string => `${ids.slice(0, n).join(", ")}${ids.length > n ? `, and ${ids.length - n} more` : ""}`;

/**
 * The judged lessons of one results folder. A row has them when the judge scored a lesson and the text of it is known. A lesson is good by
 * the cases, the memories and the scorer here now, so the run must have been scored by the same: its manifest holds the digest of the scorer
 * (the checks, and lib/negation.ts) and the input and label digests of each case (the input covers the memory), and they must be the ones
 * here now. A run with no manifest has nothing to compare, and every case id of the run must be in the corpus. Otherwise this throws and
 * says what differs. With `rescore` it judges anyway, leaves out the rows of a case that is gone, and says all of it in `inputs`.
 */
export function judgedLessons(resultsDir: string, options: ReplayOptions = {}): { judged: Judged[]; skipped: number; noScores: number; inputs: Inputs } {
  const root = options.root ?? ROOT;
  const summary = JSON.parse(readFileSync(join(resultsDir, "summary.json"), "utf8")) as Record<string, any>;
  if (summary.eval !== NAME) throw new Error(`${resultsDir} is a run of ${JSON.stringify(summary.eval)}, not of ${NAME}`);
  const reading = readManifest(summary);
  if (reading.kind === "invalid") throw new Error(`${resultsDir}/summary.json has a manifest that is not sound: ${reading.problems.join("; ")}`);
  const assets = options.cases !== undefined ? resolve(root, options.cases) : corpusFolder(root, summary);
  const where = relative(root, assets);
  const cases = new Map(loadCases(assets).map((c) => [c.id, c]));

  const rows = readFileSync(join(resultsDir, "samples.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as SampleRow);
  const ids = [...new Set(rows.map((r) => r.id))];
  const missing = ids.filter((id) => !cases.has(id));
  const present = ids.filter((id) => cases.has(id)).map((id) => cases.get(id) as LoadedCase);

  const scorer = currentDigests(MEASUREMENT).scorer;
  const now = caseDigests(MEASUREMENT, present);
  const differences: string[] = [];
  const changed: string[] = [];
  if (reading.kind === "legacy") {
    differences.push("the run has no manifest (it was made before harness-v3), so nothing says which scorer and which cases scored it");
  } else {
    const m = reading.manifest;
    if (m.scorer.sha256 !== scorer) differences.push(`scorer.sha256 differs: the run was scored by scorer ${m.scorer.version}, ${m.scorer.sha256}, and the checks here give ${scorer}`);
    const unknown = present.filter((c) => m.cases[c.id] === undefined).map((c) => c.id);
    if (unknown.length > 0) differences.push(`the manifest of the run does not hold the case${unknown.length === 1 ? "" : "s"} ${some(unknown)}`);
    for (const c of present) {
      const was = m.cases[c.id];
      if (was !== undefined && (was.input_sha256 !== now[c.id]?.input_sha256 || was.label_sha256 !== now[c.id]?.label_sha256)) changed.push(c.id);
    }
    if (changed.length > 0) differences.push(`${changed.length === 1 ? "the case" : "the cases"} ${some(changed)} ${changed.length === 1 ? "has" : "have"} another input or other labels than when the run was made (its memory, its bundle, its feedback, or the facts and claims it is judged by)`);
  }
  if (!options.rescore && (differences.length > 0 || missing.length > 0)) {
    const lines = [...differences, ...(missing.length > 0 ? [`the run has ${missing.length === 1 ? "a case id" : "case ids"} that ${where}/cases.json lacks: ${missing.join(", ")}`] : [])];
    throw new Error(`${resultsDir} cannot be judged by the cases and the scorer here now:\n  - ${lines.join("\n  - ")}\nA lesson would be good or bad by cases, memories and checks other than the run's. To judge its stored lessons by what is here now on purpose, add --rescore.`);
  }

  const version: string | null = reading.kind === "manifest" ? reading.manifest.akm.version : typeof summary.akm_version === "string" ? summary.akm_version : null;
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
    manifest: reading.kind === "manifest" ? "manifest" : "legacy",
    akm_version: version,
    judge_first_criterion: judged.length === 0 ? null : novelty ? "novelty" : "reusable",
    scorer_sha256: { stored: reading.kind === "manifest" ? reading.manifest.scorer.sha256 : null, current: scorer },
    differences,
    changed_cases: changed,
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
