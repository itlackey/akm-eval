// What the run.ts of every eval and benchmark shares: the failure that ends a run with a message, the build a run was made of,
// the label a model name makes, and the two texts that get written into results or printed: the model endpoint hidden, and
// what akm said when a command failed. And the flags of every generate script.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { completionsUrl } from "./akm/akm.ts";

/** A failure that ends the run with a message. It is thrown, so the sandbox is cleaned up on the way out. */
export class Fatal extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

export function fail(message: string, code = 2): never {
  throw new Fatal(message, code);
}

/** The short commit of the checkout at `root`, with -dirty when tracked files have changes, the recorded image revision without Git metadata, or "unknown". */
export function gitCommit(root: string): string {
  const run = (args: string[]) => Bun.spawnSync(["git", "-C", root, ...args], { stderr: "ignore" });
  const head = run(["rev-parse", "--short", "HEAD"]);
  if (head.exitCode !== 0) {
    const imageRevision = join(root, ".akm-eval-revision");
    return existsSync(imageRevision) ? readFileSync(imageRevision, "utf8").trim() || "unknown" : "unknown";
  }
  const dirty = run(["status", "--porcelain", "--untracked-files=no"]).stdout.toString().trim() !== "";
  return head.stdout.toString().trim() + (dirty ? "-dirty" : "");
}

/**
 * The --seed and --out of a generate script, or the exit code to end it with: 0 after --help or -h, which print the usage, and 2 after a
 * flag it does not take or a missing or invalid value, which print the usage to stderr. `usage` is the script's own Usage line.
 */
export function generateArgs(argv: string[], usage: string, seedOk: (seed: string) => boolean = () => true): { seed: string; out: string } | number {
  const text = `${usage}\n\nMakes this eval's private corpus from its public one, rewritten with seed N, into OUT/assets. ./generate-assets runs it for every eval.`;
  let values: { seed?: string; out?: string; help?: boolean };
  try {
    ({ values } = parseArgs({ args: argv, options: { seed: { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }));
  } catch (e) {
    console.error(`${(e as Error).message}\n${text}`);
    return 2;
  }
  if (values.help) {
    console.log(text);
    return 0;
  }
  if (values.seed === undefined || values.out === undefined || !seedOk(values.seed)) {
    console.error(text);
    return 2;
  }
  return { seed: values.seed, out: values.out };
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * `value` with the model's endpoint written as <MODEL_BASE_URL>, in every string of it. akm's errors and the config the
 * eval writes name the endpoint, and it may carry a key or a user name, and results get shared. The base URL is
 * replaced where it stands, so the path after it stays: `<MODEL_BASE_URL>/chat/completions`. The endpoint of a base URL with a query
 * has the path before the query (see completionsUrl), so it is replaced as a whole. A string, an array or an
 * object goes in and comes out as itself, a copy. Without a base URL nothing is replaced.
 */
export function hideEndpoint<T>(value: T, baseUrl: string): T {
  const base = baseUrl.replace(/\/+$/, "");
  const endpoint = completionsUrl(baseUrl);
  const hide = (x: unknown): unknown => {
    if (typeof x === "string") return base === "" ? x : x.split(endpoint).join(endpoint === base ? "<MODEL_BASE_URL>" : "<MODEL_BASE_URL>/chat/completions").split(base).join("<MODEL_BASE_URL>");
    if (Array.isArray(x)) return x.map(hide);
    if (typeof x === "object" && x !== null) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, hide(v)]));
    return x;
  };
  return hide(value) as T;
}

/** The reason in akm's stderr: the error of the JSON object it prints there, with its code, else the last three lines of stderr (of stdout when stderr is empty). */
function reason(stderr: string, stdout: string): string {
  const text = stderr.trim();
  try {
    const e = JSON.parse(text) as { error?: unknown; code?: unknown };
    if (typeof e.error === "string") return `${e.error}${typeof e.code === "string" ? ` (${e.code})` : ""}`;
  } catch {
    // not JSON: fall through to the last lines
  }
  return (text || stdout.trim()).split("\n").slice(-3).join(" | ");
}

/** What akm said when a command failed: "<what> failed (exit N): <reason>", such as "akm improve failed (exit 78): ...". */
export function failureMessage(what: string, code: number, stderr: string, stdout = ""): string {
  return `${what} failed (exit ${code}): ${reason(stderr, stdout)}`.slice(0, 400);
}

/** What akm said when it failed on one case, for the row's error: "akm exited N: <reason>". The rows of the evals that run akm once per case say it this way. */
export function exitMessage(code: number, stderr: string, stdout = ""): string {
  return `akm exited ${code}: ${reason(stderr, stdout)}`.slice(0, 300);
}
