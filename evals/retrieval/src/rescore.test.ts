// scripts/rescore on retrieval: the runs are built from the raw outputs in fixtures/ of evals/retrieval/golden, scored with the eval's own scorer, and
// written as results folders of the public corpus. The golden cases are queries of the public library and of the books, with the grades they have in
// assets/ today, so a run is scored again against the repository's own labels.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunManifest, buildManifest, caseDigests, completionOf, manifestProblems, readManifest } from "../../../lib/manifest.ts";
import { sha256File, sha256Json } from "../../../lib/provenance.ts";
import { RescoreError, rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { type Case, type Row } from "./score.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURES = join(ROOT, "evals", "retrieval", "fixtures");
const ASSETS = join(ROOT, "evals", "retrieval", "assets");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const FIXTURE_CASES: Case[] = jsonl(join(FIXTURES, "cases.jsonl"));
const RAW: { case: string; note: string; raw: any }[] = jsonl(join(FIXTURES, "raw.jsonl"));
const BOOKS = ["legal-standard-deduction-current", "culinary-sear-steaming-not-browning"];
// The scorer goldens remain frozen; this suite tests rescoring against the current public judgments.
const current = ["library", "books"].flatMap(collection => MEASUREMENT.loadCases(ROOT, { corpus: "public", collection }));
const CASES = FIXTURE_CASES.map(c => current.find(now => now.id === c.id) as Case);
/** The case ids of a collection: the books are the two cases of the golden folder with a banned asset. */
const idsOf = (collection: "library" | "books"): string[] => CASES.map((c) => c.id).filter((id) => BOOKS.includes(id) === (collection === "books"));
const LIBRARY = { library_sha256: "1".repeat(64), bundles_sha256: null };

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "retrieval-rescore-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Spec {
  collection?: "library" | "books";
  /** The labels the run was scored with, when they are not the repository's. */
  labels?: (c: Case) => Case;
  /** The note of the raw output a case is run with. Default: the first one of the case in raw.jsonl. */
  note?: (id: string) => string | undefined;
  manifest?: (m: RunManifest) => RunManifest | undefined;
  rows?: (rows: Row[]) => Record<string, any>[];
  summary?: Record<string, unknown>;
}

/** A results folder of the golden cases of a collection as harness-v3 writes it. */
function run(spec: Spec = {}): string {
  const collection = spec.collection ?? "library";
  const cases = CASES.filter((c) => idsOf(collection).includes(c.id));
  const labelled = cases.map((c) => spec.labels?.(c) ?? c);
  // a run has the same columns in every row: this is a run with the keyword columns, as --limit gives
  const raw = (c: Case) => {
    const { semantic_search: _s, semantic_curate: _c, ...keyword } = (RAW.find((l) => l.case === c.id && (spec.note?.(c.id) === undefined || l.note === spec.note(c.id))) as { raw: any }).raw;
    return keyword;
  };
  const scored = labelled.map((c) => MEASUREMENT.score(c, (MEASUREMENT.rawOf({ id: c.id, ...raw(c) }) as { raw: any }).raw));
  const folder = collection === "books" ? join(ASSETS, "books") : ASSETS;
  const base = buildManifest({
    measurement: MEASUREMENT,
    corpus: "public",
    collection,
    cases: caseDigests(MEASUREMENT, labelled, () => LIBRARY),
    akm: { version: "0.9.99-test", bin: "akm" },
    config: { keyword: { configVersion: "0.9.0", semanticSearchMode: "off" } },
    settings: { timeout_ms: 120_000 },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), scored),
  });
  const dir = join(tmp(), `2026-10-12-golden-${collection}`);
  mkdirSync(dir, { recursive: true });
  const summary: Record<string, unknown> = {
    eval: "retrieval",
    corpus: "public",
    corpus_folder: null,
    collection,
    label: "golden",
    date: "2026-10-12T09:00:00.000Z",
    harness_sha256: "b".repeat(64),
    akm_version: "0.9.99-test",
    akm_bin: "akm",
    akm_build: null,
    akm_build_fingerprint: null,
    search_mode: { keyword: "keyword" },
    semantic_flag: "auto",
    depth: 10,
    relevant_from_grade: 2,
    limit: null,
    n_assets: 259,
    index_seconds: { keyword: 0.4 },
    config: { keyword: { configVersion: "0.9.0", semanticSearchMode: "off" } },
    assets_sha256: "a".repeat(64),
    assets: { ...LIBRARY, queries_sha256: sha256File(join(folder, "queries.jsonl")), qrels_sha256: sha256File(join(folder, "qrels.jsonl")) },
    seed: null,
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

describe("rescoring a retrieval run", () => {
  test("scores a run again into a new folder beside it, with the same rows when the labels are the same, and leaves the original as it was", () => {
    const dir = run();
    const before = text(dir);
    const { out, result } = rescoreFolder(dir);
    expect(out).toBe(`${dir}-rescored`);
    expect(text(dir)).toBe(before);
    expect(rowsOf(out)).toEqual(rowsOf(dir));
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    const s = summaryOf(out);
    const o = summaryOf(dir);
    expect(s).toMatchObject({ label: "golden-rescored", n_queries: 9, n_scored: o.n_scored, metrics: o.metrics, abstention: o.abstention, errored: o.errored, n_assets: 259, assets: o.assets });
    expect(manifestProblems(s.manifest)).toEqual([]);
    expect(s.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden-library", dropped: [] });
    expect(readManifest(s).kind).toBe("manifest");
  });

  test("the books are scored again from their own folder, with the assets their rows ban", () => {
    const dir = run({ collection: "books" });
    const { out, result } = rescoreFolder(dir);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    expect(rowsOf(out)).toEqual(rowsOf(dir));
    expect(summaryOf(out).metrics.search.banned_above).toBe(0.5); // expanded labels find another relevant asset below a banned result
    expect(rowsOf(out).map((r) => r.search.scores.banned_above)).toEqual([false, true]);
    expect(rowsOf(out).map((r) => r.search.scores.banned_above_first)).toEqual([false, false]);
  });

  test("a change to the qrels is a change of the labels: the run is scored again against them, and the cases it touched are named", () => {
    // The run was scored when q003's best asset was graded 0 and q001 banned one of its results: the repository has other grades now.
    const stale = run({
      labels: (c) =>
        c.id === "q003" ? { ...c, grades: Object.fromEntries(Object.entries(c.grades).map(([ref, g]) => [ref, g >= 2 ? 0 : g])) } : c.id === "q001" ? { ...c, banned: [Object.keys(c.grades)[0] as string] } : c,
    });
    const was = rowsOf(stale);
    expect(was.find((r) => r.id === "q003").n_relevant).toBe(0); // it had no relevant asset: no scores
    expect(was.find((r) => r.id === "q003").search.scores).toBeUndefined();
    const { out, result } = rescoreFolder(stale);
    expect(result.changed.sort()).toEqual(["q001", "q003"]);
    expect(result.relabelled.sort()).toEqual(["q001", "q003"]);
    const now = rowsOf(out);
    const currentRows = rowsOf(run());
    for (const id of ["q001", "q003"]) {
      const expected = currentRows.find(r => r.id === id);
      expect(now.find((r) => r.id === id)).toEqual(expected); // the row the current labels and the stored results give
    }
    expect(now.find((r) => r.id === "q003").search.scores.ndcg_10).toBeGreaterThan(0);
    // the rescored manifest has the current labels' digests, the original inputs, and the current scorer
    const m = summaryOf(out).manifest as RunManifest;
    const old = summaryOf(stale).manifest as RunManifest;
    expect(m.cases.q003?.label_sha256).toBe(sha256Json(MEASUREMENT.labels(CASES.find((c) => c.id === "q003") as Case)));
    expect(m.cases.q003?.label_sha256).not.toBe(old.cases.q003?.label_sha256);
    expect(m.cases.q003?.input_sha256).toBe(old.cases.q003?.input_sha256);
    expect(m.cases.q004).toEqual(old.cases.q004);
    expect(summaryOf(out).metrics.search.ndcg_10).not.toBe(summaryOf(stale).metrics.search.ndcg_10);
  });

  test("a run with a manifest from another scorer is scored by the current one, and the manifest says which it was", () => {
    const stale = { version: "9.9", sha256: "c".repeat(64) };
    const other = { version: "9.9", sha256: "d".repeat(64) };
    const dir = run({ manifest: (m) => ({ ...m, scorer: stale, collector: other }), rows: (rows) => rows.map((r) => ({ ...r, n_relevant: r.n_relevant + 1 })) });
    const { out, result } = rescoreFolder(dir);
    expect(result.changed.length).toBe(9);
    const m = summaryOf(out).manifest as RunManifest;
    expect(m.collector).toEqual(other);
    expect(m.rescored_from?.scorer).toEqual(stale);
  });

  test("a reworded query is refused without dropping cases", () => {
    const dir = run({ manifest: (m) => ({ ...m, cases: { ...m.cases, q010: { ...(m.cases.q010 as object), input_sha256: "e".repeat(64) } as never } }) });
    expect(() => rescoreFolder(dir)).toThrow("case input changed: q010");
  });

  test("a run that was asked of another library is not rescored against its digests", () => {
    // The input of every query includes the library: a summary whose assets name another library than the manifest's has no case in common with it.
    const dir = run({ summary: { assets: { library_sha256: "9".repeat(64), bundles_sha256: null, queries_sha256: sha256File(join(ASSETS, "queries.jsonl")), qrels_sha256: "2".repeat(64) } } });
    expect(() => rescoreFolder(dir)).toThrow("case input changed");
  });

  test("a run whose rows lack the results the scorer reads is refused, and the fields are named", () => {
    const dir = run({ rows: (rows) => rows.map((r, i) => (i === 0 ? { ...r, curate: { seconds: 0.3 } } : i === 1 ? { ...r, search: { refs: ["a"] } } : r)) });
    expect(() => rescoreFolder(dir)).toThrow(/its rows lack the raw output the retrieval scorer reads: curate\.refs \(1 row: q001\); search\.seconds \(1 row: q002\)/);
    expect(() => rescoreFolder(run({ rows: (rows) => rows.map(({ curate: _c, ...r }) => r) }))).toThrow(/curate \(9 rows: /);
  });

  test("a run on a custom corpus is scored against the cases in its corpus_folder", () => {
    // evals/retrieval/assets is a folder of the repository in the format of a custom corpus too
    const dir = run({ summary: { corpus: "custom", corpus_folder: "evals/retrieval/assets" }, manifest: (m) => ({ ...m, corpus: "custom" }) });
    const { out, result } = rescoreFolder(dir);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    expect(rowsOf(out)).toEqual(rowsOf(dir));
    expect(summaryOf(out).corpus_folder).toBe("evals/retrieval/assets");
    // --cases names another folder, holding other grades: the run is scored against those
    const other = tmp();
    const grades = jsonl(join(ASSETS, "qrels.jsonl")).map((r) => (r.id === "q003" && r.grade >= 2 ? { ...r, grade: 0 } : r));
    writeFileSync(join(other, "queries.jsonl"), readFileSync(join(ASSETS, "queries.jsonl")));
    writeFileSync(join(other, "qrels.jsonl"), grades.map((r) => `${JSON.stringify(r)}\n`).join(""));
    const moved = rescoreFolder(run({ summary: { corpus: "custom", corpus_folder: "evals/retrieval/assets" }, manifest: (m) => ({ ...m, corpus: "custom" }) }), { cases: other });
    expect(moved.result.changed).toEqual(["q003"]); // it has no relevant asset there
    expect(rowsOf(moved.out).find((r) => r.id === "q003").n_relevant).toBe(0);
  });

  test("a run of a custom corpus outside the repository records no folder, and --cases names it", () => {
    const folder = tmp();
    const cases: Case[] = [{ id: "a1", query: "find the note", kind: "direct", grades: { "notes/it": 3, "notes/other": 1 }, banned: [] }, { id: "n1", query: "thanks", kind: "chitchat", grades: {}, banned: [] }];
    writeFileSync(join(folder, "queries.jsonl"), cases.map((c) => `${JSON.stringify({ id: c.id, query: c.query, kind: c.kind })}\n`).join(""));
    writeFileSync(join(folder, "qrels.jsonl"), `${JSON.stringify({ id: "a1", ref: "notes/it", grade: 3, reason: "r" })}\n${JSON.stringify({ id: "a1", ref: "notes/other", grade: 1, reason: "r" })}\n`);
    const raw = { a1: { search: { refs: ["notes/other", "notes/it"], seconds: 0.2 }, curate: { refs: ["notes/it"], seconds: 0.3 } }, n1: { search: { refs: [], seconds: 0.1 }, curate: { refs: [], seconds: 0.1 } } };
    const scored = cases.map((c) => MEASUREMENT.score(c, raw[c.id as "a1"]));
    const manifest = buildManifest({
      measurement: MEASUREMENT,
      corpus: "custom",
      collection: "own",
      cases: caseDigests(MEASUREMENT, cases, () => LIBRARY),
      config: { keyword: {} },
      completion: completionOf(MEASUREMENT, ["a1", "n1"], scored),
    });
    const dir = join(tmp(), "2026-10-12-mine-own");
    mkdirSync(dir, { recursive: true });
    const summary = { eval: "retrieval", corpus: "custom", corpus_folder: null, collection: "own", label: "mine", assets: { ...LIBRARY, queries_sha256: sha256File(join(folder, "queries.jsonl")), qrels_sha256: "2".repeat(64) }, ...MEASUREMENT.summarize(scored), manifest };
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
    writeFileSync(join(dir, "samples.jsonl"), scored.map((r) => `${JSON.stringify(r)}\n`).join(""));
    expect(() => rescoreFolder(dir)).toThrow("was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts/rescore with --cases DIR");
    const { out, result } = rescoreFolder(dir, { cases: folder }); // an absolute folder
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    expect(rowsOf(out)).toEqual(rowsOf(dir));
    expect(summaryOf(out).corpus_folder).toBeNull(); // the folder is outside the repository: it is not recorded
    expect(summaryOf(out).metrics.search.ndcg_10).toBe(summaryOf(dir).metrics.search.ndcg_10);
    // the folder changed its grades: --cases scores the run against them
    writeFileSync(join(folder, "qrels.jsonl"), `${JSON.stringify({ id: "a1", ref: "notes/it", grade: 1, reason: "r" })}\n`);
    const changed = rescoreFolder(dir, { cases: folder });
    expect(changed.result.changed).toEqual(["a1"]);
    expect(changed.result.relabelled).toEqual(["a1"]);
    expect(rowsOf(changed.out).find((r) => r.id === "a1").n_relevant).toBe(0);
  });
});
