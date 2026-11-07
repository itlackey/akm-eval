import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { selectionArgs } from "./akm.ts";
import { collectQuery } from "./collect.ts";
import { casesOf, parseMetadata, parseQrels, parseQueries, readMetadata } from "./lib.ts";
import { type Case, type Metadata, type Raw, makeRow, matchOf, rawOf, intentOf, scoreSelection, summarizeRows } from "./score.ts";

const META: Metadata = { "t//a": { team: "ops", project: "atlas" }, "t//b": { team: "ops" }, "t//c": { project: "atlas" }, "t//d": { team: "finance" } };
const SEL = { team: "ops", project: "atlas" };

describe("matchOf", () => {
  test("a full match needs every selected key; a value list matches any of its values", () => {
    expect(matchOf(SEL, META["t//a"])).toBe("full");
    expect(matchOf(SEL, META["t//b"])).toBe("partial");
    expect(matchOf(SEL, META["t//c"])).toBe("partial");
    expect(matchOf({ team: "ops" }, META["t//d"])).toBe("conflict");
    expect(matchOf({ team: "ops" }, META["t//c"])).toBe("missing");
    expect(matchOf({ team: "ops" }, undefined)).toBe("missing");
    expect(matchOf({ team: ["ops", "finance"] }, META["t//d"])).toBe("full");
  });
  test("the empty value matches an asset without the key, and another team's asset conflicts", () => {
    expect(matchOf({ team: ["ops", ""] }, META["t//b"])).toBe("full");
    expect(matchOf({ team: ["ops", ""] }, META["t//c"])).toBe("full");
    expect(matchOf({ team: ["ops", ""] }, undefined)).toBe("full");
    expect(matchOf({ team: ["ops", ""] }, META["t//d"])).toBe("conflict");
    expect(matchOf({ team: "" }, META["t//b"])).toBe("conflict");
  });
});

describe("selectionArgs", () => {
  test("repeats the flag for each value of each key, and renders nothing without a selection", () => {
    expect(selectionArgs("prefer", { team: ["ops", "finance"], project: "atlas" })).toEqual(["--prefer", "team=ops", "--prefer", "team=finance", "--prefer", "project=atlas"]);
    expect(selectionArgs("filter", undefined)).toEqual([]);
  });
});

describe("parsing", () => {
  test("a selection is an object of keys to a value or values, and same_as names another query", () => {
    const ok = parseQueries('{"id":"a","query":"q","kind":"k","selection":{"team":["x","y"]}}\n{"id":"b","query":"q","kind":"k","same_as":"a"}');
    expect(ok[0]?.selection).toEqual({ team: ["x", "y"] });
    expect(parseQueries('{"id":"a","query":"q","kind":"k","selection":{"team":["x",""]}}')[0]?.selection).toEqual({ team: ["x", ""] });
    expect(() => parseQueries('{"id":"a","query":"q","kind":"k","selection":{"team":[]}}')).toThrow("selection");
    expect(() => parseQueries('{"id":"a","query":"q","kind":"k","selection":{}}')).toThrow("selection");
    expect(() => parseQueries('{"id":"a","query":"q","kind":"k","selection":{"team":3}}')).toThrow("selection");
    expect(() => parseQueries('{"id":"a","query":"q","kind":"k","same_as":"zz"}')).toThrow("no query with that id");
  });
  test("metadata has each ref once", () => {
    expect(parseMetadata('{"ref":"a","keys":{"team":"ops"}}')).toEqual({ a: { team: "ops" } });
    expect(() => parseMetadata('{"ref":"a","keys":{"team":"ops"}}\n{"ref":"a","keys":{"team":"qa"}}')).toThrow("twice");
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
    expect(scoreSelection(CASE as Case & { selection: typeof SEL }, ["t//e"], 4).partial_above_none).toBeNull(); // neither among the results
  });
  test("the rank of the first match is DEPTH + 1 when it is missing, and null when the query has none", () => {
    expect(scoreSelection(CASE as Case & { selection: typeof SEL }, ["t//b"], 4).first_match_rank).toBe(11);
    const none = { ...CASE, selection: { team: "zz" }, grades: { "t//a": 3 } } as Case & { selection: { team: string } };
    expect(scoreSelection(none, ["t//a"], 4).first_match_rank).toBeNull();
  });
  test("intent follows the qrels: team when most relevant assets match, general when none, else mixed", () => {
    expect(intentOf({ ...CASE, grades: { "t//a": 3 } })).toBe("team");
    expect(intentOf({ ...CASE, grades: { "t//b": 3, "t//d": 3 } })).toBe("general");
    expect(intentOf({ ...CASE, grades: { "t//a": 3, "t//b": 3 } })).toBe("mixed");
    expect(intentOf({ ...CASE, selection: undefined })).toBeNull();
    expect(intentOf({ ...CASE, selection: { team: "zz" } })).toBeNull(); // matches no asset: the unchanged check
  });
});

describe("rows of a set with selections", () => {
  const ans = (refs: string[], extra: object = {}) => ({ refs, seconds: 0.2, outChars: 400, ...extra });
  const raw = (refs: string[], tokens?: number[]): Raw => ({ search: ans(refs, tokens ? { tokens } : {}), curate: ans(refs) });
  const base: Case = { ...CASE, id: "x@none", selection: undefined, metadata: undefined };
  const same: Case = { ...CASE, id: "x@absent", selection: { team: "zz" }, sameAs: "x@none" };
  const leak: Case = { id: "l", query: "codename", kind: "leak", grades: {}, banned: [], selection: { project: "codename" } };

  test("reports selection metrics by intent, the unchanged and leak checks, and the cost of a call", () => {
    const rows = [
      makeRow(base, raw(["t//b", "t//a"], [10, 20])),
      makeRow(same, raw(["t//b", "t//a"], [10, 20])),
      makeRow(CASE, raw(["t//a", "t//b"], [30, 40])),
      makeRow(leak, raw([])),
    ];
    const s = summarizeRows(rows);
    expect(s.checks).toEqual({ unchanged: { search: 1, curate: 1 }, empty_value: { search: null, curate: null }, leaked: { search: 0, curate: 0 } });
    // x@absent selects a value no asset has: it is the unchanged check, not a preference, so it has no intent and no selection scores.
    expect(s.metrics.search.selection?.n).toBe(1);
    expect(Object.keys(s.by_intent ?? {})).toEqual(["mixed"]);
    expect(s.calls.search).toMatchObject({ n: 4, results: 1.5, out_tokens: 100, load_tokens_k: 43.3333 });
    expect(s.calls.curate.load_tokens_k).toBeNull();
    expect(Object.keys(s.by_kind ?? {})).toContain("k");
  });

  test("counts a leak query that returned anything, in a keyword column, and says nothing for a set with no leak query", () => {
    expect(summarizeRows([makeRow(leak, raw(["t//a"]))]).checks?.leaked).toEqual({ search: 1, curate: 1 });
    expect(summarizeRows([makeRow(CASE, raw(["t//a"]))]).checks?.leaked).toEqual({ search: null, curate: null });
  });

  test("a build that refuses the selection flag leaves the selected queries out, in both columns, and they are not errors", () => {
    const refused = { refs: [], seconds: 0.1, error: 'akm search exited 2: {"code": "UNKNOWN_FLAG"}' };
    const s = summarizeRows([makeRow(base, raw(["t//a"])), makeRow(CASE, { search: refused, curate: refused })]);
    expect(s.unsupported).toEqual({ search: 1, curate: 1 });
    expect(s.unsupported_reason).toContain("selection");
    expect(s.n_errored).toBe(0);
    expect(s.metrics.curate.n).toBe(1);
  });

  test("a selection with an empty value keeps the general answers and drops the other teams': the partner's list less the excluded assets", () => {
    const twin: Case = { ...base, id: "x@twin" };
    const empty: Case = { ...CASE, id: "x@empty", selection: { team: ["ops", ""] }, sameAs: "x@twin" };
    const kept = (refs: string[]) => summarizeRows([makeRow(twin, raw(["t//d", "t//b", "t//c", "t//a"])), makeRow(empty, raw(refs))]);
    const ok = kept(["t//b", "t//c", "t//a"]);
    expect(makeRow(empty, raw([])).excluded).toEqual(["t//d"]);
    // Its same_as partner is not the unchanged check's: an empty value changes the list on purpose.
    expect(ok.checks).toMatchObject({ unchanged: { search: null }, empty_value: { search: 1, curate: 1 } });
    expect(kept(["t//d", "t//b", "t//c", "t//a"]).checks?.empty_value.search).toBe(0); // another team's note stays
    expect(kept(["t//b", "t//a"]).checks?.empty_value.search).toBe(0); // a general answer is lost, as a hard filter loses it
  });

  test("a selection with an empty value is left out of intent and of the selection scores", () => {
    const empty: Case = { ...CASE, id: "x@empty", selection: { team: ["ops", ""] } };
    expect(intentOf(empty)).toBeNull();
    const row = makeRow(empty, raw(["t//a"]));
    expect(row.intent).toBeUndefined();
    expect(row.search?.scores?.selection).toBeUndefined();
    expect(summarizeRows([row]).metrics.search.selection?.n ?? 0).toBe(0);
  });

  test("a stored row gives back what rawOf reads, the output size and the tokens included", () => {
    const row = makeRow(CASE, raw(["t//a"], [7]));
    const back = rawOf(row);
    expect("raw" in back && back.raw.search).toMatchObject({ outChars: 400, tokens: [7] });
    expect(makeRow(CASE, (back as { raw: Raw }).raw)).toEqual(row);
  });
});

// --- the project arm, against a fake akm -----------------------------------------------------------------------------

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** An akm that reads `projects` as 0.10.261111 does: the project whose path holds the working folder applies, and the answer carries `project` and says which selection flags it got. "ignores" is a build that does not know the key. */
const fakeAkm = (builds: "applies" | "ignores") => `
import { readFileSync } from "node:fs";
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version") { console.log("0.0.0-fake"); process.exit(0); }
if (cmd === "search" && rest[0] === "--help") { console.log("--detail=<detail> Detail level, or agent"); process.exit(0); }
const config = JSON.parse(readFileSync(process.env.AKM_CONFIG_DIR + "/config.json", "utf8"));
const flags = rest.filter((a) => a === "--filter" || a === "--prefer").length;
const [name, project] = Object.entries(config.projects ?? {}).find(([, p]) => p.paths.includes(process.cwd())) ?? [];
const view = ${JSON.stringify(builds)} === "applies" && project ? { project: { name, filters: project.filters, prefer: project.prefer } } : {};
const hits = [{ ref: "knowledge/" + flags + "-" + Buffer.from(JSON.stringify(view.project ? [view.project.filters ?? null, view.project.prefer ?? null] : null)).toString("hex") }];
console.log(JSON.stringify({ ...(cmd === "search" ? { hits } : { items: hits }), searchMode: "keyword", ...view }));
`;

function fakeBox(builds: "applies" | "ignores") {
  const root = mkdtempSync(join(tmpdir(), "retrieval-project-"));
  dirs.push(root);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, fakeAkm(builds));
  const sb = { ...createSandbox("retrieval-project"), cmd: ["bun", script] };
  dirs.push(sb.dir);
  const config = readFileSync(join(sb.dir, "config", "config.json"), "utf8");
  return { sb, config, close: () => removeSandbox(sb) };
}

describe("the project arm", () => {
  const sel: Case = { id: "p", query: "q", kind: "k", grades: {}, banned: [], selection: { team: ["ops", ""] } };

  test("puts the selection in a project of a copy of the config and runs akm in the project's folder with no selection flag", async () => {
    const { sb, config, close } = fakeBox("applies");
    const filtered = await collectQuery({ keyword: sb }, sel, ["search", "curate"], 20_000, "project-filter");
    // No --filter or --prefer on the call (the 0); the project's filters, with an explicit empty prefer.
    const seen = (filters: unknown, prefer: unknown) => [`knowledge/0-${Buffer.from(JSON.stringify([filters, prefer])).toString("hex")}`];
    expect(filtered.row.search?.refs).toEqual(seen(sel.selection, {}));
    expect(filtered.row.curate?.refs).toEqual(filtered.row.search?.refs);
    // `excluded` feeds the empty_value check, which only a filter arm has.
    const withMeta = { ...sel, metadata: META };
    expect((await collectQuery({ keyword: sb }, withMeta, ["search"], 20_000, "project-filter")).row.excluded).toEqual(["t//d"]);
    expect((await collectQuery({ keyword: sb }, withMeta, ["search"], 20_000, "prefer")).row.excluded).toBeUndefined();
    expect(filtered.row.search?.error).toBeUndefined();
    expect(readFileSync(join(sb.dir, "config", "config.json"), "utf8")).toBe(config); // the sandbox's own config, which a kept index shares, is as it was
    close();
  });

  test("a query without a selection is asked as usual, and a build that ignores `projects` errors the selected ones", async () => {
    const { sb, close } = fakeBox("ignores");
    const plain = await collectQuery({ keyword: sb }, { ...sel, selection: undefined }, ["search"], 20_000, "project-filter");
    expect(plain.row.search?.error).toBeUndefined();
    const { row } = await collectQuery({ keyword: sb }, sel, ["search", "curate"], 20_000, "project-filter");
    expect(row.search?.error).toContain("did not apply the project");
    expect(row.search?.unsupported).toBeUndefined();
    expect(summarizeRows([row]).n_errored).toBe(1);
    close();
  });
});

// The acceptance of the project arm: its lists are those of the flag it stands for. Needs a real akm with projects (0.10.261111 or later): AKM_EVAL_REAL_AKM=1 and AKM_BIN.
describe.skipIf(process.env.AKM_EVAL_REAL_AKM !== "1")("the project arm against a real akm", () => {
  const dir = join(import.meta.dir, "..", "assets", "selection");
  test("the project arm gives the lists of the filter flag on the selection set", async () => {
    const cases = casesOf(parseQueries(readFileSync(join(dir, "queries.jsonl"), "utf8")), parseQrels(readFileSync(join(dir, "qrels.jsonl"), "utf8")), readMetadata(dir));
    const sb = createSandbox("project-test", { isolateHome: true });
    try {
      const akm = await import("./akm.ts");
      await akm.load(sb, join(dir, "library"), join(dir, "bundles.json"));
      for (const c of cases) {
        const a = (await collectQuery({ keyword: sb }, c, ["search", "curate"], undefined, "filter")).row;
        const b = (await collectQuery({ keyword: sb }, c, ["search", "curate"], undefined, "project-filter")).row;
        expect(b.search?.error).toBeUndefined();
        expect([c.id, b.search?.refs, b.curate?.refs]).toEqual([c.id, a.search?.refs, a.curate?.refs]);
      }
    } finally {
      removeSandbox(sb);
    }
  }, 900_000);
});
