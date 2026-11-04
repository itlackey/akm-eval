// Is a case's input what akm sends the judge? The input of a case is what the drain builds for a promotion that consolidate's promote pass mints from a memory of
// assets/bundle. This file mints and drains them again with the akm checkout it is given (capture.ts), and compares: a case whose input is not what akm builds is retired.
//
//   bun evals/drain-judge/src/reachable.ts --akm ~/code/akm [--cases DIR] [--rebuild]
//
// Without --rebuild it lists the cases whose input differs from what akm builds, or that akm no longer sends to the judge, and exits 1 if there are any. --rebuild writes
// akm's input into the cases, and moves the cases akm no longer sends to retired.jsonl with the reason.
// The `updated:` date akm stamps on a minted note is the day of the run, so it is left out of the comparison.

import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { BUNDLE, type Captured, capture } from "./capture.ts";
import { CASES, HELD_OUT, RETIRED } from "./inputs.ts";
import type { Input } from "./score.ts";

const STAMP = /^updated: \d{4}-\d{2}-\d{2}$/m;
/** An input with the date akm stamped on the note taken out. */
export const withoutStamp = (input: Input): Input => ({ ...input, proposal: { ...input.proposal, content: input.proposal.content.replace(STAMP, "updated: <date>") } });

/** Why a case is not reachable, or null when its input is what akm builds. */
export function unreachable(c: { input: Input }, got: Captured | undefined): string | null {
  if (!got) return "the memory is not in the bundle";
  if (!got.input) return `akm does not send it to the judge: ${got.skipped}`;
  return JSON.stringify(withoutStamp(got.input)) === JSON.stringify(withoutStamp(c.input)) ? null : "the input differs from what akm builds";
}

const read = (file: string): any[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

if (import.meta.main) {
  const { values } = parseArgs({ options: { akm: { type: "string" }, cases: { type: "string" }, rebuild: { type: "boolean" } } });
  if (!values.akm) {
    console.error("reachable: --akm DIR (an akm checkout) is needed");
    process.exit(2);
  }
  const dir = values.cases ? resolve(values.cases) : join(import.meta.dir, "..", "assets");
  const groups = readdirSync(BUNDLE, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(BUNDLE, e.name));
  const captured: Captured[] = [];
  for (const g of groups) captured.push(...(await capture(values.akm, g)).captured);
  const byMemory = new Map(captured.map((c) => [`${c.bundle}/${c.memory}`, c]));
  let off = 0;
  let total = 0;
  for (const file of [CASES, HELD_OUT]) {
    const cases = read(join(dir, file));
    const kept: any[] = [];
    for (const c of cases) {
      total++;
      const got = byMemory.get(`${c.bundle}/${c.memory}`);
      const why = unreachable(c, got);
      if (why === null) {
        kept.push(c);
        continue;
      }
      off++;
      console.error(`reachable: ${c.id} (${c.bundle}/${c.memory}): ${why}`);
      if (!values.rebuild) kept.push(c);
      else if (got?.input) kept.push({ ...c, input: got.input });
      else appendFileSync(join(dir, RETIRED), `${JSON.stringify({ ...c, retired: why })}\n`);
    }
    if (values.rebuild) writeFileSync(join(dir, file), kept.length ? `${kept.map((c) => JSON.stringify(c)).join("\n")}\n` : "");
  }
  console.log(`reachable: ${total - off} of ${total} inputs are what akm builds${values.rebuild && off ? `; ${off} rebuilt or retired` : ""}`);
  if (off > 0 && !values.rebuild) process.exit(1);
}
