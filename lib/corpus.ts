// The corpus a run reads, one rule for every eval: where its cases are, and whether they may be sent to a model.
//
//   const [public, custom] = resolveCorpora({ eval: NAME, values, publicFolder, default: "rewrite" });
//
// There are two corpora. `public` is the committed cases. `custom` is any folder of assets with a corpus config, `corpus.json`:
//
//   { "kind": "own", "private": true }                                                       your own notes
//   { "kind": "rewrite", "private": false, "seed": "42", "generated": "assets/generated.json" }   the public cases rewritten from a seed
//
// `private` says whether the corpus may be sent to a model that is not marked `"private": true` in models.json. A private corpus refuses
// such a model, and such a judge, before anything runs (privacyError). `kind` says where the corpus came from. A rewrite also holds its
// seed and the path of the generated.json that generate wrote, from corpus.json; the seed has to be the one generated.json holds.
//
// Where corpus.json is: in the corpus folder, else beside it when the folder is called `assets` (./generate-assets writes
// private/<eval>/corpus.json beside the assets, because agent-ab digests every file in its assets/). It is never read from any other folder.
//
// When there is none, the corpus is what its name says. A rewrite at the place generate puts it (--corpus custom of an eval whose default
// is a rewrite, or the old --corpus private) is not private: it is derived from public cases. Any other folder is an own corpus and is
// private: a folder of notes with no corpus.json is kept from models you did not mark, not trusted. Write a corpus.json with
// "private": false to say otherwise.
//
// An eval whose cases are a split of a dataset it fetches (skillret's train split) has a custom corpus with no folder: `default: "split"`. It is
// of kind "split", never private, takes no --cases, and is never read from a corpus.json.
//
// --corpus private and --corpus own work for one more release, and print a line that names the new form.

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { type ModelSettings, privateModelError } from "./models.ts";

const ROOT = resolve(import.meta.dir, "..");

/** The name of the corpus config. */
export const CONFIG_FILE = "corpus.json";

/** The keys corpus.json may have. Any other is refused, so a typo such as "privat" cannot pass for a setting. */
const KEYS = ["kind", "private", "seed", "generated"];

/** Where a custom corpus came from: the public cases rewritten from a seed, your own, or a split of the dataset the eval fetches (which has no folder). */
export type Kind = "rewrite" | "own" | "split";

export interface CorpusConfig {
  /** `public` for the committed cases, which have no corpus.json. */
  kind: "public" | Kind;
  /** True when the corpus may go only to a model and a judge that models.json marks `"private": true`. */
  private: boolean;
  /** A rewrite only: the seed it was made with, an unsigned 64-bit integer written as text. */
  seed?: string;
  /** A rewrite only: the path of the generated.json that generate wrote, from the folder of corpus.json. */
  generated?: string;
}

/** The config of a corpus that has no corpus.json, by kind: a rewrite is derived from public cases, so it is not private; an own corpus is. */
export const defaultConfig = (kind: Kind): CorpusConfig => ({ kind, private: kind === "own" });

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** A seed is an unsigned 64-bit integer written in decimal, as ./generate-assets checks it. */
const validSeed = (x: unknown): x is string => typeof x === "string" && /^\d{1,20}$/.test(x) && BigInt(x) < 18446744073709551616n;

/** A path inside the folder: relative, with no `..`. */
const insideFolder = (p: string): boolean => p !== "" && !isAbsolute(p) && !/^[A-Za-z]:/.test(p) && !p.split(/[\\/]/).includes("..");

function refuse(where: string, message: string): never {
  throw new Error(`${where}: ${message}`);
}

/** The config that `json` says, or an Error that names `where` and what is wrong. Unknown keys are refused. */
export function parseCorpusConfig(json: unknown, where: string): CorpusConfig {
  if (!isObject(json)) return refuse(where, "must hold an object");
  for (const key of Object.keys(json)) if (!KEYS.includes(key)) return refuse(where, `unknown key "${key}". The keys of a corpus config are ${KEYS.join(", ")}`);
  const { kind, seed, generated } = json;
  if (kind !== "rewrite" && kind !== "own") return refuse(where, 'kind must be "rewrite" or "own"');
  if (typeof json.private !== "boolean") return refuse(where, "private must be true or false");
  if (kind === "own") {
    if (seed !== undefined || generated !== undefined) return refuse(where, 'only a "rewrite" has a seed and a generated.json');
    return { kind, private: json.private };
  }
  if (!validSeed(seed)) return refuse(where, 'a "rewrite" needs seed, an integer from 0 to 18446744073709551615 written as text');
  if (typeof generated !== "string" || !insideFolder(generated)) return refuse(where, 'a "rewrite" needs generated, the path of its generated.json from this file, with no .. in it');
  return { kind, private: json.private, seed, generated };
}

/** The seed in a generated.json, or undefined when the file is missing, is not JSON or holds none. */
function seedOf(file: string): string | undefined {
  try {
    const seed = (JSON.parse(readFileSync(file, "utf8")) as { seed?: unknown } | null)?.seed;
    return validSeed(seed) ? seed : undefined;
  } catch {
    return undefined;
  }
}

/** The corpus.json at `file`, checked: it is JSON, it holds only what a config holds, and a rewrite's seed is the one its generated.json holds. */
export function readCorpusConfig(file: string): CorpusConfig {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not JSON (${(e as Error).message})`);
  }
  const config = parseCorpusConfig(json, file);
  if (config.kind === "rewrite") {
    const made = seedOf(resolve(dirname(file), config.generated as string));
    if (made === undefined) refuse(file, `${config.generated} is missing or holds no seed, so the rewrite it describes is not there. Make it again with ./generate-assets`);
    if (made !== config.seed) refuse(file, `seed is ${config.seed}, but ${config.generated} says ${made}, so the assets were made again since. Run ./generate-assets again`);
  }
  return config;
}

/**
 * The config of the rewrite that generate made in `dir` (private/<eval>), or undefined when there is none. The generated.json is in
 * dir/assets (retrieval, judge-gate, agent-ab) or in dir (the other evals).
 */
export function rewriteConfig(dir: string): CorpusConfig | undefined {
  for (const generated of ["assets/generated.json", "generated.json"]) {
    const seed = seedOf(join(dir, generated));
    if (seed !== undefined) return { kind: "rewrite", private: false, seed, generated };
  }
  return undefined;
}

/**
 * Writes `dir`/corpus.json for the rewrite that generate made in `dir`, which ./generate-assets does after each successful generate. A
 * corpus.json that already says "private": true stays private. Throws an Error when `dir` holds no generated.json with a seed.
 */
export function writeRewriteConfig(dir: string): CorpusConfig {
  const config = rewriteConfig(dir);
  if (!config) throw new Error(`${dir} has no generated.json with a seed (assets/generated.json or generated.json), so there is no rewrite to describe`);
  const file = join(dir, CONFIG_FILE);
  try {
    if ((JSON.parse(readFileSync(file, "utf8")) as { private?: unknown } | null)?.private === true) config.private = true;
  } catch {} // none yet, or not JSON: the new one replaces it
  writeFileSync(`${file}.new`, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(`${file}.new`, file);
  return config;
}

/** The corpus.json of a corpus folder: the one in it, else the one beside it when the folder is called `assets`. Null when there is none. */
function configFileOf(folder: string): string | null {
  const inside = join(folder, CONFIG_FILE);
  if (existsSync(inside)) return inside;
  const beside = join(dirname(folder), CONFIG_FILE);
  return basename(folder) === "assets" && existsSync(beside) ? beside : null;
}

/** One corpus of a run. */
export interface ResolvedCorpus {
  /** What the summary and the manifest record as `corpus`: `public` or `custom`. */
  name: "public" | "custom";
  /** The folder the eval reads, absolute. */
  folder: string;
  config: CorpusConfig;
  /** The corpus.json the config came from, or null when it is the default of its kind (see above) and for the public corpus. */
  configFile: string | null;
  /** How the run named it, for messages: `--corpus public`, `--corpus custom`, `--cases DIR`, `--corpus own`. */
  flag: string;
}

/** An old `--corpus` value: the folder under private/<eval>/ it names, and its kind. */
export interface Alias {
  folder: string;
  kind: Kind;
}

/** The two old values every eval had: private is the seeded rewrite, own is your own notes. An eval that had one only, or another (distill's own-feedback), passes its own table. */
export const ALIASES: Record<string, Alias> = { private: { folder: "assets", kind: "rewrite" }, own: { folder: "own", kind: "own" } };

/** The options of the two flags, for parseArgs, and their lines of the usage text. */
export const CORPUS_OPTIONS = { corpus: { type: "string" }, cases: { type: "string" } } as const;
export const corpusUsage = `  --corpus  public (default) is the committed cases. custom is a folder of assets with a corpus.json: --cases DIR, or the eval's default.
            all runs public and the default custom corpus and prints them side by side. See "Corpora" in README.md.
  --cases   the folder of a custom corpus. It is --corpus custom.`;

export interface ResolveOptions {
  /** The name of the eval, which is its folder under private/. */
  eval: string;
  /** The parsed flags. */
  values: { corpus?: string; cases?: string };
  /** The eval's public assets, absolute. */
  publicFolder: string;
  /** What `--corpus custom` reads without --cases, and what `all` adds to public: private/<eval>/assets (rewrite), private/<eval>/own (own), or the eval's own split of its dataset, which is no folder (split). */
  default: Kind;
  /** The old --corpus values this eval had. Default: ALIASES. */
  aliases?: Record<string, Alias>;
  /** The repository root, for a test. */
  root?: string;
  /** Where the warning of an old value goes. Default: stderr. */
  warn?: (line: string) => void;
  /** Ends the run with a message. Default: throws an Error. */
  fail?: (message: string) => never;
}

/**
 * The corpora a run reads, from its `--corpus` and `--cases`: one, or public and then custom for `all`. `--cases DIR` alone is a custom
 * corpus, and `--corpus public` is the default. A corpus.json that is not sound ends the run; so does a value that is not a corpus.
 * The folder is not checked: the eval says what is missing from it.
 */
export function resolveCorpora(o: ResolveOptions): ResolvedCorpus[] {
  const fail = o.fail ?? ((message: string): never => {
    throw new Error(message);
  });
  const root = o.root ?? ROOT;
  const priv = join(root, "private", o.eval);
  const folderOf = (kind: Kind): string => join(priv, kind === "rewrite" ? "assets" : "own");
  const { corpus, cases } = o.values;
  if (cases !== undefined && cases.trim() === "") return fail("--cases needs a folder");
  const choice = corpus ?? (cases === undefined ? "public" : "custom");
  const aliases = o.aliases ?? ALIASES;
  const alias = Object.hasOwn(aliases, choice) ? aliases[choice] : undefined;

  const publicCorpus: ResolvedCorpus = { name: "public", folder: o.publicFolder, config: { kind: "public", private: false }, configFile: null, flag: "--corpus public" };
  /** A custom corpus in `folder`. With no corpus.json it is what `assumed` says: a rewrite is read from its generated.json when that is there. */
  const custom = (folder: string, assumed: Kind, flag: string): ResolvedCorpus => {
    try {
      const configFile = configFileOf(folder);
      const config = configFile ? readCorpusConfig(configFile) : (assumed === "rewrite" ? rewriteConfig(dirname(folder)) : undefined) ?? defaultConfig(assumed);
      return { name: "custom", folder, config, configFile, flag };
    } catch (e) {
      return fail((e as Error).message);
    }
  };

  if (choice === "public") {
    if (cases !== undefined) return fail("--cases is a custom corpus: use it alone, or with --corpus custom");
    return [publicCorpus];
  }
  if (o.default === "split") {
    const split = (flag: string): ResolvedCorpus => ({ name: "custom", folder: "", config: defaultConfig("split"), configFile: null, flag });
    if (cases !== undefined) return fail(`--cases needs a folder, and the custom corpus of ${o.eval} is a split of its dataset, which has none: use --corpus custom`);
    if (choice === "custom" || choice === "all") return choice === "all" ? [publicCorpus, split("--corpus all")] : [split("--corpus custom")];
    if (!alias) return fail(`--corpus must be public, custom or all, not "${choice}"`);
    (o.warn ?? ((line: string) => console.error(line)))(`${o.eval}: --corpus ${choice} is now --corpus custom. The old value works for one more release.`);
    return [split(`--corpus ${choice}`)];
  }
  if (choice === "custom" || choice === "all") {
    const found = cases === undefined ? custom(folderOf(o.default), o.default, `--corpus ${choice}`) : custom(resolve(root, cases), "own", `--cases ${cases}`);
    return choice === "all" ? [publicCorpus, found] : [found];
  }
  if (!alias) return fail(`--corpus must be public, custom or all, not "${choice}"`);
  if (cases !== undefined && alias.kind !== "own") return fail(`--cases is a custom corpus: it does not go with --corpus ${choice}. Use --corpus custom --cases DIR`);
  const folder = cases === undefined ? join(priv, alias.folder) : resolve(root, cases);
  const now = cases !== undefined ? `--corpus custom --cases ${cases}` : folder === folderOf(o.default) ? "--corpus custom" : `--corpus custom --cases ${relative(root, folder)}`;
  (o.warn ?? ((line: string) => console.error(line)))(`${o.eval}: --corpus ${choice} is now ${now}. The old value works for one more release.`);
  return [custom(folder, cases === undefined ? alias.kind : "own", `--corpus ${choice}${cases === undefined ? "" : ` --cases ${cases}`}`)];
}

/**
 * The refusal for a run that would send a private corpus to a model, or a judge, that models.json does not mark `"private": true`, or
 * undefined when it may. Pass the model and the judge the run uses (the judge when it has one) and `what` they would be sent
 * ("notes", "memories"). Call it after useModel and useJudge and before anything runs, and `fail` with the message.
 */
export function privacyError(corpora: ResolvedCorpus[], models: { model?: ModelSettings; judge?: ModelSettings }, what = "notes"): string | undefined {
  const secret = corpora.find((c) => c.config.private);
  if (!secret) return undefined;
  for (const role of ["model", "judge"] as const) {
    const m = models[role];
    const refusal = m && privateModelError(m, secret.flag, what, role);
    if (!refusal) continue;
    const why = secret.configFile ? `${secret.configFile} says "private": true` : `it has no ${CONFIG_FILE}, and an own corpus without one is private`;
    return `${refusal} The corpus is private: ${why}. Mark the ${role} in models.json if you run it or its provider does not keep or train on what it gets, or choose another with ${role === "judge" ? "--judge-model" : "--model"}.`;
  }
  return undefined;
}

/** What a summary records about its corpus, beside `seed` (`config.seed ?? null`). The folder is not in it: its path can name what is in it. */
export const corpusRecord = (c: ResolvedCorpus): { corpus: string; corpus_kind: string; corpus_private: boolean } => ({ corpus: c.name, corpus_kind: c.config.kind, corpus_private: c.config.private });

if (import.meta.main) {
  const [command, dir, ...extra] = Bun.argv.slice(2);
  if (command !== "rewrite" || !dir || extra.length > 0) {
    console.error("Usage: bun lib/corpus.ts rewrite DIR\n\nWrites DIR/corpus.json for the rewrite that generate made in DIR (private/<eval>). ./generate-assets runs it.");
    process.exit(2);
  }
  try {
    writeRewriteConfig(resolve(dir));
  } catch (e) {
    console.error(`corpus: ${(e as Error).message}`);
    process.exit(1);
  }
}
