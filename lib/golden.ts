// Golden tests for a scorer: a committed set of raw outputs with the rows the scorer is expected to give for them. A change to the scorer that
// alters any expected row fails the test until the golden files are written again, and they are written again together with the
// scorer's version bump (scripts/measurement/run bump EVAL scorer), so that nobody changes what an eval scores without looking at the rows.
//
// The layout, in a folder of the eval (evals/<name>/golden/):
//
//   cases.jsonl     the labelled cases the raw outputs are for, one JSON object per line, as the eval's cases.jsonl has them. A copy, so that a
//                   change to the corpus does not move the golden files; they test the scorer.
//   raw.jsonl       one line per raw output: {"case": "<case id>", "note": "what this output stands for", "raw": {...}}. `raw` holds the fields
//                   a stored row keeps of the raw output (what `Measurement.rawOf` reads). From a real run where there is one, else a realistic
//                   fixture. A case may have several lines: one correct answer, and each way to get it wrong.
//   expected.jsonl  the row the scorer must give for the line of raw.jsonl at the same position. Fields the row copies from the raw output
//                   and that are large (reflect's `proposal`) are left out: see `omit`.
//   scorer.json     {"scorer_version": N}: the version of the scorer in MEASUREMENT.lock that the expected rows were made under.
//
// The test of an eval is three lines:
//
//   test("the scorer gives the golden rows", () => {
//     if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN, { omit: ["proposal"] });
//     expect(goldenProblems(MEASUREMENT, GOLDEN, { omit: ["proposal"] })).toEqual([]);
//   });
//
// After a deliberate change to the scorer: bump it, run `UPDATE_GOLDEN=1 bun test evals/<name>/src/golden.test.ts`, and read the diff of
// expected.jsonl. A refactor that keeps every row changes nothing in it but scorer.json.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Measurement, readLock, REPO_ROOT } from "./manifest.ts";
import { canonical } from "./provenance.ts";

type Obj = Record<string, any>;

export interface GoldenOptions {
  /** Fields of a row to leave out of expected.jsonl and of the comparison: copies of the raw output that would only make the files larger. */
  omit?: string[];
  /** The checkout whose MEASUREMENT.lock gives the scorer's version. This one, but for tests. */
  root?: string;
}

export interface GoldenLine {
  case: string;
  note: string;
  raw: Obj;
}

const lines = (file: string): Obj[] => readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Obj);

const without = (row: Obj, omit: string[]): Obj => Object.fromEntries(Object.entries(row).filter(([k]) => !omit.includes(k)));

/** The rows the current scorer gives for the raw outputs of the golden folder, or a message for a line that cannot be scored. */
function scored(m: Measurement, dir: string, omit: string[]): { rows: Obj[]; problems: string[]; lines: GoldenLine[] } {
  const cases = lines(join(dir, "cases.jsonl"));
  const raws = lines(join(dir, "raw.jsonl")) as unknown as GoldenLine[];
  const byId = new Map(cases.map((c) => [m.caseId(c), c]));
  const rows: Obj[] = [];
  const problems: string[] = [];
  raws.forEach((line, i) => {
    const where = `raw.jsonl line ${i + 1} (${line.case}, ${JSON.stringify(line.note)})`;
    const c = byId.get(line.case);
    if (c === undefined) return void problems.push(`${where}: the case is not in cases.jsonl`);
    const read = m.rawOf({ id: line.case, ...line.raw });
    if ("missing" in read) return void problems.push(`${where}: the raw output lacks ${read.missing.join(", ")}`);
    rows.push(without(m.score(c, read.raw), omit));
  });
  return { rows, problems, lines: raws };
}

/** The fields at which two JSON values differ, as `path: expected X, got Y`. */
function differences(expected: unknown, got: unknown, path = ""): string[] {
  if (canonical(expected) === canonical(got)) return [];
  const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
  if (isObj(expected) && isObj(got)) return [...new Set([...Object.keys(expected), ...Object.keys(got)])].sort().flatMap((k) => differences(expected[k], got[k], path === "" ? k : `${path}.${k}`));
  const short = (x: unknown): string => (x === undefined ? "nothing" : JSON.stringify(x)?.slice(0, 80));
  return [`${path || "row"}: expected ${short(expected)}, got ${short(got)}`];
}

/** What is wrong with the golden folder of an eval, as messages; empty when the scorer gives every expected row and the folder is for its version. */
export function goldenProblems(m: Measurement, dir: string, options: GoldenOptions = {}): string[] {
  const omit = options.omit ?? [];
  for (const file of ["cases.jsonl", "raw.jsonl", "expected.jsonl", "scorer.json"]) if (!existsSync(join(dir, file))) return [`${join(dir, file)} is missing: an eval needs golden files for its scorer (see lib/golden.ts)`];
  const out = scored(m, dir, omit);
  const expected = lines(join(dir, "expected.jsonl"));
  const problems = [...out.problems];
  if (expected.length !== out.lines.length) problems.push(`expected.jsonl has ${expected.length} rows and raw.jsonl has ${out.lines.length} lines`);
  else {
    out.rows.forEach((row, i) => {
      const diff = differences(expected[i], row);
      if (diff.length > 0) problems.push(`the scorer's row for raw.jsonl line ${i + 1} (${out.lines[i]?.case}, ${JSON.stringify(out.lines[i]?.note)}) is not the expected one: ${diff.slice(0, 4).join("; ")}${diff.length > 4 ? `; and ${diff.length - 4} more` : ""}`);
    });
  }
  const version = (JSON.parse(readFileSync(join(dir, "scorer.json"), "utf8")) as Obj).scorer_version;
  const locked = readLock(options.root ?? REPO_ROOT).evals[m.eval]?.scorer.version;
  if (version !== locked) problems.push(`scorer.json is for scorer version ${version} and MEASUREMENT.lock has ${locked}: look at the expected rows, and write them again with UPDATE_GOLDEN=1`);
  return problems;
}

/** Writes expected.jsonl and scorer.json from the current scorer. Reads cases.jsonl and raw.jsonl, which a person writes. */
export function writeGolden(m: Measurement, dir: string, options: GoldenOptions = {}): void {
  const out = scored(m, dir, options.omit ?? []);
  if (out.problems.length > 0) throw new Error(`the golden files cannot be scored: ${out.problems.join("; ")}`);
  writeFileSync(join(dir, "expected.jsonl"), out.rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  const locked = readLock(options.root ?? REPO_ROOT).evals[m.eval]?.scorer.version;
  if (locked === undefined) throw new Error(`MEASUREMENT.lock has no entry for ${m.eval}`);
  writeFileSync(join(dir, "scorer.json"), `${JSON.stringify({ scorer_version: locked }, null, 2)}\n`);
}
