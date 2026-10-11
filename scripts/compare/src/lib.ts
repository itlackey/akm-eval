// The compare tool's logic, without the command line: reading results folders, the per-case verdict of each eval, the paired comparison of
// two runs, or of two sets of repeats pooled by case (flips, a sign test, a paired bootstrap on each eval's metrics), the flip rate of the
// repeats of one run, and the reports. What two runs may differ in is the policy of policy.ts. See ../README.md.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { EVALS, EVAL_METRICS, type Dir, type MetricSpec, type Signal } from "../../matrix/src/lib.ts";
import { AXES, type Axis, type PolicyResult, checkMembers, identityOf, incompleteClause, incompleteOf, messages } from "./policy.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const EPS = 1e-9;

/** A refusal or a bad input, with a message for the person at the command line. */
export class CompareError extends Error {}
const fail = (message: string): never => {
  throw new CompareError(message);
};

type Row = Record<string, any>;
const isObject = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x);
const at = (x: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (isObject(o) ? o[k] : undefined), x);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const round = (x: number | null, digits = 4): number | null => (x === null ? null : Number(x.toFixed(digits)));

// ---- the per-case reading of each eval ------------------------------------------------------------------------------------

/** One case of a run, as one eval's verdict reads it. */
export interface Unit {
  id: string;
  /** 1 when the run got the case right, 0 when not. For retrieval, the query's ndcg@10. Null when the run gave the case no verdict (an error). */
  score: number | null;
  /** What the run did with the case, in a few words. */
  state: string;
  /** The class of the case: its relation, kind or set. */
  group: string;
  /** The case ended in what the eval guards against, such as an unsafe retirement or a saved instruction. Always false when the eval has none per case. */
  harm: boolean;
  row: Row;
}

/** A metric of EVAL_METRICS, computed from the units that have a verdict, the way the eval's own `metrics()` computes it. */
export interface Metric {
  path: string;
  of: (units: Unit[]) => number | null;
}

/** The cases of a run as one table. Most evals have one; retrieval has one for each of akm's commands and indexes (search, curate, ...). */
export interface View {
  name: string;
  /** A verdict of 1 or 0, rather than a score. */
  binary: boolean;
  /** The eval has a per-case harm. */
  hasHarm: boolean;
  units: Unit[];
  metrics: Metric[];
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : n / of);
const verdict = (right: boolean): number => (right ? 1 : 0);
/** The share of the units whose row passes `hit`, among those whose row passes `of`. */
const share = (hit: (r: Row) => boolean, of: (r: Row) => boolean = () => true) => (units: Unit[]): number | null => {
  const pool = units.filter((u) => of(u.row));
  return ratio(pool.filter((u) => hit(u.row)).length, pool.length);
};
/** How many of the units' rows pass `hit`. */
const tally = (hit: (r: Row) => boolean) => (units: Unit[]): number => units.filter((u) => hit(u.row)).length;

function unit(r: Row, score: number | null, state: string, group: unknown, harm = false): Unit {
  return { id: r.id, score, state, group: String(group ?? ""), harm, row: r };
}

// reflect and extract rows hold only the class; which classes make up each metric is the eval's. A test compares these lists with the evals'.
export const REFLECT_DEFECTS = ["description-period", "description-quote", "description-truncated", "description-missing", "when-to-use-missing", "title-missing"];
export const EXTRACT_INSIGHT_CLASSES = ["insight", "preference", "buried"];

type Adapter = (rows: Row[], summary: Row) => View[];

const oneView = (units: Unit[], metrics: Metric[], hasHarm = true): View[] => [{ name: "", binary: true, hasHarm, units, metrics }];

const nightly: Adapter = (rows) =>
  oneView(
    rows.map((r) => unit(r, verdict(r.ok === true), r.error ? "error" : String(r.state ?? ""), r.kind, r.harm === true)),
    [
      { path: "items.rate", of: share((r) => r.ok === true) },
      { path: "harm.items", of: tally((r) => r.harm === true) },
    ],
  );

const consolidate: Adapter = (rows) => {
  const retired = (r: Row) => r.outcome === "retire";
  const unsafe = (r: Row) => retired(r) && r.safe === false;
  return oneView(
    rows.map((r) => {
      if (r.outcome === "error") return unit(r, null, "error", r.relation);
      const hasSafeSide = Array.isArray(r.safe_sides) && r.safe_sides.length > 0;
      const state = retired(r) ? `retired ${r.retired} (${r.safe ? "safe" : "UNSAFE"})` : String(r.outcome);
      return unit(r, verdict(hasSafeSide ? retired(r) && r.safe === true : r.outcome === "keep"), state, r.relation, unsafe(r));
    }),
    [
      { path: "recall.value", of: share((r) => retired(r) && r.safe === true, (r) => Array.isArray(r.safe_sides) && r.safe_sides.length > 0) },
      { path: "precision.value", of: share((r) => r.safe === true, retired) },
      { path: "unsafe.n", of: tally(unsafe) },
    ],
  );
};

/** consolidate --pool: a row is a cluster of the pool, with the retirements akm proposed in it. */
const consolidatePool: Adapter = (rows, summary) => {
  if (summary.metrics == null || (num(summary.n_errored) ?? 0) > 0) fail(`the pool run errored${typeof summary.error === "string" ? `: ${summary.error}` : ""}, so it has no result to compare`);
  const retirements = (r: Row): Row[] => (Array.isArray(r.retirements) ? r.retirements : []);
  const hasRetirable = (r: Row) => Array.isArray(r.may_retire) && r.may_retire.length > 0;
  const count = (units: Unit[], verdictName: string) => units.reduce((sum, u) => sum + retirements(u.row).filter((x) => x.verdict === verdictName).length, 0);
  return oneView(
    rows.map((r) => unit(r, verdict(r.outcome === (hasRetirable(r) ? "safe" : "kept")), String(r.outcome), r.kind, retirements(r).some((x) => x.verdict === "unsafe"))),
    [
      { path: "recall.value", of: share((r) => retirements(r).some((x) => x.verdict === "safe"), hasRetirable) },
      { path: "precision.value", of: (units) => ratio(count(units, "safe"), units.reduce((sum, u) => sum + retirements(u.row).length, 0)) },
      { path: "unsafe.n", of: (units) => count(units, "unsafe") },
    ],
  );
};

const distill: Adapter = (rows) =>
  oneView(
    rows.map((r) => (r.verdict === "error" ? unit(r, null, "error", r.class) : unit(r, verdict(r.verdict === "good" || r.verdict === "right"), `${r.verdict} (${r.outcome})`, r.class, r.verdict === "wrong"))),
    [
      { path: "good_lessons.rate", of: share((r) => r.verdict === "good", (r) => r.expect === "lesson") },
      { path: "lesson_updates.rate", of: share((r) => r.verdict === "right", (r) => r.expect === "update") },
      { path: "wrong_lessons.rate", of: share((r) => r.verdict === "wrong", (r) => r.expect === "none") },
    ],
  );

const reflect: Adapter = (rows) => {
  const defect = (r: Row) => REFLECT_DEFECTS.includes(r.class);
  const touchedBody = (r: Row) => r.outcome === "proposal" && r.checks?.body_kept === false;
  return oneView(
    rows.map((r) => (r.outcome === "error" ? unit(r, null, "error", r.class) : unit(r, verdict(r.correct === true), `${r.outcome}${r.correct === true ? "" : ", wrong"}`, r.class, (!defect(r) && r.correct === false) || touchedBody(r)))),
    [
      { path: "defects.rate", of: share((r) => r.correct === true, defect) },
      { path: "controls.rate", of: share((r) => r.correct === true, (r) => !defect(r)) },
      { path: "proposals.touched_body", of: tally(touchedBody) },
    ],
  );
};

const promotion: Adapter = (rows) => {
  const accepted = (r: Row) => r.outcome === "accept";
  const good = (r: Row) => r.label === "good";
  return oneView(
    rows.map((r) => (r.outcome === "error" ? unit(r, null, "error", r.category) : unit(r, verdict(good(r) ? accepted(r) : !accepted(r)), String(r.outcome), r.category, !good(r) && accepted(r)))),
    [
      { path: "precision.value", of: share(good, accepted) },
      { path: "recall.value", of: share(accepted, good) },
      { path: "bad_accepted.value", of: share(accepted, (r) => !good(r)) },
    ],
  );
};

const judgeGate: Adapter = (rows) => {
  const passed = (r: Row) => r.outcome === "pass";
  const good = (r: Row) => r.label === "good";
  const bad = (severity: string) => (r: Row) => !good(r) && r.severity === severity;
  return oneView(
    rows.map((r) => (r.outcome === "error" ? unit(r, null, "error", r.set) : unit(r, verdict(good(r) ? passed(r) : !passed(r)), String(r.outcome), r.set, !good(r) && passed(r)))),
    [
      { path: "precision.value", of: share(good, passed) },
      { path: "good.rate", of: share(passed, good) },
      { path: "bad_harmful.rate", of: share(passed, bad("harmful")) },
      { path: "bad_churn.rate", of: share(passed, bad("churn")) },
    ],
  );
};

const extract: Adapter = (rows) => {
  const saidPlanted = (r: Row) => r.class === "planted" && Array.isArray(r.forbidden) && r.forbidden.length > 0;
  return oneView(
    rows.map((r) => (r.outcome === "error" || r.correct === null ? unit(r, null, "error", r.class) : unit(r, verdict(r.correct === true), `${r.outcome}${r.correct === true ? "" : ", wrong"}`, r.class, (r.class === "routine" && r.correct === false) || saidPlanted(r)))),
    [
      { path: "insights.rate", of: share((r) => r.correct === true, (r) => EXTRACT_INSIGHT_CLASSES.includes(r.class)) },
      { path: "routine.rate", of: share((r) => r.correct === true, (r) => r.class === "routine") },
      { path: "planted.saved_instruction", of: tally(saidPlanted) },
    ],
  );
};

const RETRIEVAL_COLUMNS = ["search", "curate", "semantic_search", "semantic_curate"];

/** A query's ndcg@10 in one column. Only the queries with a relevant asset have a ranking metric; of those, one whose call errored has no score. */
const retrieval: Adapter = (rows) =>
  RETRIEVAL_COLUMNS.filter((col) => rows.some((r) => isObject(r[col]))).map((col) => {
    const units = rows.filter((r) => (num(r.n_relevant) ?? 0) > 0).map((r) => {
      const ndcg = num(r[col]?.scores?.ndcg_10);
      return unit(r, ndcg, ndcg === null ? "no score" : `ndcg ${ndcg.toFixed(3)}`, r.kind);
    });
    const mean = (us: Unit[]): number | null => (us.length === 0 ? null : us.reduce((s, u) => s + (u.score as number), 0) / us.length);
    return { name: col, binary: false, hasHarm: false, units, metrics: [{ path: `${col}.ndcg_10`, of: mean }] };
  });

/** The eval names compare can read, with how a summary picks the reading (consolidate --pool is another set of rows). */
const ADAPTERS: Record<string, Adapter> = { nightly, consolidate, "consolidate-pool": consolidatePool, distill, reflect, promotion, "judge-gate": judgeGate, extract, retrieval };
export const SUPPORTED = ["nightly", "consolidate", "distill", "reflect", "promotion", "judge-gate", "extract", "retrieval"];

// ---- reading a results folder ---------------------------------------------------------------------------------------------

export interface Run {
  /** The folder, from the repository root when it is inside it. */
  dir: string;
  summary: Row;
  rows: Row[];
}

const shown = (abs: string): string => {
  const rel = relative(ROOT, abs);
  return rel === "" || rel.startsWith("..") ? abs : rel;
};

function readRows(file: string): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (!line.trim()) return;
      let row: unknown;
      try {
        row = JSON.parse(line);
      } catch {
        return fail(`${shown(file)}:${i + 1} is not valid JSON`);
      }
      if (!isObject(row) || typeof row.id !== "string" || row.id === "") return fail(`${shown(file)}:${i + 1} has no string "id"`);
      if (seen.has(row.id)) return fail(`${shown(file)} lists the case ${row.id} twice`);
      seen.add(row.id);
      rows.push(row);
    });
  return rows;
}

/** A results folder (or its summary.json): its summary and the rows of its samples.jsonl. Refuses a folder that is still being written. */
export function loadRun(path: string): Run {
  let dir = resolve(path);
  if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return fail(`${path} is not a results folder`);
  const name = shown(dir);
  if (existsSync(join(dir, ".running"))) fail(`${name} is still being written: it holds a .running file. Wait for the run, or delete the file if the run died.`);
  const summaryFile = join(dir, "summary.json");
  if (!existsSync(summaryFile)) return fail(`${name} has no summary.json: the run did not finish`);
  let summary: unknown;
  try {
    summary = JSON.parse(readFileSync(summaryFile, "utf8"));
  } catch {
    return fail(`${name}/summary.json is not valid JSON`);
  }
  if (!isObject(summary) || typeof summary.eval !== "string") return fail(`${name}/summary.json is not an eval summary (it has no "eval")`);
  const samples = join(dir, "samples.jsonl");
  if (!existsSync(samples)) return fail(`${name} has no samples.jsonl`);
  return { dir: name, summary, rows: readRows(samples) };
}

/** The adapter's key for a run: consolidate --pool has its own rows. */
const adapterKey = (s: Row): string => (s.eval === "consolidate" && s.mode === "pool" ? "consolidate-pool" : String(s.eval));

export function viewsOf(run: Run): View[] {
  const make = ADAPTERS[adapterKey(run.summary)];
  if (!make || !(run.summary.eval in EVAL_METRICS)) return fail(`${run.dir} is a run of ${run.summary.eval}, which compare has no per-case reading for. It reads ${SUPPORTED.join(", ")}.`);
  try {
    return make(run.rows, run.summary);
  } catch (e) {
    if (e instanceof CompareError) return fail(`${run.dir}: ${e.message}`);
    throw e;
  }
}

export interface RunInfo {
  dir: string;
  label: string | null;
  date: string | null;
  model: string | null;
  akm_version: string | null;
  akm_build: string | null;
  akm_bin: string | null;
  strategy: string | null;
  /** The SHA-256 of the config patch, null for none. */
  config_patch: string | null;
  timeout_ms: number | null;
  limit: number | null;
  git_commit: string | null;
  /** The digest of the eval's code and of the cases, for the summaries that record them. */
  harness_sha256: string | null;
  assets_sha256: string | null;
  status: string | null;
  n_cases: number;
  n_errored: number | null;
}

const str = (x: unknown): string | null => (typeof x === "string" ? x : null);

export function infoOf(run: Run): RunInfo {
  const s = run.summary;
  return {
    dir: run.dir,
    label: str(s.label),
    date: str(s.date),
    model: str(s.model),
    akm_version: str(s.akm_version),
    akm_build: str(s.akm_build),
    akm_bin: str(s.akm_bin),
    strategy: str(s.strategy),
    config_patch: str(s.config_patch?.sha256),
    timeout_ms: num(s.timeout_ms),
    limit: num(s.limit),
    git_commit: str(s.git_commit),
    harness_sha256: str(s.harness_sha256),
    assets_sha256: str(s.assets_sha256),
    status: str(s.status),
    n_cases: run.rows.length,
    n_errored: num(s.n_errored),
  };
}

// ---- the policy ---------------------------------------------------------------------------------------------------------------

/**
 * The axes B may differ from A on when none is declared: the config and the model, the settings of one build. It is what compare did before
 * it had a --treatment: a different strategy, config patch or model is what is being compared, and a different akm build is not, so it
 * needs `--treatment build`.
 */
export const DEFAULT_TREATMENT: Axis[] = ["config", "model"];

/** A folder's name, which tells the runs of a side apart. */
const nameOf = (run: Run): string => basename(run.dir);
const byDir = (x: Run, y: Run): number => (x.dir < y.dir ? -1 : x.dir > y.dir ? 1 : 0);

/**
 * The policy over the runs of both sides (see policy.ts): each axis that is not the treatment must be the same in every run of both, and
 * an axis whose evidence a run lacks is a gap. `a` and `b` are the runs of each side; a single run is a side of one.
 */
export function policyOf(a: Run[], b: Run[], treatment: Axis[] = DEFAULT_TREATMENT): PolicyResult {
  const members = (side: string, runs: Run[]) => [...runs].sort(byDir).map((r) => ({ side, name: nameOf(r), identity: identityOf(r.summary) }));
  const unrecorded = EVALS[String(a[0]?.summary.eval)]?.unrecorded ?? [];
  return checkMembers([...members("A", a), ...members("B", b)], treatment, unrecorded);
}

/**
 * What stands in the way of comparing the runs of A with those of B, case by case: the eval, corpus, collection and mode must be the same,
 * and so must every axis the treatment does not name (the akm, the config, the model, the cases, the eval's code), among the repeats of
 * a side as well as between the sides. A summary that does not record the evidence for an axis is not refused: see `exploratoryOf`.
 */
export function refusals(a: Run, b: Run, treatment: Axis[] = DEFAULT_TREATMENT): string[] {
  return refusalsOf([a], [b], treatment);
}

export function refusalsOf(a: Run[], b: Run[], treatment: Axis[] = DEFAULT_TREATMENT): string[] {
  const found = policyOf(a, b, treatment).mismatches;
  // Runs of two evals differ in a great deal else, which says nothing more.
  const kind = found.filter((f) => f.field === "eval");
  return messages(kind.length > 0 ? kind : found);
}

/** Everything that differs between two runs' settings. Which of these may is the treatment's: see `policyOf`. */
export function differences(a: RunInfo, b: RunInfo): { field: string; a: unknown; b: unknown }[] {
  return (["model", "akm_build", "akm_bin", "strategy", "config_patch", "timeout_ms", "limit", "git_commit"] as const)
    .filter((f) => a[f] !== b[f])
    .map((f) => ({ field: f, a: a[f], b: b[f] }));
}

/**
 * Why a comparison is exploratory, and so no conclusion: a run did not complete (it was cut short, its summary does not say it finished, it ran
 * fewer cases than the eval has, results are missing from it), or the policy lacks the evidence that the runs differ only in the treatment.
 */
export function exploratoryOf(sides: ReadonlyArray<readonly [string, Run[]]>, policy: PolicyResult): string[] {
  const out: string[] = [];
  for (const [side, runs] of sides) {
    for (const run of [...runs].sort(byDir)) {
      const inc = incompleteOf(run.summary);
      if (inc) out.push(`${runs.length === 1 && side.length === 1 ? side : `${side}'s run ${nameOf(run)}`} ${incompleteClause(inc)}`);
    }
  }
  return [...out, ...messages(policy.gaps)];
}

// ---- statistics -----------------------------------------------------------------------------------------------------------

/** A small seeded generator (mulberry32), so the same seed gives the same intervals on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `resamples` draws of n case indexes with replacement, one after the other. The same draws serve every metric of a view. */
export function resampleIndexes(n: number, resamples: number, seed: number): Uint32Array {
  const next = rng(seed);
  const out = new Uint32Array(n * resamples);
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(next() * n);
  return out;
}

/** The q quantile of sorted numbers, interpolated between the two nearest. */
export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const [lo, hi] = [Math.floor(pos), Math.ceil(pos)];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * The exact two-sided sign test on the cases that disagree: the chance of a split at least this uneven if each flip were as likely to go
 * one way as the other. Null when no case disagrees.
 */
export function signTest(better: number, worse: number): number | null {
  const n = better + worse;
  if (n === 0) return null;
  const k = Math.min(better, worse);
  let sum = 0;
  let logChoose = 0; // log of n choose i
  for (let i = 0; i <= k; i++) {
    if (i > 0) logChoose += Math.log(n - i + 1) - Math.log(i);
    sum += Math.exp(logChoose - n * Math.LN2);
  }
  return Math.min(1, 2 * sum);
}

export interface Estimate {
  a: number | null;
  b: number | null;
  delta: number | null;
  /** The 95% percentile interval of B minus A over the resamples. */
  lo: number | null;
  hi: number | null;
  /** Resamples where both runs had a value (a rate with nothing to divide has none). */
  used: number;
}

/**
 * B minus A on the paired cases, and its percentile interval over resamples of the cases, the same case drawn for both sides. Each side is
 * the runs of one configuration, `side[run][case]` (undefined where a run has no verdict for the case). The metric of a side is the mean,
 * over its runs, of the eval's metric on the runs' units of the drawn cases, so the case is the resampling unit and the order of the runs
 * changes nothing. A single run a side is the plain paired bootstrap.
 */
export function setBootstrap(a: (Unit | undefined)[][], b: (Unit | undefined)[][], of: Metric["of"], indexes: Uint32Array, resamples: number): Estimate {
  const n = a[0]?.length ?? 0;
  /** The mean over the runs of the metric on the cases `pick` draws; the values are added in order of size, so the sum does not depend on the order of the runs. */
  const pooled = (side: (Unit | undefined)[][], pick: (i: number) => number): number | null => {
    const values: number[] = [];
    for (const run of side) {
      const xs: Unit[] = [];
      for (let i = 0; i < n; i++) {
        const u = run[pick(i)];
        if (u !== undefined) xs.push(u);
      }
      const v = of(xs);
      if (v !== null) values.push(v);
    }
    values.sort((p, q) => p - q);
    return values.length === 0 ? null : values.reduce((s, x) => s + x, 0) / values.length;
  };
  const [a0, b0] = [pooled(a, (i) => i), pooled(b, (i) => i)];
  const out: Estimate = { a: a0, b: b0, delta: a0 === null || b0 === null ? null : b0 - a0, lo: null, hi: null, used: 0 };
  if (out.delta === null || n === 0) return out;
  const deltas: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const pick = (i: number) => indexes[r * n + i];
    const [sa, sb] = [pooled(a, pick), pooled(b, pick)];
    if (sa !== null && sb !== null) deltas.push(sb - sa);
  }
  out.used = deltas.length;
  if (deltas.length > 0) {
    deltas.sort((p, q) => p - q);
    out.lo = quantile(deltas, 0.025);
    out.hi = quantile(deltas, 0.975);
  }
  return out;
}

/** B minus A on the paired cases of two runs: `setBootstrap` of a run a side. */
export const pairedBootstrap = (a: Unit[], b: Unit[], of: Metric["of"], indexes: Uint32Array, resamples: number): Estimate => setBootstrap([a], [b], of, indexes, resamples);

/** Better when the interval lies wholly on the better side of zero, worse when wholly on the other, else the same. */
export function signalOf(dir: Dir, e: Pick<Estimate, "delta" | "lo" | "hi">): Signal {
  if (e.delta === null || e.lo === null || e.hi === null) return "n/a";
  if (e.lo > EPS) return dir === "up" ? "better" : "worse";
  if (e.hi < -EPS) return dir === "up" ? "worse" : "better";
  return "same";
}

// ---- comparing two runs ---------------------------------------------------------------------------------------------------

export interface Options {
  seed: number;
  resamples: number;
  /** For scores that are not 1 or 0 (retrieval's ndcg): a change this small or smaller is no change. */
  tie: number;
}
export const DEFAULTS: Options = { seed: 1, resamples: 2000, tie: 0.01 };

export interface Flip {
  id: string;
  group: string;
  a: string;
  b: string;
  /** B's score minus A's. */
  delta: number;
}

export interface MetricReport {
  path: string;
  role: MetricSpec["role"];
  dir: Dir;
  a: number | null;
  b: number | null;
  delta: number | null;
  ci: [number, number] | null;
  resamples_used: number;
  signal: Signal;
}

export interface GroupReport {
  group: string;
  n: number;
  agree: number;
  better: number;
  worse: number;
}

export interface ViewReport {
  /** "" for the eval's one table, else the column (retrieval). */
  view: string;
  binary: boolean;
  n_a: number;
  n_b: number;
  /** Cases both sides gave a verdict, in at least one run each. Everything below is over these. */
  n_paired: number;
  only_a: string[];
  only_b: string[];
  no_verdict: { a: string[]; b: string[] };
  agree: { n: number; sets: Record<string, string[]> };
  better: Flip[];
  worse: Flip[];
  sign_test: { better: number; worse: number; p: number | null };
  harm: { appeared: Flip[]; cleared: Flip[] } | null;
  by_group: GroupReport[];
  metrics: MetricReport[];
}

export interface PairReport {
  mode: "pair";
  eval: string;
  corpus: string | null;
  collection: string | null;
  pool: boolean;
  /** The first run of each side, by folder name. With one run a side, the runs. */
  a: RunInfo;
  b: RunInfo;
  /** Every run of each side: one for a plain comparison, the repeats of a configuration for a comparison of two sets. */
  a_runs: RunInfo[];
  b_runs: RunInfo[];
  /** The axes B may differ from A on (see policy.ts), and what differs on them. Every other axis was checked to be the same. */
  treatment: Axis[];
  treated: string[];
  /** The settings that differ: what B changed. */
  differences: { field: string; a: unknown; b: unknown }[];
  /** Why this comparison is no conclusion: a run did not complete, or the summaries lack the evidence that the axes outside the treatment match. Empty when it may be used for one. */
  exploratory: string[];
  options: Options;
  warnings: string[];
  views: ViewReport[];
  /** Metrics of EVAL_METRICS that are not a per-case quantity: from the summaries (the mean of the runs of a side), with no interval. */
  summary_only: { path: string; role: MetricSpec["role"]; dir: Dir; a: number | null; b: number | null }[];
}

const FEW = 10;

function mapOf(view: View, who: string): Map<string, Unit> {
  const m = new Map<string, Unit>();
  for (const u of view.units) {
    if (m.has(u.id)) fail(`${who} lists the case ${u.id} twice`);
    m.set(u.id, u);
  }
  return m;
}

const meanOf = (xs: number[]): number => [...xs].sort((p, q) => p - q).reduce((s, x) => s + x, 0) / xs.length;

/**
 * One table of A's runs against B's. A case's outcome on a side is its mean over the side's runs (those that gave it a verdict), so a case
 * that is right in two of three repeats scores 2/3, and the order of the runs changes nothing. With one run a side that is the run's verdict.
 */
function compareView(evalName: string, va: View[], vb: View[], opts: Options, namesA: string[], namesB: string[]): ViewReport {
  const [mapsA, mapsB] = [va.map((v, i) => mapOf(v, namesA[i])), vb.map((v, i) => mapOf(v, namesB[i]))];
  const [idsA, idsB] = [new Set(mapsA.flatMap((m) => [...m.keys()])), new Set(mapsB.flatMap((m) => [...m.keys()]))];
  // A case's place is its earliest row in any run of its side, so the lists read in the eval's order whatever order the runs are in.
  const placeIn = (views: View[]) => {
    const place = new Map<string, number>();
    for (const v of views) v.units.forEach((u, i) => place.set(u.id, Math.min(place.get(u.id) ?? Infinity, i)));
    return (x: string, y: string) => (place.get(x) as number) - (place.get(y) as number) || (x < y ? -1 : 1);
  };
  const [byA, byB] = [placeIn(va), placeIn(vb)];
  const onlyA = [...idsA].filter((id) => !idsB.has(id)).sort(byA);
  const onlyB = [...idsB].filter((id) => !idsA.has(id)).sort(byB);
  const both = [...idsA].filter((id) => idsB.has(id)).sort(byA);
  const scores = (maps: Map<string, Unit>[], id: string): number[] => maps.flatMap((m) => (m.get(id)?.score != null ? [m.get(id)!.score as number] : []));
  const noVerdict = { a: both.filter((id) => scores(mapsA, id).length === 0), b: both.filter((id) => scores(mapsB, id).length === 0) };
  const paired = both.filter((id) => scores(mapsA, id).length > 0 && scores(mapsB, id).length > 0);
  if (paired.length === 0) fail(`the two runs have no case in common that both gave a verdict${va[0].name ? ` (${va[0].name})` : ""}: A has ${idsA.size} cases, B has ${idsB.size}, ${both.length} are in both`);

  const binary = va[0].binary;
  const unitOf = (maps: Map<string, Unit>[], id: string): Unit => maps.find((m) => m.has(id))!.get(id)!;
  /** What a side did with a case: the run's own words, or for several runs how often it was right. */
  const stateOf = (maps: Map<string, Unit>[], id: string): string => {
    const xs = scores(maps, id);
    if (maps.length === 1) return unitOf(maps, id).state;
    return binary ? `${xs.filter((x) => x === 1).length}/${xs.length} right` : `ndcg ${meanOf(xs).toFixed(3)} (mean of ${xs.length})`;
  };
  const harmOf = (maps: Map<string, Unit>[], id: string): number => {
    const us = maps.flatMap((m) => (m.get(id)?.score != null ? [m.get(id)!] : []));
    return us.filter((u) => u.harm).length / us.length;
  };
  const flip = (id: string, d: number): Flip => ({ id, group: unitOf(mapsA, id).group, a: stateOf(mapsA, id), b: stateOf(mapsB, id), delta: round(d, 4) as number });
  const agree: ViewReport["agree"] = { n: 0, sets: binary ? { "right in both": [], "wrong in both": [] } : { unchanged: [] } };
  const better: Flip[] = [];
  const worse: Flip[] = [];
  const appeared: Flip[] = [];
  const cleared: Flip[] = [];
  const groups = new Map<string, GroupReport>();
  for (const id of paired) {
    const [x, y] = [meanOf(scores(mapsA, id)), meanOf(scores(mapsB, id))];
    const d = y - x;
    const group = unitOf(mapsA, id).group;
    const g = groups.get(group) ?? { group, n: 0, agree: 0, better: 0, worse: 0 };
    groups.set(group, g);
    g.n++;
    if (Math.abs(d) <= (binary ? EPS : opts.tie)) {
      agree.n++;
      g.agree++;
      const set = !binary ? "unchanged" : x > 1 - EPS ? "right in both" : x < EPS ? "wrong in both" : "same rate in both";
      (agree.sets[set] ??= []).push(id);
    } else if (d > 0) {
      better.push(flip(id, d));
      g.better++;
    } else {
      worse.push(flip(id, d));
      g.worse++;
    }
    const [ha, hb] = [harmOf(mapsA, id), harmOf(mapsB, id)];
    if (hb > ha + EPS) appeared.push(flip(id, d));
    if (ha > hb + EPS) cleared.push(flip(id, d));
  }
  const bySize = (x: Flip, y: Flip) => Math.abs(y.delta) - Math.abs(x.delta) || (x.id < y.id ? -1 : 1);
  if (!binary) {
    better.sort(bySize);
    worse.sort(bySize);
  }

  const indexes = resampleIndexes(paired.length, opts.resamples, opts.seed);
  const side = (maps: Map<string, Unit>[]) => maps.map((m) => paired.map((id) => (m.get(id)?.score != null ? m.get(id) : undefined)));
  const [ua, ub] = [side(mapsA), side(mapsB)];
  const metrics: MetricReport[] = [];
  for (const spec of EVAL_METRICS[evalName]) {
    const [metricA, metricB] = [va[0].metrics.find((m) => m.path === spec.path), vb[0].metrics.find((m) => m.path === spec.path)];
    if (!metricA || !metricB) continue;
    const e = setBootstrap(ua, ub, metricA.of, indexes, opts.resamples);
    metrics.push({ path: spec.path, role: spec.role, dir: spec.dir, a: round(e.a), b: round(e.b), delta: round(e.delta), ci: e.lo === null || e.hi === null ? null : [round(e.lo) as number, round(e.hi) as number], resamples_used: e.used, signal: signalOf(spec.dir, e) });
  }
  return {
    view: va[0].name,
    binary,
    n_a: idsA.size,
    n_b: idsB.size,
    n_paired: paired.length,
    only_a: onlyA,
    only_b: onlyB,
    no_verdict: noVerdict,
    agree,
    better,
    worse,
    sign_test: { better: better.length, worse: worse.length, p: round(signTest(better.length, worse.length), 6) },
    harm: va[0].hasHarm ? { appeared, cleared } : null,
    by_group: [...groups.values()].sort((x, y) => (x.group < y.group ? -1 : 1)),
    metrics,
  };
}

export interface CompareOptions extends Partial<Options> {
  /** The axes B may differ from A on. Default: the config and the model (see DEFAULT_TREATMENT). */
  treatment?: Axis[];
}

/**
 * Compares two runs of an eval case by case. Refuses runs that are not of the same eval, corpus and collection, or that differ on an axis the
 * treatment does not name (policy.ts); a run that did not complete, or that lacks evidence for an axis, makes the report exploratory.
 * Compares the cases both ran, one table at a time.
 */
export function comparePair(a: Run, b: Run, options: CompareOptions = {}): PairReport {
  return compareSets([a], [b], options);
}

/**
 * Compares the repeats of one configuration with those of another, case by case. Each case's outcome on a side is its mean over the side's
 * runs, a metric is the mean of the eval's metric over the runs, and the bootstrap draws cases: so the report is the same whatever order
 * the runs are given in. Every run of both sides is checked against the policy, not the first of each: the runs of a side must be
 * repeats of one configuration, and the sides differ only on the treatment.
 */
export function compareSets(runsA: Run[], runsB: Run[], options: CompareOptions = {}): PairReport {
  const { treatment = DEFAULT_TREATMENT, ...rest } = options;
  const opts = { ...DEFAULTS, ...rest };
  if (runsA.length === 0 || runsB.length === 0) fail("each side needs a run");
  const [a, b] = [[...runsA].sort(byDir), [...runsB].sort(byDir)];
  const shared = a.find((x) => b.some((y) => x.dir === y.dir));
  if (shared) fail(a.length === 1 && b.length === 1 ? "A and B are the same folder" : `A and B share the folder ${shared.dir}`);
  const policy = policyOf(a, b, treatment);
  const problems = refusalsOf(a, b, treatment);
  // A difference in an axis can be the treatment; one in the eval, the corpus or the collection is another set of cases and cannot.
  const hint = policy.mismatches.every((f) => f.axis !== "scope") ? ` If a difference is what you are measuring, name its axis with --treatment (${AXES.join(", ")}).` : "";
  if (problems.length > 0) fail(`${a.length === 1 && b.length === 1 ? "these two runs cannot" : "these runs cannot"} be compared case by case: ${problems.join("; ")}.${hint}`);
  const evalName = String(a[0].summary.eval);
  const [allA, allB] = [a.map(viewsOf), b.map(viewsOf)];
  const warnings: string[] = [];
  const views: ViewReport[] = [];
  const present = (all: View[][], name: string): View[] | null => {
    const found = all.map((vs) => vs.find((v) => v.name === name));
    return found.every((v) => v !== undefined) ? (found as View[]) : null;
  };
  for (const x of allA[0]) {
    const [sa, sb] = [present(allA, x.name), present(allB, x.name)];
    if (!sa || !sb) {
      warnings.push(`${x.name} is not in every run of ${sa ? "B" : "A"}, so it is not compared`);
      continue;
    }
    views.push(compareView(evalName, sa, sb, opts, a.map((r) => r.dir), b.map((r) => r.dir)));
  }
  for (const y of allB[0]) if (!allA[0].some((x) => x.name === y.name)) warnings.push(`${y.name} is in B and not in A, so it is not compared`);
  if (views.length === 0) fail("the two runs have no table of cases in common");
  for (const v of views) {
    const name = v.view ? ` (${v.view})` : "";
    if (v.n_paired < FEW) warnings.push(`only ${v.n_paired} cases${name} were scored in both runs: an interval over so few is crude`);
    if (v.only_a.length > 0 || v.only_b.length > 0) warnings.push(`${plural(v.only_a.length, "case")}${name} ${v.only_a.length === 1 ? "is" : "are"} only in A and ${v.only_b.length} only in B (a different --limit?): they are left out`);
    if (v.no_verdict.a.length > 0 || v.no_verdict.b.length > 0) warnings.push(`${plural(v.no_verdict.a.length, "case")}${name} ${v.no_verdict.a.length === 1 ? "has" : "have"} no verdict in A and ${v.no_verdict.b.length} in B (errors): they are left out`);
  }
  const [infosA, infosB] = [a.map(infoOf), b.map(infoOf)];
  const [ia, ib] = [infosA[0], infosB[0]];
  const diff = differences(ia, ib);
  if (policy.treated.length === 0 && !diff.some((d) => ["model", "akm_build", "akm_bin", "strategy", "config_patch", "timeout_ms"].includes(d.field))) warnings.push("A and B have the same model, akm, strategy and config patch, so this shows the noise between two runs, not a change");

  const computed = new Set(views.flatMap((v) => v.metrics.map((m) => m.path)));
  const known = new Set([...allA.flat(), ...allB.flat()].flatMap((v) => v.metrics.map((m) => m.path)));
  const pooled = (runs: Run[], path: string): number | null => {
    const xs = runs.map((r) => num(at(r.summary.metrics, path))).filter((x): x is number => x !== null);
    return xs.length === 0 ? null : meanOf(xs);
  };
  const summaryOnly = EVAL_METRICS[evalName]
    .filter((spec) => !computed.has(spec.path) && !known.has(spec.path))
    .map((spec) => ({ path: spec.path, role: spec.role, dir: spec.dir, a: pooled(a, spec.path), b: pooled(b, spec.path) }))
    .filter((m) => m.a !== null || m.b !== null);
  return {
    mode: "pair",
    eval: evalName,
    corpus: str(a[0].summary.corpus),
    collection: str(a[0].summary.collection),
    pool: a[0].summary.mode === "pool",
    a: ia,
    b: ib,
    a_runs: infosA,
    b_runs: infosB,
    treatment,
    treated: messages(policy.treated),
    differences: diff,
    exploratory: exploratoryOf([["A", a], ["B", b]], policy),
    options: opts,
    warnings,
    views,
    summary_only: summaryOnly,
  };
}

// ---- the repeats of one run ------------------------------------------------------------------------------------------------

/**
 * The folders of the runs of a `--repeat`: `<prefix>-r1`, `-r2` and so on (retrieval adds `-<collection>`), or the runs a
 * repeat-summary.json lists. A prefix that matches the runs of more than one collection needs `collection`.
 */
export function findRepeats(prefix: string, collection?: string): string[] {
  const abs = resolve(prefix);
  if (abs.endsWith(".json") && existsSync(abs) && statSync(abs).isFile()) {
    let listed: unknown;
    try {
      listed = JSON.parse(readFileSync(abs, "utf8")).runs;
    } catch {
      return fail(`${prefix} is not valid JSON`);
    }
    if (!Array.isArray(listed) || listed.length === 0 || listed.some((r) => typeof r !== "string")) return fail(`${prefix} lists no runs`);
    return listed.map((r: string) => join(dirname(abs), r));
  }
  const [parent, base] = [dirname(abs), basename(abs)];
  if (!existsSync(parent)) return fail(`${shown(parent)} does not exist`);
  const found = readdirSync(parent)
    .map((name) => ({ name, m: /^-r(\d+)(?:-.+)?$/.exec(name.slice(base.length)) }))
    .filter((x) => x.name.startsWith(base) && x.m && existsSync(join(parent, x.name, "summary.json")))
    .map((x) => ({ dir: join(parent, x.name), r: Number((x.m as RegExpExecArray)[1]), collection: collectionOf(join(parent, x.name)) }));
  const collections = [...new Set(found.map((f) => f.collection))].sort();
  if (found.length === 0) return fail(`no folder ${shown(abs)}-r1, ${shown(abs)}-r2 and so on holds a summary.json`);
  if (collection === undefined && collections.length > 1) return fail(`${shown(abs)} matches the runs of ${collections.length} collections (${collections.join(", ")}): name one with --collection`);
  const mine = found.filter((f) => collection === undefined || f.collection === collection);
  if (mine.length === 0) return fail(`no run of the collection ${collection} under ${shown(abs)}; there are ${collections.join(", ")}`);
  const dup = mine.find((f, i) => mine.findIndex((g) => g.r === f.r) !== i);
  if (dup) return fail(`two folders are run r${dup.r} of ${shown(abs)}: ${mine.filter((f) => f.r === dup.r).map((f) => shown(f.dir)).join(" and ")}. Name the one you mean with a longer prefix.`);
  return mine.sort((x, y) => x.r - y.r).map((f) => f.dir);
}

function collectionOf(dir: string): string {
  try {
    const c = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")).collection;
    return typeof c === "string" ? c : "";
  } catch {
    return "";
  }
}

export interface CaseRate {
  id: string;
  group: string;
  /** The score in each run, null where the run gave no verdict. */
  scores: (number | null)[];
  /** The share of the pairs of runs, among those with a verdict, in which the case's verdict differs. */
  flip_rate: number;
}

export interface SpreadReport {
  path: string;
  role: MetricSpec["role"];
  dir: Dir;
  values: (number | null)[];
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
  /** The mean absolute difference between two runs of the metric: how far two runs of one configuration typically differ. */
  pairwise_spread: number | null;
}

export interface RepeatsViewReport {
  view: string;
  binary: boolean;
  n_cases: number;
  /** Cases with a verdict in at least two runs. The rates are over these. */
  n_compared: number;
  n_unstable: number;
  /** The mean per-case flip rate, and with it how many cases change verdict between two runs of the same configuration, on average. */
  noise_floor: { flip_rate: number | null; expected_flips: number | null };
  cases: CaseRate[];
  by_group: { group: string; n: number; unstable: number; flip_rate: number }[];
  metrics: SpreadReport[];
  /** The largest pairwise spread of a main metric: a change smaller than this is within what two runs of one configuration show. */
  min_delta_hint: number | null;
}

export interface RepeatsReport {
  mode: "repeats";
  eval: string;
  corpus: string | null;
  collection: string | null;
  pool: boolean;
  runs: RunInfo[];
  options: { tie: number };
  /** Why the runs are no conclusion: one did not complete, or the summaries lack the evidence that every axis is the same in all of them. Empty when they may be used for one. */
  exploratory: string[];
  warnings: string[];
  views: RepeatsViewReport[];
}

const differs = (p: number, q: number, binary: boolean, tie: number): boolean => Math.abs(p - q) > (binary ? EPS : tie);

function spreadOf(values: (number | null)[]): Omit<SpreadReport, "path" | "role" | "dir"> {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length === 0) return { values, mean: null, sd: null, min: null, max: null, pairwise_spread: null };
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = xs.length < 2 ? null : Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1));
  let [pairs, total] = [0, 0];
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) [pairs, total] = [pairs + 1, total + Math.abs(xs[i] - xs[j])];
  return { values: values.map((v) => round(v)), mean: round(mean), sd: round(sd), min: round(Math.min(...xs)), max: round(Math.max(...xs)), pairwise_spread: pairs === 0 ? null : round(total / pairs) };
}

/**
 * Per-case flip rate across runs of one configuration, and with it the noise floor of the eval on this corpus. Repeats have no treatment:
 * every axis of policy.ts (the akm, the config, the model, the cases, the eval's code) must be the same in every run, and a run is refused
 * that differs from the others in any of them, whichever order they come in.
 */
export function compareRepeats(runs: Run[], options: Partial<Options> = {}): RepeatsReport {
  const opts = { ...DEFAULTS, ...options };
  if (runs.length < 2) fail("repeats need at least two runs");
  const first = runs[0];
  const policy = checkMembers([...runs].sort(byDir).map((r) => ({ side: "the runs", name: nameOf(r), identity: identityOf(r.summary) })), [], EVALS[String(first.summary.eval)]?.unrecorded ?? []);
  if (policy.mismatches.length > 0) fail(`these runs are not repeats of one configuration: ${messages(policy.mismatches).join("; ")}.`);
  const infos = runs.map(infoOf);
  const evalName = String(first.summary.eval);
  const allViews = runs.map(viewsOf);
  const warnings: string[] = [];
  const views: RepeatsViewReport[] = [];
  for (const base of allViews[0]) {
    const perRun = allViews.map((vs) => vs.find((v) => v.name === base.name));
    if (perRun.some((v) => v === undefined)) {
      warnings.push(`${base.name} is not in every run, so it is left out`);
      continue;
    }
    const mine = perRun as View[];
    const maps = mine.map((v, i) => mapOf(v, runs[i].dir));
    const ids = [...new Set(maps.flatMap((m) => [...m.keys()]))];
    const cases: CaseRate[] = [];
    for (const id of ids) {
      const scores = maps.map((m) => m.get(id)?.score ?? null);
      const have = scores.filter((s): s is number => s !== null);
      if (have.length < 2) continue;
      let [pairs, flips] = [0, 0];
      for (let i = 0; i < have.length; i++) {
        for (let j = i + 1; j < have.length; j++) {
          pairs++;
          if (differs(have[i], have[j], base.binary, opts.tie)) flips++;
        }
      }
      cases.push({ id, group: maps.find((m) => m.has(id))!.get(id)!.group, scores: scores.map((s) => round(s)), flip_rate: round(flips / pairs, 4) as number });
    }
    cases.sort((x, y) => y.flip_rate - x.flip_rate || (x.id < y.id ? -1 : 1));
    const total = cases.reduce((s, c) => s + c.flip_rate, 0);
    const groups = new Map<string, { group: string; n: number; unstable: number; sum: number }>();
    for (const c of cases) {
      const g = groups.get(c.group) ?? { group: c.group, n: 0, unstable: 0, sum: 0 };
      groups.set(c.group, g);
      g.n++;
      g.sum += c.flip_rate;
      if (c.flip_rate > 0) g.unstable++;
    }
    const metrics: SpreadReport[] = [];
    for (const spec of EVAL_METRICS[evalName]) {
      if (!base.metrics.some((m) => m.path === spec.path)) continue;
      const values = mine.map((v) => v.metrics.find((m) => m.path === spec.path)!.of(v.units.filter((u) => u.score !== null)));
      metrics.push({ path: spec.path, role: spec.role, dir: spec.dir, ...spreadOf(values) });
    }
    const main = metrics.filter((m) => m.role === "main" && m.pairwise_spread !== null).map((m) => m.pairwise_spread as number);
    views.push({
      view: base.name,
      binary: base.binary,
      n_cases: ids.length,
      n_compared: cases.length,
      n_unstable: cases.filter((c) => c.flip_rate > 0).length,
      noise_floor: { flip_rate: cases.length === 0 ? null : round(total / cases.length), expected_flips: cases.length === 0 ? null : round(total, 2) },
      cases,
      by_group: [...groups.values()].sort((x, y) => (x.group < y.group ? -1 : 1)).map((g) => ({ group: g.group, n: g.n, unstable: g.unstable, flip_rate: round(g.sum / g.n) as number })),
      metrics,
      min_delta_hint: main.length === 0 ? null : Math.max(...main),
    });
  }
  if (views.length === 0) fail("the runs have no table of cases in common");
  for (const v of views) if (v.n_compared === 0) fail(`no case has a verdict in two of the runs${v.view ? ` (${v.view})` : ""}`);
  return { mode: "repeats", eval: evalName, corpus: str(first.summary.corpus), collection: str(first.summary.collection), pool: first.summary.mode === "pool", runs: infos, options: { tie: opts.tie }, exploratory: exploratoryOf([["the runs", runs]], policy), warnings, views };
}

// ---- the reports -------------------------------------------------------------------------------------------------------------

const MAX_LISTED = 40;
const trim = (x: number): string => String(Number(x.toFixed(3)));
const fmt = (x: number | null): string => (x === null ? "–" : trim(x));
const signed = (x: number | null): string => (x === null ? "–" : `${x > 0 ? "+" : ""}${trim(x)}`);
const fmtP = (p: number | null): string => (p === null ? "n/a (no case disagrees)" : p < 0.001 ? "< 0.001" : p.toFixed(3));
const ARROW: Record<Dir, string> = { up: "↑", down: "↓" };
const SIGNAL: Record<Signal, string> = { better: "**better**", worse: "**worse**", same: "no difference", "n/a": "–" };
function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function listFlips(flips: Flip[], binary: boolean): string[] {
  const shownFlips = flips.slice(0, MAX_LISTED);
  const lines = shownFlips.map((f) => `- \`${f.id}\`${f.group ? ` (${f.group})` : ""}: ${f.a} → ${f.b}${binary ? "" : ` (${signed(f.delta)})`}`);
  if (flips.length > shownFlips.length) lines.push(`- … and ${flips.length - shownFlips.length} more, in the JSON`);
  return lines;
}

function listIds(ids: string[]): string {
  const shownIds = ids.slice(0, MAX_LISTED).map((id) => `\`${id}\``).join(", ");
  return ids.length > MAX_LISTED ? `${shownIds}, … and ${ids.length - MAX_LISTED} more, in the JSON` : shownIds;
}

const runTable = (infos: RunInfo[], heads: string[]): string[] => {
  const rows: [string, (i: RunInfo) => string][] = [
    ["folder", (i) => `\`${i.dir}\``],
    ["label", (i) => i.label ?? "–"],
    ["date", (i) => i.date ?? "–"],
    ["model", (i) => i.model ?? "–"],
    ["akm", (i) => `${i.akm_version ?? "–"}${i.akm_build ? ` build ${i.akm_build}` : ""}`],
    ["strategy", (i) => i.strategy ?? "–"],
    ["config patch", (i) => (i.config_patch ? i.config_patch.slice(0, 12) : "–")],
    ["cases", (i) => `${i.n_cases}${i.n_errored ? ` (${i.n_errored} errored)` : ""}`],
  ];
  return [`| | ${heads.join(" | ")} |`, `|---|${heads.map(() => "---").join("|")}|`, ...rows.map(([name, f]) => `| ${name} | ${infos.map((i) => f(i).replace(/\|/g, "\\|")).join(" | ")} |`)];
};

const where = (r: { eval: string; corpus: string | null; collection: string | null; pool: boolean }): string => `${r.eval}${r.pool ? " --pool" : ""} (${[r.corpus, r.collection && r.collection !== r.corpus ? r.collection : null].filter(Boolean).join(" ")})`;

/** The banner of a report that is no conclusion. */
function exploratoryBanner(reasons: string[]): string[] {
  if (reasons.length === 0) return [];
  return [`> **Exploratory.** This is not a conclusion, and an automated decision must not use it: ${reasons.join("; ")}.`, ""];
}

export function renderPair(r: PairReport): string {
  const sets = r.a_runs.length > 1 || r.b_runs.length > 1;
  const heads = sets ? [...r.a_runs.map((_, i) => `A r${i + 1}`), ...r.b_runs.map((_, i) => `B r${i + 1}`)] : ["A", "B"];
  const out = [`# Compare ${where(r)}: A and B`, "", ...exploratoryBanner(r.exploratory), ...runTable(sets ? [...r.a_runs, ...r.b_runs] : [r.a, r.b], heads), ""];
  out.push(r.differences.length === 0 ? "A and B have the same settings." : `B differs from A in ${r.differences.map((d) => `${d.field} (${d.a ?? "none"} → ${d.b ?? "none"})`).join(", ")}.`, "");
  out.push(`Treatment: ${r.treatment.join(", ")}. Nothing else may differ between A and B${sets ? ", or among the repeats of one side" : ""}.${r.treated.length > 0 ? ` They differ in: ${r.treated.join("; ")}.` : ""}`, "");
  for (const w of r.warnings) out.push(`> ${w}`);
  if (r.warnings.length > 0) out.push("");
  out.push(`Everything is B against A, over the cases both sides gave a verdict. The interval is a paired bootstrap over those cases (${r.options.resamples} resamples, seed ${r.options.seed}, 95%): the same cases are drawn for A and B.${sets ? " A case is scored by its mean over the repeats of a side, and a metric is the mean of the eval's metric over them, so the order of the repeats does not matter." : ""} ↑ higher is better, ↓ lower is better. A harm metric is one that must not rise; the Harm section lists the cases where it did.${r.views.some((v) => !v.binary) ? ` A score counts as changed when it moves by more than ${r.options.tie}.` : ""}`, "");
  for (const v of r.views) {
    const name = v.view ? v.view : "cases";
    out.push(`## ${name}`, "");
    out.push(`${plural(v.n_paired, "case")} in both runs: **${v.agree.n} agree**, **${v.better.length} flipped to better**, **${v.worse.length} flipped to worse**. Sign test on the ${plural(v.better.length + v.worse.length, "case")} that ${v.better.length + v.worse.length === 1 ? "disagrees" : "disagree"} (two-sided, exact): p = ${fmtP(v.sign_test.p)}.`, "");
    if (v.metrics.length > 0) {
      out.push("| metric | A | B | B − A | 95% interval | |", "|---|---|---|---|---|---|");
      for (const m of v.metrics) out.push(`| ${m.path} ${ARROW[m.dir]}${m.role === "harm" ? " (harm)" : ""} | ${fmt(m.a)} | ${fmt(m.b)} | ${signed(m.delta)} | ${m.ci ? `${signed(m.ci[0])} to ${signed(m.ci[1])}` : "–"} | ${SIGNAL[m.signal]} |`);
      out.push("");
    }
    if (v.better.length > 0) out.push("### Flipped to better", "", ...listFlips(v.better, v.binary), "");
    if (v.worse.length > 0) out.push("### Flipped to worse", "", ...listFlips(v.worse, v.binary), "");
    if (v.harm && (v.harm.appeared.length > 0 || v.harm.cleared.length > 0)) {
      out.push("### Harm", "");
      if (v.harm.appeared.length > 0) out.push(`Appeared in B (${v.harm.appeared.length}):`, "", ...listFlips(v.harm.appeared, true), "");
      if (v.harm.cleared.length > 0) out.push(`Gone in B (${v.harm.cleared.length}):`, "", ...listFlips(v.harm.cleared, true), "");
    }
    const same = Object.entries(v.agree.sets);
    out.push("### Agree", "");
    for (const [label, ids] of same) out.push(`- ${label}: ${ids.length}${label === "wrong in both" && ids.length > 0 ? `: ${listIds(ids)}` : ""}`);
    out.push("");
    if (v.by_group.length > 1) {
      out.push("### By class", "", "| class | cases | agree | better | worse |", "|---|---|---|---|---|");
      for (const g of v.by_group) out.push(`| ${g.group || "–"} | ${g.n} | ${g.agree} | ${g.better} | ${g.worse} |`);
      out.push("");
    }
  }
  if (r.summary_only.length > 0) {
    out.push("## Metrics that are not per case", "", "From the two summaries, with no interval.", "", "| metric | A | B |", "|---|---|---|");
    for (const m of r.summary_only) out.push(`| ${m.path} ${ARROW[m.dir]}${m.role === "harm" ? " (harm)" : ""} | ${fmt(m.a)} | ${fmt(m.b)} |`);
    out.push("");
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function renderRepeats(r: RepeatsReport): string {
  const out = [`# Repeats of ${where(r)}: ${r.runs.length} runs`, "", ...exploratoryBanner(r.exploratory), ...runTable(r.runs, r.runs.map((_, i) => `r${i + 1}`)), ""];
  for (const w of r.warnings) out.push(`> ${w}`);
  if (r.warnings.length > 0) out.push("");
  out.push(`A case flips between two runs when its verdict differs${r.views.some((v) => !v.binary) ? ` (a score moving by more than ${r.options.tie}, for ndcg)` : ""}. A case's flip rate is the share of the pairs of runs in which it does. The noise floor is the mean flip rate over the cases: with it, about that share of the cases changes verdict between two runs of the same configuration with nothing changed.`, "");
  for (const v of r.views) {
    out.push(`## ${v.view ? v.view : "cases"}`, "");
    const nf = v.noise_floor;
    out.push(nf.flip_rate === null ? "No case has a verdict in two runs." : `Noise floor: **mean flip rate ${fmt(nf.flip_rate)}**, so about **${fmt(nf.expected_flips)} of ${v.n_compared}** cases flip between two runs of one configuration. ${v.n_unstable} of ${v.n_compared} cases are not the same in every run.`, "");
    if (v.metrics.length > 0) {
      out.push(`| metric | ${r.runs.map((_, i) => `r${i + 1}`).join(" | ")} | mean | sd | typical change between two runs |`, `|---|${r.runs.map(() => "---").join("|")}|---|---|---|`);
      for (const m of v.metrics) out.push(`| ${m.path} ${ARROW[m.dir]}${m.role === "harm" ? " (harm)" : ""} | ${m.values.map(fmt).join(" | ")} | ${fmt(m.mean)} | ${fmt(m.sd)} | ${fmt(m.pairwise_spread)} |`);
      out.push("");
    }
    if (v.min_delta_hint === 0) out.push("The main metrics were the same in every run, so these runs give no floor for `--min-delta`.", "");
    else if (v.min_delta_hint !== null) out.push(`A main metric that moves by less than **${fmt(v.min_delta_hint)}** is within what two runs of one configuration show: a floor for \`--min-delta\`. It comes from ${plural((r.runs.length * (r.runs.length - 1)) / 2, "pair")} of runs, so repeat more for a firmer one.`, "");
    const unstable = v.cases.filter((c) => c.flip_rate > 0);
    if (unstable.length > 0) {
      out.push("### Unstable cases", "", `| case | class | ${r.runs.map((_, i) => `r${i + 1}`).join(" | ")} | flip rate |`, `|---|---|${r.runs.map(() => "---").join("|")}|---|`);
      for (const c of unstable.slice(0, MAX_LISTED)) out.push(`| \`${c.id}\` | ${c.group || "–"} | ${c.scores.map((s) => (s === null ? "–" : v.binary ? (s === 1 ? "right" : "wrong") : trim(s))).join(" | ")} | ${fmt(c.flip_rate)} |`);
      if (unstable.length > MAX_LISTED) out.push(`| … and ${unstable.length - MAX_LISTED} more, in the JSON | | ${r.runs.map(() => "").join(" | ")} | |`);
      out.push("");
    }
    if (v.by_group.length > 1) {
      out.push("### By class", "", "| class | cases | unstable | mean flip rate |", "|---|---|---|---|");
      for (const g of v.by_group) out.push(`| ${g.group || "–"} | ${g.n} | ${g.unstable} | ${fmt(g.flip_rate)} |`);
      out.push("");
    }
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}
