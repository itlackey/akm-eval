// Test support for the tests of scripts/compare, scripts/matrix and scripts/rescore that need results folders of an eval on the manifest: a run is
// built from the cases and the raw outputs of the eval's golden folder (lib/golden.ts), scored by the eval's own scorer, and written as harness-v3
// writes it, with a manifest in its summary. Nothing here runs akm or a model. Not part of any command.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Measurement, type RunManifest, buildManifest, caseDigests, completionOf, lockedParts } from "../../../lib/manifest.ts";
import { endpointId, engineSettings } from "../../../lib/provenance.ts";
import { spreadOf } from "../../../lib/repeat.ts";

type Obj = Record<string, any>;

/** The akm config of the evals that drive akm through lib/akm: one engine, at an endpoint with a path. */
export const AKM_CONFIG = { defaults: { llmEngine: "model" }, engines: { model: { provider: "openai", endpoint: "http://localhost:9/v1/chat/completions", model: "the-model", temperature: 0, enableThinking: false, timeoutMs: 600000 } }, semanticSearchMode: "off" };

/** The Harbor job of agent-ab and terminal-bench, as their summaries hold it (`config`), without the model or the cases. */
const JOB = { jobs_dir: "jobs", agents: [{ name: "opencode", model_name: "openai/the-model", kwargs: { library_assets: 12 } }], verifier: { override_timeout_sec: 600 } };

export interface RunSpec {
  measurement: Measurement;
  /** The cases of the run, as the eval's golden cases.jsonl have them. */
  cases: any[];
  /** The raw output for a case; undefined when the case was not run. */
  raw: (c: any) => any | undefined;
  /** The folder the run is written under (a results folder), and its name. The default name is `2026-10-12-<label>`. */
  parent: string;
  label?: string;
  folder?: string;
  corpus?: "public" | "custom";
  corpusKind?: string;
  /** Written as `corpus_folder` of a custom run. */
  corpusFolder?: string | null;
  /** The mode of the run, such as longmemeval's `retrieval-only`. */
  mode?: string | null;
  /** The run is one of agent-ab or terminal-bench: its summary holds the Harbor job and the engine as they do. */
  harbor?: boolean;
  /** What a case's input is given besides the case (see Measurement.input). */
  context?: (c: any) => unknown;
  /** Changes the manifest the run writes. */
  manifest?: (m: RunManifest) => RunManifest;
  /** Changes the rows the run writes, after they were scored. */
  rows?: (rows: Obj[]) => Obj[];
  /** Fields that replace those of the summary. */
  summary?: Obj;
  /** The run is a legacy run: it has no manifest. */
  legacy?: boolean;
  settings?: Partial<RunManifest["settings"]>;
}

/** The summary and the rows of a run as the spec describes it. */
export function buildRun(spec: RunSpec): { summary: Obj; rows: Obj[] } {
  const m = spec.measurement;
  const scored = spec.cases.flatMap((c) => {
    const raw = spec.raw(c);
    return raw === undefined ? [] : [m.score(c, raw)];
  });
  const written = spec.rows ? spec.rows(scored) : scored;
  const corpus = spec.corpus ?? "public";
  const harbor = spec.harbor === true;
  const config = harbor ? JOB : AKM_CONFIG;
  const engine = harbor ? { model: "the-model", endpoint: "http://localhost:9", endpoint_id: endpointId("http://localhost:9/v1") } : engineSettings(AKM_CONFIG);
  const settings = { strategy: harbor ? null : "bakeoff", ...spec.settings };
  const base = buildManifest({
    measurement: m,
    parts: lockedParts(m),
    corpus,
    mode: spec.mode ?? null,
    cases: caseDigests(m, spec.cases, spec.context),
    akm: { version: "0.9.99-test", bin: "akm", build: null, build_fingerprint: null },
    config,
    ...(harbor ? { engines: { opencode: { ...engine, temperature: null, enableThinking: null, timeoutMs: null } }, treatment_hints: { attempts: 3 } } : {}),
    settings,
    completion: completionOf(m, spec.cases.map((c) => m.caseId(c)), scored),
  });
  const summary: Obj = {
    eval: m.eval,
    corpus,
    ...(corpus === "custom" ? { corpus_kind: spec.corpusKind ?? "rewrite", corpus_private: false, corpus_folder: spec.corpusFolder ?? null } : {}),
    label: spec.label ?? "run",
    date: "2026-10-12T09:00:00.000Z",
    git_commit: "5d1c0de",
    harness_sha256: "b".repeat(64),
    model: "the-model",
    akm_version: "0.9.99-test",
    akm_bin: "akm",
    akm_build: null,
    akm_build_fingerprint: null,
    limit: null,
    strategy: settings.strategy,
    config_patch: null,
    config: JSON.parse(JSON.stringify(config)),
    ...(harbor ? { akm_env: {}, completion: { expected: spec.cases.length * 6, completed: spec.cases.length * 6, failed: 0, missing: 0 } } : {}),
    engine,
    assets_sha256: "a".repeat(64),
    seed: null,
    status: "complete",
    aborted_reason: null,
    n_cases: scored.length,
    ...(spec.mode === undefined ? {} : { mode: spec.mode }),
    ...m.summarize(written as any[]),
    ...spec.summary,
  };
  if (spec.legacy !== true) summary.manifest = spec.manifest ? spec.manifest(base) : base;
  return { summary, rows: written };
}

/** Writes the run under `spec.parent` and returns its folder. */
export function writeRun(spec: RunSpec): string {
  const { summary, rows } = buildRun(spec);
  const dir = join(spec.parent, spec.folder ?? `2026-10-12-${spec.label ?? "run"}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return dir;
}

/**
 * `runs` runs of the spec as a `--repeat` leaves them under `spec.parent`: `<date>-<label>-r1` to `-rN` and the repeat summary beside them. Returns the
 * names of the folders and of the repeat summary.
 */
export function writeRepeats(spec: RunSpec, runs = 3): { folders: string[]; summary: string } {
  const label = spec.label ?? "run";
  const folders = Array.from({ length: runs }, (_, i) => `2026-10-12-${label}-r${i + 1}`);
  const built = folders.map((folder, i) => {
    writeRun({ ...spec, label: `${label}-r${i + 1}`, folder });
    return buildRun({ ...spec, label: `${label}-r${i + 1}` }).summary;
  });
  const first = built[0] as Obj;
  const summary = `2026-10-12-${label}-repeat-summary.json`;
  writeFileSync(join(spec.parent, summary), JSON.stringify({ eval: first.eval, corpus: first.corpus, label, repeat: runs, model: first.model, akm_version: first.akm_version, akm_bin: first.akm_bin, akm_build: first.akm_build, runs: folders, n_errored: spreadOf(built.map((s) => s.n_errored)), seconds: spreadOf(built.map(() => 60)), metrics: spreadOf(built.map((s) => s.metrics)) }));
  return { folders, summary };
}

// ---- the evals that were added to compare and the matrix: a run that does well and one that does badly --------------------------------------------

const ROOT = join(import.meta.dir, "..", "..", "..");
const jsonl = (file: string): Obj[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
export const goldenOf = (folder: string): { cases: Obj[]; raw: { case: string; note: string; raw: Obj }[] } => ({ cases: jsonl(join(ROOT, folder, "golden", "cases.jsonl")), raw: jsonl(join(ROOT, folder, "golden", "raw.jsonl")) as any });

/** One eval and the two kinds of run the tests build of it: `good` answers its cases well, `bad` badly. A retrieval-only longmemeval run has `goodRetrievalOnly` and `badRetrievalOnly`. */
export interface EvalFixture {
  measurement: Measurement;
  cases: Obj[];
  harbor: boolean;
  good: (c: Obj) => Obj;
  bad: (c: Obj) => Obj;
  /** Harbor: the akm arm does well, and the control arm called akm, which it has no plugin to do. */
  badControl?: (c: Obj) => Obj;
  goodRetrievalOnly?: (c: Obj) => Obj;
  badRetrievalOnly?: (c: Obj) => Obj;
}

/** The trials of a Harbor task: the rewards of each arm's attempts. A reward of null is a trial that never got one. */
export function harborTrials(task: string, control: (number | null)[], akm: (number | null)[], controlCalls = false): Obj {
  const trial = (arm: "control" | "akm", reward: number | null, i: number): Obj => ({ task, arm, trial: `${task}__${arm}${i}`, reward, error: reward === null ? "RuntimeError" : null, akm: arm === "akm" || controlCalls ? { akm_search: 1 } : {}, tools: 2, curated: arm === "akm" ? true : null, tokens: { input: 1000, cache: 900, output: 50 }, costUsd: null, seconds: 60, agentSeconds: 30, digest: null, timed_out: false });
  return { trials: [...control.map((r, i) => trial("control", r, i)), ...akm.map((r, i) => trial("akm", r, i))] };
}

/** The fixture of an eval that compare and the matrix were given a reading for after harness-v3: agent-ab, terminal-bench, bakeoff, longmemeval and skillret. */
export async function evalFixture(name: "agent-ab" | "terminal-bench" | "bakeoff" | "longmemeval" | "skillret"): Promise<EvalFixture> {
  const folder = name === "agent-ab" || name === "bakeoff" ? `evals/${name}` : `benchmarks/${name}`;
  const { MEASUREMENT } = (await import(join(ROOT, folder, "src", "measurement.ts"))) as { MEASUREMENT: Measurement };
  const golden = goldenOf(folder);
  const { raw } = golden;
  // a bakeoff case as the run loads it has the text of its files; the golden folder keeps the case as cases.json has it
  const cases = name === "bakeoff" ? golden.cases.map((c) => ({ ...c, texts: Object.fromEntries(c.files.map((path: string) => [path, `the text of ${path}`])) })) : golden.cases;
  if (name === "agent-ab" || name === "terminal-bench") {
    return { measurement: MEASUREMENT, cases, harbor: true, good: (c) => harborTrials(c.id, [0, 0, 0], [1, 1, 1]), bad: (c) => harborTrials(c.id, [0, 0, 0], [0, 0, 0]), badControl: (c) => harborTrials(c.id, [0, 0, 0], [1, 1, 1], true) };
  }
  const stored = (line: { case: string; raw: Obj }): Obj => (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: Obj }).raw;
  if (name === "bakeoff") {
    // the first raw output of a case is the model doing it right, the second one way of getting it wrong
    const nth = (c: Obj, n: number): Obj => stored(raw.filter((line) => line.case === c.id)[n] as (typeof raw)[number]);
    return { measurement: MEASUREMENT, cases, harbor: false, good: (c) => nth(c, 0), bad: (c) => nth(c, 1) };
  }
  if (name === "longmemeval") {
    const template = stored(raw[0] as (typeof raw)[number]); // both arms answer right, and akm finds the evidence
    const good = (c: Obj): Obj => ({ ...template, retrieved_session_ids: [...c.answer_session_ids, "other"] });
    const bad = (c: Obj): Obj => ({ ...template, retrieved_session_ids: ["other"], with_akm: { ...template.with_akm, hypothesis: "I do not know", verdict: "no" } });
    return { measurement: MEASUREMENT, cases, harbor: false, good, bad, goodRetrievalOnly: (c) => ({ ...good(c), without_akm: null, with_akm: null }), badRetrievalOnly: (c) => ({ ...bad(c), without_akm: null, with_akm: null }) };
  }
  const ranked = (c: Obj, found: boolean): Obj => ({ ranked: [...(found ? c.relevant : []), "other-skill-1", "other-skill-2"], seconds: 1 });
  return { measurement: MEASUREMENT, cases, harbor: false, good: (c) => ({ search: ranked(c, true), semantic_search: ranked(c, true) }), bad: (c) => ({ search: ranked(c, false), semantic_search: ranked(c, false) }) };
}
