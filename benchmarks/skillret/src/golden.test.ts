import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts } from "../../../lib/manifest.ts";
import { CURATE_SEED } from "./score.ts";
import { SEED } from "./sample.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: ten queries in the dataset's shape, over a made-up library, and 12 raw outputs for them. Each is what akm
// answered to the calls of a query, as a run stores it: the ranked skill ids of each line and how long the calls took, the curate calls of the
// queries of the curate check, and the error of a call that failed. They cover a skill found first, sixth and not at all, two and three skills needed,
// a keyword search that returns nothing, a call that failed, a call that timed out, akm falling back to keyword search when asked for a semantic
// one, a skill returned twice, curate answering in another order, and a run that has the keyword line alone. See lib/golden.ts.
const GOLDEN = join(import.meta.dir, "..", "golden");
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN);
    expect(goldenProblems(MEASUREMENT, GOLDEN)).toEqual([]);
  });

  test("the raw outputs cover a hit first, in the middle and not at all, an empty answer, a failed call, a timeout, a fallback and a line that is alone", () => {
    const rows = lines("expected.jsonl");
    const ranks = rows.map((r) => r.search.ranked.findIndex((id: string) => r.relevant.includes(id)) + 1);
    expect(ranks).toEqual([1, 6, 3, 9, 0, 0, 0, 2, 1, 1, 5, 1]);
    expect(rows.find((r) => r.id === "g-empty").search.ranked).toEqual([]);
    expect(rows.find((r) => r.id === "g-empty").search.scores).toBeDefined(); // no results is a query that scored 0, and it counts
    expect(rows.filter((r) => r.search.error).map((r) => r.id)).toEqual(["g-broken"]);
    expect(rows.filter((r) => r.semantic_search?.timed_out).map((r) => r.id)).toEqual(["g-slow"]);
    expect(rows.find((r) => r.id === "g-fallback").semantic_search.error).toContain("fts-fallback");
    expect(rows.filter((r) => !r.semantic_search).length).toBe(2);
    expect(lines("raw.jsonl").length).toBe(rows.length);
    expect(rows.every((r, i) => r.id === lines("raw.jsonl")[i].case)).toBe(true);
  });

  test("the expected scores are SkillRet's: the scores of a skill sixth, and of a skill found twice, as pytrec_eval gives them (score.test.ts)", () => {
    const rows = lines("expected.jsonl");
    const late = rows.find((r) => r.id === "g-late").search.scores;
    expect([late["NDCG@5"], late["NDCG@10"], late["Recall@5"], late["Recall@10"], late["MAP@10"]].map((x: number) => Number(x.toFixed(4)))).toEqual([0, 0.3562, 0, 1, 0.1667]);
    // two skills needed, at the third place and the twelfth: NDCG@5 is 0.5 / (1 + 1/log2 3), NDCG@15 adds 1/log2 13, MAP@15 is (1/3 + 2/12) / 2
    const two = rows.find((r) => r.id === "g-two" && r.search.ranked.length === 15).search.scores;
    expect([two["NDCG@5"], two["NDCG@15"], two["Recall@5"], two["Recall@15"], two["Completeness@10"], two["Completeness@15"], two["MAP@5"], two["MAP@15"]].map((x: number) => Number(x.toFixed(4)))).toEqual([0.3066, 0.4723, 0.5, 1, 0, 1, 0.1667, 0.25]);
    const miss = rows.find((r) => r.id === "g-miss").search.scores;
    expect(Object.values(miss).every((x) => x === 0)).toBe(true);
    const repeated = rows.find((r) => r.id === "g-two" && r.search.ranked.length === 9).search.scores;
    expect(repeated["Completeness@5"]).toBe(1); // migrate, then indexes at the fourth distinct place, since the second migrate is dropped
    expect(rows.find((r) => r.id === "g-three").search.scores["Recall@10"]).toBeCloseTo(1 / 3, 10); // one of the three skills, at the ninth place
  });

  test("a failed call has no scores, and is left out of the line's numbers", () => {
    const rows = lines("expected.jsonl");
    const failed = rows.filter((r) => r.search.error || r.semantic_search?.error);
    expect(failed.map((r) => [r.id, r.search.scores !== undefined, r.semantic_search?.scores !== undefined])).toEqual([
      ["g-broken", false, true],
      ["g-slow", true, false],
      ["g-fallback", true, false],
    ]);
    const summary = MEASUREMENT.summarize(rows);
    expect(summary).toMatchObject({ n_queries: 12, errored: { search: 1, semantic_search: 2 }, timeouts: { search: 0, semantic_search: 1 }, no_results: { search: 1, semantic_search: 0 }, status: "aborted" });
    // one keyword search, two semantic searches (a timeout and a fallback) and one semantic curate call (a timeout)
    expect(summary.aborted_reason).toBe("4 akm calls failed, 2 of them by timing out. Their queries are left out of the numbers, or of the curate check: see the errors in samples.jsonl.");
  });

  test("the curate check compares curate with search on the queries that have a curate call, and counts the calls that failed", () => {
    const check = MEASUREMENT.summarize(lines("expected.jsonl")).curate_check;
    expect(check).toEqual({
      seed: 42,
      queries: ["g-form", "g-curate"],
      keyword: { compared: 2, same: 1, different: ["g-curate"], errored: 0, timeouts: 0 },
      semantic: { compared: 1, same: 1, different: [], errored: 1, timeouts: 1 },
    });
  });

  test("the seed the scorer records for the curate check is the one the collector draws it under", () => {
    expect(CURATE_SEED).toBe(SEED);
  });

  test("the summary takes the metrics from the rows, over all queries and by how many skills a query needs", () => {
    const summary = MEASUREMENT.summarize(lines("expected.jsonl"));
    expect(Object.keys(summary.by_size)).toEqual(["1", "2", "3"]);
    expect(summary.by_size["1"]?.n).toBe(9);
    expect(summary.by_size["2"]?.n).toBe(2);
    expect(summary.by_size["3"]?.n).toBe(1);
    expect(summary.metrics.search["Recall@15"]).toBe(0.7576); // (8 queries found all their skills, one a third, and two none) / 11: the query whose call failed is left out, and a miss counts
  });

  test("a stored row scores to itself again: rawOf reads the calls back and the scorer gives the row, scores included", () => {
    const cases = lines("cases.jsonl");
    for (const row of lines("expected.jsonl")) {
      const read = MEASUREMENT.rawOf(row);
      expect("raw" in read).toBe(true);
      expect(MEASUREMENT.score(cases.find((c) => c.id === row.id), (read as { raw: any }).raw)).toEqual(row);
    }
  });

  test("a row from before the scores were stored scores again to the row with them", () => {
    const cases = lines("cases.jsonl");
    for (const row of lines("expected.jsonl")) {
      const old = JSON.parse(JSON.stringify(row));
      delete old.search.scores;
      delete old.semantic_search?.scores;
      const read = MEASUREMENT.rawOf(old);
      expect(MEASUREMENT.score(cases.find((c) => c.id === row.id), (read as { raw: any }).raw)).toEqual(row);
    }
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "skillret-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives other scores for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (q, raw) => { const row = MEASUREMENT.score(q, raw); return q.id === "g-late" ? { ...row, search: { ...row.search, scores: { ...row.search.scores, "NDCG@10": 0.5 } } } : row; } };
    const problems = withCopy((dir) => goldenProblems(changed, dir));
    expect(problems).toEqual([`the scorer's row for raw.jsonl line 2 (g-late, "the skill is sixth by keyword and second by embedding") is not the expected one: search.scores.NDCG@10: expected 0.3562071871080222, got 0.5`]);
  });

  test("a scorer that gives the same rows passes, whatever its code", () => {
    const refactored: Measurement = { ...MEASUREMENT, score: (q, raw) => JSON.parse(JSON.stringify(MEASUREMENT.score(q, raw))) };
    expect(withCopy((dir) => goldenProblems(refactored, dir))).toEqual([]);
  });

  test("files made for another version of the scorer than the lock's fail until they are written again", () => {
    const live = lockedParts(MEASUREMENT).scorer.version; // whatever version the lock is at
    const problems = withCopy((dir) => {
      writeFileSync(join(dir, "scorer.json"), JSON.stringify({ scorer_version: live + 1 }));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems).toEqual([`scorer.json is for scorer version ${live + 1} and MEASUREMENT.lock has ${live}: look at the expected rows, and write them again with UPDATE_GOLDEN=1`]);
  });

  test("a raw output the scorer cannot read, a case that is not there and a missing file are named", () => {
    const problems = withCopy((dir) => {
      const raw = lines("raw.jsonl");
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { search: { ranked: "pdf-form-filler-2f9c" } } }, { ...raw[1], case: "no-such-case" }, ...raw.slice(2)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems.slice(0, 2)).toEqual([
      'raw.jsonl line 1 (g-form, "both lines put the skill first; curate agrees on both indexes"): the raw output lacks search.ranked, search.seconds',
      'raw.jsonl line 2 (no-such-case, "the skill is sixth by keyword and second by embedding"): the case is not in cases.jsonl',
    ]);
    expect(withCopy((dir) => (rmSync(join(dir, "expected.jsonl")), goldenProblems(MEASUREMENT, dir)))[0]).toContain("expected.jsonl is missing");
  });
});
