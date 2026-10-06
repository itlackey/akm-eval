#!/usr/bin/env bun
// agent-ab generate: makes the private tasks and libraries from the public ones with lib/rewrite, and proves each
// private task before it keeps it.
//
//   evals/agent-ab/generate --seed N --out private/agent-ab
//
// The tasks and the libraries go through one rewrite, so a tool name or a number means the same in a task's
// instruction, its verifier, its solution and the library that documents it. Two kinds of file stay as they are: the
// ones that say how a task is built and run (its Dockerfile and test.sh), and the numbers in task.toml, which are
// budgets and not part of what the task asks. akm itself is not renamed: the agent calls the real one.
//
// Only tasks whose tools are made up are rewritten (`tools = "fictional"` in their task.toml). Renaming a tool the
// model already knows changes how hard the task is, not only what it says, so those tasks are left out.
//
// A private task is kept when its solution passes its verifier, the starting workspace does not, and the public
// task's answer does not. A task that fails any of these is left out too, and the reason is printed.

import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { taskNames } from "./run.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

/** The files of a task that say how it is built and run. They are copied as they are. */
const PLUMBING = ["environment/Dockerfile", "tests/test.sh"];

interface RewriteMap {
  words: Record<string, string>;
  ports: Record<string, string>;
  numbers: Record<string, string>;
  [table: string]: unknown;
}

export interface Proof {
  task: string;
  /** What is wrong, one sentence each. Empty when the task is sound. */
  problems: string[];
}

/**
 * A number that the rewrite met as a port in one place and as a plain number in another has two replacements.
 * Make the port's the number's, so `port: 6060` in a file and `== 6060` in a test still agree.
 */
export function harmonize(map: Pick<RewriteMap, "ports" | "numbers">): string[] {
  const changed: string[] = [];
  for (const [original, number] of Object.entries(map.numbers)) {
    if (map.ports[original] !== undefined && map.ports[original] !== number) {
      map.ports[original] = number;
      changed.push(original);
    }
  }
  return changed;
}

/** A line that only sets a number, such as `timeout_sec = 600.0`. */
const NUMBER_LINE = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*[0-9][0-9.]*\s*$/;

/** The rewritten task.toml with the lines that only set a number put back as the public file has them. The text is the same length in lines. */
export function restoreNumbers(publicToml: string, privateToml: string): string {
  const before = publicToml.split("\n");
  const after = privateToml.split("\n");
  if (before.length !== after.length) throw new Error("the rewrite changed the number of lines in task.toml");
  return after.map((line, i) => (NUMBER_LINE.test(before[i]) ? before[i] : line)).join("\n");
}

const index = (i: number): string => `t${String(i).padStart(3, "0")}`;

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
}

const sh = (cmd: string[], cwd: string) => Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });

/** Runs a task's verifier on a workspace. The tests are copied first, so running them leaves nothing in the task. */
function verify(task: string, work: string): { pass: boolean; output: string } {
  const copy = mkdtempSync(join(tmpdir(), "agent-ab-tests-"));
  try {
    cpSync(join(task, "tests"), copy, { recursive: true });
    const tests = readdirSync(copy).filter((f) => /^test_.*\.py$/.test(f));
    const cmd = existsSync(join(copy, "verify.sh"))
      ? ["bash", join(copy, "verify.sh")]
      : ["uv", "run", "--no-project", "--python", "3.12", "--with", "pytest", "--with", "pyyaml", "pytest", "-q", "-p", "no:cacheprovider", ...tests.map((f) => join(copy, f))];
    const p = sh(cmd, work);
    return { pass: p.exitCode === 0, output: `${p.stdout}${p.stderr}`.trim() };
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

/** A fresh workspace for a task: what its environment starts with, or nothing. */
function workspace(task: string): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-ab-work-"));
  const from = join(task, "environment", "workspace");
  if (existsSync(from)) cpSync(from, dir, { recursive: true });
  return dir;
}

function solve(task: string, work: string): void {
  const p = sh(["bash", join(task, "solution", "solve.sh")], work);
  if (p.exitCode !== 0) throw new Error(`${join(task, "solution", "solve.sh")} failed: ${p.stderr.toString().trim()}`);
}

/**
 * What is wrong with a private task. Its solution must pass its verifier, the workspace it starts with must not, and
 * what the public solution leaves must not either: otherwise nothing in the answer changed, and a model that
 * remembers the public task would pass.
 */
export function prove(name: string, privateTask: string, publicTask: string): Proof {
  const problems: string[] = [];
  const dirs: string[] = [];
  const fresh = (task: string) => {
    const d = workspace(task);
    dirs.push(d);
    return d;
  };
  try {
    const start = verify(privateTask, fresh(privateTask));
    if (start.pass) problems.push("the verifier passes on the starting workspace, with nothing done");

    const own = fresh(privateTask);
    solve(privateTask, own);
    const solved = verify(privateTask, own);
    if (!solved.pass) problems.push(`the solution does not pass the verifier: ${solved.output.split("\n").slice(-3).join(" / ").slice(0, 300)}`);

    const old = fresh(publicTask);
    solve(publicTask, old);
    const carried = fresh(privateTask);
    cpSync(old, carried, { recursive: true });
    if (verify(privateTask, carried).pass) problems.push("the public solution's answer passes the private verifier, so the answer did not change");
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
  return { task: name, problems };
}

/**
 * The renamed words that are still in the private files, such as a tool name the rewrite missed. A word inside a
 * longer word does not count (docker in dockerfile), nor does one in a URL: the rewrite leaves a real address as it is.
 */
export function leftovers(map: Pick<RewriteMap, "words">, files: string[]): string[] {
  const originals = Object.entries(map.words)
    .filter(([from, to]) => from !== to && from.length >= 5)
    .map(([from]) => ({ from, at: new RegExp(`(?<![a-z0-9])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`) }));
  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8").toLowerCase().replace(/https?:\/\/\S+/g, "");
    for (const { from, at } of originals) if (at.test(text)) found.push(`${from} in ${file}`);
  }
  return found;
}

/** Whether a task's tools are made up. Its task.toml says so. */
export const isFictional = (taskDir: string): boolean => /^tools\s*=\s*"fictional"/m.test(readFileSync(join(taskDir, "task.toml"), "utf8"));

/** The library a task seeds: the AKM_TASK_STASH of its task.toml. */
export const libraryOf = (taskDir: string): string | undefined => readFileSync(join(taskDir, "task.toml"), "utf8").match(/^AKM_TASK_STASH\s*=\s*"([^"]+)"/m)?.[1];

export interface Options {
  seed: string;
  out: string;
  /** Where the public tasks/ and libraries/ are. */
  from?: string;
}

export interface Result {
  kept: string[];
  leftOut: { task: string; why: string[] }[];
  problems: string[];
  summary: string;
}

export function generate(opts: Options): Result {
  const from = opts.from ?? EVAL_DIR;
  const out = resolve(opts.out);
  const work = join(out, ".work");
  const assets = join(out, "assets");
  const mapFile = join(out, "map.json");
  const everyTask = taskNames(join(from, "tasks"));
  const names = everyTask.filter((n) => isFictional(join(from, "tasks", n)));
  if (names.length === 0) throw new Error(`no fictional-tool tasks in ${join(from, "tasks")}`);
  const leftOut: Result["leftOut"] = everyTask
    .filter((n) => !names.includes(n))
    .map((task) => ({ task, why: ["its tools are real, so renaming them would change how hard it is, not only what it says"] }));
  const needed = [...new Set(names.map((n) => libraryOf(join(from, "tasks", n))))];
  if (needed.some((l) => l === undefined || !existsSync(join(from, "libraries", l)))) throw new Error("a task names a library that does not exist");

  rmSync(work, { recursive: true, force: true });
  rmSync(mapFile, { force: true });
  mkdirSync(join(work, "in", "tasks"), { recursive: true });
  names.forEach((n, i) => {
    const root = join(from, "tasks", n);
    cpSync(root, join(work, "in", "tasks", index(i)), { recursive: true, filter: (src) => !PLUMBING.includes(relative(root, src)) });
  });
  for (const l of needed as string[]) cpSync(join(from, "libraries", l), join(work, "in", "libraries", l), { recursive: true });
  writeFileSync(join(work, "in", "names.txt"), `${names.join("\n")}\n`);

  // A map that already holds akm, so akm stays akm: the agent calls the real one. Start from a map the rewrite made,
  // so the date shift is the rewrite's own.
  writeFileSync(join(work, "empty.txt"), "\n");
  rewrite(["--seed", opts.seed, "--map", mapFile, join(work, "empty.txt"), join(work, "empty-out.txt")]);
  const start = JSON.parse(readFileSync(mapFile, "utf8")) as RewriteMap;
  start.words.akm = "akm";
  writeFileSync(mapFile, `${JSON.stringify(start, null, 2)}\n`);

  // The first run settles the map. Then a port that is also a number gets one replacement, and the second run writes the files.
  rewrite(["--seed", opts.seed, "--map", mapFile, join(work, "in"), join(work, "settle")]);
  const map = JSON.parse(readFileSync(mapFile, "utf8")) as RewriteMap;
  harmonize(map);
  writeFileSync(mapFile, `${JSON.stringify(map, null, 2)}\n`);
  const summary = rewrite(["--seed", opts.seed, "--map", mapFile, join(work, "in"), join(work, "out")]).split("\n").pop() as string;

  const newNames = readFileSync(join(work, "out", "names.txt"), "utf8").trim().split("\n");
  if (newNames.length !== names.length || new Set(newNames).size !== names.length) throw new Error("the rewrite gave two tasks one name, or lost one");

  rmSync(assets, { recursive: true, force: true });
  mkdirSync(join(assets, "tasks"), { recursive: true });
  cpSync(join(work, "out", "libraries"), join(assets, "libraries"), { recursive: true });
  const libraries = new Set(readdirSync(join(assets, "libraries")));
  const kept: string[] = [];
  const touched: string[] = [];
  names.forEach((publicName, i) => {
    const dir = join(assets, "tasks", newNames[i]);
    cpSync(join(work, "out", "tasks", index(i)), dir, { recursive: true });
    for (const rel of PLUMBING) {
      if (!existsSync(join(from, "tasks", publicName, rel))) continue;
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      copyFileSync(join(from, "tasks", publicName, rel), join(dir, rel));
      chmodSync(join(dir, rel), statSync(join(from, "tasks", publicName, rel)).mode & 0o777);
    }
    const toml = join(dir, "task.toml");
    writeFileSync(toml, restoreNumbers(readFileSync(join(from, "tasks", publicName, "task.toml"), "utf8"), readFileSync(toml, "utf8")));
    const why: string[] = [];
    const stash = libraryOf(dir);
    if (!stash || !libraries.has(stash)) why.push(`its library ${stash ?? "(none named)"} is not among the private libraries`);
    why.push(...prove(newNames[i], dir, join(from, "tasks", publicName)).problems);
    if (why.length) {
      leftOut.push({ task: newNames[i], why });
      rmSync(dir, { recursive: true, force: true });
    } else {
      kept.push(newNames[i]);
      touched.push(...listFiles(dir).filter((f) => !PLUMBING.some((p) => f.endsWith(p))));
    }
  });
  touched.push(...listFiles(join(assets, "libraries")));
  const problems = leftovers(map, touched);
  const [before, after] = [(needed as string[]).flatMap((l) => listFiles(join(from, "libraries", l))).length, listFiles(join(assets, "libraries")).length];
  if (before !== after) problems.push(`the libraries had ${before} files and now have ${after}`);
  rmSync(work, { recursive: true, force: true });
  return { kept, leftOut, problems, summary };
}

function main(): number {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/agent-ab/generate --seed N --out private/agent-ab");
    return 2;
  }
  const r = generate({ seed: values.seed, out: values.out });
  console.log(`agent-ab: ${r.kept.length} private tasks written to ${join(values.out, "assets", "tasks")}, with their libraries`);
  console.log(r.summary);
  for (const t of r.kept) console.log(`  kept     ${t}: the solution passes, the empty workspace and the public answer fail`);
  for (const t of r.leftOut) console.log(`  left out ${t.task}: ${t.why.join("; ")}`);
  if (r.problems.length) {
    console.error(`agent-ab: renamed words are still in the private files:\n  ${r.problems.join("\n  ")}`);
    return 1;
  }
  return r.kept.length === 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main());
