// What the nightly eval declares about its own measurement: its version, and how a stored night is scored again.
// lib/manifest.ts has the contract (`Measurement`) and the README's "Compare two runs" the story.
//
// This file only wires the parts together. What it digests per case (`input` and `labels`) shows in the case digests
// of a run, and the scoring itself is in score.ts. The night is one run of many items: each item is a case, scored from its own files, proposals
// and actions and from the part of the night that is the same for every item.

import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { type Planted, loadNight, planted } from "./night.ts";
import { type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/**
 * Where the cases of a summary's corpus are: the committed ones, the folder a custom run recorded (`corpus_folder`, from the repository root, or the one
 * scripts/rescore was given with --cases), or for a run from before the corpora were renamed (`private`) the folder generate makes.
 */
function assetsOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (summary.corpus === "custom") {
    if (typeof summary.corpus_folder !== "string" || summary.corpus_folder === "") throw new Error("the custom corpus of the run was not in the repository, so its folder was not recorded. Give it with --cases DIR");
    return resolve(root, summary.corpus_folder);
  }
  if (summary.corpus === "private") return join(root, "private", NAME, "assets");
  throw new Error(`the run was made on the ${JSON.stringify(summary.corpus)} corpus, which this eval does not know`);
}

export const MEASUREMENT: Measurement<Planted, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.2",
  loadCases: (root, summary) => {
    const night = loadNight(assetsOf(root, summary));
    return planted(night.items, night.files);
  },
  caseId: (c) => c.id,
  // The files of the item go into the bundle, the notes of a pair dated by file time (`older`, and which file is a or b), and its feedback is recorded.
  input: (c) => ({ files: c.files.map((path) => ({ path, text: c.texts[path] })), feedback: c.feedback, ...(c.kind === "pair" ? { a: c.a, b: c.b, older: c.older } : {}) }),
  // Everything the scorer reads of the item besides the text of its files, which the raw output holds: what a right night does to it.
  labels: (c) => {
    const base = { kind: c.kind, files: c.files };
    switch (c.kind) {
      case "pair":
        return { ...base, relation: c.relation, safe: c.safe, a: c.a, b: c.b };
      case "reflect":
      case "silent":
        return { ...base, class: c.class, path: c.path, allow: c.allow, forbid: c.forbid ?? [], anchors: c.anchors ?? [] };
      case "fix":
        return { ...base, path: c.path, fix: c.feedback.find((f) => f.fix)?.fix };
      case "distill":
        return { ...base, class: c.class, expect: c.expect, memory: c.memory, required: c.required, forbidden: c.forbidden, contradicts: c.contradicts };
      case "untouched":
        return base;
    }
  },
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
