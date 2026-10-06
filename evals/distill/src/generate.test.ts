import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRewrite } from "./generate.ts";
import { type LoadedCase, loadCases } from "./lib.ts";

const PUBLIC = join(import.meta.dir, "..", "assets");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function generate(seed: string, out = mkdtempSync(join(tmpdir(), "distill-generate-"))) {
  dirs.push(out);
  const p = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts"), "--seed", seed, "--out", out], { stdout: "pipe", stderr: "pipe" });
  return { out, code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

describe("generate", () => {
  test("writes the 30 cases and the map, with names changed and every check kept", () => {
    const { out, code, stdout } = generate("42");
    expect(code).toBe(0);
    expect(stdout).toContain("30 cases written");
    const cases = loadCases(join(out, "assets"));
    expect(cases).toHaveLength(30);
    expect(checkRewrite(loadCases(PUBLIC), cases)).toEqual([]);
    const words = JSON.parse(readFileSync(join(out, "map.json"), "utf8")).words as Record<string, string>;
    expect(Object.keys(words)).toEqual(expect.arrayContaining(["tallowmere", "marrowgate", "quillfeather", "fennwick"]));
    const text = cases.map((c) => c.memory).join("\n") + readFileSync(join(out, "assets", "cases.json"), "utf8");
    for (const name of ["Tallowmere", "Marrowgate", "Quillfeather", "Fennwick"]) expect(text).not.toContain(name);
    const publicMemory = loadCases(PUBLIC).find((c) => c.id === "claim-05") as LoadedCase;
    expect(cases.find((c) => c.id === "claim-05")?.memory).not.toBe(publicMemory.memory);
  });

  test("the same seed gives the same cases, and another seed other names", () => {
    const memories = (out: string) => loadCases(join(out, "assets")).map((c) => c.memory).join("\n");
    const a = generate("7");
    const b = generate("7");
    const c = generate("8");
    expect(memories(a.out)).toBe(memories(b.out));
    expect(memories(a.out)).not.toBe(memories(c.out));
    expect(readFileSync(join(a.out, "map.json"), "utf8")).toBe(readFileSync(join(b.out, "map.json"), "utf8"));
  });

  test("keeps the files of every case: the memory, the library asset and the lesson", () => {
    const { out } = generate("42");
    const list = (dir: string) => readdirSync(dir, { recursive: true }).map((f) => String(f).replace(/[^/]+$/, "").replace(/[a-z0-9-]+\//g, "x/"));
    expect(list(join(out, "assets", "bundles")).sort()).toEqual(list(join(PUBLIC, "bundles")).sort());
  });

  test("needs a seed and a folder", () => {
    const p = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts")], { stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(2);
    expect(p.stderr.toString()).toContain("Usage: evals/distill/generate --seed N --out private/distill");
  });
});

describe("checkRewrite", () => {
  const before = loadCases(PUBLIC);
  const copy = (id: string, change: (c: LoadedCase) => Partial<LoadedCase>) => before.map((c) => (c.id === id ? { ...c, ...change(c) } : c));

  test("a rewrite that changes nothing that matters has no problems", () => {
    expect(checkRewrite(before, before)).toEqual([]);
  });

  test("a required fact the memory no longer states", () => {
    const after = copy("lesson-01", (c) => ({ memory: c.memory.replace("polls its server", "asks its server") }));
    expect(checkRewrite(before, after)).toEqual(['lesson-01: the required fact "poll" is no longer in its memory']);
  });

  test("a forbidden claim the memory now makes", () => {
    const after = copy("claim-06", (c) => ({ memory: `${c.memory}It is negligible.\n` }));
    expect(checkRewrite(before, after)).toEqual(['claim-06: the forbidden claim "negligible" is now in its memory']);
  });

  test("an example lesson that scores differently", () => {
    const after = copy("lesson-01", (c) => ({ good: `${c.good} It is a waitForSelector.` }));
    expect(checkRewrite(before, after)).toEqual(["lesson-01: the good example lesson no longer passes"]);
    const worse = copy("lesson-01", () => ({ bad: "Do not wait for networkidle on a polling page; wait for the heading to be visible." }));
    expect(checkRewrite(before, worse)).toEqual(["lesson-01: the bad example lesson now passes"]);
  });

  test("a lesson at the ref distill writes to that is lost, and a case that came back changed", () => {
    const dup = before.find((c) => c.id === "dup-01") as LoadedCase;
    const lost = copy("dup-01", () => ({ name: `${dup.name}-renamed` }));
    expect(checkRewrite(before, lost)).toEqual(["dup-01: the lesson at the ref distill writes to was lost or added"]);
    expect(checkRewrite(before, copy("dup-01", () => ({ id: "dup-99" })))).toEqual(["dup-01: came back as dup-99, duplicate-lesson"]);
    expect(checkRewrite(before, before.slice(1))).toEqual(["29 cases were written, and there are 30"]);
  });
});
