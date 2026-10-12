#!/usr/bin/env bun
// compare: sets two results folders of an eval side by side case by case, or two sets of repeats, or measures the flip rate of the runs of a --repeat.
// It reads summary.json and samples.jsonl and runs nothing. See ../README.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CompareError, DEFAULTS, DEFAULT_TREATMENT, SUPPORTED, compareRepeats, comparePair, compareSets, findRepeats, loadRun, renderPair, renderRepeats } from "./lib.ts";
import { AXES, PolicyError, parseAxes, type Axis } from "./policy.ts";

const USAGE = `Usage: scripts/compare/run A B [--treatment AXES] [--json FILE] [--md FILE] [--seed N] [--resamples N] [--tie X]
       scripts/compare/run --repeats PREFIX --against PREFIX [--treatment AXES] [--collection NAME] [--json FILE] [--md FILE] [--seed N] [--resamples N] [--tie X]
       scripts/compare/run --repeats PREFIX [--collection NAME] [--json FILE] [--md FILE] [--tie X]

Compares two runs of one eval on one corpus, case by case. A and B are results folders (or the summary.json in them), for example
the same eval before and after a change to akm: B is read against A. It reports the cases that agree, flipped to better and flipped to
worse, with their ids, an exact sign test on the cases that disagree, and a paired bootstrap confidence interval (95%) on each eval's
main and harm metrics, the ones scripts/matrix judges. The two runs must be of the same eval, corpus and collection, and may differ
only in the treatment. Reads ${SUPPORTED.join(", ")}.

  --treatment AXES  what B changes against A: one or more of ${AXES.join(", ")}, separated by commas (default ${DEFAULT_TREATMENT.join(",")}).
                    build is the akm: its version, build and command. config is the strategy, the config patch, the akm config and the
                    time limit. model is the model and its engine settings. inputs is the cases and the private seed. harness is this
                    repository's code (harness_sha256, else a clean git_commit; for a run with a manifest, its collector). Every axis not
                    named must be the same in every run, or the comparison is refused. An axis the summaries do not record the
                    evidence for makes the report exploratory. The eval, corpus, collection, mode and embedder are the scope: they
                    must be the same whatever the treatment. Runs with a manifest that were scored differently are scored again
                    with the current scorer first (scripts/rescore), and a case with another input in the runs is left out
  --repeats PREFIX  the runs of a --repeat instead: PREFIX is the results folder's path up to the label, for example
                    evals/nightly/results/2026-10-11-baseline, which finds ...-baseline-r1 to ...-baseline-rN (or the path of a
                    ...-repeat-summary.json). Alone it reports each case's flip rate across the runs and the eval's noise floor, the mean
                    flip rate; the runs must be repeats of one configuration, the same in every axis
  --against PREFIX  with --repeats: the repeats of another configuration, B against A. Each case is scored by its mean over the repeats of
                    a side, so the order of the repeats does not matter
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
    parsed = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, strict: true, options: { repeats: { type: "string" }, against: { type: "string" }, treatment: { type: "string" }, collection: { type: "string" }, json: { type: "string" }, md: { type: "string" }, seed: { type: "string" }, resamples: { type: "string" }, tie: { type: "string" }, help: { type: "boolean", short: "h" } } });
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
    const treatment: Axis[] | undefined = values.treatment === undefined ? undefined : parseAxes(String(values.treatment));
    let json: unknown;
    let md: string;
    if (values.repeats !== undefined && values.against === undefined) {
      if (positionals.length > 0) throw new CompareError(`--repeats takes a prefix and no folders\n\n${USAGE}`);
      for (const flag of ["seed", "resamples"]) if (values[flag] !== undefined) throw new CompareError(`--${flag} does not apply to --repeats alone, which has no bootstrap`);
      if (treatment) throw new CompareError("--treatment does not apply to --repeats alone: the runs of a repeat have no treatment, and must be the same in every axis. Give --against to compare two sets of repeats");
      const report = compareRepeats(findRepeats(values.repeats as string, values.collection as string | undefined).map(loadRun), { tie });
      [json, md] = [report, renderRepeats(report)];
    } else if (values.repeats !== undefined) {
      if (positionals.length > 0) throw new CompareError(`--repeats and --against take prefixes and no folders\n\n${USAGE}`);
      const sets = [values.repeats, values.against].map((p) => findRepeats(p as string, values.collection as string | undefined).map(loadRun));
      const report = compareSets(sets[0], sets[1], { seed, resamples, tie, treatment });
      [json, md] = [report, renderPair(report)];
    } else {
      if (values.against !== undefined) throw new CompareError("--against goes with --repeats");
      if (positionals.length !== 2) throw new CompareError(`give two results folders, or --repeats\n\n${USAGE}`);
      if (values.collection !== undefined) throw new CompareError("--collection applies to --repeats only");
      const report = comparePair(loadRun(positionals[0]), loadRun(positionals[1]), { seed, resamples, tie, treatment });
      [json, md] = [report, renderPair(report)];
    }
    console.log(md);
    if (typeof values.json === "string") write(values.json, `${JSON.stringify(json, null, 2)}\n`);
    if (typeof values.md === "string") write(values.md, md);
    return 0;
  } catch (e) {
    if (!(e instanceof CompareError) && !(e instanceof PolicyError)) throw e;
    console.error(`compare: ${e.message}`);
    return 2;
  }
}

process.exit(main());
