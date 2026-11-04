// What the lesson-judge eval declares about its own measurement: its version, and how a stored case is scored again. lib/manifest.ts has the contract
// (`Measurement`) and the README's "Run, save, compare" the story.
//
// This file only wires the parts together. What it digests per case (`input` and `labels`) shows in the case digests of a run, and the scoring is in score.ts.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME, judgeInput } from "./collect.ts";
import { CASES, parseCases } from "./lib.ts";
import { type Case, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/** The folder of the cases a run read. The public ones are in the repository; a custom corpus records its folder when it was inside it (`corpusFolderOf` in lib/manifest.ts). */
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
  // What goes to `akm judge distill.lesson` on stdin: the lesson, the source memory, the feedback lines, the related assets and, for an update, the lesson it extends.
  input: judgeInput,
  // Everything makeRow reads of the case: its mode, label, kind and origin. The reason for the label is for readers.
  labels: (c) => ({ mode: c.mode, label: c.label, kind: c.kind ?? null, origin: c.origin }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
