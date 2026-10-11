// What a retrieval run records of its inputs, and what ties the private assets to the public ones they were made from:
// the digest of what a run read (the library it indexed, the bundle mappings, the queries and the qrels), the digest of the public inputs that generate rewrote, the digest of the code that rewrote them, and the seed.
// run.ts, generate.ts and the tests use them.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { sha256File, sha256Files, sha256Text } from "../../../lib/provenance.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

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

/** One digest over a manifest of files, each by its path and the sha256 of its content, in the order of the paths. It is the same wherever the files are. */
export const manifestSha256 = (files: Record<string, string>): string =>
  sha256Text(
    Object.keys(files)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((path) => `${path}\0${files[path]}\n`)
      .join(""),
  );

/** The digests that assets_sha256 of summary.json is made of, kept in the summary as `assets` to tell which input a run differs in. */
export interface AssetsDigests {
  /** Every file akm indexed, by its path from the library and the sha256 of its content. For a library of bundles it is the files of each bundle that bundles.json names, by the bundle's name, wherever the bundle is. */
  library_sha256: string;
  /** The mapping of bundles.json, bundle folder to adapter, or null for a library that has none. */
  bundles_sha256: string | null;
  queries_sha256: string;
  qrels_sha256: string;
}

/**
 * The digests of what a run was made from: the library akm indexed, the bundle mappings, and the set's queries and qrels. They hold the
 * content of each file and no path outside the library, so they are the same on another machine and in another checkout.
 */
export function assetsDigests(library: { files: Record<string, string>; adapters?: Record<string, string> }, queriesFile: string, qrelsFile: string): AssetsDigests {
  return {
    library_sha256: manifestSha256(library.files),
    bundles_sha256: library.adapters ? sha256Text(JSON.stringify(Object.entries(library.adapters).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))) : null,
    queries_sha256: sha256File(queriesFile),
    qrels_sha256: sha256File(qrelsFile),
  };
}

/** assets_sha256 of summary.json: one digest over the four digests of `assets`, in the order they are listed, one to a line (`none` for no bundle mapping). */
export const assetsSha256 = (d: AssetsDigests): string => sha256Text([d.library_sha256, d.bundles_sha256 ?? "none", d.queries_sha256, d.qrels_sha256].join("\n"));

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
  /** rewriteSha256 when the assets were made: a digest of the code that rewrote them. */
  rewrite: string;
}

/** The code that decides what generate makes of the public inputs, by its path from the repository root: the rewrite, its lexicon of tool names, and generate itself, which says which tools keep their names. */
export const REWRITE_CODE = [join("lib", "rewrite", "rewrite.ts"), join("lib", "rewrite", "lexicon.ts"), join("evals", "retrieval", "src", "generate.ts")];

/** One digest over REWRITE_CODE in this repository. It is the rewrite that runs, so it never depends on the root of the inputs. A change to the rewrite, the lexicon or the pins changes it. */
export const rewriteSha256 = (): string => inFolder(ROOT, () => sha256Files(REWRITE_CODE));

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
  if (made.rewrite !== rewriteSha256()) return `the private assets in ${where}/ were made by a rewrite that has changed since: lib/rewrite, its lexicon or the tools that generate pins. ${again}`;
  return undefined;
}
