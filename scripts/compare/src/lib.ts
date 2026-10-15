/** Compare recorded results. No collectors, model calls, rescoring or run scheduling. */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readManifest, type RunManifest } from "../../../lib/manifest.ts";
import { canonical, redactConfig } from "../../../lib/provenance.ts";
import { comparisonFields, coreColumns, scoreColumns, type Cell } from "../../ledger/src/comparison.ts";
import { scores } from "../../ledger/src/presentation.ts";

export const SUPPORTED = ["nightly", "consolidate", "distill", "reflect", "promotion", "judge-gate", "extract", "retrieval", "agent-ab", "terminal-bench", "bakeoff", "longmemeval", "skillret"];
type Row = Record<string, any>;
export interface Run { dir: string; summary: Row; rows: Row[]; samplesMissing?: boolean; running?: boolean }
export class CompareError extends Error {}
const object = (v: unknown): v is Row => v !== null && typeof v === "object" && !Array.isArray(v);
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const ids = (values: string[]) => [...values].sort();

function manifest(run: Run): RunManifest | null {
  const read = readManifest(run.summary);
  return read.kind === "manifest" ? read.manifest : null;
}

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

/** Differences affect the supported deltas, never whether stored results can be viewed. */
function differences(a: Run, b: Run, am: RunManifest | null, bm: RunManifest | null): string[] {
  const out: string[] = [];
  for (const key of ["eval", "corpus", "collection", "mode"] as const)
    if (!equal(am?.[key] ?? a.summary[key] ?? null, bm?.[key] ?? b.summary[key] ?? null)) out.push(`${key} differs`);
  if (am && bm) {
    if (am.harness_version !== bm.harness_version) out.push("harness version differs");
    if (am.collector.version !== bm.collector.version) out.push("eval version differs");
    if ((am.scorer?.version ?? am.collector.version) !== (bm.scorer?.version ?? bm.collector.version)) out.push("scoring version differs");
    if (!equal(am.settings.seed, bm.settings.seed)) out.push("generated-corpus seed differs");
    if (!equal(ids(am.completion.selected), ids(bm.completion.selected))) out.push("selected cases differ; no cases were dropped");
    for (const id of am.completion.selected) {
      if (!bm.cases[id]) continue;
      if (am.cases[id]!.input_sha256 !== bm.cases[id]!.input_sha256) out.push(`case input differs: ${id}`);
      if (am.cases[id]!.label_sha256 !== bm.cases[id]!.label_sha256) out.push(`case labels differ: ${id}`);
    }
  } else {
    // Older public runs identify the committed cases and scorer by their source commit.
    const commit = a.summary.git_commit;
    if (typeof commit !== "string" || !/^[a-f0-9]{7,40}$/.test(commit) || commit !== b.summary.git_commit)
      out.push("legacy input/scoring identity is unverified: source commits are missing, dirty or different");
    if (a.summary.corpus !== "public" && (!a.summary.assets_sha256 || a.summary.assets_sha256 !== b.summary.assets_sha256))
      out.push("legacy custom-corpus identity is unverified");
    for (const key of ["assets_sha256", "harness_sha256", "seed", "n_assets", "scoring_version", "scoring_labels_sha256"])
      if (!equal(a.summary[key] ?? null, b.summary[key] ?? null)) out.push(`${key} differs or is unrecorded on one side`);
    const other = new Map(b.rows.map(r => [r.id, r]));
    for (const row of a.rows) {
      const paired = other.get(row.id);
      if (paired && ["query", "kind", "n_relevant"].some(k => !equal(row[k] ?? null, paired[k] ?? null))) out.push(`recorded case input or labels differ: ${row.id}`);
    }
  }
  return out;
}

function completion(run: Run, m: RunManifest | null) {
  if (m) return m.completion;
  const selected = run.rows.map(r => r.id);
  const errored = run.rows.filter(r => r.error || r.outcome === "error" || ["search", "curate", "semantic_search", "semantic_curate"].some(k => r[k]?.error)).map(r => r.id);
  return { selected, errored, scored: selected.filter(id => !errored.includes(id)) };
}

/** Include every stored scalar metric, including benchmark-native intervals. */
function flatten(value: unknown, path = "metrics", out: Record<string, Cell> = {}): Record<string, Cell> {
  if (value === null || typeof value === "string" || typeof value === "number" && Number.isFinite(value)) out[path] = value as Cell;
  else if (typeof value === "boolean") out[path] = String(value);
  else if (Array.isArray(value) || object(value)) for (const [key, child] of Object.entries(value)) flatten(child, `${path}.${key}`, out);
  return out;
}
function values(run: Run, m: RunManifest | null): Record<string, Cell> {
  const fields = comparisonFields(run.summary, run.samplesMissing ? null : run.rows, scores(run.summary));
  const done = completion(run, m);
  return { ...fields, ...flatten(run.summary.metrics),
    model: run.summary.model ?? null, label: run.summary.label ?? null, suite: m?.eval ?? run.summary.eval ?? null,
    scoring_version: m?.scorer?.version ?? m?.collector.version ?? run.summary.scoring_version ?? null,
    collection: m?.collection ?? run.summary.collection ?? null, mode: m?.mode ?? run.summary.mode ?? null, measurement: m?.collector.version ?? null,
    akm_version: m?.akm.version ?? run.summary.akm_version ?? null, status: run.summary.status ?? "unrecorded",
    recorded: run.samplesMissing ? fields.recorded ?? null : run.rows.length,
    scored: m ? done.scored.length : run.summary.n_scored ?? fields.scored ?? null, errors: m ? done.errored.length : run.summary.n_errored ?? fields.errors ?? null,
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
  validateRows(a); validateRows(b);
  const am = manifest(a), bm = manifest(b);
  const warnings: string[] = [];
  let complete = true;
  for (const run of [a, b]) {
    const read = readManifest(run.summary), m = manifest(run), done = completion(run, m);
    if (read.kind === "legacy") warnings.push(`${run.dir}: legacy result; original input digests were not recorded. Deltas use recorded cases and the source commit where they match.`);
    if (read.kind === "invalid") warnings.push(`${run.dir}: manifest metadata is unusable: ${read.problems.join("; ")}. Stored results are shown.`);
    if (run.samplesMissing) { warnings.push(`${run.dir}: samples.jsonl is missing; showing summary values.`); complete = false; }
    if (run.running) { warnings.push(`${run.dir}: .running marker exists (possibly stale); showing a saved snapshot.`); }
    if (run.summary.status !== undefined && run.summary.status !== "complete") {
      warnings.push(`${run.dir}: status ${run.summary.status}${run.summary.aborted_reason ? `: ${run.summary.aborted_reason}` : ""}; showing saved coverage.`); complete = false;
    }
    if (!m && !run.samplesMissing) {
      const expected = run.summary.n_run ?? run.summary.n_queries ?? run.summary.n_tasks ?? run.summary.n_items;
      if (typeof expected === "number" && expected !== run.rows.length) {
        warnings.push(`${run.dir}: sample coverage (${run.rows.length}) differs from the summary (${expected}).`); complete = false;
      }
    }
    if (read.kind === "invalid" || done.selected.length !== done.scored.length + done.errored.length ||
      !equal(ids(run.rows.map(r => r.id)), ids([...done.scored, ...done.errored]))) complete = false;
  }
  const mismatch = differences(a, b, am, bm);
  warnings.push(...mismatch.map(reason => `${reason}. Stored values are shown; quality, performance and usage deltas are omitted.`));
  const ac = completion(a, am), bc = completion(b, bm);
  const coverage = equal(ids(ac.scored), ids(bc.scored)) && equal(ids(ac.selected), ids(bc.selected));
  const judge = equal([a.summary.judge_model ?? null, am?.engines.judge ?? null], [b.summary.judge_model ?? null, bm?.engines.judge ?? null]);
  const quality = mismatch.length === 0 && coverage && complete && judge;
  if (!coverage || !complete) warnings.push("Scored coverage differs or is incomplete. Quality deltas are omitted; stored values are shown.");
  if (!judge) warnings.push("Answer judges differ. Quality deltas are omitted.");
  const timing = mismatch.length === 0 && coverage && complete && equal(observations(a), observations(b)) &&
    ["workers", "attempts", "semantic_index"].every(k => equal(a.summary[k] ?? null, b.summary[k] ?? null));
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
    let note = isQuality && !quality ? (mismatch.length ? "Different or unverified inputs/scoring" : "Unequal scoring coverage or judge") : isTiming && !timing ? "Unequal timing or workload coverage" : "";
    if (key === "run_wall_s" && (typeof a.summary.wall_seconds === "number") !== (typeof b.summary.wall_seconds === "number"))
      note = "Different wall-time measurements";
    // Counts remain useful even when a run has more errors. Rates require equal denominators.
    if (["recorded", "scored", "errors", "timeouts"].includes(key)) note = "";
    const scoreName = key.startsWith("score:") ? key.slice(6) : key === "quality_percent" ? av.quality_metric : null;
    if (key === "quality_percent" && av.quality_metric !== bv.quality_metric) note = "Different primary metrics";
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
  const settings = (r: Run, m: RunManifest | null) => ({ model: r.summary.model ?? null,
    akm: m?.akm ?? { version: r.summary.akm_version ?? null, bin: r.summary.akm_bin ?? null, build: r.summary.akm_build ?? null },
    config: m?.config ?? r.summary.config ?? null, settings: m?.settings ?? r.summary.config_patch ?? null,
    engines: m?.engines ?? r.summary.engine ?? null, benchmark_settings: m?.treatment_hints ?? null, judge_model: r.summary.judge_model ?? null,
    semantic_index: r.summary.semantic_index ?? null, semantic_model: r.summary.semantic_model ?? null,
    workers: r.summary.workers ?? null, attempts: r.summary.attempts ?? null, search_mode: r.summary.search_mode ?? null });
  const as = settings(a, am), bs = settings(b, bm);
  const changes = Object.keys(as).filter(k => !equal(as[k as keyof typeof as], bs[k as keyof typeof bs]))
    .map(field => ({ field, a: redactConfig(as[field as keyof typeof as]), b: redactConfig(bs[field as keyof typeof bs]) }));
  if (changes.length > 1) warnings.push("Several settings changed; these differences do not isolate the effect of any one change.");
  return { eval: am?.eval ?? a.summary.eval ?? "unrecorded", eval_version: am?.collector.version ?? "unrecorded", scoring_version: am?.scorer?.version ?? am?.collector.version ?? "unrecorded",
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
