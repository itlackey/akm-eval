#!/usr/bin/env bun
// rescore: scores stored results folders again with the current scorer and the current labels of their eval, from the raw output in
// samples.jsonl, and writes each result to a new folder beside the original. It runs no akm and no model. See the README's "Compare two runs".

import { parseArgs } from "node:util";
import { RescoreError, rescoreFolder } from "./lib.ts";

const USAGE = `Usage: scripts/rescore/run [--cases DIR] RESULTS_DIR...

Scores each results folder (or the summary.json in it) of an eval again: the raw output each case's row holds is scored with the scorer
and the labels (the cases) that the repository has now, and the result is written to a new folder beside the original,
<folder>-rescored (before the -rN of a repeat). The original is never modified. The new summary.json has the current scorer in its
manifest, the collector of the original run, and rescored_from. A run without a manifest (made before akm-eval 0.2) is refused.

A run on the public corpus is scored against the committed cases. A run on a custom corpus is scored against the cases in its \`corpus_folder\`,
which the summary records when the folder is inside the repository. A folder outside it is not recorded (its name can say what is in it), so
give it with --cases DIR; DIR is from the repository root, as for the evals, or absolute. --cases applies to every folder given, and also
names the cases of a custom run whose folder has moved. The rescored summary records the folder it was scored against. The custom corpus
of benchmarks/skillret is a split of its dataset and has no folder: its queries are drawn from the dataset files
again, with no --cases, and a --cases given with it has no folder to apply to and is left unused.

A run whose rows lack a field the scorer reads is refused, and the fields are named. So is a run of an eval that has no src/measurement.ts,
a custom run whose cases cannot be found, or any selected case whose input changed.
No cases are silently dropped. Labels may change; the original collection identity stays recorded.
Exit code 0 when every folder was rescored, 2 when one was refused.`;

function main(): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, strict: true, options: { cases: { type: "string" }, help: { type: "boolean", short: "h" } } });
  } catch (e) {
    console.error(`rescore: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed as { values: { help?: boolean; cases?: string }; positionals: string[] };
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals.length === 0) {
    console.error(`rescore: give one or more results folders\n\n${USAGE}`);
    return 2;
  }
  if (values.cases !== undefined && values.cases.trim() === "") {
    console.error("rescore: --cases needs a folder");
    return 2;
  }
  let refused = 0;
  for (const path of positionals) {
    try {
      const { out, result } = rescoreFolder(path, { cases: values.cases });
      console.log(`rescore: ${path} -> ${out}`);
      console.log(`  ${result.rows.length} cases scored again; ${result.changed.length} rows differ from the stored ones${result.changed.length > 0 ? `: ${result.changed.slice(0, 8).join(", ")}${result.changed.length > 8 ? ", ..." : ""}` : ""}`);
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
