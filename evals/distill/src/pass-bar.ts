#!/usr/bin/env bun
// pass-bar: re-routes the judge's scores of distill runs under two pass bars and counts the good and the bad lessons each lets
// through. akm's judge scores a lesson on reusable, nonRedundancy and grounding. It passes a lesson whose reusable and nonRedundancy
// are 4 or more, whatever grounding is, and rejects one with a score of 2 or less. The other bar puts grounding into the pass test and
// the mean too. See ../README.md.
//
//   evals/distill/pass-bar RESULTS_DIR...

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assetsSha256, checkLesson, lessonText, loadCases } from "./lib.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

const USAGE = `Usage: evals/distill/pass-bar RESULTS_DIR...

Takes the results folders of distill runs (each has a summary.json and a samples.jsonl; --repeat makes one per run, <label>-r1 ...),
on one corpus, and counts, for each pass bar, the good and the bad lessons that pass, go to review and are rejected.
A lesson is good when it passes the distill eval's checks for its case; a lesson for a case that expects none is bad.
Prints JSON.`;

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

const assetsOf = (corpus: string, root: string): string =>
  corpus === "public" ? join(root, "evals", "distill", "assets") : corpus === "private" ? join(root, "private", "distill", "assets") : join(root, "private", "distill", "own", corpus === "own" ? "assets" : "assets-feedback");

type SampleRow = { id: string; class: string; outcome: string; gate: string | null; scores: Record<string, number> | null; lesson: string | null; rejected_lesson: string | null };

/**
 * The judged lessons of one results folder. A row has them when the judge scored a lesson and the text of it is known. The run's
 * corpus must be the one in the assets folder now (the summary's assets_sha256) and each row's case must be in it: the lessons are
 * checked against the cases, so other cases would give other verdicts.
 */
export function judgedLessons(resultsDir: string, root = ROOT): { judged: Judged[]; skipped: number } {
  const { corpus, assets_sha256 } = JSON.parse(readFileSync(join(resultsDir, "summary.json"), "utf8")) as { corpus: string; assets_sha256?: string };
  const assets = assetsOf(corpus, root);
  if (typeof assets_sha256 !== "string") throw new Error(`${resultsDir}/summary.json has no assets_sha256, so nothing shows which ${corpus} cases the run read: it cannot be replayed against ${assets}`);
  if (assetsSha256(assets) !== assets_sha256) throw new Error(`${resultsDir} was run on other ${corpus} cases than the ones in ${assets} now (assets_sha256 differs): replaying it would check the lessons against other cases`);
  const cases = new Map(loadCases(assets).map((c) => [c.id, c]));
  const judged: Judged[] = [];
  let skipped = 0;
  for (const line of readFileSync(join(resultsDir, "samples.jsonl"), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as SampleRow;
    const c = cases.get(row.id);
    if (!c) throw new Error(`${resultsDir}/samples.jsonl: case "${row.id}" is not in ${assets}`);
    const s = row.scores;
    const text = row.lesson ?? (row.rejected_lesson === null ? null : lessonText(row.rejected_lesson));
    if (!s || text === null || c.class === "lesson-update" || typeof s.reusable !== "number" || typeof s.nonRedundancy !== "number" || typeof s.grounding !== "number") {
      if (s) skipped++;
      continue;
    }
    judged.push({ id: row.id, scores: { reusable: s.reusable, nonRedundancy: s.nonRedundancy, grounding: s.grounding }, actual: actual(row), good: c.expect === "lesson" && checkLesson(c, text, c.memory).good });
  }
  return { judged, skipped };
}

function main(): void {
  const args = Bun.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const all: Judged[] = [];
  let skipped = 0;
  for (const dir of args) {
    let r: ReturnType<typeof judgedLessons>;
    try {
      r = judgedLessons(resolve(dir));
    } catch (e) {
      console.error(`pass-bar: ${(e as Error).message}`);
      process.exit(2);
    }
    all.push(...r.judged.map((j) => ({ ...j, id: `${dir.split("/").pop()}/${j.id}` })));
    skipped += r.skipped;
  }
  console.log(JSON.stringify({ ...report(all), skipped_without_text: skipped }, null, 2));
}

if (import.meta.main) main();
