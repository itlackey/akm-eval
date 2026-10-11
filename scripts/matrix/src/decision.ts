// The decision of a matrix: one row per config, set side by side with its baseline, and the paired comparison and the noise floor that
// scripts/compare adds to it. Kept apart from lib.ts, which scripts/compare imports, so that the two do not import each other.
// See ../../../README.md ("Run a matrix").

import { basename, join } from "node:path";
import type { Axis } from "../../compare/src/policy.ts";
import { type Dir, type Matrix, type Row, type Signal, type Spread, type Stage, type State, type Verdict, baselineFor, compareAll, incompleteReason, incomparable, judge, measuredOf, moreErrors, readJson, runDirs, screenDiffers, treatmentAxes, unusableReason } from "./lib.ts";
import { type NoiseFloor, type Paired, type PairedMetric, noiseOf, pairedDifferent, pairedOf } from "./paired.ts";

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
  /** The axes the config changes against its baseline (build, config, model, inputs, harness). The others must be the same, and a row where they are not is "not comparable". */
  treatment: Axis[];
  /** The akm build and version of the config, and of its baseline. A build is null for a release. */
  akm_build: string | null;
  akm_version: string | null;
  baseline_akm_build: string | null;
  baseline_akm_version: string | null;
  model: string | null;
  /** Why the verdict is "exploratory": evidence the policy needs and the summaries lack. Empty for a row that may be used for a conclusion. */
  exploratory: string[];
  /** scripts/compare on the repeats of both sides, in the confirm stage: the cases that flipped, a sign test and the paired intervals. */
  paired: Paired | null;
}

export interface Decision {
  matrix: string;
  prefix: string;
  generated: string;
  min_delta: number;
  rows: DecisionRow[];
}

const emptyRow = (config: Row, base: Row, stage: Stage, treatment: Axis[]): DecisionRow => ({
  eval: config.eval,
  scope: "",
  config: config.name,
  baseline: base.name,
  stage,
  n: 0,
  verdict: "no result",
  note: "",
  metrics: [],
  calls: { baseline: null, config: null },
  seconds: { baseline: null, config: null },
  n_errored: { baseline: null, config: null },
  treatment,
  akm_build: null,
  akm_version: null,
  baseline_akm_build: null,
  baseline_akm_version: null,
  model: null,
  exploratory: [],
  paired: null,
});

const signed = (x: number): string => `${x > 0 ? "+" : ""}${String(Number(x.toFixed(3)))}`;
const interval = (x: PairedMetric): string => (x.delta === null || x.ci === null ? "" : `${signed(x.delta)} (${signed(x.ci[0])} to ${signed(x.ci[1])})`);

/** Why a config's confirm result cannot be used, from the run records of its confirm and of its baseline's: it exited non-zero, was cut short, or wrote no summary. */
function confirmWhy(root: string, config: Row, base: Row, state: State): string[] {
  const out: string[] = [];
  for (const [who, rec] of [["the confirm run", state.confirm[config.name]], ["the baseline's confirm run", state.confirm[base.name]]] as const) {
    const why = unusableReason(root, rec);
    if (why) out.push(`${who} ${why}${rec && rec.results.length === 0 ? `, see ${rec.log}` : ""}`);
  }
  return out;
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
    const treatment = treatmentAxes(m, config, base);
    if (cs.length === 0) {
      const rec = state[stage][config.name] ?? state.screen[config.name];
      const why = unusableReason(root, rec);
      const note = !rec ? "not run" : why ? `the run ${why}, see ${rec.log}` : `the run wrote no summary (exit ${rec.exit_code}), see ${rec.log}`;
      rows.push({ ...emptyRow(config, base, stage, treatment), note });
      continue;
    }
    for (const cm of cs) {
      const bm = bs.find((x) => x.scope === cm.scope);
      const row: DecisionRow = { ...emptyRow(config, base, stage, treatment), scope: cm.scope, n: cm.n, calls: { baseline: null, config: cm.calls }, seconds: { baseline: null, config: cm.seconds }, n_errored: { baseline: null, config: cm.n_errored }, akm_build: cm.akm_build, akm_version: cm.akm_version, model: cm.model };
      if (!bm) {
        const why = unusableReason(root, state[stage][base.name]);
        rows.push({ ...row, note: why ? `the baseline run ${why}` : "the baseline has no result for this scope" });
        continue;
      }
      const compares = compareAll(config.eval, bm, cm);
      const { verdict, reading, exploratory } = judge(config.eval, compares, bm, cm, treatment);
      const notes: string[] = [];
      if (verdict === "not comparable") notes.push(incomparable(bm, cm, treatment, config.eval) ?? "");
      if (verdict === "exploratory") notes.push(`exploratory, not a conclusion: ${exploratory.join("; ")} (the metrics read: ${reading})`);
      else if (exploratory.length > 0) notes.push(`exploratory: ${exploratory.join("; ")}`);
      if (treatment.includes("build") && bm.akm_build === cm.akm_build && bm.akm_version === cm.akm_version) notes.push(`both ran the same akm build (${buildLabel(cm.akm_build, cm.akm_version)}), so this treatment changes nothing`);
      if (!useConfirm) notes.push(...confirmWhy(root, config, base, state));
      if (verdict === "screen only" && !confirmRec) {
        const moved = screenDiffers(config.eval, bm, cm, minDelta);
        notes.push(moved.length ? `screen differs: ${moved.join(", ")}` : "screen matches the baseline");
      }
      // The repeats of both sides compared case by case, all of them pooled. The verdict stays the min-max rule's; a paired interval that
      // excludes 0 where the ranges overlap is said in the note.
      let paired: Paired | null = null;
      if (stage === "confirm" && bm.repeated && cm.repeated && verdict !== "no result" && verdict !== "not comparable") {
        const result = pairedOf(config.eval, bm.dirs ?? [], cm.dirs ?? [], treatment);
        paired = result.paired;
        if (result.note) notes.push(result.note);
      }
      if ((verdict === "no difference" || reading === "no difference") && paired) {
        const differing = pairedDifferent(paired);
        if (differing.length > 0) notes.push(`paired says different: ${differing.map((x) => `${x.path} ${x.signal} ${interval(x)}`).join("; ")}`);
      }
      notes.push(...moreErrors(config.eval, bm, cm));
      rows.push({
        ...row,
        n: Math.min(bm.n, cm.n),
        verdict,
        note: notes.join("; "),
        metrics: compares.map((c) => ({ path: c.path, role: c.role, dir: c.dir, signal: c.signal, baseline: c.base, config: c.cfg })),
        calls: { baseline: bm.calls, config: cm.calls },
        seconds: { baseline: bm.seconds, config: cm.seconds },
        n_errored: { baseline: bm.n_errored, config: cm.n_errored },
        baseline_akm_build: bm.akm_build,
        baseline_akm_version: bm.akm_version,
        exploratory,
        paired,
      });
    }
  }
  return { matrix: m.file, prefix: m.prefix, generated: now.toISOString(), min_delta: minDelta, rows };
}

// ---- the noise floor ---------------------------------------------------------------------------------------------------------

export interface NoiseRecord extends NoiseFloor {
  eval: string;
  /** The baseline row whose repeats these are, and its scope (retrieval's collection). */
  baseline: string;
  scope: string;
}

/**
 * The per-case noise of each baseline that the confirm stage has run: the flip rate of its repeats, from scripts/compare. It is what a
 * screen result has to move by before it is more than the eval's own variation, so it is where to start a --min-delta. Evals compare has
 * no per-case reading for have none. `notes` say why a baseline's repeats could not be read. A baseline whose confirm run exited non-zero
 * or did not complete has none.
 */
export function noiseFloors(root: string, m: Matrix, state: State): { floors: NoiseRecord[]; notes: string[] } {
  const floors: NoiseRecord[] = [];
  const notes: string[] = [];
  for (const row of m.baselines) {
    if (unusableReason(root, state.confirm[row.name]) !== null) continue;
    for (const ref of (state.confirm[row.name]?.results ?? []).filter((r) => r.kind === "repeat")) {
      if (incompleteReason(root, ref) !== null) continue;
      const file = join(root, ref.file);
      const { floors: found, note } = noiseOf(row.eval, runDirs(file, readJson(file), "repeat"));
      floors.push(...found.map((f) => ({ ...f, eval: row.eval, baseline: row.name, scope: ref.scope })));
      if (note) notes.push(`${row.name}${ref.scope ? ` (${ref.scope})` : ""}: ${note}`);
    }
  }
  return { floors, notes };
}

/** One line for a noise floor, for the terminal. */
export function noiseLine(f: NoiseRecord): string {
  const who = `${f.eval} ${f.baseline}${f.scope ? ` (${f.scope})` : ""}${f.view ? ` ${f.view}` : ""}`;
  if (f.flip_rate === null) return `${who}: no case had a verdict in two of the ${f.runs} runs`;
  const hint = f.min_delta_hint === null ? "" : f.min_delta_hint === 0 ? "; the main metrics were the same in every run, so there is no floor for --min-delta" : `; a main metric differs by ${trim(f.min_delta_hint)} between two runs of one configuration, so start --min-delta at ${trim(f.min_delta_hint)}`;
  return `${who}: ${f.runs} runs, mean flip rate ${trim(f.flip_rate)}, about ${trim(f.expected_flips ?? 0)} of ${f.n_compared} cases flip between two runs of one configuration${hint}`;
}

const trim = (x: number): string => String(Number(x.toFixed(3)));
const fmtSpread = (s: Spread | null): string => (s === null ? "–" : s.min === s.max ? trim(s.mean) : `${trim(s.mean)} (${trim(s.min)}–${trim(s.max)})`);
const fmtNum = (x: number | null): string => (x === null ? "–" : trim(x));
const ARROW: Record<Dir, string> = { up: "↑", down: "↓" };
/** An akm build for a table: its git describe, or "release" (with the version, for a build compared with another) when it is a release. */
const buildLabel = (build: string | null, version: string | null): string => build ?? (version ? `release ${version}` : "release");
const fmtP = (p: number | null): string => (p === null ? "" : p < 0.001 ? ", p < 0.001" : `, p ${p.toFixed(3)}`);

/** The paired cell: how many cases flipped each way and the sign test, then the interval of each metric. All the repeats of the baseline against all those of the config. */
function pairedCell(p: Paired | null): string {
  if (!p) return "–";
  const lines = p.view === "" ? [`${p.better} better, ${p.worse} worse, ${p.agree} agree${fmtP(p.p)}`] : [];
  for (const x of p.ci) if (x.ci !== null) lines.push(`${x.path} ${interval(x)}${x.signal === "better" || x.signal === "worse" ? ` **${x.signal}**` : ""}`);
  lines.push(`${p.repeats.baseline} → ${p.repeats.config} repeats pooled`);
  return lines.join("<br>");
}

export function renderMarkdown(d: Decision): string {
  const out = [`# Matrix decision: ${d.prefix}`, "", `Matrix \`${basename(d.matrix)}\`, generated ${d.generated}. A cell reads baseline → config, as mean (min–max over the repeats). ↑ higher is better, ↓ lower is better; harm must not rise. Verdicts apply the plan's rule: ranges that do not overlap, harm not up; n=1 is "screen only". A config with more errored cases than its baseline is never "better" (it is "incomplete"), and a row whose summaries lack the evidence that only the treatment differs is "exploratory", not a conclusion.`, ""];
  if (d.rows.some((r) => r.treatment.includes("build"))) out.push("A row whose config runs another akm build than its baseline shows both builds in the akm build column. Every axis outside the row's treatment must still be the same, the model included.", "");
  if (d.rows.some((r) => r.paired)) out.push("The paired column is scripts/compare on all the repeats of the baseline and of the config, pooled by case: each case is scored by its mean over the repeats of a side, and the order of the repeats does not matter. It shows the cases whose mean went up (better) and down (worse), the cases that agree and the sign test on the flips, then each metric as config minus baseline with the 95% interval of a bootstrap over the cases. It does not change the verdict; a \"no difference\" whose interval excludes 0 says so in its note.", "");
  const groups = new Map<string, DecisionRow[]>();
  for (const r of d.rows) groups.set(`${r.eval}${r.scope ? ` (${r.scope})` : ""} vs ${r.baseline}`, [...(groups.get(`${r.eval}${r.scope ? ` (${r.scope})` : ""} vs ${r.baseline}`) ?? []), r]);
  for (const [title, rows] of groups) {
    const withPaired = rows.some((r) => r.paired);
    out.push(`## ${title}`, "", `| config | runs | main metric | harm | calls | seconds | akm build | model |${withPaired ? " paired |" : ""} verdict |`, `|---|---|---|---|---|---|---|---|${withPaired ? "---|" : ""}---|`);
    for (const r of rows) {
      const cell = (role: "main" | "harm") =>
        r.metrics
          .filter((x) => x.role === role && (x.baseline || x.config))
          .map((x) => `${x.path} ${ARROW[x.dir]} ${fmtSpread(x.baseline)} → ${fmtSpread(x.config)}`)
          .join("<br>") || "–";
      const pair = (p: { baseline: number | null; config: number | null }) => `${fmtNum(p.baseline)} → ${fmtNum(p.config)}`;
      const build = r.treatment.includes("build") ? `${buildLabel(r.baseline_akm_build, r.baseline_akm_version)} → ${buildLabel(r.akm_build, r.akm_version)}` : (r.akm_build ?? "release");
      out.push(`| ${r.config} | ${r.n} | ${cell("main")} | ${cell("harm")} | ${pair(r.calls)} | ${pair(r.seconds)} | ${build} | ${r.model ?? "–"} |${withPaired ? ` ${pairedCell(r.paired)} |` : ""} **${r.verdict}**${r.note ? `<br>${r.note}` : ""} |`);
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}
