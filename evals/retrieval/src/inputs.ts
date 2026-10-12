// What a retrieval run records of its inputs: the digest of what a run read (the library it indexed, the bundle mappings, the queries and
// the qrels), the seed, and the name of the generated.json that generate writes beside the private assets. run.ts, generate.ts and the tests use them.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";

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

/** The file generate writes beside the private assets: the seed they were made with. */
export const GENERATED = "generated.json";
