// What the matrix takes from scripts/compare: the paired comparison of a baseline's repeats with a config's, and the noise floor of a
// baseline's repeats. compare reads summary.json and samples.jsonl of results folders; this file only turns what it reports into the
// few numbers a decision row carries. See ../../compare/README.md and ../../../README.md ("Run a matrix").

import { CompareError, SUPPORTED, comparePair, compareRepeats, loadRun, type PairReport } from "../../compare/src/lib.ts";
import type { Dir, Signal } from "./lib.ts";

/** A metric of the paired comparison: the config's value minus the baseline's on the cases both runs gave a verdict, with its 95% interval. */
export interface PairedMetric {
  /** "" for the eval's one table, else the column (retrieval). */
  view: string;
  path: string;
  role: "main" | "harm";
  dir: Dir;
  delta: number | null;
  /** The 95% paired bootstrap interval of the delta over the cases. */
  ci: [number, number] | null;
  /** better or worse when the interval lies wholly on that side of 0 (with the metric's direction), else same. */
  signal: Signal;
}

/** One pair of runs: r<run> of the baseline against r<run> of the config. Flips are cases that changed verdict, over the cases both gave one. */
export interface PairedRun {
  run: number;
  /** The table the counts are of: "" for the eval's one table, else the first column (retrieval). */
  view: string;
  n_paired: number;
  better: number;
  worse: number;
  agree: number;
  /** The exact two-sided sign test on the cases that disagree. Null when none does. */
  p: number | null;
  ci: PairedMetric[];
}

/** The first pair of repeats (r1 against r1), with every pair compared in `runs`. */
export interface Paired extends PairedRun {
  /** How many pairs were compared: 1, or all the repeats when both sides have the same number of them. */
  pairs: number;
  runs: PairedRun[];
  warnings: string[];
}

/** What compare says when it refuses. Anything else it throws is reported too, since a decision should not be lost to a bad results folder. */
const why = (e: unknown): string => (e instanceof CompareError ? e.message : `scripts/compare failed: ${e instanceof Error ? e.message : String(e)}`);

const oneRun = (run: number, r: PairReport): PairedRun => {
  const first = r.views[0];
  return {
    run,
    view: first.view,
    n_paired: first.n_paired,
    better: first.better.length,
    worse: first.worse.length,
    agree: first.agree.n,
    p: first.sign_test.p,
    ci: r.views.flatMap((v) => v.metrics.map((m) => ({ view: v.view, path: m.path, role: m.role, dir: m.dir, delta: m.delta, ci: m.ci, signal: m.signal }))),
  };
};

/**
 * Compares the repeats of a baseline with those of a config, case by case, with scripts/compare: r1 against r1, and when both sides have the
 * same number of repeats every r<i> against r<i>. The repeats are separate runs of one configuration, so their pairing is arbitrary: the first
 * pair is the one the decision row reports, and the others say whether the same metrics differ again. Null, with a note, when compare
 * refuses the runs (another akm version, a run with no samples, ...); null without one for an eval compare has no per-case reading for.
 */
export function pairedOf(evalName: string, baseDirs: string[], cfgDirs: string[]): { paired: Paired | null; note: string | null } {
  if (!SUPPORTED.includes(evalName) || baseDirs.length === 0 || cfgDirs.length === 0) return { paired: null, note: null };
  const n = baseDirs.length === cfgDirs.length ? baseDirs.length : 1;
  const runs: PairedRun[] = [];
  const warnings: string[] = [];
  for (let i = 0; i < n; i++) {
    try {
      const report = comparePair(loadRun(baseDirs[i]), loadRun(cfgDirs[i]));
      runs.push(oneRun(i + 1, report));
      warnings.push(...report.warnings.map((w) => (n > 1 ? `r${i + 1}: ${w}` : w)));
    } catch (e) {
      if (i === 0) return { paired: null, note: `no paired comparison: ${why(e)}` };
      warnings.push(`r${i + 1} was not compared: ${why(e)}`);
    }
  }
  return { paired: { ...runs[0], pairs: runs.length, runs, warnings }, note: null };
}

/**
 * The metrics, main or harm, whose paired interval excludes 0 in the first pair, and in how many of the compared pairs the same metric
 * is on the same side of 0.
 */
export function pairedDifferent(p: Paired): { metric: PairedMetric; pairs: number }[] {
  return p.ci
    .filter((m) => m.signal === "better" || m.signal === "worse")
    .map((metric) => ({ metric, pairs: p.runs.filter((r) => r.ci.some((x) => x.view === metric.view && x.path === metric.path && x.signal === metric.signal)).length }));
}

/** The per-case noise of a run repeated with nothing changed, from scripts/compare's `--repeats`. */
export interface NoiseFloor {
  view: string;
  runs: number;
  /** Cases with a verdict in at least two runs, and how many of them were not the same in every run. */
  n_compared: number;
  n_unstable: number;
  /** The mean over the cases of the share of the pairs of runs in which the case changes verdict, and the same as a number of cases. */
  flip_rate: number | null;
  expected_flips: number | null;
  /** The largest difference between two runs of a main metric: where to start a --min-delta. */
  min_delta_hint: number | null;
}

/** The noise floor of the runs in `dirs`, which must be repeats of one configuration. Empty, with a note, when compare cannot read them. */
export function noiseOf(evalName: string, dirs: string[]): { floors: NoiseFloor[]; note: string | null } {
  if (!SUPPORTED.includes(evalName) || dirs.length < 2) return { floors: [], note: null };
  try {
    const report = compareRepeats(dirs.map(loadRun));
    return { floors: report.views.map((v) => ({ view: v.view, runs: report.runs.length, n_compared: v.n_compared, n_unstable: v.n_unstable, flip_rate: v.noise_floor.flip_rate, expected_flips: v.noise_floor.expected_flips, min_delta_hint: v.min_delta_hint })), note: null };
  } catch (e) {
    return { floors: [], note: why(e) };
  }
}
