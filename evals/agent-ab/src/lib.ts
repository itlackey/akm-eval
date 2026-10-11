// agent-ab lib: checks on the tasks that need no model.
//
// A task measures akm only when the control arm fails it, and the README's rule is that a task is kept when its control
// fails on two or more models. That needs models, so the tests cannot run it. What they can check is the other half: the
// answer a verifier asks for is written in the task's library (its gold ref), and nothing in what the agent is given points
// it at akm or at the ref. A task whose library lacks what its verifier wants can only be failed, and one that names the ref
// is passed by copying.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface TaskSpec {
  /** The library the task seeds: the AKM_TASK_STASH of its task.toml. */
  library?: string;
  /** The asset of that library the answer is written in, such as `skills/drillbit`. */
  goldRef?: string;
  /** The literals the verifier looks for that the instruction does not give, such as a flag or a field name. The gold ref must hold each. */
  tokens: string[];
}

type Toml = { metadata?: { gold_ref?: string; library_tokens?: string[] }; environment?: { env?: { AKM_TASK_STASH?: string } } };

export function specOf(taskDir: string): TaskSpec {
  const toml = Bun.TOML.parse(readFileSync(join(taskDir, "task.toml"), "utf8")) as Toml;
  return { library: toml.environment?.env?.AKM_TASK_STASH, goldRef: toml.metadata?.gold_ref, tokens: toml.metadata?.library_tokens ?? [] };
}

/** Every file under `dir`, with its path relative to it. */
function filesUnder(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)]));
}

/** What the agent can read of a gold ref: the files of a folder ref (not akm's index of them), or the .md file of a file ref. Undefined when there is no such ref. */
export function goldText(librariesDir: string, library: string, goldRef: string): string | undefined {
  const at = join(librariesDir, library, goldRef);
  if (existsSync(at) && statSync(at).isDirectory()) {
    return filesUnder(at)
      .filter((f) => f !== ".stash.json")
      .map((f) => readFileSync(join(at, f), "utf8"))
      .join("\n");
  }
  return existsSync(`${at}.md`) ? readFileSync(`${at}.md`, "utf8") : undefined;
}

/** What the library lacks of what the verifier asks for, one sentence each. Empty when the gold ref holds every token the task declares. */
export function libraryProblems(taskDir: string, librariesDir: string): string[] {
  const { library, goldRef, tokens } = specOf(taskDir);
  if (tokens.length === 0) return [];
  if (!library || !goldRef) return ["task.toml declares library_tokens but not both a gold_ref and an AKM_TASK_STASH"];
  const text = goldText(librariesDir, library, goldRef);
  if (text === undefined) return [`the gold ref ${goldRef} is not in the library ${library}`];
  return tokens.filter((t) => !text.includes(t)).map((t) => `the gold ref ${goldRef} does not contain "${t}", which the verifier looks for`);
}

/** The verifier and the solution, which passes it: where a declared token has to turn up. */
function checked(taskDir: string): string {
  const tests = join(taskDir, "tests");
  const files = readdirSync(tests).filter((f) => f === "verify.sh" || /^test_.*\.py$/.test(f));
  return [...files.map((f) => join(tests, f)), join(taskDir, "solution", "solve.sh")].map((f) => readFileSync(f, "utf8")).join("\n");
}

/** Tokens a task declares that neither its verifier nor its solution contains, so the declaration is out of date. */
export function staleTokens(taskDir: string): string[] {
  const text = checked(taskDir);
  return specOf(taskDir).tokens.filter((t) => !text.includes(t));
}

/** What in the agent's view points it at akm: words for the tool, the library or the skill, and the gold ref itself. */
const NUDGES = /\bakm\b|\bskills?\b|\blibrary\b|\bstash\b|consult/i;

/**
 * Where the instruction or the starting workspace of a task tells the agent to use akm, to consult a skill, or what the
 * ref is. Those make part of "the agent called akm" instructed, and they hand over what retrieval is meant to find.
 */
export function nudges(taskDir: string): string[] {
  const { goldRef } = specOf(taskDir);
  const seen = ["instruction.md"];
  const workspace = join(taskDir, "environment", "workspace");
  if (existsSync(workspace)) seen.push(...filesUnder(workspace).map((f) => join("environment", "workspace", f)));
  const found: string[] = [];
  for (const file of seen) {
    const text = readFileSync(join(taskDir, file), "utf8");
    const hit = text.match(NUDGES)?.[0] ?? (goldRef && text.includes(goldRef) ? goldRef : undefined);
    if (hit) found.push(`${file} says "${hit}"`);
  }
  return found;
}
