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
//
// It works in a temporary folder, private/nightly/.new, and moves assets/ and map.json into place only when the checks have
// passed, with generated.json (the seed, the digest of the public night and the digest of this generator) beside them. A failed run leaves the previous private
// night, map and generated.json as they were. `run` on the custom corpus stops when generated.json is missing, or does not match the public night or this generator.

import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { assetsDigest, generateInto, generatorSha256 } from "../../consolidate/src/inputs.ts";
import { lessonFile, memoryBody, mentions } from "../../distill/src/lib.ts";
import type { DistillItem } from "./items.ts";
import { GENERATOR_CODE, type Night, loadNight, nightFiles, nightProblems } from "./night.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

const nameOf = (memory: string): string => memory.replace(/^memories\//, "").replace(/\.md$/, "");

const KEY_NAMES = { required: "required fact", forbidden: "forbidden claim", contradicts: "contradiction" } as const;

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
    const groups = (key: "required" | "forbidden" | "contradicts") =>
      b[key].forEach((group, k) => {
        const [x, y] = [group.some((p) => mentions(was, p)), (a[key][k] ?? []).some((p) => mentions(now, p))];
        if (x !== y) note(`the ${KEY_NAMES[key]} "${a[key][k]?.[0]}" ${y ? "is now" : "is no longer"} in its memory`);
      });
    groups("required");
    groups("forbidden");
    groups("contradicts");
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

function main(): number {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/nightly/generate --seed N --out private/nightly");
    return 2;
  }
  const seed = values.seed;
  const out = resolve(values.out);

  const publicAssets = join(EVAL_DIR, "assets");
  const publicNight = loadNight(publicAssets);
  let summary = "";
  // Everything is made in a temporary folder and moved into place when it has passed the checks, so a failure leaves the previous private night as it was.
  const problems = generateInto(out, seed, assetsDigest(publicAssets, nightFiles(publicAssets)), generatorSha256(GENERATOR_CODE), (stage) => {
    rewrite(["--seed", seed, "--map", stage.map, join(publicAssets, "library"), join(stage.assets, "library")]);
    summary = rewrite(["--map", stage.map, "--min-count", "1000000", join(publicAssets, "items.jsonl"), join(stage.assets, "items.jsonl")]);
    try {
      const night = loadNight(stage.assets);
      return [...nightProblems(night), ...checkRewrite(publicNight, night)];
    } catch (e) {
      return [(e as Error).message];
    }
  });
  if (problems.length > 0) {
    console.error(`nightly: the rewrite changed ${problems.length} thing${problems.length === 1 ? "" : "s"} the night depends on, so nothing was written. Try another seed.\n  ${problems.join("\n  ")}`);
    return 1;
  }
  console.log(`nightly: ${publicNight.items.length} items written to ${join(values.out, "assets")}`);
  console.log(summary.split("\n").pop());
  return 0;
}

if (import.meta.main) process.exit(main());
