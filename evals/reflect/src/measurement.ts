// What the reflect eval declares about its own measurement: its version, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "Compare two runs" the story.
//
// This file only wires the parts together. What it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { parseCases } from "./lib.ts";
import { type Case, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/** The kind of corpus that the names a run used before the corpora were renamed stand for. reflect never had an own corpus. */
const LEGACY_KIND: Record<string, "rewrite"> = { private: "rewrite" };

/**
 * The folder of the cases a run read, in the repository at `root`. The public corpus is the eval's own assets. A custom corpus records
 * `corpus_folder`, its folder from the repository root (lib/manifest.ts `corpusFolderOf`), and null when it was outside the repository: the
 * name of such a folder can say what is in it, so a summary does not keep it. scripts/rescore hands loadCases a summary whose `corpus_folder`
 * is the folder it was given with --cases DIR when the run did not record it. A run from before the corpora were renamed has the name of its
 * kind: a rewrite (`private`) was read from private/reflect/assets, where generate puts it.
 */
export function casesFolder(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (summary.corpus === "custom") {
    if (typeof summary.corpus_folder === "string") return resolve(root, summary.corpus_folder);
    throw new Error("the cases it read were in a folder that its summary does not record (outside this repository, a folder is left out). scripts/rescore takes that folder with --cases DIR");
  }
  if (Object.hasOwn(LEGACY_KIND, String(summary.corpus))) return join(root, "private", NAME, "assets"); // the folder of a rewrite
  throw new Error(`it names the corpus ${JSON.stringify(summary.corpus)}, which is neither public nor custom`);
}

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.2",
  loadCases: (root, summary) => {
    const file = join(casesFolder(root, summary), "cases.jsonl");
    return parseCases(readFileSync(file, "utf8"), file);
  },
  caseId: (c) => c.id,
  // The note goes into the bundle at its path, the feedback is recorded against it, and the searches the run records (--retrieval-queries) are
  // what the retrieval check of akm's reflect grades an edit on.
  input: (c, searches) => ({ path: c.path, source: c.source, feedback: c.feedback, searches: searches ?? [] }),
  // Everything score() reads of the case: its class, the note it edits, the fields a result may change, the terms it must not carry and the dates it may name.
  labels: (c) => ({ class: c.class, source: c.source, allow: c.allow, forbid: c.forbid ?? [], anchors: c.anchors ?? [] }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
