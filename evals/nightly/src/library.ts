// Reading a library folder: the files of a bundle, without akm's own folder. The collector reads the sandbox's bundle with it before and after the night,
// and night.ts reads the planted night's library. It imports nothing of the repository, so it belongs to no part of the measurement by itself: the
// part that imports it covers it.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** akm's own folder in a bundle. It holds what a retirement archives, and is not part of the library. */
export const AKM_FOLDER = ".akm";

/** Every file under `dir`, as paths relative to it, in order. akm's own folder is left out. */
export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((p) => p !== AKM_FOLDER && !p.startsWith(`${AKM_FOLDER}/`) && statSync(join(dir, p)).isFile())
    .sort();
}

/** The text of each file under `dir`, by path. */
export function readLibrary(dir: string): Map<string, string> {
  return new Map(listFiles(dir).map((p) => [p, readFileSync(join(dir, p), "utf8")]));
}
