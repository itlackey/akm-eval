// The matrix over runs that carry a manifest (harness-v3), and the fingerprint of a job whose eval declares a measurement. reflect is the eval
// that writes a manifest, so these tests build reflect runs from the raw outputs in fixtures/ of evals/reflect/golden, score them with the eval's
// own scorer, and write them as results folders with a manifest, the way scripts/compare's manifest.test.ts does. What they exercise: the
// identity a result is read by (the manifest, through lib/manifest.ts), the collector and scorer versions in a decision row, the two sides scored
// by different scorers (both are scored again), a different collector or case input, and the runs from before the manifest.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESS_VERSION, type RunManifest, buildManifest, caseDigests, completionOf } from "../../../lib/manifest.ts";
import { engineSettings } from "../../../lib/provenance.ts";
import { spreadOf } from "../../../lib/repeat.ts";
import { type Case, type Raw, type Row, isDefect, reflectConfig } from "../../../evals/reflect/src/lib.ts";
import { MEASUREMENT } from "../../../evals/reflect/src/measurement.ts";
import { buildDecision, renderMarkdown } from "./decision.ts";
import { fingerprintOf, inputsDigest, resumable } from "./fingerprint.ts";
import { type Matrix, type ResultRef, type RunRecord, emptyState, findResults, incompleteReason, loadMeasured, parseMatrix, resultsParents, selectForConfirm } from "./lib.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const FIXTURES = join(ROOT, "evals", "reflect", "fixtures");
const CASES: Case[] = jsonl(join(FIXTURES, "cases.jsonl"));
const RAW: { case: string; note: string; raw: Raw }[] = jsonl(join(FIXTURES, "raw.jsonl"));
const raw = (id: string, note: string): Raw => (RAW.find((l) => l.case === id && l.note === note) as { raw: Raw }).raw;
/** What a model that does well, and one that does badly, answers for a case. */
const GOOD = (c: Case): Raw => raw(c.id, isDefect(c.class) ? "the model restores what the injection took away" : "the model leaves the note alone");
const BAD = (c: Case): Raw => raw(c.id, isDefect(c.class) ? "the model proposes no change" : "the model rewrites the description and the when_to_use");
const ids = CASES.map((c) => c.id);
const CONFIG = reflectConfig("http://localhost:9/v1", "the-model", true);

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "matrix-manifest-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const live = () => ({ collector: { version: MEASUREMENT.version }, harness_version: HARNESS_VERSION });
const lit = (version: string): string => version.replace(/\./g, "\\."); // a version as the text of a regular expression
/** A scorer other than this one, as a manifest from before the version was set by hand records it. */
const STALE = () => ({ version: "9.9", sha256: "c".repeat(64) });
const OTHER_COLLECTOR = () => ({ version: "9.9", sha256: "d".repeat(64) });

interface Spec {
  raw: (c: Case) => Raw;
  /** Changes the manifest the run writes. */
  manifest?: (m: RunManifest) => RunManifest;
  /** Changes the rows the run writes, after they were scored. */
  rows?: (rows: Row[]) => Record<string, any>[];
  summary?: Record<string, unknown>;
  /** The run has no manifest: it was written before harness-v3. */
  legacy?: boolean;
}

/**
 * The result of one side of a matrix row, as the stage leaves it under `root`: `runs` reflect runs of the golden cases with a manifest, and for more
 * than one the repeat summary beside them. Returns the run record the matrix state holds.
 */
function side(root: string, name: string, spec: Spec, stage: "screen" | "confirm" = "confirm", runs = stage === "confirm" ? 3 : 1): RunRecord {
  const parent = join(root, "evals", "reflect", "results");
  const label = `sw-${name}-${stage === "confirm" ? "c" : "s"}`;
  const scored = CASES.map((c) => MEASUREMENT.score(c, spec.raw(c)));
  const written = spec.rows ? spec.rows(scored) : scored;
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: "public",
    cases: caseDigests(MEASUREMENT, CASES),
    akm: { version: "0.9.99-test", bin: "akm", build: null, build_fingerprint: null },
    config: CONFIG,
    settings: { strategy: "reflect-only" },
    completion: completionOf(MEASUREMENT, ids, scored),
  });
  const summaries: Record<string, any>[] = [];
  const folders: string[] = [];
  for (let i = 1; i <= runs; i++) {
    const folder = stage === "confirm" ? `2026-10-09-${label}-r${i}` : `2026-10-09-${label}`;
    const summary: Record<string, any> = {
      eval: "reflect",
      corpus: "public",
      label: stage === "confirm" ? `${label}-r${i}` : label,
      date: "2026-10-09T09:00:00.000Z",
      git_commit: "5d1c0de",
      harness_sha256: "b".repeat(64),
      model: "the-model",
      akm_version: "0.9.99-test",
      akm_bin: "akm",
      akm_build: null,
      akm_build_fingerprint: null,
      limit: null,
      strategy: "reflect-only",
      config_patch: null,
      config: JSON.parse(JSON.stringify(CONFIG)),
      engine: engineSettings(CONFIG),
      assets_sha256: "a".repeat(64),
      seed: null,
      status: "complete",
      aborted_reason: null,
      n_cases: CASES.length,
      ...MEASUREMENT.summarize(written as Row[]),
      ...spec.summary,
    };
    if (spec.legacy !== true) summary.manifest = spec.manifest ? spec.manifest(manifest) : manifest;
    mkdirSync(join(parent, folder), { recursive: true });
    writeFileSync(join(parent, folder, "summary.json"), JSON.stringify(summary));
    writeFileSync(join(parent, folder, "samples.jsonl"), written.map((r) => `${JSON.stringify(r)}\n`).join(""));
    summaries.push(summary);
    folders.push(folder);
  }
  let file = `evals/reflect/results/${folders[0]}/summary.json`;
  if (stage === "confirm") {
    file = `evals/reflect/results/2026-10-09-${label}-repeat-summary.json`;
    const first = summaries[0];
    writeFileSync(join(root, file), JSON.stringify({ eval: "reflect", corpus: "public", label, repeat: runs, model: first.model, akm_version: first.akm_version, akm_bin: first.akm_bin, akm_build: first.akm_build, runs: folders, n_errored: spreadOf(summaries.map((s) => s.n_errored)), seconds: spreadOf(summaries.map(() => 60)), metrics: spreadOf(summaries.map((s) => s.metrics)) }));
  }
  const ref: ResultRef = { scope: "", kind: stage === "confirm" ? "repeat" : "run", file };
  return { stage, name, eval: "reflect", label, args: [], repeat: stage === "confirm" ? runs : null, started: "", wall_seconds: 30, exit_code: 0, log: "", results: [ref] };
}

const matrix = (extra: object = {}): Matrix => parseMatrix({ prefix: "sw", baseline: { name: "base", eval: "reflect" }, configs: [{ name: "pr", eval: "reflect", args: ["--strategy", "quick"], ...extra }] }, "/work/sweeps/x/matrix.json");

/** The decision row of a baseline and a config, each written as `side` writes it. */
function decide(base: Spec, cfg: Spec, m: Matrix = matrix(), root = tmp()) {
  const state = emptyState(m);
  state.confirm.base = side(root, "base", base);
  state.confirm.pr = side(root, "pr", cfg);
  return { root, state, m, row: buildDecision(root, m, state, 0).rows[0] };
}
const bytes = (root: string): string[] => [join(root, "evals", "reflect", "results")].flatMap((dir) => Bun.spawnSync(["find", dir, "-type", "f"], { stdout: "pipe" }).stdout.toString().trim().split("\n").sort().map((f) => `${f}\n${readFileSync(f, "utf8")}`));

describe("the collector and the scorer in a decision row", () => {
  test("each side's versions are in the row and in the table, and the sides compare when the parts are the same", () => {
    const { row, root, m, state } = decide({ raw: BAD }, { raw: GOOD });
    const parts = live();
    expect(row.collector).toEqual({ baseline: `v${parts.collector.version}`, config: `v${parts.collector.version}` });
    expect(row).toMatchObject({ verdict: "better", rescored: true, exploratory: [], note: "" });
    expect(row.metrics.find((x) => x.path === "defects.rate")).toMatchObject({ baseline: { mean: 0 }, config: { mean: 1 }, signal: "better" });
    const md = renderMarkdown(buildDecision(root, m, state, 0, new Date("2026-10-09T12:00:00Z")));
    expect(md).toContain("| model | version |");
    expect(md).toContain(`v${parts.collector.version} → v${parts.collector.version} (scored again) |`);
  });

});

describe("two sides scored by different scorers", () => {
  /** A was scored by an older scorer that called every row right; its summary says so too. */
  const stale: Spec = { raw: BAD, manifest: (m) => ({ ...m, scorer: STALE() }), rows: (rows) => rows.map((r) => ({ ...r, correct: true, checks: Object.fromEntries(Object.keys(r.checks ?? {}).map((k) => [k, true])) })) };

  test("both are scored again with the current scorer before the decision, which says so, and the stored folders are not touched", () => {
    const m = matrix();
    const root = tmp();
    const state = emptyState(m);
    state.confirm.base = side(root, "base", stale);
    state.confirm.pr = side(root, "pr", { raw: GOOD });
    const before = bytes(root);
    const row = buildDecision(root, m, state, 0).rows[0];
    // the stored numbers of the baseline say it answered every defect (1); the current scorer says it answered none (0)
    expect(JSON.parse(readFileSync(join(root, "evals", "reflect", "results", "2026-10-09-sw-base-c-r1", "summary.json"), "utf8")).metrics.defects.rate).toBe(1);
    expect(row.metrics.find((x) => x.path === "defects.rate")).toMatchObject({ baseline: { min: 0, max: 0, mean: 0 }, config: { mean: 1 }, signal: "better" });
    expect(row).toMatchObject({ verdict: "better", rescored: true });
    expect(row.paired).toMatchObject({ repeats: { baseline: 3, config: 3 }, better: 10, worse: 0 }); // the paired comparison reads the rescored rows too
    expect(row.coverage).toEqual({ baseline: { selected: 10, scored: 10, errored: 0 }, config: { selected: 10, scored: 10, errored: 0 } });
    expect(renderMarkdown(buildDecision(root, m, state, 0))).toContain("(scored again)");
    expect(bytes(root)).toEqual(before);
  });

  test("a case with other labels in some run is scored again too", () => {
    const relabelled: Spec = { raw: BAD, manifest: (m) => ({ ...m, cases: { ...m.cases, [ids[0]]: { ...m.cases[ids[0]], label_sha256: "e".repeat(64) } } }) };
    const { row } = decide(relabelled, { raw: GOOD });
    expect(row).toMatchObject({ verdict: "better", rescored: true });
  });

  test("two screens scored by different scorers are scored again before the stage picks what to confirm", () => {
    const m = matrix();
    const root = tmp();
    const state = emptyState(m);
    state.screen.base = side(root, "base", stale, "screen");
    state.screen.pr = side(root, "pr", { raw: GOOD }, "screen");
    // as stored, both say they answered every defect: no difference. Scored by one scorer, the baseline answered none.
    const { selected, skipped } = selectForConfirm(root, m, state, { minDelta: 0 });
    expect(selected.map((s) => [s.config.name, s.reason])).toEqual([["pr", "screen differs: defects.rate, controls.rate"]]);
    expect(skipped).toEqual([]);
  });
});

describe("the collector and the inputs of the cases", () => {
  test("another collector version is not comparable, naming both, unless the collector is the row's treatment", () => {
    const other = OTHER_COLLECTOR();
    const cfg: Spec = { raw: GOOD, manifest: (m) => ({ ...m, collector: other }) };
    const { row } = decide({ raw: BAD }, cfg);
    expect(row.verdict).toBe("not comparable");
    expect(row.note).toBe(`the eval's code differs: version ${live().collector.version} (harness ${live().harness_version}) in the baseline, version ${other.version} (harness ${live().harness_version}) in the config`);
    expect(row.collector).toEqual({ baseline: `v${live().collector.version}`, config: `v${other.version}` });
    const treated = decide({ raw: BAD }, cfg, matrix({ treatment: "harness" }));
    expect(treated.row).toMatchObject({ verdict: "better", exploratory: [], treatment: ["harness"] });
  });

  test("a case that was given another input in a run is a difference of inputs: not comparable, naming the cases, unless the inputs are the treatment", () => {
    const moved = [ids[0], ids[5]];
    const cfg: Spec = { raw: GOOD, manifest: (m) => ({ ...m, cases: Object.fromEntries(Object.entries(m.cases).map(([id, d]) => [id, moved.includes(id) ? { ...d, input_sha256: "f".repeat(64) } : d])) }) };
    const { row } = decide({ raw: BAD }, cfg);
    expect(row.verdict).toBe("not comparable");
    expect(row.note).toBe(`the cases were not given the same input in every run (input_sha256) for 2 cases: ${moved.sort().join(", ")}. A case with another input is another case`);
    expect(decide({ raw: BAD }, cfg, matrix({ treatment: "inputs" })).row.verdict).toBe("better");
  });

  test("the labels of the cases are not an axis, and assets_sha256 is not compared for runs that have a manifest", () => {
    const { row } = decide({ raw: BAD, summary: { assets_sha256: "1".repeat(64) } }, { raw: GOOD, summary: { assets_sha256: "2".repeat(64) } });
    expect(row.verdict).toBe("better"); // the cases are compared one by one by their digests, and these are the same
  });
});

describe("a run made before akm-eval 0.2 (no manifest)", () => {
  test("is no result, refused before anything else, and the reason says to run it again", () => {
    const root = tmp();
    const rec = side(root, "base", { raw: GOOD, legacy: true, summary: { status: "aborted" } });
    expect(incompleteReason(root, rec.results[0])).toBe("evals/reflect/results/2026-10-09-sw-base-c-r1 was made before akm-eval 0.2 (it has no manifest), so it cannot be compared or scored again: run it again");
    expect(loadMeasured(root, rec.results[0], 30, rec.repeat)).toBeNull();
  });
});

describe("a result is read through the manifest", () => {
  const load = (root: string, rec: RunRecord) => loadMeasured(root, rec.results[0], 30, rec.repeat);

  test("the akm and the seed come from the manifest, not from the top of the summary", () => {
    const root = tmp();
    const spec: Spec = { raw: GOOD, summary: { akm_build: "stale-top", akm_version: "0.0.1", akm_build_fingerprint: "9".repeat(64), seed: 99 }, manifest: (m) => ({ ...m, akm: { ...m.akm, build: "b-manifest", version: "0.9.99-test", build_fingerprint: "8".repeat(64) }, settings: { ...m.settings, seed: "42" } }) };
    const measured = load(root, side(root, "base", spec)) as NonNullable<ReturnType<typeof load>>;
    expect([measured.akm_build, measured.akm_version, measured.akm_build_fingerprint]).toEqual(["b-manifest", "0.9.99-test", "8".repeat(64)]);
    expect(measured.runs.map((r) => [r.identity.collector, r.identity.seed])).toEqual([0, 1, 2].map(() => [live().collector.version, "42"]));
  });

  test("a manifest the validator refuses makes the run no result, and says what is wrong", () => {
    const root = tmp();
    const rec = side(root, "base", { raw: GOOD, manifest: (m) => ({ ...m, cases: { x: { input_sha256: "nope", label_sha256: "nope" } } as unknown as RunManifest["cases"] }) });
    expect(incompleteReason(root, rec.results[0])).toMatch(/^is not usable: run r1's manifest is not sound: the case x needs an input_sha256 and a label_sha256/);
    expect(load(root, rec)).toBeNull();
    const single = side(root, "pr", { raw: GOOD, manifest: (m) => ({ ...m, manifest_version: 7 }) }, "screen");
    expect(incompleteReason(root, single.results[0])).toBe("is not usable: its manifest is not sound: manifest_version is 7, and this harness reads 1");
  });
});

describe("the fingerprint of a job whose eval declares a measurement", () => {
  const env = { AKM_BIN: "fake-akm", MODEL_NAME: "m1", MODEL_BASE_URL: "https://a.example.com/v1" };
  const job = (evalName: string, args: string[] = []) => ({ args, row: { name: "r", eval: evalName, args: [] } });
  const changed = (a: { parts: Record<string, string> }, b: { parts: Record<string, string> }): string[] => [...new Set([...Object.keys(a.parts), ...Object.keys(b.parts)])].filter((k) => a.parts[k] !== b.parts[k]).sort();

  /** A checkout with an eval called tiny: a collector, a scorer and its declaration, with its version. */
  function tiny(version = "0.1"): string {
    const root = tmp();
    mkdirSync(join(root, "evals", "tiny", "src"), { recursive: true });
    const write = (file: string, text: string) => writeFileSync(join(root, "evals", "tiny", "src", file), text);
    write("collect.ts", "export const collect = 1;\n");
    write("score.ts", "export const score = 1;\n");
    setVersion(root, version);
    return root;
  }
  const setVersion = (root: string, version: string) => writeFileSync(join(root, "evals", "tiny", "src", "measurement.ts"), `export const MEASUREMENT = { eval: "tiny", version: "${version}" };\n`);

  test("is made from the eval's version, not from this repository's code: it has a collector part and no harness part", () => {
    const parts = fingerprintOf(tiny(), job("tiny"), env).parts;
    expect(Object.keys(parts).sort()).toEqual(["akm", "args", "collector", "corpus", "files", "model"]);
    const real = fingerprintOf(ROOT, job("reflect"), env).parts;
    expect(Object.keys(real).sort()).toEqual(["akm", "args", "collector", "corpus", "files", "model"]);
    expect(Object.keys(fingerprintOf(tmp(), job("reflect"), env).parts).sort()).toEqual(["akm", "args", "corpus", "files", "harness", "model"]); // an eval that declares none: the repository's code, as before
  });

  test("a new version runs the job again; an edit to the code at the same version does not", () => {
    const root = tiny();
    const first = fingerprintOf(root, job("tiny"), env);
    writeFileSync(join(root, "evals", "tiny", "src", "score.ts"), "export const score = 2; // a scorer fix\n");
    writeFileSync(join(root, "evals", "tiny", "src", "collect.ts"), "export const collect = 2; // a comment\n");
    expect(fingerprintOf(root, job("tiny"), env)).toEqual(first);
    setVersion(root, "0.2");
    expect(changed(first, fingerprintOf(root, job("tiny"), env))).toEqual(["collector"]);
  });

  test("a stage says the version changed, and a record from before it ran with the code of the repository runs once more", () => {
    const root = tiny();
    const j = { label: "x", args: [] as string[] };
    const was = fingerprintOf(root, job("tiny"), env);
    setVersion(root, "0.2");
    const now = fingerprintOf(root, job("tiny"), env);
    const dir = join(root, "evals", "tiny", "results", "2026-10-11-x");
    mkdirSync(dir, { recursive: true });
    const manifest = buildManifest({ measurement: { eval: "tiny", version: "0.1" }, corpus: "public", cases: {}, completion: { selected: [], scored: [], errored: [] } });
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ eval: "tiny", label: "x", status: "complete", manifest }));
    const rec: RunRecord = { stage: "screen", name: "t", eval: "tiny", label: "x", args: [], repeat: null, started: "", wall_seconds: 1, exit_code: 0, log: "", results: [{ scope: "", kind: "run", file: "evals/tiny/results/2026-10-11-x/summary.json" }], fingerprint: was.sha256, fingerprint_parts: was.parts };
    expect(resumable(root, rec, j, was)).toEqual({ skip: true, why: "" });
    expect(resumable(root, rec, j, now)).toEqual({ skip: false, why: "the eval's version (in its src/measurement.ts) or the harness version changed since its last run" });
    const { collector: _collector, ...old } = was.parts;
    expect(resumable(root, { ...rec, fingerprint_parts: { ...old, harness: "0".repeat(64) } }, j, now)).toEqual({ skip: false, why: "its last run did not record what it was made from" });
  });

  test("an eval whose declaration is broken is made from the repository's code", () => {
    const root = tiny();
    writeFileSync(join(root, "evals", "tiny", "src", "measurement.ts"), "throw new Error('broken');\n");
    expect(Object.keys(fingerprintOf(root, job("tiny"), env).parts)).toContain("harness");
  });
});

describe("a relabelled case does not run a row again", () => {
  const env = { AKM_BIN: "fake-akm", MODEL_NAME: "m1", MODEL_BASE_URL: "https://a.example.com/v1" };
  const job = (evalName: string, args: string[]) => ({ args, row: { name: "r", eval: evalName, args: [] } });
  const fingerprint = (evalName: string, dir: string) => fingerprintOf(ROOT, job(evalName, ["--cases", dir]), env);
  const changed = (a: { parts: Record<string, string> }, b: { parts: Record<string, string> }): string[] => [...new Set([...Object.keys(a.parts), ...Object.keys(b.parts)])].filter((k) => a.parts[k] !== b.parts[k]).sort();
  const write = (dir: string, file: string, rows: object[]) => writeFileSync(join(dir, file), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));

  /** A custom corpus of reflect's golden cases, in a folder outside the checkout whose name has a space. */
  function reflectCorpus(): { dir: string; cases: Record<string, any>[] } {
    const dir = join(tmp(), "my notes");
    mkdirSync(dir, { recursive: true });
    const cases = jsonl(join(FIXTURES, "cases.jsonl"));
    write(dir, "cases.jsonl", cases);
    return { dir, cases };
  }

  test("the labels of a case are not in the fingerprint: another allow, forbid, class or anchors runs nothing again, in the corpus and in the files its --cases names", () => {
    const { dir, cases } = reflectCorpus();
    const first = fingerprint("reflect", dir);
    write(dir, "cases.jsonl", cases.map((c, i) => (i === 2 ? { ...c, allow: [...(c.allow ?? []), "when_to_use"], forbid: ["a term"], anchors: ["2026-01-01"] } : c)));
    expect(fingerprint("reflect", dir)).toEqual(first);
    write(dir, "cases.jsonl", cases.map((c, i) => (i === 4 ? { ...c, class: "title-missing" } : c)));
    expect(fingerprint("reflect", dir)).toEqual(first);
  });

  test("a case whose input changed, one added and one removed run the row again; so do the other files of the corpus", () => {
    const { dir, cases } = reflectCorpus();
    const first = fingerprint("reflect", dir);
    const was = jsonl(join(dir, "cases.jsonl"));
    expect(was.length).toBe(cases.length);
    write(dir, "cases.jsonl", cases.map((c, i) => (i === 1 ? { ...c, feedback: `${c.feedback} It also reads badly.` } : c)));
    expect(changed(first, fingerprint("reflect", dir))).toEqual(["corpus"]);
    write(dir, "cases.jsonl", cases.map((c, i) => (i === 1 ? { ...c, source: `${c.source}\nA new line.\n` } : c)));
    expect(changed(first, fingerprint("reflect", dir))).toEqual(["corpus"]);
    write(dir, "cases.jsonl", cases.slice(1));
    expect(changed(first, fingerprint("reflect", dir))).toEqual(["corpus"]);
    write(dir, "cases.jsonl", [...cases, { ...cases[0], id: "description-period-99" }]);
    expect(changed(first, fingerprint("reflect", dir))).toEqual(["corpus"]);
    write(dir, "cases.jsonl", cases);
    expect(fingerprint("reflect", dir)).toEqual(first);
    writeFileSync(join(dir, "extra.json"), "{}"); // a file of the corpus that is not a case file counts by its bytes
    expect(changed(first, fingerprint("reflect", dir))).toEqual(["corpus", "files"]);
  });

  test("cases that cannot be read count by their bytes, so an edit to them is still a change", () => {
    const { dir } = reflectCorpus();
    writeFileSync(join(dir, "cases.jsonl"), "not json\n");
    const first = fingerprint("reflect", dir);
    expect(fingerprint("reflect", dir)).toEqual(first);
    writeFileSync(join(dir, "cases.jsonl"), "still not json\n");
    expect(changed(first, fingerprint("reflect", dir))).toEqual(["corpus", "files"]);
  });

  test("retrieval: the qrels are labels and the queries are inputs", () => {
    const dir = join(tmp(), "my notes");
    mkdirSync(dir, { recursive: true });
    const [queries, qrels] = ["queries", "qrels"].map((name) => jsonl(join(ROOT, "evals", "retrieval", "assets", `${name}.jsonl`)));
    write(dir, "queries.jsonl", queries as object[]);
    write(dir, "qrels.jsonl", qrels as object[]);
    const first = fingerprint("retrieval", dir);
    write(dir, "qrels.jsonl", (qrels as Record<string, any>[]).map((r, i) => (i === 0 ? { ...r, grade: r.grade === 3 ? 2 : 3 } : r))); // a pair graded again
    expect(fingerprint("retrieval", dir)).toEqual(first);
    write(dir, "queries.jsonl", (queries as Record<string, any>[]).map((q, i) => (i === 0 ? { ...q, query: `${q.query}, in small steps` } : q)));
    expect(changed(first, fingerprint("retrieval", dir))).toEqual(["corpus"]);
  });

  test("promotion --cases DIR: the row finds its results in private/promotion/results, where the run writes them", () => {
    const root = tmp();
    const label = "sw-p-s";
    const results = join(root, "private", "promotion", "results", `2026-10-12-${label}`);
    mkdirSync(results, { recursive: true });
    writeFileSync(join(results, "summary.json"), JSON.stringify({ eval: "promotion", label, status: "complete", metrics: { precision: { value: 1 } } }));
    const args = ["--cases", "my notes", "--label", label];
    expect(resultsParents(root, "promotion", args)).toEqual([join(root, "private", "promotion", "results"), join(root, "private", "promotion", "own", "results"), join(root, "private", "promotion", "own", "results-feedback")]);
    expect(findResults(root, { label, repeat: null, args, row: { name: "p", eval: "promotion", args: ["--cases", "my notes"] } }, 0)).toEqual([{ scope: "", kind: "run", file: `private/promotion/results/2026-10-12-${label}/summary.json` }]);
    // the public corpus is the eval's own results folder, which the same label in it would not be taken for
    expect(findResults(root, { label, repeat: null, args: ["--label", label], row: { name: "p", eval: "promotion", args: [] } }, 0)).toEqual([]);
  });
});

describe("results scored against labels that have changed since are scored again", () => {
  /** Both sides were scored against labels that have since changed: their manifests hold another label digest for every case, the same on both sides, so they agree with each other. */
  const oldLabels = (m: RunManifest): RunManifest => ({ ...m, cases: Object.fromEntries(Object.entries(m.cases).map(([id, c]) => [id, { ...c, label_sha256: "e".repeat(64) }])) });
  /** An older labelling called every defect fixed: it scored the rows right, and the stored numbers say so. */
  const calledRight = (rows: Row[]): Record<string, any>[] => rows.map((r) => ({ ...r, correct: true, checks: Object.fromEntries(Object.keys(r.checks ?? {}).map((k) => [k, true])) }));

  test("a relabelled case is scored again with the current labels, though the two sides agree with each other, and the row says so", () => {
    const { row } = decide({ raw: BAD, manifest: oldLabels, rows: calledRight }, { raw: GOOD, manifest: oldLabels });
    expect(row).toMatchObject({ verdict: "better", rescored: true });
    expect(row.metrics.find((x) => x.path === "defects.rate")).toMatchObject({ baseline: { mean: 0 }, config: { mean: 1 }, signal: "better" }); // the stored numbers said 1 and 1
    expect(row.paired).toMatchObject({ better: 10 }); // the paired comparison reads the rescored rows too
  });

  test("so are results scored by an older scorer, on both sides", () => {
    const { row } = decide({ raw: BAD, manifest: (m) => ({ ...m, scorer: STALE() }), rows: calledRight }, { raw: GOOD, manifest: (m) => ({ ...m, scorer: STALE() }) });
    expect(row).toMatchObject({ verdict: "better", rescored: true });
  });

  test("a run that cannot be scored again is compared as it was scored, and the row says what it lacks", () => {
    const noProposal = (rows: Row[]) => rows.map((r) => (r.outcome === "proposal" ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "proposal")) : r));
    const { row } = decide({ raw: BAD, rows: noProposal }, { raw: GOOD });
    expect(row).toMatchObject({ verdict: "better", rescored: false });
    expect(row.note).toMatch(/the baseline cannot be scored again with the current scorer: .*its rows lack the raw output the reflect scorer reads: proposal .*, so both sides are compared as they were scored/);
  });
});

describe("the cases of the public corpus count by their inputs", () => {
  test("every eval that keeps its cases in files has the digest of the inputs of its public cases, and the labels are not in it", () => {
    for (const name of ["reflect", "distill", "extract", "judge-gate", "promotion", "retrieval", "bakeoff", "nightly", "consolidate"]) {
      expect(inputsDigest(ROOT, name, []), name).toMatch(/^[0-9a-f]{64}$/);
      expect(inputsDigest(ROOT, name, ["--corpus", "public"]), name).toBe(inputsDigest(ROOT, name, []));
    }
    // an eval that is not in the table has none: it counts by its bytes
    for (const name of ["agent-ab", "terminal-bench", "longmemeval", "skillret", "not-an-eval"]) expect(inputsDigest(ROOT, name, []), name).toBeNull();
    // a custom corpus that is not there has none, and the job counts by the bytes it finds
    expect(inputsDigest(ROOT, "reflect", ["--cases", join(tmp(), "nothing here")])).toBeNull();
  });
});
