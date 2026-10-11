import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetsSha256, loadCases } from "./lib.ts";
import { actual, judgedLessons, report, route } from "./pass-bar.ts";

const PUBLIC = join(import.meta.dir, "..", "assets");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

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

describe("judgedLessons", () => {
  const scores = { reusable: 5, nonRedundancy: 5, grounding: 5 };
  /** A repository root with a copy of the public distill corpus, and a run of it with a row for the first case that expects a lesson. */
  function fixture(summary: (digest: string) => Record<string, unknown> = (d) => ({ corpus: "public", assets_sha256: d }), id = loadCases(PUBLIC).find((c) => c.expect === "lesson")?.id as string) {
    const root = mkdtempSync(join(tmpdir(), "pass-bar-"));
    dirs.push(root);
    const assets = join(root, "evals", "distill", "assets");
    mkdirSync(join(root, "evals", "distill"), { recursive: true });
    cpSync(PUBLIC, assets, { recursive: true });
    const run = join(root, "run");
    mkdirSync(run);
    writeFileSync(join(run, "summary.json"), JSON.stringify(summary(assetsSha256(assets))));
    writeFileSync(join(run, "samples.jsonl"), `${JSON.stringify({ id, class: "lesson-worthy", outcome: "lesson", gate: "deferred/distill-review", scores, lesson: "A lesson.", rejected_lesson: null })}\n`);
    return { root, run, assets, id };
  }

  test("judges the lessons of a run on the cases it ran on", () => {
    const { root, run, id } = fixture();
    const r = judgedLessons(run, root);
    expect(r.judged.map((j) => j.id)).toEqual([id]);
    expect(r.judged[0]?.scores).toEqual(scores);
  });

  test("refuses to replay when the cases were changed since the run (R08)", () => {
    const { root, run, assets } = fixture();
    const file = join(assets, "cases.json");
    writeFileSync(file, readFileSync(file, "utf8").replace(/"note": ?"/, '"note": "changed '));
    expect(() => judgedLessons(run, root)).toThrow("other public cases");
  });

  test("refuses a summary whose input digest is not the corpus's, or that has none", () => {
    expect(() => judgedLessons(fixture(() => ({ corpus: "public", assets_sha256: "0".repeat(64) })).run, fixture().root)).toThrow("other public cases");
    const f = fixture(() => ({ corpus: "public" }));
    expect(() => judgedLessons(f.run, f.root)).toThrow("no assets_sha256");
  });

  test("names a row whose case is not in the corpus", () => {
    const { root, run } = fixture(undefined, "gone-case");
    expect(() => judgedLessons(run, root)).toThrow('case "gone-case" is not in');
  });
});
