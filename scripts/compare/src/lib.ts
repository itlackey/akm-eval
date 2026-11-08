/** Compare recorded results. No collectors, model calls, rescoring or run scheduling. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonical, redactConfig } from "../../../lib/provenance.ts";
import { evalSettingsOf } from "../../../lib/manifest.ts";
import { comparisonFields, coreColumns, scoreColumns, type Cell } from "../../ledger/src/comparison.ts";
import { scores } from "../../ledger/src/presentation.ts";
import { memoryColumns } from "../../ledger/src/memory.ts";

export const SUPPORTED = ["nightly", "consolidate", "distill", "reflect", "promotion", "judge-gate", "lesson-judge", "pair-judge", "drain-judge", "extract", "retrieval", "agent-ab", "cli-ratification", "terminal-bench", "bakeoff", "longmemeval", "skillret", "memory-utility", "project-intent"];
type Row = Record<string, any>;
/** `repeats` is set for a --repeat set, loaded from its repeat-summary.json: the runs it names, in order. Its `summary` is the first run's with the mean of each metric, and its rows are the first run's (case counts and timing). */
export interface Run { dir: string; summary: Row; rows: Row[]; samplesMissing?: boolean; running?: boolean; repeats?: Run[] }
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

/** The metrics of a repeat-summary.json (every number a {min, max, mean}) as the mean of each, in the shape of one run's metrics. */
const meanOf = (x: unknown): unknown =>
  object(x) && typeof x.mean === "number" && typeof x.min === "number" && typeof x.max === "number" ? x.mean : object(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, meanOf(v)])) : x;

const isRepeatSummary = (x: unknown): x is Row => object(x) && typeof x.repeat === "number" && Array.isArray(x.runs) && x.runs.every((r: unknown) => typeof r === "string");
const looksRepeat = (x: unknown): boolean => object(x) && ("repeat" in x || "runs" in x);

/** A saved results folder, or its summary.json, or the repeat-summary.json of a --repeat set (its runs sit beside it). Does not modify its contents. */
export function loadRun(path: string): Run {
  let dir = resolve(path);
  if (existsSync(dir) && statSync(dir).isFile()) {
    const file = dir;
    dir = dirname(dir);
    let repeat: unknown;
    try { repeat = JSON.parse(readFileSync(file, "utf8")); } catch { /* summary.json of the folder is read below */ }
    if (looksRepeat(repeat) && !(isRepeatSummary(repeat) && repeat.runs.length > 0 && object(repeat.metrics))) throw new CompareError(`${file}: a repeat summary needs "repeat", a non-empty "runs" list of run folders and "metrics"`);
    if (isRepeatSummary(repeat)) {
      const repeats = repeat.runs.map((name: string) => loadRun(join(dir, name)));
      return { dir, summary: { ...repeats[0]?.summary, label: `${repeat.label} (mean of ${repeats.length} runs)`, metrics: meanOf(repeat.metrics), wall_seconds: undefined }, rows: repeats[0]?.rows ?? [], repeats };
    }
  }
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

/** How far two runs agree case by case, on the `outcome` of their samples. A --repeat set counts for the outcome most of its runs gave (see agreementOf). */
export interface Agreement {
  /** What each side was: "one run" or "the majority of N runs". */
  a: string; b: string;
  /** The cases both sides have an outcome for. Cases that errored (no outcome in any run), cases without a majority (no outcome given by more runs than any other) and cases only one side has are left out of it and counted below. */
  cases: number;
  same: number;
  share: number | null;
  /** Cohen's kappa over the cases, or null when chance already explains all the agreement (both sides gave one outcome throughout). */
  kappa: number | null;
  /** Cases left out, per side: errored (an `error` row is a crash, not an outcome of the judge; in a --repeat set, a case no run gave an outcome for), for want of a majority, and cases only one side has. */
  errored: { a: number; b: number };
  no_majority: { a: number; b: number };
  only: { a: number; b: number };
  flips: { id: string; a: string; b: string }[];
}

/** The outcome of each case of a run: its row's, or for a --repeat set the one most of its runs gave. Null for a case with no majority, "error" for one with no outcome but `error`. Undefined when a row has no string outcome. */
function outcomesOf(run: Run): { outcomes: Map<string, string | null>; basis: string } | undefined {
  const members = run.repeats ?? [run];
  const tally = new Map<string, Map<string, number>>();
  for (const member of members) for (const row of member.rows) {
    if (typeof row.outcome !== "string") return undefined;
    const t = tally.get(row.id) ?? new Map<string, number>();
    if (row.outcome !== "error") t.set(row.outcome, (t.get(row.outcome) ?? 0) + 1); // a crash does not vote
    tally.set(row.id, t);
  }
  if (tally.size === 0) return undefined;
  const outcomes = new Map<string, string | null>();
  for (const [id, t] of tally) {
    const ranked = [...t.entries()].sort((x, y) => y[1] - x[1]);
    outcomes.set(id, ranked.length === 0 ? "error" : ranked.length > 1 && ranked[0]![1] === ranked[1]![1] ? null : ranked[0]![0]);
  }
  return { outcomes, basis: run.repeats ? `the majority of ${members.length} runs` : "one run" };
}

/** Agreement of two runs, or undefined when a run has no samples with case ids and outcomes. */
export function agreementOf(a: Run, b: Run): Agreement | undefined {
  const x = outcomesOf(a), y = outcomesOf(b);
  if (!x || !y) return undefined;
  const pairs: [string, string, string][] = [];
  const out: Agreement = { a: x.basis, b: y.basis, cases: 0, same: 0, share: null, kappa: null, errored: { a: 0, b: 0 }, no_majority: { a: 0, b: 0 }, only: { a: 0, b: 0 }, flips: [] };
  for (const [id, oa] of x.outcomes) {
    if (!y.outcomes.has(id)) { out.only.a++; continue; }
    const ob = y.outcomes.get(id)!;
    if (oa === null || ob === null || oa === "error" || ob === "error") {
      if (oa === "error") out.errored.a++; else if (oa === null) out.no_majority.a++;
      if (ob === "error") out.errored.b++; else if (ob === null) out.no_majority.b++;
      continue;
    }
    pairs.push([id, oa, ob]);
  }
  for (const id of y.outcomes.keys()) if (!x.outcomes.has(id)) out.only.b++;
  out.cases = pairs.length;
  if (pairs.length === 0) return out;
  out.same = pairs.filter(([, oa, ob]) => oa === ob).length;
  out.share = out.same / pairs.length;
  const kinds = [...new Set(pairs.flatMap(([, oa, ob]) => [oa, ob]))];
  const chance = kinds.reduce((sum, k) => sum + (pairs.filter(p => p[1] === k).length / pairs.length) * (pairs.filter(p => p[2] === k).length / pairs.length), 0);
  out.kappa = chance >= 1 ? null : (out.share - chance) / (1 - chance);
  out.flips = pairs.filter(([, oa, ob]) => oa !== ob).map(([id, oa, ob]) => ({ id, a: oa, b: ob }));
  return out;
}

export interface ComparisonRow { key: string; label: string; group: string; unit: string; a: Cell; b: Cell; delta: number | null; note: string }
export interface PairReport {
  eval: string; eval_version: string; scoring_version: string; corpus: string; collection: string | null; mode: string | null;
  a: { dir: string; label: string }; b: { dir: string; label: string };
  changes: { field: string; a: unknown; b: unknown }[];
  warnings: string[]; rows: ComparisonRow[];
  /** Per-case agreement, for runs whose samples carry case ids and outcomes. */
  agreement?: Agreement;
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
  for (const set of [a, b].filter(r => r.repeats))
    warnings.push(`${set.dir}: a --repeat set of ${set.repeats!.length} runs; its metrics are their means, and its other rows (cases, timing, usage, settings) are the first run's.`);
  for (const run of [a, b].flatMap(r => r.repeats ?? [r])) {
    if (run.samplesMissing) warnings.push(`${run.dir}: samples.jsonl is missing; showing summary values.`);
    if (run.running) warnings.push(`${run.dir}: .running marker exists; showing the saved snapshot.`);
    if (run.summary.status !== undefined && run.summary.status !== "complete")
      warnings.push(`${run.dir}: status ${run.summary.status}${run.summary.aborted_reason ? `: ${run.summary.aborted_reason}` : ""}.`);
  }
  const av = values(a, am), bv = values(b, bm);
  const columns = [...coreColumns, ...scoreColumns([a, b].map(r => ({ scores: scores(r.summary) }))),
    ...([a, b].some(r => r.summary.eval === "memory-utility") ? memoryColumns() : [])]; // the ledger's labels for the memory_* fields
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
  const agree = agreementOf(a, b);
  const as = settings(a, am), bs = settings(b, bm);
  const changes = Object.keys(as).filter(k => !equal(as[k as keyof typeof as], bs[k as keyof typeof bs]))
    .map(field => ({ field, a: redactConfig(as[field as keyof typeof as]), b: redactConfig(bs[field as keyof typeof bs]) }));
  if (changes.length > 1) warnings.push("Several settings changed; these differences do not isolate the effect of any one change.");
  return { eval: am?.eval ?? a.summary.eval ?? "unrecorded", eval_version: am?.collector?.version ?? "unrecorded", scoring_version: am?.scorer?.version ?? a.summary.scoring_version ?? am?.collector?.version ?? "unrecorded",
    corpus: am?.corpus ?? a.summary.corpus ?? "unrecorded", collection: am?.collection ?? a.summary.collection ?? null, mode: am?.mode ?? a.summary.mode ?? null, a: { dir: a.dir, label: a.summary.label ?? a.dir },
    b: { dir: b.dir, label: b.summary.label ?? b.dir }, changes, warnings, rows, ...(agree ? { agreement: agree } : {}) };
}

const cell = (v: unknown): string => (v === null ? "—" : typeof v === "number" ? String(Number(v.toFixed(6))) : typeof v === "string" ? v : JSON.stringify(v)).replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
export function renderPair(report: PairReport): string {
  const lines = [`# ${report.eval} · eval ${report.eval_version} · scoring ${report.scoring_version}`, "",
    `A: ${cell(report.a.label)} (${cell(report.a.dir)})`, `B: ${cell(report.b.label)} (${cell(report.b.dir)})`, "",
    "Stored results. Delta is B minus A; percentage deltas are percentage points. No statistical winner is inferred.", "",
    ...report.warnings.map(w => `- ${w}`), "", "| Metric / setting | A | B | Delta (B − A) | Note |", "|---|---:|---:|---:|---|"];
  for (const row of report.rows) lines.push(`| ${cell(row.label)} | ${cell(row.a)} | ${cell(row.b)} | ${cell(row.delta)} | ${row.note} |`);
  const g = report.agreement;
  if (g) {
    const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
    lines.push("", `Per-case agreement (A: ${g.a}; B: ${g.b}): ${g.same} of ${g.cases} cases have the same outcome (${pct(g.share)}); Cohen's kappa ${g.kappa === null ? "undefined (chance explains all of it)" : g.kappa.toFixed(3)}.`);
    // Per side, not summed: a case left out of both sides would count twice in a total.
    const side = (n: { a: number; b: number }, what: string) => (n.a + n.b > 0 ? `${what} (A ${n.a}, B ${n.b})` : "");
    const left = [side(g.errored, "errored"), side(g.no_majority, "no majority outcome"), side(g.only, "in only one run")].filter(Boolean);
    if (left.length) lines.push(`Left out: ${left.join(", ")}.`);
    if (g.flips.length) {
      const shown = g.flips.slice(0, 60);
      lines.push("", `Flipped cases (${g.flips.length}):`, "", "| Case | A | B |", "|---|---|---|", ...shown.map(f => `| ${cell(f.id)} | ${cell(f.a)} | ${cell(f.b)} |`));
      if (g.flips.length > shown.length) lines.push("", `…and ${g.flips.length - shown.length} more, all in the JSON report.`);
    }
  }
  if (report.changes.length) {
    lines.push("", "Changed settings:", "", "| Setting | A | B |", "|---|---|---|");
    for (const change of report.changes) lines.push(`| ${change.field} | ${cell(change.a)} | ${cell(change.b)} |`);
  }
  return `${lines.join("\n")}\n`;
}
