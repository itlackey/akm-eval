// What the bakeoff eval declares about its own measurement: which files collect, which files score, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
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
  // What decides what akm is asked and what is kept of its answer: the sandbox and the akm config this eval builds, the commands it runs,
  // and the lib/ files that run akm, merge the config patch and hide the endpoint in akm's messages.
  collector: ["evals/bakeoff/src/collect.ts", "lib/akm/akm.ts", "lib/akm/overrides.ts", "lib/cli.ts"],
  // What turns the raw output of a case into a row and the rows into metrics. The labels are the cases (assets/cases.json), digested per case.
  scorer: ["evals/bakeoff/src/score.ts"],
  loadCases: (root, summary) => {
    // The public cases are in the repository. A custom corpus is in the folder the run recorded (`corpus_folder`), or that scripts/rescore was given with --cases.
    if (summary.corpus === "public") return loadCases(join(root, "evals", NAME, "assets"));
    if (summary.corpus !== "custom") throw new Error(`the run read the corpus ${JSON.stringify(summary.corpus)}, which this eval does not have`);
    if (typeof summary.corpus_folder !== "string") throw new Error("the run read a custom corpus from a folder outside the repository, so its cases are not known here. Give the folder with --cases DIR");
    const folder = resolve(root, summary.corpus_folder);
    if (!existsSync(folder)) throw new Error(`the custom corpus ${summary.corpus_folder} is not here`);
    return loadCases(folder);
  },
  // Every run of the Python bakeoff (corpus public or private, no manifest) is legacy, and none can be scored here.
  legacyProblem: () => "it is a result of the Python bakeoff, which scored a model's reply to prompts of its own, and nothing here scores that",
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
