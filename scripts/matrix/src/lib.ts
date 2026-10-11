// The matrix runner's logic, without the process spawning: the matrix file, the table of each eval's metrics, which runs a stage
// makes, how a result is found, and the verdict. The report is in decision.ts. See ../../../README.md ("Run a matrix").

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";

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

/**
 * The Harbor evals (agent-ab, terminal-bench) write the same metrics, from lib/harbor/harbor.ts `metricsOf`: the difference in pass rate between
 * the akm arm and the control arm, paired by task. Harm is akm trials that errored and control trials that called akm (the control has no plugin).
 */
const harbor = (): MetricSpec[] => [main("delta.value"), harm("akm.errored"), harm("engagement.control_calls")];

/**
 * The metrics each eval is judged on. Every path was read from a real summary.json (and repeat-summary.json, which has the same keys with
 * {min, max, mean} at each number). Rates are used for the main metrics, counts for harm that should be zero.
 */
export const EVAL_METRICS: Record<string, MetricSpec[]> = {
  nightly: [main("items.rate"), harm("harm.items"), harm("harm.outside_changed"), harm("harm.lessons_accepted"), harm("calls.failures")],
  consolidate: [main("recall.value"), main("precision.value"), harm("unsafe.n")], // the same keys with --pool
  distill: [main("good_lessons.rate"), harm("wrong_lessons.rate")],
  reflect: [main("defects.rate"), harm("controls.rate", "up"), harm("proposals.touched_body")],
  promotion: [main("precision.value"), main("recall.value"), harm("bad_accepted.value")],
  "judge-gate": [main("precision.value"), main("good.rate"), harm("bad.rate")],
  extract: [main("insights.rate"), harm("routine.rate", "up"), harm("planted.saved_instruction")],
  retrieval: [main("search.ndcg_10"), main("curate.ndcg_10"), main("semantic_search.ndcg_10"), main("semantic_curate.ndcg_10")],
  "agent-ab": harbor(),
  "terminal-bench": harbor(),
};

/** What a row's `eval` names that lives in benchmarks/<name>/run and not in evals/<name>/run. */
const BENCHMARKS = ["terminal-bench"];
/** The evals that run in Harbor. Their --akm is an npm release or a checkout's folder, not a command (see lib/harbor/harbor.ts). */
const HARBOR = ["agent-ab", "terminal-bench"];

/** The folder a row's eval or benchmark is in, under the repository root: evals or benchmarks. */
export const runnerFolder = (name: string): "evals" | "benchmarks" => (BENCHMARKS.includes(name) ? "benchmarks" : "evals");
/** The run script of an eval or a benchmark, from the repository root `root`. */
export const runnerPath = (root: string, name: string): string => join(root, runnerFolder(name), name, "run");

export const NAME_RE = /^[A-Za-z0-9._-]+$/;
const EPS = 1e-9;

// ---- the matrix file ----------------------------------------------------------------------------------------------------

/** What a config changes against its baseline: the akm build, or only settings (a strategy, a config patch, a timeout, ...) of the same build. */
export type Treatment = "build" | "config";

export interface Row {
  name: string;
  /** The eval or the benchmark to run: a name of EVAL_METRICS, which is in evals/ or in benchmarks/. */
  eval: string;
  /** The eval's own flags, with a relative --config-patch resolved from the matrix file's folder. */
  args: string[];
  /** "build" on a config row says its treatment is another akm build, which is also so when its --akm differs from its baseline's. */
  treatment?: "build";
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

function parseRow(x: unknown, what: string, dir: string, defaultName?: string): Row {
  if (!isObject(x)) throw new Error(`${what} must be an object {name, eval, args}`);
  if (x.treatment !== undefined && x.treatment !== "build") throw new Error(`${what}: treatment must be "build", or left out`);
  if (x.treatment !== undefined && what === "baseline") throw new Error(`${what}: treatment is for a config row, the baseline is what it is compared with`);
  const name = x.name === undefined ? defaultName : x.name;
  if (typeof name !== "string" || !NAME_RE.test(name)) throw new Error(`${what}: name must use letters, digits, dot, dash and underscore`);
  if (typeof x.eval !== "string" || !(x.eval in EVAL_METRICS)) throw new Error(`${what} (${name}): eval must be one of ${Object.keys(EVAL_METRICS).join(", ")}`);
  const args = x.args ?? [];
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) throw new Error(`${what} (${name}): args must be a list of strings`);
  for (const f of ["--label", "--repeat"]) if (hasFlag(args as string[], f)) throw new Error(`${what} (${name}): leave out ${f}, the runner sets it`);
  if (flagValue(args as string[], "--corpus") === "all") throw new Error(`${what} (${name}): --corpus all pools corpora; list one row per corpus`);
  return { name, eval: x.eval, args: resolvePatch(args as string[], dir), ...(x.treatment === "build" ? { treatment: "build" as const } : {}) };
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
  if (typeof repeats !== "number" || !Number.isInteger(repeats) || repeats < 2) throw new Error("repeats must be an integer of 2 or more");
  const p = prefix ?? (typeof json.prefix === "string" ? json.prefix : basename(file, extname(file)));
  if (!NAME_RE.test(p)) throw new Error("prefix must use letters, digits, dot, dash and underscore");
  for (const k of ["model", "akm"] as const) if (json[k] !== undefined && (typeof json[k] !== "string" || !(json[k] as string).trim())) throw new Error(`${k} must be a non-empty string`);
  const out: Matrix = { file: resolve(file), prefix: p, baselines, configs, screenLimit, repeats, model: json.model as string | undefined, akm: json.akm as string | undefined };
  for (const c of configs) baselineFor(out, c); // every config has exactly one baseline
  return out;
}

/**
 * Rows are only compared when they ran the same cases: the same eval, corpus, pool or per-case mode, cases file and explicit limit.
 * What differs between a baseline and a config (strategy, patch, timeout, ...) is the treatment.
 */
export function scopeKey(r: Row): string {
  const bits = [r.eval, `corpus=${flagValue(r.args, "--corpus") ?? "public"}`];
  if (hasFlag(r.args, "--pool")) bits.push("pool");
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
 * What a config changes against its baseline. A build, when the row says `"treatment": "build"` or runs another `--akm` than its baseline
 * (a `--akm` in the file's top level is the same for both and is not a treatment). Otherwise settings of one build, which must be the
 * same build in both.
 */
export function treatmentOf(m: Matrix, config: Row, base: Row = baselineFor(m, config)): Treatment {
  if (config.treatment === "build") return "build";
  return (akmOf(m, config)?.trim() ?? "") !== (akmOf(m, base)?.trim() ?? "") ? "build" : "config";
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
  if (m.model && row.eval !== "retrieval" && !hasFlag(args, "--model")) args.unshift("--model", m.model);
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
  exit_code: number;
  log: string;
  results: ResultRef[];
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

/** The folders an eval or a benchmark may write its results to for a corpus. */
export function resultsParents(root: string, evalName: string, args: string[]): string[] {
  const corpus = flagValue(args, "--corpus") ?? "public";
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

export interface Measured {
  scope: string;
  /** Runs behind the numbers: 1 for a screen, the repeats for a confirm. */
  n: number;
  model: string | null;
  akm_build: string | null;
  akm_version: string | null;
  /** Mean number of errored cases per run. */
  n_errored: number | null;
  /** Mean model calls per run, for the evals whose summary counts them. */
  calls: number | null;
  /** Mean seconds per run. */
  seconds: number | null;
  metrics: unknown;
  repeated: boolean;
  /** The digest of the cases the run read, and the seed of its private assets, for the summaries that record them. */
  assets_sha256?: string | null;
  seed?: string | number | null;
  /** The results folders of the runs behind the numbers (absolute): one for a run, the repeats' for a repeat. */
  dirs?: string[];
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
 * Why a result is no result: a run behind it was cut short (`status: "aborted"`), and so its numbers cover only the cases that ran. The
 * evals write the summary before they fail, so a summary is there to be found. Null when no run was cut short.
 */
export function abortedReason(root: string, ref: ResultRef): string | null {
  const file = join(root, ref.file);
  for (const [i, dir] of runDirs(file, readJson(file), ref.kind).entries()) {
    const s = ref.kind === "run" ? readJson(file) : readJson(join(dir, "summary.json"));
    if (s?.status === "aborted") return `${ref.kind === "repeat" ? `run r${i + 1}: ` : ""}${typeof s.aborted_reason === "string" ? s.aborted_reason : "no reason recorded"}`;
  }
  return null;
}

/** What a summary says its cases were made from. A repeat summary has neither, so the first of its runs is read. */
function provenanceOf(s: any): { assets_sha256: string | null; seed: string | number | null } {
  return { assets_sha256: typeof s?.assets_sha256 === "string" ? s.assets_sha256 : null, seed: typeof s?.seed === "string" || typeof s?.seed === "number" ? s.seed : null };
}

/** `root` is the repository root; `ref.file` is from it. `wallSeconds` is the runner's own timing of the whole command. A run that was cut short is no result. */
export function loadMeasured(root: string, ref: ResultRef, wallSeconds: number, repeat: number | null): Measured | null {
  const file = join(root, ref.file);
  const s = readJson(file);
  if (!s || abortedReason(root, ref) !== null) return null;
  const dirs = runDirs(file, s, ref.kind);
  if (ref.kind === "run") {
    return { scope: ref.scope, n: 1, model: s.model ?? null, akm_build: s.akm_build ?? null, akm_version: s.akm_version ?? null, n_errored: num(s.n_errored), calls: callsOf(s), seconds: wallSeconds, metrics: s.metrics, repeated: false, ...provenanceOf(s), dirs };
  }
  const runs = dirs.map((d) => readJson(join(d, "summary.json")));
  return { scope: ref.scope, n: repeat ?? runs.length, model: s.model ?? null, akm_build: s.akm_build ?? null, akm_version: s.akm_version ?? null, n_errored: num(at(s, "n_errored.mean")), calls: mean(runs.map(callsOf)), seconds: num(at(s, "seconds.mean")), metrics: s.metrics, repeated: true, ...provenanceOf(runs.find(isObject)), dirs };
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

const betterThan = (a: number, b: number, dir: Dir): boolean => (dir === "up" ? a > b + EPS : a < b - EPS);

/**
 * The decision rule of the plan. A metric is better (worse) when the config's min-max range over the repeats does not overlap the
 * baseline's, on the better (worse) side. Harm must not rise: a harm metric whose mean is worse than the baseline's is worse even when the
 * ranges overlap.
 */
export function compareMetric(spec: MetricSpec, base: Spread | null, cfg: Spread | null): MetricCompare {
  let signal: Signal = "n/a";
  if (base && cfg) {
    const good = spec.dir === "up" ? cfg.min > base.max + EPS : cfg.max < base.min - EPS;
    const bad = spec.dir === "up" ? cfg.max < base.min - EPS : cfg.min > base.max + EPS;
    signal = good ? "better" : bad ? "worse" : spec.role === "harm" && betterThan(base.mean, cfg.mean, spec.dir) ? "worse" : "same";
  }
  return { ...spec, base, cfg, signal };
}

export function compareAll(evalName: string, base: Measured, cfg: Measured): MetricCompare[] {
  return EVAL_METRICS[evalName].map((spec) => compareMetric(spec, metricSpread(base, spec.path), metricSpread(cfg, spec.path)));
}

export type Verdict = "better" | "worse" | "no difference" | "mixed" | "screen only" | "no result" | "not comparable";

const short = (x: string | number): string => String(x).slice(0, 12);

/**
 * Why two results cannot be set side by side, or null. The model must be the same whatever the treatment. The akm build and version must be
 * the same for a config treatment, since the build is then not what is being compared; for a build treatment they are what differs. Two
 * runs that record the digest of their assets, or the seed of their private assets, must agree on it: otherwise they scored other cases.
 * A summary that does not record one is compared as before.
 */
export function incomparable(base: Measured, cfg: Measured, treatment: Treatment = "config"): string | null {
  const why: string[] = [];
  const differ = (what: string, b: unknown, c: unknown) => why.push(`${what} differs: ${b ?? "none"} in the baseline, ${c ?? "none"} in the config`);
  if (base.model !== cfg.model) differ("the model", base.model, cfg.model);
  if (treatment !== "build") {
    if (base.akm_build !== cfg.akm_build) differ("the akm build", base.akm_build ?? "release", cfg.akm_build ?? "release");
    if (base.akm_version !== cfg.akm_version) differ("the akm version", base.akm_version, cfg.akm_version);
  }
  if (base.assets_sha256 && cfg.assets_sha256 && base.assets_sha256 !== cfg.assets_sha256) differ("the cases (assets_sha256)", short(base.assets_sha256), short(cfg.assets_sha256));
  if (base.seed != null && cfg.seed != null && String(base.seed) !== String(cfg.seed)) differ("the seed of the private assets", base.seed, cfg.seed);
  return why.length > 0 ? why.join("; ") : null;
}

export function verdictOf(compares: MetricCompare[], base: Measured, cfg: Measured, treatment: Treatment = "config"): Verdict {
  const scored = (c: MetricCompare) => c.role === "main" && c.base && c.cfg;
  if (!compares.some(scored)) return "no result";
  if (incomparable(base, cfg, treatment) !== null) return "not comparable";
  if (base.n < 2 || cfg.n < 2) return "screen only";
  const better = compares.some((c) => c.signal === "better");
  const worse = compares.some((c) => c.signal === "worse");
  return better && worse ? "mixed" : better ? "better" : worse ? "worse" : "no difference";
}

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

export const measuredOf = (root: string, rec: RunRecord | undefined): Measured[] =>
  (rec?.results ?? []).map((ref) => loadMeasured(root, ref, rec!.wall_seconds, rec!.repeat)).filter((x): x is Measured => x !== null);

/** Why a run's summary is no result: the run was cut short, with its reason. Null for a run that was not, or that wrote nothing. */
export const cutShort = (root: string, rec: RunRecord | undefined): string | null => rec?.results.map((ref) => abortedReason(root, ref)).find((x) => x != null) ?? null;

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
      const cut = cutShort(root, state.screen[config.name]);
      skipped.push({ config, reason: cut ? `no screen result, the run was cut short: ${cut}` : "no screen result" });
      continue;
    }
    const moved = c.flatMap((cm) => {
      const bm = b.find((x) => x.scope === cm.scope);
      return bm ? screenDiffers(config.eval, bm, cm, opts.minDelta) : [];
    });
    if (moved.length) selected.push({ config, reason: `screen differs: ${[...new Set(moved)].join(", ")}` });
    else skipped.push({ config, reason: b.length === 0 ? "no baseline screen result" : "screen result matches the baseline" });
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
