#!/usr/bin/env bun
// distill generate: makes the private cases from the public ones with lib/rewrite.
//
//   evals/distill/generate --seed N --out private/distill
//
// The bundles go through the rewrite first, then cases.json with the same map, so a name changes the same way in a
// memory, in a file name and in what a correct lesson must state. Then each case is checked against the public one.
// Everything is written into a temporary folder and moved into place only when the checks pass, so a generation that
// fails leaves the earlier assets, map and generated.json as they were. generated.json holds the seed and the digest of the
// public assets and the digest of the code that made them (this file, lib.ts and lib/rewrite), and `run --corpus private` refuses assets
// without it, or with a digest that is no longer the public one or the generator's.

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { GENERATED, type Generated, type LoadedCase, assetsSha256, checkLesson, checkUpdate, generatorSha256, lessonFile, loadCases, memoryBody, mentions, stated } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

const files = (c: LoadedCase): number => readdirSync(c.dir, { recursive: true }).length;

/**
 * What the rewrite must keep, case by case: which required facts its memory body states and which forbidden claims and
 * contradictions it matches, how its example lessons (good, bad and reversed) score, whether the lesson distill would write
 * already exists, and how many files it has.
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
      const was = stated(memoryBody(b.memory), fact);
      const now = stated(memoryBody(a.memory), a.required[k]);
      if (was !== now) note(`the required fact "${a.required[k][0]}" ${now ? "is now" : "is no longer"} in its memory`);
    });
    b.forbidden.forEach((group, k) => {
      const was = group.some((p) => mentions(memoryBody(b.memory), p));
      const now = a.forbidden[k].some((p) => mentions(memoryBody(a.memory), p));
      if (was !== now) note(`the forbidden claim "${a.forbidden[k][0]}" ${now ? "is now" : "is no longer"} in its memory`);
    });
    b.contradicts.forEach((group, k) => {
      const was = group.some((p) => mentions(memoryBody(b.memory), p));
      const now = (a.contradicts[k] ?? []).some((p) => mentions(memoryBody(a.memory), p));
      if (was !== now) note(`the contradiction "${a.contradicts[k]?.[0]}" ${now ? "is now" : "is no longer"} in its memory`);
    });
    for (const key of ["good", "bad", "reversed"] as const) {
      if (b[key] === undefined) continue;
      // An update case's example is the whole updated body, scored against the existing lesson's body.
      const passes = (c: LoadedCase) => {
        if (c.expect !== "update") return checkLesson(c, c[key] as string, c.memory).good;
        const r = checkUpdate(c, c.existingBody ?? "", c[key] as string);
        return r.dropped.length === 0 && r.missing.length === 0 && r.forbidden.length === 0 && r.contradicted.length === 0;
      };
      const was = passes(b);
      const now = passes(a);
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

/**
 * Moves the assets, the map and generated.json from `work` into `out`, in place of the earlier ones. The marker goes out first and
 * comes in last, so a generation cut short here leaves assets with no marker, which `run --corpus private` refuses.
 */
export function install(work: string, out: string): void {
  rmSync(join(out, GENERATED), { force: true });
  rmSync(join(out, "assets"), { recursive: true, force: true });
  rmSync(join(out, "map.json"), { force: true });
  renameSync(join(work, "assets"), join(out, "assets"));
  renameSync(join(work, "map.json"), join(out, "map.json"));
  renameSync(join(work, GENERATED), join(out, GENERATED));
}

function main(): void {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/distill/generate --seed N --out private/distill");
    process.exit(2);
  }
  const out = resolve(values.out);
  const work = join(out, ".work"); // in the same folder as the result, so the rename stays on one disk
  const assets = join(work, "assets");
  const map = join(work, "map.json");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  let refused: string | undefined;
  try {
    rewrite(["--seed", values.seed, "--map", map, join(EVAL_DIR, "assets", "bundles"), join(assets, "bundles")]);
    const summary = rewrite(["--map", map, join(EVAL_DIR, "assets", "cases.json"), join(assets, "cases.json")]);

    let problems: string[];
    try {
      problems = checkRewrite(loadCases(join(EVAL_DIR, "assets")), loadCases(assets));
    } catch (e) {
      problems = [(e as Error).message];
    }
    if (problems.length > 0) {
      refused = `distill: the rewrite changed ${problems.length} thing${problems.length === 1 ? "" : "s"} it must keep, so nothing was written:\n  ${problems.join("\n  ")}`;
    } else {
      const generated: Generated = { seed: values.seed, inputs_sha256: assetsSha256(join(EVAL_DIR, "assets")), rewrite: generatorSha256() };
      writeFileSync(join(work, GENERATED), `${JSON.stringify(generated, null, 2)}\n`);
      const written = loadCases(assets).length;
      install(work, out);
      console.log(`distill: ${written} cases written to ${join(values.out, "assets")}`);
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
