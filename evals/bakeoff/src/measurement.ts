// What the bakeoff eval declares about its own measurement: its version, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "Run, save, compare" the story.
//
// This file only wires the parts together. What it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import type { LoadedCase } from "./collect.ts";
import { loadCases } from "./inputs.ts";
import { type Raw, type Row, errored, makeRow, rawOf, refOf, summarize } from "./score.ts";

export const MEASUREMENT: Measurement<LoadedCase, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.4",
  loadCases: (root, summary) => {
    // The public cases are in the repository. A custom corpus is in the folder the run recorded (`corpus_folder`), or that scripts/rescore was given with --cases.
    if (summary.corpus === "public") return loadCases(join(root, "evals", NAME, "assets"));
    if (summary.corpus !== "custom") throw new Error(`the run read the corpus ${JSON.stringify(summary.corpus)}, which this eval does not have`);
    if (typeof summary.corpus_folder !== "string") throw new Error("the run read a custom corpus from a folder outside the repository, so its cases are not known here. Give the folder with --cases DIR");
    const folder = resolve(root, summary.corpus_folder);
    if (!existsSync(folder)) throw new Error(`the custom corpus ${summary.corpus_folder} is not here`);
    return loadCases(folder);
  },
  caseId: (c) => c.id,
  // The files of the case go into the bundle (or, for a session, to where akm reads sessions), and the process decides the command.
  input: (c) => ({ process: c.process, files: c.files.map((path) => ({ path, text: c.texts[path] })) }),
  // Everything score() reads of the case: its process, what it expects, and the refs of its files.
  labels: (c) => ({ process: c.process, expected: c.expected, refs: c.files.map(refOf) }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
