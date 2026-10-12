// What the reflect eval declares about its own measurement: which files collect, which files score, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { assetsSha256, parseCases } from "./lib.ts";
import { type Case, type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // What decides what akm is asked and what is kept of its answer: the sandbox and the akm config this eval builds, the commands it runs,
  // and the lib/ files that run akm, merge the config patch and hide the endpoint in akm's messages.
  collector: ["evals/reflect/src/collect.ts", "lib/akm/akm.ts", "lib/akm/overrides.ts", "lib/cli.ts"],
  // What turns the raw output of a case into a row and the rows into metrics. The labels are the cases (assets/cases.jsonl), digested per case.
  scorer: ["evals/reflect/src/score.ts"],
  loadCases: (root, summary) => {
    const file = summary.corpus === "private" ? join(root, "private", NAME, "assets", "cases.jsonl") : join(root, "evals", NAME, "assets", "cases.jsonl");
    return parseCases(readFileSync(file, "utf8"), file);
  },
  legacyProblem: (root, summary) => {
    const dir = summary.corpus === "private" ? join(root, "private", NAME, "assets") : join(root, "evals", NAME, "assets");
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
