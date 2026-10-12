#!/usr/bin/env bun
// bakeoff generate: makes the private corpus from the public one with lib/rewrite.
//
//   evals/bakeoff/generate --seed N --out private/bakeoff
//
// The files the cases read are rewritten first, then cases.json with the same map, so a name changes the same way in a file, in a file name
// and in what a correct result must hold. Each rewritten case must still hold what it expects (every term of the public case is in its files,
// or still out of them, as it was) and every ref it expects must be the ref of one of its files, or the script stops and says which case lost it.
// Everything is written into a work folder in the output folder and moved into place only when the checks pass, so a generation that fails
// leaves the earlier assets, map and generated.json as they were. generated.json holds the seed.

import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES_FILE, GENERATED, loadCases, termProblems } from "./inputs.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

/** What the rewrite broke in the folder `assets`, made from the public `from`: for each case, what no longer fits it. Empty when every case holds what it did. */
export function rewriteProblems(assets: string, from: string): string[] {
  try {
    return termProblems(loadCases(assets), loadCases(from));
  } catch (e) {
    return [(e as Error).message];
  }
}

/**
 * Moves the assets, the map and generated.json from `staged` into `out`, in place of the earlier ones. The marker goes out first and
 * comes in last, so a generation cut short here leaves assets with no marker.
 */
export function install(staged: string, out: string): void {
  rmSync(join(out, GENERATED), { force: true });
  rmSync(join(out, "assets"), { recursive: true, force: true });
  rmSync(join(out, "map.json"), { force: true });
  renameSync(join(staged, "assets"), join(out, "assets"));
  renameSync(join(staged, "map.json"), join(out, "map.json"));
  renameSync(join(staged, GENERATED), join(out, GENERATED));
}

/** Makes the private corpus of `from` (the public assets) in `out`. Throws a message, and writes nothing, when the rewrite broke a case. */
export function generate(seed: string, out: string, from: string = join(EVAL_DIR, "assets")): { cases: number; summary: string } {
  mkdirSync(out, { recursive: true });
  const work = join(out, ".work"); // in the same folder as the result, so the rename stays on one disk
  const staged = join(work, "staged");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });
  try {
    // The files, without cases.json: the words in it must not decide which names are names.
    const corpus = join(work, "corpus");
    cpSync(from, corpus, { recursive: true });
    rmSync(join(corpus, CASES_FILE));
    const map = join(staged, "map.json");
    rewrite(["--seed", seed, "--map", map, corpus, join(staged, "assets")]);
    const summary = rewrite(["--map", map, join(from, CASES_FILE), join(staged, "assets", CASES_FILE)]);
    const problems = rewriteProblems(join(staged, "assets"), from);
    if (problems.length > 0) throw new Error(`the rewrite changed ${problems.length} thing${problems.length === 1 ? "" : "s"} the cases depend on. Nothing was written. Try another seed.\n  ${problems.join("\n  ")}`);
    writeFileSync(join(staged, GENERATED), `${JSON.stringify({ seed }, null, 2)}\n`);
    install(staged, out);
    return { cases: loadCases(join(out, "assets")).length, summary: summary.split("\n").pop() ?? "" };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function main(): void {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/bakeoff/generate --seed N --out private/bakeoff");
    process.exit(2);
  }
  if (!existsSync(join(EVAL_DIR, "assets", CASES_FILE)) || !readFileSync(join(EVAL_DIR, "assets", CASES_FILE), "utf8").trim()) {
    console.error("bakeoff: the public assets have no cases.json");
    process.exit(2);
  }
  try {
    const made = generate(values.seed, resolve(values.out));
    console.log(`bakeoff: ${made.cases} cases written to ${join(values.out, "assets", CASES_FILE)}`);
    console.log(made.summary);
  } catch (e) {
    console.error(`bakeoff: ${(e as Error).message}`);
    process.exit(1);
  }
}

if (import.meta.main) main();
