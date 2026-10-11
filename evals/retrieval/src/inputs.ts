// What a retrieval run records of its inputs, and what ties the private assets to the public ones they were made from:
// the digest of the files a run read, the digest of the public inputs that generate rewrote, and the seed.
// run.ts, generate.ts and the tests use them.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";

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

/** Every file under `dir`, links followed as a copy of the folder follows them. */
export function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    const stat = statSync(path);
    return stat.isDirectory() ? filesUnder(path) : stat.isFile() ? [path] : [];
  });
}

/** assets_sha256 of summary.json: one digest over the files a run read, by their path from `base`, which is the folder of the set. */
export const filesSha256 = (base: string, files: string[]): string => inFolder(base, () => sha256Files(files.map((file) => relative(base, file))));

/** The seed in private/seed, or null when there is none. generate-assets makes the file. */
export function readSeed(root: string): string | null {
  try {
    return readFileSync(join(root, "private", "seed"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** The file generate writes beside the private assets, to say what they were made from. */
export const GENERATED = "generated.json";

export interface Generated {
  /** The seed of the rewrite. */
  seed: string;
  /** publicInputsSha256 when the assets were made. */
  inputs_sha256: string;
  /** What rewrote them. */
  rewrite: string;
}

/** The public files the private assets are made from, by their path from the repository root: the library and the books' library, and each collection's queries and qrels. */
export function publicInputs(root: string): string[] {
  const assets = join("evals", "retrieval", "assets");
  const libraries = [join("corpus", "library"), join(assets, "books", "library")];
  const files = [join(assets, "queries.jsonl"), join(assets, "qrels.jsonl"), join(assets, "books", "queries.jsonl"), join(assets, "books", "qrels.jsonl")];
  return [...libraries.flatMap((dir) => filesUnder(join(root, dir)).map((file) => relative(root, file))), ...files];
}

/** One digest over the public inputs, the same on every machine. A change to the library, the queries or the qrels (label appends to them) changes it. */
export const publicInputsSha256 = (root: string): string => inFolder(root, () => sha256Files(publicInputs(root)));

/** What generate wrote beside the assets, or undefined when there is no such file or it is not in this format. */
export function readGenerated(assets: string): Generated | undefined {
  try {
    const made = JSON.parse(readFileSync(join(assets, GENERATED), "utf8")) as Partial<Generated>;
    return typeof made.seed === "string" && typeof made.inputs_sha256 === "string" && typeof made.rewrite === "string" ? (made as Generated) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why run --corpus private must not use the private assets in `assets`, in a sentence that says what to do, or undefined when they are
 * the rewrite of the public inputs as they are now. `where` is how the folder is named in the message.
 */
export function staleAssets(assets: string, root: string, where = assets): string | undefined {
  const again = "Make them again with: ./generate-assets --only retrieval";
  const made = readGenerated(assets);
  if (!made) return `the private assets in ${where}/ have no ${GENERATED}, so nothing says what they were made from (an older generate, or a generate that stopped). ${again}`;
  if (made.inputs_sha256 !== publicInputsSha256(root)) return `the private assets in ${where}/ were made from public inputs that have changed since: the library, the queries or the qrels. ${again}`;
  return undefined;
}
