// What the judge-gate eval declares about its own measurement: its version, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "Run, save, compare" the story.
//
// This file only wires the parts together. What it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME, orderFeedback } from "./collect.ts";
import { CASES } from "./inputs.ts";
import { parseCases } from "./lib.ts";
import { type Case, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/**
 * The folder of the cases a run read. The public ones are in the repository. A custom corpus records its folder when it was inside it
 * (`corpus_folder`, from the repository root: `corpusFolderOf` in lib/manifest.ts; scripts/rescore sets it from `--cases DIR` when it is null).
 * A run from before the corpora were renamed called its corpus `private`: the seeded rewrite generate makes.
 */
function assetsOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (summary.corpus === "private") return join(root, "private", NAME, "assets");
  if (summary.corpus === "custom" && typeof summary.corpus_folder === "string") return resolve(root, summary.corpus_folder);
  throw new Error(`the run did not record the folder of its ${summary.corpus} corpus (it was outside the repository). Give the folder to scripts/rescore with --cases DIR`);
}

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.2",
  loadCases: (root, summary) => {
    const file = join(assetsOf(root, summary), CASES);
    return parseCases(readFileSync(file, "utf8"), file);
  },
  caseId: (c) => c.id,
  // What goes to `akm improve judge` on stdin: the source, the candidate and the feedback with its negative lines first.
  input: (c) => ({ source: c.source, candidate: c.candidate, feedback: orderFeedback(c.feedback) }),
  // Everything makeRow reads of the case: its label and severity, and the set the row copies. The reason for the label is for readers.
  labels: (c) => ({ label: c.label, severity: c.severity ?? null, set: c.set }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
