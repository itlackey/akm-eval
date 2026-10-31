import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmBuild, createSandbox, dirtyFingerprint, removeSandbox, runAkm, useAkm } from "../../../lib/akm/akm.ts";
import { parseOverrides } from "../../../lib/akm/overrides.ts";
import { buildManifest, caseDigests, corpusFolderOf, HARNESS_VERSION, readManifest, REPO_ROOT, type RunManifest } from "../../../lib/manifest.ts";
import { endpointDigest, endpointHost, engineSettings, redactActors, redactConfig, sha256Json } from "../../../lib/provenance.ts";
import { JUDGE_OPTIONS, judgeUsage, useJudge, useModel, type ModelSettings } from "../../../lib/models.ts";
import { fail, gitCommit, slug } from "../../../lib/cli.ts";
import { clearRunning, makeResultsDir, markRunning, RUNNING } from "../../../lib/results.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { CORPUS_OPTIONS, announceCases, resolveCorpora, type ResolvedCorpus } from "../../../lib/corpus.ts";
import { DATA_FILE, ensureDataset, loadQuestions, readLock } from "../../../benchmarks/longmemeval/src/dataset.ts";
import { digestFiles } from "../../../benchmarks/longmemeval/src/manifest.ts";
import { isRunning, manifestDifferences } from "../../../benchmarks/longmemeval/src/run.ts";
import { READER_INSTRUCTION } from "../../../benchmarks/longmemeval/src/prompts.ts";
import { loadCases, type Case } from "./inputs.ts";
import { collect, configFor, pending, type Options } from "./collect.ts";
import { ARMS, PROMPT, readerSettings } from "./protocol.ts";
import { MEASUREMENT } from "./measurement.ts";
import { makeRow, summarize } from "./score.ts";
import { DEFAULT_BUDGETS, DEFAULT_HAYSTACK, DEFAULT_SAMPLE_SEED, NOTES_BUDGET, PRIMARY_BUDGET, HALVES_SALT, SPLIT_SALT, SPLITS, isHeldout, isLmeCase, lmeCases, preregistrationDifferences, type LmeCase, type Split } from "./lme.ts";
import { lmeCollect, lmePending, type LmeOptions } from "./lme-collect.ts";
import { makeLmeRow, isLmeRow } from "./lme-score.ts";

const usage = `Usage: evals/memory-utility/run [options]

  --model ID           Reader and native inference model (MODEL_NAME otherwise).
  --akm COMMAND        AKM command, not a package spec.
  --corpus public|custom|all  public (default); custom/all require cases (--cases DIR), or with --split the LongMemEval rewrite.
  --cases DIR          Custom cases.json directory (with --split: a folder with longmemeval_s_cleaned.json); no automatic rewrite
                       of the 24 cases.
  --limit N            Select first N independent cases (default all). With --split: draw N questions in proportion to type.
  --label NAME         Results label (model name by default).
  --semantic           Require semantic retrieval and full embedding coverage.
  --config-patch FILE  Existing native AKM config patch, including embedding engine.
  --context-tokens N   Memory budget estimated as characters/4 (default 1024). The 24 cases only.
  --search-limit N     Candidate search hits before context packing (default 10).
  --timeout-ms N       Per AKM command / reader request timeout (default 120000). \`akm improve\` may take 30 s per note if more.
  --seed TEXT          Reproducible counterbalanced arm order (default 1).
  --repeat N           Separate independent collections (default one).
  --resume DIR         Carry on a stopped run in its folder: asks only the cases that are not scored. The manifest has to match.

LongMemEval cases (judged, several budgets): --split selects them, and the options below need it.
  --split dev|heldout-a|heldout-b  The split of the 500 questions: 100 dev, and the 400 held-out in two halves of 200. A held-out half
                       needs the rewrite (--corpus custom), is never a default, and is named, not drawn from a pool.
  --judge-model ID     The judge, as the gateway or a models.json line names it. Required with --split.
  --haystack K         Distractor sessions per question, with the evidence sessions (default ${DEFAULT_HAYSTACK}).
  --budgets A,B,...    Memory budgets, estimated tokens (default ${DEFAULT_BUDGETS.join(",")}); ${PRIMARY_BUDGET} is the primary comparison and must be one.
  --sample-seed N      Seed of the draw of questions and of each question's distractors (default ${DEFAULT_SAMPLE_SEED}).
${judgeUsage}
  --help               Show this help; no model or AKM calls.
`;
/** The results label, as every eval takes it: --label as given (letters, digits, dot, dash, underscore), else the model name as a slug. */
export function resultsLabel(given: string | undefined, model: string): string {
  const label = given ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  return label;
}
function positive(text: string | undefined, fallback: number, name: string): number {
  if (text === undefined) return fallback;
  const n = Number(text); if (!Number.isInteger(n) || n < 1) fail(`${name} must be a positive integer`); return n;
}
/** The budgets of --budgets: distinct whole numbers, ascending, with the primary one among them. */
export function parseBudgets(text: string | undefined, failWith: (message: string) => never = fail): number[] {
  if (text === undefined) return [...DEFAULT_BUDGETS];
  const budgets = text.split(",").map(x => Number(x.trim()));
  if (!budgets.length || budgets.some(n => !Number.isInteger(n) || n < 1) || new Set(budgets).size !== budgets.length) return failWith("--budgets must be distinct positive integers, such as 256,512,1024");
  if (!budgets.includes(PRIMARY_BUDGET)) return failWith(`--budgets must include ${PRIMARY_BUDGET}, the primary comparison`);
  return budgets.sort((a, b) => a - b);
}
/** What --split makes of the other flags, before anything is set up: the LongMemEval flags need it, and the held-out cases run only on the rewrite, only when asked for. */
export function checkSplitFlags(v: { split?: string; corpus?: string; cases?: string; haystack?: string; budgets?: string; "sample-seed"?: string; "judge-model"?: string; "context-tokens"?: string }, failWith: (message: string) => never = fail): void {
  if (v.split === undefined) {
    for (const flag of ["haystack", "budgets", "sample-seed", "judge-model"] as const) if (v[flag] !== undefined) failWith(`--${flag} is for the LongMemEval cases: add --split dev`);
    return;
  }
  if (!(SPLITS as string[]).includes(v.split)) failWith(`--split must be ${SPLITS.join(", ")}, not "${v.split}"`);
  if (v["context-tokens"] !== undefined) failWith("--context-tokens is for the 24 public cases: LongMemEval cases are read at --budgets");
  if (v["judge-model"] === undefined) failWith("--split needs --judge-model: the judge is part of the measurement, so it is named and never taken from .env");
  if (isHeldout(v.split as Split) && ((v.corpus ?? (v.cases === undefined ? "public" : "custom")) !== "custom")) failWith(`held-out questions run on the rewrite, not the public data: use --split ${v.split} --corpus custom (./generate-assets --only longmemeval)`);
}
type AnyCase = Case | LmeCase;
type Plan = { cases: AnyCase[]; pending: (c: AnyCase, i: number) => any; collect: (c: AnyCase, raw: any, checkpoint: () => void) => Promise<unknown>; row: (c: AnyCase, raw: any) => any;
  header: string; evalSettings: Record<string, string | number | boolean | null>; summaryExtra: Record<string, unknown>; progress: (row: any) => string };

/** The raw output of every case of a stopped run that was scored (no error, nothing pending), by id, when its manifest is the one of this run. Otherwise a refusal. */
export function resumableRaws(dir: string, now: RunManifest, failWith: (message: string) => never = fail): Map<string, any> {
  let pid = Number.NaN;
  try { pid = Number.parseInt(readFileSync(join(dir, RUNNING), "utf8"), 10); } catch { /* no marker: no run writes here */ }
  if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && isRunning(pid)) failWith(`${dir} is being written by a run that is still going (pid ${pid}). Stop it first, or remove ${join(dir, RUNNING)} if no run has that pid.`);
  const summaryPath = join(dir, "summary.json");
  if (!existsSync(summaryPath)) failWith(`${dir} has no summary.json, so it is not a run to resume`);
  const reading = readManifest(JSON.parse(readFileSync(summaryPath, "utf8")));
  if (reading.kind === "legacy") failWith(`${dir} was run before the run manifest, so it cannot be resumed. Run again without --resume.`);
  if (reading.kind === "invalid") failWith(`${dir} has a manifest that is not sound (${reading.problems.join("; ")}). Run again without --resume.`);
  if (reading.manifest.rescored_from !== undefined) failWith(`${dir} is the result of scripts/rescore, not a run, so there is nothing in it to carry on. Resume the folder it was made from.`);
  const [different] = manifestDifferences(reading.manifest, now);
  if (different !== undefined) failWith(`${dir} was run with ${different}. Run again with the same settings, or without --resume.`);
  const lines = readFileSync(join(dir, "samples.jsonl"), "utf8").split("\n").filter(l => l.trim() !== "");
  const raws = new Map<string, any>();
  for (const [i, line] of lines.entries()) {
    let row: any;
    try { row = JSON.parse(line); } catch { if (i < lines.length - 1) failWith(`${join(dir, "samples.jsonl")} line ${i + 1} is not valid JSON`); continue; }
    const raw = MEASUREMENT.rawOf(row);
    if ("raw" in raw && !MEASUREMENT.errored(row) && !MEASUREMENT.unfinished?.(row)) raws.set(String(row.id), raw.raw);
  }
  return raws;
}

const toEndpoint = (m: ModelSettings) => ({ baseUrl: m.baseUrl, apiKey: m.apiKey, model: m.name, ...(m.chat ? { chat: m.chat } : {}) });
const pct = (x: number | null): string => x === null ? "n/a" : `${(x * 100).toFixed(1)}%`;
const points = (x: number | null): string => x === null ? "n/a" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;

async function main() {
  const { values: v } = parseArgs({ strict: true, options: {
    help: { type: "boolean", short: "h" }, model: { type: "string" }, akm: { type: "string" }, ...CORPUS_OPTIONS, ...JUDGE_OPTIONS, limit: { type: "string" }, label: { type: "string" },
    semantic: { type: "boolean" }, "config-patch": { type: "string" }, "context-tokens": { type: "string" }, "search-limit": { type: "string" }, "timeout-ms": { type: "string" }, seed: { type: "string" }, repeat: { type: "string" },
    resume: { type: "string" }, split: { type: "string" }, haystack: { type: "string" }, budgets: { type: "string" }, "sample-seed": { type: "string" },
  } });
  if (v.help) { console.log(usage); return; }
  checkSplitFlags(v);
  const lme = v.split !== undefined, split = v.split as Split;
  if (v.resume !== undefined && v.repeat !== undefined) fail("--resume carries on one run, so it does not go with --repeat");
  const budgets = lme ? parseBudgets(v.budgets) : [], haystack = positive(v.haystack, DEFAULT_HAYSTACK, "--haystack");
  const sampleSeed = v["sample-seed"] === undefined ? DEFAULT_SAMPLE_SEED : Number(v["sample-seed"]);
  if (!Number.isInteger(sampleSeed) || sampleSeed < 0) fail("--sample-seed must be a non-negative integer");
  const limit = v.limit === undefined ? undefined : positive(v.limit, 0, "--limit");
  const corpora = resolveCorpora({ eval: lme ? "longmemeval" : MEASUREMENT.eval, values: v, publicFolder: lme ? join(REPO_ROOT, "benchmarks/longmemeval/assets") : join(REPO_ROOT, "evals/memory-utility/assets"), rewrite: lme, fail });
  if (v.resume !== undefined && corpora.length > 1) fail("--resume carries on one run, so pick one corpus with --corpus public or --corpus custom");
  if (lme && isHeldout(split) && corpora.some(c => c.name === "public")) fail(`held-out questions run on the rewrite, not the public data: use --split ${split} --corpus custom`);
  if (lme) for (const c of corpora) if (c.name === "custom" && !existsSync(join(c.folder, DATA_FILE))) fail(c.rewrite ? `the custom assets are missing. Make them with: ./generate-assets --only longmemeval` : `${c.flag} needs ${DATA_FILE} in its folder`);
  useAkm(v, fail); const model = useModel(v, fail); const baseLabel = resultsLabel(v.label, model.name);
  const judge = lme ? useJudge(v, fail, process.env, undefined, { baseUrl: model.baseUrl, apiKey: model.apiKey }) : null;
  // A held-out half is run only as pre-registered: this refuses before anything is announced, probed or collected. Dev runs are free.
  if (judge && isHeldout(split)) {
    const different = preregistrationDifferences({ budgets, haystack, sampleSeed, judgeModel: judge.name, judgeChat: judge.chat });
    if (different.length) fail(`--split ${split} runs only with the pre-registered settings (evals/memory-utility/PREREGISTRATION.md), and this run has ${different.join("; ")}. Run a dev split to try other settings.`);
  }
  await announceCases(v, [{ role: "model", name: model.name, baseUrl: model.baseUrl }, ...(judge ? [{ role: "judge" as const, name: judge.name, baseUrl: judge.baseUrl }] : [])]);
  const contextTokens = lme ? PRIMARY_BUDGET : positive(v["context-tokens"], 1024, "--context-tokens");
  const o: Options = { endpoint: { baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.name, chat: model.chat }, provider: model.provider,
    overrides: parseOverrides(v, "", fail), semantic: !!v.semantic, contextTokens, searchLimit: positive(v["search-limit"], 10, "--search-limit"), timeoutMs: positive(v["timeout-ms"], 120000, "--timeout-ms"), seed: v.seed ?? "1" };
  const lo: LmeOptions | null = judge ? { ...o, budgets, judge: toEndpoint(judge), judgeCache: new Map() } : null;
  const config = configFor(o), build = akmBuild();
  const probe = createSandbox("memory-utility-version");
  let version: string;
  try {
    const result = await runAkm(probe, ["--version"], { timeoutMs: 30000 });
    if (result.code !== 0) fail("AKM version probe failed"); version = result.stdout.trim();
  } finally { removeSandbox(probe); }
  console.log(`Reader/inference destination: ${new URL(model.baseUrl).origin} (no corpus is published). Read README before interpreting scores.`);
  if (judge) console.log(`Judge destination: ${new URL(judge.baseUrl).origin}`);
  const collectorCommit = gitCommit(REPO_ROOT), collectorFingerprint = dirtyFingerprint(REPO_ROOT);
  for (const corpus of corpora) {
    const { name: corpusName, folder } = corpus;
    // ---- the cases of this corpus, and what differs between the two kinds ----
    let plan: Plan;
    if (lo && judge) plan = await lmePlan(corpus, { split, limit, haystack, sampleSeed }, o, lo, judge, model);
    else {
      const cases = loadCases(folder).slice(0, positive(v.limit, Number.MAX_SAFE_INTEGER, "--limit"));
      plan = { cases, pending: (c, i) => pending(c as Case, i, o.seed), collect: (c, raw, checkpoint) => collect(c as Case, raw, o, checkpoint), row: (c, raw) => makeRow(c as Case, raw),
        header: `memory-utility (${corpusName}) | ${cases.length} cases × 3 arms | ${model.name} | AKM ${version} | ${o.semantic ? "semantic" : "keyword"} | ${o.contextTokens} estimated context tokens | one sequential case at a time`,
        evalSettings: { context_tokens_estimated: o.contextTokens }, summaryExtra: {}, progress: (row: any) => ARMS.map(a => `${a}=${row.raw.arms[a].state}`).join(" ") };
    }
    const cases = plan.cases, selected = cases.map(c => c.id), digests = caseDigests(MEASUREMENT, cases);
    const evalSettings = { ...plan.evalSettings, search_limit: o.searchLimit, search_mode: o.semantic ? "semantic" : "keyword", reader_settings_sha256: sha256Json(readerSettings(model.chat)), reader_endpoint_sha256: endpointDigest(model.baseUrl), embedding_settings_sha256: sha256Json(redactConfig(config.embedding ?? null)), embedding_endpoint_sha256: endpointDigest(config.embedding?.endpoint), embedding_model: config.embedding?.model ?? config.embedding?.localModel ?? null, prompt_sha256: sha256Json(lme ? READER_INSTRUCTION : PROMPT), corpus_input_sha256: sha256Json(Object.fromEntries(Object.entries(digests).map(([id, d]) => [id, d.input_sha256]))), corpus_labels_sha256: sha256Json(Object.fromEntries(Object.entries(digests).map(([id, d]) => [id, d.label_sha256]))), ordering: "six counterbalanced permutations; seed offsets case ordinal" };
    console.log(plan.header);
    const manifestOf = (completion: { selected: string[]; scored: string[]; errored: string[] }): RunManifest => buildManifest({ measurement: MEASUREMENT, corpus: corpusName, cases: digests, config,
      akm: { version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
      engines: { ...engineSettings(config).engines, reader: { model: model.name, endpoint: "<MODEL_BASE_URL>", endpoint_sha256: endpointDigest(model.baseUrl), temperature: readerSettings(model.chat).temperature, enableThinking: null, timeoutMs: o.timeoutMs },
        ...(judge ? { judge: { model: judge.name, endpoint: "<MODEL_BASE_URL>", endpoint_sha256: endpointDigest(judge.baseUrl), temperature: judge.chat?.temperature ?? 0, enableThinking: null, timeoutMs: 900_000, ...(judge.chat ? { chat: judge.chat } : {}) } } : {}) },
      settings: { strategy: "bakeoff-memory-inference", config_patch_sha256: o.overrides.configPatch?.sha256 ?? null, timeout_ms: o.timeoutMs, seed: o.seed }, eval_settings: evalSettings, completion });
    const kept = v.resume === undefined ? new Map<string, any>() : resumableRaws(resolve(v.resume), manifestOf({ selected, scored: [], errored: [] }));
    await repeatRuns(v.repeat ? positive(v.repeat, 1, "--repeat") : undefined, baseLabel, async label => {
      const resultParent = corpusName === "public" ? join(REPO_ROOT, "evals/memory-utility/results") : join(REPO_ROOT, "private/memory-utility/results");
      const dir = v.resume === undefined ? makeResultsDir(resultParent, label) : resolve(v.resume), start = performance.now();
      if (v.resume !== undefined) markRunning(dir);
      const raw = cases.map((c, i) => kept.get(c.id) ?? plan.pending(c, i));
      // A case's row is built once when it is finished, and again only while it is the one being collected.
      const rows = cases.map((c, i) => plan.row(c, raw[i]));
      let current = -1, status = "running", abortedReason: string | null = null;
      const samples = join(dir, "samples.jsonl");
      // akm stamps notes with the OS login (human:<login>); published results must not carry it, as in lib/run.ts.
      const writeRows = () => writeFileSync(samples, rows.map(r => JSON.stringify(redactActors(r))).join("\n") + "\n");
      const save = (final = false) => {
        if (current >= 0) rows[current] = plan.row(cases[current]!, raw[current]);
        const summary: any = { eval: MEASUREMENT.eval, version: MEASUREMENT.version, scoring_version: MEASUREMENT.scoringVersion ?? MEASUREMENT.version, harness_version: HARNESS_VERSION, date: new Date().toISOString(), label, corpus: corpusName, corpus_folder: corpusName === "custom" ? corpusFolderOf(folder) : null,
          git_commit: collectorCommit, collector_fingerprint: collectorFingerprint, model: model.name, akm_version: version, ...build,
          limit: v.limit ? Number(v.limit) : null, seed: o.seed, timeout_ms: o.timeoutMs, search_mode: evalSettings.search_mode, config: redactConfig(config), reader_settings: readerSettings(model.chat),
          assets_sha256: sha256Json(digests), status, aborted_reason: abortedReason, wall_seconds: (performance.now() - start) / 1000, resumed: v.resume !== undefined, ...plan.summaryExtra,
          ...MEASUREMENT.summarize(rows), manifest: manifestOf({ selected, scored: rows.filter(r => !MEASUREMENT.errored(r) && !MEASUREMENT.unfinished?.(r)).map(r => r.id), errored: rows.filter(r => MEASUREMENT.errored(r)).map(r => r.id) }) };
        // The 24 public cases keep a row per case from the start. The LongMemEval rows are large, so they are written as each case ends and all together at the end.
        if (!lme || final) writeRows();
        writeFileSync(join(dir, "summary.json.tmp"), JSON.stringify(redactActors(summary), null, 2) + "\n");
        renameSync(join(dir, "summary.json.tmp"), join(dir, "summary.json"));
        return { ...summary, results_dir: dir };
      };
      const stop = (signal: string) => { status = "aborted"; abortedReason = signal; save(true); clearRunning(dir); process.exit(signal === "SIGINT" ? 130 : 143); };
      const interrupt = () => stop("SIGINT"), terminate = () => stop("SIGTERM");
      process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
      if (lme) writeFileSync(samples, rows.filter((_, i) => kept.has(cases[i]!.id)).map(r => JSON.stringify(redactActors(r)) + "\n").join(""));
      save();
      if (kept.size) console.log(`  resuming: ${kept.size} of ${cases.length} cases already scored`);
      try {
        for (let i = 0; i < cases.length; i++) {
          if (kept.has(cases[i]!.id)) continue;
          current = i;
          await plan.collect(cases[i]!, raw[i], save);
          rows[i] = plan.row(cases[i]!, raw[i]); current = -1;
          if (lme) appendFileSync(samples, JSON.stringify(redactActors(rows[i])) + "\n");
          console.log(`  ${i + 1}/${cases.length} ${cases[i]!.id}: ${plan.progress(rows[i])}`);
        }
        status = "complete";
      } catch (e) { status = "aborted"; abortedReason = String(e); process.exitCode = 1; }
      finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); clearRunning(dir); }
      const result = save(true); console.log(`Results: ${dir}`);
      if (lme) printLme(result as any);
      return result;
    });
  }
}

/** The sample and dataset of the LongMemEval cases of one corpus, and the case source's settings. */
async function lmePlan(corpus: ResolvedCorpus, a: { split: Split; limit?: number; haystack: number; sampleSeed: number }, o: Options, lo: LmeOptions, judge: ModelSettings, model: ModelSettings): Promise<Plan> {
  const isPublic = corpus.name === "public", assets = corpus.folder;
  const path = isPublic ? await ensureDataset(assets) : join(assets, DATA_FILE);
  let dataset: Record<string, unknown>, files: string[];
  if (isPublic) { const lock = readLock(assets); dataset = { name: lock.dataset, source: lock.source, licence: lock.licence, revision: lock.revision, file: DATA_FILE, sha256: lock.files[DATA_FILE]!.sha256 }; files = ["ASSETS.lock", DATA_FILE]; }
  else if (corpus.rewrite) { dataset = { ...JSON.parse(readFileSync(join(assets, "rewrite.json"), "utf8")), file: DATA_FILE }; files = ["rewrite.json", DATA_FILE]; }
  else { dataset = { name: "custom", file: DATA_FILE }; files = [DATA_FILE]; }
  const { sample, cases } = lmeCases(loadQuestions(path), a);
  const judgeSettings = { temperature: judge.chat?.temperature ?? 0, ...(judge.chat ?? {}) };
  return { cases, pending: (_c, i) => lmePending(i, o.seed, lo.budgets), collect: (c, raw, checkpoint) => lmeCollect(c as LmeCase, raw, lo, checkpoint), row: (c, raw) => makeLmeRow(c as LmeCase, raw),
    header: `memory-utility (${corpus.name}) | LongMemEval ${a.split} | ${cases.length} of ${sample.total} questions × 3 arms × ${lo.budgets.length} budgets | K=${a.haystack} | ${model.name}, judge ${judge.name} | ${o.semantic ? "semantic" : "keyword"} | one sequential case at a time`,
    evalSettings: { case_source: "longmemeval", split: a.split, sample_seed: a.sampleSeed, haystack: a.haystack, limit: a.limit ?? null, budgets: lo.budgets.join(","), primary_budget: PRIMARY_BUDGET, context_tokens_estimated: PRIMARY_BUDGET,
      split_salt_sha256: sha256Json({ split: SPLIT_SALT, halves: HALVES_SALT }), reader_model: model.name, judge_model: judge.name, judge_settings_sha256: sha256Json(judgeSettings), judge_endpoint_sha256: endpointDigest(judge.baseUrl) },
    summaryExtra: { case_source: "longmemeval", split: a.split, haystack: a.haystack, budgets: lo.budgets, primary_budget: PRIMARY_BUDGET, sample_seed: a.sampleSeed, sample: { order: sample.order, seed: sample.seed, n: sample.n, total: sample.total, per_type: sample.per_type },
      judge_model: judge.name, judge_endpoint: endpointHost(judge.baseUrl), judge_temperature: judgeSettings.temperature, dataset, dataset_sha256: digestFiles(assets, files) },
    progress: (row: any) => `${row.category.padEnd(25)} ${ARMS.map(a => `${a}=${row.arms[a][PRIMARY_BUDGET]?.evaluated ? (row.arms[a][PRIMARY_BUDGET].correct ? "right" : "wrong") : "error"}`).join(" ")} @${PRIMARY_BUDGET}` };
}

/** The headline of a LongMemEval run: per budget, the three arms' accuracy and the two paired differences. */
function printLme(s: any): void {
  const m = s.metrics;
  console.log(`\nmemory-utility (${s.corpus}) LongMemEval ${s.split} | ${s.n_scored} scored, ${s.n_errored} errored of ${s.n_selected} | ${s.model} | judge ${s.judge_model} | AKM ${s.akm_version}`);
  const d = (p: any) => `${points(p.value)} pp [${p.ci95 ? `${points(p.ci95[0])}, ${points(p.ci95[1])}` : "n/a"}] p=${p.p_value ?? "n/a"} (${p.helps}/${p.harms})`;
  for (const b of m.budgets) {
    const x = m.by_budget[String(b)], acc = (a: string) => `${x.arms[a].failure_inclusive_accuracy.correct}/${x.arms[a].failure_inclusive_accuracy.n} ${pct(x.arms[a].failure_inclusive_accuracy.rate)}`;
    console.log(`  ${String(b).padStart(4)}${b === m.primary_budget ? "*" : " "} none ${acc("none")} | source ${acc("source")} | inferred ${acc("inferred")} | inferred-source ${d(x.memory_inference.failure_inclusive)} | source-none ${d(x.persistent_memory.failure_inclusive)}`);
  }
  console.log("  (* primary budget; helps/harms are cases only the later arm / only the earlier arm got right)");
  if (m.cross_budget_inference) {
    console.log(`  inferred@${PRIMARY_BUDGET} - source@${NOTES_BUDGET} ${d(m.cross_budget_inference.failure_inclusive)}`);
    const c = m.primary_comparisons?.comparisons;
    if (c) console.log(`  primary comparisons, p raw -> Holm (alpha ${m.primary_comparisons.alpha}): ${Object.values<any>(c).map(x => `${x.label} ${x.p_value} -> ${x.p_holm}`).join(" | ")}`);
  }
}
if (import.meta.main) main().catch(e => { console.error(String(e)); process.exitCode = 2; });
