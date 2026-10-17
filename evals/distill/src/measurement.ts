// What the distill eval declares about its own measurement: its version, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "Run, save, compare" the story.
//
// This file only wires the parts together. What it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { bundleFiles, corpusFolder, loadCases } from "./lib.ts";
import { type LoadedCase, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

export const MEASUREMENT: Measurement<LoadedCase, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.2",
  loadCases: (root, summary) => loadCases(corpusFolder(root, summary)),
  caseId: (c) => c.id,
  // The files of the case's bundle go into the sandbox as they are, and the feedback is recorded against the memory before distill runs.
  input: (c) => ({ bundle: bundleFiles(c.dir), feedback: c.feedback ?? [] }),
  // Everything score() reads of the case: its class, what it expects, the facts, claims and reversals it checks for, the memory it measures a
  // lesson's length against and, for an update, the lesson the library holds.
  labels: (c) => ({ class: c.class, expect: c.expect, required: c.required, forbidden: c.forbidden, contradicts: c.contradicts, existing: c.existing ?? null, existing_body: c.existingBody ?? null, memory: c.memory }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
