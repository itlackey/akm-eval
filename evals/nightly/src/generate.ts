#!/usr/bin/env bun
// nightly generate: makes the private night from the public one with lib/rewrite.
//
//   evals/nightly/generate --seed N --out private/nightly
//
// The library goes through the rewrite first, and items.jsonl after it with the same map, so a name, a path, a number or a
// version changes the same way in a note, in a file name, in a claim, in a feedback and in what a correct result must say. The
// items may not add names to the map. Then the private night is checked against the public one, as the consolidate, reflect and
// distill evals check theirs: every file is where its item says, each deciding claim is still in its note and in no other, each
// planted defect is still there and only that one, each exact fix still applies once, and each distill case still matches the
// facts and claims it did.

import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { lessonFile, memoryBody, mentions } from "../../distill/src/lib.ts";
import { type DistillItem, type Night, loadNight, nightProblems } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

const nameOf = (memory: string): string => memory.replace(/^memories\//, "").replace(/\.md$/, "");

/** What the rewrite must keep, item by item. Returns what changed. A rewrite that changes none of these keeps every item as hard as it was. */
export function checkRewrite(before: Night, after: Night): string[] {
  const problems: string[] = [];
  if (before.items.length !== after.items.length) return [`${after.items.length} items were written, and there are ${before.items.length}`];
  before.items.forEach((b, i) => {
    const a = after.items[i];
    const note = (message: string) => problems.push(`${b.id}: ${message}`);
    if (!a || a.id !== b.id || a.kind !== b.kind) return note(`came back as ${a?.id}, ${a?.kind}`);
    if (a.files.length !== b.files.length) note(`it has ${a.files.length} files, and the public item has ${b.files.length}`);
    if (b.kind !== "distill" || a.kind !== "distill") return;
    const [was, now] = [memoryBody(before.files.get(b.memory) as string), memoryBody(after.files.get(a.memory) as string)];
    const groups = (key: "required" | "forbidden") =>
      b[key].forEach((group, k) => {
        const [x, y] = [group.some((p) => mentions(was, p)), (a[key][k] as string[]).some((p) => mentions(now, p))];
        if (x !== y) note(`the ${key === "required" ? "required fact" : "forbidden claim"} "${(a[key][k] as string[])[0]}" ${y ? "is now" : "is no longer"} in its memory`);
      });
    groups("required");
    groups("forbidden");
    const holds = (item: DistillItem) => item.files.includes(lessonFile({ name: nameOf(item.memory) }));
    if (holds(b) !== holds(a)) note("the lesson at the ref distill writes to was lost or added");
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
    console.error("Usage: evals/nightly/generate --seed N --out private/nightly");
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
  const publicAssets = join(EVAL_DIR, "assets");
  const publicNight = loadNight(publicAssets);
  rewrite(["--seed", values.seed, "--map", map, join(publicAssets, "library"), join(assets, "library")]);
  const summary = rewrite(["--map", map, "--min-count", "1000000", join(publicAssets, "items.jsonl"), join(assets, "items.jsonl")]);

  let problems: string[];
  try {
    const night = loadNight(assets);
    problems = [...nightProblems(night), ...checkRewrite(publicNight, night)];
  } catch (e) {
    problems = [(e as Error).message];
  }
  if (problems.length > 0) {
    clear();
    console.error(`nightly: the rewrite changed ${problems.length} thing${problems.length === 1 ? "" : "s"} the night depends on, so nothing was written. Try another seed.\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`nightly: ${publicNight.items.length} items written to ${join(values.out, "assets")}`);
  console.log(summary.split("\n").pop());
}

if (import.meta.main) main();
