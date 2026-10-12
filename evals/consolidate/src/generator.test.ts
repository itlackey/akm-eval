// #44: generate records a digest of its own code, lib/rewrite included, in generated.json, and a run on the rewrite refuses assets made by a generator that has changed.

import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GENERATED, GENERATOR_CODE, assetsDigest, generatorSha256, privateAssetsProblem, readGenerated, rewriteFiles } from "./inputs.ts";
import { INPUT_FILES } from "./cases.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const PUBLIC = join(import.meta.dir, "..", "assets");

const dirs: string[] = [];
const temp = (prefix = "consolidate-generator-") => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A copy of the files the generator digest covers, in a checkout of its own. */
function checkout(): string {
  const root = temp("consolidate generator root-");
  for (const file of [...GENERATOR_CODE, ...rewriteFiles(ROOT), "lib/rewrite/rewrite.test.ts"]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(ROOT, file), join(root, file));
  }
  return root;
}

describe("generatorSha256", () => {
  test("covers the generator's own files and every .ts file of lib/rewrite, the lexicon included, and not the tests of the rewrite", () => {
    expect(GENERATOR_CODE).toEqual(["evals/consolidate/src/generate.ts", "evals/consolidate/src/inputs.ts", "evals/consolidate/src/cases.ts"]);
    expect(rewriteFiles(ROOT)).toEqual(["lib/rewrite/lexicon.ts", "lib/rewrite/rewrite.ts"]);
    expect(generatorSha256(GENERATOR_CODE)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is the same in another checkout of the same code, and changes with an edit to any file of the generator or of lib/rewrite", () => {
    const here = generatorSha256(GENERATOR_CODE);
    const root = checkout();
    expect(generatorSha256(GENERATOR_CODE, root)).toBe(here);
    for (const file of [...GENERATOR_CODE, "lib/rewrite/rewrite.ts", "lib/rewrite/lexicon.ts"]) {
      const other = checkout();
      writeFileSync(join(other, file), `${readFileSync(join(other, file), "utf8")}\n// an edit\n`);
      expect(generatorSha256(GENERATOR_CODE, other)).not.toBe(here);
    }
  });

  test("does not change with a test of lib/rewrite, or with a file of the eval that the generator does not use", () => {
    const here = generatorSha256(GENERATOR_CODE);
    const root = checkout();
    writeFileSync(join(root, "lib/rewrite/rewrite.test.ts"), "// a different test\n");
    mkdirSync(join(root, "evals/consolidate/src"), { recursive: true });
    writeFileSync(join(root, "evals/consolidate/src/collect.ts"), "// the collector\n");
    expect(generatorSha256(GENERATOR_CODE, root)).toBe(here);
  });
});

describe("a rewrite made by generate", () => {
  const generate = (out: string) => Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts"), "--seed", "42", "--out", out], { stdout: "pipe", stderr: "pipe" });
  const publicInputs = () => assetsDigest(PUBLIC, INPUT_FILES);
  const generator = () => generatorSha256(GENERATOR_CODE);
  const zero = (dir: string) => writeFileSync(join(dir, GENERATED), JSON.stringify({ ...readGenerated(dir), generator_sha256: "0".repeat(64) }));

  test("records the digest of the generator, and a run on it goes ahead; a zeroed digest is refused with the instruction to make the assets again", () => {
    const out = temp();
    const made = generate(out);
    expect(made.stderr.toString()).toBe("");
    expect(made.exitCode).toBe(0);
    expect(readGenerated(out)?.generator_sha256).toBe(generator());
    expect(JSON.parse(readFileSync(join(out, GENERATED), "utf8"))).toEqual({ seed: "42", inputs_sha256: publicInputs(), generator_sha256: generator() });
    expect(privateAssetsProblem("consolidate", out, "cases.jsonl", publicInputs, generator)).toBeNull();
    zero(out);
    const problem = privateAssetsProblem("consolidate", out, "cases.jsonl", publicInputs, generator);
    expect(problem).toBe("the private assets in private/consolidate were made by a generator that has changed since: evals/consolidate/src/generate.ts or a file it imports, or lib/rewrite (generator_sha256 in generated.json differs, or is missing): rerun ./generate-assets --only consolidate");
  });

  // The command, in a copy of the code and the public assets of its own, so that private/ is the copy's and never the repository's.
  const copyOfRepo = () => {
    const tree = temp("consolidate-tree-");
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(ROOT, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(ROOT, "evals", "consolidate", "src"), join(tree, "evals", "consolidate", "src"), { recursive: true, filter: keep });
    cpSync(PUBLIC, join(tree, "evals", "consolidate", "assets"), { recursive: true });
    copyFileSync(join(ROOT, "MEASUREMENT.lock"), join(tree, "MEASUREMENT.lock"));
    return tree;
  };
  const run = (tree: string, args: string[]) => {
    const { MODEL_BASE_URL: _u, MODEL_NAME: _m, AKM_BIN: _a, ...rest } = process.env;
    const done = Bun.spawnSync(["bun", join(tree, "evals", "consolidate", "src", "run.ts"), ...args], { cwd: tree, env: { ...rest, AKM_BIN: "no-such-akm-in-this-test", MODEL_BASE_URL: "http://localhost:1/v1", MODEL_NAME: "the-model" }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, err: done.stderr.toString() };
  };

  test("run --corpus custom refuses assets whose stored generator digest is zeroed, and goes on with freshly generated ones", () => {
    const tree = copyOfRepo();
    const out = join(tree, "private", "consolidate");
    expect(Bun.spawnSync(["bun", join(tree, "evals", "consolidate", "src", "generate.ts"), "--seed", "42", "--out", out], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
    const fresh = run(tree, ["--corpus", "custom"]);
    expect(fresh.err).toContain("could not run `no-such-akm-in-this-test --version`"); // it got past the check of the assets
    zero(out);
    const stale = run(tree, ["--corpus", "custom"]);
    expect(stale.code).toBe(2);
    expect(stale.err).toContain("were made by a generator that has changed since");
    expect(stale.err).toContain("rerun ./generate-assets --only consolidate");
    expect(stale.err).not.toContain("could not run");
  });
});
