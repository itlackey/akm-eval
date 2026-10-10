// The matrix runner's logic, without the process spawning: the matrix file, the table of each eval's metrics, which runs a stage
// makes, how a result is found, the verdict, and the report. See ../../../README.md ("Run a matrix").

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
};

export const NAME_RE = /^[A-Za-z0-9._-]+$/;
const EPS = 1e-9;

// ---- the matrix file ----------------------------------------------------------------------------------------------------

export interface Row {
  name: string;
  eval: string;
  /** The eval's own flags, with a relative --config-patch resolved from the matrix file's folder. */
  args: string[];
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
  const name = x.name === undefined ? defaultName : x.name;
  if (typeof name !== "string" || !NAME_RE.test(name)) throw new Error(`${what}: name must use letters, digits, dot, dash and underscore`);
  if (typeof x.eval !== "string" || !(x.eval in EVAL_METRICS)) throw new Error(`${what} (${name}): eval must be one of ${Object.keys(EVAL_METRICS).join(", ")}`);
  const args = x.args ?? [];
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string")) throw new Error(`${what} (${name}): args must be a list of strings`);
  for (const f of ["--label", "--repeat"]) if (hasFlag(args as string[], f)) throw new Error(`${what} (${name}): leave out ${f}, the runner sets it`);
  if (flagValue(args as string[], "--corpus") === "all") throw new Error(`${what} (${name}): --corpus all pools corpora; list one row per corpus`);
  return { name, eval: x.eval, args: resolvePatch(args as string[], dir) };
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
  if (m.akm && !hasFlag(args, "--akm")) args.unshift("--akm", m.akm);
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

const readJson = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** The folders an eval may write its results to for a corpus. */
export function resultsParents(root: string, evalName: string, args: string[]): string[] {
  const corpus = flagValue(args, "--corpus") ?? "public";
  if (corpus === "public") return [join(root, "evals", evalName, "results")];
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

/** `root` is the repository root; `ref.file` is from it. `wallSeconds` is the runner's own timing of the whole command. */
export function loadMeasured(root: string, ref: ResultRef, wallSeconds: number, repeat: number | null): Measured | null {
  const file = join(root, ref.file);
  const s = readJson(file);
  if (!s) return null;
  if (ref.kind === "run") {
    return { scope: ref.scope, n: 1, model: s.model ?? null, akm_build: s.akm_build ?? null, akm_version: s.akm_version ?? null, n_errored: num(s.n_errored), calls: callsOf(s), seconds: wallSeconds, metrics: s.metrics, repeated: false };
  }
  const runs = (Array.isArray(s.runs) ? s.runs : []).map((r: string) => readJson(join(dirname(file), r, "summary.json")));
  return { scope: ref.scope, n: repeat ?? runs.length, model: s.model ?? null, akm_build: s.akm_build ?? null, akm_version: s.akm_version ?? null, n_errored: num(at(s, "n_errored.mean")), calls: mean(runs.map(callsOf)), seconds: num(at(s, "seconds.mean")), metrics: s.metrics, repeated: true };
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

export function verdictOf(compares: MetricCompare[], base: Measured, cfg: Measured): Verdict {
  const scored = (c: MetricCompare) => c.role === "main" && c.base && c.cfg;
  if (!compares.some(scored)) return "no result";
  if (base.model !== cfg.model || base.akm_build !== cfg.akm_build || base.akm_version !== cfg.akm_version) return "not comparable";
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

const measuredOf = (root: string, rec: RunRecord | undefined): Measured[] =>
  (rec?.results ?? []).map((ref) => loadMeasured(root, ref, rec!.wall_seconds, rec!.repeat)).filter((x): x is Measured => x !== null);

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
      skipped.push({ config, reason: "no screen result" });
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

// ---- the report ------------------------------------------------------------------------------------------------------------

export interface DecisionRow {
  eval: string;
  scope: string;
  config: string;
  baseline: string;
  /** "confirm" when both ran the repeats, else "screen". */
  stage: Stage;
  n: number;
  verdict: Verdict;
  note: string;
  metrics: { path: string; role: "main" | "harm"; dir: Dir; signal: Signal; baseline: Spread | null; config: Spread | null }[];
  calls: { baseline: number | null; config: number | null };
  seconds: { baseline: number | null; config: number | null };
  n_errored: { baseline: number | null; config: number | null };
  akm_build: string | null;
  model: string | null;
}

export interface Decision {
  matrix: string;
  prefix: string;
  generated: string;
  min_delta: number;
  rows: DecisionRow[];
}

/** One row per config (and per scope, for an eval with more than one), from the confirm results where both sides have them, else the screen. */
export function buildDecision(root: string, m: Matrix, state: State, minDelta: number, now = new Date()): Decision {
  const rows: DecisionRow[] = [];
  for (const config of m.configs) {
    const base = baselineFor(m, config);
    const pick = (stage: Stage) => [measuredOf(root, state[stage][base.name]), measuredOf(root, state[stage][config.name])] as const;
    const [bc, cc] = pick("confirm");
    const useConfirm = bc.length > 0 && cc.length > 0;
    const stage: Stage = useConfirm ? "confirm" : "screen";
    const [bs, cs] = useConfirm ? [bc, cc] : pick("screen");
    const confirmRec = state.confirm[config.name];
    if (cs.length === 0) {
      const rec = state[stage][config.name] ?? state.screen[config.name];
      rows.push({ eval: config.eval, scope: "", config: config.name, baseline: base.name, stage, n: 0, verdict: "no result", note: rec ? `the run wrote no summary (exit ${rec.exit_code}), see ${rec.log}` : "not run", metrics: [], calls: { baseline: null, config: null }, seconds: { baseline: null, config: null }, n_errored: { baseline: null, config: null }, akm_build: null, model: null });
      continue;
    }
    for (const cm of cs) {
      const bm = bs.find((x) => x.scope === cm.scope);
      if (!bm) {
        rows.push({ eval: config.eval, scope: cm.scope, config: config.name, baseline: base.name, stage, n: cm.n, verdict: "no result", note: "the baseline has no result for this scope", metrics: [], calls: { baseline: null, config: cm.calls }, seconds: { baseline: null, config: cm.seconds }, n_errored: { baseline: null, config: cm.n_errored }, akm_build: cm.akm_build, model: cm.model });
        continue;
      }
      const compares = compareAll(config.eval, bm, cm);
      const verdict = verdictOf(compares, bm, cm);
      const notes: string[] = [];
      if (verdict === "not comparable") notes.push(`baseline ran ${bm.model} on ${bm.akm_build ?? bm.akm_version}, config ${cm.model} on ${cm.akm_build ?? cm.akm_version}`);
      if (verdict === "screen only" && !confirmRec) {
        const moved = screenDiffers(config.eval, bm, cm, minDelta);
        notes.push(moved.length ? `screen differs: ${moved.join(", ")}` : "screen matches the baseline");
      }
      if ((cm.n_errored ?? 0) > (bm.n_errored ?? 0)) notes.push(`more errored cases (${cm.n_errored} vs ${bm.n_errored ?? 0})`);
      rows.push({
        eval: config.eval,
        scope: cm.scope,
        config: config.name,
        baseline: base.name,
        stage,
        n: Math.min(bm.n, cm.n),
        verdict,
        note: notes.join("; "),
        metrics: compares.map((c) => ({ path: c.path, role: c.role, dir: c.dir, signal: c.signal, baseline: c.base, config: c.cfg })),
        calls: { baseline: bm.calls, config: cm.calls },
        seconds: { baseline: bm.seconds, config: cm.seconds },
        n_errored: { baseline: bm.n_errored, config: cm.n_errored },
        akm_build: cm.akm_build,
        model: cm.model,
      });
    }
  }
  return { matrix: m.file, prefix: m.prefix, generated: now.toISOString(), min_delta: minDelta, rows };
}

const trim = (x: number): string => String(Number(x.toFixed(3)));
const fmtSpread = (s: Spread | null): string => (s === null ? "–" : s.min === s.max ? trim(s.mean) : `${trim(s.mean)} (${trim(s.min)}–${trim(s.max)})`);
const fmtNum = (x: number | null): string => (x === null ? "–" : trim(x));
const ARROW: Record<Dir, string> = { up: "↑", down: "↓" };

export function renderMarkdown(d: Decision): string {
  const out = [`# Matrix decision: ${d.prefix}`, "", `Matrix \`${basename(d.matrix)}\`, generated ${d.generated}. A cell reads baseline → config, as mean (min–max over the repeats). ↑ higher is better, ↓ lower is better; harm must not rise. Verdicts apply the plan's rule: ranges that do not overlap, harm not up; n=1 is "screen only".`, ""];
  const groups = new Map<string, DecisionRow[]>();
  for (const r of d.rows) groups.set(`${r.eval}${r.scope ? ` (${r.scope})` : ""} vs ${r.baseline}`, [...(groups.get(`${r.eval}${r.scope ? ` (${r.scope})` : ""} vs ${r.baseline}`) ?? []), r]);
  for (const [title, rows] of groups) {
    out.push(`## ${title}`, "", "| config | runs | main metric | harm | calls | seconds | akm build | model | verdict |", "|---|---|---|---|---|---|---|---|---|");
    for (const r of rows) {
      const cell = (role: "main" | "harm") =>
        r.metrics
          .filter((x) => x.role === role && (x.baseline || x.config))
          .map((x) => `${x.path} ${ARROW[x.dir]} ${fmtSpread(x.baseline)} → ${fmtSpread(x.config)}`)
          .join("<br>") || "–";
      const pair = (p: { baseline: number | null; config: number | null }) => `${fmtNum(p.baseline)} → ${fmtNum(p.config)}`;
      out.push(`| ${r.config} | ${r.n} | ${cell("main")} | ${cell("harm")} | ${pair(r.calls)} | ${pair(r.seconds)} | ${r.akm_build ?? "release"} | ${r.model ?? "–"} | **${r.verdict}**${r.note ? `<br>${r.note}` : ""} |`);
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}
