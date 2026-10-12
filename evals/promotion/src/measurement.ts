// What the promotion eval declares about its own measurement: which files collect, which files score, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { assetsSha256, parseCases } from "./lib.ts";
import { type Case, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/**
 * The folder a summary's corpus was read from, now: the public assets, the custom corpus in `corpus_folder` (from the repository root, as
 * lib/manifest.ts `corpusFolderOf` writes it; scripts/rescore sets it from `--cases DIR` when the run could not record it), and for a run from before
 * the corpora were renamed (`own`) the default custom folder, private/promotion/own.
 */
function folderOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (summary.corpus === "custom") {
    if (typeof summary.corpus_folder !== "string" || summary.corpus_folder.trim() === "") throw new Error("it was made on a custom corpus and records no corpus_folder: give the folder of its cases (scripts/rescore --cases DIR)");
    return resolve(root, summary.corpus_folder);
  }
  return join(root, "private", NAME, "own");
}

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // What decides what akm is asked and what is kept of its answer: the sandbox and the akm config this eval builds, the proposals it plants, the
  // drain it runs and how it reads the drain. The lib/ files that run akm and hide the endpoint in akm's messages are covered through its imports.
  collector: ["evals/promotion/src/collect.ts"],
  // What turns the drain's outcome for a proposal into a row and the rows into metrics. The labels are the cases (assets/cases.jsonl), digested per case.
  scorer: ["evals/promotion/src/score.ts"],
  loadCases: (root, summary) => {
    const file = join(folderOf(root, summary), "cases.jsonl");
    return parseCases(readFileSync(file, "utf8"), file);
  },
  legacyProblem: (root, summary) => {
    const dir = folderOf(root, summary);
    if (!existsSync(join(dir, "cases.jsonl")) || summary.assets_sha256 !== assetsSha256(join(dir, "cases.jsonl"), join(dir, "library"))) return `it read other cases than the ones in ${relative(root, dir)} now (assets_sha256 is ${summary.assets_sha256 ?? "not recorded"})`;
    return undefined;
  },
  caseId: (c) => c.id,
  // The judge reads the proposal, and compares it with the notes of the bundle (`context`: the digest of the notes the run planted it among).
  input: (c, bundle) => ({ ref: c.ref, content: c.content, bundle: bundle ?? null }),
  // Everything makeRow reads of the case: the label and category it scores by, and the ref it copies into the row.
  labels: (c) => ({ label: c.label, category: c.category, ref: c.ref }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
