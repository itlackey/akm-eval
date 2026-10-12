// scripts/rescore on consolidate, in both modes: a stored run is scored again from what its samples.jsonl holds, with no akm. The runs are built from
// the golden raw outputs (../golden), scored with the eval's own scorer, and written as results folders.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** A results folder of a run of the golden raw outputs `lines`, scored against the public corpus, as run.ts writes it. */
function stored(mode: "case" | "pool", lines: { case: string; raw: any }[], edit: (rows: any[]) => any[] = (rows) => rows, extra: { corpus?: "public" | "custom"; corpus_folder?: string | null } = {}): { dir: string; rows: any[] } {
  const summary0 = mode === "pool" ? { corpus: "public", mode: "pool" } : { corpus: "public" };
  const corpus = MEASUREMENT.loadCases(ROOT, summary0);
  const used = lines.map((l) => corpus.find((c) => c.id === l.case) as never);
  const rows = lines.map((l, i) => MEASUREMENT.score(used[i], (MEASUREMENT.rawOf({ id: l.case, ...l.raw }) as { raw: any }).raw));
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    parts: lockedParts(MEASUREMENT),
    corpus: extra.corpus ?? "public",
    mode: mode === "pool" ? "pool" : null,
    cases: caseDigests(MEASUREMENT, used),
    akm: { version: "0.9.99-test", bin: "akm" },
    settings: { strategy: "consolidate" },
    treatment_hints: { embedder: "deterministic" },
    completion: completionOf(MEASUREMENT, used.map((c: any) => c.id), rows),
  });
  const dir = join(mkdtempSync(join(tmpdir(), "consolidate-rescore-")), "2026-10-12-golden");
  dirs.push(join(dir, ".."));
  mkdirSync(dir, { recursive: true });
  const written = edit(rows);
  const summary = { eval: "consolidate", corpus: extra.corpus ?? "public", ...(extra.corpus === "custom" ? { corpus_kind: "own", corpus_private: true, corpus_folder: extra.corpus_folder ?? null } : {}), ...(mode === "pool" ? { mode: "pool" } : {}), label: "golden", status: "complete", aborted_reason: null, embedder: "deterministic", ...MEASUREMENT.summarize(rows), manifest };
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), written.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return { dir, rows: written };
}
const rowsOf = (dir: string): any[] => jsonl(join(dir, "samples.jsonl"));
const summaryOf = (dir: string): any => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

/** The first golden raw output of each case: a run has one row per case. */
const onePerCase = (lines: { case: string; raw: any }[]) => lines.filter((l, i) => lines.findIndex((x) => x.case === l.case) === i);

describe("rescoring a per-case run", () => {
  const lines = onePerCase(jsonl(join(GOLDEN, "raw.jsonl")));

  test("scores a stored run again from samples.jsonl alone, into a new folder, with the same rows, the same summary figures and the manifest of the current scorer", () => {
    const { dir, rows } = stored("case", lines);
    const { out, result } = rescoreFolder(dir);
    expect(out).toBe(`${dir}-rescored`);
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const was = summaryOf(dir);
    const now = summaryOf(out);
    expect(now).toMatchObject({ label: "golden-rescored", n_run: lines.length, metrics: was.metrics, served_models: was.served_models, n_errored: was.n_errored, n_paired: was.n_paired, timeouts: was.timeouts });
    expect(manifestProblems(now.manifest)).toEqual([]);
    expect(now.manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
    expect(now.manifest.treatment_hints).toEqual({ embedder: "deterministic" });
    expect(now.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", dropped: [] });
  });

  test("scores the raw output, not the verdict stored beside it: a retirement edited in a stored row gives another verdict", () => {
    const first = lines.find((l) => l.case === "duplicate-01") as { case: string; raw: any };
    const flip = (rows: any[]) => rows.map((r) => (r.id === "duplicate-01" ? { ...r, retire_proposals: [{ ...r.retire_proposals[0], retirement: { ...r.retire_proposals[0].retirement, retiredRef: r.retire_proposals[0].retirement.successorRef } }] } : r));
    expect(first.raw.retire_proposals).toHaveLength(1);
    const { dir } = stored("case", lines, flip);
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual(["duplicate-01"]);
    expect(rowsOf(out).find((r) => r.id === "duplicate-01")).toMatchObject({ retired: "b", outcome: "retire" });
  });

  test("scores a case that ended in an error or a timeout again as the same error, and counts it", () => {
    const { dir } = stored("case", lines);
    const { out } = rescoreFolder(dir);
    const errors = rowsOf(out).filter((r) => r.outcome === "error");
    expect(errors.length).toBeGreaterThan(3);
    expect(errors.filter((r) => r.timed_out === true).map((r) => r.id)).toEqual(["unrelated-02"]);
    expect(summaryOf(out)).toMatchObject({ n_errored: errors.length, timeouts: 1 });
  });

  test("refuses a run from before the manifest, whose rows hold no raw output, and names the fields", () => {
    const strip = (rows: any[]) => rows.map(({ pair_pass: _p, retire_proposals: _r, usage: _u, hint: _h, ...row }) => row).filter((r) => r.outcome !== "error");
    const { dir } = stored("case", lines, strip);
    expect(() => rescoreFolder(dir)).toThrow(RescoreError);
    expect(() => rescoreFolder(dir)).toThrow(/its rows lack the raw output the consolidate scorer reads: pair_pass \(\d+ rows: .*\); retire_proposals \(\d+ rows: .*\); usage \(\d+ rows: .*\)/);
  });
});

describe("rescoring a run on a custom corpus", () => {
  const lines = onePerCase(jsonl(join(GOLDEN, "raw.jsonl")));

  test("reads the cases from the corpus_folder the run recorded, which is from the repository root", () => {
    // a folder of the repository that holds a cases.jsonl: the committed cases stand in for a folder of a custom corpus
    const { dir, rows } = stored("case", lines, undefined, { corpus: "custom", corpus_folder: "evals/consolidate/assets" });
    const { out, result } = rescoreFolder(dir);
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    expect(summaryOf(out)).toMatchObject({ corpus: "custom", corpus_folder: "evals/consolidate/assets" });
    expect(summaryOf(out).manifest.corpus).toBe("custom");
  });

  test("refuses a run whose folder was outside the repository, and says to give it with --cases", () => {
    const { dir } = stored("case", lines, undefined, { corpus: "custom", corpus_folder: null });
    expect(() => rescoreFolder(dir)).toThrow(RescoreError);
    expect(() => rescoreFolder(dir)).toThrow(/was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts\/rescore with --cases DIR/);
  });

  test("reads the cases from the folder --cases names, a folder of your own outside the repository, and records it as null", () => {
    const { dir, rows } = stored("case", lines, undefined, { corpus: "custom", corpus_folder: null });
    const mine = mkdtempSync(join(tmpdir(), "consolidate rescore notes-"));
    dirs.push(mine);
    writeFileSync(join(mine, "cases.jsonl"), readFileSync(join(ROOT, "evals", "consolidate", "assets", "cases.jsonl")));
    const { out, result } = rescoreFolder(dir, { cases: mine });
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [] });
    expect(summaryOf(out).corpus_folder).toBeNull();
    // the folder is where the cases are read from: a case that is not in it is left out
    writeFileSync(join(mine, "cases.jsonl"), readFileSync(join(ROOT, "evals", "consolidate", "assets", "cases.jsonl"), "utf8").split("\n").filter((l) => l && !l.includes('"id": "duplicate-01"')).join("\n") + "\n");
    expect(rescoreFolder(dir, { cases: mine }).result.dropped).toEqual(["duplicate-01"]);
  });
});

describe("rescoring a pool run", () => {
  const pool = jsonl(join(GOLDEN, "pool", "raw.jsonl"));
  const good = pool.slice(0, 13); // the clusters of the one run

  test("scores a stored pool run again from the rows of its clusters, with the same rows and the same metrics", () => {
    const { dir, rows } = stored("pool", good);
    const { out, result } = rescoreFolder(dir);
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [], legacy: false });
    const was = summaryOf(dir);
    const now = summaryOf(out);
    expect(now).toMatchObject({ mode: "pool", metrics: was.metrics, n_paired: 39, seconds: 271.4, status: "complete" });
    expect(now.metrics.pairs.judged).toBe(39);
    expect(now.metrics.unsafe).toEqual({ n: 4, of: 11, staged: 2 });
    expect(now.manifest.mode).toBe("pool");
    expect(now.manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
  });

  test("scores the labels as they are now: a retirement stored in a cluster is judged against that cluster's labels", () => {
    // the subsumed pair, retired the wrong way round in a stored row, is unsafe on rescore
    const flip = (rows: any[]) =>
      rows.map((r) => {
        if (r.id !== "subsumed-01") return r;
        const p = r.retire_proposals[0];
        return { ...r, retire_proposals: [{ ...p, retirement: { ...p.retirement, retiredRef: p.retirement.successorRef, successorRef: p.retirement.retiredRef } }] };
      });
    const { dir } = stored("pool", good, flip);
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual(["subsumed-01"]);
    expect(rowsOf(out).find((r) => r.id === "subsumed-01")).toMatchObject({ outcome: "unsafe" });
    expect(summaryOf(out).metrics.unsafe.n).toBe(5);
  });

  test("a run that failed rescores as a failed run", () => {
    const { dir } = stored("pool", pool.slice(-1));
    const { out } = rescoreFolder(dir);
    expect(summaryOf(out)).toMatchObject({ n_errored: 1, n_scored: 0, metrics: null, status: "aborted", aborted_reason: "akm improve failed (exit 78): the config names an engine that does not exist" });
  });

  test("refuses a pool run from before the manifest, whose rows hold no raw output", () => {
    const strip = (rows: any[]) => rows.map(({ run: _r, retire_proposals: _p, ...row }) => row);
    const { dir } = stored("pool", good, strip);
    expect(() => rescoreFolder(dir)).toThrow(/its rows lack the raw output the consolidate scorer reads: run \(13 rows: .*\); retire_proposals \(13 rows: .*\)/);
  });
});
