// The golden tests of the scorer that evals/agent-ab and benchmarks/terminal-bench share (lib/harbor/score.ts), written once. Each eval's
// golden.test.ts calls `goldenSuite` with its measurement and its golden/ folder (the layout is in lib/golden.ts, with one file more):
//
//   summary.json  the fields of the summary that come from the rows (the report, the metrics, the timeouts, the errored trials) for the
//                 golden rows. It was first written from the code before the scorer was split from the collector, so it says that the split
//                 changed no number; after a deliberate change to the scorer, UPDATE_GOLDEN=1 writes it again with the expected rows.

import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../golden.ts";
import { type Measurement, lockedParts } from "../manifest.ts";
import type { Row } from "./score.ts";

const OPTIONS = { omit: ["trials"] };
const lines = (dir: string, file: string): any[] => readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

/** The rows the scorer gives for the raw outputs of the golden folder, in order. */
function scoredRows(m: Measurement, dir: string): Row[] {
  const cases = lines(dir, "cases.jsonl");
  return lines(dir, "raw.jsonl").map((line) => m.score(cases.find((c) => m.caseId(c) === line.case), (m.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw) as Row);
}

export function goldenSuite(m: Measurement, golden: string): void {
  describe(`the golden rows of the ${m.eval} scorer`, () => {
    test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
      if (process.env.UPDATE_GOLDEN === "1") {
        writeGolden(m, golden, OPTIONS);
        writeFileSync(join(golden, "summary.json"), `${JSON.stringify(m.summarize(scoredRows(m, golden)), null, 2)}\n`);
      }
      expect(goldenProblems(m, golden, OPTIONS)).toEqual([]);
    });

    test("the report, the metrics and the counts of the golden rows are the ones the code before the split gave their trials: the split changed no number", () => {
      const was = JSON.parse(readFileSync(join(golden, "summary.json"), "utf8"));
      expect(JSON.parse(JSON.stringify(m.summarize(scoredRows(m, golden))))).toEqual(was);
    });

    test("the raw outputs cover an error, a timeout, a trial the plugin was not live in, an empty log, an arm that never started and a task with no trial", () => {
      const trials = lines(golden, "raw.jsonl").flatMap((l) => l.raw.trials);
      expect(trials.some((t) => t.reward === null && t.error !== null && !t.timed_out)).toBe(true); // an error with no verdict
      expect(trials.some((t) => t.timed_out && t.reward !== null)).toBe(true); // out of time, verified all the same
      expect(trials.some((t) => t.timed_out && t.reward === null)).toBe(true); // out of time, no verdict
      expect(trials.some((t) => typeof t.plugin_problem === "string")).toBe(true);
      expect(trials.some((t) => t.akm === null && t.tokens === null)).toBe(true); // the trial left no log and no usage
      expect(trials.some((t) => t.arm === "akm" && Object.keys(t.akm ?? {}).length > 0)).toBe(true); // the agent called akm
      expect(lines(golden, "raw.jsonl").some((l) => l.raw.trials.length === 0)).toBe(true); // Harbor never started the task
      expect(lines(golden, "raw.jsonl").some((l) => new Set(l.raw.trials.map((t: any) => t.arm)).size === 1 && l.raw.trials.length > 0)).toBe(true); // one arm only
    });

    test("the expected rows agree with a plain count of the raw trials: a pass is a reward of 1, a trial without a reward is errored, and a task needs a reward in each arm", () => {
      const raw = lines(golden, "raw.jsonl");
      const expected = lines(golden, "expected.jsonl");
      expect(expected.map((r) => r.id)).toEqual(raw.map((l) => l.case));
      raw.forEach((line, i) => {
        const tally = (arm: string) => {
          const mine = line.raw.trials.filter((t: any) => t.arm === arm);
          return { trials: mine.length, scored: mine.filter((t: any) => t.reward !== null).length, passed: mine.filter((t: any) => t.reward === 1).length, errored: mine.filter((t: any) => t.reward === null).length, timed_out: mine.filter((t: any) => t.timed_out).length };
        };
        expect({ case: line.case, row: expected[i] }).toEqual({ case: line.case, row: { id: line.case, control: tally("control"), akm: tally("akm"), paired: tally("control").scored > 0 && tally("akm").scored > 0 } });
        expect({ case: line.case, errored: m.errored(expected[i]) }).toEqual({ case: line.case, errored: !expected[i].paired });
      });
    });

    test("the rows give the same summary in any order, since the trials are read in the order of their names", () => {
      const rows = scoredRows(m, golden);
      expect(m.summarize([...rows].reverse())).toEqual(m.summarize(rows));
    });
  });

  describe(`what a change to the ${m.eval} scorer does to the golden test`, () => {
    /** The golden folder in a temp folder, so a test can change its files. */
    function withCopy<T>(run: (dir: string) => T): T {
      const dir = mkdtempSync(join(tmpdir(), "harbor-golden-"));
      try {
        cpSync(golden, dir, { recursive: true });
        return run(dir);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    test("a scorer that counts one more pass fails the test and names the line, the case and the field", () => {
      const changed: Measurement = { ...m, score: (c, raw) => ((row: any) => ({ ...row, akm: { ...row.akm, passed: row.akm.passed + 1 } }))(m.score(c, raw)) };
      const problems = withCopy((dir) => goldenProblems(changed, dir, OPTIONS));
      const first = lines(golden, "raw.jsonl")[0];
      expect(problems).toHaveLength(lines(golden, "raw.jsonl").length);
      expect(problems[0]).toMatch(new RegExp(`^the scorer's row for raw\\.jsonl line 1 \\(${first.case}, ${JSON.stringify(first.note).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) is not the expected one: akm\\.passed: expected \\d+, got \\d+`));
    });

    test("a scorer that gives the same rows passes, whatever its code", () => {
      const refactored: Measurement = { ...m, score: (c, raw) => JSON.parse(JSON.stringify(m.score(c, raw))) };
      expect(withCopy((dir) => goldenProblems(refactored, dir, OPTIONS))).toEqual([]);
    });

    test("files made for another version of the scorer than the lock's fail until they are written again", () => {
      const live = lockedParts(m).scorer.version; // whatever version the lock is at
      const problems = withCopy((dir) => {
        writeFileSync(join(dir, "scorer.json"), JSON.stringify({ scorer_version: live + 1 }));
        return goldenProblems(m, dir, OPTIONS);
      });
      expect(problems).toEqual([`scorer.json is for scorer version ${live + 1} and MEASUREMENT.lock has ${live}: look at the expected rows, and write them again with UPDATE_GOLDEN=1`]);
    });

    test("a raw output the scorer cannot read and a case that is not there are named", () => {
      const problems = withCopy((dir) => {
        const raw = lines(dir, "raw.jsonl");
        const broken = { ...raw[0], raw: { trials: [{ task: raw[0].case, arm: "akm", trial: "x" }] } };
        writeFileSync(join(dir, "raw.jsonl"), [broken, { ...raw[1], case: "no-such-case" }, ...raw.slice(2)].map((l) => `${JSON.stringify(l)}\n`).join(""));
        return goldenProblems(m, dir, OPTIONS);
      });
      expect(problems.slice(0, 2)).toEqual([
        `raw.jsonl line 1 (${lines(golden, "raw.jsonl")[0].case}, ${JSON.stringify(lines(golden, "raw.jsonl")[0].note)}): the raw output lacks trials[].reward, trials[].error, trials[].akm`,
        `raw.jsonl line 2 (no-such-case, ${JSON.stringify(lines(golden, "raw.jsonl")[1].note)}): the case is not in cases.jsonl`,
      ]);
    });
  });
}
