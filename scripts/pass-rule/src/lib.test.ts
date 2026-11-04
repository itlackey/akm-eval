import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHIPPED_RULES, applyRule } from "../../../lib/judge.ts";
import { passRuleReport, routeUnder } from "./lib.ts";

const reflect = SHIPPED_RULES["reflect.quality"]!;
const lesson = SHIPPED_RULES["distill.lesson"]!;
const c = (need: number, preservation: number, quality: number) => ({ need, preservation, quality });
const l = (reusable: number, nonRedundancy: number, grounding: number) => ({ reusable, nonRedundancy, grounding });

describe("applyRule (akm's judgeQuality, by hand)", () => {
  test("reflect: every criterion at 4 or more passes; otherwise a mean of 3.5 or more is review, a lower one is refused; no criterion refuses on its own", () => {
    expect(applyRule(c(5, 4, 4), reflect)).toEqual({ pass: true, reviewNeeded: false });
    expect(applyRule(c(5, 5, 3), reflect)).toEqual({ pass: false, reviewNeeded: true }); // mean 4.33
    expect(applyRule(c(4, 3, 3), reflect)).toEqual({ pass: false, reviewNeeded: false }); // mean 3.33
    expect(applyRule(c(5, 3, 3), reflect)).toEqual({ pass: false, reviewNeeded: true }); // mean 3.67
    expect(applyRule(c(5, 2, 4), reflect)).toEqual({ pass: false, reviewNeeded: true }); // mean 3.67, a 2 among them: no floor
    expect(applyRule(c(4, 3, 3.5), reflect)).toEqual({ pass: false, reviewNeeded: true }); // mean 3.5 exactly
  });

  test("lesson: grounding is outside the mean and the pass test, and a criterion of 2 or less, grounding included, refuses", () => {
    expect(applyRule(l(4, 5, 3), lesson)).toEqual({ pass: true, reviewNeeded: false });
    expect(applyRule(l(3, 4, 5), lesson)).toEqual({ pass: false, reviewNeeded: true }); // mean 3.5
    expect(applyRule(l(2, 5, 5), lesson)).toEqual({ pass: false, reviewNeeded: false }); // a 2 refuses though the mean is 3.5
    expect(applyRule(l(5, 5, 2), lesson)).toEqual({ pass: false, reviewNeeded: false });
    expect(applyRule(l(3, 3, 1), lesson)).toEqual({ pass: false, reviewNeeded: false });
    expect(applyRule(l(3, 3, 5), { ...lesson, counted: ["reusable", "nonRedundancy", "grounding"] })).toEqual({ pass: false, reviewNeeded: true }); // mean 3.67
    expect(applyRule(l(5, 5, 3), { ...lesson, counted: ["reusable", "nonRedundancy", "grounding"] })).toEqual({ pass: false, reviewNeeded: true });
  });

  test("a counted criterion that is missing gives no verdict", () => {
    expect(applyRule({ need: 5, quality: 5 }, reflect)).toBeNull();
  });
});

describe("routeUnder", () => {
  test("a new lesson routes as pass, review or reject; an update on pass alone, so its review is a reject", () => {
    const row = (mode: string, criteria: Record<string, number>) => ({ mode, criteria });
    expect(routeUnder("lesson-judge", row("new", l(3, 4, 5)), lesson)).toBe("review");
    expect(routeUnder("lesson-judge", row("update", l(3, 4, 5)), lesson)).toBe("reject");
    expect(routeUnder("lesson-judge", row("update", l(4, 4, 1)), lesson)).toBe("reject");
    expect(routeUnder("lesson-judge", row("update", l(4, 4, 3)), lesson)).toBe("pass");
    expect(routeUnder("judge-gate", { criteria: c(5, 5, 3) }, reflect)).toBe("review");
    expect(routeUnder("judge-gate", { criteria: null }, reflect)).toBeNull();
  });
});

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function folder(evalName: string, rows: object[]): string {
  const dir = mkdtempSync(join(tmpdir(), "pass-rule-"));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "summary.json"), JSON.stringify({ eval: evalName }));
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n"));
  return dir;
}

describe("passRuleReport", () => {
  const rows = [
    { id: "a", label: "good", lane: "negative", outcome: "pass", criteria: c(5, 5, 5) },
    { id: "b", label: "good", lane: "negative", outcome: "review", criteria: c(5, 3, 3) },
    { id: "c", label: "bad", severity: "harmful", lane: "negative", outcome: "review", criteria: c(5, 3, 3) },
    { id: "d", label: "bad", severity: "churn", lane: "maintenance", outcome: "reject", criteria: c(4, 3, 3) },
    { id: "e", label: "bad", severity: "harmful", lane: "negative", outcome: "review", criteria: null }, // a judge that gave no verdict: left out
  ];

  test("counts the routes by label and group under the shipped rule and the tried one, and names the rows that move", () => {
    const r = passRuleReport([folder("judge-gate", rows)], (s) => ({ ...s, reviewAt: 3.6 }));
    expect([r.rows, r.without_criteria, r.reproduced.mismatch]).toEqual([4, 1, []]);
    expect(r.by_label.shipped).toEqual({ good: { pass: 1, review: 1, reject: 0 }, bad: { pass: 0, review: 1, reject: 1 } });
    expect(r.by_label.tried).toEqual({ good: { pass: 1, review: 1, reject: 0 }, bad: { pass: 0, review: 1, reject: 1 } }); // mean 3.67 is still 3.6 or more
    const strict = passRuleReport([folder("judge-gate", rows)], (s) => ({ ...s, reviewAt: 4 }));
    expect(strict.by_label.tried).toEqual({ good: { pass: 1, review: 0, reject: 1 }, bad: { pass: 0, review: 0, reject: 2 } });
    expect(strict.differ.map((d) => `${d.id}:${d.shipped}>${d.tried}`)).toEqual(["b:review>reject", "c:review>reject"]);
    expect(strict.routes.tried["harmful/negative"]).toEqual({ pass: 0, review: 0, reject: 1 });
  });

  test("a row whose stored route is not the shipped rule's is reported, and runs of two evals are refused", () => {
    const wrong = [{ id: "a", label: "good", lane: "negative", outcome: "reject", criteria: c(5, 5, 5) }];
    expect(passRuleReport([folder("judge-gate", wrong)], (s) => s).reproduced.mismatch).toMatchObject([{ id: "a", stored: "reject", shipped: "pass" }]);
    expect(() => passRuleReport([folder("judge-gate", rows), folder("lesson-judge", [])], (s) => s)).toThrow("runs before it are of judge-gate");
    const half = mkdtempSync(join(tmpdir(), "pass-rule-half-")); dirs.push(half);
    writeFileSync(join(half, "summary.json"), "{}");
    expect(() => passRuleReport([half], (s) => s)).toThrow(/has no samples\.jsonl$/);
    expect(() => passRuleReport([folder("reflect", [])], (s) => s)).toThrow("is a run of \"reflect\"");
  });

  test("the shipped rule reproduces every stored route of the committed baseline runs of judge-gate and lesson-judge", () => {
    const base = join(import.meta.dir, "..", "..", "..", "reports", "judge-baseline-2026-11-04");
    for (const name of ["judge-gate", "lesson-judge"]) {
      const runs = readdirSync(join(base, name)).filter((f) => /-r\d$/.test(f)).map((f) => join(base, name, f));
      expect(runs.length).toBe(3);
      const r = passRuleReport(runs, (s) => s);
      expect([name, r.without_criteria, r.reproduced.mismatch, r.differ]).toEqual([name, 0, [], []]);
      expect(r.rows).toBe(name === "judge-gate" ? 3 * 188 : 3 * 178);
    }
  });
});
