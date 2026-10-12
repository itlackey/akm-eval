// The decision of a matrix: one row per config, set side by side with its baseline, and the paired comparison and the noise floor that
// scripts/compare adds to it. Kept apart from lib.ts, which scripts/compare imports, so that the two do not import each other.
// See ../../../README.md ("Run a matrix").

import { basename, join } from "node:path";
import { compareVersions } from "../../../lib/manifest.ts";
import type { Axis } from "../../compare/src/policy.ts";
import { EVALS, MIN_REPEATS, type Dir, type Matrix, type Measured, type Row, type Signal, type Spread, type Stage, type State, type Verdict, baselineFor, compareAll, incompleteReason, incomparable, judge, manifestReasons, measuredOf, metricSpread, moreErrors, readJson, runDirs, scoredAlike, screenDiffers, treatmentAxes, unusableReason } from "./lib.ts";
import { type Cases, type Coverage, type NoiseFloor, type Paired, type PairedMetric, casesOf, noiseOf, pairedDifferent, pairedOf } from "./paired.ts";

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
  /** The akm build and version of the config, and of its baseline. A build is null for a release. The fingerprint tells two edits of one build apart. */
  akm_build: string | null;
  akm_version: string | null;
  akm_build_fingerprint: string | null;
  baseline_akm_build: string | null;
  baseline_akm_version: string | null;
  baseline_akm_build_fingerprint: string | null;
  model: string | null;
  /** The collector and the scorer each side's runs were made and scored with, "v<version>" (the versions of MEASUREMENT.lock), null for a run from before the manifest. Several versions among the runs of one side are listed. The scorers are those of the stored results: see `rescored`. */
  collector: { baseline: string | null; config: string | null };
  scorer: { baseline: string | null; config: string | null };
  /** The two sides had been scored by different scorers, or against different labels, so both were scored again with the current scorer (scripts/rescore) before the metrics were compared. Nothing was written. */
  rescored: boolean;
  /** Why the verdict is "exploratory": evidence the policy needs and the summaries lack. Empty for a row that may be used for a conclusion. */
  exploratory: string[];
  /** scripts/compare on the repeats of both sides, in the confirm stage: the cases that flipped, a sign test and the paired intervals. */
  paired: Paired | null;
  /** How many cases each side was given and got a verdict for, per run. Null where compare has no per-case reading of the eval or cannot read its runs. */
  coverage: { baseline: Coverage | null; config: Coverage | null };
  /** The cases that only one side gave a verdict (empty lists: the same cases), by id. Null where coverage is. */
  cases: Pick<Cases, "baseline_only" | "config_only"> | null;
  /** Metrics shown beside the judged ones and not judged: retrieval's nDCG over the judged results alone, and the share of results that were judged. */
  context: { path: string; baseline: Spread | null; config: Spread | null }[];
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
  akm_build_fingerprint: null,
  baseline_akm_build: null,
  baseline_akm_version: null,
  baseline_akm_build_fingerprint: null,
  model: null,
  collector: { baseline: null, config: null },
  scorer: { baseline: null, config: null },
  rescored: false,
  exploratory: [],
  paired: null,
  coverage: { baseline: null, config: null },
  cases: null,
  context: [],
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

/**
 * Why a verdict cannot be a conclusion for want of the same cases on both sides: a case that only one side gave a verdict (it errored on the
 * other, or the other left it out) is named. Empty when both sides scored the same cases, and when the rows cannot be read or the eval has no
 * per-case reading (the counts of errored cases stand, and the paired note says why the cases could not be compared).
 */
function caseReasons(cases: Cases | null): string[] {
  if (!cases) return [];
  const list = (ids: string[]) => (ids.length <= 5 ? ids.join(", ") : `${ids.slice(0, 5).join(", ")} and ${ids.length - 5} more`);
  const sides = [["the baseline", cases.baseline_only], ["the config", cases.config_only]] as const;
  const parts = sides.filter(([, ids]) => ids.length > 0).map(([who, ids]) => `only ${who} scored ${list(ids)}`);
  return parts.length === 0 ? [] : [`the sides scored different cases, so their rates are over different cases: ${parts.join("; ")}`];
}

/** The versions of one part ("collector" or "scorer") over the runs behind a result, as "v0.2", or "v0.1, v0.2" when they differ, and null when a run has no manifest. */
function versionsOf(m: Measured, part: "collector" | "scorer"): string | null {
  if (m.runs.length === 0 || m.runs.some((r) => !r.manifest)) return null;
  return [...new Set(m.runs.map((r) => (r.manifest as NonNullable<typeof r.manifest>)[part].version))].sort(compareVersions).map((v) => `v${v}`).join(", ");
}

/** Both results ran one akm: the same build, version and uncommitted changes. */
const sameBuild = (a: Measured, b: Measured): boolean => a.akm_build === b.akm_build && a.akm_version === b.akm_version && (a.akm_build_fingerprint ?? null) === (b.akm_build_fingerprint ?? null);

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
    for (const cm0 of cs) {
      const bm0 = bs.find((x) => x.scope === cm0.scope);
      const row: DecisionRow = { ...emptyRow(config, base, stage, treatment), scope: cm0.scope, n: cm0.n, calls: { baseline: null, config: cm0.calls }, seconds: { baseline: null, config: cm0.seconds }, n_errored: { baseline: null, config: cm0.n_errored }, akm_build: cm0.akm_build, akm_version: cm0.akm_version, akm_build_fingerprint: cm0.akm_build_fingerprint ?? null, model: cm0.model, collector: { baseline: null, config: versionsOf(cm0, "collector") }, scorer: { baseline: null, config: versionsOf(cm0, "scorer") } };
      if (!bm0) {
        const why = unusableReason(root, state[stage][base.name]);
        rows.push({ ...row, note: why ? `the baseline run ${why}` : "the baseline has no result for this scope" });
        continue;
      }
      const shown = { collector: { baseline: versionsOf(bm0, "collector"), config: versionsOf(cm0, "collector") }, scorer: { baseline: versionsOf(bm0, "scorer"), config: versionsOf(cm0, "scorer") } };
      // Results scored by different scorers, or against different labels, are scored again with the current scorer, as scripts/compare does.
      const same = scoredAlike(root, bm0, cm0);
      if ("refusal" in same) {
        rows.push({ ...row, ...shown, verdict: "not comparable", note: same.refusal });
        continue;
      }
      const [bm, cm] = [same.base, same.cfg];
      const compares = compareAll(config.eval, bm, cm);
      // Which cases each side scored: two sides with as many errored cases can have failed on different ones.
      const found = casesOf(config.eval, bm.rescored ?? bm.dirs ?? [], cm.rescored ?? cm.dirs ?? []);
      const { verdict, reading, exploratory } = judge(config.eval, compares, bm, cm, treatment, [...caseReasons(found.cases), ...manifestReasons(root, config.eval, bm0, cm0)]);
      const notes: string[] = [];
      if (same.again) notes.push(`${same.again}, so both were scored again with the current scorer`);
      if (verdict === "not comparable") notes.push(incomparable(bm, cm, treatment, config.eval) ?? "");
      if (verdict === "exploratory") notes.push(`exploratory, not a conclusion: ${exploratory.join("; ")} (the metrics read: ${reading})`);
      else if (exploratory.length > 0) notes.push(`exploratory: ${exploratory.join("; ")}`);
      if (treatment.includes("build") && sameBuild(bm, cm)) notes.push(`both ran the same akm build (${buildLabel(cm.akm_build, cm.akm_version, cm.akm_build_fingerprint)}), so this treatment changes nothing`);
      if (!useConfirm) notes.push(...confirmWhy(root, config, base, state));
      if (verdict === "screen only" && !confirmRec) {
        const moved = screenDiffers(config.eval, bm, cm, minDelta);
        notes.push(moved.length ? `screen differs: ${moved.join(", ")}` : "screen matches the baseline");
      }
      // The repeats of both sides compared case by case, all of them pooled. The verdict stays the min-max rule's; a paired interval that
      // excludes 0 where the ranges overlap is said in the note.
      let paired: Paired | null = null;
      if (stage === "confirm" && bm.repeated && cm.repeated && verdict !== "no result" && verdict !== "not comparable") {
        const result = pairedOf(config.eval, bm.rescored ?? bm.dirs ?? [], cm.rescored ?? cm.dirs ?? [], treatment);
        paired = result.paired;
        if (result.note) notes.push(result.note);
      }
      if ((verdict === "no difference" || reading === "no difference") && paired) {
        const differing = pairedDifferent(paired);
        if (differing.length > 0) notes.push(`paired says different: ${differing.map((x) => `${x.path} ${x.signal} ${interval(x)}`).join("; ")}`);
      }
      // The reverse: a metric the ranges call better or worse, whose paired interval includes 0, may be chance.
      if (paired && (reading === "better" || reading === "worse" || reading === "mixed")) {
        const moved = new Set(compares.filter((c) => c.signal === "better" || c.signal === "worse").map((c) => c.path));
        const crossing = paired.ci.filter((x) => moved.has(x.path) && x.signal === "same" && x.ci !== null);
        if (crossing.length > 0) notes.push(`the ranges say ${reading} and the paired interval includes 0: ${crossing.map((x) => `${x.path} ${interval(x)}`).join("; ")}`);
      }
      notes.push(...moreErrors(config.eval, bm, cm));
      rows.push({
        ...row,
        ...shown,
        rescored: same.again !== null,
        n: Math.min(bm.n, cm.n),
        verdict,
        note: notes.join("; "),
        metrics: compares.map((c) => ({ path: c.path, role: c.role, dir: c.dir, signal: c.signal, baseline: c.base, config: c.cfg })),
        calls: { baseline: bm.calls, config: cm.calls },
        seconds: { baseline: bm.seconds, config: cm.seconds },
        n_errored: { baseline: bm.n_errored, config: cm.n_errored },
        baseline_akm_build: bm.akm_build,
        baseline_akm_version: bm.akm_version,
        baseline_akm_build_fingerprint: bm.akm_build_fingerprint ?? null,
        exploratory,
        paired,
        coverage: { baseline: found.cases?.baseline ?? null, config: found.cases?.config ?? null },
        cases: found.cases ? { baseline_only: found.cases.baseline_only, config_only: found.cases.config_only } : null,
        context: (EVALS[config.eval]?.context ?? []).map((path) => ({ path, baseline: metricSpread(bm, path), config: metricSpread(cm, path) })),
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
  const hint = f.min_delta_hint === null ? "" : f.min_delta_hint === 0 ? "; the main metrics were the same in every run, so there is no floor for --min-delta" : `; a main metric differs by ${trim(f.min_delta_hint)} on average between two runs of one configuration, so start --min-delta at ${trim(f.min_delta_hint)}`;
  return `${who}: ${f.runs} runs, mean flip rate ${trim(f.flip_rate)}, about ${trim(f.expected_flips ?? 0)} of ${f.n_compared} cases flip between two runs of one configuration${hint}`;
}

const trim = (x: number): string => String(Number(x.toFixed(3)));
const fmtSpread = (s: Spread | null): string => (s === null ? "–" : s.min === s.max ? trim(s.mean) : `${trim(s.mean)} (${trim(s.min)}–${trim(s.max)})`);
const fmtNum = (x: number | null): string => (x === null ? "–" : trim(x));
const ARROW: Record<Dir, string> = { up: "↑", down: "↓" };
/**
 * An akm build for a table: its git describe, or "release" with the version when it is a release (an upgrade changes only that), and for a
 * checkout with uncommitted changes the first characters of their digest, since two edits of one commit have one git describe.
 */
const buildLabel = (build: string | null, version: string | null, fingerprint: string | null = null): string => `${build ?? (version ? `release ${version}` : "release")}${fingerprint ? ` (${fingerprint.slice(0, 8)})` : ""}`;

/** What a side scored, for a table: the cases with a verdict of the cases it was given, and the errored ones. */
const fmtCoverage = (c: Coverage | null): string => (c === null ? "–" : `${trim(c.scored)} of ${trim(c.selected)}${c.errored > 0 ? `, ${trim(c.errored)} errored` : ""}`);
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
  const out = [`# Matrix decision: ${d.prefix}`, "", `Matrix \`${basename(d.matrix)}\`, generated ${d.generated}. A cell reads baseline → config, as mean (min–max over the repeats). ↑ higher is better, ↓ lower is better; harm must not rise. Verdicts apply one rule to every metric, harm included: the config's range lies wholly on one side of the baseline's, with a gap at least as wide as the wider range; n=1 is "screen only". The scored column is the cases that got a verdict of the cases given, per run, and how many errored. A config with more errored cases than its baseline is never "better" (it is "incomplete"), and a row is "exploratory", not a conclusion, when its summaries lack the evidence that only the treatment differs, a side has fewer than ${MIN_REPEATS} repeats, the two sides scored different cases, or (retrieval) the share of judged results fell.`, ""];
  if (d.rows.some((r) => r.treatment.includes("build"))) out.push("A row whose config runs another akm build than its baseline shows both builds in the akm build column, a release with its version, a checkout with changes that are not committed with the start of the digest of those changes. Every axis outside the row's treatment must still be the same, the model included.", "");
  const shows = (...evals: string[]): boolean => d.rows.some((r) => evals.includes(r.eval) && r.context.some((x) => x.baseline || x.config));
  if (shows("retrieval")) out.push("Retrieval rows also show ndcg_10_condensed (nDCG over the results that someone graded) and judged_10 (the share of results that someone graded) under the main metrics. They are not judged. ndcg_10 counts a result nobody graded as not relevant, so a config whose judged_10 falls is exploratory until its results are labelled (evals/retrieval/label --from its results folder).", "");
  if (shows("extract")) out.push("Extract rows also show planted.ambiguous under the main metrics: the planted sessions whose memory holds the planted phrase only behind a negation the scorer cannot read, and asserts none. It is a count to look at, not a metric that is judged: read those memories (`ambiguous` in samples.jsonl), since one of them may be the instruction saved.", "");
  if (shows("bakeoff", "longmemeval", "skillret")) out.push("Bakeoff, longmemeval and skillret rows also show metrics under the main metrics that are not judged: bakeoff's valid_output.rate, longmemeval's answers without akm, the difference between the two arms, mrr and ndcg of the sessions akm returned, and skillret's recall, completeness and MAP at 10.", "");
  if (d.rows.some((r) => r.collector.baseline || r.collector.config)) out.push("The collector, scorer column shows the versions of `MEASUREMENT.lock` that the runs behind each side were collected and scored with, baseline → config. Two collector versions are not comparable unless `harness` is the row's treatment. When the two sides were scored by different scorers or against different labels, or by a scorer or against labels other than the ones this checkout has now (a relabelled case does not run a row again), both are scored again with the current scorer before they are compared (the row says so), and the column shows the versions the stored results were scored with.", "");
  if (d.rows.some((r) => r.paired)) out.push("The paired column is scripts/compare on all the repeats of the baseline and of the config, pooled by case: each case is scored by its mean over the repeats of a side, and the order of the repeats does not matter. It shows the cases whose mean went up (better) and down (worse), the cases that agree and the sign test on the flips, then each metric as config minus baseline with the 95% interval of a bootstrap over the cases. It does not change the verdict; a \"no difference\" whose interval excludes 0 says so in its note.", "");
  const groups = new Map<string, DecisionRow[]>();
  for (const r of d.rows) groups.set(`${r.eval}${r.scope ? ` (${r.scope})` : ""} vs ${r.baseline}`, [...(groups.get(`${r.eval}${r.scope ? ` (${r.scope})` : ""} vs ${r.baseline}`) ?? []), r]);
  for (const [title, rows] of groups) {
    const withPaired = rows.some((r) => r.paired);
    const withParts = rows.some((r) => r.collector.baseline || r.collector.config || r.scorer.baseline || r.scorer.config);
    out.push(`## ${title}`, "", `| config | runs | main metric | harm | scored | calls | seconds | akm build | model |${withParts ? " collector, scorer |" : ""}${withPaired ? " paired |" : ""} verdict |`, `|---|---|---|---|---|---|---|---|---|${withParts ? "---|" : ""}${withPaired ? "---|" : ""}---|`);
    for (const r of rows) {
      const cell = (role: "main" | "harm") =>
        [
          ...r.metrics.filter((x) => x.role === role && (x.baseline || x.config)).map((x) => `${x.path} ${ARROW[x.dir]} ${fmtSpread(x.baseline)} → ${fmtSpread(x.config)}`),
          ...(role === "main" ? r.context.filter((x) => x.baseline || x.config).map((x) => `${x.path} ${fmtSpread(x.baseline)} → ${fmtSpread(x.config)}`) : []),
        ].join("<br>") || "–";
      const pair = (p: { baseline: number | null; config: number | null }) => `${fmtNum(p.baseline)} → ${fmtNum(p.config)}`;
      const build = r.treatment.includes("build") ? `${buildLabel(r.baseline_akm_build, r.baseline_akm_version, r.baseline_akm_build_fingerprint)} → ${buildLabel(r.akm_build, r.akm_version, r.akm_build_fingerprint)}` : buildLabel(r.akm_build, r.akm_version, r.akm_build_fingerprint);
      const parts = (p: { baseline: string | null; config: string | null }) => `${p.baseline ?? "–"} → ${p.config ?? "–"}`;
      const partsCell = `collector ${parts(r.collector)}<br>scorer ${parts(r.scorer)}${r.rescored ? " (scored again)" : ""}`;
      out.push(`| ${r.config} | ${r.n} | ${cell("main")} | ${cell("harm")} | ${fmtCoverage(r.coverage.baseline)} → ${fmtCoverage(r.coverage.config)} | ${pair(r.calls)} | ${pair(r.seconds)} | ${build} | ${r.model ?? "–"} |${withParts ? ` ${partsCell} |` : ""}${withPaired ? ` ${pairedCell(r.paired)} |` : ""} **${r.verdict}**${r.note ? `<br>${r.note}` : ""} |`);
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}
