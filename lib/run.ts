// What the evals that give akm one case at a time share: their flags, their setup, the cases through a pool of workers, and the summary.json.
// An eval is a spec (EvalSpec): what it asks akm of a case and how it scores the answer stay in its own files, and the rest is done here, the
// same way for every eval.
//
//   if (import.meta.main) await runEval(SPEC);
//
// The order of a run: the flags, the corpora, --strategy and --config-patch, --akm, the model, the label, the cases file of a custom corpus,
// the eval's own setup (`prepare`), the destination of --cases, ONE akm version probe, ONE request to the model endpoint (lib/probe.ts; not with
// AKM_EVAL_NO_PROBE=1) and ONE akmBuild() for the whole run, the startup banner, then each corpus (each of its --repeat runs) in turn. What can
// fail for the person who started the run fails before the first case, a wrong URL, key or model name included.
//
// The banner says what the run is set to, read from the akm config the cases are given and from the flags, so that a setting that is not what
// the person believes (keyword search for semantic, thinking left on) shows before the run has cost anything.
//
// A run gives up when 5 rows in a row, in the order they finish, are errored (or, where the spec's giveUpOn says so, got no result): no new
// case starts, those running finish, the summary is written with status "aborted" and the reason, and the run fails with exit code 1.
//
// An eval that is not one case after another says so in its spec: `openRun` opens what the cases of a run share, `collectAll` runs them itself
// in place of the pool, and `abortReason` gives up on what only all the rows show.

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type ParseArgsConfig, parseArgs } from "node:util";
import { AKM_OPTIONS, type AkmBuild, akmBuild, akmUsage, akmVersion, atLeast, createSandbox, removeSandbox, useAkm } from "./akm/akm.ts";
import { OVERRIDE_OPTIONS, type Overrides, defaultOverrides, overrideSummary, overridesUsage, parseOverrides } from "./akm/overrides.ts";
import { type SemanticVerification, takeSemanticVerification } from "./akm/semantic.ts";
import { type ModelCalls, takeModelCalls } from "./akm/usage.ts";
import { Fatal, fail, gitCommit, hideEndpoint, slug } from "./cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, announceCases, corpusUsage, resolveCorpora } from "./corpus.ts";
import { type Measurement, type RunManifest, buildManifest, caseDigests, completionOf, corpusFolderOf } from "./manifest.ts";
import { MODEL_OPTIONS, modelUsage, useModel } from "./models.ts";
import { type Probe, probeModel } from "./probe.ts";
import { type EngineSettings, endpointHost, engineSettings, redactConfig } from "./provenance.ts";
import { repeatRuns } from "./repeat.ts";
import { makeResultsDir } from "./results.ts";

const ROOT = resolve(import.meta.dir, "..");

/** The override options of an eval with no strategy: --config-patch and --semantic. */
const { strategy: _strategy, ...PATCH_OPTIONS } = OVERRIDE_OPTIONS;

/** Errored rows in a row, in the order they finish, after which a run stops starting cases: the endpoint is down or rate limiting, and more cases would only hit it again. */
const GIVE_UP_AFTER = 5;

type Obj = Record<string, any>;

/** What every case of a run is given besides the case: the model, the settings of the run, and the akm that was probed. */
export interface RunCtx {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  /** The provider kind of akm's engine (see ModelSettings.provider). */
  provider: string;
  overrides: Overrides;
  /** How long one akm command may run, in milliseconds: --timeout-ms, else the spec's default. The summary records it. */
  timeoutMs: number;
  /** How many cases run at once: --concurrency, else the spec's default. */
  concurrency: number;
  /** The version akm printed. */
  version: string;
  label: string;
  limit?: number;
  /** The results folder of the corpus run, once it is made: for an eval that writes a file of its own beside samples.jsonl (consolidate --pool's improve.json). */
  resultsDir?: string;
  /** Which akm ran. A run takes it once at its start; without it (a test that calls runCorpus) the summary takes it when it is written. */
  build?: AkmBuild;
}

/** What runCorpus needs from a caller that is not a run (a test): the rest of the context takes the spec's defaults. */
export type CtxInput<X extends Obj = {}> = Pick<RunCtx, "baseUrl" | "model" | "hasKey" | "version" | "label"> & Partial<RunCtx> & X;

/** What a run writes to summary.json and returns, with `results_dir` (which is not written): the fields every eval has, then the eval's own. */
export interface Summary {
  eval: string;
  /** "public", or "custom" for any other folder of cases. */
  corpus: string;
  /** The folder of a custom corpus from the repository root, for scripts/rescore. Null for the public corpus, and for a folder outside the repository: its name can say what is in it, so it is not recorded. */
  corpus_folder: string | null;
  label: string;
  date: string;
  git_commit: string;
  model: string;
  akm_version: string;
  /** The AKM_BIN command and the git build it runs from, null for an installed release. See akmBuild. */
  akm_bin: string;
  akm_build: string | null;
  /** A sha256 over the changes to that checkout that are not committed (see dirtyFingerprint in lib/akm/akm.ts). Null for a clean checkout and for a release. */
  akm_build_fingerprint: string | null;
  limit: number | null;
  /** The strategy akm ran, and the config patch (path and SHA-256) merged into the config, if any. An eval with no strategy has no `strategy`. */
  strategy?: string;
  config_patch: { path: string; sha256: string } | null;
  /** The akm config the eval wrote, with secrets redacted and the endpoint written as <MODEL_BASE_URL>, and the settings of its engine. */
  config: Record<string, unknown>;
  engine: EngineSettings;
  /** The digest of what the run read of the corpus folder. */
  assets_sha256: string;
  /** The seed a rewrite was made with, from its generated.json. Null for every other corpus. */
  seed: string | null;
  /** "aborted" when the run gave up (the endpoint down or rate limiting) and so may have run fewer cases than it selected. Then aborted_reason says why. */
  status: "complete" | "aborted";
  aborted_reason: string | null;
  n_cases: number;
  n_run: number;
  n_scored: number;
  n_errored: number;
  /** The run's model calls, from akm's own record of them (lib/akm/usage.ts). */
  model_calls: ModelCalls | null;
  semantic_verification: SemanticVerification | null;
  /** How many cases ran at once. Absent for an eval that runs its cases as one batch (collectAll). */
  concurrency?: number;
  /** How long one akm command could run, in milliseconds. */
  timeout_ms: number;
  /** What the run was made of (see lib/manifest.ts). */
  manifest: RunManifest;
  results_dir: string;
  /** The eval's own metrics, from its `summarize`. */
  metrics: any;
  /** What the eval's summarize and summaryExtras add besides: its counts, and any other field. */
  [own: string]: any;
}

/** What an eval declares to be run: the measurement, the cases, the akm config and the case, and how its results are told. */
export interface EvalSpec<Case = any, Row extends Obj = Obj, Extra extends Obj = {}> {
  /** `eval` is the eval's name: `summary.eval`, and its folder under evals/. `summarize` gives the counts and metrics of a summary; `errored` decides the give-up rule. */
  measurement: Pick<Measurement<Case, any, Row>, "eval" | "version" | "scoringVersion" | "caseId" | "input" | "labels" | "errored" | "summarize">;
  /** The eval's folder, absolute: assets/ is its public corpus and results/ holds the results of a run on it. */
  dir: string;
  /** The strategy that --strategy replaces. An eval with none (bakeoff) leaves it out: it has no --strategy, its summary no `strategy`, and `overrides.strategy` is "". */
  strategy?: string;
  /** The first akm release the eval was tested with: a run on an older one warns, and --help says so. */
  minAkm?: string;
  /** How long one akm command may run without --timeout-ms, in milliseconds. */
  defaultTimeoutMs: number;
  /** How many cases run at once without --concurrency. Default: 1. */
  defaultConcurrency?: number;
  /** The file of a corpus folder that holds the cases. Default: cases.jsonl. */
  casesFile?: string;
  /** False for an eval with no rewrite (promotion): its custom corpus is --cases DIR only. */
  rewrite?: boolean;
  /** The cases of a corpus folder. Throws an Error that says what is wrong with them; the run ends with it. */
  loadCases(folder: string): Case[];
  /** The cases that run, from all of them and --limit. `ctx` is there for an eval whose own flag selects (bakeoff's --process). */
  selectCases(all: Case[], limit: number | undefined, ctx: RunCtx & Extra): Case[];
  /** The digest of what a run reads from a corpus folder, whose cases are `all`. */
  assetsSha256(folder: string, all: Case[]): string;
  /**
   * The akm config of the run. The summary and the manifest record it, and the eval's runCase writes it. The startup banner reads the search mode and the
   * engine's temperature and thinking from it, so it is the config akm is given, and it is asked once before the first case, with the context of the first
   * corpus and nothing that `openRun` opens.
   */
  configFor(ctx: RunCtx & Extra): Record<string, any>;
  /** One case: what akm is asked, and the scored row. An error of the case is a row that the measurement calls errored, not a throw. Not needed with `collectAll`. */
  runCase?(c: Case, ctx: RunCtx & Extra): Promise<Row>;
  /**
   * Why a row counts toward the give-up rule, or null when it does not: five such rows in a row stop the run. Default: an errored row, with its
   * `error`. judge-gate counts a reply with no verdict too, so a dead endpoint whose replies akm routes to review does not pass for a complete run.
   */
  giveUpOn?(row: Row): string | null;
  /** The progress line of a finished case, after its `[n/N]` counter. */
  progress(c: Case, row: Row): string;
  /**
   * Opens what the cases of one run of a corpus share (judge-gate's sandbox), after its results folder is made and before the first case. What it
   * returns joins the context that everything below is given. `close` runs when the cases are done, or threw, and after what the spec is asked
   * of the run (`configFor`, `summaryExtras`, `abortReason`, `caseContext`), but before the run's model calls are counted.
   */
  openRun?(ctx: RunCtx & Extra, corpus: ResolvedCorpus): Promise<Partial<Extra> & { close?(): void }>;
  /**
   * Runs the cases itself, in place of the pool (nightly's night, promotion's drain), and there is no --concurrency. `record` writes a row to
   * samples.jsonl and prints its progress line, as the pool does for each case. The rows returned are those of the summary, and `aborted` is
   * why it gave up, if it did: the rule is the eval's.
   */
  collectAll?(cases: Case[], ctx: RunCtx & Extra, record: (row: Row) => void): Promise<{ rows: Row[]; aborted?: string }>;
  /** Why the run gives up, from its rows, when the pool or collectAll did not: for what only all the rows show (consolidate's "akm paired none of the notes"). */
  abortReason?(rows: Row[], ctx: RunCtx & Extra): string | null;
  /** What the run adds to the input of a case in the manifest (see Measurement.input): reflect's recorded searches. */
  caseContext?(c: Case, ctx: RunCtx & Extra): unknown;
  /** The manifest's `mode` (consolidate --pool) and `eval_settings` (the embedder of consolidate and nightly), which scripts/compare shows. */
  manifestExtras?(ctx: RunCtx & Extra, corpus: ResolvedCorpus): { mode?: string | null; eval_settings?: RunManifest["eval_settings"] };
  /** The label of a run without --label, from the model name. Default: the model name as a slug. */
  defaultLabel?(model: string): string;
  /** Setup that can fail before anything runs, with the parsed flags. Throws an Error that says what to do. Returns, for a corpus, what its cases' context has besides the common fields. */
  prepare?(values: Obj, corpora: ResolvedCorpus[], ctx: Omit<RunCtx, "version" | "build">): (corpus: ResolvedCorpus) => Partial<Extra>;
  /** Fields of the summary that are neither the common ones nor from `summarize`. `cases` are those that were selected. */
  summaryExtras?(cases: Case[], rows: Row[], ctx: RunCtx & Extra, corpus: ResolvedCorpus): Obj;
  /** Prints a summary, once its file is written. */
  printSummary(summary: Summary): void;
  /** The rows of the table that is printed when public and custom both ran, as [label, public, custom]. Without it there is no table. */
  sideBySide?(a: Summary, b: Summary): [string, string, string][];
  /**
   * The eval's part of --help: what it does, the lines that go with the corpus flags, what --limit selects, and the eval's own flags (`flags` in the synopsis,
   * `extra` in the list). `timeout` is what --timeout-ms bounds when that is not each akm command (a batch's own budget), for --help and the banner.
   */
  usage: { about: string; corpus?: string; limit: string; flags?: string; extra?: string; timeout?: string };
  /** The eval's own flags, for parseArgs. They arrive in the `values` that `prepare` reads. */
  options?: NonNullable<ParseArgsConfig["options"]>;
}

/** What the summary records as `corpus_folder`: the folder of a custom corpus from the repository root, null when it is outside it, and null for the public corpus. */
export const corpusFolder = (corpus: ResolvedCorpus, root = ROOT): string | null => (corpus.name === "custom" ? corpusFolderOf(corpus.folder, root) : null);

/** The public results go to the eval's own folder, and those of a custom corpus to private/, which is gitignored. */
export const defaultResults = (spec: Pick<EvalSpec, "dir" | "measurement">, corpus: ResolvedCorpus, root = ROOT): string =>
  corpus.name === "public" ? join(spec.dir, "results") : join(root, "private", spec.measurement.eval, "results");

/** A positive whole number flag: its value, or undefined without the flag. */
function count(flag: string, text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const n = Number(text);
  return Number.isInteger(n) && n > 0 ? n : fail(`${flag} must be a positive integer`);
}

/** What `run` gives, except that an Error it throws ends the run with its message, as a failure does, not with a stack: for what the person who started the run can fix. */
function asFatal<T>(run: () => T): T {
  try {
    return run();
  } catch (e) {
    if (e instanceof Error && !(e instanceof Fatal)) return fail(e.message);
    throw e;
  }
}

/** The cases through `ctx.concurrency` workers. `record` is given each row as its case finishes; the rows returned are in the order of the cases. */
async function collect<Case, Row extends Obj, Extra extends Obj>(spec: EvalSpec<Case, Row, Extra>, cases: Case[], ctx: RunCtx & Extra, record: (row: Row, c: Case) => void): Promise<{ rows: Row[]; aborted?: string }> {
  const runCase = spec.runCase;
  if (!runCase) throw new Error(`${spec.measurement.eval}: the spec has neither runCase nor collectAll`);
  const finished: { at: number; row: Row }[] = [];
  let next = 0;
  let errors = 0;
  let lastError: string | undefined;
  const worker = async (): Promise<void> => {
    while (next < cases.length && lastError === undefined) {
      const at = next++;
      const c = cases[at] as Case;
      const row = await runCase(c, ctx);
      finished.push({ at, row });
      record(row, c);
      const why = spec.giveUpOn ? spec.giveUpOn(row) : spec.measurement.errored(row) ? String(row.error ?? "") || "no message" : null;
      if (why === null) errors = 0;
      else if (++errors >= GIVE_UP_AFTER) lastError ??= why;
    }
  };
  await Promise.all(Array.from({ length: Math.min(ctx.concurrency, cases.length) }, worker));
  const aborted = lastError === undefined ? undefined : `${GIVE_UP_AFTER} cases in a row ${spec.giveUpOn ? "gave no result" : "errored"}, so the run stopped after ${finished.length} of ${cases.length}. Last error: ${lastError}`;
  return { rows: finished.sort((a, b) => a.at - b.at).map((f) => f.row), aborted };
}

/**
 * Runs a corpus once: its cases through the pool (or the spec's collectAll), the manifest, and the summary, which is written before the run
 * fails if it gave up and so says it was cut short. `input` takes the spec's defaults for what it leaves out. Results go to `resultsParent`.
 */
export async function runCorpus<Case, Row extends Obj, Extra extends Obj>(
  spec: EvalSpec<Case, Row, Extra>,
  corpus: ResolvedCorpus,
  input: CtxInput<Extra>,
  resultsParent: string = defaultResults(spec, corpus),
): Promise<Summary> {
  const name = spec.measurement.eval;
  const given = { ...input, provider: input.provider ?? "openai", overrides: input.overrides ?? defaultOverrides(spec.strategy ?? ""), timeoutMs: input.timeoutMs ?? spec.defaultTimeoutMs, concurrency: input.concurrency ?? spec.defaultConcurrency ?? 1 } as RunCtx & Extra;
  const all = asFatal(() => spec.loadCases(corpus.folder));
  const cases = spec.selectCases(all, given.limit, given);
  const assetsDigest = spec.assetsSha256(corpus.folder, all); // before the calls, since it says what the run read
  const dir = makeResultsDir(resultsParent, given.label);
  given.resultsDir = dir;
  const samples = join(dir, "samples.jsonl");
  writeFileSync(samples, "");
  console.log(`${name} (${corpus.name}): ${cases.length} of ${all.length} cases${spec.collectAll ? "" : `, ${given.concurrency === 1 ? "one" : given.concurrency} at a time`}`);

  // A row goes to samples.jsonl and the screen as its case finishes: the pool says which case it is, and the rows of a collectAll are found by id.
  const byId = new Map(cases.map((c) => [spec.measurement.caseId(c), c]));
  let written = 0;
  const record = (row: Row, c = byId.get(String(row.id))): void => {
    if (c === undefined) throw new Error(`${name}: a row for ${row.id}, which is not a case that was selected`);
    appendFileSync(samples, `${JSON.stringify(row)}\n`);
    console.log(`  [${String(++written).padStart(String(cases.length).length)}/${cases.length}] ${spec.progress(c, row)}`);
  };

  const open: Partial<Extra> & { close?(): void } = (await spec.openRun?.(given, corpus)) ?? {};
  const { close: _close, ...opened } = open;
  const ctx = { ...given, ...opened } as RunCtx & Extra;
  // Whatever asks the run's resources is asked before they are closed, and they are closed, whether the cases threw or not, before the model
  // calls are counted: removing a sandbox counts its calls.
  let done: { rows: Row[]; aborted: string | null; config: Record<string, any>; counts: Obj; extras?: Obj; digests: ReturnType<typeof caseDigests> };
  try {
    const { rows, aborted } = await (spec.collectAll ? spec.collectAll(cases, ctx, record) : collect(spec, cases, ctx, record));
    done = {
      rows,
      aborted: aborted ?? spec.abortReason?.(rows, ctx) ?? null,
      config: spec.configFor(ctx),
      counts: spec.measurement.summarize(rows),
      extras: spec.summaryExtras?.(cases, rows, ctx, corpus),
      digests: caseDigests(spec.measurement, cases, (c) => spec.caseContext?.(c, ctx)),
    };
  } finally {
    open.close?.();
  }
  const { rows, aborted, config } = done;
  const build = ctx.build ?? akmBuild();
  const manifest = buildManifest({
    measurement: spec.measurement,
    corpus: corpus.name,
    ...spec.manifestExtras?.(ctx, corpus),
    cases: done.digests,
    akm: { version: ctx.version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
    config,
    settings: { strategy: spec.strategy === undefined ? null : ctx.overrides.strategy, config_patch_sha256: ctx.overrides.configPatch?.sha256 ?? null, timeout_ms: ctx.timeoutMs, seed: corpus.seed },
    completion: completionOf(spec.measurement, cases.map((c) => spec.measurement.caseId(c)), rows),
  });
  const patch = overrideSummary(ctx.overrides);
  const summary = {
    eval: name,
    corpus: corpus.name,
    corpus_folder: corpusFolder(corpus),
    label: ctx.label,
    date: new Date().toISOString(),
    git_commit: gitCommit(ROOT),
    model: ctx.model,
    akm_version: ctx.version,
    ...build,
    limit: ctx.limit ?? null,
    ...(spec.strategy === undefined ? { config_patch: patch.config_patch } : patch),
    config: redactConfig(hideEndpoint(config, ctx.baseUrl)), // the endpoint is written as <MODEL_BASE_URL>; engine and manifest hold its host
    engine: engineSettings(config),
    assets_sha256: assetsDigest,
    seed: corpus.seed,
    status: aborted === null ? "complete" : "aborted",
    aborted_reason: aborted,
    n_cases: all.length,
    ...done.counts,
    ...done.extras,
    model_calls: takeModelCalls(),
    semantic_verification: takeSemanticVerification(),
    ...(spec.collectAll ? {} : { concurrency: ctx.concurrency }), // a batch has no pool
    timeout_ms: ctx.timeoutMs,
    manifest,
    results_dir: dir,
  } as Summary;
  const { results_dir: _dir, ...stored } = summary;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(stored, null, 2)}\n`);
  spec.printSummary(summary);
  if (aborted !== null) fail(`${aborted}\nCheck MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and that akm can reach the model.`, 1);
  return summary;
}

/** The default of --label as --help says it: the model name, or the eval's own name for it (consolidate --pool's <model name>-pool). */
function labelDefault(spec: EvalSpec): string {
  const own = spec.defaultLabel?.("model");
  return own?.startsWith("model") && own !== "model" ? `<model name>${own.slice("model".length)}` : "the model name";
}

/** The usage text: the flags every run takes, and the eval's own pieces. */
function usageOf(spec: EvalSpec): string {
  const { about, corpus, limit, flags, extra } = spec.usage;
  const flagLines = [
    corpusUsage,
    ...(corpus ? [corpus] : []),
    `  --limit   ${limit}`,
    `  --repeat  run the corpus N times, into <label>-r1 to <label>-rN, and write the min, max and mean of each metric to
            <UTC date>-<label>-repeat-summary.json beside them`,
    ...(extra ? [extra] : []),
    overridesUsage(spec.strategy),
    modelUsage,
    akmUsage,
    `  --label   names the results folder: <UTC date>-<label>. Default: ${labelDefault(spec)}.`,
    ...(spec.collectAll ? [] : [`  --concurrency  run N cases at a time. Default: ${spec.defaultConcurrency ?? 1}.`]),
    `  --timeout-ms   ${spec.usage.timeout ?? "stop an akm command that is still running after N milliseconds"}. Default: ${spec.defaultTimeoutMs}.`,
  ];
  const synopsis = `[--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N]${flags ? ` ${flags}` : ""}${spec.strategy === undefined ? "" : " [--strategy NAME]"} [--config-patch FILE] [--semantic] [--label NAME] [--model ID] [--akm COMMAND]${spec.collectAll ? "" : " [--concurrency N]"} [--timeout-ms N]`;
  const needs = spec.minAkm ? `Tested with akm ${spec.minAkm} or later on PATH, or in AKM_BIN.` : "Needs akm on PATH, or in AKM_BIN.";
  const asks = "The model gets one one-token request before the first case. AKM_EVAL_NO_PROBE=1 skips it, for an endpoint that does not serve chat completions.";
  return `Usage: ${relative(ROOT, spec.dir)}/run ${synopsis}\n\n${about}\n\n${flagLines.join("\n")}\n\n${needs}\n${asks}`;
}

/** The two summaries as columns, never one pooled number. */
function printSideBySide(spec: EvalSpec, a: Summary, b: Summary): void {
  if (!spec.sideBySide) return;
  const rows: [string, string, string][] = [["", a.corpus, b.corpus], ...spec.sideBySide(a, b)];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => (r[i] as string).length)));
  console.log(`\n${spec.measurement.eval}: ${a.corpus} and ${b.corpus} side by side (not pooled)`);
  for (const r of rows) console.log(`  ${r[0].padEnd(w[0] as number)}  ${r[1].padEnd(w[1] as number)}  ${r[2].padEnd(w[2] as number)}`);
}

/** What the run is set to, as one block. `ctx` is the first corpus's, and `probe` is what the endpoint answered: undefined when it was not asked. */
function banner<Case, Row extends Obj, Extra extends Obj>(spec: EvalSpec<Case, Row, Extra>, ctx: RunCtx & Extra, probe: Probe | undefined): string {
  const config = spec.configFor(ctx);
  const engine = engineSettings(config);
  const served = probe?.ok && probe.served !== null && probe.served !== ctx.model ? `, served as ${probe.served}` : "";
  const thinking = engine.enableThinking === true ? "on" : engine.enableThinking === false ? "off" : "unset";
  return [
    `${spec.measurement.eval}: model ${ctx.model} at ${endpointHost(ctx.baseUrl) ?? "an endpoint that is not a URL"} (provider ${ctx.provider}${probe ? served : ", not probed"})`,
    `  search ${(config.semanticSearchMode ?? "off") === "off" ? "keyword" : `semantic${typeof config.embedding?.localModel === "string" ? ` (${config.embedding.localModel})` : ""}`}`,
    `  temperature ${engine.temperature ?? "unset"}, thinking ${thinking}`,
    ...(spec.strategy === undefined ? [] : [`  strategy ${ctx.overrides.strategy}`]),
    ...(ctx.overrides.configPatch ? [`  config patch ${ctx.overrides.configPatch.path}`] : []),
    `  ${spec.collectAll ? "" : `concurrency ${ctx.concurrency}, `}timeout ${ctx.timeoutMs / 1000}s ${spec.usage.timeout ? `(${spec.usage.timeout})` : "per akm command"}`,
    `  akm ${ctx.version}${ctx.build?.akm_build ? ` build ${ctx.build.akm_build}` : ""}`,
  ].join("\n");
}

type Values = Obj & { corpus?: string; cases?: string; limit?: string; repeat?: string; label?: string; model?: string; akm?: string; strategy?: string; "config-patch"?: string; semantic?: boolean; concurrency?: string; "timeout-ms"?: string; help?: boolean };

async function main<Case, Row extends Obj, Extra extends Obj>(spec: EvalSpec<Case, Row, Extra>, argv: string[]): Promise<void> {
  const name = spec.measurement.eval;
  const usage = usageOf(spec);
  const options: NonNullable<ParseArgsConfig["options"]> = { ...CORPUS_OPTIONS, limit: { type: "string" }, repeat: { type: "string" }, ...(spec.strategy === undefined ? PATCH_OPTIONS : OVERRIDE_OPTIONS), ...MODEL_OPTIONS, ...AKM_OPTIONS, label: { type: "string" }, ...(spec.collectAll ? {} : { concurrency: { type: "string" } }), "timeout-ms": { type: "string" }, help: { type: "boolean", short: "h" }, ...spec.options };
  let values: Values;
  try {
    values = parseArgs({ args: argv, options, strict: true }).values as Values;
  } catch (e) {
    return fail(`${(e as Error).message}\n\n${usage}`);
  }
  if (values.help) {
    console.log(usage);
    return;
  }
  const limit = count("--limit", values.limit);
  const repeat = count("--repeat", values.repeat);
  const concurrency = count("--concurrency", values.concurrency) ?? spec.defaultConcurrency ?? 1;
  const timeoutMs = count("--timeout-ms", values["timeout-ms"]) ?? spec.defaultTimeoutMs;
  const corpora = resolveCorpora({ eval: name, values, publicFolder: join(spec.dir, "assets"), rewrite: spec.rewrite, fail });
  const overrides = parseOverrides(values, spec.strategy ?? "", fail);
  useAkm(values, fail);
  const { baseUrl, name: model, hasKey, provider, apiKey } = useModel(values, fail);
  const label = values.label ?? (spec.defaultLabel ? spec.defaultLabel(model) : slug(model));
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");

  const casesFile = spec.casesFile ?? "cases.jsonl";
  for (const c of corpora) {
    if (c.name === "public") continue;
    if (!existsSync(join(c.folder, casesFile))) {
      fail(`${c.flag}: ${corpusFolderOf(c.folder) ?? c.folder}/${casesFile} does not exist. The folder of a custom corpus holds ${casesFile}, as assets/ does.${c.rewrite ? ` Make the rewrite with: ./generate-assets --only ${name}` : ""}`);
    }
    asFatal(() => spec.loadCases(c.folder)); // a cases file that does not read stops the run here, not after the first corpus has run
  }
  const extra = asFatal(() => spec.prepare?.(values, corpora, { baseUrl, model, hasKey, provider, overrides, timeoutMs, concurrency, label, limit })) ?? (() => ({}));
  await announceCases(values, [{ role: "model", name: model, baseUrl }]);

  const probe = asFatal(() => createSandbox(name));
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }
  if (spec.minAkm && !atLeast(version, spec.minAkm)) console.warn(`akm ${version} predates the tested release ${spec.minAkm}; continuing with the requested build. Command or output errors will be recorded normally.`);
  // The endpoint is asked once, with the key and the model name the cases will use: a wrong one ends the run here, before it has spent anything.
  const probed = process.env.AKM_EVAL_NO_PROBE === "1" ? undefined : await probeModel({ baseUrl, apiKey, model });
  if (probed && !probed.ok) fail(`the model endpoint did not answer: ${probed.reason}\nCheck MODEL_BASE_URL, MODEL_API_KEY and the model name (${model}); the run made no case.`, 2);
  const build = akmBuild();

  const ctx = { baseUrl, model, hasKey, provider, overrides, timeoutMs, concurrency, version, label, limit, build };
  const more = corpora.map((c) => extra(c));
  console.log(banner(spec, { ...ctx, ...more[0] } as RunCtx & Extra, probed));
  const summaries: Summary[] = [];
  for (const [i, c] of corpora.entries()) {
    summaries.push(...(await repeatRuns(repeat, label, (runLabel) => runCorpus(spec, c, { ...ctx, ...more[i], label: runLabel } as CtxInput<Extra>))));
  }
  if (summaries.length === 2 && repeat === undefined) printSideBySide(spec, summaries[0] as Summary, summaries[1] as Summary);
}

/** The main of an eval's run.ts: runs the spec with the flags in `argv`. A failure ends the process with its message and exit code, and any other exception is thrown. */
export async function runEval<Case, Row extends Obj, Extra extends Obj>(spec: EvalSpec<Case, Row, Extra>, argv: string[] = Bun.argv.slice(2)): Promise<void> {
  try {
    await main(spec, argv);
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`${spec.measurement.eval}: ${e.message}`);
    process.exit(e.code);
  }
}
