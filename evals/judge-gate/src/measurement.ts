// What the judge-gate eval declares about its own measurement: which files collect, which files score, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME, orderFeedback } from "./collect.ts";
import { CASES, casesSha256 } from "./inputs.ts";
import { parseCases } from "./lib.ts";
import { type Case, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/**
 * The folder of the cases a run read. The public ones are in the repository. A custom corpus records its folder when it was inside it
 * (`corpus_folder`, from the repository root). A run from before corpus.json named its corpus `private`: the seeded rewrite generate makes.
 */
function assetsOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (summary.corpus === "private") return join(root, "private", NAME, "assets");
  if (typeof summary.corpus_folder === "string") return resolve(root, summary.corpus_folder);
  throw new Error(`the run did not record the folder of its ${summary.corpus} corpus (it was outside the repository). Give the folder with --cases DIR`);
}

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // What decides what akm is asked and what is kept of its answer: the config and the sandbox this eval builds, the command it runs, and
  // the lib/ files that run akm, merge the config patch and hide the endpoint in akm's messages.
  collector: ["evals/judge-gate/src/collect.ts", "lib/akm/akm.ts", "lib/akm/overrides.ts", "lib/cli.ts"],
  // What turns akm's verdict into an outcome and the outcomes into metrics. The labels are the cases (assets/cases.jsonl), digested per case.
  scorer: ["evals/judge-gate/src/score.ts"],
  loadCases: (root, summary) => {
    const file = join(assetsOf(root, summary), CASES);
    return parseCases(readFileSync(file, "utf8"), file);
  },
  legacyProblem: (root, summary) => {
    let dir: string;
    try {
      dir = assetsOf(root, summary);
    } catch (e) {
      return (e as Error).message;
    }
    if (existsSync(join(dir, CASES)) && summary.assets_sha256 === casesSha256(dir)) return undefined;
    return `it read other cases than the ones in ${relative(root, dir)} now (assets_sha256 is ${summary.assets_sha256 ?? "not recorded"})`;
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
