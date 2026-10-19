#!/usr/bin/env bun
// extract generate: makes the private cases from the public ones with lib/rewrite.
//
//   evals/extract/generate --seed N --out private/extract
//
// The sessions go through the rewrite first, then cases.json with the same map, so a name changes the same way in a
// session, in a folder name and in what a correct memory must state. Then each case is checked against the public one.
// Everything is written into a temporary folder and moved into place only when the checks pass, so a generation that
// fails leaves the earlier assets, map and generated.json as they were. generated.json holds the seed.

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GENERATED, type LoadedCase, checkSaved, loadCases, mentions, sessionText } from "./lib.ts";
import { generateArgs } from "../../../lib/cli.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

/** The events of a session: its lines, each of which must still be one JSON object. */
function events(session: string): number {
  const lines = session.split("\n").filter((l) => l.trim() !== "");
  for (const line of lines) JSON.parse(line);
  return lines.length;
}

/**
 * What the rewrite must keep, case by case: that the session is still one JSON event per line and has as many, which
 * required facts and which planted phrases its text holds, and how its example memories score. Returns what changed.
 * A rewrite that changes none of these keeps the case as hard as it was.
 */
export function checkRewrite(before: LoadedCase[], after: LoadedCase[]): string[] {
  const problems: string[] = [];
  if (before.length !== after.length) return [`${after.length} cases were written, and there are ${before.length}`];
  before.forEach((b, i) => {
    const a = after[i];
    const note = (message: string) => problems.push(`${b.id}: ${message}`);
    if (a.id !== b.id || a.class !== b.class || a.expect !== b.expect) return note(`came back as ${a.id}, ${a.class}, ${a.expect}`);
    try {
      if (events(a.session) !== events(b.session)) note(`its session has ${events(a.session)} events, and the public one has ${events(b.session)}`);
    } catch {
      return note("its session is no longer one JSON event per line");
    }
    const [was, now] = [sessionText(b.session), sessionText(a.session)];
    for (const key of ["required", "forbidden"] as const) {
      b[key].forEach((group, k) => {
        const [had, has] = [group.some((p) => mentions(was, p)), a[key][k].some((p) => mentions(now, p))];
        if (had !== has) note(`the ${key === "required" ? "required fact" : "planted instruction"} "${a[key][k][0]}" ${has ? "is now" : "is no longer"} in its session`);
      });
    }
    if (b.good !== undefined && b.expect === "memory") {
      const [had, has] = [checkSaved(b, [b.good]), checkSaved(a, [a.good as string])];
      if ((had.missing.length + had.forbidden.length === 0) !== (has.missing.length + has.forbidden.length === 0)) note(`the good example memory ${has.missing.length + has.forbidden.length === 0 ? "now passes" : "no longer passes"}`);
    }
    if (b.bad !== undefined) {
      const [had, has] = [checkSaved({ required: [], forbidden: b.forbidden }, [b.bad]), checkSaved({ required: [], forbidden: a.forbidden }, [a.bad as string])];
      if ((had.forbidden.length > 0) !== (has.forbidden.length > 0)) note(`the bad example memory ${has.forbidden.length > 0 ? "now" : "no longer"} saves the planted instruction`);
    }
  });
  return problems;
}

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
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

function main(): void {
  const args = generateArgs(Bun.argv.slice(2), "Usage: evals/extract/generate --seed N --out private/extract");
  if (typeof args === "number") process.exit(args);
  const values = args;
  const out = resolve(values.out);
  const work = join(out, ".work"); // in the same folder as the result, so the rename stays on one disk
  const staged = join(work, "staged");
  const assets = join(staged, "assets");
  const map = join(staged, "map.json");
  const publicAssets = join(EVAL_DIR, "assets");

  rmSync(work, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });
  let refused: string | undefined;
  try {
    rewrite(["--seed", values.seed, "--map", map, join(publicAssets, "sessions"), join(assets, "sessions")]);
    const summary = rewrite(["--map", map, join(publicAssets, "cases.json"), join(assets, "cases.json")]);

    let problems: string[];
    try {
      problems = checkRewrite(loadCases(publicAssets), loadCases(assets));
    } catch (e) {
      problems = [(e as Error).message];
    }
    if (problems.length > 0) {
      refused = `extract: the rewrite changed ${problems.length} thing${problems.length === 1 ? "" : "s"} it must keep, so nothing was written:\n  ${problems.join("\n  ")}`;
    } else {
      const n = loadCases(assets).length;
      writeFileSync(join(staged, GENERATED), `${JSON.stringify({ seed: values.seed }, null, 2)}\n`);
      install(staged, out);
      console.log(`extract: ${n} cases written to ${join(values.out, "assets")}`);
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
