// scripts/rescore on reflect, the first eval on the manifest: the runs are built from the golden raw outputs of evals/reflect/golden, scored with the
// eval's own scorer, and written as results folders. A stale run is the same run with rows another scorer gave and the manifest of that scorer.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunManifest, buildManifest, caseDigests, completionOf, lockedParts, manifestProblems, readManifest } from "../../../lib/manifest.ts";
import { endpointId, engineSettings } from "../../../lib/provenance.ts";
import { type Case, type Raw, type Row, assetsSha256, isDefect, reflectConfig } from "../../../evals/reflect/src/lib.ts";
import { MEASUREMENT } from "../../../evals/reflect/src/measurement.ts";
import { RescoreError, readStored, rescoreFolder, rescoreRun, rescoredName } from "./lib.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const GOLDEN = join(ROOT, "evals", "reflect", "golden");
const CASES: Case[] = jsonl(join(GOLDEN, "cases.jsonl"));
const RAW: { case: string; note: string; raw: Raw }[] = jsonl(join(GOLDEN, "raw.jsonl"));
const raw = (id: string, note: string): Raw => (RAW.find((l) => l.case === id && l.note === note) as { raw: Raw }).raw;
const GOOD = (c: Case): Raw => raw(c.id, isDefect(c.class) ? "the model restores what the injection took away" : "the model leaves the note alone");
const BAD = (c: Case): Raw => raw(c.id, isDefect(c.class) ? "the model proposes no change" : "the model rewrites the description and the when_to_use");
const STALE = { version: 1, sha256: "c".repeat(64) };
const CONFIG = reflectConfig("https://gateway.example/deployment-A/v1", "the-model", true);

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "rescore-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Spec {
  name?: string;
  raw?: (c: Case) => Raw;
  manifest?: (m: RunManifest) => RunManifest | undefined;
  rows?: (rows: Row[]) => Record<string, any>[];
  summary?: Record<string, unknown>;
}

/** A results folder of the golden cases as harness-v3 writes it. A `manifest` that returns undefined leaves the summary without one: a legacy run. */
function run(spec: Spec = {}): string {
  const scored = CASES.map((c) => MEASUREMENT.score(c, (spec.raw ?? GOOD)(c)));
  const base = buildManifest({
    measurement: MEASUREMENT,
    parts: lockedParts(MEASUREMENT),
    corpus: "public",
    cases: caseDigests(MEASUREMENT, CASES),
    akm: { version: "0.9.99-test", bin: "akm" },
    config: CONFIG,
    settings: { strategy: "reflect-only" },
    completion: completionOf(MEASUREMENT, CASES.map((c) => c.id), scored),
  });
  const dir = join(tmp(), spec.name ?? "2026-10-12-golden");
  mkdirSync(dir, { recursive: true });
  const summary: Record<string, unknown> = {
    eval: "reflect",
    corpus: "public",
    label: "golden",
    date: "2026-10-12T09:00:00.000Z",
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
    assets_sha256: assetsSha256(join(ROOT, "evals", "reflect", "assets")),
    seed: null,
    status: "complete",
    aborted_reason: null,
    n_cases: 50,
    ...MEASUREMENT.summarize(scored),
    ...spec.summary,
  };
  const manifest = spec.manifest ? spec.manifest(base) : base;
  if (manifest !== undefined) summary.manifest = manifest;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), (spec.rows ? spec.rows(scored) : scored).map((r) => `${JSON.stringify(r)}\n`).join(""));
  return dir;
}
const text = (dir: string): string => readFileSync(join(dir, "summary.json"), "utf8") + readFileSync(join(dir, "samples.jsonl"), "utf8");
const rowsOf = (dir: string): any[] => jsonl(join(dir, "samples.jsonl"));
const summaryOf = (dir: string): any => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

describe("rescoreFolder", () => {
  test("scores a run again into a new folder beside it, with the same rows when the scorer is the same, and leaves the original as it was", () => {
    const dir = run();
    const before = text(dir);
    const { out, result } = rescoreFolder(dir);
    expect(out).toBe(`${dir}-rescored`);
    expect(readdirSync(join(dir, "..")).sort()).toEqual(["2026-10-12-golden", "2026-10-12-golden-rescored"]);
    expect(text(dir)).toBe(before);
    expect(rowsOf(out)).toEqual(rowsOf(dir));
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const s = summaryOf(out);
    const o = summaryOf(dir);
    expect(s).toMatchObject({ label: "golden-rescored", n_run: 10, metrics: o.metrics, served: o.served, n_errored: o.n_errored });
    expect(manifestProblems(s.manifest)).toEqual([]);
    expect(s.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", scorer: o.manifest.scorer, dropped: [] });
    expect(s.manifest.rescored_from.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(readManifest(s).kind).toBe("manifest");
  });

  test("takes the current scorer into the manifest and keeps the collector, the cases' inputs and everything else of the run", () => {
    const dir = run({ raw: BAD, manifest: (m) => ({ ...m, scorer: STALE, collector: { version: 4, sha256: "d".repeat(64) } }) });
    const { out } = rescoreFolder(dir);
    const was = summaryOf(dir).manifest as RunManifest;
    const now = summaryOf(out).manifest as RunManifest;
    expect(now.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
    expect(now.collector).toEqual({ version: 4, sha256: "d".repeat(64) });
    expect(now.rescored_from?.scorer).toEqual(STALE);
    expect(now.cases).toEqual(was.cases);
    expect({ ...now, scorer: null, rescored_from: null }).toEqual({ ...was, scorer: null, rescored_from: null });
    const { manifest: _a, label: _l, ...rest } = summaryOf(dir);
    const { manifest: _b, label: _m, ...rest2 } = summaryOf(out);
    expect(rest2).toEqual(rest);
  });

  test("scores the stored raw outputs with the current scorer: rows another scorer gave are replaced, and the metrics follow", () => {
    const stale = run({ raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map((r) => ({ ...r, correct: true, checks: Object.fromEntries(Object.keys(r.checks ?? {}).map((k) => [k, true])) })) });
    expect(rowsOf(stale).every((r) => r.correct === true)).toBe(true); // an older scorer called every miss right
    const { out, result } = rescoreFolder(stale);
    expect(result.changed.length).toBe(CASES.length); // every row it gave is not the current one
    expect(summaryOf(out).metrics.defects).toEqual({ n: 6, correct: 0, rate: 0 });
    expect(rowsOf(out).every((r, i) => JSON.stringify(r) === JSON.stringify(MEASUREMENT.score(CASES[i] as Case, BAD(CASES[i] as Case))))).toBe(true);
  });

  test("a run that stores its raw output only under the fields the old rows had (a legacy run) is scored again too, and gets a manifest made from its summary", () => {
    const legacy = run({ manifest: () => undefined });
    expect(readManifest(summaryOf(legacy)).kind).toBe("legacy");
    const { out, result } = rescoreFolder(legacy);
    expect(result.legacy).toBe(true);
    expect(rowsOf(out)).toEqual(rowsOf(legacy));
    const m = summaryOf(out).manifest as RunManifest;
    expect(manifestProblems(m)).toEqual([]);
    expect(m).toMatchObject({ eval: "reflect", corpus: "public", harness_version: 0, collector: { version: 0, sha256: "b".repeat(64) }, scorer: lockedParts(MEASUREMENT).scorer, akm: { version: "0.9.99-test", bin: "akm", build: null, build_fingerprint: null }, settings: { strategy: "reflect-only", config_patch_sha256: null, timeout_ms: null, seed: null } });
    expect(m.rescored_from).toMatchObject({ results: "2026-10-12-golden", scorer: null, dropped: [] });
    expect(Object.keys(m.cases)).toEqual(CASES.map((c) => c.id));
    expect(m.completion.selected).toEqual(CASES.map((c) => c.id));
    // the engine of an old summary has the endpoint's path in it, which the rescored one does not
    expect(m.engines.reflect).toMatchObject({ endpoint: "https://gateway.example", endpoint_id: endpointId("https://gateway.example/deployment-A/v1/chat/completions") });
  });

  test("a legacy run is not scored again against cases it did not read, or when its rows lack the searches it recorded", () => {
    expect(() => rescoreFolder(run({ manifest: () => undefined, summary: { assets_sha256: "9".repeat(64) } }))).toThrow(/was made before the manifest, and cannot be scored again: it read other cases than the ones in evals\/reflect\/assets now/);
    expect(() => rescoreFolder(run({ manifest: () => undefined, summary: { retrieval_queries: { cases: 46 } } }))).toThrow("it recorded searches for the notes (--retrieval-queries)");
  });

  test("a legacy run's engine with the path is shown without it", () => {
    const old = { model: "the-model", endpoint: "https://gateway.example/k-DUMMYSECRET0123/v1/chat/completions", temperature: 0, enableThinking: false, timeoutMs: 600000 };
    const dir = run({ manifest: () => undefined, summary: { engine: { engine: "reflect", ...old, engines: { reflect: old } } } });
    const { out } = rescoreFolder(dir);
    expect(readFileSync(join(out, "summary.json"), "utf8")).not.toMatch(/DUMMYSECRET|k-DUMMY/);
    expect(summaryOf(out).engine).toMatchObject({ endpoint: "https://gateway.example", endpoint_id: endpointId(old.endpoint), engines: { reflect: { endpoint: "https://gateway.example" } } });
  });
});

describe("what a rescore refuses", () => {
  test("a run whose rows lack the raw output the scorer reads, naming the fields and the rows", () => {
    const dir = run({ rows: (rows) => rows.map((r) => (r.outcome === "proposal" ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "proposal")) : r)) });
    expect(() => rescoreFolder(dir)).toThrow(/cannot be scored again: its rows lack the raw output the reflect scorer reads: proposal \(6 rows: [a-z0-9-]+, .*\)\. Only a run that stores them can be rescored\./);
    const noOutcome = run({ rows: (rows) => rows.map(({ outcome: _o, seconds: _s, ...r }) => r) });
    expect(() => rescoreFolder(noOutcome)).toThrow("outcome (10 rows:");
    expect(() => rescoreFolder(noOutcome)).toThrow("seconds (10 rows:");
    expect(readdirSync(join(noOutcome, ".."))).toEqual(["2026-10-12-golden"]); // and writes nothing
  });

  test("an eval that declares no measurement, a manifest that is not sound, and a folder that is not a run", () => {
    const other = run({ summary: { eval: "nightly" }, manifest: (m) => ({ ...m, eval: "nightly" }) });
    expect(() => rescoreFolder(other)).toThrow("is a run of nightly, which declares no measurement yet (it has no src/measurement.ts), so there is no scorer to score it with");
    expect(() => rescoreFolder(run({ manifest: (m) => ({ ...m, manifest_version: 9 }) }))).toThrow("has a manifest that is not sound: manifest_version is 9");
    const empty = tmp();
    expect(() => rescoreFolder(empty)).toThrow("is not a results folder: it has no summary.json");
    const running = run();
    writeFileSync(join(running, ".running"), "1\n");
    expect(() => rescoreFolder(running)).toThrow("is still being written");
    const noSamples = run();
    rmSync(join(noSamples, "samples.jsonl"));
    expect(() => readStored(noSamples)).toThrow("has no samples.jsonl");
    expect(() => rescoreFolder(join(noSamples, "summary.json"))).toThrow(RescoreError);
  });
});

describe("the cases of the corpus now", () => {
  test("a case the corpus no longer has is left out and named, in the result and in the manifest", () => {
    const dir = run({ rows: (rows) => [...rows, { ...rows[0], id: "dropped-case-01" }] });
    const { out, result } = rescoreFolder(dir);
    expect(result.dropped).toEqual(["dropped-case-01"]);
    expect(rowsOf(out).map((r) => r.id)).toEqual(CASES.map((c) => c.id));
    expect(summaryOf(out).manifest.rescored_from.dropped).toEqual(["dropped-case-01"]);
    expect(summaryOf(out)).toMatchObject({ n_run: 10 });
  });

  test("a case whose labels changed since the run is named, and its label digest in the new manifest is the current one", () => {
    const dir = run({ manifest: (m) => ({ ...m, cases: { ...m.cases, [(CASES[2] as Case).id]: { ...(m.cases[(CASES[2] as Case).id] as object), label_sha256: "e".repeat(64) } } as RunManifest["cases"] }) });
    const { out, result } = rescoreFolder(dir);
    expect(result.relabelled).toEqual([(CASES[2] as Case).id]);
    expect((summaryOf(out).manifest as RunManifest).cases).toEqual((summaryOf(run()).manifest as RunManifest).cases);
  });

  test("a case that errored stays errored, in the completion too", () => {
    const err: Raw = { outcome: "error", reason: "non_zero_exit: HTTP 503", error: "non_zero_exit: HTTP 503", seconds: 2 };
    const dir = run({ raw: (c) => (c.id === (CASES[1] as Case).id ? err : GOOD(c)) });
    const { out } = rescoreFolder(dir);
    expect(summaryOf(out)).toMatchObject({ n_run: 10, n_scored: 9, n_errored: 1 });
    expect((summaryOf(out).manifest as RunManifest).completion.errored).toEqual([(CASES[1] as Case).id]);
  });
});

describe("the name of the new folder", () => {
  test("goes before the -rN of a repeat and its collection, else at the end, and is numbered when the folder is there", () => {
    expect(rescoredName("2026-10-12-base")).toBe("2026-10-12-base-rescored");
    expect(rescoredName("2026-10-12-base-r2")).toBe("2026-10-12-base-rescored-r2");
    expect(rescoredName("2026-10-12-base-r1-library")).toBe("2026-10-12-base-rescored-r1-library");
    expect(rescoredName("2026-10-12-pr1071-r2d2")).toBe("2026-10-12-pr1071-r2d2-rescored");
    const dir = run();
    expect(rescoreFolder(dir).out).toBe(`${dir}-rescored`);
    expect(rescoreFolder(dir).out).toBe(`${dir}-rescored-2`);
    expect(rowsOf(`${dir}-rescored-2`)).toEqual(rowsOf(dir));
  });
});

describe("rescoreRun", () => {
  test("works on a run in memory and does not write anything", () => {
    const dir = run({ raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }) });
    const stored = readStored(dir);
    const result = rescoreRun(stored, { now: new Date("2026-10-13T00:00:00.000Z") });
    expect(result.summary.manifest.rescored_from.at).toBe("2026-10-13T00:00:00.000Z");
    expect(readdirSync(join(dir, ".."))).toEqual(["2026-10-12-golden"]);
  });
});

describe("the command", () => {
  const cmd = (...args: string[]) => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  test("rescores each folder, says what changed, and exits 2 when one is refused", () => {
    const stale = run({ name: "2026-10-12-stale", raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map((r) => ({ ...r, correct: true })) });
    const done = cmd(stale);
    expect(done.code).toBe(0);
    expect(done.out).toContain(`rescore: ${stale} -> ${stale}-rescored`);
    expect(done.out).toContain("10 cases scored again (manifest); 10 rows differ from the stored ones");
    const refused = cmd(stale, join(tmp(), "nothing"));
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("is not a results folder");
    expect(refused.out).toContain("-rescored-2"); // the first was still done
    expect(cmd().code).toBe(2);
    expect(cmd("--help").out).toContain("Usage: scripts/rescore/run RESULTS_DIR...");
  });
});
