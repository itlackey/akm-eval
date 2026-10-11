#!/usr/bin/env bun
// compare: sets two results folders of an eval side by side case by case, or measures the flip rate of the runs of a --repeat.
// It reads summary.json and samples.jsonl and runs nothing. See ../README.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CompareError, DEFAULTS, SUPPORTED, compareRepeats, comparePair, findRepeats, loadRun, renderPair, renderRepeats } from "./lib.ts";

const USAGE = `Usage: scripts/compare/run A B [--json FILE] [--md FILE] [--seed N] [--resamples N] [--tie X]
       scripts/compare/run --repeats PREFIX [--collection NAME] [--json FILE] [--md FILE] [--tie X]

Compares two runs of one eval on one corpus, case by case. A and B are results folders (or the summary.json in them), for example
the same eval before and after a change to akm: B is read against A. It reports the cases that agree, flipped to better and flipped to
worse, with their ids, an exact sign test on the cases that disagree, and a paired bootstrap confidence interval (95%) on each eval's
main and harm metrics, the ones scripts/matrix judges. The two runs must be of the same eval, corpus and akm version; a different akm
build, model, strategy or config patch is what is being compared. Reads ${SUPPORTED.join(", ")}.

  --repeats PREFIX  the runs of a --repeat instead: PREFIX is the results folder's path up to the label, for example
                    evals/nightly/results/2026-10-11-baseline, which finds ...-baseline-r1 to ...-baseline-rN (or the path of a
                    ...-repeat-summary.json). Reports each case's flip rate across the runs and the eval's noise floor, the mean flip rate.
  --collection NAME retrieval with --repeats: the collection, when the prefix matches the runs of more than one
  --json FILE       write the report as JSON
  --md FILE         write the report as markdown (it is printed to the terminal in any case)
  --seed N          the bootstrap's seed (default ${DEFAULTS.seed}); the same seed gives the same intervals
  --resamples N     bootstrap resamples (default ${DEFAULTS.resamples})
  --tie X           retrieval: a query whose ndcg moved by X or less did not change (default ${DEFAULTS.tie})`;

function integer(value: string | undefined, flag: string, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new CompareError(`${flag} must be an integer of ${min} or more`);
  return n;
}

function write(file: string, text: string): void {
  const path = resolve(file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.error(`compare: wrote ${path}`);
}

function main(): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, strict: true, options: { repeats: { type: "string" }, collection: { type: "string" }, json: { type: "string" }, md: { type: "string" }, seed: { type: "string" }, resamples: { type: "string" }, tie: { type: "string" }, help: { type: "boolean", short: "h" } } });
  } catch (e) {
    console.error(`compare: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed as { values: Record<string, string | boolean | undefined>; positionals: string[] };
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  try {
    const seed = integer(values.seed as string | undefined, "--seed", DEFAULTS.seed, 0);
    const resamples = integer(values.resamples as string | undefined, "--resamples", DEFAULTS.resamples, 100);
    const tie = values.tie === undefined ? DEFAULTS.tie : Number(values.tie);
    if (!Number.isFinite(tie) || tie < 0) throw new CompareError("--tie must be a number of 0 or more");
    let json: unknown;
    let md: string;
    if (values.repeats !== undefined) {
      if (positionals.length > 0) throw new CompareError(`--repeats takes a prefix and no folders\n\n${USAGE}`);
      for (const flag of ["seed", "resamples"]) if (values[flag] !== undefined) throw new CompareError(`--${flag} does not apply to --repeats, which has no bootstrap`);
      const report = compareRepeats(findRepeats(values.repeats as string, values.collection as string | undefined).map(loadRun), { tie });
      [json, md] = [report, renderRepeats(report)];
    } else {
      if (positionals.length !== 2) throw new CompareError(`give two results folders, or --repeats\n\n${USAGE}`);
      if (values.collection !== undefined) throw new CompareError("--collection applies to --repeats only");
      const report = comparePair(loadRun(positionals[0]), loadRun(positionals[1]), { seed, resamples, tie });
      [json, md] = [report, renderPair(report)];
    }
    console.log(md);
    if (typeof values.json === "string") write(values.json, `${JSON.stringify(json, null, 2)}\n`);
    if (typeof values.md === "string") write(values.md, md);
    return 0;
  } catch (e) {
    if (!(e instanceof CompareError)) throw e;
    console.error(`compare: ${e.message}`);
    return 2;
  }
}

process.exit(main());
