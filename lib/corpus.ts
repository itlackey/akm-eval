// The corpus a run reads, one rule for every eval. `--corpus public` (the default) is the committed cases, `--corpus custom` is the rewrite
// ./generate-assets makes in private/<eval>/assets, and `--cases DIR` is a folder of your own in the eval's format, which is a custom corpus
// on its own. `--corpus all` runs public and then custom.
//
//   const [public, custom] = resolveCorpora({ eval: NAME, values, publicFolder });
//
// An eval with no rewrite (promotion) passes `rewrite: false`: its custom corpus is `--cases DIR` only.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fail } from "./cli.ts";
import { endpointIdentity } from "./provenance.ts";

const ROOT = resolve(import.meta.dir, "..");

/** The options of the flags, for parseArgs, and their lines of the usage text. */
export const CORPUS_OPTIONS = { corpus: { type: "string" }, cases: { type: "string" }, yes: { type: "boolean", short: "y" } } as const;
export const corpusUsage = `  --corpus  public (default) is the committed cases. custom is the rewrite in private/<eval>/assets that ./generate-assets makes.
            all runs public and custom and prints them side by side. See "Corpora" in README.md.
  --cases   the folder of a custom corpus of your own, in the eval's format. It is --corpus custom. The run says which model it sends the
            cases to and asks first.
  -y, --yes  send the cases of --cases without asking.`;

/** One corpus of a run. */
export interface ResolvedCorpus {
  /** What the summary and the manifest record as `corpus`. */
  name: "public" | "custom";
  /** The folder the eval reads, absolute. */
  folder: string;
  /** True for the rewrite in private/<eval>/assets (`--corpus custom` without `--cases`): the public cases rewritten from a seed. */
  rewrite: boolean;
  /** The seed of the rewrite, from its generated.json. Null for any other corpus, and for a rewrite that is not there. */
  seed: string | null;
  /** How the run named it, for messages: `--corpus public`, `--corpus custom`, `--cases DIR`. */
  flag: string;
}

/** The stop for an old `--corpus` value, or undefined for any other. `use` says what to say instead. */
export const renamed = (value: string | undefined, use: string): string | undefined =>
  value !== undefined && ["private", "own", "own-feedback"].includes(value) ? `--corpus ${value} was renamed in 0.2: use ${use}` : undefined;

/** The seed in a generated.json, or null when the file is missing, is not JSON or holds none. */
function seedOf(file: string): string | null {
  try {
    const seed = (JSON.parse(readFileSync(file, "utf8")) as { seed?: unknown } | null)?.seed;
    return typeof seed === "string" && /^\d{1,20}$/.test(seed) ? seed : null;
  } catch {
    return null;
  }
}

export interface ResolveOptions {
  /** The name of the eval, which is its folder under private/. */
  eval: string;
  /** The parsed flags. */
  values: { corpus?: string; cases?: string };
  /** The eval's public assets, absolute. */
  publicFolder: string;
  /** False for an eval with no rewrite: `--corpus custom` needs `--cases`. Default: true. */
  rewrite?: boolean;
  /** The repository root, for a test. */
  root?: string;
  /** Ends the run with a message. Default: throws an Error. */
  fail?: (message: string) => never;
}

/**
 * The corpora a run reads, from its `--corpus` and `--cases`: one, or public and then custom for `all`. `--cases DIR` alone is a custom
 * corpus, and `--corpus public` is the default. A value that is not a corpus ends the run. The folder is not checked: the eval says what is missing from it.
 */
export function resolveCorpora(o: ResolveOptions): ResolvedCorpus[] {
  const fail = o.fail ?? ((message: string): never => {
    throw new Error(message);
  });
  const root = o.root ?? ROOT;
  const rewrite = o.rewrite !== false;
  const { corpus, cases } = o.values;
  const requested = corpus ?? (cases === undefined ? "public" : "custom");
  const choice = requested === "private" || (cases !== undefined && ["own", "own-feedback"].includes(requested)) ? "custom" : requested;
  const old = renamed(choice, `${choice === "private" && rewrite ? "--corpus custom (the rewrite in private/<eval>/assets), or " : ""}--cases DIR for a folder of your own`);
  if (old) return fail(old);
  if (choice !== "public" && choice !== "custom" && choice !== "all") return fail(`--corpus must be public, custom or all, not "${choice}"`);
  if (cases !== undefined && cases.trim() === "") return fail("--cases needs a folder");
  const publicCorpus: ResolvedCorpus = { name: "public", folder: o.publicFolder, rewrite: false, seed: null, flag: "--corpus public" };
  if (choice === "public") return cases === undefined ? [publicCorpus] : fail("--cases is a custom corpus: use it alone, or with --corpus custom");
  if (cases === undefined && !rewrite) return fail(`${o.eval} has no rewrite: its custom corpus is a folder of your own cases. Use --cases DIR`);
  const dir = join(root, "private", o.eval);
  const custom: ResolvedCorpus =
    cases !== undefined
      ? { name: "custom", folder: resolve(root, cases), rewrite: false, seed: null, flag: `--cases ${cases}` }
      : { name: "custom", folder: join(dir, "assets"), rewrite: true, seed: seedOf(join(dir, "assets", "generated.json")) ?? seedOf(join(dir, "generated.json")), flag: `--corpus ${choice}` };
  return choice === "all" ? [publicCorpus, custom] : [custom];
}

/** A model or a judge the cases go to, with the base URL it is called at. A model whose provider Harbor reaches itself has none. */
export interface Recipient {
  role: "model" | "judge";
  name: string;
  baseUrl?: string;
}

/** The endpoint as scheme://host[:port]/path, with no credentials and no query. */
const shown = (baseUrl: string | undefined): string => (baseUrl === undefined ? "its provider's own endpoint" : (endpointIdentity(baseUrl)?.split("?")[0] ?? "an endpoint that is not a URL"));

/** One line from the terminal. The end of the input is no. */
const readLine = (question: string): Promise<string> =>
  new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.once("close", () => done("n"));
    rl.question(question, (answer) => {
      done(answer);
      rl.close();
    });
  });

/**
 * Before a run sends the cases of `--cases DIR` to a model, says where they go and asks. Every run that sends them calls it once, after the
 * model is known and before the akm sandbox or any model call. Without `--cases`, or with `-y`, it asks nothing. Without a terminal it stops
 * and says to add `-y`, and an answer other than yes stops it with exit 1. `io` is for tests.
 */
export async function confirmCases(
  values: { cases?: string; yes?: boolean },
  to: Recipient[],
  io: { tty?: boolean; ask?: (question: string) => Promise<string>; log?: (line: string) => void } = {},
): Promise<void> {
  const { cases, yes } = values;
  if (cases === undefined || yes === true || to.length === 0) return;
  const where = to.map((r) => `${r.name} at ${shown(r.baseUrl)}`);
  if (!(io.tty ?? process.stdin.isTTY)) return fail(`add -y to send the cases in ${cases} to ${where.join(" and ")} without asking`);
  const log = io.log ?? console.log;
  log(`The cases in ${cases} will be sent to:`);
  to.forEach((r, i) => log(`  ${r.role}  ${where[i]}`));
  const answer = (await (io.ask ?? readLine)("Continue? [Y/n] ")).trim().toLowerCase();
  if (answer !== "" && answer !== "y" && answer !== "yes") fail("Stopped: nothing was sent.", 1);
}
