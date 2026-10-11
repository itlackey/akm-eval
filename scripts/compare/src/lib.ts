// The compare tool's logic, without the command line: reading results folders, the per-case verdict of each eval, the paired comparison of
// two runs (flips, a sign test, a paired bootstrap on each eval's metrics), the flip rate of the repeats of one run, and the reports.
// See ../README.md.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { EVAL_METRICS, type Dir, type MetricSpec, type Signal } from "../../matrix/src/lib.ts";

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
  return oneView(
    rows.map((r) => (r.outcome === "error" ? unit(r, null, "error", r.set) : unit(r, verdict(good(r) ? passed(r) : !passed(r)), String(r.outcome), r.set, !good(r) && passed(r)))),
    [
      { path: "precision.value", of: share(good, passed) },
      { path: "good.rate", of: share(passed, good) },
      { path: "bad.rate", of: share(passed, (r) => !good(r)) },
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
    n_cases: run.rows.length,
    n_errored: num(s.n_errored),
  };
}

/** What the two runs' summaries say about their cases and how they were made. A different akm build is the treatment, so it is not a reason to refuse. */
export function refusals(a: Run, b: Run): string[] {
  const out: string[] = [];
  const [x, y] = [a.summary, b.summary];
  const same = (what: string, p: unknown, q: unknown) => {
    if ((p ?? null) !== (q ?? null)) out.push(`${what} differs: ${p ?? "none"} in A, ${q ?? "none"} in B`);
  };
  same("the eval", x.eval, y.eval);
  if (x.eval === y.eval) {
    same("the corpus", x.corpus, y.corpus);
    same("the collection", x.collection, y.collection);
    same("the mode (consolidate --pool is another set of cases)", x.mode, y.mode);
    same("the akm version", x.akm_version, y.akm_version);
    // Summaries that record what the cases were made from (the hash of the assets, the private seed) say when two runs had other cases.
    if (typeof x.assets_sha256 === "string" && typeof y.assets_sha256 === "string") same("the hash of the assets", x.assets_sha256, y.assets_sha256);
    if (x.seed != null && y.seed != null) same("the seed of the private assets", x.seed, y.seed);
  }
  return out;
}

/** Everything that differs between two runs' settings, which is the treatment being compared. */
export function differences(a: RunInfo, b: RunInfo): { field: string; a: unknown; b: unknown }[] {
  return (["model", "akm_build", "akm_bin", "strategy", "config_patch", "timeout_ms", "limit", "git_commit"] as const)
    .filter((f) => a[f] !== b[f])
    .map((f) => ({ field: f, a: a[f], b: b[f] }));
}

/** Notes on a run that may make its numbers mean less than they look. */
function runWarnings(run: Run, who: string): string[] {
  const s = run.summary;
  const out: string[] = [];
  if (s.status === "aborted") out.push(`${who} was cut short${typeof s.aborted_reason === "string" ? `: ${s.aborted_reason}` : ""}`);
  else if (num(s.n_run) !== null && num(s.n_cases) !== null && (s.n_run as number) < (s.n_cases as number) && s.limit == null) out.push(`${who} ran ${s.n_run} of ${s.n_cases} cases`);
  return out;
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

/** B minus A on the paired cases, and its percentile interval over resamples of the cases, the same case drawn for both runs. */
export function pairedBootstrap(a: Unit[], b: Unit[], of: Metric["of"], indexes: Uint32Array, resamples: number): Estimate {
  const n = a.length;
  const [a0, b0] = [of(a), of(b)];
  const out: Estimate = { a: a0, b: b0, delta: a0 === null || b0 === null ? null : b0 - a0, lo: null, hi: null, used: 0 };
  if (out.delta === null || n === 0) return out;
  const [xa, xb] = [new Array<Unit>(n), new Array<Unit>(n)];
  const deltas: number[] = [];
  for (let r = 0; r < resamples; r++) {
    for (let i = 0; i < n; i++) {
      const k = indexes[r * n + i];
      xa[i] = a[k];
      xb[i] = b[k];
    }
    const [sa, sb] = [of(xa), of(xb)];
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
  /** Cases both runs gave a verdict. Everything below is over these. */
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
  a: RunInfo;
  b: RunInfo;
  /** The settings that differ: what B changed. */
  differences: { field: string; a: unknown; b: unknown }[];
  options: Options;
  warnings: string[];
  views: ViewReport[];
  /** Metrics of EVAL_METRICS that are not a per-case quantity: from the two summaries, with no interval. */
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

function compareView(evalName: string, va: View, vb: View, opts: Options, names: [string, string]): ViewReport {
  const [ma, mb] = [mapOf(va, names[0]), mapOf(vb, names[1])];
  const onlyA = [...ma.keys()].filter((id) => !mb.has(id));
  const onlyB = [...mb.keys()].filter((id) => !ma.has(id));
  const both = [...ma.keys()].filter((id) => mb.has(id));
  const noVerdict = { a: both.filter((id) => ma.get(id)!.score === null), b: both.filter((id) => mb.get(id)!.score === null) };
  const paired = both.filter((id) => ma.get(id)!.score !== null && mb.get(id)!.score !== null);
  if (paired.length === 0) fail(`the two runs have no case in common that both gave a verdict${va.name ? ` (${va.name})` : ""}: A has ${ma.size} cases, B has ${mb.size}, ${both.length} are in both`);

  const ua = paired.map((id) => ma.get(id)!);
  const ub = paired.map((id) => mb.get(id)!);
  const flip = (p: Unit, q: Unit): Flip => ({ id: p.id, group: p.group, a: p.state, b: q.state, delta: round((q.score as number) - (p.score as number), 4) as number });
  const agree: ViewReport["agree"] = { n: 0, sets: va.binary ? { "right in both": [], "wrong in both": [] } : { unchanged: [] } };
  const better: Flip[] = [];
  const worse: Flip[] = [];
  const appeared: Flip[] = [];
  const cleared: Flip[] = [];
  const groups = new Map<string, GroupReport>();
  paired.forEach((id, i) => {
    const [p, q] = [ua[i], ub[i]];
    const d = (q.score as number) - (p.score as number);
    const g = groups.get(p.group) ?? { group: p.group, n: 0, agree: 0, better: 0, worse: 0 };
    groups.set(p.group, g);
    g.n++;
    if (Math.abs(d) <= (va.binary ? EPS : opts.tie)) {
      agree.n++;
      g.agree++;
      agree.sets[va.binary ? ((p.score as number) === 1 ? "right in both" : "wrong in both") : "unchanged"].push(id);
    } else if (d > 0) {
      better.push(flip(p, q));
      g.better++;
    } else {
      worse.push(flip(p, q));
      g.worse++;
    }
    if (!p.harm && q.harm) appeared.push(flip(p, q));
    if (p.harm && !q.harm) cleared.push(flip(p, q));
  });
  const bySize = (x: Flip, y: Flip) => Math.abs(y.delta) - Math.abs(x.delta) || (x.id < y.id ? -1 : 1);
  if (!va.binary) {
    better.sort(bySize);
    worse.sort(bySize);
  }

  const indexes = resampleIndexes(paired.length, opts.resamples, opts.seed);
  const metrics: MetricReport[] = [];
  for (const spec of EVAL_METRICS[evalName]) {
    const [metricA, metricB] = [va.metrics.find((m) => m.path === spec.path), vb.metrics.find((m) => m.path === spec.path)];
    if (!metricA || !metricB) continue;
    const e = pairedBootstrap(ua, ub, metricA.of, indexes, opts.resamples);
    metrics.push({ path: spec.path, role: spec.role, dir: spec.dir, a: round(e.a), b: round(e.b), delta: round(e.delta), ci: e.lo === null || e.hi === null ? null : [round(e.lo) as number, round(e.hi) as number], resamples_used: e.used, signal: signalOf(spec.dir, e) });
  }
  return {
    view: va.name,
    binary: va.binary,
    n_a: ma.size,
    n_b: mb.size,
    n_paired: paired.length,
    only_a: onlyA,
    only_b: onlyB,
    no_verdict: noVerdict,
    agree,
    better,
    worse,
    sign_test: { better: better.length, worse: worse.length, p: round(signTest(better.length, worse.length), 6) },
    harm: va.hasHarm ? { appeared, cleared } : null,
    by_group: [...groups.values()].sort((x, y) => (x.group < y.group ? -1 : 1)),
    metrics,
  };
}

/** Refuses two runs that are not of the same eval, corpus and akm version. Compares the cases both ran, one table at a time. */
export function comparePair(a: Run, b: Run, options: Partial<Options> = {}): PairReport {
  const opts = { ...DEFAULTS, ...options };
  if (a.dir === b.dir) fail("A and B are the same folder");
  const problems = refusals(a, b);
  if (problems.length > 0) fail(`these two runs cannot be compared case by case: ${problems.join("; ")}.`);
  const evalName = String(a.summary.eval);
  const [va, vb] = [viewsOf(a), viewsOf(b)];
  const warnings = [...runWarnings(a, "A"), ...runWarnings(b, "B")];
  const views: ViewReport[] = [];
  for (const x of va) {
    const y = vb.find((v) => v.name === x.name);
    if (!y) {
      warnings.push(`${x.name} is in A and not in B, so it is not compared`);
      continue;
    }
    views.push(compareView(evalName, x, y, opts, [a.dir, b.dir]));
  }
  for (const y of vb) if (!va.some((x) => x.name === y.name)) warnings.push(`${y.name} is in B and not in A, so it is not compared`);
  if (views.length === 0) fail("the two runs have no table of cases in common");
  for (const v of views) {
    const name = v.view ? ` (${v.view})` : "";
    if (v.n_paired < FEW) warnings.push(`only ${v.n_paired} cases${name} were scored in both runs: an interval over so few is crude`);
    if (v.only_a.length > 0 || v.only_b.length > 0) warnings.push(`${plural(v.only_a.length, "case")}${name} ${v.only_a.length === 1 ? "is" : "are"} only in A and ${v.only_b.length} only in B (a different --limit?): they are left out`);
    if (v.no_verdict.a.length > 0 || v.no_verdict.b.length > 0) warnings.push(`${plural(v.no_verdict.a.length, "case")}${name} ${v.no_verdict.a.length === 1 ? "has" : "have"} no verdict in A and ${v.no_verdict.b.length} in B (errors): they are left out`);
  }
  const [ia, ib] = [infoOf(a), infoOf(b)];
  const diff = differences(ia, ib);
  if (!diff.some((d) => ["model", "akm_build", "akm_bin", "strategy", "config_patch", "timeout_ms"].includes(d.field))) warnings.push("A and B have the same model, akm, strategy and config patch, so this shows the noise between two runs, not a change");

  const computed = new Set(views.flatMap((v) => v.metrics.map((m) => m.path)));
  const known = new Set([...va, ...vb].flatMap((v) => v.metrics.map((m) => m.path)));
  const summaryOnly = EVAL_METRICS[evalName]
    .filter((spec) => !computed.has(spec.path) && !known.has(spec.path))
    .map((spec) => ({ path: spec.path, role: spec.role, dir: spec.dir, a: num(at(a.summary.metrics, spec.path)), b: num(at(b.summary.metrics, spec.path)) }))
    .filter((m) => m.a !== null || m.b !== null);
  return { mode: "pair", eval: evalName, corpus: str(a.summary.corpus), collection: str(a.summary.collection), pool: a.summary.mode === "pool", a: ia, b: ib, differences: diff, options: opts, warnings, views, summary_only: summaryOnly };
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

/** The settings runs must share to be repeats of one configuration. */
const SAME_FOR_REPEATS = ["model", "akm_build", "strategy", "config_patch", "limit", "timeout_ms"] as const;

/** Per-case flip rate across runs of one configuration, and with it the noise floor of the eval on this corpus. */
export function compareRepeats(runs: Run[], options: Partial<Options> = {}): RepeatsReport {
  const opts = { ...DEFAULTS, ...options };
  if (runs.length < 2) fail("repeats need at least two runs");
  const first = runs[0];
  for (const run of runs.slice(1)) {
    const problems = refusals(first, run);
    if (problems.length > 0) fail(`${first.dir} and ${run.dir} are not repeats of one run: ${problems.join("; ")}.`);
  }
  const infos = runs.map(infoOf);
  for (const f of SAME_FOR_REPEATS) {
    const bad = infos.findIndex((i) => i[f] !== infos[0][f]);
    if (bad > 0) fail(`${infos[0].dir} and ${infos[bad].dir} are not repeats of one configuration: ${f} is ${infos[0][f] ?? "none"} in one and ${infos[bad][f] ?? "none"} in the other.`);
  }
  const evalName = String(first.summary.eval);
  const allViews = runs.map(viewsOf);
  const warnings = runs.flatMap((r, i) => runWarnings(r, `run ${i + 1} (${r.dir})`));
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
  return { mode: "repeats", eval: evalName, corpus: str(first.summary.corpus), collection: str(first.summary.collection), pool: first.summary.mode === "pool", runs: infos, options: { tie: opts.tie }, warnings, views };
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

export function renderPair(r: PairReport): string {
  const out = [`# Compare ${where(r)}: A and B`, "", ...runTable([r.a, r.b], ["A", "B"]), ""];
  out.push(r.differences.length === 0 ? "A and B have the same settings." : `B differs from A in ${r.differences.map((d) => `${d.field} (${d.a ?? "none"} → ${d.b ?? "none"})`).join(", ")}.`, "");
  for (const w of r.warnings) out.push(`> ${w}`);
  if (r.warnings.length > 0) out.push("");
  out.push(`Everything is B against A, over the cases both runs gave a verdict. The interval is a paired bootstrap over those cases (${r.options.resamples} resamples, seed ${r.options.seed}, 95%): the same cases are drawn for A and B. ↑ higher is better, ↓ lower is better. A harm metric is one that must not rise; the Harm section lists the cases where it did.${r.views.some((v) => !v.binary) ? ` A score counts as changed when it moves by more than ${r.options.tie}.` : ""}`, "");
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
  const out = [`# Repeats of ${where(r)}: ${r.runs.length} runs`, "", ...runTable(r.runs, r.runs.map((_, i) => `r${i + 1}`)), ""];
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
