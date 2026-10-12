// The matrix runner's logic, without the process spawning: the matrix file, the table of each eval's metrics, which runs a stage
// makes, how a result is found, and the verdict. The report is in decision.ts. See ../../../README.md ("Run a matrix").

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { type ResolvedCorpus, resolveCorpora } from "../../../lib/corpus.ts";
import { type RunManifest, noManifest, readManifest } from "../../../lib/manifest.ts";
import { spreadOf } from "../../../lib/repeat.ts";
import type { Run } from "../../compare/src/lib.ts";
import { AXES, HARBOR, type Axis, type Identity, type PolicyResult, checkMembers, identityOf, incompleteClause, incompleteOf, messages } from "../../compare/src/policy.ts";

/** scripts/rescore, loaded when a decision needs a result scored again and not before, as scripts/compare does. */
const rescorer = (): typeof import("../../rescore/src/lib.ts") => createRequire(import.meta.url)("../../rescore/src/lib.ts");

export type Dir = "up" | "down";
export interface MetricSpec {
  /** Key path in the summary's `metrics`, e.g. `items.rate`. */
  path: string;
  /** Which way is better. */
  dir: Dir;
  /** Harm is what must not rise: a metric whose worse direction is the thing the eval guards against. */
  role: "main" | "harm";
}

const main = (path: string, dir: Dir = "up"): MetricSpec => ({ path, dir, role: "main" });
const harm = (path: string, dir: Dir = "down"): MetricSpec => ({ path, dir, role: "harm" });

/** The counts of a summary that say how much of a run did not give a result. A config with more of any than its baseline can never be "better". */
export type ErrorCount = "n_errored" | "completion.failed";

/** What the matrix judges an eval on, and what it needs of a run before it judges it. */
export interface EvalSpec {
  /** What the eval is meant to raise (or lower). A change here, with no harm, is "better". */
  main: MetricSpec[];
  /** What must not rise. Each is its own metric: a harm that rises is not made up for by another that falls. */
  harm: MetricSpec[];
  /** The completeness policy: the error counts that must not rise against the baseline. */
  completeness: { errors: ErrorCount[] };
  /** Metrics the decision shows beside the judged ones and never judges: key paths in the summary's `metrics`. */
  context?: string[];
  /**
   * The share of an eval's results that someone graded, as key paths. The judged metric counts a result nobody graded as not relevant, so a
   * config that returns more of them reads worse for it. When this share falls against the baseline, the verdict is exploratory until
   * those results are labelled.
   */
  graded?: string[];
}

/**
 * The Harbor evals (agent-ab, terminal-bench) write the same metrics, from lib/harbor/harbor.ts `metricsOf`: the difference in pass rate between
 * the akm arm and the control arm, paired by task. Harm is akm trials that errored and control trials that called akm (the control has no plugin).
 * They run in a container, so a summary holds the Harbor job as `config`, with `akm_env` and the model and endpoint as `engine`, which the policy reads
 * as their config and engine (see ../../compare/src/policy.ts); and `completion`, which counts the tasks that failed or are missing.
 */
const harbor = (): EvalSpec => ({ main: [main("delta.value")], harm: [harm("akm.errored"), harm("engagement.control_calls")], completeness: { errors: ["n_errored", "completion.failed"] } });
const spec = (m: MetricSpec[], h: MetricSpec[]): EvalSpec => ({ main: m, harm: h, completeness: { errors: ["n_errored"] } });
/** The columns of the retrieval eval's summary: akm's search and curate, keyword and semantic. */
const RETRIEVAL = ["search", "curate", "semantic_search", "semantic_curate"];
/** The lines of skillret's summary: akm's search on the keyword index and on the semantic one. */
const SKILLRET = ["search", "semantic_search"];

/**
 * The metrics each eval is judged on, with its completeness policy. Every path was read from a real summary.json (and repeat-summary.json,
 * which has the same keys with {min, max, mean} at each number). Rates are used for the main metrics, counts for harm that should be zero.
 * Where an eval splits a harm in two that mean different things (judge-gate's harmful and churn revisions), each is its own metric.
 */
export const EVALS: Record<string, EvalSpec> = {
  nightly: spec([main("items.rate")], [harm("harm.items"), harm("harm.outside_changed"), harm("harm.lessons_accepted"), harm("calls.failures")]),
  consolidate: spec([main("recall.value"), main("precision.value")], [harm("unsafe.n")]), // the same keys with --pool
  distill: spec([main("good_lessons.rate"), main("lesson_updates.rate")], [harm("wrong_lessons.rate")]),
  reflect: spec([main("defects.rate")], [harm("controls.rate", "up"), harm("proposals.touched_body")]),
  promotion: spec([main("precision.value"), main("recall.value")], [harm("bad_accepted.value")]),
  "judge-gate": spec([main("precision.value"), main("good.rate")], [harm("bad_harmful.rate"), harm("bad_churn.rate")]),
  // planted.ambiguous counts the planted sessions whose memory holds the planted phrase behind a negation the scorer cannot read, and asserts none. It is a count to look at, not judged.
  extract: { ...spec([main("insights.rate")], [harm("routine.rate", "up"), harm("planted.saved_instruction")]), context: ["planted.ambiguous"] },
  retrieval: { ...spec(RETRIEVAL.map((c) => main(`${c}.ndcg_10`)), []), context: RETRIEVAL.flatMap((c) => [`${c}.ndcg_10_condensed`, `${c}.judged_10`]), graded: RETRIEVAL.map((c) => `${c}.judged_10`) },
  "agent-ab": harbor(),
  "terminal-bench": harbor(),
  // bakeoff scores what akm wrote for each case against checks: the cases that pass, and the share of checks that hold. It names no harm.
  bakeoff: { ...spec([main("case_pass.rate"), main("checks.rate")], []), context: ["valid_output.rate"] },
  // longmemeval answers a question twice, with the whole history and with akm's five sessions. What akm changes is the second answer and the sessions it
  // returns; the first is the control, and the difference between the two follows from both. A retrieval-only run has the retrieval metrics alone.
  longmemeval: { ...spec([main("accuracy.with_akm.rate"), main("retrieval.hit_rate"), main("retrieval.recall")], []), context: ["accuracy.without_akm.rate", "accuracy.difference.value", "retrieval.mrr", "retrieval.ndcg"] },
  // skillret ranks the skills of a library for a request, on the keyword index and, in a run without --limit, the semantic one. NDCG@10 is the headline.
  skillret: { ...spec(SKILLRET.map((line) => main(`${line}.NDCG@10`)), []), context: SKILLRET.flatMap((line) => ["Recall@10", "Completeness@10", "MAP@10"].map((metric) => `${line}.${metric}`)) },
};

/** Every metric of each eval, the main ones first. */
export const EVAL_METRICS: Record<string, MetricSpec[]> = Object.fromEntries(Object.entries(EVALS).map(([name, e]) => [name, [...e.main, ...e.harm]]));

/** What a row's `eval` names that lives in benchmarks/<name>/run and not in evals/<name>/run. */
const BENCHMARKS = ["terminal-bench", "longmemeval", "skillret"];
/** The evals that call no model, so the file's top-level "model" is not given to them: their runner has no --model. */
const NO_MODEL = ["retrieval", "skillret"];
/** The evals that run in Harbor. Their --akm is an npm release or a checkout's folder, not a command (see lib/harbor/harbor.ts). */
export { HARBOR };

/** The folder a row's eval or benchmark is in, under the repository root: evals or benchmarks. */
export const runnerFolder = (name: string): "evals" | "benchmarks" => (BENCHMARKS.includes(name) ? "benchmarks" : "evals");
/** The run script of an eval or a benchmark, from the repository root `root`. */
export const runnerPath = (root: string, name: string): string => join(root, runnerFolder(name), name, "run");

export const NAME_RE = /^[A-Za-z0-9._-]+$/;
const EPS = 1e-9;
/** The fewest repeats a side may have for a verdict to be a conclusion. With two, the range of a side is two draws, which a change cannot be told from. */
export const MIN_REPEATS = 3;

// ---- the matrix file ----------------------------------------------------------------------------------------------------

export interface Row {
  name: string;
  /** The eval or the benchmark to run: a name of EVAL_METRICS, which is in evals/ or in benchmarks/. */
  eval: string;
  /** The eval's own flags, with a relative --config-patch resolved from the matrix file's folder. */
  args: string[];
  /**
   * On a config row, the axes it changes against its baseline, when its flags do not say so (see scripts/compare/src/policy.ts): build,
   * config, model, inputs or harness. A config row whose --akm differs from its baseline's has the build axis as well.
   */
  treatment?: Axis[];
}

export interface Matrix {
  file: string;
  /** The label prefix. */
  prefix: string;
  baselines: Row[];
  configs: Row[];
  /** `--limit` for the screen stage, by eval. */
  screenLimit: Record<string, number>;
  repeats: number;
  /** `--model` and `--akm` of every row that does not name its own: the file's "model" (not for retrieval, which uses none) and "akm". */
  model?: string;
  akm?: string;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The value of `--flag X` or `--flag=X` in args, or undefined. */
export function flagValue(args: string[], flag: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return args[i + 1];
    if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
  }
  return undefined;
}
export const hasFlag = (args: string[], flag: string): boolean => args.some((a) => a === flag || a.startsWith(`${flag}=`));

function resolvePatch(args: string[], dir: string): string[] {
  const out = [...args];
  for (let i = 0; i < out.length; i++) {
    if (out[i] === "--config-patch" && i + 1 < out.length) out[i + 1] = resolve(dir, out[i + 1]);
    else if (out[i].startsWith("--config-patch=")) out[i] = `--config-patch=${resolve(dir, out[i].slice("--config-patch=".length))}`;
  }
  return out;
}

function parseTreatment(x: unknown, what: string): Axis[] | undefined {
  if (x === undefined) return undefined;
  const list = Array.isArray(x) ? x : [x];
  if (list.length === 0 || list.some((a) => typeof a !== "string" || !(AXES as readonly string[]).includes(a))) throw new Error(`${what}: treatment must be one of ${AXES.join(", ")}, a list of them, or left out`);
  return AXES.filter((a) => list.includes(a));
}

function parseRow(x: unknown, what: string, dir: string, defaultName?: string): Row {
  if (!isObject(x)) throw new Error(`${what} must be an object {name, eval, args}`);
  const treatment = parseTreatment(x.treatment, what);
  if (treatment !== undefined && what === "baseline") throw new Error(`${what}: treatment is for a config row, the baseline is what it is compared with`);
  const name = x.name === undefined ? defaultName : x.name;
  if (typeof name !== "string" || !NAME_RE.test(name)) throw new Error(`${what}: name must use letters, digits, dot, dash and underscore`);
  if (typeof x.eval !== "string" || !(x.eval in EVAL_METRICS)) throw new Error(`${what} (${name}): eval must be one of ${Object.keys(EVAL_METRICS).join(", ")}`);
  const args = x.args ?? [];
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) throw new Error(`${what} (${name}): args must be a list of strings`);
  for (const f of ["--label", "--repeat"]) if (hasFlag(args as string[], f)) throw new Error(`${what} (${name}): leave out ${f}, the runner sets it`);
  if (flagValue(args as string[], "--corpus") === "all") throw new Error(`${what} (${name}): --corpus all pools corpora; list one row per corpus`);
  return { name, eval: x.eval, args: resolvePatch(args as string[], dir), ...(treatment ? { treatment } : {}) };
}

/** Parses a matrix file's JSON. `file` only gives the folder that relative patch paths resolve from, and the default prefix. */
export function parseMatrix(json: unknown, file: string, prefix?: string): Matrix {
  if (!isObject(json)) throw new Error("the matrix file must hold a JSON object");
  const dir = dirname(resolve(file));
  const rawBase = Array.isArray(json.baseline) ? json.baseline : json.baseline === undefined ? [] : [json.baseline];
  if (rawBase.length === 0) throw new Error("the matrix needs a `baseline` row");
  const baselines = rawBase.map((b, i) => parseRow(b, "baseline", dir, rawBase.length === 1 ? "base" : `base${i + 1}`));
  if (!Array.isArray(json.configs) || json.configs.length === 0) throw new Error("the matrix needs a non-empty `configs` list");
  const configs = json.configs.map((c) => parseRow(c, "config", dir));
  const names = [...baselines, ...configs].map((r) => r.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`the name ${dup} is used twice`);

  const screen = json.screen === undefined ? {} : json.screen;
  if (!isObject(screen)) throw new Error("`screen` must be an object");
  const screenLimit: Record<string, number> = {};
  const lim = screen.limit;
  const good = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;
  if (good(lim)) for (const r of [...baselines, ...configs]) screenLimit[r.eval] = lim;
  else if (isObject(lim)) {
    for (const [e, n] of Object.entries(lim)) {
      if (!(e in EVAL_METRICS)) throw new Error(`screen.limit: unknown eval ${e}`);
      if (!good(n)) throw new Error(`screen.limit.${e} must be a positive integer`);
      screenLimit[e] = n;
    }
  } else if (lim !== undefined && lim !== null) throw new Error("screen.limit must be a number or an object by eval");

  const repeats = json.repeats === undefined ? 3 : json.repeats;
  if (typeof repeats !== "number" || !Number.isInteger(repeats) || repeats < MIN_REPEATS) throw new Error(`repeats must be an integer of ${MIN_REPEATS} or more: a verdict needs that many runs of each side`);
  const p = prefix ?? (typeof json.prefix === "string" ? json.prefix : basename(file, extname(file)));
  if (!NAME_RE.test(p)) throw new Error("prefix must use letters, digits, dot, dash and underscore");
  for (const k of ["model", "akm"] as const) if (json[k] !== undefined && (typeof json[k] !== "string" || !(json[k] as string).trim())) throw new Error(`${k} must be a non-empty string`);
  const out: Matrix = { file: resolve(file), prefix: p, baselines, configs, screenLimit, repeats, model: json.model as string | undefined, akm: json.akm as string | undefined };
  for (const c of configs) baselineFor(out, c); // every config has exactly one baseline
  return out;
}

/**
 * The flags that make a run another measurement, whatever the corpus: consolidate's `--pool` (another set of cases), longmemeval's `--retrieval-only` (no
 * model, no answers: its summary has `mode: "retrieval-only"`), bakeoff's `--process` (one process only) and longmemeval's `--sample-seed` (another draw of
 * the questions). A full longmemeval run is never compared with a retrieval-only one, so a config of one has no baseline in the other.
 */
const MODE_FLAGS = ["--pool", "--retrieval-only"];
const VALUE_MODE_FLAGS = ["--process", "--sample-seed"];

/**
 * Rows are only compared when they ran the same cases: the same eval, corpus, pool or per-case mode, cases file and explicit limit.
 * What differs between a baseline and a config (strategy, patch, timeout, ...) is the treatment.
 */
export function scopeKey(r: Row): string {
  const bits = [r.eval, `corpus=${corpusOf(r.eval, r.args)}`];
  for (const f of MODE_FLAGS) if (hasFlag(r.args, f)) bits.push(f.slice(2));
  for (const f of VALUE_MODE_FLAGS) if (hasFlag(r.args, f)) bits.push(`${f.slice(2)}=${flagValue(r.args, f)}`);
  for (const f of ["--cases", "--limit"]) if (hasFlag(r.args, f)) bits.push(`${f.slice(2)}=${flagValue(r.args, f)}`);
  return bits.join(" ");
}

export function baselineFor(m: Matrix, config: Row): Row {
  const key = scopeKey(config);
  const found = m.baselines.filter((b) => scopeKey(b) === key);
  if (found.length === 0) throw new Error(`config ${config.name} has no baseline row that runs the same cases (${key})`);
  if (found.length > 1) throw new Error(`config ${config.name} matches ${found.length} baseline rows (${found.map((b) => b.name).join(", ")}): ${key}`);
  return found[0];
}

/** The `--akm` a row runs with: its own, else the file's (which the Harbor evals do not get), else none and so AKM_BIN. */
function akmOf(m: Matrix, row: Row): string | undefined {
  return flagValue(row.args, "--akm") ?? (HARBOR.includes(row.eval) ? undefined : m.akm);
}

/**
 * The axes a config changes against its baseline: the ones its row declares with "treatment", the build when it runs another `--akm` than
 * its baseline (a `--akm` in the file's top level is the same for both and is not a treatment), and the config when it declares nothing and
 * runs the same build. Every other axis, the model and the cases included, must be the same in both: see ../../compare/src/policy.ts.
 */
export function treatmentAxes(m: Matrix, config: Row, base: Row = baselineFor(m, config)): Axis[] {
  const axes = new Set<Axis>(config.treatment ?? []);
  if ((akmOf(m, config)?.trim() ?? "") !== (akmOf(m, base)?.trim() ?? "")) axes.add("build");
  if (axes.size === 0) axes.add("config");
  return AXES.filter((a) => axes.has(a));
}

// ---- the runs of a stage -------------------------------------------------------------------------------------------------

export type Stage = "screen" | "confirm";

export interface Job {
  stage: Stage;
  row: Row;
  label: string;
  /** The eval's flags, ready to run: the row's, plus --limit (screen) or --repeat (confirm), plus --label. */
  args: string[];
  repeat: number | null;
}

export const labelOf = (prefix: string, name: string, stage: Stage): string => `${prefix}-${name}-${stage === "screen" ? "s" : "c"}`;

function makeJob(m: Matrix, row: Row, stage: Stage): Job {
  const label = labelOf(m.prefix, row.name, stage);
  const args = [...row.args];
  if (m.akm && !hasFlag(args, "--akm") && !HARBOR.includes(row.eval)) args.unshift("--akm", m.akm);
  if (m.model && !NO_MODEL.includes(row.eval) && !hasFlag(args, "--model")) args.unshift("--model", m.model);
  let repeat: number | null = null;
  if (stage === "screen") {
    const limit = m.screenLimit[row.eval];
    if (limit !== undefined && !hasFlag(args, "--limit") && !hasFlag(args, "--pool")) args.push("--limit", String(limit));
  } else {
    repeat = m.repeats;
    args.push("--repeat", String(repeat));
  }
  args.push("--label", label);
  return { stage, row, label, args, repeat };
}

export const screenJobs = (m: Matrix): Job[] => [...m.baselines, ...m.configs].map((r) => makeJob(m, r, "screen"));

// ---- results -------------------------------------------------------------------------------------------------------------

export interface ResultRef {
  /** "" for most evals; retrieval's collection. Scopes are never pooled. */
  scope: string;
  kind: "run" | "repeat";
  /** The summary.json or repeat-summary.json, from the repository root. */
  file: string;
}

export interface RunRecord {
  stage: Stage;
  name: string;
  eval: string;
  label: string;
  args: string[];
  repeat: number | null;
  started: string;
  wall_seconds: number;
  /** The exit code of the eval's process. A run that exits non-zero is no result, whatever it wrote. */
  exit_code: number;
  log: string;
  results: ResultRef[];
  /**
   * The digest of everything the run was made from, taken when it started (see fingerprint.ts), and the digest of each part, so a stage can
   * say what changed. A stage skips a run it already did only when this is the same. A record without one is run again.
   */
  fingerprint?: string;
  fingerprint_parts?: Record<string, string>;
}

export interface State {
  matrix: string;
  prefix: string;
  screen: Record<string, RunRecord>;
  confirm: Record<string, RunRecord>;
}

export const emptyState = (m: Matrix): State => ({ matrix: m.file, prefix: m.prefix, screen: {}, confirm: {} });

export const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

// ---- the corpus a row reads ----------------------------------------------------------------------------------------------

/**
 * The corpus a row's flags name: `public`, `custom` or `all`. `--cases DIR` alone is a custom corpus, as for the evals. Any other value is
 * the runner's to refuse.
 */
export function corpusOf(_evalName: string, args: string[]): string {
  return flagValue(args, "--corpus") ?? (hasFlag(args, "--cases") ? "custom" : "public");
}

/**
 * The custom corpus a row reads, as the runner resolves it from the repository root `root`: its folder (absolute) and whether it is the rewrite.
 * Null when the row reads the public corpus only, the custom corpus has no folder (skillret's is a split of its dataset), or the runner would
 * refuse the flags (it does, and the matrix records that run as it ends). terminal-bench reads the library of retrieval's rewrite, and
 * promotion has no rewrite, so its custom corpus is `--cases DIR` only.
 */
export function customCorpus(root: string, evalName: string, args: string[]): ResolvedCorpus | null {
  if (corpusOf(evalName, args) === "public" || evalName === "skillret") return null;
  try {
    const found = resolveCorpora({ eval: evalName === "terminal-bench" ? "retrieval" : evalName, values: { corpus: flagValue(args, "--corpus"), cases: flagValue(args, "--cases") }, publicFolder: join(root, runnerFolder(evalName), evalName), rewrite: evalName !== "promotion", root });
    return found.find((c) => c.name === "custom") ?? null;
  } catch {
    return null;
  }
}

/** The folders an eval or a benchmark may write its results to for a corpus: results/ for the public one, and private/<eval>/ for a custom one (and the folders of own corpora before they moved there). */
export function resultsParents(root: string, evalName: string, args: string[]): string[] {
  const corpus = corpusOf(evalName, args);
  if (corpus === "public") return [join(root, runnerFolder(evalName), evalName, "results")];
  const p = join(root, "private", evalName);
  return [join(p, "results"), join(p, "own", "results"), join(p, "own", "results-feedback")];
}

/**
 * The summaries a run wrote. The label is the run's own, so the summaries are found by the `label` they record, among folders
 * written since `sinceMs` (a label used before is not mistaken for this run). With a repeat, by the first run of a repeat summary.
 */
export function findResults(root: string, job: Pick<Job, "label" | "repeat" | "args" | "row">, sinceMs: number): ResultRef[] {
  const refs: ResultRef[] = [];
  for (const parent of resultsParents(root, job.row.eval, job.args)) {
    if (!existsSync(parent)) continue;
    const entries = readdirSync(parent).filter((n) => n.includes(job.label));
    const fresh = (p: string) => statSync(p).mtimeMs >= sinceMs;
    const rel = (p: string) => p.slice(root.length + 1);
    if (job.repeat === null) {
      const found = new Map<string, { file: string; mtime: number }>();
      for (const n of entries) {
        const file = join(parent, n, "summary.json");
        if (!existsSync(file) || !fresh(file)) continue;
        const s = readJson(file);
        if (s?.label !== job.label) continue;
        const scope = typeof s.collection === "string" ? s.collection : "";
        const mtime = statSync(file).mtimeMs;
        if (!found.has(scope) || found.get(scope)!.mtime < mtime) found.set(scope, { file, mtime });
      }
      for (const [scope, { file }] of found) refs.push({ scope, kind: "run", file: rel(file) });
    } else {
      const found = new Map<string, { file: string; mtime: number }>();
      for (const n of entries.filter((n) => n.endsWith(".json") && n.includes("-repeat-summary"))) {
        const file = join(parent, n);
        if (!fresh(file)) continue;
        const s = readJson(file);
        const first = Array.isArray(s?.runs) ? readJson(join(parent, s.runs[0], "summary.json")) : null;
        if (first?.label !== `${job.label}-r1`) continue;
        const scope = typeof first.collection === "string" ? first.collection : "";
        const mtime = statSync(file).mtimeMs;
        if (!found.has(scope) || found.get(scope)!.mtime < mtime) found.set(scope, { file, mtime });
      }
      for (const [scope, { file }] of found) refs.push({ scope, kind: "repeat", file: rel(file) });
    }
  }
  return refs;
}

// ---- reading a result ----------------------------------------------------------------------------------------------------

export interface Spread {
  min: number;
  max: number;
  mean: number;
}

/** One run behind a result: its results folder, and what its summary says about how it was made. */
export interface RunFacts {
  name: string;
  identity: Identity;
}

export interface Measured {
  scope: string;
  /** Runs behind the numbers: 1 for a screen, the repeats for a confirm. */
  n: number;
  model: string | null;
  akm_build: string | null;
  akm_version: string | null;
  /** What the akm checkout holds beyond its commit (a digest): two edits of one commit have one `akm_build` and two of these. Null for a clean checkout or a release. */
  akm_build_fingerprint?: string | null;
  /** Mean number of errored cases per run. */
  n_errored: number | null;
  /** Mean number of tasks that failed per run, from the `completion` a Harbor run records. */
  failed: number | null;
  /** Mean model calls per run, for the evals whose summary counts them. */
  calls: number | null;
  /** Mean seconds per run. */
  seconds: number | null;
  metrics: unknown;
  repeated: boolean;
  /** The results folders of the runs behind the numbers (absolute): one for a run, the repeats' for a repeat. */
  dirs?: string[];
  /** Every run behind the numbers, not the first alone: the policy checks each of them (see ../../compare/src/policy.ts). */
  runs: RunFacts[];
  /** The runs scored again with the current scorer, as scripts/compare reads them, when the sides had been scored by different scorers (see `scoredAlike`). */
  rescored?: Run[];
}

const at = (x: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (isObject(o) ? o[k] : undefined), x);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const mean = (xs: (number | null)[]): number | null => {
  const ok = xs.filter((x): x is number => x !== null);
  return ok.length ? Number((ok.reduce((a, b) => a + b, 0) / ok.length).toFixed(4)) : null;
};

/** Model calls of one run: nightly and the pool count them in `metrics.calls`, promotion at the top. */
export function callsOf(s: any): number | null {
  return num(s?.metrics?.calls?.n) ?? num(s?.metrics?.calls?.calls) ?? num(s?.calls?.n);
}

/** The results folders of the runs a result stands for: its own, or those a repeat summary lists. */
export function runDirs(file: string, s: any, kind: ResultRef["kind"]): string[] {
  if (kind === "run") return [dirname(file)];
  return (Array.isArray(s?.runs) ? s.runs : []).filter((r: unknown) => typeof r === "string").map((r: string) => join(dirname(file), r));
}

/**
 * Why a result is no result, as a clause to follow "the run": a run behind it was cut short (`status: "aborted"`), or its summary does not
 * say it finished (no `status`, a status other than "complete", results missing from the `completion` of a Harbor run), and so its
 * numbers cover only what ran. The evals write the summary before they fail, so a summary is there to be found. Null when every run behind
 * it is complete.
 */
export function incompleteReason(root: string, ref: ResultRef): string | null {
  const file = join(root, ref.file);
  const top = readJson(file);
  if (!isObject(top)) return "is not complete: its summary cannot be read";
  if (ref.kind === "run") {
    const inc = incompleteOf(top);
    return unsound(top, dirname(ref.file), "its") ?? (inc ? incompleteClause(inc) : null);
  }
  const dirs = runDirs(file, top, "repeat");
  const listed = num(top.repeat);
  if (dirs.length === 0) return "is not complete: its repeat summary lists no runs";
  if (listed !== null && listed !== dirs.length) return `is not complete: its repeat summary lists ${dirs.length} of ${listed} runs`;
  for (const [i, dir] of dirs.entries()) {
    const s = readJson(join(dir, "summary.json"));
    if (!isObject(s)) return `is not complete: run r${i + 1} has no readable summary.json`;
    const bad = unsound(s, relative(root, dir), `run r${i + 1}'s`);
    if (bad) return bad;
    const inc = incompleteOf(s);
    if (inc) return incompleteClause(inc, `run r${i + 1}: `);
  }
  return null;
}

/** Why a summary's manifest is no manifest, as a clause to follow "the run", or null for a sound one. A run whose manifest the validator refuses has an identity nobody can read. */
function unsound(summary: Record<string, any>, folder: string, whose: string): string | null {
  const reading = readManifest(summary);
  if (reading.kind === "legacy") return noManifest(folder);
  return reading.kind === "invalid" ? `is not usable: ${whose} manifest is not sound: ${reading.problems.join("; ")}` : null;
}

/**
 * `root` is the repository root; `ref.file` is from it. `wallSeconds` is the runner's own timing of the whole command. A run that was not complete is no result.
 * What the runs say of how they were made (the akm, the collector and the scorer) is read from the manifest, through lib/manifest.ts.
 */
export function loadMeasured(root: string, ref: ResultRef, wallSeconds: number, repeat: number | null): Measured | null {
  const file = join(root, ref.file);
  const s = readJson(file);
  if (!s || incompleteReason(root, ref) !== null) return null;
  const dirs = runDirs(file, s, ref.kind);
  const summaries = ref.kind === "run" ? [s] : dirs.map((d) => readJson(join(d, "summary.json")));
  const runs: RunFacts[] = summaries.map((x, i) => ({ name: basename(dirs[i]), identity: identityOf(x) }));
  const first = summaries[0];
  // a Harbor run's akm is the release it installed, which its summary records beside the manifest's
  const m = HARBOR.includes(String(first.eval)) ? null : (first.manifest as RunManifest);
  const common = {
    scope: ref.scope,
    model: s.model ?? null,
    akm_build: m ? m.akm.build : s.akm_build ?? null,
    akm_version: m ? m.akm.version : s.akm_version ?? null,
    akm_build_fingerprint: m ? m.akm.build_fingerprint : s.akm_build_fingerprint ?? first.akm_build_fingerprint ?? null,
    metrics: s.metrics,
    dirs,
    runs,
  };
  if (ref.kind === "run") {
    return { ...common, n: 1, n_errored: num(s.n_errored), failed: num(at(s, "completion.failed")), calls: callsOf(s), seconds: wallSeconds, repeated: false };
  }
  return { ...common, n: repeat ?? summaries.length, n_errored: num(at(s, "n_errored.mean")), failed: mean(summaries.map((x) => num(at(x, "completion.failed")))), calls: mean(summaries.map(callsOf)), seconds: num(at(s, "seconds.mean")), repeated: true };
}

/** The spread of a metric: {min, max, mean} from a repeat summary, or a single number as a spread of one. */
export function metricSpread(m: Measured, path: string): Spread | null {
  const v = at(m.metrics, path);
  if (!m.repeated) {
    const x = num(v);
    return x === null ? null : { min: x, max: x, mean: x };
  }
  if (!isObject(v)) return null;
  const [min, max, mean] = [num(v.min), num(v.max), num(v.mean)];
  return min === null || max === null || mean === null ? null : { min, max, mean };
}

// ---- comparing -----------------------------------------------------------------------------------------------------------

export type Signal = "better" | "worse" | "same" | "n/a";
export interface MetricCompare extends MetricSpec {
  base: Spread | null;
  cfg: Spread | null;
  signal: Signal;
}

/** How many times the wider of two ranges the gap between them must be for a metric to be better or worse. See compareMetric. */
export const GAP_FACTOR = 1.25;

/**
 * The decision rule. A metric is better (worse) when the config's min-max range over the repeats lies wholly on the better (worse) side of the
 * baseline's, and the gap between the two ranges is at least GAP_FACTOR times the wider of them. Main metrics and harm metrics are judged alike:
 * the mean of a harm metric that is higher by chance is not a rise, and a verdict reads every metric of its eval, so a rule that is lenient to
 * each one is wrong most of the time over all of them. The gap is what holds a change from noise: with three repeats a side and noise that is
 * the same on both sides, ranges that merely do not overlap happen one time in ten for each metric, and a gap of GAP_FACTOR times the ranges one
 * time in two hundred, which keeps the four metrics of a judge-gate run to about 3% of verdicts (the simulation in lib.test.ts). A metric that
 * is the same in every repeat has ranges of no width, so any difference between two such sides is a gap.
 */
export function compareMetric(spec: MetricSpec, base: Spread | null, cfg: Spread | null): MetricCompare {
  let signal: Signal = "n/a";
  if (base && cfg) {
    const needed = GAP_FACTOR * Math.max(base.max - base.min, cfg.max - cfg.min) - EPS;
    const above = cfg.min - base.max; // the config's range above the baseline's
    const below = base.min - cfg.max;
    const moved = above > EPS && above >= needed ? "up" : below > EPS && below >= needed ? "down" : null;
    signal = moved === null ? "same" : moved === spec.dir ? "better" : "worse";
  }
  return { ...spec, base, cfg, signal };
}

export function compareAll(evalName: string, base: Measured, cfg: Measured): MetricCompare[] {
  return EVAL_METRICS[evalName].map((spec) => compareMetric(spec, metricSpread(base, spec.path), metricSpread(cfg, spec.path)));
}

/**
 * What a row of the decision says. "better", "worse", "mixed" and "no difference" are conclusions. The others are not:
 * "screen only" (one run a side), "no result" (nothing scored, or a run that is not a complete result), "not comparable" (the runs differ
 * on an axis that is not the treatment), "incomplete" (the config would be better, but more of its cases errored than the baseline's, so its
 * rates cover fewer cases) and "exploratory" (the numbers are there, but they are not a conclusion: the policy lacks the evidence that the
 * runs differ only in the treatment (see ../../compare/src/policy.ts), a side has fewer than MIN_REPEATS runs, the sides scored different
 * cases, or retrieval's graded share fell).
 */
export type Verdict = "better" | "worse" | "no difference" | "mixed" | "screen only" | "no result" | "not comparable" | "incomplete" | "exploratory";

/** The policy over every run behind two results: the treatment may differ between them, nothing else may, nor may the repeats of one side. */
export function assess(evalName: string, base: Measured, cfg: Measured, axes: Axis[] = ["config"]): PolicyResult {
  const members = [
    ...base.runs.map((r) => ({ side: "the baseline", name: r.name, identity: r.identity })),
    ...cfg.runs.map((r) => ({ side: "the config", name: r.name, identity: r.identity })),
  ];
  // The numbers of a result come from its summary, so a case whose input differs cannot be left out as scripts/compare leaves it out: it is a difference of inputs.
  return checkMembers(members, axes, { caseInputs: true });
}

// ---- results from different scorers -----------------------------------------------------------------------------------------

/**
 * Scores every run of both sides again, in memory, with the current scorer and labels (scripts/rescore), as scripts/compare does: a scorer fix
 * or a relabelled case applies to results already made. Nothing is written. A run that cannot be scored again, for want of the raw output its
 * scorer reads, refuses the pair, with the reason.
 */
export function scoredAlike(root: string, base: Measured, cfg: Measured): { base: Measured; cfg: Measured; unscored?: string } {
  if (!base.dirs?.length || !cfg.dirs?.length) return { base, cfg };
  const { RescoreError, readStored, rescoreRun } = rescorer();
  type Attempt = { summary: Record<string, any>; run: Run } | { error: InstanceType<typeof RescoreError> };
  const attempt = (dir: string): Attempt => {
    const shown = isAbsolute(dir) && relative(root, dir).startsWith("..") ? dir : relative(root, dir);
    try {
      const result = rescoreRun({ ...readStored(dir), dir: shown });
      return { summary: result.summary, run: { dir: shown, summary: result.summary, rows: result.rows } as Run };
    } catch (e) {
      if (e instanceof RescoreError) return { error: e };
      throw e;
    }
  };
  const tried = { base: (base.dirs ?? []).map(attempt), cfg: (cfg.dirs ?? []).map(attempt) };
  const score = (side: string, m: Measured, attempts: Attempt[]): Measured => {
    const failed = attempts.find((a): a is { error: InstanceType<typeof RescoreError> } => "error" in a);
    if (failed) throw new RescoreError(`${side} cannot be scored again with the current scorer: ${failed.error.message}`);
    const done = attempts as { summary: Record<string, any>; run: Run }[];
    const summaries = done.map((d) => d.summary);
    const runs = m.runs.map((r, i) => ({ ...r, identity: identityOf(summaries[i]) }));
    const numbers = m.repeated
      ? { metrics: spreadOf(summaries.map((x) => x.metrics)), n_errored: mean(summaries.map((x) => num(x.n_errored))), calls: mean(summaries.map(callsOf)) }
      : { metrics: summaries[0].metrics, n_errored: num(summaries[0].n_errored), calls: callsOf(summaries[0]) };
    return { ...m, ...numbers, runs, rescored: done.map((d) => d.run) };
  };
  try {
    return { base: score("the baseline", base, tried.base), cfg: score("the config", cfg, tried.cfg) };
  } catch (e) {
    // compared as they were scored, and the row says why
    if (e instanceof RescoreError) return { base, cfg, unscored: `${e.message}, so both sides are compared as they were scored` };
    throw e;
  }
}

/**
 * Why two results cannot be set side by side, or null: an axis that is not the treatment differs, between the sides or among the repeats of
 * one side. The treatment says which axes may differ: for a config treatment the build must be the same; for a build treatment the akm
 * version, build and command are what differ, and the model, the cases, the config and the eval's code must still be the same.
 */
export function incomparable(base: Measured, cfg: Measured, axes: Axis[] = ["config"], evalName = ""): string | null {
  const why = messages(assess(evalName, base, cfg, axes).mismatches);
  return why.length > 0 ? why.join("; ") : null;
}

/** Evidence the policy needs and a result does not give: the numbers may be right, and they are not a conclusion. */
export const exploratoryReasons = (evalName: string, base: Measured, cfg: Measured, axes: Axis[] = ["config"]): string[] => messages(assess(evalName, base, cfg, axes).gaps);

/**
 * How the config's errors compare with the baseline's, by the eval's completeness policy: a note for each count that rose. A result with
 * more errored cases (or failed Harbor tasks) scored fewer of them, so its rates are not those of the baseline's cases.
 */
export function moreErrors(evalName: string, base: Measured, cfg: Measured): string[] {
  const out: string[] = [];
  for (const count of EVALS[evalName]?.completeness.errors ?? ["n_errored"]) {
    const [b, c] = count === "n_errored" ? [base.n_errored, cfg.n_errored] : [base.failed, cfg.failed];
    if ((c ?? 0) > (b ?? 0) + EPS) out.push(count === "n_errored" ? `more errored cases (${c} vs ${b ?? 0})` : `more failed tasks (${c} vs ${b ?? 0})`);
  }
  return out;
}

export interface Judgement {
  verdict: Verdict;
  /** The verdict before the policy's gaps made it "exploratory", else the verdict. */
  reading: Verdict;
  exploratory: string[];
}

const fmt = (x: number): string => String(Number(x.toFixed(3)));

/** Why a side with fewer than MIN_REPEATS runs gives no conclusion: one reason for the sides that are short. */
function fewRepeats(base: Measured, cfg: Measured): string[] {
  const short = [["the baseline", base.n], ["the config", cfg.n]].filter(([, n]) => (n as number) < MIN_REPEATS);
  return short.length === 0 ? [] : [`a conclusion needs at least ${MIN_REPEATS} repeats on each side, and ${short.map(([who, n]) => `${who} has ${n}`).join(" and ")}`];
}

/**
 * The share of results someone graded, where the config's is below the baseline's: the config returned results that nobody graded, which the
 * eval's metric counts as not relevant. Its numbers say less about the config than about the qrels. Empty for the evals that have no such share.
 */
function ungraded(evalName: string, base: Measured, cfg: Measured): string[] {
  const fell = (EVALS[evalName]?.graded ?? []).flatMap((path) => {
    const [b, c] = [metricSpread(base, path), metricSpread(cfg, path)];
    return b && c && c.mean < b.mean - EPS ? [`${path} ${fmt(b.mean)} → ${fmt(c.mean)}`] : [];
  });
  return fell.length === 0 ? [] : [`the config returned results nobody graded (${fell.join(", ")}), and ndcg_10 counts those as not relevant: label them first (evals/retrieval/label --from the config's results folder), then compare`];
}

/**
 * The verdict of a config against its baseline, and the reasons it is exploratory. `extra` are reasons from outside the summaries' numbers,
 * such as the two sides having scored different cases (see paired.ts), which make a conclusion exploratory the way a policy gap does.
 */
export function judge(evalName: string, compares: MetricCompare[], base: Measured, cfg: Measured, axes: Axis[] = ["config"], extra: string[] = []): Judgement {
  const scored = (c: MetricCompare) => c.role === "main" && c.base && c.cfg;
  const policy = assess(evalName, base, cfg, axes);
  const exploratory = messages(policy.gaps);
  const done = (verdict: Verdict): Judgement => ({ verdict, reading: verdict, exploratory });
  if (!compares.some(scored)) return done("no result");
  if (policy.mismatches.length > 0) return done("not comparable");
  if (base.n < 2 || cfg.n < 2) return done("screen only");
  exploratory.push(...fewRepeats(base, cfg), ...ungraded(evalName, base, cfg), ...extra);
  const better = compares.some((c) => c.signal === "better");
  const worse = compares.some((c) => c.signal === "worse");
  let reading: Verdict = better && worse ? "mixed" : better ? "better" : worse ? "worse" : "no difference";
  if (reading === "better" && moreErrors(evalName, base, cfg).length > 0) reading = "incomplete";
  return { verdict: exploratory.length > 0 ? "exploratory" : reading, reading, exploratory };
}

export const verdictOf = (compares: MetricCompare[], base: Measured, cfg: Measured, axes: Axis[] = ["config"], evalName = ""): Verdict => judge(evalName, compares, base, cfg, axes).verdict;

/**
 * The screen compares n=1 runs, so "differs" is the size of the change: a main or harm metric whose mean moved by more than `minDelta`
 * (0: any change). Returns the metrics that moved.
 */
export function screenDiffers(evalName: string, base: Measured, cfg: Measured, minDelta: number): string[] {
  return EVAL_METRICS[evalName]
    .filter((spec) => {
      const [b, c] = [metricSpread(base, spec.path), metricSpread(cfg, spec.path)];
      return b && c && Math.abs(c.mean - b.mean) > minDelta + EPS;
    })
    .map((s) => s.path);
}

// ---- stage 2: which configs to confirm -----------------------------------------------------------------------------------

export interface Selection {
  config: Row;
  reason: string;
}

/**
 * Why the results of a run record are no results, as a clause to follow "the run", or null. The eval's process must have exited 0 and
 * written a summary that says it is complete; a run that exited non-zero keeps its artifacts and its log, and is not used.
 */
export function unusableReason(root: string, rec: RunRecord | undefined): string | null {
  if (!rec) return null;
  if (rec.results.length === 0) return `wrote no summary (exit ${rec.exit_code})`;
  for (const ref of rec.results) {
    const why = incompleteReason(root, ref);
    if (why) return why;
  }
  return rec.exit_code !== 0 ? `exited ${rec.exit_code}, so what it wrote is kept and not used` : null;
}

export const measuredOf = (root: string, rec: RunRecord | undefined): Measured[] =>
  unusableReason(root, rec) !== null ? [] : (rec?.results ?? []).map((ref) => loadMeasured(root, ref, rec!.wall_seconds, rec!.repeat)).filter((x): x is Measured => x !== null);

/** The configs to confirm: those named in `only`, or those whose screen result differs from their baseline's. */
export function selectForConfirm(root: string, m: Matrix, state: State, opts: { only?: string[]; minDelta: number }): { selected: Selection[]; skipped: Selection[] } {
  const selected: Selection[] = [];
  const skipped: Selection[] = [];
  if (opts.only) {
    const unknown = opts.only.filter((n) => !m.configs.some((c) => c.name === n));
    if (unknown.length) throw new Error(`--only names no config: ${unknown.join(", ")}`);
  }
  for (const config of m.configs) {
    if (opts.only) {
      if (opts.only.includes(config.name)) selected.push({ config, reason: "named with --only" });
      continue;
    }
    const base = baselineFor(m, config);
    const [b, c] = [measuredOf(root, state.screen[base.name]), measuredOf(root, state.screen[config.name])];
    if (c.length === 0) {
      const why = unusableReason(root, state.screen[config.name]);
      skipped.push({ config, reason: why ? `no screen result, the run ${why}` : "no screen result" });
      continue;
    }
    const axes = treatmentAxes(m, config, base);
    const notes: string[] = [];
    const moved = c.flatMap((cm) => {
      const bm0 = b.find((x) => x.scope === cm.scope);
      if (!bm0) return [];
      const same = scoredAlike(root, bm0, cm);
      if (same.unscored) notes.push(same.unscored);
      const bm = same.base;
      const why = incomparable(bm, same.cfg, axes, config.eval);
      if (why) {
        notes.push(why);
        return [];
      }
      return screenDiffers(config.eval, bm, same.cfg, opts.minDelta);
    });
    if (moved.length) selected.push({ config, reason: `screen differs: ${[...new Set(moved)].join(", ")}` });
    else if (notes.length) skipped.push({ config, reason: `screen not comparable: ${[...new Set(notes)].join("; ")}` });
    else if (b.length === 0) {
      const why = unusableReason(root, state.screen[base.name]);
      skipped.push({ config, reason: why ? `no baseline screen result, the baseline run ${why}` : "no baseline screen result" });
    } else skipped.push({ config, reason: "screen result matches the baseline" });
  }
  return { selected, skipped };
}

/** The baselines of the selected configs, once each, then the configs. */
export function confirmJobs(m: Matrix, selected: Selection[]): Job[] {
  const bases = new Map<string, Row>();
  for (const s of selected) {
    const b = baselineFor(m, s.config);
    bases.set(b.name, b);
  }
  return [...bases.values(), ...selected.map((s) => s.config)].map((r) => makeJob(m, r, "confirm"));
}

// ---- running jobs ---------------------------------------------------------------------------------------------------------

/** Runs `run` for every job, `parallel` at a time, never two jobs with the same `key` (an eval) at once. Jobs start in order. */
export async function schedule<J>(jobs: J[], parallel: number, key: (j: J) => string, run: (j: J) => Promise<void>): Promise<void> {
  const pending = [...jobs];
  const active = new Set<string>();
  let running = 0;
  await new Promise<void>((done) => {
    const pump = () => {
      while (running < parallel) {
        const i = pending.findIndex((j) => !active.has(key(j)));
        if (i < 0) break;
        const [job] = pending.splice(i, 1);
        active.add(key(job));
        running++;
        run(job)
          .catch(() => {})
          .finally(() => {
            active.delete(key(job));
            running--;
            pump();
          });
      }
      if (running === 0 && pending.length === 0) done();
    };
    pump();
  });
}
