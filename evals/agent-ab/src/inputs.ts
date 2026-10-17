// The tasks and libraries generate reads, the generated.json it writes beside them, and the check that run --corpus custom makes that
// they are there. run.ts, generate.ts and the tests use this; it imports neither of them.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The file generate writes into the assets: the seed they were made with. */
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

/** Why run --corpus custom must not use the private assets in `assets`, in a sentence that says what to do, or undefined when they are there. `where` is how the folder is named in the message. */
export function privateAssetsProblem(assets: string, where = assets): string | undefined {
  if (!existsSync(join(assets, "tasks"))) return `the private assets are missing (${where}/tasks). Make them with: ./generate-assets --only agent-ab`;
  return undefined;
}
