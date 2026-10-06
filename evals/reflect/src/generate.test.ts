import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble, explode, rewriteProblems } from "./generate.ts";
import { type Case, caseProblems, parseCases } from "./lib.ts";

const EVAL_DIR = join(import.meta.dir, "..");
const cases = parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8"));

const dirs: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), "reflect-generate-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const generate = (seed: string, out: string) => Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts"), "--seed", seed, "--out", out], { stdout: "pipe", stderr: "pipe" });
const read = (out: string): Case[] => parseCases(readFileSync(join(out, "assets", "cases.jsonl"), "utf8"));

describe("explode and assemble", () => {
  test("give the cases back as they were when nothing is rewritten, lists included", () => {
    const work = temp();
    const some = [cases.find((c) => c.class === "unsupported-ask"), cases.find((c) => c.class === "historical"), cases.find((c) => c.class === "title-missing")] as Case[];
    explode(some, join(work, "corpus"), join(work, "labels"));
    expect(assemble(some, join(work, "corpus"), join(work, "labels"))).toEqual(some);
  });

  test("take every text from the rewritten files and keep the rest", () => {
    const work = temp();
    const [first] = cases as [Case];
    explode([first], join(work, "corpus"), join(work, "labels"));
    Bun.write(join(work, "corpus", "0001", "feedback.txt"), "Rewritten feedback.");
    const [again] = assemble([first], join(work, "corpus"), join(work, "labels")) as [Case];
    expect(again.feedback).toBe("Rewritten feedback.");
    expect({ ...again, feedback: first.feedback }).toEqual(first);
  });
});

describe("rewriteProblems", () => {
  test("is empty for the cases as they are", () => {
    expect(rewriteProblems(cases)).toEqual([]);
  });

  test("names the case whose defect the rewrite took away, or that it changed into another", () => {
    const [period, , wtu] = cases as [Case, Case, Case];
    const cleaned = period.source.replace(".\n  ", " ");
    expect(rewriteProblems([{ ...period, source: cleaned }, wtu])).toEqual([`${period.id}: akm names nothing, not description-period`]);
    const other = wtu.source.replace(/^description:.*(?:\n[ \t].*)*/m, "description: Explains how to rotate keys and");
    expect(rewriteProblems([{ ...wtu, source: other }])).toEqual([`${wtu.id}: akm names description-truncated, when-to-use-missing, not when-to-use-missing`]);
  });

  test("names a forbidden term the rewrite put into the note", () => {
    const ask = cases.find((c) => c.class === "unsupported-ask") as Case;
    const said = { ...ask, source: ask.source.replace("\n# ", `\n${(ask.forbid ?? [])[0]}\n# `) };
    expect(caseProblems(said)).toEqual([`the note already says "${(ask.forbid ?? [])[0]}"`]);
    expect(rewriteProblems([said])).toEqual([`${ask.id}: the note already says "${(ask.forbid ?? [])[0]}"`]);
  });
});

describe("generate", () => {
  test("rewrites the cases with one map, and each still holds its defect", () => {
    const out = temp();
    const run = generate("7", out);
    expect(run.exitCode).toBe(0);
    const private_ = read(out);
    expect(private_).toHaveLength(cases.length);
    expect(rewriteProblems(private_)).toEqual([]);
    expect(private_.map((c) => [c.id, c.class, c.fix, c.allow, c.canary])).toEqual(cases.map((c) => [c.id, c.class, c.fix, c.allow, c.canary]));
    expect(private_.some((c, i) => c.source !== cases[i]?.source)).toBe(true);
    const map = JSON.parse(readFileSync(join(out, "map.json"), "utf8"));
    expect(map.seed).toBe("7");
    expect(map.dateShiftDays).toBeNumber();
  });

  test("moves a date the same way in the note and in the anchors that name it", () => {
    const out = temp();
    generate("7", out);
    const was = cases.find((c) => (c.anchors ?? []).includes("2025-11-08")) as Case;
    const now = read(out).find((c) => c.id === was.id) as Case;
    const [date] = now.anchors ?? [];
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(date).not.toBe("2025-11-08");
    expect(now.source).toContain(date as string);
    expect(now.source).not.toContain("2025-11-08");
  });

  test("gives the same cases for the same seed and other cases for another", () => {
    const [a, b, c] = [temp(), temp(), temp()] as [string, string, string];
    generate("7", a);
    generate("7", b);
    generate("8", c);
    expect(readFileSync(join(a, "assets", "cases.jsonl"), "utf8")).toBe(readFileSync(join(b, "assets", "cases.jsonl"), "utf8"));
    expect(readFileSync(join(a, "assets", "cases.jsonl"), "utf8")).not.toBe(readFileSync(join(c, "assets", "cases.jsonl"), "utf8"));
  });

  test("asks for a seed and an output folder", () => {
    const run = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts")], { stdout: "pipe", stderr: "pipe" });
    expect(run.exitCode).toBe(2);
    expect(run.stderr.toString()).toContain("Usage: evals/reflect/generate --seed N --out private/reflect");
  });
});
