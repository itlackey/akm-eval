#!/usr/bin/env bun
// reflect generate: makes the private cases from the public ones with lib/rewrite.
//
//   evals/reflect/generate --seed N --out private/reflect
//
// Every case's text goes through one rewrite map: the note, its path, the feedback and the terms first, then the
// defect and the correct result, so a name changes the same way in all of them. Each rewritten case must still
// hold the defect it names, and only that one, or the script stops and says which case lost it.
// Everything is written into a temporary folder and moved into place only when the checks pass, so a generation that
// fails leaves the earlier assets, map and generated.json as they were. generated.json holds the seed, the digest of the public cases and
// the digest of this file and of lib/rewrite (generator_sha256), and `run --corpus custom` refuses assets without it, with a digest that is
// no longer the public one, or made by a generator that has changed since.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Case, GENERATED, type Generated, assetsSha256, caseProblems, generatorSha256, parseCases } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

const dirOf = (base: string, i: number) => join(base, String(i + 1).padStart(4, "0"));
const lines = (items: string[] | undefined): string => (items ?? []).join("\n");
const unlines = (text: string): string[] | undefined => {
  const items = text.split("\n").filter((l) => l !== "");
  return items.length > 0 ? items : undefined;
};

/** One folder per case, one file per text, so the rewrite sees real lines and not JSON escapes. */
export function explode(cases: Case[], corpusDir: string, labelsDir: string): void {
  cases.forEach((c, i) => {
    const corpus = dirOf(corpusDir, i);
    const labels = dirOf(labelsDir, i);
    mkdirSync(corpus, { recursive: true });
    mkdirSync(labels, { recursive: true });
    writeFileSync(join(corpus, "path.txt"), c.path);
    writeFileSync(join(corpus, "source.md"), c.source);
    writeFileSync(join(corpus, "feedback.txt"), c.feedback);
    writeFileSync(join(corpus, "forbid.txt"), lines(c.forbid));
    writeFileSync(join(corpus, "anchors.txt"), lines(c.anchors));
    writeFileSync(join(labels, "defect.txt"), c.defect);
    writeFileSync(join(labels, "correct.txt"), c.correct);
  });
}

/** The cases again, with the rewritten texts. The id, the class, the fix, the allowed fields and the canary are kept. */
export function assemble(cases: Case[], corpusDir: string, labelsDir: string): Case[] {
  const read = (dir: string, name: string) => {
    const file = join(dir, name);
    if (!existsSync(file)) throw new Error(`the rewrite did not write ${file}`);
    return readFileSync(file, "utf8");
  };
  return cases.map((c, i) => {
    const corpus = dirOf(corpusDir, i);
    const labels = dirOf(labelsDir, i);
    const { forbid: _forbid, anchors: _anchors, ...rest } = c;
    const [forbid, anchors] = [unlines(read(corpus, "forbid.txt")), unlines(read(corpus, "anchors.txt"))];
    return {
      ...rest,
      path: read(corpus, "path.txt"),
      source: read(corpus, "source.md"),
      feedback: read(corpus, "feedback.txt"),
      ...(forbid ? { forbid } : {}),
      ...(anchors ? { anchors } : {}),
      defect: read(labels, "defect.txt"),
      correct: read(labels, "correct.txt"),
    };
  });
}

/** What the rewrite broke: for each case, how its note no longer fits the case. Empty when every defect is still there. */
export function rewriteProblems(cases: Case[]): string[] {
  return cases.flatMap((c) => caseProblems(c).map((p) => `${c.id}: ${p}`));
}

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

/**
 * Moves the assets, the map and generated.json from `staged` into `out`, in place of the earlier ones. The marker goes out first and
 * comes in last, so a generation cut short here leaves assets with no marker, which `run --corpus private` refuses.
 */
export function install(staged: string, out: string): void {
  rmSync(join(out, GENERATED), { force: true });
  rmSync(join(out, "assets"), { recursive: true, force: true });
  rmSync(join(out, "map.json"), { force: true });
  renameSync(join(staged, "assets"), join(out, "assets"));
  renameSync(join(staged, "map.json"), join(out, "map.json"));
  renameSync(join(staged, GENERATED), join(out, GENERATED));
}

function main(): void {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/reflect/generate --seed N --out private/reflect");
    process.exit(2);
  }
  const out = resolve(values.out);
  const work = join(out, ".work"); // in the same folder as the result, so the rename stays on one disk
  const staged = join(work, "staged");
  const map = join(staged, "map.json");

  const cases = parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8"), "assets/cases.jsonl");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });

  let refused: string | undefined;
  try {
    explode(cases, join(work, "corpus"), join(work, "labels"));
    rewrite(["--seed", values.seed, "--map", map, join(work, "corpus"), join(work, "corpus-out")]);
    const summary = rewrite(["--map", map, join(work, "labels"), join(work, "labels-out")]);

    const rewritten = assemble(cases, join(work, "corpus-out"), join(work, "labels-out"));
    const problems = rewriteProblems(rewritten);
    if (problems.length > 0) {
      refused = `reflect: the rewrite changed ${problems.length} thing${problems.length === 1 ? "" : "s"} the cases depend on. Nothing was written. Try another seed.\n  ${problems.join("\n  ")}`;
    } else {
      mkdirSync(join(staged, "assets"), { recursive: true });
      writeFileSync(join(staged, "assets", "cases.jsonl"), `${rewritten.map((c) => JSON.stringify(c)).join("\n")}\n`);
      const generated: Generated = { seed: values.seed, inputs_sha256: assetsSha256(join(EVAL_DIR, "assets")), generator_sha256: generatorSha256() };
      writeFileSync(join(staged, GENERATED), `${JSON.stringify(generated, null, 2)}\n`);
      install(staged, out);
      console.log(`reflect: ${rewritten.length} cases written to ${join(values.out, "assets", "cases.jsonl")}`);
      console.log(summary.split("\n").pop());
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  if (refused) {
    console.error(refused);
    process.exit(1);
  }
}

if (import.meta.main) main();
