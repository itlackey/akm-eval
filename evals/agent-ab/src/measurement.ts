// What the agent-ab eval declares about its own measurement: which files collect, which files score, and how a stored task is scored again.
// lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is lib/harbor/score.ts, which agent-ab shares with benchmarks/terminal-bench.
//
// A case is a task. What it presents to the agent is its folder (the instruction, the starting workspace, the verifier that gives the
// reward) and the library the akm arm seeds for it. The verifier runs inside the trial and its reward is raw output, so the scorer reads
// nothing of the case: it has no labels.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Dir } from "../../../lib/harbor/harbor.ts";
import { type Raw, type Row, errored, makeRow, rawOf, summarize } from "../../../lib/harbor/score.ts";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { libraryOf, taskNames } from "./inputs.ts";

/** A task of a corpus, and the digests of what it presents to the agent. */
export interface Case {
  id: string;
  /** The library the akm arm seeds for the task: the AKM_TASK_STASH of its task.toml. */
  library: string | null;
  /** A digest of the task's folder. */
  task_sha256: string;
  /** A digest of that library's folder, null when the task names none or it is not there. */
  library_sha256: string | null;
}

/** The cases of a folder that holds tasks/ and libraries/: the tasks of `names`, else all of them. */
export function casesIn(assets: string, names: string[] = taskNames(join(assets, "tasks"))): Case[] {
  return names.map((id) => {
    const dir = join(assets, "tasks", id);
    const library = libraryOf(dir) ?? null;
    const folder = library === null ? null : join(assets, "libraries", library);
    return { id, library, task_sha256: sha256Dir(dir), library_sha256: folder !== null && existsSync(folder) ? sha256Dir(folder) : null };
  });
}

/**
 * The folder of the corpus a summary was made from, from the checkout at `root`: a custom corpus is in its `corpus_folder`, which scripts/rescore
 * sets from --cases DIR when the run could not record it. The folders of the earlier names (`private`, a rewrite in the usual place) are known.
 */
function assetsOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME);
  if (summary.corpus === "private") return join(root, "private", NAME, "assets"); // a run from before the corpora were public and custom
  if (typeof summary.corpus_folder === "string") return resolve(root, summary.corpus_folder);
  throw new Error("the run read a custom corpus whose folder it did not record, because it is outside the repository");
}

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.2",
  loadCases: (root, summary) => casesIn(assetsOf(root, summary)),
  legacyProblem: () => "its samples.jsonl has one line per trial, and the manifest evals have one line per task with its trials",
  caseId: (c) => c.id,
  input: (c) => ({ task_sha256: c.task_sha256, library: c.library, library_sha256: c.library_sha256 }),
  labels: () => ({}),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
