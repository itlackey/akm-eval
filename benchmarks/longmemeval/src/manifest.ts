// generated.json, which generate writes beside assets/ and map.json in private/longmemeval: the seed of the rewrite. generate.ts, run.ts and the
// tests use it, and so does the digest of a set of files, which a run records as assets_sha256.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import { DATA_FILE } from "./dataset.ts";

/** The file generate writes beside the private assets and the map. */
export const GENERATED = "generated.json";

/** The files a generation writes into a private tree, by their path from the tree (private/longmemeval). */
export const OUTPUTS = [`assets/${DATA_FILE}`, "assets/rewrite.json", "map.json"];

/**
 * One digest over files in `folder`, by their names there, so the same files in another checkout give the same digest. It is the
 * digest sha256Files makes of the names as paths, written out here so that the working folder need not change to get it: a test
 * holds the two together.
 */
export function digestFiles(folder: string, names: string[]): string {
  const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Text(sorted.map((name) => `${name}\0${sha256File(join(folder, name))}\n`).join(""));
}

export interface Generated {
  /** The seed of the rewrite: the one in map.json. It is not private/seed when generate-assets ran with --seed. */
  seed: string;
}

/** The seed in the generated.json of `tree` (private/longmemeval), or undefined when there is none or it holds no seed. */
export function readGenerated(tree: string): Generated | undefined {
  try {
    const g = JSON.parse(readFileSync(join(tree, GENERATED), "utf8")) as Partial<Generated> | null;
    return typeof g?.seed === "string" && /^\d{1,20}$/.test(g.seed) ? { seed: g.seed } : undefined;
  } catch {
    return undefined;
  }
}
