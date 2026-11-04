// What the drain-judge eval declares about its own measurement: its version, and how a stored case is scored again. lib/manifest.ts has the contract (`Measurement`) and
// the README's "Run, save, compare" the story. This file only wires the parts together; the scoring is in score.ts.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME, judgeInput } from "./collect.ts";
import { CASES } from "./inputs.ts";
import { parseCases } from "./lib.ts";
import { type Case, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/** The folder of the cases a run read, as judge-gate records it (`corpus_folder` for a custom corpus). */
function assetsOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (summary.corpus === "custom" && typeof summary.corpus_folder === "string") return resolve(root, summary.corpus_folder);
  throw new Error(`the run did not record the folder of its ${summary.corpus} corpus (it was outside the repository). Give the folder to scripts/rescore with --cases DIR`);
}

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.1",
  loadCases: (root, summary) => {
    const file = join(assetsOf(root, summary), CASES);
    return parseCases(readFileSync(file, "utf8"), file);
  },
  caseId: (c) => c.id,
  // What goes to `akm judge proposal.judgment` on stdin: the input the drain built.
  input: judgeInput,
  // Everything makeRow reads of the case: its label and category, and its origin and set, which the row copies. The reason for the label is for readers.
  labels: (c) => ({ label: c.label, category: c.category, origin: c.origin, set: c.set }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
