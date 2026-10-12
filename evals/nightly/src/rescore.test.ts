// scripts/rescore on nightly: a stored night is scored again from what its samples.jsonl holds, with no akm. The night is one run of many items, so each
// row holds its item's files, proposals and actions and the whole night's part. The runs are built from the golden raw outputs (../golden), scored with
// the eval's own scorer, and written as results folders.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, caseDigests, completionOf, lockedParts, manifestProblems } from "../../../lib/manifest.ts";
import { RescoreError, rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const GOLDEN = join(import.meta.dir, "..", "golden");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** The first golden raw output of each item: a night has one row per item. */
const onePerItem = (lines: { case: string; raw: any }[]) => lines.filter((l, i) => lines.findIndex((x) => x.case === l.case) === i);
const LINES = onePerItem(jsonl(join(GOLDEN, "raw.jsonl")));

/** A results folder of a night of the golden raw outputs `lines`, scored against the public night, as run.ts writes it. */
function stored(lines: { case: string; raw: any }[], edit: (rows: any[]) => any[] = (rows) => rows, extra: { corpus?: "public" | "custom"; corpus_folder?: string | null } = {}): { dir: string; rows: any[] } {
  const corpus = MEASUREMENT.loadCases(ROOT, { corpus: "public" });
  const used = lines.map((l) => corpus.find((c) => c.id === l.case) as never);
  const rows = lines.map((l, i) => MEASUREMENT.score(used[i], (MEASUREMENT.rawOf({ id: l.case, ...l.raw }) as { raw: any }).raw));
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    parts: lockedParts(MEASUREMENT),
    corpus: extra.corpus ?? "public",
    cases: caseDigests(MEASUREMENT, used),
    akm: { version: "0.9.99-test", bin: "akm" },
    settings: { strategy: "default" },
    treatment_hints: { embedder: "deterministic" },
    completion: completionOf(MEASUREMENT, used.map((c: any) => c.id), rows),
  });
  const dir = join(mkdtempSync(join(tmpdir(), "nightly-rescore-")), "2026-10-12-golden");
  dirs.push(join(dir, ".."));
  mkdirSync(dir, { recursive: true });
  const written = edit(rows);
  const summary = { eval: "nightly", corpus: extra.corpus ?? "public", ...(extra.corpus === "custom" ? { corpus_kind: "own", corpus_private: true, corpus_folder: extra.corpus_folder ?? null } : {}), label: "golden", status: "complete", aborted_reason: null, embedder: "deterministic", n_items: 35, n_planted: rows.length, ...MEASUREMENT.summarize(rows), manifest };
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), written.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return { dir, rows: written };
}
const rowsOf = (dir: string): any[] => jsonl(join(dir, "samples.jsonl"));
const summaryOf = (dir: string): any => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

describe("rescoring a night", () => {
  test("scores a stored night again from samples.jsonl alone, into a new folder, with the same rows, the same summary figures and the manifest of the current scorer", () => {
    const { dir, rows } = stored(LINES);
    const { out, result } = rescoreFolder(dir);
    expect(out).toBe(`${dir}-rescored`);
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const was = summaryOf(dir);
    const now = summaryOf(out);
    expect(now).toMatchObject({ label: "golden-rescored", n_planted: LINES.length, metrics: was.metrics, n_errored: was.n_errored, outside_changed: was.outside_changed });
    expect(manifestProblems(now.manifest)).toEqual([]);
    expect(now.manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
    expect(now.manifest.treatment_hints).toEqual({ embedder: "deterministic" });
    expect(now.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", dropped: [] });
  });

  test("scores the raw output, not the verdict stored beside it: a file put back in a stored row gives another verdict", () => {
    const touched = LINES.find((l) => l.case === "untouched-01");
    expect(touched).toBeDefined();
    // the golden line for untouched-01 is the right night; edit its stored files so the note changed
    const edit = (rows: any[]) => rows.map((r) => (r.id === "untouched-01" ? { ...r, after: Object.fromEntries(Object.entries(r.after).map(([path, text]) => [path, `${text}\nan added line\n`])) } : r));
    const { dir } = stored(LINES, edit);
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual(["untouched-01"]);
    expect(rowsOf(out).find((r) => r.id === "untouched-01")).toMatchObject({ ok: false, harm: true, checks: { unchanged: false } });
    expect(summaryOf(out).metrics.harm.items).toBe(summaryOf(dir).metrics.harm.items + 1);
  });

  test("scores the whole night's part again from the rows: the paths changed outside the items, and the items akm reports an error for", () => {
    // every row of a real night holds the same part of the night, and the summary takes it from the first; here each golden line is a night of its own
    const stray = LINES.filter((l) => l.case === "unrelated-06");
    const { dir } = stored(stray);
    const { out } = rescoreFolder(dir);
    expect(summaryOf(out).outside_changed).toEqual(["lessons/stray-lesson.md"]);
    expect(summaryOf(out).metrics.harm.outside_changed).toBe(1);
    const { dir: all } = stored(LINES);
    const errors = rowsOf(rescoreFolder(all).out).filter((r) => r.error);
    expect(errors.map((r) => r.id)).toEqual(["retrieval-miss-01", "lesson-02"]);
    expect(summaryOf(`${all}-rescored`).n_errored).toBe(2);
  });

  test("refuses a night from before the manifest, whose rows hold no raw output, and names the fields", () => {
    const strip = (rows: any[]) => rows.map(({ before: _b, after: _a, proposals: _p, actions: _c, night: _n, ...row }) => row);
    const { dir } = stored(LINES, strip);
    expect(() => rescoreFolder(dir)).toThrow(RescoreError);
    expect(() => rescoreFolder(dir)).toThrow(/its rows lack the raw output the nightly scorer reads: before \(\d+ rows: .*\); after \(\d+ rows: .*\); proposals \(\d+ rows: .*\); actions \(\d+ rows: .*\); night \(\d+ rows: .*\)/);
  });
});

describe("rescoring a night on a custom corpus", () => {
  test("reads the items from the corpus_folder the run recorded, which is from the repository root", () => {
    // a folder of the repository that holds an items.jsonl and a library/: the committed night stands in for a folder of a custom corpus
    const { dir, rows } = stored(LINES, undefined, { corpus: "custom", corpus_folder: "evals/nightly/assets" });
    const { out, result } = rescoreFolder(dir);
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    expect(summaryOf(out)).toMatchObject({ corpus: "custom", corpus_folder: "evals/nightly/assets" });
  });

  test("refuses a run whose folder was outside the repository, and says to give it with --cases", () => {
    const { dir } = stored(LINES, undefined, { corpus: "custom", corpus_folder: null });
    expect(() => rescoreFolder(dir)).toThrow(/was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts\/rescore with --cases DIR/);
  });

  test("reads the items from the folder --cases names, a folder of your own outside the repository, and records it as null", () => {
    const { dir, rows } = stored(LINES, undefined, { corpus: "custom", corpus_folder: null });
    const mine = mkdtempSync(join(tmpdir(), "nightly rescore notes-"));
    dirs.push(mine);
    cpSync(join(ROOT, "evals", "nightly", "assets"), mine, { recursive: true });
    const { out, result } = rescoreFolder(dir, { cases: mine });
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [] });
    expect(summaryOf(out).corpus_folder).toBeNull();
  });
});
