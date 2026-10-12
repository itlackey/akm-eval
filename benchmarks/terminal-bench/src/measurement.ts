// What the terminal-bench benchmark declares about its own measurement: its version, and how a stored task is
// scored again. lib/manifest.ts has the contract (`Measurement`) and the README's "Compare two runs" the story.
//
// This file only wires the parts together. What it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is lib/harbor/score.ts, which terminal-bench shares with evals/agent-ab.
//
// A case is a task of the pinned dataset. What it presents to the agent is the task, which Harbor fetches by the digest ASSETS.lock
// records for it, and the library the akm arm seeds for every task. The verifier runs inside the trial and its reward is raw output, so
// the scorer reads nothing of the case: it has no labels.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Dir } from "../../../lib/harbor/harbor.ts";
import { type Raw, type Row, errored, makeRow, rawOf, summarize } from "../../../lib/harbor/score.ts";
import type { Measurement } from "../../../lib/manifest.ts";
import { type Lock, NAME } from "./collect.ts";

/** A task of the dataset, and what it presents to the agent. */
export interface Case {
  id: string;
  /** The digest of the task in the dataset, from ASSETS.lock. Null for a task the lock does not know. */
  task_digest: string | null;
  /** A digest of the library the akm arm seeds, null when the run did not record one. */
  library_sha256: string | null;
}

export const caseOf = (id: string, task_digest: string | null | undefined, library_sha256: string | null | undefined): Case => ({ id, task_digest: task_digest ?? null, library_sha256: library_sha256 ?? null });

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.2",
  // The tasks of the pinned dataset, with the library the akm arm seeds. The tasks are Harbor's and are not in this repository; the library is
  // the one in the run's corpus folder (corpus/ for the public corpus, `corpus_folder` for a custom one, which scripts/rescore sets from --cases
  // DIR when the run could not record it), else the digest the run recorded.
  loadCases: (root, summary) => {
    const lock = JSON.parse(readFileSync(join(root, "benchmarks", NAME, "assets", "ASSETS.lock"), "utf8")) as Lock;
    const folder = summary.corpus === "public" ? join(root, "corpus") : typeof summary.corpus_folder === "string" ? resolve(root, summary.corpus_folder) : null;
    const library = folder === null ? undefined : join(folder, "library");
    const sha = library !== undefined && existsSync(library) ? sha256Dir(library) : summary.library?.sha256;
    return Object.entries(lock.tasks).map(([id, digest]) => caseOf(id, digest, sha));
  },
  caseId: (c) => c.id,
  input: (c) => ({ task_digest: c.task_digest, library_sha256: c.library_sha256 }),
  labels: () => ({}),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
