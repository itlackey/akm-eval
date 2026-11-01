// The dated set (assets/dated) and the sentinel guard (guard.ts): the set agrees with its own library, the guard tells a build that applies
// --since/--until from one that ignores or refuses them, and a tie-break is scored by where the newer version ranks.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine, createSandbox } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { evidenceOf, isUnknownFlag } from "./guard.ts";
import { type Case, type Raw, casesOf, makeRow, parseQrels, parseQueries, scoreQuery } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { runCollection } from "./run.ts";
import { SYSTEMS, summarizeRows } from "./score.ts";

const DATED = join(import.meta.dir, "..", "assets", "dated");
const load = (dir: string) => {
  const queries = parseQueries(readFileSync(join(dir, "queries.jsonl"), "utf8"));
  const qrels = parseQrels(readFileSync(join(dir, "qrels.jsonl"), "utf8"));
  return { queries, qrels, cases: casesOf(queries, qrels) };
};

/** The date a note has for a filter: its observed date, else its updated date. The same rule as akm#1228. */
function dateOf(ref: string): string {
  const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(DATED, "library", `${ref}.md`), "utf8"))?.[1] ?? "";
  const field = (name: string) => new RegExp(`^${name}: (\\d{4}-\\d{2}-\\d{2})$`, "m").exec(front)?.[1];
  const date = field("observed") ?? field("updated");
  if (!date) throw new Error(`${ref} has no observed or updated date`);
  return date;
}
const inWindow = (date: string, args: string[]): boolean => {
  const at = (flag: string) => args[args.indexOf(flag) + 1];
  const since = args.includes("--since") ? at("--since") : undefined;
  const until = args.includes("--until") ? at("--until") : undefined;
  return (since === undefined || date >= since) && (until === undefined || date <= until);
};

describe("the dated set", () => {
  const { cases } = load(DATED);
  const filters = cases.filter((c) => c.kind === "filter");
  const ties = cases.filter((c) => c.kind === "tiebreak");

  test("has filter, tie-break and control queries, and only the filter queries carry searchArgs", () => {
    expect(new Set(cases.map((c) => c.kind))).toEqual(new Set(["filter", "tiebreak", "control"]));
    expect(cases.filter((c) => c.searchArgs !== undefined).map((c) => c.kind)).toEqual(filters.map(() => "filter"));
    for (const c of filters) expect(c.searchArgs!.every((a) => !a.startsWith("--") || a === "--since" || a === "--until")).toBe(true);
  });

  test("every filter query has one sentinel, a banned asset outside its window; its relevant assets are inside", () => {
    expect(filters.length).toBeGreaterThanOrEqual(6);
    for (const c of filters) {
      expect(c.sentinels).toHaveLength(1);
      expect(c.banned).toContain(c.sentinels![0]);
      expect(c.grades[c.sentinels![0]]).toBe(0);
      for (const ref of c.banned) expect(inWindow(dateOf(ref), c.searchArgs!)).toBe(false);
      const relevant = Object.entries(c.grades).filter(([, g]) => g >= 2);
      expect(relevant.length).toBeGreaterThan(0);
      for (const [ref] of relevant) expect(inWindow(dateOf(ref), c.searchArgs!)).toBe(true);
    }
  });

  test("uses both flags, a note observed earlier than it was updated, and a note with an updated date only", () => {
    const flags = new Set(filters.flatMap((c) => c.searchArgs!.filter((a) => a.startsWith("--"))));
    expect(flags).toEqual(new Set(["--since", "--until"]));
    expect(filters.some((c) => c.searchArgs!.length === 4)).toBe(true);
    // d01: banned only because the filter reads the observed date (2025-11-03), not the updated date (2026-09-20).
    const trap = readFileSync(join(DATED, "library", "memories", "pager-handoff-autumn-trial.md"), "utf8");
    expect(trap).toContain("observed: 2025-11-03");
    expect(trap).toContain("updated: 2026-09-20");
    expect(readFileSync(join(DATED, "library", "knowledge", "backup-retention-policy.md"), "utf8")).not.toContain("observed:");
  });

  test("a tie-break query grades the newer version 3 and bans the older one, which has the earlier date", () => {
    expect(ties.length).toBeGreaterThanOrEqual(4);
    for (const c of ties) {
      expect(c.searchArgs).toBeUndefined();
      const newer = Object.keys(c.grades).filter((r) => c.grades[r] === 3);
      expect(newer).toHaveLength(1);
      expect(c.banned).toHaveLength(1);
      expect(dateOf(c.banned[0]) < dateOf(newer[0])).toBe(true);
    }
  });

  test("controls have a note that carries no date", () => {
    for (const c of cases.filter((x) => x.kind === "control")) {
      const top = Object.keys(c.grades).find((r) => c.grades[r] === 3)!;
      expect(readFileSync(join(DATED, "library", `${top}.md`), "utf8")).not.toMatch(/^(observed|updated|created):/m);
    }
  });

  test("parseQrels accepts a sentinel only on a banned pair", () => {
    const row = { id: "d", ref: "a/x", grade: 0, reason: "r" };
    expect(parseQrels(JSON.stringify({ ...row, banned: true, sentinel: true }))[0].sentinel).toBe(true);
    expect(() => parseQrels(JSON.stringify({ ...row, sentinel: true }))).toThrow('"sentinel" that is not true on a banned pair');
    expect(() => parseQrels(JSON.stringify({ ...row, banned: true, sentinel: false }))).toThrow('"sentinel" that is not true on a banned pair');
  });

  test("a case's labels change with its sentinels, and the public sets' labels do not carry the field", () => {
    const [c] = filters;
    expect(MEASUREMENT.labels(c)).toMatchObject({ sentinels: c.sentinels });
    const { sentinels: _s, ...plain } = c;
    expect(MEASUREMENT.labels(plain as Case)).not.toHaveProperty("sentinels");
  });
});

// --- scoring a filter query ---------------------------------------------------------------------------------------

const OLD = "memories/pager-2025";
const NEW = "memories/pager-2026";
const FILTER: Case = { id: "f1", query: "pager", kind: "filter", grades: { [NEW]: 3, [OLD]: 0 }, banned: [OLD], searchArgs: ["--since", "2026-06-01"], sentinels: [OLD] };
const PLAIN: Case = { id: "c1", query: "wifi", kind: "control", grades: { "k/wifi": 3 }, banned: [] };
const answer = (refs: string[], error?: string) => ({ refs, seconds: 0.1, ...(error ? { error } : {}) });
const rawOf = (refs: string[], error?: string): Raw => ({ search: answer(refs, error), curate: answer([NEW, OLD]) });
const REFUSED = `akm search exited 2: {\n  "ok": false,\n  "error": "Unknown flag \\"--since\\".",\n  "code": "UNKNOWN_FLAG"\n}`;

describe("the sentinel guard on rows", () => {
  test("a filter that was applied: the sentinel is absent, the row is scored, and nothing is unsupported", () => {
    const rows = [makeRow(FILTER, rawOf([NEW])), makeRow(PLAIN, { search: answer(["k/wifi"]), curate: answer(["k/wifi"]) })];
    expect(evidenceOf(rows[0], "search")).toBeNull();
    const s = summarizeRows(rows) as any;
    expect(s.unsupported).toEqual({ search: 0, curate: 0 });
    expect(s.unsupported_reason).toBeNull();
    expect(s.metrics.search.n).toBe(2);
    expect(s.by_kind.filter.search).toMatchObject({ n: 1, ndcg_10: 1, success_5: 1, banned_above: 0, banned_above_first: 0 });
    expect(s.by_kind.control.search.n).toBe(1);
  });

  test("a filter that was ignored: the sentinel comes back, the filter row is flagged and left out of the metrics, the control is kept", () => {
    const rows = [makeRow(FILTER, rawOf([OLD, NEW])), makeRow(PLAIN, { search: answer(["k/wifi"]), curate: answer(["k/wifi"]) })];
    expect(evidenceOf(rows[0], "search")).toBe(`f1: the out-of-window sentinel ${OLD} came back`);
    const s = summarizeRows(rows) as any;
    expect(s.unsupported).toEqual({ search: 1, curate: 0 });
    expect(s.unsupported_reason).toContain(`the out-of-window sentinel ${OLD} came back`);
    expect(s.metrics.search.n).toBe(1); // only the control
    expect(s.by_kind.filter.search.n).toBe(0);
    expect(s.by_kind.control.search).toMatchObject({ n: 1, ndcg_10: 1 });
    expect(s.status).toBe("complete");
  });

  test("a build that refuses the flag: the call is unsupported, not an errored call, and a semantic column does not abort the run", () => {
    expect(isUnknownFlag(REFUSED)).toBe(true);
    expect(isUnknownFlag("akm search exited 70: boom")).toBe(false);
    const raw: Raw = { search: answer([], REFUSED), curate: answer([NEW, OLD]), semantic_search: answer([], REFUSED), semantic_curate: answer([NEW, OLD]) };
    const row = makeRow(FILTER, raw);
    expect(row.search).toMatchObject({ unsupported: true, error: REFUSED });
    expect(row.search?.scores).toBeUndefined();
    const s = summarizeRows([row]) as any;
    expect(s).toMatchObject({ status: "complete", aborted_reason: null, n_errored: 0, errored: { search: 0, curate: 0, semantic_search: 0, semantic_curate: 0 }, unsupported: { search: 1, curate: 0, semantic_search: 1, semantic_curate: 0 } });
    expect(s.unsupported_reason).toContain("akm refused the flag (--since 2026-06-01)");
  });

  test("an unrelated failure of a filter query is still an error", () => {
    const row = makeRow(FILTER, rawOf([], "akm search exited 70: boom"));
    expect(row.search?.unsupported).toBeUndefined();
    const s = summarizeRows([row]) as any;
    expect(s.errored.search).toBe(1);
    expect(s.unsupported_reason).toBeNull();
  });

  test("a build that fails to apply one filter query makes every filter query of the column unsupported", () => {
    const g2: Case = { ...FILTER, id: "f2" };
    const rows = [makeRow(FILTER, rawOf([NEW])), makeRow(g2, rawOf([OLD, NEW]))];
    const s = summarizeRows(rows) as any;
    expect(s.unsupported.search).toBe(2);
    expect(s.metrics.search.n).toBe(0);
  });

  test("curate does not take searchArgs, so a filter query is not scored there", () => {
    const row = makeRow(FILTER, rawOf([NEW]));
    expect(row.curate?.scores).toBeUndefined();
    expect(row.search?.scores).toBeDefined();
    expect((summarizeRows([row]) as any).metrics.curate.n).toBe(0);
  });

  test("a set without sentinels is summarised as before: no unsupported, no by_kind", () => {
    const s = summarizeRows([makeRow(PLAIN, { search: answer(["k/wifi"]), curate: answer(["k/wifi"]) })]);
    expect(s).not.toHaveProperty("unsupported");
    expect(s).not.toHaveProperty("by_kind");
    expect(Object.keys(makeRow({ ...FILTER, sentinels: undefined }, rawOf([NEW])))).not.toContain("sentinels");
  });

  test("the guard reads only rows, so a stored run is judged again by rescoring", () => {
    const stored = JSON.parse(JSON.stringify(makeRow(FILTER, rawOf([OLD, NEW]))));
    expect((summarizeRows([stored]) as any).unsupported.search).toBe(1);
    expect(SYSTEMS).toContain("semantic_search");
  });
});

describe("tie-break scoring", () => {
  const grades = { [NEW]: 3 };
  const banned = [OLD];
  test("the newer version first scores 1 and keeps the older below it", () => {
    expect(scoreQuery(grades, [NEW, OLD], banned)).toMatchObject({ ndcg_10: 1, mrr: 1, success_5: true, banned_above_first: false });
  });
  test("the older version first loses rank and is counted above the first relevant asset", () => {
    const s = scoreQuery(grades, [OLD, NEW], banned);
    expect(s.banned_above_first).toBe(true);
    expect(s.mrr).toBe(0.5);
    expect(s.ndcg_10).toBeCloseTo(1 / Math.log2(3), 3);
  });
  test("the tie-break queries of a run are summarised apart from the filter queries", () => {
    const tie: Case = { id: "t1", query: "laptops", kind: "tiebreak", grades, banned };
    const s = summarizeRows([makeRow(tie, { search: answer([OLD, NEW]), curate: answer([OLD, NEW]) }), makeRow(FILTER, rawOf([NEW]))]) as any;
    expect(s.by_kind.tiebreak.search).toMatchObject({ n: 1, mrr: 0.5, banned_above_first: 1 });
    expect(s.by_kind.tiebreak.curate.n).toBe(1);
    expect(s.by_kind.filter.curate.n).toBe(0);
  });
});

// --- a run against a fake akm --------------------------------------------------------------------------------------

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Behaviour = "applies" | "ignores" | "refuses";
/** An akm with two notes on one topic. "applies" honours --since by the notes' observed dates, "ignores" answers every search as if the flag were not there, and "refuses" exits 2 as akm 0.10.261022 does. */
const fakeAkm = (behaviour: Behaviour) => `
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version") { console.log("0.0.0-fake"); process.exit(0); }
if (cmd === "search" && rest[0] === "--help") { console.log("--detail=<detail> Detail level, or agent"); process.exit(0); }
if (cmd === "index") { const n = readdirSync(process.env.AKM_BUNDLE_DIR).length; console.log(JSON.stringify({ ok: true, totalEntries: n, verification: { embeddingCount: 0, message: "" } })); process.exit(0); }
const since = rest.indexOf("--since") >= 0 ? rest[rest.indexOf("--since") + 1] : undefined;
const query = rest[rest.indexOf("--") + 1];
const notes = { "memories/pager-2025": "2025-03-10", "memories/pager-2026": "2026-08-18" };
let refs = query === "pager" ? Object.keys(notes) : ["knowledge/wifi"];
if (since && ${JSON.stringify(behaviour)} === "refuses") { console.log(JSON.stringify({ ok: false, error: 'Unknown flag "--since".', code: "UNKNOWN_FLAG" })); process.exit(2); }
if (since && ${JSON.stringify(behaviour)} === "applies") refs = refs.filter((r) => notes[r] >= since);
const hits = refs.map((ref) => ({ ref }));
console.log(JSON.stringify(cmd === "search" ? { hits, searchMode: "keyword" } : { items: hits, searchMode: "keyword" }));
`;

function setup(behaviour: Behaviour) {
  const root = mkdtempSync(join(tmpdir(), "retrieval-guard-"));
  dirs.push(root);
  const library = join(root, "library");
  mkdirSync(library);
  writeFileSync(join(library, "README.md"), "x\n");
  const assets = join(root, "assets");
  mkdirSync(assets);
  const queries = [
    { id: "f1", query: "pager", kind: "filter", searchArgs: ["--since", "2026-06-01"] },
    { id: "c1", query: "wifi", kind: "control" },
  ];
  const row = (id: string, ref: string, grade: number, extra: object = {}) => ({ id, ref, grade, reason: "r", ...extra });
  const qrels = [row("f1", "memories/pager-2026", 3), row("f1", "memories/pager-2025", 0, { banned: true, sentinel: true }), row("c1", "knowledge/wifi", 3)];
  writeFileSync(join(assets, "queries.jsonl"), `${queries.map((q) => JSON.stringify(q)).join("\n")}\n`);
  writeFileSync(join(assets, "qrels.jsonl"), `${qrels.map((q) => JSON.stringify(q)).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, fakeAkm(behaviour));
  process.env.AKM_BIN = commandLine(["bun", script]);
  const ctx = { label: "t", semantic: false, newSandbox: () => ({ ...createSandbox("retrieval-guard"), cmd: ["bun", script] }) };
  return { ctx, folders: { library, assets, results: join(root, "results") } };
}
const OWN: ResolvedCorpus = { name: "custom", folder: "/nowhere", rewrite: false, seed: null, flag: "--cases" };
const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};
const callerAkmBin = process.env.AKM_BIN;
afterEach(() => {
  if (callerAkmBin === undefined) delete process.env.AKM_BIN;
  else process.env.AKM_BIN = callerAkmBin;
});

describe("runCollection on the three kinds of build", () => {
  test("a build that applies --since: the filter query is scored, nothing is unsupported", async () => {
    const { ctx, folders } = setup("applies");
    const s = await quiet(() => runCollection(OWN, "own", ctx, folders));
    expect(s).toMatchObject({ status: "complete", unsupported: { search: 0, curate: 0 }, unsupported_reason: null, n_errored: 0 });
    expect(s.by_kind?.filter.search).toMatchObject({ n: 1, ndcg_10: 1, banned_above_first: 0 });
    expect(s.metrics.search.n).toBe(2);
  });

  test("a build that ignores --since: the sentinel comes back and the filter query is left out of the metrics", async () => {
    const { ctx, folders } = setup("ignores");
    const s = await quiet(() => runCollection(OWN, "own", ctx, folders));
    expect(s.unsupported).toEqual({ search: 1, curate: 0 });
    expect(s.unsupported_reason).toContain("memories/pager-2025 came back");
    expect(s.metrics.search.n).toBe(1);
    expect(s.by_kind?.filter.search.n).toBe(0);
    const stored = JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"));
    expect(stored.unsupported).toEqual({ search: 1, curate: 0 });
  });

  test("a build that refuses --since: the call is unsupported and is not an error", async () => {
    const { ctx, folders } = setup("refuses");
    const s = await quiet(() => runCollection(OWN, "own", ctx, folders));
    expect(s).toMatchObject({ status: "complete", n_errored: 0, errored: { search: 0, curate: 0 }, unsupported: { search: 1, curate: 0 } });
    expect(s.unsupported_reason).toContain("akm refused the flag (--since 2026-06-01)");
    expect(s.metrics.search.n).toBe(1);
    const rows = readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[0].search).toMatchObject({ unsupported: true });
    expect(rows[0].search.error).toContain("UNKNOWN_FLAG");
  });
});
