// What a judge-gate run records of its inputs, and what ties the private cases to the public ones they were made from: the digest
// of the cases file, the seed, and the generated.json that generate writes beside the private cases. run.ts, generate.ts and the
// tests use them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";

/** The one data file of an assets folder. The labels and their reasons are in it. */
export const CASES = "cases.jsonl";

/** The file generate writes beside the private cases, to say what they were made from. */
export const GENERATED = "generated.json";

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

/** The seed in private/seed, or null when there is none. generate-assets makes the file. */
export function readSeed(root: string): string | null {
  try {
    return readFileSync(join(root, "private", "seed"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

export interface Generated {
  /** The seed of the rewrite. */
  seed: string;
  /** casesSha256 of the public assets when the private cases were made. */
  inputs_sha256: string;
  /** What rewrote them. */
  rewrite: string;
}

/** What generate wrote beside the private cases, or undefined when there is no such file or it is not in this format. */
export function readGenerated(assets: string): Generated | undefined {
  try {
    const made = JSON.parse(readFileSync(join(assets, GENERATED), "utf8")) as Partial<Generated>;
    return typeof made.seed === "string" && typeof made.inputs_sha256 === "string" && typeof made.rewrite === "string" ? (made as Generated) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The seed of a private run: the one generate used for the cases, which generated.json holds, else the one in private/seed (generate-assets
 * can be given another with --seed and leaves the file alone), else null. The public corpus has none.
 */
export const privateSeed = (assets: string, root: string): string | null => readGenerated(assets)?.seed ?? readSeed(root);

/**
 * Why run --corpus private must not use the private cases in `assets`, in a sentence that says what to do, or undefined when they are the
 * rewrite of the public cases as they are now. `where` is how the folder is named in the message.
 */
export function staleAssets(assets: string, publicAssets: string, where = assets): string | undefined {
  const again = "Make them again with: ./generate-assets --only judge-gate";
  const made = readGenerated(assets);
  if (!made) return `the private cases in ${where}/ have no ${GENERATED}, so nothing says what they were made from (an older generate, or a generate that stopped). ${again}`;
  if (made.inputs_sha256 !== casesSha256(publicAssets)) return `the private cases in ${where}/ were made from public cases that have changed since. ${again}`;
  return undefined;
}
