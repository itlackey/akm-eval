// A stored run of reflect scored again by scripts/rescore: a run of a custom corpus finds its cases again, and a run stored before a fix to the
// scorer takes the verdict of the scorer here (one test for each fix, with the rows as the scorer wrote them before it).

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PartRef, buildManifest, caseDigests, completionOf } from "../../../lib/manifest.ts";
import { engineSettings } from "../../../lib/provenance.ts";
import { RescoreError, readStored, rescoreFolder, rescoreRun } from "../../../scripts/rescore/src/lib.ts";
import { type Case, type Raw, type Row, assetsSha256, reflectConfig } from "./lib.ts";
import { MEASUREMENT, casesFolder } from "./measurement.ts";

const EVAL = join(import.meta.dir, "..");
const REPO = join(EVAL, "..", "..");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const CASES: Case[] = jsonl(join(EVAL, "fixtures", "cases.jsonl"));
const RAW: { case: string; note: string; raw: Raw }[] = jsonl(join(EVAL, "fixtures", "raw.jsonl"));
const raw = (id: string, note: string): Raw => (RAW.find((l) => l.case === id && l.note === note) as { raw: Raw }).raw;
/** The scorer of a run made before a fix: another digest than the one here. */
const STALE = { version: "0.1", sha256: "c".repeat(64) };
const CONFIG = reflectConfig("https://gateway.example/deployment-A/v1", "the-model", true);

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "reflect rescore-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A results folder of `rows` for `cases`, as a run writes it: a summary with its manifest, and the rows. `summary` adds to or replaces what the summary holds, and `scorer` is the scorer the manifest says scored it. */
function storedRun(parent: string, name: string, cases: Case[], rows: Record<string, any>[], summary: Record<string, unknown> = {}, scorer?: PartRef): string {
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: String(summary.corpus ?? "public"),
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: "0.9.99-test", bin: "akm" },
    config: CONFIG,
    settings: { strategy: "reflect-only" },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows as Row[]),
  });
  if (scorer) manifest.scorer = scorer; // a run from before the version was set by hand
  writeFileSync(
    join(dir, "summary.json"),
    `${JSON.stringify({ eval: "reflect", corpus: "public", label: "stored", date: "2026-10-12T09:00:00.000Z", harness_sha256: "b".repeat(64), model: "the-model", akm_version: "0.9.99-test", akm_bin: "akm", akm_build: null, akm_build_fingerprint: null, limit: null, strategy: "reflect-only", config_patch: null, config: JSON.parse(JSON.stringify(CONFIG)), engine: engineSettings(CONFIG), assets_sha256: assetsSha256(join(EVAL, "assets")), seed: null, status: "complete", aborted_reason: null, n_cases: cases.length, ...MEASUREMENT.summarize(rows as Row[]), manifest, ...summary }, null, 2)}\n`,
  );
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return dir;
}

/** The raw outputs in fixtures/ of the ten golden cases, each case's right answer (a defect restored, a control left alone), scored by the scorer here. */
const rightRows = (): Row[] => CASES.map((c) => MEASUREMENT.score(c, raw(c.id, c.fix ? "the model restores what the injection took away" : "the model leaves the note alone")));

describe("the folder of the cases of a run", () => {
  const root = join(tmpdir(), "reflect root");
  test("is the eval's assets for the public corpus, the recorded folder for a custom one, and says so when there is none", () => {
    expect(casesFolder(root, { corpus: "public" })).toBe(join(root, "evals", "reflect", "assets"));
    expect(casesFolder(root, { corpus: "custom", corpus_folder: "private/reflect/assets" })).toBe(join(root, "private", "reflect", "assets"));
    expect(casesFolder(root, { corpus: "custom", corpus_folder: "private/reflect/own notes" })).toBe(join(root, "private", "reflect", "own notes"));
    expect(casesFolder(root, { corpus: "custom", corpus_folder: join(tmpdir(), "elsewhere") })).toBe(join(tmpdir(), "elsewhere")); // what --cases DIR gives
    for (const summary of [{ corpus: "custom", corpus_folder: null }, { corpus: "custom" }]) {
      expect(() => casesFolder(root, summary), JSON.stringify(summary)).toThrow("its summary does not record (outside this repository, a folder is left out). scripts/rescore takes that folder with --cases DIR");
    }
  });

  test("is the kind's folder for a run from before the corpora were renamed, which called the seeded rewrite private, and refuses a name reflect never had", () => {
    expect(casesFolder(root, { corpus: "private" })).toBe(join(root, "private", "reflect", "assets"));
    for (const corpus of ["own", "own-feedback", "constructor", undefined]) expect(() => casesFolder(root, { corpus }), String(corpus)).toThrow("which is neither public nor custom");
  });

  test("a run from before the manifest is told apart by the cases it read, where they are", () => {
    const tree = tmp();
    mkdirSync(join(tree, "evals", "reflect"), { recursive: true });
    cpSync(join(EVAL, "assets"), join(tree, "evals", "reflect", "assets"), { recursive: true });
    const digest = assetsSha256(join(tree, "evals", "reflect", "assets"));
    expect(MEASUREMENT.legacyProblem?.(tree, { corpus: "public", assets_sha256: digest })).toBeUndefined();
    expect(MEASUREMENT.legacyProblem?.(tree, { corpus: "public", assets_sha256: "0".repeat(64) })).toContain("it read other cases than the ones in evals/reflect/assets now");
    expect(MEASUREMENT.legacyProblem?.(tree, { corpus: "private", assets_sha256: digest })).toContain("it read other cases than the ones in private/reflect/assets now"); // none there
    expect(MEASUREMENT.legacyProblem?.(tree, { corpus: "custom", corpus_folder: null })).toContain("that its summary does not record");
  });
});

describe("scripts/rescore on a custom corpus", () => {
  /** The code of the eval in a temp checkout, with the golden cases as the custom corpus at `folder` (from its root), so nothing is written in the repository. */
  function checkout(folder: string): string {
    const tree = tmp();
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(REPO, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "src"), join(tree, "evals", "reflect", "src"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "assets"), join(tree, "evals", "reflect", "assets"), { recursive: true });
    mkdirSync(join(tree, folder), { recursive: true });
    cpSync(join(EVAL, "fixtures", "cases.jsonl"), join(tree, folder, "cases.jsonl"));
    return tree;
  }
  const custom = (over: Record<string, unknown>) => ({ corpus: "custom", ...over });

  test("reads the cases from the folder the summary records, from the repository root", () => {
    const tree = checkout("private/reflect/own notes");
    const dir = storedRun(tmp(), "2026-10-12-mine", CASES, rightRows(), custom({ corpus_folder: "private/reflect/own notes" }));
    const { result } = rescoreFolder(dir, { root: tree });
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    expect(result.rows).toHaveLength(CASES.length);
    expect(result.summary.manifest.corpus).toBe("custom");
    expect(result.summary).toMatchObject({ corpus: "custom", corpus_folder: "private/reflect/own notes" });
  });

  test("refuses a run whose folder was outside the repository and says to name it with --cases, then reads the cases from the folder --cases names", () => {
    const tree = checkout("somewhere/else");
    const dir = storedRun(tmp(), "2026-10-12-mine", CASES, rightRows(), custom({ corpus_folder: null }));
    const stored = readStored(dir);
    expect(() => rescoreRun(stored, { root: tree })).toThrow(RescoreError);
    expect(() => rescoreRun(stored, { root: tree })).toThrow("outside the repository, so the folder of its cases is not known here. Give it to scripts/rescore with --cases DIR");
    // --cases DIR, from the repository root or absolute
    expect(rescoreRun(stored, { root: tree, cases: "somewhere/else" })).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    const absolute = rescoreRun(stored, { root: tree, cases: join(tree, "somewhere", "else") });
    expect(absolute.changed).toEqual([]);
    expect(absolute.summary.corpus_folder).toBe("somewhere/else"); // inside the checkout it was given from
  });

  test("scripts/rescore --cases DIR names a folder outside the repository, and the rescored summary does not record it", () => {
    const notes = tmp();
    cpSync(join(EVAL, "fixtures", "cases.jsonl"), join(notes, "cases.jsonl"));
    const dir = storedRun(tmp(), "2026-10-12-mine", CASES, rightRows(), custom({ corpus_folder: null }));
    const refused = Bun.spawnSync(["bun", join(REPO, "scripts", "rescore", "src", "run.ts"), dir], { stdout: "pipe", stderr: "pipe" });
    expect(refused.exitCode).toBe(2);
    expect(refused.stderr.toString()).toContain("Give it to scripts/rescore with --cases DIR");
    const { rows, summary } = rescoreWithCommand(dir, ["--cases", notes]);
    expect(rows).toHaveLength(CASES.length);
    expect(summary.corpus_folder).toBeNull();
    expect(JSON.stringify(summary)).not.toContain(notes);
  });
});

/** scripts/rescore on a results folder, run as the command: the folder it writes beside it, read back. */
function rescoreWithCommand(dir: string, flags: string[] = []) {
  const p = Bun.spawnSync(["bun", join(REPO, "scripts", "rescore", "src", "run.ts"), ...flags, dir], { stdout: "pipe", stderr: "pipe" });
  expect(p.stderr.toString()).toBe("");
  expect(p.exitCode).toBe(0);
  const out = `${dir}-rescored`;
  return { rows: jsonl(join(out, "samples.jsonl")), summary: JSON.parse(readFileSync(join(out, "summary.json"), "utf8")), stdout: p.stdout.toString() };
}

/** The golden run with the rows of `before` (as the scorer wrote them before a fix) in place of the right answers of their cases. */
const runBefore = (parent: string, before: Record<string, any>[]): string => {
  const ids = new Set(before.map((r) => r.id));
  return storedRun(parent, "2026-10-12-before", CASES, [...rightRows().filter((r) => !ids.has(r.id)), ...before], {}, STALE);
};

describe("a run stored before the fix of #57", () => {
  // The golden refusal of a control by the quality judge, as the scorer wrote it then: a refused edit was always wrong.
  const BEFORE = { id: "retrieval-miss-04", class: "retrieval-miss", outcome: "refused", reason: 'quality_rejected: Reflect proposal quality gate rejected: score=2.5, reason="the new when_to_use claims a use the note does not support"', served: "qwen3-27b", seconds: 61.2, correct: false, checks: { body_kept: true, no_extra_change: true, no_invented: true }, changed: [], values: {} };

  test("scores the refused control right when it is scored again, through scripts/rescore, and leaves the folder it read as it was", () => {
    const dir = runBefore(tmp(), [BEFORE]);
    const stored = readFileSync(join(dir, "samples.jsonl"), "utf8");
    expect(MEASUREMENT.summarize(jsonl(join(dir, "samples.jsonl"))).metrics.controls).toEqual({ n: 4, correct: 3, rate: 0.75 }); // the gate cost a control
    const { rows, summary, stdout } = rescoreWithCommand(dir);
    expect(rows.find((r) => r.id === "retrieval-miss-04")).toEqual({ ...BEFORE, correct: true });
    expect(rows.filter((r) => r.correct === false)).toEqual([]);
    expect(summary.metrics.controls).toEqual({ n: 4, correct: 4, rate: 1 });
    expect(summary.metrics.refused).toMatchObject({ judge: 1 });
    expect(stdout).toContain("1 rows differ from the stored ones: retrieval-miss-04");
    expect(summary.manifest.rescored_from.scorer).toEqual(STALE);
    expect(readFileSync(join(dir, "samples.jsonl"), "utf8")).toBe(stored);
  });
});

describe("a run stored before the fix of #58", () => {
  // Two golden refusals by the retrieval check that could not grade, as the scorer wrote them then: a refusal by the retrieval gate, and wrong.
  const checks = { body_kept: true, no_extra_change: true, no_invented: true, defect_fixed: false };
  const TIMEOUT = { id: "description-quote-02", class: "description-quote", outcome: "refused", reason: "quality_rejected: Reflect proposal refused: retrieval check could not grade the old content (timeout)", served: "qwen3-27b", seconds: 128.4, correct: false, checks, changed: [], values: {} };
  const FAILED = { id: "title-missing-04", class: "title-missing", outcome: "refused", reason: "quality_rejected: Reflect proposal refused: retrieval check could not grade the new content (error)", served: "qwen3-27b", seconds: 33, correct: false, checks, changed: [], values: {} };

  test("are errors when scored again, through scripts/rescore: not refusals, not scored, and the timeout is counted", () => {
    const dir = runBefore(tmp(), [TIMEOUT, FAILED]);
    const before = readStored(dir).summary;
    expect(before).toMatchObject({ n_errored: 0, timeouts: 0, metrics: { refused: { retrieval: 2 }, defects: { n: 6, correct: 4, rate: 0.6667 } } }); // a slow endpoint read as a strict retrieval gate
    const { rows, summary } = rescoreWithCommand(dir);
    expect(rows.find((r) => r.id === TIMEOUT.id)).toEqual({ id: TIMEOUT.id, class: TIMEOUT.class, outcome: "error", reason: TIMEOUT.reason, seconds: 128.4, correct: null, checks: null, changed: [], values: {}, error: TIMEOUT.reason, timed_out: true });
    expect(rows.find((r) => r.id === FAILED.id)).toMatchObject({ outcome: "error", correct: null, checks: null, error: FAILED.reason });
    expect(rows.find((r) => r.id === FAILED.id)).not.toHaveProperty("timed_out");
    expect(summary).toMatchObject({ n_run: 10, n_scored: 8, n_errored: 2, timeouts: 1, metrics: { refused: { filter: 0, judge: 0, retrieval: 0, other: 0 }, defects: { n: 4, correct: 4, rate: 1 } } });
    expect(summary.manifest.completion).toMatchObject({ errored: [TIMEOUT.id, FAILED.id].sort() });
    expect(summary.manifest.completion.scored).not.toContain(TIMEOUT.id);
  });

  test("a second rescore of the rescored folder gives the same rows", () => {
    const first = rescoreWithCommand(runBefore(tmp(), [TIMEOUT, FAILED]));
    const parent = tmp();
    const dir = storedRun(parent, "2026-10-12-again", CASES, first.rows, {}, STALE);
    expect(rescoreWithCommand(dir).rows).toEqual(first.rows);
  });
});

describe("a run stored before the fix of #59", () => {
  // Wrong edits as the scorer wrote them then, every one of them correct: the golden proposal is the raw output the row was made from.
  const ok = { body_kept: true, no_extra_change: true, no_invented: true };
  const before = (id: string, cls: string, note: string, seconds: number, check: string, field: string, value: string) => ({
    id, class: cls, outcome: "proposal", reason: "", served: "qwen3-27b", seconds, correct: true, checks: { ...ok, [check]: true }, changed: [field], values: { [field]: value }, proposal: (raw(id, note) as { proposal: string }).proposal,
  });
  const BASE = "run a read-only repository baseline, architecture review, debt inventory, ranking, and pilot proposal";
  const REVERSED = before("description-period-01", "description-period", "the model repairs the break and reverses the meaning", 8.8, "defect_fixed", "description", `Do not ${BASE}.`);
  const ADDED = before("description-period-01", "description-period", "the model repairs the break and adds a clause", 9.1, "defect_fixed", "description", `${BASE[0]?.toUpperCase()}${BASE.slice(1)} for every repository in the organisation.`);
  const CURRENT = before("historical-05", "historical", "the model offers the note as the current way, naming a version it records", 44, "not_current", "when_to_use", "Use as the current, recommended way to call GPT-4 class models today, for any new work.");
  const REPLACES = before("historical-05", "historical", "the model says the note replaces the old approach", 45.2, "not_current", "when_to_use", "Use for GPT-4 era delegation; it replaces the old agent CLI approach.");

  test.each([
    ["reverses the meaning of the description and offers the note as the current way", REVERSED, CURRENT],
    ["adds words to the description and says the note replaces the old approach", ADDED, REPLACES],
  ])("an edit that %s scores wrong when it is scored again, through scripts/rescore, and the cases' right answers still score right", (_what, period, historical) => {
    const dir = runBefore(tmp(), [period, historical]);
    const stored = readStored(dir).summary;
    expect(stored.metrics).toMatchObject({ defects: { n: 6, correct: 6, rate: 1 }, controls: { n: 4, correct: 4, rate: 1 } }); // both wrong edits passed
    const { rows, summary, stdout } = rescoreWithCommand(dir);
    expect(rows.find((r) => r.id === "description-period-01")).toMatchObject({ correct: false, checks: { ...ok, defect_fixed: false } });
    expect(rows.find((r) => r.id === "historical-05")).toMatchObject({ correct: false, checks: { ...ok, not_current: false } });
    expect(rows.filter((r) => r.correct === false).map((r) => r.id).sort()).toEqual(["description-period-01", "historical-05"]); // the others are as they were
    expect(summary.metrics).toMatchObject({ defects: { n: 6, correct: 5 }, controls: { n: 4, correct: 3 } });
    expect(stdout).toContain("2 rows differ from the stored ones: description-period-01, historical-05");
  });
});
