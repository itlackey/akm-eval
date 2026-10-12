// scripts/rescore on distill: a run is built from the golden raw outputs (one for each case), scored with the eval's own scorer and written as a
// results folder, and then scored again. A run that an older scorer scored is the same run with the rows that scorer gave and its manifest.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunManifest, buildManifest, caseDigests, completionOf, lockedParts, manifestProblems, nextVersion, readManifest } from "../../../lib/manifest.ts";
import { engineSettings } from "../../../lib/provenance.ts";
import { RescoreError, readStored, rescoreFolder, rescoreRun } from "../../../scripts/rescore/src/lib.ts";
import { assetsSha256, distillConfig, loadCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import type { LoadedCase, Raw, Row } from "./score.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const PUBLIC = join(ROOT, "evals", "distill", "assets");
const GOLDEN = join(ROOT, "evals", "distill", "golden");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const GOLDEN_RAW: { case: string; note: string; raw: Record<string, unknown> }[] = jsonl(join(GOLDEN, "raw.jsonl"));
const CASES: LoadedCase[] = loadCases(PUBLIC).filter((c) => GOLDEN_RAW.some((l) => l.case === c.id));
/** The scorer that scored a run before a fix: another version than the lock's, and another digest. */
const STALE = { version: nextVersion(lockedParts(MEASUREMENT).scorer.version), sha256: "c".repeat(64) };
const OTHER_COLLECTOR = { version: nextVersion(lockedParts(MEASUREMENT).collector.version), sha256: "d".repeat(64) };
const CONFIG = distillConfig("https://gateway.example/deployment-A/v1", "the-model", true);

/** The raw output the golden file holds for a case under this note, as the collector hands it to the scorer. */
export function rawFor(id: string, note: string): Raw {
  const line = GOLDEN_RAW.find((l) => l.case === id && l.note === note);
  if (!line) throw new Error(`the golden file has no ${JSON.stringify(note)} for ${id}`);
  const read = MEASUREMENT.rawOf({ id, ...line.raw });
  if ("missing" in read) throw new Error(read.missing.join());
  return read.raw;
}
/** The first raw output of each case. */
const FIRST = (c: LoadedCase): Raw => rawFor(c.id, (GOLDEN_RAW.find((l) => l.case === c.id) as { note: string }).note);

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "distill-rescore-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Spec {
  name?: string;
  raw?: (c: LoadedCase) => Raw;
  manifest?: (m: RunManifest) => RunManifest | undefined;
  rows?: (rows: Row[]) => Record<string, any>[];
  summary?: Record<string, unknown>;
}

/** A results folder of the golden cases as harness-v3 writes it. A `manifest` that returns undefined leaves the summary without one: a legacy run. */
export function run(spec: Spec = {}): string {
  const scored = CASES.map((c) => MEASUREMENT.score(c, (spec.raw ?? FIRST)(c)));
  const base = buildManifest({
    measurement: MEASUREMENT,
    parts: lockedParts(MEASUREMENT),
    corpus: "public",
    cases: caseDigests(MEASUREMENT, CASES),
    akm: { version: "0.9.99-test", bin: "akm" },
    config: CONFIG,
    settings: { strategy: "distill-only", timeout_ms: 900_000 },
    completion: completionOf(MEASUREMENT, CASES.map((c) => c.id), scored),
  });
  const dir = join(tmp(), spec.name ?? "2026-10-12-golden");
  mkdirSync(dir, { recursive: true });
  const summary: Record<string, unknown> = {
    eval: "distill",
    corpus: "public",
    corpus_kind: "public",
    corpus_private: false,
    corpus_folder: null,
    label: "golden",
    date: "2026-10-12T09:00:00.000Z",
    harness_sha256: "b".repeat(64),
    model: "the-model",
    akm_version: "0.9.99-test",
    akm_bin: "akm",
    akm_build: null,
    akm_build_fingerprint: null,
    limit: null,
    strategy: "distill-only",
    config_patch: null,
    config: JSON.parse(JSON.stringify(CONFIG)),
    engine: engineSettings(CONFIG),
    assets_sha256: assetsSha256(PUBLIC),
    seed: null,
    status: "complete",
    aborted_reason: null,
    n_cases: 38,
    ...MEASUREMENT.summarize(scored),
    ...spec.summary,
  };
  const manifest = spec.manifest ? spec.manifest(base) : base;
  if (manifest !== undefined) summary.manifest = manifest;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), (spec.rows ? spec.rows(scored) : scored).map((r) => `${JSON.stringify(r)}\n`).join(""));
  return dir;
}
const rowsOf = (dir: string): any[] => jsonl(join(dir, "samples.jsonl"));
const summaryOf = (dir: string): any => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

describe("rescoring a distill run", () => {
  test("scores a run again into a new folder beside it, with the same rows when the scorer is the same", () => {
    const dir = run();
    const { out, result } = rescoreFolder(dir);
    expect(out).toBe(`${dir}-rescored`);
    expect(readdirSync(join(dir, ".."))).toEqual(["2026-10-12-golden", "2026-10-12-golden-rescored"]);
    expect(rowsOf(out)).toEqual(rowsOf(dir));
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const s = summaryOf(out);
    const o = summaryOf(dir);
    expect(s).toMatchObject({ label: "golden-rescored", n_run: CASES.length, metrics: o.metrics, served_models: o.served_models, n_errored: o.n_errored, corpus: "public" });
    expect(manifestProblems(s.manifest)).toEqual([]);
    expect(s.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", scorer: o.manifest.scorer, dropped: [] });
    expect(readManifest(s).kind).toBe("manifest");
  });

  test("takes the current scorer into the manifest and keeps the collector, the cases' inputs and the rest of the run", () => {
    const dir = run({ manifest: (m) => ({ ...m, scorer: STALE, collector: OTHER_COLLECTOR }) });
    const { out } = rescoreFolder(dir);
    const was = summaryOf(dir).manifest as RunManifest;
    const now = summaryOf(out).manifest as RunManifest;
    expect(now.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
    expect(now.collector).toEqual(OTHER_COLLECTOR);
    expect(now.rescored_from?.scorer).toEqual(STALE);
    expect(now.cases).toEqual(was.cases);
    expect({ ...now, scorer: null, rescored_from: null }).toEqual({ ...was, scorer: null, rescored_from: null });
  });

  test("a case that errored stays errored, with its timeout, and an empty answer from akm is scored as it was", () => {
    const timeout = rawFor("lesson-01", "akm ran past its time limit");
    const empty = rawFor("lesson-01", "akm printed no distill action");
    const dir = run({ raw: (c) => (c.id === "lesson-01" ? timeout : c.id === "lesson-02" ? empty : FIRST(c)) });
    const { out } = rescoreFolder(dir);
    expect(rowsOf(out).find((r) => r.id === "lesson-01")).toMatchObject({ verdict: "error", timed_out: true, error: "akm exited 137: akm timed out after 900s" });
    expect(rowsOf(out).find((r) => r.id === "lesson-02")).toMatchObject({ verdict: "error", outcome: "error", detail: "akm did not run distill on the memory" });
    expect(summaryOf(out)).toMatchObject({ n_run: CASES.length, n_scored: CASES.length - 2, n_errored: 2, timeouts: 1 });
    expect((summaryOf(out).manifest as RunManifest).completion.errored).toEqual(["lesson-01", "lesson-02"]);
  });

  test("a run from before the manifest, whose rows hold no raw output, is refused and the rows' missing fields are named", () => {
    const rows = (all: Row[]) => all.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "improve" && k !== "proposals")));
    const legacy = run({ manifest: () => undefined, rows });
    expect(readManifest(summaryOf(legacy)).kind).toBe("legacy");
    expect(() => rescoreFolder(legacy)).toThrow(/cannot be scored again: its rows lack the raw output the distill scorer reads: improve \(\d+ rows?: [a-z0-9-]+.*\); proposals \(\d+ rows?:/);
    expect(readdirSync(join(legacy, ".."))).toEqual(["2026-10-12-golden"]); // and writes nothing
  });

  test("a folder that is not a run, and a run on a custom corpus whose folder was not recorded, are refused with what to do", () => {
    expect(() => rescoreFolder(tmp())).toThrow(RescoreError);
    const custom = run({ summary: { corpus: "custom", corpus_kind: "own", corpus_folder: null }, manifest: (m) => ({ ...m, corpus: "custom" }) });
    expect(() => rescoreFolder(custom)).toThrow(/custom corpus outside the repository.*--cases DIR/);
  });
});

/** A row as the scorer before #55 stored it: with no share of the memory repeated, and no check of it on an update. */
const asBefore55 = (row: Row): Record<string, any> => {
  const { copied: _copied, ...rest } = row as Record<string, any>;
  if (rest.checks) rest.checks = Object.fromEntries(Object.entries(rest.checks).filter(([k]) => k !== "not_copied"));
  return rest;
};

describe("the memory pasted back (#55)", () => {
  test("the scorer before #55 called it a good lesson and a right update; scripts/rescore scores the stored raw output bad", () => {
    const dir = run({
      raw: (c) => (c.id === "lesson-01" ? rawFor(c.id, "the memory pasted back as the lesson") : c.id === "upd-01" ? rawFor(c.id, "the existing lesson with the memory appended") : FIRST(c)),
      manifest: (m) => ({ ...m, scorer: STALE }),
      rows: (rows) => rows.map((r) => ({ ...asBefore55(r), ...(r.id === "lesson-01" ? { verdict: "good" } : r.id === "upd-01" ? { verdict: "right" } : {}) })),
    });
    const stored = rowsOf(dir);
    expect(stored.find((r) => r.id === "lesson-01")).toMatchObject({ verdict: "good", missing: [], forbidden: [], contradicted: [] });
    expect(stored.find((r) => r.id === "upd-01")).toMatchObject({ verdict: "right" });

    const done = Bun.spawnSync(["bun", join(ROOT, "scripts", "rescore", "src", "run.ts"), dir], { stdout: "pipe", stderr: "pipe" });
    expect(done.exitCode).toBe(0);
    const again = rowsOf(`${dir}-rescored`);
    expect(again.find((r) => r.id === "lesson-01")).toMatchObject({ verdict: "bad", copied: 1, missing: [], forbidden: [], contradicted: [] });
    expect(again.find((r) => r.id === "upd-01")).toMatchObject({ verdict: "bad", copied: 1, checks: { update_proposed: true, existing_kept: true, new_facts: true, no_extra_claims: true, not_copied: false, no_new_lesson: true } });
    // no other verdict moved
    const others = (rows: any[]) => rows.filter((r) => !["lesson-01", "upd-01"].includes(r.id)).map((r) => [r.id, r.verdict]);
    expect(others(again)).toEqual(others(stored));
    // and the summary follows the rows
    const metrics = (rows: any[]) => MEASUREMENT.summarize(rows).metrics;
    expect(summaryOf(`${dir}-rescored`).metrics).toEqual(metrics(again));
    expect(metrics(again).good_lessons.good).toBe(metrics(stored).good_lessons.good - 1);
    expect(metrics(again).lesson_updates.right).toBe(metrics(stored).lesson_updates.right - 1);
    expect(summaryOf(`${dir}-rescored`).manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
  });
});

describe("a hedge elsewhere in the sentence (#56)", () => {
  const NOTES = [
    "the lesson makes the claim and says the fix could save a rebuild",
    "the lesson makes the claim and puts a condition after it",
    "the lesson makes the claim after a permission that is not a doubt about it",
  ];

  test.each(NOTES)("the scorer before #56 called it good: %s. scripts/rescore scores the stored raw output bad, and no other row moves", (note) => {
    const dir = run({
      raw: (c) => (c.id === "claim-01" ? rawFor(c.id, note) : FIRST(c)),
      manifest: (m) => ({ ...m, scorer: STALE }),
      rows: (rows) => rows.map((r) => (r.id === "claim-01" ? { ...r, verdict: "good", forbidden: [] } : r)), // the row the scorer before #56 stored: the hedge word excused the claim
    });
    const stored = rowsOf(dir);
    expect(stored.find((r) => r.id === "claim-01")).toMatchObject({ verdict: "good", forbidden: [], missing: [], contradicted: [] });

    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual(["claim-01"]);
    const again = rowsOf(out);
    expect(again.find((r) => r.id === "claim-01")).toMatchObject({ verdict: "bad", forbidden: ["works * all * layout"], missing: [], contradicted: [] });
    expect(again.filter((r) => r.id !== "claim-01")).toEqual(stored.filter((r) => r.id !== "claim-01"));
    const metrics = (rows: any[]) => MEASUREMENT.summarize(rows).metrics;
    expect(summaryOf(out).metrics).toEqual(metrics(again));
    expect(metrics(again).good_lessons.good).toBe(metrics(stored).good_lessons.good - 1);
    expect(metrics(again).bad_by.forbidden_claim).toBe(metrics(stored).bad_by.forbidden_claim + 1);
  });

  test("a hedge that governs the claim stays good when the run is scored again", () => {
    const dir = run({ raw: (c) => (c.id === "claim-01" ? rawFor(c.id, "the lesson says it may be that the fix works on all layouts") : FIRST(c)) });
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual([]);
    expect(rowsOf(out).find((r) => r.id === "claim-01")).toMatchObject({ verdict: "good", forbidden: [] });
  });
});

describe("a run on a custom corpus (#47)", () => {
  const OWN = join("private", "distill", "own", "assets");
  const OUTSIDE_FACT = "a fact that no lesson states";

  /** A copy of the code and the public cases, with the custom corpus `private/distill/own/assets` in it: the public cases, but lesson-01 must also state a fact that its lesson does not. */
  function checkout(): string {
    const tree = tmp();
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(ROOT, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(ROOT, "evals", "distill", "src"), join(tree, "evals", "distill", "src"), { recursive: true, filter: keep });
    cpSync(PUBLIC, join(tree, "evals", "distill", "assets"), { recursive: true });
    cpSync(join(ROOT, "MEASUREMENT.lock"), join(tree, "MEASUREMENT.lock"));
    cpSync(PUBLIC, join(tree, OWN), { recursive: true });
    const file = join(tree, OWN, "cases.json");
    const cases = JSON.parse(readFileSync(file, "utf8"));
    cases.find((c: { id: string }) => c.id === "lesson-01").required.push([OUTSIDE_FACT]);
    writeFileSync(file, JSON.stringify(cases));
    return tree;
  }
  /** A stored run on the custom corpus, with the folder the summary records. */
  const stored = (folder: string | null) =>
    readStored(run({ summary: { corpus: "custom", corpus_kind: "own", corpus_private: true, corpus_folder: folder }, manifest: (m) => ({ ...m, corpus: "custom" }) }));
  const verdict = (rows: Record<string, any>[], id: string) => rows.find((r) => r.id === id)?.verdict;

  test("is scored against the cases in the corpus_folder the summary records, from the repository root", () => {
    const tree = checkout();
    const result = rescoreRun(stored(OWN.split("\\").join("/")), { root: tree });
    expect(verdict(result.rows, "lesson-01")).toBe("bad"); // the custom cases want a fact it does not state; the public ones do not
    expect(result.rows.find((r) => r.id === "lesson-01")?.missing).toEqual([OUTSIDE_FACT]);
    expect(result.relabelled).toEqual(["lesson-01"]);
    expect(result.summary.corpus_folder).toBe("private/distill/own/assets");
    expect(result.summary.corpus).toBe("custom");
    expect(verdict(rescoreRun(readStored(run()), { root: tree }).rows, "lesson-01")).toBe("good"); // the public run is read from the public cases
  });

  test("a folder outside the repository is not recorded, and --cases names it, absolute or from the repository root", () => {
    const tree = checkout();
    const outside = tmp();
    cpSync(join(tree, OWN), join(outside, "my notes"), { recursive: true });
    expect(() => rescoreRun(stored(null), { root: tree })).toThrow(/was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts\/rescore with --cases DIR/);
    const absolute = rescoreRun(stored(null), { root: tree, cases: join(outside, "my notes") });
    expect(verdict(absolute.rows, "lesson-01")).toBe("bad");
    expect(absolute.summary.corpus_folder).toBeNull(); // outside the repository: not recorded
    expect(JSON.stringify(absolute.summary)).not.toContain(outside);
    const inside = rescoreRun(stored(null), { root: tree, cases: OWN });
    expect(verdict(inside.rows, "lesson-01")).toBe("bad");
    expect(inside.summary.corpus_folder).toBe("private/distill/own/assets");
  });

  test("a run from before custom corpora, on private, own or own-feedback, is read from the folder those names had, or from --cases", () => {
    const tree = checkout();
    const old = (corpus: string) => readStored(run({ summary: { corpus, corpus_folder: undefined }, manifest: (m) => ({ ...m, corpus }) }));
    expect(verdict(rescoreRun(old("own"), { root: tree }).rows, "lesson-01")).toBe("bad"); // private/distill/own/assets
    expect(() => rescoreRun(old("private"), { root: tree })).toThrow("cannot be read"); // private/distill/assets is not in the copy
    expect(verdict(rescoreRun(old("private"), { root: tree, cases: OWN }).rows, "lesson-01")).toBe("bad");
  });
});

describe("a negation over a verb the shared rule does not list (#45)", () => {
  // Each is a stored raw output that the scorer before #45 scored by word order and called good (or, for the last, bad) without a word of doubt: the negation
  // excused the phrase, or denied the action, and the row had no `ambiguous`. The scorer now keeps the verdict and names the phrase.
  const SAMPLES: [id: string, note: string, phrase: string][] = [
    ["lesson-01", "the lesson holds the advice behind do not think we should", "=wait for networkidle"],
    ["lesson-01", "the lesson holds the reversal behind did not ignore", "=wait for networkidle"],
    ["lesson-01", "the lesson holds the reversal behind a verdict after it", "=wait for networkidle"],
    ["lesson-01", "the lesson states the action only behind do not think we should", "+wait * heading"],
    ["lesson-01", "the lesson leaves the action behind a verdict after it", "+wait * heading"],
    ["claim-01", "the lesson holds the claim behind did not dispute", "works * all * layout"],
  ];

  /** A run as the scorer before #45 stored it: rows with no `ambiguous`, and a summary whose counts have none either. */
  function storedBefore(id: string, note: string): string {
    const raw = (c: LoadedCase): Raw => (c.id === id ? rawFor(id, note) : FIRST(c));
    const metrics = MEASUREMENT.summarize(CASES_SCORED(raw)).metrics;
    delete (metrics.good_lessons as { ambiguous?: number }).ambiguous;
    delete (metrics.lesson_updates as { ambiguous?: number }).ambiguous;
    return run({ raw, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map(({ ambiguous: _ambiguous, ...rest }) => rest), summary: { metrics } });
  }
  const CASES_SCORED = (raw: (c: LoadedCase) => Raw): Row[] => CASES.map((c) => MEASUREMENT.score(c, raw(c)));

  test.each(SAMPLES)("%s, %s: scripts/rescore keeps the verdict and names the phrase", (id, note, phrase) => {
    const dir = storedBefore(id, note);
    const stored = rowsOf(dir);
    expect(stored.find((r) => r.id === id)).not.toHaveProperty("ambiguous");
    expect(summaryOf(dir).metrics.good_lessons).not.toHaveProperty("ambiguous");

    const { out, result } = rescoreFolder(dir);
    const again = rowsOf(out);
    expect(result.changed).toHaveLength(stored.length); // every row gains the list
    expect(again.find((r) => r.id === id)?.ambiguous).toEqual([phrase]);
    expect(again.filter((r) => r.id !== id).every((r) => Array.isArray(r.ambiguous) && r.ambiguous.length === 0)).toBe(true);
    // and nothing else about a row moved: not the verdict, the facts it misses, the claims it makes, the reversals it asserts
    const without = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "ambiguous"));
    expect(again.map(without)).toEqual(stored.map(without));
    const after = summaryOf(out).metrics;
    const before = summaryOf(dir).metrics;
    expect(after.good_lessons).toEqual({ ...before.good_lessons, ambiguous: 1 });
    expect(after.lesson_updates).toEqual({ ...before.lesson_updates, ambiguous: 0 });
    expect({ ...after, good_lessons: null, lesson_updates: null }).toEqual({ ...before, good_lessons: null, lesson_updates: null });
    expect(summaryOf(out).manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
    expect(summaryOf(out).manifest.rescored_from.scorer).toEqual(STALE);
  });

  test("the command does the same, and the verdict that the scorer before #45 gave a lesson that turns the advice round is still good: only the phrase is named", () => {
    const dir = storedBefore("lesson-01", "the lesson holds the reversal behind did not ignore");
    const done = Bun.spawnSync(["bun", join(ROOT, "scripts", "rescore", "src", "run.ts"), dir], { stdout: "pipe", stderr: "pipe" });
    expect(done.exitCode).toBe(0);
    expect(done.stdout.toString()).toContain(`${rowsOf(dir).length} cases scored again`);
    expect(rowsOf(`${dir}-rescored`).find((r) => r.id === "lesson-01")).toMatchObject({ verdict: "good", contradicted: [], ambiguous: ["=wait for networkidle"] });
  });
});
