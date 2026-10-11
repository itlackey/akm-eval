// What ties the private LongMemEval assets to what made them: generated.json, which generate writes beside assets/ and map.json,
// and the check `run --corpus private` makes of it. generate.ts, run.ts and the tests use them.
//
// The manifest holds the seed of the rewrite, the digest of the public input (ASSETS.lock, which pins the dataset by revision and
// sha256), the digest of the code that made the assets (the generator's own files and lib/rewrite) and the digest of the
// files it wrote (the questions, rewrite.json and the map). The run refuses a tree that has no manifest, one made from other
// inputs or by other code, and one whose files are not the ones the manifest names.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import { DATA_FILE } from "./dataset.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

/** The file generate writes beside the private assets and the map. */
export const GENERATED = "generated.json";

/** The format of generated.json. A run reads this one and no other. */
export const MANIFEST_VERSION = 1;

/** The files of a private tree that the manifest vouches for, by their path from the tree (private/longmemeval). */
export const OUTPUTS = [`assets/${DATA_FILE}`, "assets/rewrite.json", "map.json"];

/**
 * The code that decides what generate makes of the public dataset, by its path from the repository root: lib/rewrite and its
 * lexicon, and the generator's own files (generate.ts, the dataset code it reads the questions with, and this one, which says what
 * the manifest holds). A change to any of them makes assets made before it stale.
 */
export const GENERATOR_CODE = [
  "lib/rewrite/rewrite.ts",
  "lib/rewrite/lexicon.ts",
  "benchmarks/longmemeval/src/generate.ts",
  "benchmarks/longmemeval/src/dataset.ts",
  "benchmarks/longmemeval/src/manifest.ts",
];

/**
 * One digest over files in `folder`, by their names there, so the same files in another checkout give the same digest. It is the
 * digest sha256Files makes of the names as paths, written out here so that the working folder need not change to get it: a test
 * holds the two together.
 */
export function digestFiles(folder: string, names: string[]): string {
  const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Text(sorted.map((name) => `${name}\0${sha256File(join(folder, name))}\n`).join(""));
}

/** The digest of the public input: ASSETS.lock, which pins the dataset by revision and sha256. generate checks the dataset file against it before it reads one. */
export const inputsSha256 = (publicAssets: string): string => digestFiles(publicAssets, ["ASSETS.lock"]);

/** The digest of GENERATOR_CODE in the repository at `root`. */
export const generatorSha256 = (root = ROOT): string => digestFiles(root, GENERATOR_CODE);

/** The digest of the files a generation wrote into `tree`: the questions, rewrite.json and the map. */
export const outputsSha256 = (tree: string): string => digestFiles(tree, OUTPUTS);

export interface Generated {
  version: number;
  /** The seed of the rewrite: the one in map.json. It is not private/seed when generate-assets ran with --seed. */
  seed: string;
  /** The seed of a question draw that generate made. It makes none, so this is null: a run draws its sample under --sample-seed and records it in summary.json. */
  sample_seed: number | null;
  /** inputsSha256 when the assets were made. */
  inputs_sha256: string;
  /** generatorSha256 when the assets were made. */
  generator_sha256: string;
  /** outputsSha256 of the tree that generate wrote. */
  outputs_sha256: string;
}

/** What generate reads before it reads or writes anything else: an input or a generator that changes during the run makes the assets stale, not fresh. */
export interface Basis {
  inputs_sha256: string;
  generator_sha256: string;
}

export const basisOf = (publicAssets: string, root = ROOT): Basis => ({ inputs_sha256: inputsSha256(publicAssets), generator_sha256: generatorSha256(root) });

/** The manifest of the files now in `tree`, made from `seed` and what the generation was based on. */
export const manifestOf = (tree: string, seed: string, basis: Basis): Generated => ({ version: MANIFEST_VERSION, seed, sample_seed: null, ...basis, outputs_sha256: outputsSha256(tree) });

const DIGEST = /^[0-9a-f]{64}$/;

/** The manifest in `tree` (private/longmemeval), or undefined when there is none or it is not a manifest of the format this code reads. */
export function readGenerated(tree: string): Generated | undefined {
  try {
    const g = JSON.parse(readFileSync(join(tree, GENERATED), "utf8")) as Partial<Generated> | null;
    const ok = g !== null && typeof g === "object" && g.version === MANIFEST_VERSION && typeof g.seed === "string" && /^\d{1,20}$/.test(g.seed) && (g.sample_seed === null || typeof g.sample_seed === "number") && [g.inputs_sha256, g.generator_sha256, g.outputs_sha256].every((d) => typeof d === "string" && DIGEST.test(d));
    return ok ? (g as Generated) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why `run --corpus private` must not use the private tree in `tree`, in a sentence that says what to do, or undefined when the
 * manifest vouches for it: it is there, the public lock and the generator are the ones the assets were made from, and the files are
 * the ones generate wrote. `where` is how the folder is named in the message.
 */
export function treeProblem(tree: string, publicAssets: string, where = tree, root = ROOT): string | undefined {
  const again = "Make them again with: ./generate-assets --only longmemeval";
  const made = readGenerated(tree);
  if (!made) return `the private assets in ${where}/ have no ${GENERATED} that this run reads, so nothing says what they were made from or that a generation finished (an older generate, or one that stopped). ${again}`;
  if (made.inputs_sha256 !== inputsSha256(publicAssets)) return `the private assets in ${where}/ were made from another public dataset than the one ASSETS.lock pins now (inputs_sha256 in ${GENERATED} differs). ${again}`;
  if (made.generator_sha256 !== generatorSha256(root)) return `the private assets in ${where}/ were made by a generator that has changed since: lib/rewrite, its lexicon, or generate.ts, dataset.ts or manifest.ts of this benchmark (generator_sha256 in ${GENERATED} differs). ${again}`;
  const missing = OUTPUTS.filter((name) => !existsSync(join(tree, name)));
  if (missing.length > 0) return `the private assets in ${where}/ lack ${missing.join(", ")}, which ${GENERATED} names. ${again}`;
  if (made.outputs_sha256 !== outputsSha256(tree)) return `the files in ${where}/ are not the ones generate wrote (${OUTPUTS.join(", ")}: outputs_sha256 in ${GENERATED} differs). They were edited or replaced since. ${again}`;
  return undefined;
}
