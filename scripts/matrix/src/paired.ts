// What the matrix takes from scripts/compare: the paired comparison of a baseline's repeats with a config's, and the noise floor of a
// baseline's repeats. compare reads summary.json and samples.jsonl of results folders; this file only turns what it reports into the
// few numbers a decision row carries. See ../../compare/README.md and ../../../README.md ("Run a matrix").

import { CompareError, SUPPORTED, compareRepeats, compareSets, loadRun } from "../../compare/src/lib.ts";
import { PolicyError, type Axis } from "../../compare/src/policy.ts";
import type { Dir, Signal } from "./lib.ts";

/** A metric of the paired comparison: the config's value minus the baseline's on the cases both sides gave a verdict, with its 95% interval. */
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

/**
 * All the repeats of the baseline against all the repeats of the config, pooled by case: a case is scored by its mean over the repeats of a
 * side, a metric is the mean of the eval's metric over them, and the interval is a bootstrap over the cases. The order the repeats were
 * made in, or are listed in, changes nothing.
 */
export interface Paired {
  /** How many repeats of each side were pooled. */
  repeats: { baseline: number; config: number };
  /** The table the counts are of: "" for the eval's one table, else the first column (retrieval). */
  view: string;
  n_paired: number;
  /** Cases whose mean outcome is higher (better) or lower (worse) in the config, and that agree. */
  better: number;
  worse: number;
  agree: number;
  /** The exact two-sided sign test on the cases that disagree. Null when none does. */
  p: number | null;
  ci: PairedMetric[];
  warnings: string[];
}

/** What compare says when it refuses. Anything else it throws is reported too, since a decision should not be lost to a bad results folder. */
const why = (e: unknown): string => (e instanceof CompareError || e instanceof PolicyError ? e.message : `scripts/compare failed: ${e instanceof Error ? e.message : String(e)}`);

/**
 * Compares the repeats of a baseline with those of a config, case by case, with scripts/compare, under the treatment the row declares. Null,
 * with a note, when compare refuses the runs (a run with no samples, a table the runs do not share, ...); null without one for an eval compare
 * has no per-case reading for.
 */
export function pairedOf(evalName: string, baseDirs: string[], cfgDirs: string[], treatment: Axis[]): { paired: Paired | null; note: string | null } {
  if (!SUPPORTED.includes(evalName) || baseDirs.length === 0 || cfgDirs.length === 0) return { paired: null, note: null };
  try {
    const report = compareSets(baseDirs.map(loadRun), cfgDirs.map(loadRun), { treatment });
    const first = report.views[0];
    const paired: Paired = {
      repeats: { baseline: report.a_runs.length, config: report.b_runs.length },
      view: first.view,
      n_paired: first.n_paired,
      better: first.better.length,
      worse: first.worse.length,
      agree: first.agree.n,
      p: first.sign_test.p,
      ci: report.views.flatMap((v) => v.metrics.map((m) => ({ view: v.view, path: m.path, role: m.role, dir: m.dir, delta: m.delta, ci: m.ci, signal: m.signal }))),
      warnings: report.warnings,
    };
    return { paired, note: null };
  } catch (e) {
    return { paired: null, note: `no paired comparison: ${why(e)}` };
  }
}

/** The metrics, main or harm, whose paired interval excludes 0. */
export function pairedDifferent(p: Paired): PairedMetric[] {
  return p.ci.filter((m) => m.signal === "better" || m.signal === "worse");
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
