import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetsDigest, generatorSha256, readGenerated } from "../../consolidate/src/inputs.ts";
import { checkRewrite } from "./generate.ts";
import { type DistillItem, GENERATOR_CODE, type Night, loadNight, nightFiles, nightProblems } from "./lib.ts";

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
    expect(checkRewrite(publicNight, { ...publicNight, items: publicNight.items.slice(1) })).toEqual(["34 items were written, and there are 35"]);
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

  test("names a contradiction that is now in the memory, and one that no longer is", () => {
    const worthy = publicNight.items.find((i) => i.id === "lesson-01") as DistillItem;
    const turned = copy(publicNight);
    turned.files.set(worthy.memory, `${turned.files.get(worthy.memory)}\nWait for networkidle on the page.\n`);
    expect(checkRewrite(publicNight, turned)).toEqual(['lesson-01: the contradiction "=wait for networkidle" is now in its memory']);
    // the other way round: the public night's memory states the contradiction, and the rewritten one does not
    const stated = copy(publicNight);
    stated.files.set(worthy.memory, `${stated.files.get(worthy.memory)}\nWait for networkidle on the page.\n`);
    expect(checkRewrite(stated, copy(publicNight))).toEqual(['lesson-01: the contradiction "=wait for networkidle" is no longer in its memory']);
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
    expect(done.stdout.toString()).toContain("35 items written to");
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
    // it says which seed and which public night the set was made from, and leaves no temporary folder behind
    const publicAssets = join(import.meta.dir, "..", "assets");
    expect(readGenerated(out)).toEqual({ seed: "42", inputs_sha256: assetsDigest(publicAssets, nightFiles(publicAssets)), generator_sha256: generatorSha256(GENERATOR_CODE) });
    expect(readdirSync(out).sort()).toEqual(["assets", "generated.json", "map.json"]);
  });

  test("rewrites the contradicts of a lesson with the map that rewrites its required and forbidden, and keeps their groups", () => {
    const out = temp();
    expect(generate("42", out).exitCode).toBe(0);
    const night = loadNight(join(out, "assets"));
    const lessons = night.items.filter((i): i is DistillItem => i.kind === "distill");
    const was = publicNight.items.filter((i): i is DistillItem => i.kind === "distill");
    expect(lessons.map((i) => i.contradicts.map((g) => g.length))).toEqual(was.map((i) => i.contradicts.map((g) => g.length)));
    // a number in all three lists, put through the night's own map, comes out as the same number: the lists are rewritten alike
    const items = join(temp(), "items.jsonl");
    writeFileSync(items, `${JSON.stringify({ required: [["30"]], forbidden: [["capped at 30"]], contradicts: [["not capped at 30", "returns all 30 by default"]] })}\n`);
    const rewritten = join(temp(), "items.jsonl");
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "..", "..", "..", "lib", "rewrite", "rewrite.ts"), "--map", join(out, "map.json"), "--min-count", "1000000", items, rewritten], { stdout: "pipe", stderr: "pipe" });
    expect(done.exitCode).toBe(0);
    const row = JSON.parse(readFileSync(rewritten, "utf8")) as { required: string[][]; forbidden: string[][]; contradicts: string[][] };
    const n = (row.required[0] as string[])[0] as string;
    expect(n).not.toBe("30");
    expect(row.forbidden).toEqual([[`capped at ${n}`]]);
    expect(row.contradicts).toEqual([[`not capped at ${n}`, `returns all ${n} by default`]]);
  });

  test("a new run replaces the old night, map and marker together", () => {
    const out = temp();
    expect(generate("1", out).exitCode).toBe(0);
    writeFileSync(join(out, "assets", "left-over.txt"), "from the first run");
    const first = readFileSync(join(out, "assets", "items.jsonl"), "utf8");
    expect(generate("2", out).exitCode).toBe(0);
    expect(readFileSync(join(out, "assets", "items.jsonl"), "utf8")).not.toBe(first);
    expect(readdirSync(join(out, "assets")).sort()).toEqual(["items.jsonl", "library"]);
    expect(readGenerated(out)?.seed).toBe("2");
    expect(JSON.parse(readFileSync(join(out, "map.json"), "utf8")).seed).toBe("2"); // the map is the second run's too
  });

  test("a run that fails leaves the previous night, map and marker as they were, and no temporary folder", () => {
    const out = temp();
    expect(generate("1", out).exitCode).toBe(0);
    const files = ["assets/items.jsonl", "map.json", "generated.json"];
    const before = Object.fromEntries(files.map((f) => [f, readFileSync(join(out, f), "utf8")]));
    const failed = generate("not-a-seed", out); // lib/rewrite refuses it after the temporary folder is made
    expect(failed.exitCode).not.toBe(0);
    expect(failed.stderr.toString()).toContain("--seed must be a non-negative integer");
    expect(Object.fromEntries(files.map((f) => [f, readFileSync(join(out, f), "utf8")]))).toEqual(before);
    expect(readdirSync(out).sort()).toEqual(["assets", "generated.json", "map.json"]);
    expect(loadNight(join(out, "assets")).items).toHaveLength(publicNight.items.length);
  });

  test("a first run that fails leaves nothing that a private run would take for a night", () => {
    const out = temp();
    expect(generate("not-a-seed", out).exitCode).not.toBe(0);
    expect(readdirSync(out)).toEqual([]);
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
