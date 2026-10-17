#!/usr/bin/env bun
// reflect: runs akm's reflect on one asset at a time, with the model under test as its engine, and scores what it
// proposes with checks that need no judge. See ../README.md.
//
//   evals/reflect/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--retrieval-queries] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]
//
// The flags, the setup, the pool of workers and the summary are lib/run.ts. This file is what is reflect's: the spec that says what a case is and
// how it is shown, and the --retrieval-queries flag.

import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { DEFAULT_TIMEOUT_MS } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type CtxInput, type EvalSpec, type Summary, corpusFolder, defaultResults as resultsIn, runCorpus as runIn, runEval } from "../../../lib/run.ts";
import { type CaseContext, NAME, STRATEGY, configFor, refOf, runCase } from "./collect.ts";
import { MEASUREMENT } from "./measurement.ts";
import { retrievalSearches } from "./queries.ts";
import { type Case, type Row, CLASSES, assetsSha256, parseCases, pct, selectCases, summarize } from "./lib.ts";

export { corpusFolder, runCase };
const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
export const MIN_AKM = "0.9.25-alpha.3"; // the first release where reflect changes only the frontmatter

/** What reflect adds to the context of a case: the searches to record for each note. */
type Extra = Pick<CaseContext, "queries">;

/** The fields of a reflect summary that come from its rows and from --retrieval-queries, besides those every eval has. */
type Own = ReturnType<typeof summarize> & {
  /** With --retrieval-queries, how many of the cases had queries recorded. */
  retrieval_queries: { cases: number } | null;
};

const cell = (n: { correct: number; n: number } | undefined): string => (n ? `${n.correct}/${n.n}` : "-");

function printSummary(s: Summary & Own): void {
  const m = s.metrics;
  console.log(`\n${NAME} (${s.corpus}) | model ${s.model} | akm ${s.akm_version} | ${s.n_run} of ${s.n_cases} cases`);
  console.log(`  defects fixed   ${cell(m.defects)}  ${pct(m.defects.rate)}`);
  console.log(`  controls right  ${cell(m.controls)}  ${pct(m.controls.rate)}`);
  console.log(`  proposals       ${m.proposals.n}, ${m.proposals.touched_body} touched the body`);
  const r = m.refused;
  if (r.filter + r.judge + r.retrieval + r.other > 0) console.log(`  refused         ${r.filter} by akm's defect filter, ${r.judge} by the judge, ${r.retrieval} by the retrieval check${r.other ? `, ${r.other} other` : ""}`);
  console.log(`  errored         ${s.n_errored}${s.timeouts > 0 ? ` (${s.timeouts} timed out)` : ""}`);
  if (Object.keys(s.served).length > 0) console.log(`  served by       ${Object.entries(s.served).map(([name, n]) => `${name} ${n}`).join(", ")}`);
  for (const cls of CLASSES) {
    const k = m.classes[cls];
    if (!k) continue;
    const failed = Object.entries(k.failed).map(([name, n]) => `${name} ${n}`).join(", ");
    const other = (["none", "refused", "unusable", "error"] as const).filter((o) => k.outcomes[o] > 0 && (o !== "none" || k.correct < k.n)).map((o) => `${o} ${k.outcomes[o]}`).join(", ");
    console.log(`    ${cls.padEnd(22)} ${cell(k).padEnd(5)} ${[failed && `failed: ${failed}`, other && `outcomes: ${other}`].filter(Boolean).join("; ")}`);
  }
  console.log(`  results         ${relative(ROOT, s.results_dir)}/`);
}

/** The rows of the table of the two summaries, public and custom. */
function sideBySide(a: Summary & Own, b: Summary & Own): [string, string, string][] {
  return [
    ["defects fixed", `${cell(a.metrics.defects)}  ${pct(a.metrics.defects.rate)}`, `${cell(b.metrics.defects)}  ${pct(b.metrics.defects.rate)}`],
    ["controls right", `${cell(a.metrics.controls)}  ${pct(a.metrics.controls.rate)}`, `${cell(b.metrics.controls)}  ${pct(b.metrics.controls.rate)}`],
    ["touched the body", `${a.metrics.proposals.touched_body} of ${a.metrics.proposals.n}`, `${b.metrics.proposals.touched_body} of ${b.metrics.proposals.n}`],
    ["errored", String(a.n_errored), String(b.n_errored)],
    ...CLASSES.filter((cls) => a.metrics.classes[cls] || b.metrics.classes[cls]).map((cls): [string, string, string] => [`  ${cls}`, cell(a.metrics.classes[cls]), cell(b.metrics.classes[cls])]),
  ];
}

const SPEC: EvalSpec<Case, Row, Extra> = {
  measurement: MEASUREMENT,
  dir: EVAL_DIR,
  strategy: STRATEGY,
  minAkm: MIN_AKM,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  loadCases: (folder) => {
    const file = join(folder, "cases.jsonl");
    return parseCases(readFileSync(file, "utf8"), file);
  },
  selectCases,
  assetsSha256,
  configFor,
  runCase,
  progress: (c, row) => {
    const verdict = row.outcome === "error" ? `error  ${(row.error ?? "").slice(0, 120)}` : `${row.outcome.padEnd(8)} ${row.correct ? "ok" : `FAIL ${Object.entries(row.checks ?? {}).filter(([, ok]) => !ok).map(([name]) => name).join(",")}`}`;
    return `${c.id.padEnd(26)} ${verdict}  ${row.seconds}s`;
  },
  // what each case presented to akm includes the searches this run recorded for its note, so a run with --retrieval-queries is not the run without it (#37)
  caseContext: (c, ctx) => ctx.queries?.get(refOf(c.path)) ?? [],
  // The searches of every corpus are made now, so that a file that is missing stops the run here and not after the first corpus has run.
  prepare: (values, corpora) => {
    if (!values["retrieval-queries"]) return () => ({});
    const searches = new Map(corpora.map((c) => [c, retrievalSearches(c, ROOT)] as const));
    return (c) => ({ queries: searches.get(c) });
  },
  summaryExtras: (cases, _rows, ctx) => ({ retrieval_queries: ctx.queries ? { cases: cases.filter((c) => (ctx.queries?.get(refOf(c.path))?.length ?? 0) > 0).length } : null }),
  printSummary,
  sideBySide,
  options: { "retrieval-queries": { type: "boolean" } },
  usage: {
    about: `Runs akm's reflect on each case's note, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME as
its engine, and scores the proposal. Settings come from .env at the repository root.`,
    corpus: "            The default custom corpus is private/reflect/assets, made by ./generate-assets. A folder of your own holds cases.jsonl.",
    limit: "run the first N cases. The first ten hold each class once.",
    flags: "[--retrieval-queries]",
    extra: `  --retrieval-queries  record the retrieval eval's labelled queries for each note as searches that found it, so the retrieval
            check of akm's reflect (it runs after the quality judge passes an edit: see patches/judge-on.json) has queries to grade.
            The queries are those of the public notes: a rewrite takes them through its own map.json, matched by public ref. Not for an own corpus.`,
  },
};

/** The public results go to the eval's own folder, and those of a custom corpus to private/, which is gitignored. */
export const defaultResults = (corpus: ResolvedCorpus, root = ROOT): string => resultsIn(SPEC, corpus, root);

export const runCorpus = (corpus: ResolvedCorpus, ctx: CtxInput<Extra>, resultsParent?: string): Promise<Summary & Own> => runIn(SPEC, corpus, ctx, resultsParent) as Promise<Summary & Own>;

if (import.meta.main) await runEval(SPEC);
