// What a judge-gate run records of its inputs: the digest of the cases file, and the generated.json that generate writes beside the
// private cases. run.ts, generate.ts and the tests use them.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";

/** The one data file of an assets folder. The labels and their reasons are in it. */
export const CASES = "cases.jsonl";

/** The file generate writes beside the private cases: the seed they were made with. */
export const GENERATED = "generated.json";

/** The page of the public assets that holds the labelling rubric and its `rubric_version`. */
export const RUBRIC = "README.md";

/**
 * The version of the rubric that the labels of `assets` were adjudicated under, from the `rubric_version: N` line of its README. A change
 * of a label under the rubric, or of the rubric, raises it, and a summary records it, so that a score is never compared with one from
 * other labels. The private cases are a rewrite of the public ones and take the public version, so `assets` is always the public folder.
 */
export function rubricVersion(assets: string): number {
  const found = /^rubric_version:\s*(\d+)\s*$/m.exec(readFileSync(join(assets, RUBRIC), "utf8"));
  if (!found) throw new Error(`${join(assets, RUBRIC)} has no "rubric_version: N" line`);
  return Number(found[1]);
}

/** Runs `f` with `dir` as the working folder, and then puts the old one back. sha256Files reads the paths it is given, so a digest that holds on another machine needs paths relative to a fixed folder. */
export function inFolder<T>(dir: string, f: () => T): T {
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

/** Why run --corpus private cannot start from `assets`: the cases are missing. Undefined when it can. */
export function privateAssetsProblem(assets: string, where = assets): string | undefined {
  if (!existsSync(join(assets, CASES))) return `the private assets are missing (${where}/${CASES}). Make them with: ./generate-assets --only judge-gate`;
  return undefined;
}
