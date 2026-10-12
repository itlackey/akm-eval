// What the reflect eval declares about its own measurement: which files collect, which files score, and how a stored case is scored
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
 * The folder of the cases a run read, in the repository at `root`. The public corpus is the eval's own assets. A custom corpus records
 * `corpus_folder`, its folder from the repository root, or null when it was outside the repository: the name of such a folder can say what
 * is in it, so a summary does not keep it. scripts/rescore names that folder with --cases DIR, which it puts in `corpus_folder` of the
 * summary it hands to loadCases, from the root or absolute. A run from before `corpus_folder` read the seeded rewrite in
 * private/reflect/assets, and called it "private".
 */
export function casesFolder(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (typeof summary.corpus_folder === "string") return resolve(root, summary.corpus_folder);
  if (summary.corpus_folder === undefined && (summary.corpus_kind === "rewrite" || summary.corpus === "private")) return join(root, "private", NAME, "assets");
  throw new Error("the cases it read were in a folder outside this repository, which a summary does not record. scripts/rescore takes that folder with --cases DIR");
}

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // What decides what akm is asked and what is kept of its answer: the sandbox and the akm config this eval builds, the commands it runs,
  // and the lib/ files that run akm, merge the config patch and hide the endpoint in akm's messages.
  collector: ["evals/reflect/src/collect.ts", "lib/akm/akm.ts", "lib/akm/overrides.ts", "lib/cli.ts"],
  // What turns the raw output of a case into a row and the rows into metrics. The labels are the cases (assets/cases.jsonl), digested per case.
  scorer: ["evals/reflect/src/score.ts"],
  loadCases: (root, summary) => {
    const file = join(casesFolder(root, summary), "cases.jsonl");
    return parseCases(readFileSync(file, "utf8"), file);
  },
  legacyProblem: (root, summary) => {
    let dir: string;
    try {
      dir = casesFolder(root, summary);
    } catch (e) {
      return (e as Error).message;
    }
    if (summary.retrieval_queries != null) return "it recorded searches for the notes (--retrieval-queries), which a row from before the manifest does not keep";
    if (!existsSync(join(dir, "cases.jsonl")) || summary.assets_sha256 !== assetsSha256(dir)) return `it read other cases than the ones in ${relative(root, dir)} now (assets_sha256 is ${summary.assets_sha256 ?? "not recorded"})`;
    return undefined;
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
