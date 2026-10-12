#!/usr/bin/env bun
// rescore: scores stored results folders again with the current scorer and the current labels of their eval, from the raw output in
// samples.jsonl, and writes each result to a new folder beside the original. It runs no akm and no model. See the README's "How results stay comparable".

import { parseArgs } from "node:util";
import { RescoreError, rescoreFolder } from "./lib.ts";

const USAGE = `Usage: scripts/rescore/run RESULTS_DIR...

Scores each results folder (or the summary.json in it) of an eval again: the raw output each case's row holds is scored with the scorer
and the labels (the cases) that the repository has now, and the result is written to a new folder beside the original,
<folder>-rescored (before the -rN of a repeat). The original is never modified. The new summary.json has the current scorer in its
manifest, the collector of the original run, and rescored_from. A run without a manifest (from before harness-v3) is rescored too, with
version 0 as its collector.

A run whose rows lack a field the scorer reads is refused, and the fields are named. So is a run of an eval that has no src/measurement.ts.
Exit code 0 when every folder was rescored, 2 when one was refused.`;

function main(): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, strict: true, options: { help: { type: "boolean", short: "h" } } });
  } catch (e) {
    console.error(`rescore: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed as { values: { help?: boolean }; positionals: string[] };
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals.length === 0) {
    console.error(`rescore: give one or more results folders\n\n${USAGE}`);
    return 2;
  }
  let refused = 0;
  for (const path of positionals) {
    try {
      const { out, result } = rescoreFolder(path);
      const was = result.legacy ? "no manifest" : "manifest";
      console.log(`rescore: ${path} -> ${out}`);
      console.log(`  ${result.rows.length} cases scored again (${was}); ${result.changed.length} rows differ from the stored ones${result.changed.length > 0 ? `: ${result.changed.slice(0, 8).join(", ")}${result.changed.length > 8 ? ", ..." : ""}` : ""}`);
      if (result.relabelled.length > 0) console.log(`  ${result.relabelled.length} cases have other labels than when the run was made: ${result.relabelled.slice(0, 8).join(", ")}${result.relabelled.length > 8 ? ", ..." : ""}`);
      if (result.dropped.length > 0) console.log(`  ${result.dropped.length} cases are no longer in the corpus and were left out: ${result.dropped.slice(0, 8).join(", ")}`);
    } catch (e) {
      if (!(e instanceof RescoreError)) throw e;
      console.error(`rescore: ${e.message}`);
      refused++;
    }
  }
  return refused > 0 ? 2 : 0;
}

process.exit(main());
