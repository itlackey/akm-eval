#!/usr/bin/env bun
// consolidate generate: makes the private cases from the public ones with lib/rewrite.
//
//   evals/consolidate/generate --seed N --out private/consolidate
//
// Every text of every case goes through one rewrite map: the notes and their names first, then the claims and the
// reasons, so a name changes the same way in all of them. The claims and the reasons may not add names to the map: a word
// that the notes did not make a name must stay a word in them, so the claims stay word for word in the notes. Then it
// checks that each deciding claim is still in the note it belongs to, and in no other.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Case, claimProblems, parseCases } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

const dirOf = (base: string, i: number) => join(base, String(i + 1).padStart(4, "0"));
const asPath = (name: string) => `memories/${name.replaceAll("-", "/")}`;
const fromPath = (path: string) => path.replace(/^memories\//, "").replaceAll("/", "-");

/**
 * One folder per case, one file per text, so the rewrite sees real lines and not JSON escapes. A name is written as a path,
 * memories/some/name, because the rewrite takes a lowercase use of a word for a sign that it is a common word, and a word in a
 * path does not count.
 */
export function explode(cases: Case[], corpusDir: string, labelsDir: string): void {
  cases.forEach((c, i) => {
    const corpus = dirOf(corpusDir, i);
    const labels = dirOf(labelsDir, i);
    mkdirSync(corpus, { recursive: true });
    mkdirSync(labels, { recursive: true });
    writeFileSync(join(corpus, "a.md"), c.a.text);
    writeFileSync(join(corpus, "b.md"), c.b.text);
    writeFileSync(join(corpus, "names.txt"), `${asPath(c.a.name)}\n${asPath(c.b.name)}\n`);
    writeFileSync(join(labels, "why.txt"), c.why);
    c.claims.forEach((claim, k) => writeFileSync(join(labels, `claim-${k + 1}.txt`), claim.text));
  });
}

/** The cases again, with the rewritten texts. The relation, the dates, the safe sides, the sides of the claims and the canary are kept. */
export function assemble(cases: Case[], corpusDir: string, labelsDir: string): Case[] {
  const read = (dir: string, name: string) => {
    const file = join(dir, name);
    if (!existsSync(file)) throw new Error(`the rewrite did not write ${file}`);
    return readFileSync(file, "utf8");
  };
  return cases.map((c, i) => {
    const corpus = dirOf(corpusDir, i);
    const labels = dirOf(labelsDir, i);
    const [a, b] = read(corpus, "names.txt").split("\n").map(fromPath);
    return {
      ...c,
      why: read(labels, "why.txt"),
      claims: c.claims.map((claim, k) => ({ ...claim, text: read(labels, `claim-${k + 1}.txt`) })),
      a: { name: a, text: read(corpus, "a.md") },
      b: { name: b, text: read(corpus, "b.md") },
    };
  });
}

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

function main(): void {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/consolidate/generate --seed N --out private/consolidate");
    process.exit(2);
  }
  const out = resolve(values.out);
  const work = join(out, ".work");
  const assets = join(out, "assets");
  const map = join(out, "map.json");

  const cases = parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8"), "assets/cases.jsonl");
  rmSync(work, { recursive: true, force: true });
  rmSync(map, { force: true });
  explode(cases, join(work, "corpus"), join(work, "labels"));

  rewrite(["--seed", values.seed, "--map", map, join(work, "corpus"), join(work, "corpus-out")]);
  const summary = rewrite(["--map", map, "--min-count", "1000000", join(work, "labels"), join(work, "labels-out")]);

  const rewritten = assemble(cases, join(work, "corpus-out"), join(work, "labels-out"));
  rmSync(work, { recursive: true, force: true });
  const problems = rewritten.flatMap((c) => claimProblems(c).map((p) => `${c.id}: ${p}`));
  if (problems.length > 0) {
    console.error(`consolidate: the rewrite broke ${problems.length} deciding claim${problems.length === 1 ? "" : "s"}, so nothing was written:\n  ${problems.slice(0, 10).join("\n  ")}`);
    process.exit(1);
  }
  const text = `${rewritten.map((c) => JSON.stringify(c)).join("\n")}\n`;
  parseCases(text, "the rewritten cases"); // the names are still names, and so on
  rmSync(assets, { recursive: true, force: true });
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, "cases.jsonl"), text);
  console.log(`consolidate: ${rewritten.length} cases written to ${join(values.out, "assets", "cases.jsonl")}`);
  console.log(summary.split("\n").pop());
}

if (import.meta.main) main();
