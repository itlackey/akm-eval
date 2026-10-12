// What the distill eval declares about its own measurement: which files collect, which files score, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { bundleFiles, corpusFolder, loadCases } from "./lib.ts";
import { type LoadedCase, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

export const MEASUREMENT: Measurement<LoadedCase, Raw, Row> = {
  eval: NAME,
  // What decides what akm is asked and what is kept of its answer: the sandbox and the akm config this eval builds, the commands it runs,
  // and the lib/ files that run akm, merge the config patch and hide the endpoint in akm's messages.
  collector: ["evals/distill/src/collect.ts", "lib/akm/akm.ts", "lib/akm/overrides.ts", "lib/cli.ts"],
  // What turns the raw output of a case into a row and the rows into metrics, with the rule of negation it shares with extract (lib/negation.ts,
  // covered because score.ts imports it). The labels are the cases (assets/cases.json), digested per case.
  scorer: ["evals/distill/src/score.ts"],
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
