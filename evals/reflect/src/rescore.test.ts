// A stored run of reflect scored again by scripts/rescore: a run of a custom corpus finds its cases again, and a run stored before a fix to the
// scorer takes the verdict of the scorer here (one test for each fix, with the rows as the scorer wrote them before it).

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, caseDigests, completionOf, lockedParts } from "../../../lib/manifest.ts";
import { engineSettings } from "../../../lib/provenance.ts";
import { RescoreError, readStored, rescoreFolder, rescoreRun } from "../../../scripts/rescore/src/lib.ts";
import { type Case, type Raw, type Row, assetsSha256, reflectConfig } from "./lib.ts";
import { MEASUREMENT, casesFolder } from "./measurement.ts";

const EVAL = join(import.meta.dir, "..");
const REPO = join(EVAL, "..", "..");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const CASES: Case[] = jsonl(join(EVAL, "golden", "cases.jsonl"));
const RAW: { case: string; note: string; raw: Raw }[] = jsonl(join(EVAL, "golden", "raw.jsonl"));
const raw = (id: string, note: string): Raw => (RAW.find((l) => l.case === id && l.note === note) as { raw: Raw }).raw;
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

/** A results folder of `rows` for `cases`, as a run writes it: a summary with its manifest, and the rows. `summary` adds to or replaces what the summary holds. */
function storedRun(parent: string, name: string, cases: Case[], rows: Record<string, any>[], summary: Record<string, unknown> = {}): string {
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    parts: lockedParts(MEASUREMENT),
    corpus: String(summary.corpus ?? "public"),
    cases: caseDigests(MEASUREMENT, cases),
    akm: { version: "0.9.99-test", bin: "akm" },
    config: CONFIG,
    settings: { strategy: "reflect-only" },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), rows as Row[]),
  });
  writeFileSync(
    join(dir, "summary.json"),
    `${JSON.stringify({ eval: "reflect", corpus: "public", label: "stored", date: "2026-10-12T09:00:00.000Z", harness_sha256: "b".repeat(64), model: "the-model", akm_version: "0.9.99-test", akm_bin: "akm", akm_build: null, akm_build_fingerprint: null, limit: null, strategy: "reflect-only", config_patch: null, config: JSON.parse(JSON.stringify(CONFIG)), engine: engineSettings(CONFIG), assets_sha256: assetsSha256(join(EVAL, "assets")), seed: null, status: "complete", aborted_reason: null, n_cases: cases.length, ...MEASUREMENT.summarize(rows as Row[]), manifest, ...summary }, null, 2)}\n`,
  );
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return dir;
}

/** The golden raw outputs of the ten golden cases, each case's right answer (a defect restored, a control left alone), scored by the scorer here. */
const rightRows = (): Row[] => CASES.map((c) => MEASUREMENT.score(c, raw(c.id, c.fix ? "the model restores what the injection took away" : "the model leaves the note alone")));

describe("the folder of the cases of a run", () => {
  const root = join(tmpdir(), "reflect root");
  test("is the eval's assets for the public corpus, the recorded folder for a custom one, and says so when there is none", () => {
    expect(casesFolder(root, { corpus: "public" })).toBe(join(root, "evals", "reflect", "assets"));
    expect(casesFolder(root, { corpus: "custom", corpus_kind: "rewrite", corpus_folder: "private/reflect/assets" })).toBe(join(root, "private", "reflect", "assets"));
    expect(casesFolder(root, { corpus: "custom", corpus_kind: "own", corpus_folder: "private/reflect/own notes" })).toBe(join(root, "private", "reflect", "own notes"));
    expect(casesFolder(root, { corpus: "custom", corpus_kind: "own", corpus_folder: join(tmpdir(), "elsewhere") })).toBe(join(tmpdir(), "elsewhere")); // what --cases DIR gives
    for (const summary of [{ corpus: "custom", corpus_kind: "own", corpus_folder: null }, { corpus: "custom", corpus_kind: "rewrite", corpus_folder: null }, { corpus: "custom", corpus_kind: "own" }, { corpus: "own" }]) {
      expect(() => casesFolder(root, summary), JSON.stringify(summary)).toThrow("outside this repository, which a summary does not record. scripts/rescore takes that folder with --cases DIR");
    }
  });

  test("is private/reflect/assets for a run from before corpus_folder, which called the seeded rewrite private", () => {
    expect(casesFolder(root, { corpus: "private" })).toBe(join(root, "private", "reflect", "assets"));
    expect(casesFolder(root, { corpus: "custom", corpus_kind: "rewrite" })).toBe(join(root, "private", "reflect", "assets"));
  });

  test("a run from before the manifest is told apart by the cases it read, where they are", () => {
    const tree = tmp();
    mkdirSync(join(tree, "evals", "reflect"), { recursive: true });
    cpSync(join(EVAL, "assets"), join(tree, "evals", "reflect", "assets"), { recursive: true });
    const digest = assetsSha256(join(tree, "evals", "reflect", "assets"));
    expect(MEASUREMENT.legacyProblem?.(tree, { corpus: "public", assets_sha256: digest })).toBeUndefined();
    expect(MEASUREMENT.legacyProblem?.(tree, { corpus: "public", assets_sha256: "0".repeat(64) })).toContain("it read other cases than the ones in evals/reflect/assets now");
    expect(MEASUREMENT.legacyProblem?.(tree, { corpus: "private", assets_sha256: digest })).toContain("it read other cases than the ones in private/reflect/assets now"); // none there
    expect(MEASUREMENT.legacyProblem?.(tree, { corpus: "custom", corpus_folder: null })).toContain("outside this repository");
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
    cpSync(join(REPO, "MEASUREMENT.lock"), join(tree, "MEASUREMENT.lock"));
    mkdirSync(join(tree, folder), { recursive: true });
    cpSync(join(EVAL, "golden", "cases.jsonl"), join(tree, folder, "cases.jsonl"));
    return tree;
  }
  const custom = (over: Record<string, unknown>) => ({ corpus: "custom", corpus_kind: "own", corpus_private: true, ...over });

  test("reads the cases from the folder the summary records, from the repository root", () => {
    const tree = checkout("private/reflect/own notes");
    const dir = storedRun(tmp(), "2026-10-12-mine", CASES, rightRows(), custom({ corpus_folder: "private/reflect/own notes" }));
    const { result } = rescoreFolder(dir, { root: tree });
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    expect(result.rows).toHaveLength(CASES.length);
    expect(result.summary.manifest.corpus).toBe("custom");
    expect(result.summary).toMatchObject({ corpus: "custom", corpus_kind: "own", corpus_folder: "private/reflect/own notes" });
  });

  test("refuses a run whose folder was outside the repository and says to name it with --cases, then reads it from there", () => {
    const tree = checkout("somewhere/else");
    const dir = storedRun(tmp(), "2026-10-12-mine", CASES, rightRows(), custom({ corpus_folder: null }));
    const stored = readStored(dir);
    expect(() => rescoreRun(stored, { root: tree })).toThrow(RescoreError);
    expect(() => rescoreRun(stored, { root: tree })).toThrow("the cases it read were in a folder outside this repository, which a summary does not record. scripts/rescore takes that folder with --cases DIR");
    // --cases DIR is the summary with the folder it names, from the root or absolute
    const named = (folder: string) => rescoreRun({ ...stored, summary: { ...stored.summary, corpus_folder: folder } }, { root: tree });
    expect(named("somewhere/else").changed).toEqual([]);
    expect(named(join(tree, "somewhere", "else")).changed).toEqual([]);
  });
});
