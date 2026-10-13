/** Compare recorded results. No collectors, model calls, rescoring or run scheduling. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { noManifest, readManifest, type RunManifest } from "../../../lib/manifest.ts";
import { canonical, redactConfig } from "../../../lib/provenance.ts";
import { comparisonFields, coreColumns, scoreColumns, type Cell } from "../../ledger/src/comparison.ts";
import { scores } from "../../ledger/src/presentation.ts";

export const SUPPORTED = ["nightly", "consolidate", "distill", "reflect", "promotion", "judge-gate", "extract", "retrieval", "agent-ab", "terminal-bench", "bakeoff", "longmemeval", "skillret"];
type Row = Record<string, any>;
export interface Run { dir: string; summary: Row; rows: Row[] }
export class CompareError extends Error {}
const object = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const ids = (values: string[]) => [...values].sort();

function manifest(run: Run): RunManifest {
  const read = readManifest(run.summary);
  if (read.kind === "legacy") throw new CompareError(noManifest(run.dir));
  if (read.kind === "invalid") throw new CompareError(`${run.dir}: invalid manifest: ${read.problems.join("; ")}`);
  if (!SUPPORTED.includes(read.manifest.eval)) throw new CompareError(`Unsupported eval: ${read.manifest.eval}`);
  if (run.summary.status !== "complete") throw new CompareError(`${run.dir}: run is not complete (${run.summary.status ?? "unknown status"})`);
  const seen = new Set<string>();
  for (const row of run.rows) {
    if (!object(row) || typeof row.id !== "string" || !row.id) throw new CompareError(`${run.dir}: a sample has no string id`);
    if (seen.has(row.id)) throw new CompareError(`${run.dir}: duplicate sample id ${row.id}`);
    if (!read.manifest.completion.selected.includes(row.id)) throw new CompareError(`${run.dir}: sample ${row.id} was not selected`);
    seen.add(row.id);
  }
  if (!equal(ids([...seen]), ids([...read.manifest.completion.scored, ...read.manifest.completion.errored])))
    throw new CompareError(`${run.dir}: samples disagree with manifest completion`);
  return read.manifest;
}

/** A completed results folder, or its summary.json. Does not modify its contents. */
export function loadRun(path: string): Run {
  let dir = resolve(path);
  if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
  if (existsSync(join(dir, ".running"))) throw new CompareError(`${dir} is still being written (.running exists)`);
  try {
    const summary: unknown = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    if (!object(summary)) throw new CompareError(`${dir}: summary is not an object`);
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").split(/\r?\n/).filter(line => line.trim()).map((line, i) => {
      try { return JSON.parse(line); } catch { throw new CompareError(`${dir}/samples.jsonl:${i + 1}: invalid JSON`); }
    });
    const run = { dir, summary, rows };
    manifest(run);
    return run;
  } catch (error) {
    if (error instanceof CompareError) throw error;
    throw new CompareError(`${dir}: cannot read saved results: ${(error as Error).message}`);
  }
}

export interface ComparisonRow { key: string; label: string; group: string; unit: string; a: Cell; b: Cell; delta: number | null; note: string }
export interface PairReport {
  eval: string; eval_version: string; scoring_version: string; corpus: string; collection: string | null; mode: string | null;
  a: { dir: string; label: string }; b: { dir: string; label: string };
  changes: { field: string; a: unknown; b: unknown }[];
  warnings: string[]; rows: ComparisonRow[];
}

/** Strict input identity, independent of the model or AKM settings being compared. */
export function compatible(a: Run, b: Run): [RunManifest, RunManifest] {
  const am = manifest(a), bm = manifest(b);
  for (const key of ["eval", "corpus", "collection", "mode", "harness_version"] as const)
    if (!equal(am[key], bm[key])) throw new CompareError(`${key} differs: ${am[key]} vs ${bm[key]}`);
  if (am.collector.version !== bm.collector.version) throw new CompareError(`eval version differs: ${am.collector.version} vs ${bm.collector.version}`);
  if ((am.scorer?.version ?? am.collector.version) !== (bm.scorer?.version ?? bm.collector.version))
    throw new CompareError("scoring version differs; explicitly rescore both runs if their inputs are unchanged");
  if (!equal(am.settings.seed, bm.settings.seed)) throw new CompareError("the seed of the private assets differs");
  if (!equal(ids(am.completion.selected), ids(bm.completion.selected))) throw new CompareError("selected cases differ; no cases are silently dropped");
  for (const id of am.completion.selected) {
    if (am.cases[id]!.input_sha256 !== bm.cases[id]!.input_sha256) throw new CompareError(`case input differs: ${id}`);
    if (am.cases[id]!.label_sha256 !== bm.cases[id]!.label_sha256) throw new CompareError(`case labels differ: ${id}; explicitly rescore both runs to the same labels`);
  }
  return [am, bm];
}

/** Include every stored scalar metric, including benchmark-native intervals. */
function flatten(value: unknown, path = "metrics", out: Record<string, Cell> = {}): Record<string, Cell> {
  if (value === null || typeof value === "string" || typeof value === "number" && Number.isFinite(value)) out[path] = value as Cell;
  else if (typeof value === "boolean") out[path] = String(value);
  else if (Array.isArray(value) || object(value)) for (const [key, child] of Object.entries(value)) flatten(child, `${path}.${key}`, out);
  return out;
}
function values(run: Run, m: RunManifest): Record<string, Cell> {
  return { ...comparisonFields(run.summary, run.rows, scores(run.summary)), ...flatten(run.summary.metrics),
    model: run.summary.model ?? null, label: run.summary.label ?? null, suite: m.eval,
    collection: m.collection, mode: m.mode, measurement: m.collector.version,
    akm_version: m.akm.version, recorded: run.rows.length, scored: m.completion.scored.length, errors: m.completion.errored.length,
    date: run.summary.date ?? null, source_commit: run.summary.git_commit ?? null, harness_sha256: run.summary.harness_sha256 ?? null,
  };
}

// Timing and token comparisons require the same observed cases/trials and workload settings.
function observations(run: Run): unknown {
  const numeric = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  return run.rows.map(row => ({ id: row.id, seconds: numeric(row.seconds),
    arms: ["search", "semantic_search", "without_akm", "with_akm"].map(k => numeric(row[k]?.seconds)),
    trials: Array.isArray(row.trials) ? row.trials.map((t: Row) => [t.arm, t.attempt ?? t.attemptIndex ?? null, numeric(t.seconds)]).sort() : null,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function comparePair(a: Run, b: Run): PairReport {
  const [am, bm] = compatible(a, b);
  const warnings: string[] = [];
  const coverage = equal(ids(am.completion.scored), ids(bm.completion.scored));
  const complete = [am, bm].every(m => m.completion.selected.length === m.completion.scored.length + m.completion.errored.length);
  const judge = equal([a.summary.judge_model ?? null, am.engines.judge ?? null], [b.summary.judge_model ?? null, bm.engines.judge ?? null]);
  const quality = coverage && complete && judge;
  if (!coverage || !complete) warnings.push("Scored coverage differs or is incomplete. Quality deltas are omitted; stored values are shown.");
  if (!judge) warnings.push("Answer judges differ. Quality deltas are omitted.");
  const timing = coverage && complete && equal(observations(a), observations(b)) &&
    ["workers", "attempts"].every(k => equal(a.summary[k] ?? null, b.summary[k] ?? null));
  if (!timing) warnings.push("Timing or workload coverage differs. Performance and usage deltas are omitted.");
  const av = values(a, am), bv = values(b, bm);
  const columns = [...coreColumns, ...scoreColumns([a, b].map(r => ({ scores: scores(r.summary) })))];
  const columnMap = new Map(columns.map(c => [c.key, c]));
  const rows: ComparisonRow[] = [];
  for (const key of new Set([...columns.map(c => c.key), ...Object.keys(av), ...Object.keys(bv)])) {
    const x = av[key] ?? null, y = bv[key] ?? null;
    if (x === null && y === null) continue;
    const col = columnMap.get(key), group = col?.group ?? "Stored metrics";
    const isQuality = group === "Quality" || group === "Test metrics" || group === "Stored metrics";
    const isTiming = group === "Performance" || group === "Usage";
    let note = isQuality && !quality ? "Unequal scoring coverage or judge" : isTiming && !timing ? "Unequal timing or workload coverage" : "";
    if (key === "run_wall_s" && (typeof a.summary.wall_seconds === "number") !== (typeof b.summary.wall_seconds === "number"))
      note = "Different wall-time measurements";
    // Counts remain useful even when a run has more errors. Rates require equal denominators.
    if (["recorded", "scored", "errors", "timeouts"].includes(key)) note = "";
    const scoreName = key.startsWith("score:") ? key.slice(6) : key === "quality_percent" ? av.quality_metric : null;
    if (scoreName) {
      const sa = scores(a.summary).find(s => s.label === scoreName), sb = scores(b.summary).find(s => s.label === scoreName);
      if (sa?.denominator !== sb?.denominator) note = "Unequal metric denominators";
    }
    // Raw metric fields retain their recorded units. Do not show a rate/interval
    // delta with a different recorded denominator in the same metric object.
    if (key.startsWith("metrics.")) {
      const parent = key.slice(0, key.lastIndexOf("."));
      for (const count of ["n", "of", "scored", "retired", "trials"])
        if (!equal(av[`${parent}.${count}`] ?? null, bv[`${parent}.${count}`] ?? null)) note = "Unequal metric denominators";
    }
    rows.push({ key, label: col?.label ?? key, group, unit: col?.unit ?? "", a: x, b: y,
      delta: !note && typeof x === "number" && typeof y === "number" ? y - x : null, note });
  }
  const settings = (r: Run, m: RunManifest) => ({ model: r.summary.model ?? null, akm: m.akm, config: m.config, settings: m.settings,
    engines: m.engines, benchmark_settings: m.treatment_hints, judge_model: r.summary.judge_model ?? null,
    workers: r.summary.workers ?? null, attempts: r.summary.attempts ?? null, search_mode: r.summary.search_mode ?? null });
  const as = settings(a, am), bs = settings(b, bm);
  const changes = Object.keys(as).filter(k => !equal(as[k as keyof typeof as], bs[k as keyof typeof bs]))
    .map(field => ({ field, a: redactConfig(as[field as keyof typeof as]), b: redactConfig(bs[field as keyof typeof bs]) }));
  if (changes.length > 1) warnings.push("Several settings changed; these differences do not isolate the effect of any one change.");
  return { eval: am.eval, eval_version: am.collector.version, scoring_version: am.scorer?.version ?? am.collector.version,
    corpus: am.corpus, collection: am.collection, mode: am.mode, a: { dir: a.dir, label: a.summary.label ?? a.dir },
    b: { dir: b.dir, label: b.summary.label ?? b.dir }, changes, warnings, rows };
}

const cell = (v: unknown): string => (v === null ? "—" : typeof v === "number" ? String(Number(v.toFixed(6))) : typeof v === "string" ? v : JSON.stringify(v)).replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
export function renderPair(report: PairReport): string {
  const lines = [`# ${report.eval} · eval ${report.eval_version} · scoring ${report.scoring_version}`, "",
    `A: ${cell(report.a.label)} (${cell(report.a.dir)})`, `B: ${cell(report.b.label)} (${cell(report.b.dir)})`, "",
    "Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.", "",
    ...report.warnings.map(w => `- ${w}`), "", "| Metric / setting | A | B | Delta (B − A) | Note |", "|---|---:|---:|---:|---|"];
  for (const row of report.rows) lines.push(`| ${cell(row.label)} | ${cell(row.a)} | ${cell(row.b)} | ${cell(row.delta)} | ${row.note} |`);
  if (report.changes.length) {
    lines.push("", "Changed settings:", "", "| Setting | A | B |", "|---|---|---|");
    for (const change of report.changes) lines.push(`| ${change.field} | ${cell(change.a)} | ${cell(change.b)} |`);
  }
  return `${lines.join("\n")}\n`;
}
