import { describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goldenProblems, writeGolden } from "../../../lib/golden.ts";
import { type Measurement, lockedParts, nextVersion } from "../../../lib/manifest.ts";
import { casesOf } from "./lib.ts";
import { MEASUREMENT, setFolder } from "./measurement.ts";
import { SYSTEMS } from "./score.ts";

// The golden files are in ../golden/: eleven cases (nine queries of the public library, among them tasks with and without a relevant asset and
// non-task inputs, and two of the books, which ban assets) with 26 raw outputs for them. Each is what akm search and akm curate plausibly
// return for the query, with the semantic columns in a full run: the relevant assets first, deep in the list or not at all, results nobody
// graded, nothing at all, and each way a call fails (an error, a timeout, a semantic call that akm answered with keyword search or without
// saying how it searched). The rankings are a BM25 over the library files. cases.jsonl holds each query with its grades and its banned
// assets as they are in assets/ today, so a change to the qrels does not move the golden files; they test the scorer. See lib/golden.ts.
//
// expected.jsonl was written by the code that scored a run before the scorer was split from the collector, from these raw outputs, and the
// scorer in score.ts gives the same rows: the split changed no score.
const GOLDEN = join(import.meta.dir, "..", "golden");
const lines = (file: string): any[] => readFileSync(join(GOLDEN, file), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("the golden rows of the scorer", () => {
  test("the scorer gives the expected row for every raw output, and the files are for its version (UPDATE_GOLDEN=1 writes them again)", () => {
    if (process.env.UPDATE_GOLDEN === "1") writeGolden(MEASUREMENT, GOLDEN);
    expect(goldenProblems(MEASUREMENT, GOLDEN)).toEqual([]);
  });

  test("the raw outputs cover every column, a task with and without an answer, a non-task input, a banned asset, an empty answer, an error and a timeout", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    expect(raw.length).toBe(expected.length);
    expect(expected.every((r, i) => r.id === raw[i].case)).toBe(true);
    const calls = expected.flatMap((r) => SYSTEMS.flatMap((sys) => (r[sys] ? [{ sys, ...r[sys], kind: r.kind, n_relevant: r.n_relevant }] : [])));
    expect(new Set(calls.map((c) => c.sys))).toEqual(new Set(SYSTEMS));
    expect(calls.some((c) => c.n_relevant > 0 && c.scores?.ndcg_10 === 1)).toBe(true); // the relevant assets come first
    expect(calls.some((c) => c.n_relevant > 0 && c.scores?.success_5 === false)).toBe(true); // and none of them is in the first five
    expect(calls.some((c) => c.kind === "no-answer" && c.refs.length > 0 && c.scores === undefined)).toBe(true); // a task nobody can answer has no scores
    expect(calls.some((c) => c.kind === "notification" && c.refs.length === 0)).toBe(true); // a non-task input akm answered with nothing
    expect(calls.some((c) => c.refs.length === 0 && !c.error && c.n_relevant > 0 && c.scores?.judged_10 === null)).toBe(true); // empty output for a task that has an answer
    expect(calls.some((c) => c.scores?.banned_above === true) && calls.some((c) => c.scores?.banned_above === false)).toBe(true);
    expect(calls.some((c) => c.scores?.judged_10 !== null && c.scores?.judged_10 < 1)).toBe(true); // results nobody graded for the query
    expect(calls.filter((c) => c.error).length).toBe(8);
    expect(calls.filter((c) => c.timed_out === true).map((c) => c.error)).toEqual(["akm search timed out after 120s", "akm search timed out after 120s"]);
    expect(calls.filter((c) => c.error && c.scores !== undefined)).toEqual([]); // a call that failed has no scores
    expect(calls.filter((c) => c.error && c.sys.startsWith("semantic_")).length).toBe(3);
  });

  test("the expected rows say what a person reading the raw outputs would", () => {
    const raw = lines("raw.jsonl");
    const expected = lines("expected.jsonl");
    const row = (note: string, id?: string) => expected.find((_, i) => raw[i].note === note && (id === undefined || raw[i].case === id));
    // q040 has one relevant asset: first or not in the first ten
    expect(row("the one relevant asset is third").search.scores).toMatchObject({ success_5: true, mrr: 0.3333, recall_10: 1 });
    expect(row("no relevant asset in the first ten").search.scores).toMatchObject({ success_5: false, mrr: 0, recall_10: 0, p_5: 0 });
    // a banned asset ahead of the relevant one, with the relevant asset missing, and without
    expect(row("a banned asset ranks above the relevant one").search.scores).toMatchObject({ banned_above: true, banned_above_first: true });
    expect(row("the relevant asset is first and no banned asset is returned").search.scores).toMatchObject({ banned_above: false, banned_above_first: false, ndcg_10: 1 });
    expect(row("the relevant asset is missing and a banned one is returned").search.scores).toMatchObject({ banned_above: true, ndcg_10: 0 });
    // curate abstains on a harness envelope while search does not
    expect(row("a harness envelope: curate abstains, search does not")).toMatchObject({ n_relevant: 0, search: { refs: expect.any(Array) }, curate: { refs: [] } });
    // empty output for a query that has an answer scores 0 and has no share of judged results
    expect(row("akm returns nothing for a query that has relevant assets").search.scores).toMatchObject({ ndcg_10: 0, recall_10: 0, judged_10: null });
    // grades go with each result, null for one nobody graded
    expect(row("some results were never graded for the query").search.grades.filter((g: number | null) => g === null).length).toBe(4);
  });

  /** The rows the scorer gives for the raw outputs: those of a run with the keyword columns only (--limit), and those of a full run. A run's rows all have the same columns. */
  function scoredRows() {
    const cases = lines("cases.jsonl");
    const rows = lines("raw.jsonl").map((line) => MEASUREMENT.score(cases.find((c) => c.id === line.case), (MEASUREMENT.rawOf({ id: line.case, ...line.raw }) as { raw: any }).raw));
    return { rows, keyword: rows.filter((r) => r.semantic_search === undefined), full: rows.filter((r) => r.semantic_search !== undefined) };
  }

  test("the summary of a run with the keyword columns takes its counts, errors and metrics from the rows", () => {
    const { keyword } = scoredRows();
    const summary = MEASUREMENT.summarize(keyword);
    expect(summary).toMatchObject({ status: "complete", aborted_reason: null, n_queries: 21, n_scored: 16, n_errored: 4, errored: { search: 3, curate: 2 }, timeouts: 1 });
    expect(Object.keys(summary.metrics)).toEqual(["search", "curate"]);
    expect(Object.keys(summary.errored)).toEqual(["search", "curate"]);
    expect(summary.metrics.search.n).toBe(13); // a column leaves out its failed calls: 16 tasks with an answer, 3 of them failed in search
    expect(summary.metrics.curate.n).toBe(14);
    expect(summary.metrics.search).toEqual({ n: 13, ndcg_10: 0.6591, ndcg_10_condensed: 0.6645, p_5: 0.4, success_5: 0.6923, mrr: 0.6111, recall_10: 0.7179, judged_10: 0.8125, banned_above: 0.6667, banned_above_first: 0.6667 });
    expect(summary.abstention.non_task).toEqual({ search: { n: 3, abstained: 1, rate: 0.3333 }, curate: { n: 3, abstained: 2, rate: 0.6667 } }); // curate abstains on the harness envelope
    expect(summary.abstention.no_answer).toEqual({ search: { n: 2, abstained: 1, rate: 0.5 }, curate: { n: 2, abstained: 1, rate: 0.5 } });
  });

  test("the summary of a full run is aborted when a semantic call failed, says how many, and leaves their queries out of the semantic columns", () => {
    const { full } = scoredRows();
    const summary = MEASUREMENT.summarize(full);
    expect(summary).toMatchObject({ status: "aborted", n_queries: 5, n_scored: 5, n_errored: 3, errored: { search: 0, curate: 0, semantic_search: 2, semantic_curate: 1 }, timeouts: 1 });
    expect(summary.aborted_reason).toBe("3 semantic calls failed, or answered with keyword search. Their queries are left out of the semantic columns: see the errors in samples.jsonl.");
    expect(Object.keys(summary.metrics)).toEqual(["search", "curate", "semantic_search", "semantic_curate"]);
    expect(summary.metrics.search.n).toBe(5);
    expect(summary.metrics.semantic_search?.n).toBe(3);
    expect(summary.metrics.semantic_curate?.n).toBe(4);
  });

  test("a case is errored when a call in any column failed", () => {
    const { rows } = scoredRows();
    expect(rows.filter((r) => MEASUREMENT.errored(r)).length).toBe(7);
    expect(rows.filter((r) => !MEASUREMENT.errored(r)).every((r) => SYSTEMS.every((sys) => r[sys] === undefined || !r[sys].error))).toBe(true);
  });
});

describe("the cases and their labels", () => {
  test("a case is a query with the last grade of each pair and the assets its rows ban", () => {
    const queries = [{ id: "q1", query: "alpha", kind: "name" }, { id: "n1", query: "thanks", kind: "chitchat" }, { id: "q2", query: "beta", kind: "direct" }];
    const row = (id: string, ref: string, grade: number, extra: object = {}) => ({ id, ref, grade, reason: "r", ...extra });
    const qrels = [row("q1", "a/x", 1), row("q1", "a/y", 3), row("q1", "a/x", 2), row("q2", "b/x", 0, { banned: true }), row("q2", "b/y", 2)];
    expect(casesOf(queries, qrels)).toEqual([
      { id: "q1", query: "alpha", kind: "name", grades: { "a/x": 2, "a/y": 3 }, banned: [] },
      { id: "n1", query: "thanks", kind: "chitchat", grades: {}, banned: [] },
      { id: "q2", query: "beta", kind: "direct", grades: { "b/x": 0, "b/y": 2 }, banned: ["b/x"] },
    ]);
  });

  test("the digests of a case: its input is the query in the library, its labels are the kind, the grades and the bans", () => {
    const c = { id: "q1", query: "alpha", kind: "name", grades: { "a/x": 2, "a/y": 3 }, banned: ["b", "a"] };
    const library = { library_sha256: "1".repeat(64), bundles_sha256: null };
    expect(MEASUREMENT.input(c, library)).toEqual({ query: "alpha", library });
    expect(MEASUREMENT.input(c)).toEqual({ query: "alpha", library: null }); // a run from before the manifest does not know it
    expect(MEASUREMENT.labels(c)).toEqual({ kind: "name", grades: { "a/x": 2, "a/y": 3 }, banned: ["a", "b"] });
    expect(MEASUREMENT.labels({ ...c, banned: ["a", "b"] })).toEqual(MEASUREMENT.labels(c)); // the order of the qrels rows is not a label
    expect(MEASUREMENT.caseId(c)).toBe("q1");
  });

  test("the queries and qrels of a summary are found by its corpus, with the books in the books folder", () => {
    const at = (rel: string) => join("/repo", rel);
    expect(setFolder("/repo", { corpus: "public", corpus_folder: null, collection: "library" })).toBe(at("evals/retrieval/assets"));
    expect(setFolder("/repo", { corpus: "public", corpus_folder: null, collection: "books" })).toBe(at("evals/retrieval/assets/books"));
    // a custom corpus is where corpus_folder says, which rescore --cases sets and may make absolute
    expect(setFolder("/repo", { corpus: "custom", corpus_kind: "own", corpus_folder: "private/retrieval/own", collection: "own" })).toBe(at("private/retrieval/own"));
    expect(setFolder("/repo", { corpus: "custom", corpus_kind: "own", corpus_folder: "/notes/work", collection: "own" })).toBe("/notes/work");
    expect(setFolder("/repo", { corpus: "custom", corpus_kind: "rewrite", corpus_folder: "private/retrieval/assets", collection: "books" })).toBe(at("private/retrieval/assets/books"));
    // a run from before the corpora were renamed
    expect(setFolder("/repo", { corpus: "public", collection: "books" })).toBe(at("evals/retrieval/assets/books"));
    expect(setFolder("/repo", { corpus: "private", collection: "library" })).toBe(at("private/retrieval/assets"));
    expect(setFolder("/repo", { corpus: "own", collection: "own" })).toBe(at("private/retrieval/own"));
    expect(setFolder("/repo", { corpus: "custom", corpus_kind: "rewrite", corpus_folder: null, collection: "books" })).toBe(at("private/retrieval/assets/books"));
  });

  test("refuses a run whose corpus was outside the repository and not named, and a collection it does not know", () => {
    expect(() => setFolder("/repo", { corpus: "custom", corpus_kind: "own", corpus_folder: null, collection: "own" })).toThrow("the run's corpus was a folder outside the repository, and its summary does not name it (corpus_folder is null). Give it to scripts/rescore with --cases DIR");
    expect(() => setFolder("/repo", { corpus: "public", collection: "papers" })).toThrow('the summary names the collection "papers"');
  });
});

describe("what a change to the scorer does to the golden test", () => {
  /** The golden folder in a temp folder, and a lock beside it that says what version the files are for. */
  function withCopy<T>(run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "retrieval-golden-"));
    try {
      cpSync(GOLDEN, dir, { recursive: true });
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a scorer that gives another row for one raw output fails the test and names the line, the case and the field", () => {
    const changed: Measurement = { ...MEASUREMENT, score: (c, raw) => ({ ...MEASUREMENT.score(c, raw), n_relevant: MEASUREMENT.score(c, raw).n_relevant + 1 }) };
    const problems = withCopy((dir) => goldenProblems(changed, dir));
    expect(problems.length).toBe(26);
    expect(problems[0]).toMatch(/^the scorer's row for raw\.jsonl line 1 \(q001, "the relevant assets come first"\) is not the expected one: n_relevant: expected 2, got 3/);
  });

  test("a scorer that gives the same rows passes, whatever its code", () => {
    const refactored: Measurement = { ...MEASUREMENT, score: (c, raw) => JSON.parse(JSON.stringify(MEASUREMENT.score(c, raw))) };
    expect(withCopy((dir) => goldenProblems(refactored, dir))).toEqual([]);
  });

  test("files made for another version of the scorer than the lock's fail until they are written again", () => {
    const live = lockedParts(MEASUREMENT).scorer.version; // whatever version the lock is at
    const problems = withCopy((dir) => {
      writeFileSync(join(dir, "scorer.json"), JSON.stringify({ scorer_version: nextVersion(live) }));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems).toEqual([`scorer.json is for scorer version ${nextVersion(live)} and MEASUREMENT.lock has ${live}: look at the expected rows, and write them again with UPDATE_GOLDEN=1`]);
  });

  test("a raw output the scorer cannot read, a case that is not there and a missing file are named", () => {
    const problems = withCopy((dir) => {
      const raw = lines("raw.jsonl");
      writeFileSync(join(dir, "raw.jsonl"), [{ ...raw[0], raw: { search: { refs: "x", seconds: 1 } } }, { ...raw[1], case: "no-such-case" }, ...raw.slice(2)].map((l) => `${JSON.stringify(l)}\n`).join(""));
      return goldenProblems(MEASUREMENT, dir);
    });
    expect(problems.slice(0, 2)).toEqual([
      'raw.jsonl line 1 (q001, "the relevant assets come first"): the raw output lacks search.refs, curate',
      'raw.jsonl line 2 (no-such-case, "the relevant assets come first"): the case is not in cases.jsonl',
    ]);
    expect(withCopy((dir) => (rmSync(join(dir, "expected.jsonl")), goldenProblems(MEASUREMENT, dir)))[0]).toContain("expected.jsonl is missing");
  });

  test("the folder of the cases may be anywhere: a temp folder holds a corpus that loadCases reads", () => {
    const root = mkdtempSync(join(tmpdir(), "retrieval-cases-"));
    try {
      const own = join(root, "private", "retrieval", "own");
      mkdirSync(own, { recursive: true });
      writeFileSync(join(own, "queries.jsonl"), `${JSON.stringify({ id: "a1", query: "find it", kind: "direct" })}\n`);
      writeFileSync(join(own, "qrels.jsonl"), `${JSON.stringify({ id: "a1", ref: "notes/it", grade: 3, reason: "r" })}\n`);
      expect(MEASUREMENT.loadCases(root, { corpus: "custom", corpus_kind: "own", corpus_folder: "private/retrieval/own", collection: "own" })).toEqual([{ id: "a1", query: "find it", kind: "direct", grades: { "notes/it": 3 }, banned: [] }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
