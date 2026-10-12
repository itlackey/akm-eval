// Helpers for the distill eval that belong to neither part of its measurement: the cases and where they are, the digests of what a run
// read, and what generate records beside the rewrite. The scorer is score.ts and the collector is collect.ts (see measurement.ts); this
// file re-exports both, so the eval and the evals that borrow its checks (nightly) import from one place.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import { NAME } from "./collect.ts";
import { CLASSES, type Case, type LoadedCase, expectOf, lessonFile, memoryBody } from "./score.ts";

export * from "./score.ts";
export * from "./collect.ts";

/** The cases in `assets/cases.json`, each with its memory read from `assets/bundles/<id>/memories/`. */
export function loadCases(assets: string): LoadedCase[] {
  const file = join(assets, "cases.json");
  let rows: unknown;
  try {
    rows = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${file} has no cases`);
  const seen = new Set<string>();
  return rows.map((row: Case, i) => {
    const at = `${file}: case ${i + 1}${typeof row?.id === "string" ? ` (${row.id})` : ""}`;
    if (typeof row?.id !== "string" || !/^[a-z0-9-]+$/.test(row.id)) throw new Error(`${at} needs an id of lower case letters, digits and dashes`);
    if (seen.has(row.id)) throw new Error(`${at} repeats an id`);
    seen.add(row.id);
    if (!CLASSES.includes(row.class)) throw new Error(`${at} has class "${row.class}", expected one of ${CLASSES.join(", ")}`);
    if (row.expect !== expectOf(row.class)) throw new Error(`${at} is ${row.class}, so it expects ${expectOf(row.class)}, not "${row.expect}"`);
    if (typeof row.note !== "string" || !row.note.trim()) throw new Error(`${at} has no note`);
    const groups = (key: "required" | "forbidden" | "contradicts") => {
      const value = row[key] ?? [];
      const ok = Array.isArray(value) && value.every((g) => Array.isArray(g) && g.length > 0 && g.every((p) => typeof p === "string" && /[a-z0-9]/i.test(p)));
      if (!ok) throw new Error(`${at} needs ${key} as a list of lists of phrases, each with a letter or a digit`);
      return value;
    };
    const required = groups("required");
    const forbidden = groups("forbidden");
    const contradicts = groups("contradicts");
    if (row.reversed !== undefined && (typeof row.reversed !== "string" || !row.reversed.trim())) throw new Error(`${at} has a "reversed" example lesson that is not text`);
    if (row.expect === "lesson" || row.expect === "update") {
      if (required.length === 0 || forbidden.length === 0) throw new Error(`${at} expects ${row.expect === "lesson" ? "a lesson" : "an update"}, so it needs required and forbidden`);
      for (const key of ["good", "bad"] as const) if (typeof row[key] !== "string" || !row[key]?.trim()) throw new Error(`${at} needs a "${key}" example lesson`);
    } else if (required.length > 0 || forbidden.length > 0 || contradicts.length > 0 || row.reversed !== undefined) {
      throw new Error(`${at} expects no lesson, so it has no required, forbidden, contradicts or reversed`);
    }
    const dir = join(assets, "bundles", row.id);
    const memories = existsSync(join(dir, "memories")) ? readdirSync(join(dir, "memories")).filter((f) => f.endsWith(".md")) : [];
    if (memories.length !== 1) throw new Error(`${at} needs exactly one memory in ${join(dir, "memories")}, found ${memories.length}`);
    const name = memories[0].slice(0, -".md".length);
    let existingBody: string | undefined;
    if (row.expect === "update") {
      const file = join(dir, "lessons", `${row.existing}.md`);
      if (typeof row.existing !== "string" || !row.existing || !existsSync(file)) throw new Error(`${at} is a lesson update, so it needs "existing": the name of a lesson in ${join(dir, "lessons")}`);
      if (`lessons/${row.existing}.md` === lessonFile({ name })) throw new Error(`${at} holds its existing lesson where distill would write the memory's own, so distill would skip the memory and never try an update`);
      existingBody = memoryBody(readFileSync(file, "utf8"));
    }
    return { ...row, required, forbidden, contradicts, dir, name, memory: readFileSync(join(dir, "memories", memories[0]), "utf8"), ...(existingBody === undefined ? {} : { existingBody }) };
  });
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases taken from each class in turn, in file
 * order, so a short run covers as many classes as it can.
 */
export function selectCases(cases: LoadedCase[], limit?: number): LoadedCase[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const queues = CLASSES.map((k) => cases.filter((c) => c.class === k)).filter((q) => q.length > 0);
  const picked = new Set<LoadedCase>();
  for (let round = 0; picked.size < limit; round++) {
    for (const queue of queues) if (picked.size < limit && round < queue.length) picked.add(queue[round]);
  }
  return cases.filter((c) => picked.has(c));
}

// ---- Where the cases are -----------------------------------------------------------------------------------------

/** The folders of the corpora that runs before custom corpora named by kind, under private/distill/. */
const OLD_FOLDERS: Record<string, string> = { private: "assets", own: join("own", "assets"), "own-feedback": join("own", "assets-feedback") };

/**
 * The folder of the cases that a stored run read, from its summary. The public corpus is the one in this repository. A custom corpus is the
 * `corpus_folder` the run recorded (from the repository root), which is absent when the folder was outside the repository, and then the run
 * cannot be found without being told where (`--cases`). A run from before custom corpora names `private`, `own` or `own-feedback`.
 */
export function corpusFolder(root: string, summary: Record<string, any>): string {
  const corpus = summary.corpus;
  if (corpus === "public") return join(root, "evals", NAME, "assets");
  if (typeof summary.corpus_folder === "string" && summary.corpus_folder !== "") return resolve(root, summary.corpus_folder);
  if (typeof corpus === "string" && Object.hasOwn(OLD_FOLDERS, corpus)) return join(root, "private", NAME, OLD_FOLDERS[corpus]);
  throw new Error(`the run read the corpus ${JSON.stringify(corpus)}, whose folder it did not record (it was outside the repository). Name the folder with --cases DIR`);
}

// ---- What a run read -------------------------------------------------------------------------------------------

/**
 * One digest over files, each named by a name of its own: the digest of sha256Files, except that the name is not the path
 * the file is read from. A name relative to the corpus folder gives a digest that holds in another checkout.
 */
export function digestOf(files: [name: string, path: string][]): string {
  const sorted = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Text(sorted.map(([name, path]) => `${name}\0${sha256File(path)}\n`).join(""));
}

/** The digest of what a run reads from a corpus folder: its cases.json and every file of its bundles. */
export function assetsSha256(assets: string): string {
  const bundles = join(assets, "bundles");
  const inBundles = existsSync(bundles) ? readdirSync(bundles, { recursive: true }).map(String).filter((f) => statSync(join(bundles, f)).isFile()).map((f) => `bundles/${f}`) : [];
  return digestOf(["cases.json", ...inBundles].map((name) => [name, join(assets, name)]));
}

/** The files of a case's bundle, by path inside the bundle, with the digest of each: what akm is given. */
export function bundleFiles(dir: string): Record<string, string> {
  const names = readdirSync(dir, { recursive: true }).map(String).filter((f) => statSync(join(dir, f)).isFile()).sort();
  return Object.fromEntries(names.map((f) => [f, sha256File(join(dir, f))]));
}

/** The repository root. The generator's code is read from here, so a copy of the repository digests its own files. */
const ROOT = resolve(import.meta.dir, "..", "..", "..");

/**
 * The code that decides what generate makes of the public assets and whether it accepts the result, by its path from `root`: generate.ts,
 * lib.ts and score.ts (the checks generate runs on what the rewrite made), lib/negation.ts (the rule of negation those checks share with
 * extract) and the code of lib/rewrite, without its tests.
 */
export function generatorFiles(root = ROOT): string[] {
  const inRewrite = readdirSync(join(root, "lib", "rewrite"), { recursive: true }).map(String).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
  return ["evals/distill/src/generate.ts", "evals/distill/src/lib.ts", "evals/distill/src/score.ts", "lib/negation.ts", ...inRewrite.map((f) => `lib/rewrite/${f}`)];
}

/** One digest over generatorFiles. A change to the generator, to its checks or to the rewrite changes it. */
export const generatorSha256 = (root = ROOT): string => digestOf(generatorFiles(root).map((name) => [name, join(root, name)]));

/** What generate writes beside the private assets: the seed they were made with, the digest of the public assets they were made from, and the digest of the code that made them. */
export interface Generated {
  seed: string;
  inputs_sha256: string;
  /** generatorSha256 when the assets were made. */
  rewrite: string;
}

export const GENERATED = "generated.json";

/** generated.json in `dir` (private/distill), or undefined when it is missing or does not hold a seed and the two digests. */
export function readGenerated(dir: string): Generated | undefined {
  try {
    const g = JSON.parse(readFileSync(join(dir, GENERATED), "utf8")) as Partial<Generated> | null;
    return typeof g?.seed === "string" && typeof g.inputs_sha256 === "string" && typeof g.rewrite === "string" ? { seed: g.seed, inputs_sha256: g.inputs_sha256, rewrite: g.rewrite } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why the private assets next to generated.json in `dir` may not be used, or undefined when it vouches for them: it is there, the public
 * assets it names the digest of are the ones in `publicAssets` now, and the generator that made them is the one in `root` now. Assets made
 * before the public ones changed, or by a generator or a rewrite that has changed since, would score a different set than the public run does.
 */
export function generatedProblem(dir: string, publicAssets: string, root = ROOT): string | undefined {
  const generated = readGenerated(dir);
  if (!generated) return `${GENERATED} is missing or holds no seed, inputs_sha256 and rewrite, so nothing shows what they were made from`;
  if (generated.inputs_sha256 !== assetsSha256(publicAssets)) return `they were made from other public assets than the ones in this checkout (inputs_sha256 in ${GENERATED} differs)`;
  if (generated.rewrite !== generatorSha256(root)) return `they were made by a generator that has changed since: evals/distill/src/generate.ts, lib.ts, score.ts, lib/negation.ts or lib/rewrite (rewrite in ${GENERATED} differs)`;
  return undefined;
}
