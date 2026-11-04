// What a pair-judge run records of its inputs: the digest of the cases file. run.ts, measurement.ts and the tests use it.

import { sha256Files } from "../../../lib/provenance.ts";

/** The one data file of an assets folder. The labels and their reasons are in it. */
export const CASES = "cases.jsonl";

/** Runs `f` with `dir` as the working folder, and then puts the old one back. sha256Files reads the paths it is given, so a digest that holds on another machine needs paths relative to a fixed folder. */
function inFolder<T>(dir: string, f: () => T): T {
  const before = process.cwd();
  process.chdir(dir);
  try {
    return f();
  } finally {
    process.chdir(before);
  }
}

/** assets_sha256 of summary.json: the digest of the cases file of an assets folder, named by its place in it. It changes when a case or a label does. */
export const casesSha256 = (assets: string): string => inFolder(assets, () => sha256Files([CASES]));
