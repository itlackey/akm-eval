#!/usr/bin/env bun
// pass-bar: re-routes the judge's scores of distill runs under two pass bars and counts the good and the bad lessons each lets
// through. akm's judge scores a lesson on reusable, nonRedundancy and grounding. It passes a lesson whose reusable and nonRedundancy
// are 4 or more, whatever grounding is, and rejects one with a score of 2 or less. The other bar puts grounding into the pass test and
// the mean too. See ../README.md.
//
//   evals/distill/pass-bar [--rescore] RESULTS_DIR...

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { harnessSha256 } from "../../../lib/provenance.ts";
import { assetsSha256, checkLesson, lessonText, loadCases } from "./lib.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

const USAGE = `Usage: evals/distill/pass-bar [--rescore] RESULTS_DIR...

Takes the results folders of distill runs (each has a summary.json and a samples.jsonl; --repeat makes one per run, <label>-r1 ...),
on one corpus, and counts, for each pass bar, the good and the bad lessons that pass, go to review and are rejected.
A lesson is good when it passes the distill eval's checks for its case; a lesson for a case that expects none is bad.

The checks read the cases, the memories and the checks of the code here now, not the ones the run was given. So the summary.json of a
run must hold the assets_sha256 of its corpus as it is now and the harness_sha256 of this code, and every case id of the run must be in
the corpus. Otherwise the run is not read, and the message says what differs.

  --rescore  read the runs anyway, and judge their stored lessons by the cases and the checks here now, when a summary.json records
             other digests, records none, or has a case id that is gone. The report names the stored and the current digests,
             and the case ids left out.

Prints JSON, with "inputs": for each run, the corpus folder read and the stored and the current digests.`;

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

/** The folder of the cases a run of `corpus` reads, as distill's run reads it. */
function assetsOf(corpus: unknown, root: string): string {
  if (corpus === "public") return join(root, "evals", "distill", "assets");
  if (corpus === "private") return join(root, "private", "distill", "assets");
  if (corpus === "own" || corpus === "own-feedback") return join(root, "private", "distill", "own", corpus === "own" ? "assets" : "assets-feedback");
  throw new Error(`summary.json names the corpus ${JSON.stringify(corpus)}, not public, private, own or own-feedback`);
}

const DIGEST = /^[0-9a-f]{64}$/;

/** A digest a summary.json holds, or null when it holds none or something that is not one. */
const digestIn = (value: unknown): string | null => (typeof value === "string" && DIGEST.test(value) ? value : null);

/** What a read of a distill run used, for the report: the corpus and the code the run recorded, and the ones the read used. */
export interface Inputs {
  /** "stored" when the run read the cases and ran the code that are here now. "rescore" when --rescore was given. */
  mode: "stored" | "rescore";
  corpus: string;
  /** The folder of the cases the read used, from the repository root. */
  assets: string;
  /** The assets_sha256 of the run (null when it has none) and the digest of that folder now, computed as the run computes it. */
  assets_sha256: { stored: string | null; current: string };
  /** The harness_sha256 of the run (null when it has none) and the digest of this code now, which holds the checks that judge a lesson. */
  harness_sha256: { stored: string | null; current: string };
  /** What a read without --rescore would have stopped on: a digest that differs or is missing. Empty when nothing does. */
  differences: string[];
  /** The case ids of the run that the cases here now lack. Their rows are left out. */
  missing_cases: string[];
}

export interface ReplayOptions {
  /** The repository the cases are read from. This one, but for tests. */
  root?: string;
  /** The harness_sha256 of the code here now. The one harnessSha256 gives for this folder, but for tests. */
  harness?: string;
  /** Read a run that read other cases or ran other code, and report both. */
  rescore?: boolean;
}

type SampleRow = { id: string; class: string; outcome: string; gate: string | null; scores: Record<string, number> | null; lesson: string | null; rejected_lesson: string | null };

/**
 * The judged lessons of one results folder. A row has them when the judge scored a lesson and the text of it is known. A lesson is good by
 * the cases, the memories and the checks here now, so the run must have read the same ones. Its summary.json must hold the assets_sha256
 * of the corpus as it is now (the digest distill's run computes) and the harness_sha256 of this code, and each case id of the run must be in
 * the corpus. Otherwise this throws and says what differs. With `rescore` it judges anyway, leaves out the rows of a case that is gone, and
 * says both in `inputs`.
 */
export function judgedLessons(resultsDir: string, options: ReplayOptions = {}): { judged: Judged[]; skipped: number; inputs: Inputs } {
  const root = options.root ?? ROOT;
  const summary = JSON.parse(readFileSync(join(resultsDir, "summary.json"), "utf8")) as { corpus?: unknown; assets_sha256?: unknown; harness_sha256?: unknown };
  const assets = assetsOf(summary.corpus, root);
  const corpus = summary.corpus as string;
  const where = relative(root, assets);
  const cases = new Map(loadCases(assets).map((c) => [c.id, c]));

  const stored = { assets: digestIn(summary.assets_sha256), harness: digestIn(summary.harness_sha256) };
  const current = { assets: assetsSha256(assets), harness: options.harness ?? harnessSha256(import.meta.dir) };
  const differences: string[] = [];
  const compare = (field: string, was: string | null, now: string, what: string, here: string) => {
    if (was === null) differences.push(`${field} is missing from summary.json (or is not a sha256 digest), so nothing says ${what}`);
    else if (was !== now) differences.push(`${field} differs: the run recorded ${was}, ${here} gives ${now}`);
  };
  compare("assets_sha256", stored.assets, current.assets, "which cases and memories the run read", `the cases in ${where}`);
  compare("harness_sha256", stored.harness, current.harness, "which code made the run", "the code here");

  const rows = readFileSync(join(resultsDir, "samples.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as SampleRow);
  const missing = [...new Set(rows.map((r) => r.id).filter((id) => !cases.has(id)))];
  if (!options.rescore && (differences.length > 0 || missing.length > 0)) {
    const lines = [...differences, ...(missing.length > 0 ? [`the run has ${missing.length === 1 ? "a case id" : "case ids"} that ${where}/cases.json lacks: ${missing.join(", ")}`] : [])];
    throw new Error(`${resultsDir} cannot be judged by the cases and code here now:\n  - ${lines.join("\n  - ")}\nA lesson would be good or bad by cases, memories and checks other than the run's. To judge its stored lessons by what is here now on purpose, add --rescore.`);
  }

  const judged: Judged[] = [];
  let skipped = 0;
  for (const row of rows) {
    const c = cases.get(row.id);
    if (!c) continue; // a case that is gone: named in inputs.missing_cases
    const s = row.scores;
    const text = row.lesson ?? (row.rejected_lesson === null ? null : lessonText(row.rejected_lesson));
    if (!s || text === null || c.class === "lesson-update" || typeof s.reusable !== "number" || typeof s.nonRedundancy !== "number" || typeof s.grounding !== "number") {
      if (s) skipped++;
      continue;
    }
    judged.push({ id: row.id, scores: { reusable: s.reusable, nonRedundancy: s.nonRedundancy, grounding: s.grounding }, actual: actual(row), good: c.expect === "lesson" && checkLesson(c, text, c.memory).good });
  }
  const inputs: Inputs = {
    mode: options.rescore ? "rescore" : "stored",
    corpus,
    assets: where,
    assets_sha256: { stored: stored.assets, current: current.assets },
    harness_sha256: { stored: stored.harness, current: current.harness },
    differences,
    missing_cases: missing,
  };
  return { judged, skipped, inputs };
}

function main(): void {
  const fail = (message: string): never => {
    console.error(`pass-bar: ${message}\n\n${USAGE}`);
    process.exit(2);
  };
  let values: { rescore?: boolean; help?: boolean };
  let dirs: string[];
  try {
    ({ values, positionals: dirs } = parseArgs({ args: Bun.argv.slice(2), options: { rescore: { type: "boolean" }, help: { type: "boolean", short: "h" } }, allowPositionals: true, strict: true }));
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
  for (const dir of dirs) {
    let r: ReturnType<typeof judgedLessons>;
    try {
      r = judgedLessons(resolve(dir), { rescore: values.rescore });
    } catch (e) {
      return fail((e as Error).message);
    }
    all.push(...r.judged.map((j) => ({ ...j, id: `${dir.split("/").pop()}/${j.id}` })));
    inputs.push({ results: dir, ...r.inputs });
    skipped += r.skipped;
  }
  console.log(JSON.stringify({ ...report(all), skipped_without_text: skipped, inputs }, null, 2));
}

if (import.meta.main) main();
