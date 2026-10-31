/** Compare recorded results. No collectors, model calls, rescoring or run scheduling. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonical, redactConfig } from "../../../lib/provenance.ts";
import { evalSettingsOf } from "../../../lib/manifest.ts";
import { comparisonFields, coreColumns, scoreColumns, type Cell } from "../../ledger/src/comparison.ts";
import { scores } from "../../ledger/src/presentation.ts";

export const SUPPORTED = ["nightly", "consolidate", "distill", "reflect", "promotion", "judge-gate", "extract", "retrieval", "agent-ab", "terminal-bench", "bakeoff", "longmemeval", "skillret", "memory-utility"];
type Row = Record<string, any>;
export interface Run { dir: string; summary: Row; rows: Row[]; samplesMissing?: boolean; running?: boolean }
export class CompareError extends Error {}
const object = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);

function validateRows(run: Run): void {
  const seen = new Set<string>();
  for (const row of run.rows) {
    if (!object(row) || typeof row.id !== "string" || !row.id) throw new CompareError(`${run.dir}: a sample has no string id`);
    if (seen.has(row.id)) throw new CompareError(`${run.dir}: duplicate sample id ${row.id}`);
    seen.add(row.id);
  }
}

/** A saved results folder, or its summary.json. Does not modify its contents. */
export function loadRun(path: string): Run {
  let dir = resolve(path);
  if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
  try {
    const summary: unknown = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    if (!object(summary)) throw new CompareError(`${dir}: summary is not an object`);
    const samplesMissing = !existsSync(join(dir, "samples.jsonl"));
    const rows = (samplesMissing ? "" : readFileSync(join(dir, "samples.jsonl"), "utf8")).split(/\r?\n/).filter(line => line.trim()).map((line, i) => {
      try { return JSON.parse(line); } catch { throw new CompareError(`${dir}/samples.jsonl:${i + 1}: invalid JSON`); }
    });
    const run: Run = { dir, summary, rows, ...(samplesMissing ? { samplesMissing: true } : {}), ...(existsSync(join(dir, ".running")) ? { running: true } : {}) };
    validateRows(run);
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

/** Include every stored scalar metric, including benchmark-native intervals. */
function flatten(value: unknown, path = "metrics", out: Record<string, Cell> = {}): Record<string, Cell> {
  if (value === null || typeof value === "string" || typeof value === "number" && Number.isFinite(value)) out[path] = value as Cell;
  else if (typeof value === "boolean") out[path] = String(value);
  else if (Array.isArray(value) || object(value)) for (const [key, child] of Object.entries(value)) flatten(child, `${path}.${key}`, out);
  return out;
}
function values(run: Run, m: Row): Record<string, Cell> {
  const fields = comparisonFields(run.summary, run.samplesMissing ? null : run.rows, scores(run.summary));
  return { ...fields, ...flatten(run.summary.metrics),
    model: run.summary.model ?? null, label: run.summary.label ?? null, suite: m?.eval ?? run.summary.eval ?? null,
    scoring_version: m?.scorer?.version ?? m?.collector?.version ?? run.summary.scoring_version ?? null,
    collection: m?.collection ?? run.summary.collection ?? null, mode: m?.mode ?? run.summary.mode ?? null, measurement: m?.collector?.version ?? null,
    akm_version: m?.akm?.version ?? run.summary.akm_version ?? null, status: run.summary.status ?? "unrecorded",
    recorded: run.samplesMissing ? fields.recorded ?? null : run.rows.length,
    scored: m.completion?.scored?.length ?? run.summary.n_scored ?? fields.scored ?? null, errors: m.completion?.errored?.length ?? run.summary.n_errored ?? fields.errors ?? null,
    date: run.summary.date ?? null, source_commit: run.summary.git_commit ?? null,
  };
}

export function comparePair(a: Run, b: Run): PairReport {
  validateRows(a); validateRows(b);
  const am = object(a.summary.manifest) ? a.summary.manifest : {}, bm = object(b.summary.manifest) ? b.summary.manifest : {};
  const warnings: string[] = [];
  for (const run of [a, b]) {
    if (run.samplesMissing) warnings.push(`${run.dir}: samples.jsonl is missing; showing summary values.`);
    if (run.running) warnings.push(`${run.dir}: .running marker exists; showing the saved snapshot.`);
    if (run.summary.status !== undefined && run.summary.status !== "complete")
      warnings.push(`${run.dir}: status ${run.summary.status}${run.summary.aborted_reason ? `: ${run.summary.aborted_reason}` : ""}.`);
  }
  const av = values(a, am), bv = values(b, bm);
  const columns = [...coreColumns, ...scoreColumns([a, b].map(r => ({ scores: scores(r.summary) })))];
  const columnMap = new Map(columns.map(c => [c.key, c]));
  const rows: ComparisonRow[] = [];
  for (const key of new Set([...columns.map(c => c.key), ...Object.keys(av), ...Object.keys(bv)])) {
    const x = av[key] ?? null, y = bv[key] ?? null;
    if (x === null && y === null) continue;
    const col = columnMap.get(key), group = col?.group ?? "Stored metrics";
    rows.push({ key, label: col?.label ?? key, group, unit: col?.unit ?? "", a: x, b: y,
      delta: typeof x === "number" && typeof y === "number" ? y - x : null, note: "" });
  }
  const settings = (r: Run, m: Row) => ({ eval: r.summary.eval ?? m.eval ?? null, corpus: r.summary.corpus ?? m.corpus ?? null,
    collection: r.summary.collection ?? m.collection ?? null, mode: r.summary.mode ?? m.mode ?? null,
    eval_version: m.collector?.version ?? null, scoring_version: m.scorer?.version ?? r.summary.scoring_version ?? null, model: r.summary.model ?? null,
    akm: m?.akm ?? { version: r.summary.akm_version ?? null, bin: r.summary.akm_bin ?? null, build: r.summary.akm_build ?? null },
    config: m?.config?.redacted ?? r.summary.config ?? null, settings: m?.settings ?? r.summary.config_patch ?? null,
    engines: m?.engines ?? r.summary.engine ?? null, benchmark_settings: evalSettingsOf(m), judge_model: r.summary.judge_model ?? null,
    semantic_index: r.summary.semantic_index ?? null, semantic_model: r.summary.semantic_model ?? null,
    workers: r.summary.workers ?? null, attempts: r.summary.attempts ?? null, search_mode: r.summary.search_mode ?? null });
  const as = settings(a, am), bs = settings(b, bm);
  const changes = Object.keys(as).filter(k => !equal(as[k as keyof typeof as], bs[k as keyof typeof bs]))
    .map(field => ({ field, a: redactConfig(as[field as keyof typeof as]), b: redactConfig(bs[field as keyof typeof bs]) }));
  if (changes.length > 1) warnings.push("Several settings changed; these differences do not isolate the effect of any one change.");
  return { eval: am?.eval ?? a.summary.eval ?? "unrecorded", eval_version: am?.collector?.version ?? "unrecorded", scoring_version: am?.scorer?.version ?? a.summary.scoring_version ?? am?.collector?.version ?? "unrecorded",
    corpus: am?.corpus ?? a.summary.corpus ?? "unrecorded", collection: am?.collection ?? a.summary.collection ?? null, mode: am?.mode ?? a.summary.mode ?? null, a: { dir: a.dir, label: a.summary.label ?? a.dir },
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
