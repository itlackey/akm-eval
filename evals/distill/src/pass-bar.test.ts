import { describe, expect, test } from "bun:test";
import { actual, report, route } from "./pass-bar.ts";

const s = (reusable: number, nonRedundancy: number, grounding: number) => ({ reusable, nonRedundancy, grounding });

describe("route", () => {
  test("the shipped bar passes a lesson whose reusable and nonRedundancy are 4 or more, whatever its grounding is above 2", () => {
    expect(route(s(5, 5, 5), "shipped")).toBe("pass");
    expect(route(s(5, 4, 3), "shipped")).toBe("pass"); // "one stretches what the source says"
    expect(route(s(5, 5, 4), "with-grounding")).toBe("pass");
    expect(route(s(5, 5, 3), "with-grounding")).toBe("review");
  });

  test("a score of 2 or less on any criterion rejects, grounding included, under both bars", () => {
    for (const bar of ["shipped", "with-grounding"] as const) {
      expect(route(s(5, 5, 2), bar)).toBe("reject");
      expect(route(s(2, 5, 5), bar)).toBe("reject");
      expect(route(s(5, 1, 5), bar)).toBe("reject");
    }
  });

  test("otherwise a mean of the counted criteria of 2.5 or more is review, and a lower one rejects", () => {
    expect(route(s(4, 3, 5), "shipped")).toBe("review");
    expect(route(s(3, 3, 5), "shipped")).toBe("review");
    expect(route(s(3, 3, 3), "with-grounding")).toBe("review");
  });
});

describe("actual", () => {
  test("reads the verdict akm gave from the outcome and the gate", () => {
    expect(actual({ outcome: "rejected", gate: null })).toBe("reject");
    expect(actual({ outcome: "lesson", gate: "deferred/distill-review" })).toBe("pass");
    expect(actual({ outcome: "lesson", gate: "deferred/quality-review" })).toBe("review");
    expect(actual({ outcome: "skipped", gate: null })).toBeUndefined();
  });
});

describe("report", () => {
  test("counts good and bad lessons by verdict under each bar, and the lessons the bars treat differently", () => {
    const r = report([
      { id: "a", scores: s(5, 5, 5), actual: "pass", good: true },
      { id: "b", scores: s(5, 5, 3), actual: "pass", good: false },
      { id: "c", scores: s(5, 5, 2), actual: "reject", good: false },
      { id: "d", scores: s(5, 5, 3), actual: "pass", good: true },
    ]);
    expect(r.n).toBe(4);
    expect(r.mismatch).toBe(0);
    expect(r.bars.shipped).toEqual({ pass: { good: 2, bad: 1 }, review: { good: 0, bad: 0 }, reject: { good: 0, bad: 1 } });
    expect(r.bars["with-grounding"]).toEqual({ pass: { good: 1, bad: 0 }, review: { good: 1, bad: 1 }, reject: { good: 0, bad: 1 } });
    expect(r.differ.map((d) => [d.id, d.shipped, d["with-grounding"]])).toEqual([["b", "pass", "review"], ["d", "pass", "review"]]);
  });

  test("counts a lesson whose recorded verdict is not the shipped bar's as a mismatch", () => {
    expect(report([{ id: "a", scores: s(5, 5, 5), actual: "review", good: true }]).mismatch).toBe(1);
    expect(report([{ id: "a", scores: s(5, 5, 5), good: true }]).mismatch).toBe(0);
  });
});
