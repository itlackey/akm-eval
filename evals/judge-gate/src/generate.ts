#!/usr/bin/env bun
// judge-gate generate: makes the private cases from the public ones with lib/rewrite.
//
//   evals/judge-gate/generate --seed N --out private/judge-gate
//
// Every case's text goes through one rewrite map: the proposal's source, candidate and feedback first, then
// the reason for its label, so a name changes the same way in all of them and each case's diff is kept.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Case, parseCases } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

const dirOf = (base: string, i: number) => join(base, String(i + 1).padStart(4, "0"));

/** One folder per case, one file per text, so the rewrite sees real lines and not JSON escapes. */
export function explode(cases: Case[], corpusDir: string, labelsDir: string): void {
  cases.forEach((c, i) => {
    const corpus = dirOf(corpusDir, i);
    const labels = dirOf(labelsDir, i);
    mkdirSync(corpus, { recursive: true });
    mkdirSync(labels, { recursive: true });
    writeFileSync(join(corpus, "id.txt"), c.id);
    writeFileSync(join(corpus, "source.md"), c.source);
    writeFileSync(join(corpus, "candidate.md"), c.candidate);
    writeFileSync(join(corpus, "feedback.txt"), c.feedback);
    writeFileSync(join(labels, "reason.txt"), c.labelReason ?? "");
  });
}

/** The cases again, with the rewritten texts. The label, the set, the kind and the canary are kept. */
export function assemble(cases: Case[], corpusDir: string, labelsDir: string): Case[] {
  const read = (dir: string, name: string) => {
    const file = join(dir, name);
    if (!existsSync(file)) throw new Error(`the rewrite did not write ${file}`);
    return readFileSync(file, "utf8");
  };
  return cases.map((c, i) => {
    const corpus = dirOf(corpusDir, i);
    const labels = dirOf(labelsDir, i);
    return {
      ...c,
      id: read(corpus, "id.txt"),
      labelReason: read(labels, "reason.txt"),
      feedback: read(corpus, "feedback.txt"),
      source: read(corpus, "source.md"),
      candidate: read(corpus, "candidate.md"),
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
    console.error("Usage: evals/judge-gate/generate --seed N --out private/judge-gate");
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
  const summary = rewrite(["--map", map, join(work, "labels"), join(work, "labels-out")]);

  const rewritten = assemble(cases, join(work, "corpus-out"), join(work, "labels-out"));
  rmSync(assets, { recursive: true, force: true });
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, "cases.jsonl"), `${rewritten.map((c) => JSON.stringify(c)).join("\n")}\n`);
  rmSync(work, { recursive: true, force: true });
  console.log(`judge-gate: ${rewritten.length} cases written to ${join(values.out, "assets", "cases.jsonl")}`);
  console.log(summary.split("\n").pop());
}

if (import.meta.main) main();
