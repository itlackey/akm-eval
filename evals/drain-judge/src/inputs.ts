// What a drain-judge run records of its inputs: the digest of the cases file. run.ts and the tests use it.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";

/** The cases that are scored. The held-out ones are in HELD_OUT, not in this file. */
export const CASES = "cases.jsonl";
/** The held-out cases: set aside, same format, run only to confirm a decision (assets/README.md, "Held-out part"). */
export const HELD_OUT = "heldout.jsonl";
/** The cases akm can no longer produce, with the reason (assets/README.md, "Reachability"). The scorer does not read it. */
export const RETIRED = "retired.jsonl";

/** The page of the public assets that holds the labelling rubric and its `rubric_version`. */
export const RUBRIC = "README.md";

/** The version of the rubric the labels were adjudicated under, from the `rubric_version: N` line of the assets README. A summary records it. */
export function rubricVersion(assets: string): number {
  const found = /^rubric_version:\s*(\d+)\s*$/m.exec(readFileSync(join(assets, RUBRIC), "utf8"));
  if (!found) throw new Error(`${join(assets, RUBRIC)} has no "rubric_version: N" line`);
  return Number(found[1]);
}

function inFolder<T>(dir: string, f: () => T): T {
  const before = process.cwd();
  process.chdir(dir);
  try {
    return f();
  } finally {
    process.chdir(before);
  }
}

/** assets_sha256 of summary.json: the digest of the cases file of an assets folder. It changes when a case or a label does. */
export const casesSha256 = (assets: string): string => inFolder(assets, () => sha256Files([CASES]));
