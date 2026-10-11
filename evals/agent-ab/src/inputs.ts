// What ties the private agent-ab tasks to the public ones they were made from: the tasks and libraries generate reads, the
// digests it records beside what it writes (generated.json), and the check that run --corpus private makes of them. run.ts,
// generate.ts and the tests use this; it imports neither of them.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { sha256Dir } from "../../../lib/harbor/harbor.ts";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

/** The file generate writes into the assets, to say what they were made from and what they hold. */
export const GENERATED = "generated.json";

/** The task folders under `dir`: the ones with a task.toml, by name. */
export function taskNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "task.toml")))
    .map((e) => e.name)
    .sort();
}

/** Whether a task's tools are made up. Its task.toml says so. */
export const isFictional = (taskDir: string): boolean => /^tools\s*=\s*"fictional"/m.test(readFileSync(join(taskDir, "task.toml"), "utf8"));

/** The library a task seeds: the AKM_TASK_STASH of its task.toml. */
export const libraryOf = (taskDir: string): string | undefined => readFileSync(join(taskDir, "task.toml"), "utf8").match(/^AKM_TASK_STASH\s*=\s*"([^"]+)"/m)?.[1];

/** What generate rewrites in the public folder `from`: its tasks with made-up tools, and the libraries they seed. */
export function publicInputs(from: string): { tasks: string[]; libraries: string[] } {
  const tasks = taskNames(join(from, "tasks")).filter((n) => isFictional(join(from, "tasks", n)));
  const libraries = [...new Set(tasks.map((n) => libraryOf(join(from, "tasks", n))).filter((l): l is string => l !== undefined && existsSync(join(from, "libraries", l))))].sort();
  return { tasks, libraries };
}

/** inputs_sha256: one digest over the files of the public inputs, by task and library, the same on every machine. A change to one of those tasks or libraries changes it. */
export function publicInputsSha256(from: string): string {
  const { tasks, libraries } = publicInputs(from);
  return sha256Text(
    JSON.stringify({
      tasks: tasks.map((n) => [n, sha256Dir(join(from, "tasks", n))]),
      libraries: libraries.map((l) => [l, sha256Dir(join(from, "libraries", l))]),
    }),
  );
}

/** The code that decides what generate makes of the public inputs, by its path from the repository root: generate itself and what it asks of the tasks, the rewrite and its lexicon of tool names. */
export const GENERATOR_CODE = [
  join("evals", "agent-ab", "src", "generate.ts"),
  join("evals", "agent-ab", "src", "inputs.ts"),
  join("evals", "agent-ab", "src", "lib.ts"),
  join("lib", "rewrite", "rewrite.ts"),
  join("lib", "rewrite", "lexicon.ts"),
];

/** generator_sha256: one digest over GENERATOR_CODE in this repository. */
export const generatorSha256 = (root = ROOT): string => sha256Text(GENERATOR_CODE.map((rel) => `${rel}\0${sha256File(join(root, rel))}\n`).join(""));

/** outputs_sha256: one digest over every file of the private assets except the manifest, so a task or library edited, added or dropped afterwards changes it. */
export const outputsSha256 = (assets: string): string => sha256Dir(assets, [GENERATED]);

/** generated.json: what a generate run records beside the private assets. */
export interface Generated {
  /** The format of this file. */
  version: 1;
  /** The seed of the rewrite. */
  seed: string;
  /** publicInputsSha256 of the public tasks and libraries when the private ones were made. */
  inputs_sha256: string;
  /** generatorSha256 when they were made. */
  generator_sha256: string;
  /** outputsSha256 of the assets as they were written. */
  outputs_sha256: string;
}

const DIGEST = /^[0-9a-f]{64}$/;

/** What generate wrote into the assets, or undefined when there is no such file or it is not in this format. */
export function readGenerated(assets: string): Generated | undefined {
  try {
    const made = JSON.parse(readFileSync(join(assets, GENERATED), "utf8")) as Partial<Generated>;
    const ok = made.version === 1 && typeof made.seed === "string" && [made.inputs_sha256, made.generator_sha256, made.outputs_sha256].every((d) => typeof d === "string" && DIGEST.test(d));
    return ok ? (made as Generated) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why run --corpus private must not use the private assets in `assets`, in a sentence that says what to do, or undefined when they are
 * the rewrite of the public tasks as they are now, still as generate wrote them. `from` is the folder of the public tasks and libraries,
 * and `where` is how the assets folder is named in the message.
 */
export function privateAssetsProblem(assets: string, from: string, where = assets): string | undefined {
  const again = "Make them again with: ./generate-assets --only agent-ab";
  if (!existsSync(join(assets, "tasks"))) return `the private assets are missing (${where}/tasks). Make them with: ./generate-assets --only agent-ab`;
  const made = readGenerated(assets);
  if (!made) return `the private assets in ${where}/ have no ${GENERATED} in its current format, so nothing says what they were made from (an older generate, or a generate that stopped). ${again}`;
  if (made.inputs_sha256 !== publicInputsSha256(from)) return `the private assets in ${where}/ were made from public tasks or libraries that have changed since. ${again}`;
  if (made.generator_sha256 !== generatorSha256()) return `the private assets in ${where}/ were made by a generator that has changed since: generate.ts, inputs.ts or lib.ts here, or lib/rewrite (generator_sha256 in ${GENERATED} differs). ${again}`;
  if (made.outputs_sha256 !== outputsSha256(assets)) return `the private assets in ${where}/ are not what generate wrote: a file in them was changed, added or removed since. ${again}`;
  return undefined;
}
