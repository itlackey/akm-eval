import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectionArgs } from "./akm.ts";
import { parseMetadata, parseQueries } from "./lib.ts";
import { type Case, type Metadata, type Raw, makeRow, matchOf, rawOf, intentOf, scoreSelection, summarizeRows } from "./score.ts";

const META: Metadata = { "t//a": { channel: "ops", agent: "atlas" }, "t//b": { channel: "ops" }, "t//c": { agent: "atlas" }, "t//d": { channel: "finance" } };
const SEL = { channel: "ops", agent: "atlas" };

describe("matchOf", () => {
  test("a full match needs every selected key; a value list matches any of its values", () => {
    expect(matchOf(SEL, META["t//a"])).toBe("full");
    expect(matchOf(SEL, META["t//b"])).toBe("partial");
    expect(matchOf(SEL, META["t//c"])).toBe("partial");
    expect(matchOf({ channel: "ops" }, META["t//d"])).toBe("conflict");
    expect(matchOf({ channel: "ops" }, META["t//c"])).toBe("missing");
    expect(matchOf({ channel: "ops" }, undefined)).toBe("missing");
    expect(matchOf({ channel: ["ops", "finance"] }, META["t//d"])).toBe("full");
  });
});

describe("selectionArgs", () => {
  test("repeats the flag for each value of each key, and renders nothing without a selection", () => {
    expect(selectionArgs("prefer", { channel: ["ops", "finance"], agent: "atlas" })).toEqual(["--prefer", "channel=ops", "--prefer", "channel=finance", "--prefer", "agent=atlas"]);
    expect(selectionArgs("filter", undefined)).toEqual([]);
  });
});

describe("parsing", () => {
  test("a selection is an object of keys to a value or values, and same_as names another query", () => {
    const ok = parseQueries('{"id":"a","query":"q","kind":"k","selection":{"channel":["x","y"]}}\n{"id":"b","query":"q","kind":"k","same_as":"a"}');
    expect(ok[0]?.selection).toEqual({ channel: ["x", "y"] });
    expect(() => parseQueries('{"id":"a","query":"q","kind":"k","selection":{}}')).toThrow("selection");
    expect(() => parseQueries('{"id":"a","query":"q","kind":"k","selection":{"channel":3}}')).toThrow("selection");
    expect(() => parseQueries('{"id":"a","query":"q","kind":"k","same_as":"zz"}')).toThrow("no query with that id");
  });
  test("metadata has each ref once", () => {
    expect(parseMetadata('{"ref":"a","keys":{"channel":"ops"}}')).toEqual({ a: { channel: "ops" } });
    expect(() => parseMetadata('{"ref":"a","keys":{"channel":"ops"}}\n{"ref":"a","keys":{"channel":"qa"}}')).toThrow("twice");
    expect(() => parseMetadata('{"ref":"a","keys":{}}')).toThrow("keys");
  });
});

const CASE: Case = { id: "x", query: "q", kind: "k", banned: [], selection: SEL, metadata: META, grades: { "t//a": 3, "t//b": 3, "t//c": 2, "t//d": 3, "t//e": 0 } };

describe("scoreSelection", () => {
  test("a ranking with the full match first scores higher than the same assets with it last", () => {
    const first = scoreSelection(CASE as Case & { selection: typeof SEL }, ["t//a", "t//b", "t//d", "t//e"], 4);
    const last = scoreSelection(CASE as Case & { selection: typeof SEL }, ["t//b", "t//d", "t//e", "t//a"], 4);
    expect(first.pref_ndcg_10).toBeGreaterThan(last.pref_ndcg_10);
    expect(first.first_match_rank).toBe(1);
    expect(last.first_match_rank).toBe(4);
    expect(first.match_precision_k).toBe(0.25);
    expect(first.irrelevant_match_k).toBe(0);
    // the relevant non-matches are t//b, t//c and t//d
    expect(first.nonmatch_recall_10).toBeCloseTo(2 / 3, 3);
    expect(first.partial_above_none).toBe(true); // t//b (partial) before t//d (conflict)
    expect(last.partial_above_none).toBe(true);
    expect(first.conflict_above_missing).toBeNull(); // no relevant asset with the key missing
  });
  test("the rank of the first match is DEPTH + 1 when it is missing, and null when the query has none", () => {
    expect(scoreSelection(CASE as Case & { selection: typeof SEL }, ["t//b"], 4).first_match_rank).toBe(11);
    const none = { ...CASE, selection: { channel: "zz" }, grades: { "t//a": 3 } } as Case & { selection: { channel: string } };
    expect(scoreSelection(none, ["t//a"], 4).first_match_rank).toBeNull();
  });
  test("intent follows the qrels: team when most relevant assets match, general when none, else mixed", () => {
    expect(intentOf({ ...CASE, grades: { "t//a": 3 } })).toBe("team");
    expect(intentOf({ ...CASE, grades: { "t//b": 3, "t//d": 3 } })).toBe("general");
    expect(intentOf({ ...CASE, grades: { "t//a": 3, "t//b": 3 } })).toBe("mixed");
    expect(intentOf({ ...CASE, selection: undefined })).toBeNull();
  });
});

describe("rows of a set with selections", () => {
  const ans = (refs: string[], extra: object = {}) => ({ refs, seconds: 0.2, outChars: 400, ...extra });
  const raw = (refs: string[], tokens?: number[]): Raw => ({ search: ans(refs, tokens ? { tokens } : {}), curate: ans(refs) });
  const base: Case = { ...CASE, id: "x@none", selection: undefined, metadata: undefined };
  const same: Case = { ...CASE, id: "x@absent", selection: { channel: "zz" }, sameAs: "x@none" };
  const leak: Case = { id: "l", query: "codename", kind: "leak", grades: {}, banned: [], selection: { agent: "codename" } };

  test("reports selection metrics by intent, the unchanged and leak checks, and the cost of a call", () => {
    const rows = [
      makeRow(base, raw(["t//b", "t//a"], [10, 20])),
      makeRow(same, raw(["t//b", "t//a"], [10, 20])),
      makeRow(CASE, raw(["t//a", "t//b"], [30, 40])),
      makeRow(leak, raw([])),
    ];
    const s = summarizeRows(rows);
    expect(s.checks).toEqual({ unchanged: { search: 1, curate: 1 }, leaked: { search: 0, curate: 0 } });
    expect(s.metrics.search.selection?.n).toBe(2);
    expect(Object.keys(s.by_intent ?? {}).sort()).toEqual(["general", "mixed"]);
    expect(s.calls.search).toMatchObject({ n: 4, results: 1.5, out_tokens: 100, load_tokens_k: 43.3333 });
    expect(s.calls.curate.load_tokens_k).toBeNull();
    expect(Object.keys(s.by_kind ?? {})).toContain("k");
  });

  test("counts a leak query that returned anything, in a keyword column", () => {
    const s = summarizeRows([makeRow(leak, raw(["t//a"]))]);
    expect(s.checks?.leaked).toEqual({ search: 1, curate: 1 });
  });

  test("a build that refuses the selection flag leaves the selected queries out, in both columns, and they are not errors", () => {
    const refused = { refs: [], seconds: 0.1, error: 'akm search exited 2: {"code": "UNKNOWN_FLAG"}' };
    const s = summarizeRows([makeRow(base, raw(["t//a"])), makeRow(CASE, { search: refused, curate: refused })]);
    expect(s.unsupported).toEqual({ search: 1, curate: 1 });
    expect(s.unsupported_reason).toContain("selection");
    expect(s.n_errored).toBe(0);
    expect(s.metrics.curate.n).toBe(1);
  });

  test("a stored row gives back what rawOf reads, the output size and the tokens included", () => {
    const row = makeRow(CASE, raw(["t//a"], [7]));
    const back = rawOf(row);
    expect("raw" in back && back.raw.search).toMatchObject({ outChars: 400, tokens: [7] });
    expect(makeRow(CASE, (back as { raw: Raw }).raw)).toEqual(row);
  });
});

test("writes a metadata file the parser reads back", () => {
  const dir = mkdtempSync(join(tmpdir(), "meta-"));
  writeFileSync(join(dir, "m.jsonl"), '{"ref":"a","keys":{"channel":"ops"}}\n');
  expect(parseMetadata(require("node:fs").readFileSync(join(dir, "m.jsonl"), "utf8"))).toEqual({ a: { channel: "ops" } });
});
