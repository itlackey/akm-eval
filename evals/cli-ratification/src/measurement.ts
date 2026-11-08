// What the cli-ratification eval declares about its own measurement: its version, and how a stored task is scored again.
// lib/manifest.ts has the contract (`Measurement`).
//
// A case is a task. What it presents to the agent is its folder (the card, the workspace, the verifier), the library the arms seed for it,
// and the arms (arms.json and the prompts). The verifier runs inside the trial and its checks, and the trace of the agent's calls, are raw
// output stored in the row; the scorer reads only the task's family.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Dir } from "../../../lib/harbor/harbor.ts";
import type { Measurement } from "../../../lib/manifest.ts";
import { libraryOf, taskNames } from "../../agent-ab/src/inputs.ts";
import { NAME, armsDigestOf, specOf } from "./collect.ts";
import { type Family, type Raw, type Row, errored, makeRow, summarize } from "./score.ts";

export interface Case {
  id: string;
  family: Family;
  library: string | null;
  task_sha256: string;
  library_sha256: string | null;
  /** A digest of arms.json and the prompts: the wrapper, and the guidance card. */
  arms_sha256: string;
}

/** The cases of a folder that holds tasks/, libraries/, prompts/ and arms.json: the tasks of `names`, else all of them. */
export function casesIn(assets: string, names: string[] = taskNames(join(assets, "tasks"))): Case[] {
  const arms = armsDigestOf(assets);
  return names.map((id) => {
    const dir = join(assets, "tasks", id);
    const library = libraryOf(dir) ?? null;
    const folder = library === null ? null : join(assets, "libraries", library);
    return { id, family: specOf(dir).family, library, task_sha256: sha256Dir(dir), library_sha256: folder !== null && existsSync(folder) ? sha256Dir(folder) : null, arms_sha256: arms };
  });
}

function assetsOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME);
  if (typeof summary.corpus_folder === "string") return resolve(root, summary.corpus_folder);
  throw new Error("the run read a custom corpus whose folder it did not record, because it is outside the repository");
}

function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (!Array.isArray(row.arms)) missing.push("arms");
  if (!Array.isArray(row.trials)) missing.push("trials");
  else for (const field of ["task", "trial", "reward", "error", "akm", "cli_arm", "family", "failed_checks", "mediated", "trace"]) if (row.trials.some((t: any) => !(field in t))) missing.push(`trials[].${field}`);
  return missing.length ? { missing } : { raw: { arms: row.arms, trials: row.trials } };
}

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm and of what it stores. Change it by hand when that changes; runs are compared by it.
  version: "0.1",
  scoringVersion: "0.1",
  loadCases: (root, summary) => casesIn(assetsOf(root, summary)),
  caseId: (c) => c.id,
  input: (c) => ({ task_sha256: c.task_sha256, library: c.library, library_sha256: c.library_sha256, arms_sha256: c.arms_sha256 }),
  labels: (c) => ({ family: c.family }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
