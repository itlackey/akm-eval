// `--repeat N`: runs a corpus N times, each into its own results folder `<UTC date>-<label>-r1` to `-rN`, and writes the spread of
// the metrics next to them, in `<UTC date>-<label>-repeat-summary.json`. A run of a model differs by a case or two from the next,
// so a change smaller than that spread is not a change. Each run is a whole run of the eval, with the same summary.json as one
// made without --repeat. A run's `.running` file is removed when that run is done, so a script that waits for r1 sees it end.

import { existsSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { clearRunning } from "./results.ts";

/** What the spread needs of a run's summary. */
interface Summarized {
  eval: string;
  corpus: string;
  model?: string; // an eval that runs no model, such as retrieval, has none
  akm_version: string;
  akm_bin: string;
  akm_build: string | null;
  n_errored: number;
  metrics: unknown;
  results_dir: string;
}

export interface Spread {
  min: number;
  max: number;
  mean: number;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * The shape of the metrics, with every number replaced by its minimum, maximum and mean over the runs. A number that is null in
 * some runs (a rate with nothing to divide) is taken over the runs where it is a number, and is null when it is in none.
 */
export function spreadOf(runs: unknown[]): unknown {
  if (runs.some(isObject)) {
    const objects = runs.filter(isObject);
    const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))];
    return Object.fromEntries(keys.map((k) => [k, spreadOf(objects.map((o) => o[k]))]));
  }
  const numbers = runs.filter((x): x is number => typeof x === "number");
  if (numbers.length === 0) return null;
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  return { min: Math.min(...numbers), max: Math.max(...numbers), mean: Number(mean.toFixed(4)) };
}

/**
 * Runs `runOne` once with `label` when `times` is undefined. Otherwise runs it `times` times, one after the other, with the labels
 * `<label>-r1` to `<label>-rN`, and writes `<UTC date>-<label>-repeat-summary.json` into the folder the runs' results are in.
 * Returns the summaries in order.
 */
export async function repeatRuns<S extends Summarized>(times: number | undefined, label: string, runOne: (label: string) => Promise<S>): Promise<S[]> {
  if (times === undefined) return [await runOne(label)];
  const runs: S[] = [];
  const seconds: number[] = []; // wall time of each run, the same thing for every eval
  for (let i = 1; i <= times; i++) {
    const t0 = performance.now();
    const run = await runOne(`${label}-r${i}`);
    seconds.push(Number(((performance.now() - t0) / 1000).toFixed(1)));
    clearRunning(run.results_dir);
    runs.push(run);
  }
  const first = runs[0];
  const base = join(dirname(first.results_dir), `${new Date().toISOString().slice(0, 10)}-${label}-repeat-summary`);
  let file = `${base}.json`;
  for (let n = 2; existsSync(file); n++) file = `${base}-${n}.json`;
  const { eval: name, corpus, model, akm_version, akm_bin, akm_build } = first;
  const summary = { eval: name, corpus, label, repeat: times, model, akm_version, akm_bin, akm_build, runs: runs.map((r) => basename(r.results_dir)), n_errored: spreadOf(runs.map((r) => r.n_errored)), seconds: spreadOf(seconds), metrics: spreadOf(runs.map((r) => r.metrics)) };
  writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\n${name} (${corpus}): ${times} runs, spread in ${basename(file)}`);
  return runs;
}
