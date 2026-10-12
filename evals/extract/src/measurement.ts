// What the extract eval declares about its own measurement: which files collect, which files score, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { type LoadedCase, assetsDigest, loadCases } from "./lib.ts";
import { type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/**
 * The folder of the assets a run read. The public ones are in the repository. A custom corpus records its folder when it was inside it
 * (`corpus_folder`, from the repository root). A run from before corpus.json named its corpus `private`: the seeded rewrite generate makes.
 */
function assetsOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (summary.corpus === "private") return join(root, "private", NAME, "assets");
  if (typeof summary.corpus_folder === "string") return resolve(root, summary.corpus_folder);
  throw new Error(`the run did not record the folder of its ${summary.corpus} corpus (it was outside the repository). Give the folder with --cases DIR`);
}

export const MEASUREMENT: Measurement<LoadedCase, Raw, Row> = {
  eval: NAME,
  // What decides what akm is asked and what is kept of its answer: the sandbox and the akm config this eval builds, the commands it runs,
  // and the lib/ files that run akm, merge the config patch and hide the endpoint in akm's messages.
  collector: ["evals/extract/src/collect.ts", "lib/akm/akm.ts", "lib/akm/overrides.ts", "lib/cli.ts"],
  // What turns the raw output of a case into a row and the rows into metrics. The labels are the cases (assets/cases.json), digested per case.
  scorer: ["evals/extract/src/score.ts"],
  loadCases: (root, summary) => loadCases(assetsOf(root, summary)),
  legacyProblem: (root, summary) => {
    let dir: string;
    try {
      dir = assetsOf(root, summary);
    } catch (e) {
      return (e as Error).message;
    }
    const now = () => assetsDigest(dir, loadCases(dir));
    try {
      if (existsSync(join(dir, "cases.json")) && summary.assets_sha256 === now()) return undefined;
    } catch {} // cases that cannot be read are not the cases it read
    return `it read other cases than the ones in ${relative(root, dir)} now (assets_sha256 is ${summary.assets_sha256 ?? "not recorded"})`;
  },
  caseId: (c) => c.id,
  // The session goes into the sandbox where akm reads Claude Code sessions, under its project folder and its id.
  input: (c) => ({ id: c.id, project: c.project, session: c.session }),
  // Everything makeRow reads of the case: its class, what it expects, the facts a memory must state, the planted instruction, and the
  // good example the similarity is measured to.
  labels: (c) => ({ class: c.class, expect: c.expect, required: c.required, forbidden: c.forbidden, good: c.good ?? null }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
