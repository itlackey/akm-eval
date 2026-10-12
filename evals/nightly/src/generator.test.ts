// #44: generate records a digest of its own code, lib/rewrite included, in generated.json, and a run on the rewrite refuses assets made by a generator that has changed.

import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { GENERATED, assetsDigest, generatorSha256, privateAssetsProblem, readGenerated, rewriteFiles } from "../../consolidate/src/inputs.ts";
import { GENERATOR_CODE, nightFiles } from "./night.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const PUBLIC = join(import.meta.dir, "..", "assets");

const dirs: string[] = [];
const temp = (prefix = "nightly-generator-") => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A copy of the files the generator digest covers, in a checkout of its own. */
function checkout(): string {
  const root = temp("nightly generator root-");
  for (const file of [...GENERATOR_CODE, ...rewriteFiles(ROOT), "lib/rewrite/rewrite.test.ts"]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(ROOT, file), join(root, file));
  }
  return root;
}

describe("generatorSha256", () => {
  test("covers generate.ts, the files it reads the night with and takes its checks from, and every .ts file of lib/rewrite", () => {
    expect(GENERATOR_CODE).toContain("evals/nightly/src/generate.ts");
    expect(GENERATOR_CODE).toContain("evals/nightly/src/night.ts");
    expect(rewriteFiles(ROOT)).toEqual(["lib/rewrite/lexicon.ts", "lib/rewrite/rewrite.ts"]);
    expect(generatorSha256(GENERATOR_CODE)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("lists every file that generate.ts and the files it reads the night with import, so that a new import is not left out", () => {
    // generate.ts starts with a shebang, which the closure of lib/closure.ts cannot read, so the imports are read here
    const imports = (file: string): string[] => {
      const text = readFileSync(join(ROOT, file), "utf8").replace(/^#!.*\n/, "");
      return new Bun.Transpiler({ loader: "ts" }).scanImports(text).map((i) => i.path).filter((p) => p.startsWith("."));
    };
    const missing: string[] = [];
    for (const file of ["evals/nightly/src/generate.ts", "evals/nightly/src/night.ts", "evals/nightly/src/items.ts", "evals/nightly/src/library.ts"]) {
      for (const spec of imports(file)) {
        const target = posix.normalize(posix.join(posix.dirname(file), spec));
        if (!GENERATOR_CODE.includes(target)) missing.push(`${file} imports ${target}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("is the same in another checkout of the same code, and changes with an edit to any file of the generator or of lib/rewrite", () => {
    const here = generatorSha256(GENERATOR_CODE);
    expect(generatorSha256(GENERATOR_CODE, checkout())).toBe(here);
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
    writeFileSync(join(root, "evals/nightly/src/collect.ts"), "// the collector\n");
    writeFileSync(join(root, "evals/nightly/src/score.ts"), "// the scorer\n");
    expect(generatorSha256(GENERATOR_CODE, root)).toBe(here);
  });
});

describe("a rewrite made by generate", () => {
  const generate = (out: string) => Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts"), "--seed", "42", "--out", out], { stdout: "pipe", stderr: "pipe" });
  const publicInputs = () => assetsDigest(PUBLIC, nightFiles(PUBLIC));
  const generator = () => generatorSha256(GENERATOR_CODE);
  const zero = (dir: string) => writeFileSync(join(dir, GENERATED), JSON.stringify({ ...readGenerated(dir), generator_sha256: "0".repeat(64) }));

  test("records the digest of the generator, and a run on it goes ahead; a zeroed digest is refused with the instruction to make the assets again", () => {
    const out = temp();
    const made = generate(out);
    expect(made.stderr.toString()).toBe("");
    expect(made.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(out, GENERATED), "utf8"))).toEqual({ seed: "42", inputs_sha256: publicInputs(), generator_sha256: generator() });
    expect(privateAssetsProblem("nightly", out, "items.jsonl", publicInputs, generator)).toBeNull();
    zero(out);
    expect(privateAssetsProblem("nightly", out, "items.jsonl", publicInputs, generator)).toBe("the private assets in private/nightly were made by a generator that has changed since: evals/nightly/src/generate.ts or a file it imports, or lib/rewrite (generator_sha256 in generated.json differs, or is missing): rerun ./generate-assets --only nightly");
  });

  // The command, on a rewrite of its own: corpus.json beside the assets says it is a rewrite, as ./generate-assets writes it.
  const run = (args: string[]) => {
    const { MODEL_BASE_URL: _u, MODEL_NAME: _m, AKM_BIN: _a, ...rest } = process.env;
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { cwd: temp("nightly-run-"), env: { ...rest, AKM_BIN: "no-such-akm-in-this-test", MODEL_BASE_URL: "http://localhost:1/v1", MODEL_NAME: "the-model" }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, err: done.stderr.toString() };
  };

  test("run --corpus custom refuses assets whose stored generator digest is zeroed, and goes on with freshly generated ones", () => {
    const out = temp("nightly rewrite-");
    expect(generate(out).exitCode).toBe(0);
    writeFileSync(join(out, "corpus.json"), JSON.stringify({ kind: "rewrite", private: false, seed: "42", generated: "generated.json" }));
    const fresh = run(["--cases", join(out, "assets")]);
    expect(fresh.err).toContain("could not run `no-such-akm-in-this-test --version`"); // it got past the check of the assets
    zero(out);
    const stale = run(["--cases", join(out, "assets")]);
    expect(stale.code).toBe(2);
    expect(stale.err).toContain("were made by a generator that has changed since");
    expect(stale.err).toContain("rerun ./generate-assets --only nightly");
    expect(stale.err).not.toContain("could not run");
  });
});
