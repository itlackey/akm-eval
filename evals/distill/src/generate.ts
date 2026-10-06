#!/usr/bin/env bun
// distill generate: makes the private cases from the public ones with lib/rewrite.
//
//   evals/distill/generate --seed N --out private/distill
//
// The bundles go through the rewrite first, then cases.json with the same map, so a name changes the same way in a
// memory, in a file name and in what a correct lesson must state. Then each case is checked against the public one.

import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type LoadedCase, checkLesson, lessonFile, loadCases, memoryBody, mentions } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

const files = (c: LoadedCase): number => readdirSync(c.dir, { recursive: true }).length;

/**
 * What the rewrite must keep, case by case: which required facts and forbidden claims its memory body matches, how its
 * two example lessons score, whether the lesson distill would write already exists, and how many files it has.
 * Returns what changed. A rewrite that changes none of these keeps the case as hard as it was.
 */
export function checkRewrite(before: LoadedCase[], after: LoadedCase[]): string[] {
  const problems: string[] = [];
  if (before.length !== after.length) return [`${after.length} cases were written, and there are ${before.length}`];
  before.forEach((b, i) => {
    const a = after[i];
    const note = (message: string) => problems.push(`${b.id}: ${message}`);
    if (a.id !== b.id || a.class !== b.class) return note(`came back as ${a.id}, ${a.class}`);
    b.required.forEach((fact, k) => {
      const was = fact.some((p) => mentions(memoryBody(b.memory), p));
      const now = a.required[k].some((p) => mentions(memoryBody(a.memory), p));
      if (was !== now) note(`the required fact "${a.required[k][0]}" ${now ? "is now" : "is no longer"} in its memory`);
    });
    b.forbidden.forEach((group, k) => {
      const was = group.some((p) => mentions(memoryBody(b.memory), p));
      const now = a.forbidden[k].some((p) => mentions(memoryBody(a.memory), p));
      if (was !== now) note(`the forbidden claim "${a.forbidden[k][0]}" ${now ? "is now" : "is no longer"} in its memory`);
    });
    for (const key of ["good", "bad"] as const) {
      if (b[key] === undefined) continue;
      const was = checkLesson(b, b[key] as string, b.memory).good;
      const now = checkLesson(a, a[key] as string, a.memory).good;
      if (was !== now) note(`the ${key} example lesson ${now ? "now passes" : "no longer passes"}`);
    }
    if (existsSync(join(b.dir, lessonFile(b))) !== existsSync(join(a.dir, lessonFile(a)))) note("the lesson at the ref distill writes to was lost or added");
    if (files(b) !== files(a)) note(`it has ${files(a)} files, and the public case has ${files(b)}`);
  });
  return problems;
}

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

function main(): void {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/distill/generate --seed N --out private/distill");
    process.exit(2);
  }
  const out = resolve(values.out);
  const assets = join(out, "assets");
  const map = join(out, "map.json");
  const clear = () => {
    rmSync(assets, { recursive: true, force: true });
    rmSync(map, { force: true });
  };

  clear();
  rewrite(["--seed", values.seed, "--map", map, join(EVAL_DIR, "assets", "bundles"), join(assets, "bundles")]);
  const summary = rewrite(["--map", map, join(EVAL_DIR, "assets", "cases.json"), join(assets, "cases.json")]);

  let problems: string[];
  try {
    problems = checkRewrite(loadCases(join(EVAL_DIR, "assets")), loadCases(assets));
  } catch (e) {
    problems = [(e as Error).message];
  }
  if (problems.length > 0) {
    clear();
    console.error(`distill: the rewrite changed ${problems.length} thing${problems.length === 1 ? "" : "s"} it must keep, so nothing was written:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`distill: ${loadCases(assets).length} cases written to ${join(values.out, "assets")}`);
  console.log(summary.split("\n").pop());
}

if (import.meta.main) main();
