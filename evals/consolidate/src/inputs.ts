// What ties a consolidate or nightly run to its inputs: the digest of the files a run reads, the marker generated.json that
// `generate` leaves beside the assets, and the fields every summary.json holds about the config and the assets. Both evals use it,
// nightly through its own lib.
//
// `generate` writes into a temporary folder and moves the result into place only when every check has passed, so a failed run
// leaves the previous private set as it was, and a run never meets a new map with old assets. generated.json holds the seed.

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type EngineSettings, engineSettings, redactConfig, sha256Files } from "../../../lib/provenance.ts";

/** The marker `generate` writes in private/<name>/, beside assets/ and map.json: the seed the set was made with. */
export const GENERATED = "generated.json";

/**
 * One digest over files of the folder `base`, as lib/provenance's sha256Files gives it, for the paths relative to `base`. The paths
 * are part of the digest, so it holds on another machine and in another checkout, and the public assets and a run on them give the same one.
 * sha256Files reads a path as given, so the digest is taken from `base`.
 */
export function assetsDigest(base: string, files: string[]): string {
  const here = process.cwd();
  process.chdir(base);
  try {
    return sha256Files(files);
  } finally {
    process.chdir(here);
  }
}

/** Why a run on the rewrite of `name` (in `dir`, private/<name>) cannot go ahead, or null when it can. `probe` is the file of the assets that has to be there. */
export function privateAssetsProblem(name: string, dir: string, probe: string): string | null {
  if (!existsSync(join(dir, "assets", probe))) return `the private assets are missing (private/${name}/assets/${probe}). Make them with: ./generate-assets --only ${name}`;
  return null;
}

/** The folder `generateInto` hands to `make`: its own assets/, map.json and generated.json are the ones that replace the set. */
export interface Stage {
  /** The temporary folder. Anything in it is removed afterwards, and only assets/ and map.json are kept. */
  dir: string;
  assets: string;
  map: string;
}

/** Replaces the folder `target` with `next`, and puts `target` back if that fails. */
export function replaceDir(next: string, target: string): void {
  const old = `${target}.old`;
  rmSync(old, { recursive: true, force: true });
  if (existsSync(target)) renameSync(target, old);
  try {
    renameSync(next, target);
  } catch (e) {
    if (existsSync(old)) renameSync(old, target);
    throw e;
  }
  rmSync(old, { recursive: true, force: true });
}

/**
 * Makes a private set in `out` (private/<name>) without leaving a half-made one. `make` writes the assets and the rewrite map into
 * a temporary folder, `.new` in `out`, and returns what is wrong with them. Only when it returns nothing wrong are they moved into
 * `out`, and generated.json (the seed) is written last. A failure, whether `make` returns problems or throws, removes the temporary
 * folder and leaves the previous assets, map and generated.json as they were.
 */
export function generateInto(out: string, seed: string, make: (stage: Stage) => string[]): string[] {
  const dir = join(out, ".new");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    const stage = { dir, assets: join(dir, "assets"), map: join(dir, "map.json") };
    const problems = make(stage);
    if (problems.length > 0) return problems;
    writeFileSync(join(dir, GENERATED), `${JSON.stringify({ seed }, null, 2)}\n`);
    rmSync(join(out, GENERATED), { force: true });
    replaceDir(stage.assets, join(out, "assets"));
    renameSync(stage.map, join(out, "map.json"));
    renameSync(join(dir, GENERATED), join(out, GENERATED));
    return [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What a summary.json says about the config and the assets of a run. */
export interface RunInputs {
  /** The akm config the eval wrote, with secrets redacted and the model endpoint written as <MODEL_BASE_URL>, like the rows. */
  config: Record<string, any>;
  /** The settings of the engine the config names as its default: model, endpoint host, temperature, thinking and timeout. */
  engine: EngineSettings;
  /** One digest over the case and label files the run read, as assetsDigest gives it. */
  assets_sha256: string;
  /** The seed of the private assets the run read, null for the public ones. */
  seed: string | null;
}

/** The fields for a summary. `hide` writes the model endpoint as <MODEL_BASE_URL>. */
export function runInputs(config: Record<string, any>, hide: (text: string) => string, assets: { dir: string; files: string[] }, seed: string | null): RunInputs {
  return { config: JSON.parse(hide(JSON.stringify(redactConfig(config)))), engine: engineSettings(config), assets_sha256: assetsDigest(assets.dir, assets.files), seed };
}
