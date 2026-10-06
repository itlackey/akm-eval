import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRewrite } from "./generate.ts";
import { type DistillItem, type Night, loadNight, nightProblems } from "./lib.ts";

const publicNight = loadNight(join(import.meta.dir, "..", "assets"));

const dirs: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), "nightly-generate-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const generate = (seed: string, out: string) => Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts"), "--seed", seed, "--out", out], { stdout: "pipe", stderr: "pipe" });
const copy = (night: Night): Night => ({ items: structuredClone(night.items), files: new Map(night.files) });

describe("checkRewrite", () => {
  test("is empty for the night as it is", () => {
    expect(checkRewrite(publicNight, copy(publicNight))).toEqual([]);
  });

  test("names an item that came back as another, and one with another number of files", () => {
    const other = copy(publicNight);
    (other.items[0] as { id: string }).id = "changed";
    expect(checkRewrite(publicNight, other)).toEqual([`${publicNight.items[0]?.id}: came back as changed, pair`]);
    const fewer = copy(publicNight);
    (fewer.items[0] as { files: string[] }).files = ["only-one.md"];
    expect(checkRewrite(publicNight, fewer)[0]).toContain("it has 1 files, and the public item has 2");
    expect(checkRewrite(publicNight, { ...publicNight, items: publicNight.items.slice(1) })).toEqual(["28 items were written, and there are 29"]);
  });

  test("names a required fact that is no longer in the memory, and a forbidden claim that is now in it", () => {
    const worthy = publicNight.items.find((i) => i.id === "lesson-01") as DistillItem;
    const rewritten = copy(publicNight);
    const text = (rewritten.files.get(worthy.memory) as string).replace(/poll\w*/g, "ask");
    rewritten.files.set(worthy.memory, `${text}\nUse waitForSelector on the heading.\n`);
    expect(checkRewrite(publicNight, rewritten)).toEqual([
      'lesson-01: the required fact "poll" is no longer in its memory',
      'lesson-01: the forbidden claim "waitForSelector" is now in its memory',
    ]);
  });

  test("names a lesson at the ref distill writes to that was lost", () => {
    const dup = publicNight.items.find((i) => i.id === "dup-04") as DistillItem;
    const rewritten = copy(publicNight);
    (rewritten.items.find((i) => i.id === "dup-04") as DistillItem).files = [dup.memory, "lessons/memory-export-csv-test-explicit-wait-lesson.md"];
    expect(checkRewrite(publicNight, rewritten)).toEqual(["dup-04: the lesson at the ref distill writes to was lost or added"]);
  });
});

describe("generate", () => {
  test("makes a private night from a seed: the same items and files, rewritten, and one that passes the checks the public night does", () => {
    const out = temp();
    const done = generate("42", out);
    expect(done.exitCode).toBe(0);
    expect(done.stdout.toString()).toContain("29 items written to");
    expect(existsSync(join(out, "map.json"))).toBe(true);
    const night = loadNight(join(out, "assets"));
    expect(nightProblems(night)).toEqual([]);
    expect(checkRewrite(publicNight, night)).toEqual([]);
    expect(night.items.map((i) => [i.id, i.kind])).toEqual(publicNight.items.map((i) => [i.id, i.kind]));
    expect(night.files.size).toBe(publicNight.files.size);
    // the names of tools are rewritten in paths, notes and feedback alike
    expect([...night.files.keys()].some((p) => /playwright|opencode/i.test(p))).toBe(false);
    expect(JSON.stringify(night.items)).not.toMatch(/playwright/i);
    const same = [...night.files.entries()].filter(([path, text]) => publicNight.files.get(path) === text).length;
    expect(same).toBeLessThan(night.files.size / 2);
    expect(readFileSync(join(out, "assets", "items.jsonl"), "utf8")).not.toBe(readFileSync(join(import.meta.dir, "..", "assets", "items.jsonl"), "utf8"));
  });

  test("the same seed gives the same night, and another seed another", () => {
    const [a, b, c] = [temp(), temp(), temp()];
    for (const [seed, out] of [["7", a], ["7", b], ["8", c]] as const) expect(generate(seed, out).exitCode).toBe(0);
    const read = (out: string) => readFileSync(join(out, "assets", "items.jsonl"), "utf8");
    expect(read(a)).toBe(read(b));
    expect(read(a)).not.toBe(read(c));
  });

  test("says what it needs when the arguments are missing", () => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts")], { stdout: "pipe", stderr: "pipe" });
    expect(done.exitCode).toBe(2);
    expect(done.stderr.toString()).toContain("Usage: evals/nightly/generate --seed N --out private/nightly");
  });
});
