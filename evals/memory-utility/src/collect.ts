import { mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Sandbox, createSandbox, removeSandbox, runAkmJson, writeConfig, agentDetailArgs } from "../../../lib/akm/akm.ts";
import { takeModelCalls, tallyCalls } from "../../../lib/akm/usage.ts";
import { type Overrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { bakeoffConfig, STRATEGIES } from "../../bakeoff/src/collect.ts";
import { ChatError, chat, type Endpoint } from "../../../benchmarks/longmemeval/src/llm.ts";
import { sha256Json } from "../../../lib/provenance.ts";
import type { Case } from "./inputs.ts";
import { ARMS, armOrder, pack, promptFor, sourceFiles, READER_DEFAULTS, type ArmName, type Document } from "./protocol.ts";
import type { Raw, RawArm } from "./score.ts";

export interface Options {
  endpoint: Endpoint;
  provider: string;
  overrides: Overrides;
  semantic: boolean;
  contextTokens: number;
  searchLimit: number;
  timeoutMs: number;
  seed: string;
}
export function configFor(o: Options): Record<string, any> {
  const config = patchedConfig(bakeoffConfig(o.endpoint.baseUrl, o.endpoint.model, !!o.endpoint.apiKey, o.provider), o.overrides);
  // This eval's treatment is memory inference, not a custom maintenance pipeline.
  const strategy = config.improve?.strategies?.[STRATEGIES["memory-inference"]];
  if (!strategy?.processes?.memoryInference?.enabled || Object.entries(strategy.processes).some(([k, v]) => k !== "memoryInference" && (v as any)?.enabled)) throw new Error("memory-utility requires only memoryInference enabled in its inference strategy");
  if (strategy.sync?.enabled || strategy.sync?.push || config.experimental?.improveAutonomy !== true) throw new Error("memory-utility requires native inference autonomy and disabled sync");
  if (config.bundles && Object.keys(config.bundles).length || config.registries?.length) throw new Error("external bundles and registries are not allowed in isolated memory-utility runs");
  if (o.semantic !== (config.semanticSearchMode === "auto")) throw new Error("--semantic must agree with effective semanticSearchMode; no fallback is allowed");
  return config;
}
export function place(s: Sandbox, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    if (!/^memories\/[a-zA-Z0-9._-]+\.md$/.test(file)) throw new Error(`unexpected memory path: ${file}`);
    const path = join(s.dir, "bundle", file);
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text);
  }
}
/** Keep the exact corpus, including rewritten parent metadata. Never follow links out of an owned sandbox. */
export function snapshot(s: Sandbox): Record<string, string> {
  const root = join(s.dir, "bundle");
  const out: Record<string, string> = {};
  function walk(path: string, relative: string) {
    for (const e of readdirSync(path).sort()) {
      if (e === ".git") continue;
      const file = join(path, e), rel = relative ? `${relative}/${e}` : e, stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`unexpected link in inference snapshot: ${rel}`);
      if (stat.isDirectory()) walk(file, rel);
      else if (stat.isFile() && rel.endsWith(".md")) out[rel] = readFileSync(file, "utf8");
    }
  }
  walk(root, ""); return out;
}
export const seconds = (start: number): number => (performance.now() - start) / 1000;
/**
 * Native inference is one sequential model call per note inside a single `akm improve` command (about 5 s a LongMemEval-size session on the
 * 35B). `--timeout-ms` alone would fail a case with many notes, so the command may take up to this long for each note, if that is more.
 */
export const IMPROVE_MS_PER_NOTE = 30_000;
export const improveTimeoutMs = (timeoutMs: number, notes: number): number => Math.max(timeoutMs, notes * IMPROVE_MS_PER_NOTE);
/** akm's JSON names files by absolute path: saved results write the disposable sandbox folder as <sandbox>, so they name no host path or login. */
export function sandboxRelative<T>(value: T, dir: string): T {
  const escaped = JSON.stringify(dir).slice(1, -1);
  return JSON.parse(JSON.stringify(value).replaceAll(escaped, "<sandbox>"));
}
export async function index(s: Sandbox, o: Options): Promise<void> {
  const out = await runAkmJson<any>(s, ["index", "--full"], { timeoutMs: o.timeoutMs });
  if (!(out.totalEntries > 0)) throw new Error("AKM indexed no entries");
  if (o.semantic && (out.verification?.embeddingCount !== out.totalEntries || out.verification?.missingEmbeddings > 0)) throw new Error(`incomplete embedding coverage: ${out.verification?.embeddingCount ?? "unknown"}/${out.totalEntries}`);
}
export function inferenceOutcome(report: any, before: Record<string, string>, after: Record<string, string>): "output" | "no-change" {
  const mi = report?.memoryInference;
  if (!mi || report.ok === false) throw new Error("native improve did not complete memory inference");
  if (report.usageReport?.byProcessEngineModel?.some((x: any) => x.process === "memoryInference" && x.failures > 0)) throw new Error("memory inference had a failed model call");
  const count = Object.keys(before).length;
  const children = Object.keys(after).filter(p => !(p in before));
  if (Object.keys(before).some(p => !(p in after))) throw new Error("memory inference removed a source note");
  if (!Number.isInteger(mi.considered) || mi.considered !== count || !Number.isInteger(mi.noChange) || !Number.isInteger(mi.writtenFacts) || mi.noChange < 0 || mi.writtenFacts < 0 || (mi.skippedNoFacts ?? 0) > 0 || (mi.htmlErrorCount ?? 0) > 0) throw new Error("memory inference incomplete/unusable or counters unavailable");
  if (mi.noChange + mi.writtenFacts !== count || mi.writtenFacts !== children.length) throw new Error("memory inference counters disagree with the saved snapshot");
  return children.length ? "output" : "no-change";
}
export function blankArm(common = ""): RawArm {
  return { common, state: "not-run", error: null, context: pack([], 1), search: null, prompt: null, answer: null, failed_usage: null, seconds: { index: 0, retrieval: 0, answer: 0 } };
}
export function pending(c: Case, ordinal: number, seed: string): Raw {
  return { order: armOrder(ordinal, seed), source: sourceFiles(c), post_inference: null,
    inference: { outcome: "not-run", report: null, error: null, index_seconds: 0, seconds: 0, model_calls: null },
    arms: Object.fromEntries(ARMS.map(a => [a, blankArm(c.common)])) as Record<ArmName, RawArm> };
}
/** Native inference over the notes of `raw.source`, in a disposable sandbox: records the report, the snapshot and the outcome in `raw`. Never throws; a failure is `raw.inference.outcome === "error"`. */
export async function runInference(raw: Pick<Raw, "source" | "post_inference" | "inference">, config: Record<string, any>, o: Options, checkpoint: () => void = () => {}): Promise<void> {
  const generator = createSandbox("memory-utility-inference");
  try {
    writeConfig(generator, config); place(generator, raw.source);
    let t = performance.now();
    try { await index(generator, o); } finally { raw.inference.index_seconds = seconds(t); }
    t = performance.now();
    try {
      raw.inference.report = sandboxRelative(await runAkmJson(generator, ["improve", "--strategy", STRATEGIES["memory-inference"], "--no-sync", "--require-engines", "--json-to-stdout"], { timeoutMs: improveTimeoutMs(o.timeoutMs, Object.keys(raw.source).length) }), generator.dir);
    } finally { raw.inference.seconds = seconds(t); }
    raw.post_inference = snapshot(generator);
    raw.inference.outcome = inferenceOutcome(raw.inference.report, raw.source, raw.post_inference);
  } catch (e) {
    raw.inference.outcome = "error"; raw.inference.error = sandboxRelative(hideEndpoint(String(e), o.endpoint.baseUrl), generator.dir);
    try { raw.post_inference = snapshot(generator); } catch { /* the failure remains explicit */ }
  } finally {
    tallyCalls(generator.env.AKM_DATA_DIR); raw.inference.model_calls = takeModelCalls();
    try { checkpoint(); } finally { removeSandbox(generator); }
  }
}
/**
 * Search the question in the indexed sandbox and `akm show` each hit, in rank order. Search and show must not change the corpus, and in
 * semantic mode the search must have been semantic. `arm.search` keeps akm's answer with the sandbox folder written as <sandbox>.
 */
export async function retrieve(s: Sandbox, question: string, o: Options, arm: { search: unknown }): Promise<Document[]> {
  const before = sha256Json(snapshot(s));
  const found = await runAkmJson<any>(s, ["search", "--limit", String(o.searchLimit), ...(await agentDetailArgs(s)), "--", question], { timeoutMs: o.timeoutMs });
  arm.search = sandboxRelative(found, s.dir);
  if (o.semantic && found.searchMode !== "semantic") throw new Error(`search did not remain semantic: ${String(found.searchMode)}`);
  if (!Array.isArray(found.hits)) throw new Error("search returned no hits array");
  const docs: Document[] = [];
  for (const hit of found.hits) {
    if (typeof hit.ref !== "string") throw new Error("search hit has no ref");
    const shown = await runAkmJson<any>(s, ["show", hit.ref], { timeoutMs: o.timeoutMs });
    if (typeof shown.content !== "string") throw new Error(`show returned no content for ${hit.ref}`);
    docs.push({ ref: hit.ref, content: shown.content });
  }
  if (sha256Json(snapshot(s)) !== before) throw new Error("answer-phase AKM commands changed the frozen corpus");
  return docs;
}
/** Persist after each phase/arm. All future-question labels stay in the caller, never in the inference sandbox. */
export async function collect(c: Case, raw: Raw, o: Options, checkpoint: () => void = () => {}): Promise<Raw> {
  const config = configFor(o);
  await runInference(raw, config, o, checkpoint);
  for (const name of raw.order) {
    const arm = raw.arms[name];
    if (name === "inferred" && raw.inference.outcome === "error") {
      arm.state = "error"; arm.error = `inference: ${raw.inference.error}`; checkpoint(); continue;
    }
    const s = name === "none" ? null : createSandbox(`memory-utility-${name}`);
    try {
      if (s) {
        writeConfig(s, config);
        place(s, name === "source" ? raw.source : raw.post_inference!);
        let t = performance.now();
        try { await index(s, o); } finally { arm.seconds.index = seconds(t); }
        t = performance.now();
        try { arm.context = pack(await retrieve(s, c.question, o, arm), o.contextTokens); } finally { arm.seconds.retrieval = seconds(t); }
      }
      arm.prompt = promptFor(c, arm.context); checkpoint();
      const t = performance.now();
      try { arm.answer = await chat(o.endpoint, arm.prompt, { ...READER_DEFAULTS, timeoutMs: o.timeoutMs }); }
      finally { arm.seconds.answer = seconds(t); }
      arm.state = "complete";
    } catch (e) {
      arm.state = "error"; arm.error = hideEndpoint(String(e), o.endpoint.baseUrl);
      if (s) arm.error = sandboxRelative(arm.error, s.dir);
      if (e instanceof ChatError) arm.failed_usage = e.usage;
    } finally { try { checkpoint(); } finally { if (s) removeSandbox(s); } }
  }
  return raw;
}
