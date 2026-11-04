// Is a case an input akm's consolidate pair pass sends its judge? The notes of every case are planted as memories in a sandbox bundle, indexed, and akm's own
// pass is run on them (capture.ts); a case is reachable when the pass judges its pair, the older note first, with the dates in the same relation and written as akm writes them.
//
//   bun evals/pair-judge/src/reachable.ts --akm ~/code/akm [--cases DIR]...
//
// It prints the cases the pass does not judge as they are, and exits 1 if there are any. Retire such a case into assets/retired.jsonl with the reason.
//
// The dates are the notes' file times, which the pass reads when the bundle is not a git repository. The check moves all of them by one amount, so that the newest
// is a day old (a note older than a week is held to a higher cosine floor, 0.95 in place of 0.93, and the cases were made from new notes); the gaps between them stay.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES } from "./inputs.ts";
import { type Judged, type Note, judgedPairs } from "./capture.ts";
import { parseCases } from "./lib.ts";
import type { Case } from "./score.ts";

const DAY = 86_400_000;
const nameOf = (ref: string): string => ref.replace(/^memories\//, "");

/** The notes of the cases as the check plants them: each once, by name, with the file time that keeps the gaps between `created` dates and puts the newest `now - 1 day`. */
export function plantedNotes(cases: Case[], now = Date.now()): Note[] {
  const notes = new Map<string, Note>();
  const newest = Math.max(...cases.flatMap((c) => [Date.parse(c.a.created), Date.parse(c.b.created)]));
  for (const c of cases) {
    for (const note of [c.a, c.b]) {
      if (note.type !== "memory" || !note.ref.startsWith("memories/")) throw new Error(`${c.id}: the check plants memories, not a ${note.type} (${note.ref})`);
      const name = nameOf(note.ref);
      const had = notes.get(name);
      if (had && had.text !== note.content) throw new Error(`${c.id}: the note ${note.ref} is not the same text as in another case`);
      notes.set(name, { name, text: note.content, mtimeMs: now - DAY - (newest - Date.parse(note.created)) });
    }
  }
  return [...notes.values()];
}

/** Why akm's pass would not send this case's input, or null when it would. `judged` is what the pass judged among the planted notes. */
export function problemWith(c: Case, judged: Judged[]): string | null {
  const pair = judged.find((j) => new Set([j.a.ref, j.b.ref]).size === 2 && [j.a.ref, j.b.ref].every((r) => r === c.a.ref || r === c.b.ref));
  if (!pair) return "akm's pair pass does not judge this pair";
  const tied = Date.parse(c.a.created) === Date.parse(c.b.created);
  // With equal dates the pass puts the note it started from first, and either note can be it; with unequal dates it puts the older first.
  if (!tied && pair.a.ref !== c.a.ref) return "akm judges the older note second";
  if (tied !== (Date.parse(pair.a.created) === Date.parse(pair.b.created))) return `the dates are ${tied ? "equal in the case and not in akm's input" : "not equal in the case and equal in akm's input"}`;
  for (const [mine, theirs] of pair.a.ref === c.a.ref ? [[c.a, pair.a], [c.b, pair.b]] as const : [[c.a, pair.b], [c.b, pair.a]] as const) {
    if (mine.type !== theirs.type) return `${mine.ref} is a ${theirs.type} to akm, not a ${mine.type}`;
    // akm writes a created date as an ISO instant, and an updated date as the note's own `updated`, or else its created date: the judge reads both as text.
    if (mine.created !== new Date(Date.parse(mine.created)).toISOString()) return `the created date of ${mine.ref} is not written as akm writes one (${new Date(Date.parse(mine.created)).toISOString()})`;
    const updated = mine.updated === mine.created ? theirs.created : mine.updated;
    if (theirs.updated !== updated) return `the updated date of ${mine.ref} is ${theirs.updated === theirs.created ? "its created date" : theirs.updated} in akm's input, and ${mine.updated} in the case`;
  }
  const gap = (x: Judged["a"], y: Judged["a"]) => Date.parse(y.created) - Date.parse(x.created);
  const caseGap = Date.parse(c.b.created) - Date.parse(c.a.created);
  const akmGap = pair.a.ref === c.a.ref ? gap(pair.a, pair.b) : -gap(pair.a, pair.b);
  if (caseGap !== akmGap) return `b is created ${caseGap} ms after a in the case and ${akmGap} ms after it in akm's input`;
  return null;
}

/** The cases (a folder's cases.jsonl each) that akm's pass does not send, with the reason. `akmCommand` is the akm under test. */
export async function unreachable(cases: Case[], akmCommand: string): Promise<{ id: string; why: string }[]> {
  const judged = await judgedPairs(plantedNotes(cases), akmCommand);
  return cases.flatMap((c) => {
    const why = problemWith(c, judged);
    return why === null ? [] : [{ id: c.id, why }];
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { akm: { type: "string" }, cases: { type: "string", multiple: true } } });
  if (!values.akm) {
    console.error("reachable: --akm DIR (an akm checkout) is needed");
    process.exit(2);
  }
  const assets = join(import.meta.dir, "..", "assets");
  const folders = values.cases?.length ? values.cases.map((f) => resolve(f)) : [assets, join(assets, "heldout")];
  const cases = folders.flatMap((f) => parseCases(readFileSync(join(f, CASES), "utf8"), join(f, CASES)));
  const off = await unreachable(cases, `bun ${join(resolve(values.akm), "src", "cli.ts")}`);
  for (const o of off) console.error(`reachable: ${o.id}: ${o.why}`);
  console.log(`reachable: ${cases.length - off.length} of ${cases.length} cases are pairs akm's pass sends`);
  if (off.length > 0) process.exit(1);
}
