#!/usr/bin/env bun
// extract generate: makes the private cases from the public ones with lib/rewrite.
//
//   evals/extract/generate --seed N --out private/extract
//
// The sessions go through the rewrite first, then cases.json with the same map, so a name changes the same way in a
// session, in a folder name and in what a correct memory must state. Then each case is checked against the public one.

import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type LoadedCase, checkSaved, loadCases, mentions, sessionText } from "./lib.ts";

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

function main(): void {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/extract/generate --seed N --out private/extract");
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
  rewrite(["--seed", values.seed, "--map", map, join(EVAL_DIR, "assets", "sessions"), join(assets, "sessions")]);
  const summary = rewrite(["--map", map, join(EVAL_DIR, "assets", "cases.json"), join(assets, "cases.json")]);

  let problems: string[];
  try {
    problems = checkRewrite(loadCases(join(EVAL_DIR, "assets")), loadCases(assets));
  } catch (e) {
    problems = [(e as Error).message];
  }
  if (problems.length > 0) {
    clear();
    console.error(`extract: the rewrite changed ${problems.length} thing${problems.length === 1 ? "" : "s"} it must keep, so nothing was written:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`extract: ${loadCases(assets).length} cases written to ${join(values.out, "assets")}`);
  console.log(summary.split("\n").pop());
}

if (import.meta.main) main();
