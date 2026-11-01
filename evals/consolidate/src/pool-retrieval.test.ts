import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../lib/akm/akm.ts";
import { sha256Json } from "../../../lib/provenance.ts";
import { type Phase, type PoolQuery, type QueryAnswers, type RetrievalRaw, loadPool, loadPoolQueries, poolCases, retrievalSummary } from "./pool.ts";
import { runPool } from "./run.ts";

const POOL_DIR = join(import.meta.dir, "..", "assets", "pool");
const pool = loadPool(POOL_DIR);
const queries = loadPoolQueries(POOL_DIR, pool);

describe("the pool's queries", () => {
  test("cover every cluster, in the retrieval eval's format with the cluster on each query", () => {
    expect(queries).toHaveLength(64);
    expect(new Set(queries.map((q) => q.cluster))).toEqual(new Set(pool.clusters.map((c) => c.id)));
    const kind = (k: string) => queries.filter((q) => pool.clusters.find((c) => c.id === q.cluster)?.kind === k).length;
    expect({ duplicate: kind("duplicate"), triple: kind("triple"), subsumed: kind("subsumed"), supersedes: kind("supersedes"), single: kind("single") }).toEqual({ duplicate: 7, triple: 2, subsumed: 5, supersedes: 10, single: 16 });
  });

  test("ban the older note of a supersedes pair and the smaller of a subsumed one, grade the successor 3, and include a query worded like the stale note for every supersedes pair", () => {
    for (const c of pool.clusters.filter((x) => x.kind === "supersedes" || x.kind === "subsumed")) {
      const mine = queries.filter((q) => q.cluster === c.id);
      const [retirable] = Object.keys(c.retire) as [string];
      const [successor] = c.retire[retirable] as [string];
      for (const q of mine) {
        expect(q.banned).toEqual([`memories/${retirable}`]);
        expect(q.grades[`memories/${successor}`]).toBe(3);
        expect(q.grades[`memories/${retirable}`]).toBe(0);
      }
      if (c.kind === "supersedes") expect(mine.map((q) => q.kind).sort()).toEqual(["current", "stale"]);
    }
  });

  test("ask for a claim only one note of a control cluster holds, in one query for each note that has one, so retiring either loses a recall", () => {
    for (const c of pool.clusters.filter((x) => ["overlap", "contradicts", "lookalike"].includes(x.kind))) {
      const mine = queries.filter((q) => q.cluster === c.id);
      expect(mine).toHaveLength(c.notes.length);
      expect(mine.map((q) => c.notes.find((n) => q.grades[`memories/${n}`] === 3)).sort()).toEqual([...c.notes].sort());
      for (const q of mine) expect(q.banned).toEqual([]);
    }
  });

  test("are refused when they do not fit the pool: an unknown cluster, a note of another cluster, a ban the cluster does not allow, a cluster with no query", () => {
    const root = mkdtempSync(join(tmpdir(), "pool-queries-"));
    try {
      const make = (edit: (queries: any[], qrels: any[]) => void) => {
        const dir = join(root, String(readdirSync(root).length));
        cpSync(POOL_DIR, dir, { recursive: true });
        const qs = readFileSync(join(dir, "queries.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
        const rs = readFileSync(join(dir, "qrels.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
        edit(qs, rs);
        writeFileSync(join(dir, "queries.jsonl"), qs.map((x) => JSON.stringify(x)).join("\n") + "\n");
        writeFileSync(join(dir, "qrels.jsonl"), rs.map((x) => JSON.stringify(x)).join("\n") + "\n");
        return dir;
      };
      expect(() => loadPoolQueries(make((qs) => void (qs[0].cluster = "nowhere-01")), pool)).toThrow('names the cluster "nowhere-01"');
      expect(() => loadPoolQueries(make((_q, rs) => void (rs[0].ref = "memories/harrow-coffee-rota")), pool)).toThrow("which is not a note of duplicate-01");
      expect(() => loadPoolQueries(make((_q, rs) => void rs.push({ id: "overlap-01-a", ref: "memories/vantage-report-export-notes", grade: 0, banned: true, reason: "x" })), pool)).toThrow("bans memories/vantage-report-export-notes, which overlap-01 does not allow to retire");
      expect(() => loadPoolQueries(make((qs, rs) => void (qs.splice(0, 1), rs.splice(0, 2))), pool)).toThrow("duplicate-01 has no query");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// --- the scorer ----------------------------------------------------------------------------------------------------------

const q = (id: string, cluster: string, grades: Record<string, number>, banned: string[] = []): PoolQuery => ({ id, cluster, query: id, kind: "t", grades, banned });
const ans = (...refs: string[]) => ({ search: { refs, seconds: 0.1 }, curate: { refs, seconds: 0.1 } });
const same = (a: ReturnType<typeof ans>) => ({ before: a, noop: a, after_accept: a, after: a });

describe("retrievalSummary", () => {
  // supersedes-01: the older note outranks the newer before the accept and after_accept (the index is stale), and is gone after the reindex. single-01 is a control and must stay found.
  const small = { clusters: pool.clusters.filter((c) => ["supersedes-01", "single-01"].includes(c.id)) };
  const qs = [q("s", "supersedes-01", { "memories/quillon-cache-ttl-current": 3, "memories/quillon-cache-ttl": 0 }, ["memories/quillon-cache-ttl"]), q("c", "single-01", { "memories/harrow-coffee-rota": 3 })];
  const stale = ans("memories/quillon-cache-ttl", "memories/quillon-cache-ttl-current");
  const fixed = ans("memories/quillon-cache-ttl-current");
  const raw: RetrievalRaw = {
    accepted: [{ retiredRef: "memories/quillon-cache-ttl", successorRef: "memories/quillon-cache-ttl-current" }],
    seconds: { baseline: 1 },
    rows: [
      { id: "s", cluster: "supersedes-01", phases: { before: stale, noop: stale, after_accept: stale, after: fixed } },
      { id: "c", cluster: "single-01", phases: same(ans("memories/harrow-coffee-rota")) },
    ],
  };

  test("measures the retire and control queries in every phase, with the banned note above the first relevant one before the reindex and not after", () => {
    const s = retrievalSummary(small, qs, raw);
    for (const p of ["before", "noop", "after_accept"] as Phase[]) expect(s.phases[p].search.retire).toMatchObject({ n: 1, mrr: 0.5, success_5: 1, banned_above_first: 1 });
    expect(s.phases.after.search.retire).toMatchObject({ mrr: 1, banned_above_first: 0 });
    expect(s.phases.after.curate.retire).toMatchObject({ mrr: 1, banned_above_first: 0 });
    for (const p of ["before", "after"] as Phase[]) expect(s.phases[p].search.control).toMatchObject({ n: 1, mrr: 1, success_5: 1, banned_above_first: null });
    expect(Object.keys(s.phases.before.search.kinds)).toEqual(["supersedes", "single"]);
  });

  test("reports ndcg_10 for the control queries and not for the retire queries, in their kinds either", () => {
    const s = retrievalSummary(small, qs, raw);
    expect(s.phases.before.search.retire).not.toHaveProperty("ndcg_10");
    expect(s.phases.before.search.kinds.supersedes).not.toHaveProperty("ndcg_10");
    expect(s.phases.before.search.control).toHaveProperty("ndcg_10", 1);
    expect(s.phases.before.search.kinds.single).toHaveProperty("ndcg_10", 1);
    expect(s.delta.after.search.retire).not.toHaveProperty("ndcg_10");
    expect(s.delta.after.search.control).toHaveProperty("ndcg_10", 0);
  });

  test("gives each phase's delta against before: about 0 for the no-op control and the accept before the reindex, and the gain after it", () => {
    const { delta } = retrievalSummary(small, qs, raw);
    expect(delta.noop.search.retire).toEqual({ mrr: 0, success_5: 0, banned_above_first: 0 });
    expect(delta.after_accept.search.retire).toEqual({ mrr: 0, success_5: 0, banned_above_first: 0 });
    expect(delta.after.search.retire).toMatchObject({ mrr: 0.5, banned_above_first: -1 });
    expect(delta.after.search.control).toEqual({ mrr: 0, success_5: 0, ndcg_10: 0, banned_above_first: null });
  });

  test("counts the accepted retirements whose retired note a query of their cluster still returns, and how the labels judge them", () => {
    const s = retrievalSummary(small, qs, raw);
    expect(s.retired_ref_returned.before.search).toEqual({ returned: 1, of: 1, rate: 1 });
    expect(s.retired_ref_returned.after_accept.curate).toEqual({ returned: 1, of: 1, rate: 1 }); // the gap of akm#1307: accepted, not reindexed
    expect(s.retired_ref_returned.after.search).toEqual({ returned: 0, of: 1, rate: 0 });
    expect(s.accepted).toEqual({ n: 1, safe: 1, unsafe: 0, wrong_successor: 0 });
    const none = retrievalSummary(small, qs, { ...raw, accepted: [] });
    expect(none.retired_ref_returned.after.search).toEqual({ returned: 0, of: 0, rate: null });
    const unsafe = retrievalSummary(small, qs, { ...raw, accepted: [{ retiredRef: "memories/quillon-cache-ttl-current", successorRef: "memories/quillon-cache-ttl" }, { retiredRef: "bundle//memories/quillon-cache-ttl", successorRef: "memories/harrow-coffee-rota" }] });
    expect(unsafe.accepted).toEqual({ n: 2, safe: 0, unsafe: 1, wrong_successor: 1 });
  });

  test("leaves a failed call out of its own command's means and no other's", () => {
    const failing: QueryAnswers[] = [{ id: "s", cluster: "supersedes-01", phases: { ...raw.rows[0]!.phases, before: { search: { refs: [], seconds: 0, error: "akm search exited 1" }, curate: stale.curate } } }, raw.rows[1]!];
    const s = retrievalSummary(small, qs, { ...raw, rows: failing });
    expect(s.phases.before.search.retire).toMatchObject({ n: 0, errored: 1, mrr: null });
    expect(s.phases.before.curate.retire).toMatchObject({ n: 1, errored: 0, mrr: 0.5 });
    expect(s.phases.before.search.control).toMatchObject({ n: 1, errored: 0 });
    // a retirement whose queries all failed is not known to be gone: it is left out of the rate, not counted as not returned
    expect(s.retired_ref_returned.before.search).toEqual({ returned: 0, of: 0, rate: null });
    expect(s.retired_ref_returned.before.curate).toEqual({ returned: 1, of: 1, rate: 1 });
  });
});

// --- the pool run with a fake akm ------------------------------------------------------------------------------------

// An akm with a memory of its own. `index` snapshots the notes of the bundle; search and curate answer from the snapshot, ranking by the query words a note holds; `improve` stages the
// retirements of FAKE_RETIRE ("old>new,..."), and counts the searches this sandbox has had so far (consolidate's continuity check reads them); `proposal drain` accepts the staged ones and
// deletes the retired files, but does not reindex, as akm 0.10 does not (akm#1307). FAKE_COMMANDS_LOG logs every command with the data folder of the sandbox that ran it.
const FAKE_AKM = `
import { appendFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const [cmd, sub] = args;
const data = process.env.AKM_DATA_DIR;
const bundle = join(process.env.AKM_BUNDLE_DIR, "memories");
if (process.env.FAKE_COMMANDS_LOG) appendFileSync(process.env.FAKE_COMMANDS_LOG, JSON.stringify({ args, data }) + "\\n");
const proposals = join(process.env.AKM_STATE_DIR, "proposals.json");
const searches = join(data, "usage_events.log");
const snapshot = join(data, "index.json");
const json = (o) => console.log(JSON.stringify(o));
const read = (f, fallback) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : fallback);
if (cmd === "--version") { console.log("akm 0.10.99-test"); process.exit(0); }
if (cmd === "search" && args.includes("--help")) { console.log("Usage: akm search [--detail agent]"); process.exit(0); }
if (cmd === "index") {
  if (process.env.FAKE_INDEX_FAIL_ON === "second" && existsSync(snapshot) && args.includes("--full") && process.env.FAKE_AFTER_IMPROVE && existsSync(join(data, "improved"))) { console.error("index crashed"); process.exit(70); }
  const notes = readdirSync(bundle).filter((f) => f.endsWith(".md")).map((f) => ({ name: f.slice(0, -3), text: readFileSync(join(bundle, f), "utf8").toLowerCase() }));
  writeFileSync(snapshot, JSON.stringify(notes));
  json({ ok: true, totalEntries: notes.length, verification: { embeddingCount: notes.length } });
} else if (cmd === "search" || cmd === "curate") {
  appendFileSync(searches, args.join(" ") + "\\n");
  if (process.env.FAKE_SEARCH_FAIL) { console.error("search crashed"); process.exit(70); }
  const query = args[args.indexOf("--") + 1].toLowerCase();
  const words = [...new Set(query.split(/[^a-z0-9]+/).filter((w) => w.length >= 3))];
  const ranked = read(snapshot, []).map((n) => ({ ...n, score: words.filter((w) => n.text.includes(w)).length })).filter((n) => n.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 10);
  const rows = ranked.map((n) => ({ ref: "memories/" + n.name, type: "memory", name: n.name }));
  json(cmd === "search" ? { hits: rows, searchMode: "semantic" } : { items: rows, searchMode: "semantic" });
} else if (cmd === "improve") {
  if (process.env.FAKE_CRASH) { console.error("boom"); process.exit(70); }
  const seen = existsSync(searches) ? readFileSync(searches, "utf8").trim().split("\\n").filter(Boolean).length : 0;
  writeFileSync(join(data, "improved"), "1");
  const retire = (process.env.FAKE_RETIRE ?? "halbrook-deploy-freeze>halbrook-freeze-rules,quillon-cache-ttl>quillon-cache-ttl-current").split(",").filter(Boolean).map((p) => p.split(">"));
  writeFileSync(proposals, JSON.stringify(retire.map(([o, n]) => ({ id: "p-" + o, status: "pending", source: "consolidate-pair", gateDecision: { outcome: "staged" }, retirement: { retiredRef: "memories/" + o, successorRef: "memories/" + n, judgeLabel: "duplicate", judgeReason: "same", onlyInRetired: [], onlyInSuccessor: [] } }))));
  json({ ok: true, consolidation: { totalChunks: 1, warnings: ["searches seen by improve: " + seen], pairPass: { initiators: 80, pairsConsidered: retire.length, pairsJudged: retire.length, failedJudgments: 0, labelCounts: { duplicate: retire.length } } }, usageReport: { byProcessEngineModel: [{ model: "fake-served", calls: 3, failures: 0 }] } });
} else if (cmd === "proposal" && sub === "list") {
  const status = args.includes("--status") ? args[args.indexOf("--status") + 1] : "pending";
  json({ totalCount: 0, proposals: read(proposals, []).filter((p) => p.status === status) });
} else if (cmd === "proposal" && sub === "drain") {
  if (process.env.FAKE_DRAIN_FAIL) { console.error("drain crashed"); process.exit(70); }
  const all = read(proposals, []);
  const promoted = [];
  for (const p of all) if (p.status === "pending" && p.gateDecision?.outcome === "staged") {
    p.status = "accepted";
    promoted.push(p.id);
    rmSync(join(bundle, p.retirement.retiredRef.replace(/^memories\\//, "") + ".md"));
  }
  writeFileSync(proposals, JSON.stringify(all));
  json({ ok: true, promoted, rejected: [], deferred: [], failed: [] });
} else process.exit(1);
`;

describe("runPool with queries", () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), "pool-retrieval-"));
    const script = join(root, "fake-akm.ts");
    writeFileSync(script, FAKE_AKM);
    const log = join(root, "commands.jsonl");
    process.env.FAKE_COMMANDS_LOG = log;
    const newSandbox = () => ({ ...createSandbox("consolidate-pool-retrieval-test", { keepModelKey: true }), cmd: ["bun", script] });
    const ctx = { newSandbox, baseUrl: "http://localhost:1/v1", model: "the-model", hasKey: false, version: "0.10.99-test", overrides: { strategy: "consolidate", configPatch: null } };
    const commands = (): { args: string[]; data: string }[] => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
    return { root, ctx, commands, clear: () => rmSync(log, { force: true }) };
  };
  const quiet = async <T,>(f: () => Promise<T>): Promise<T> => {
    const log = console.log;
    console.log = () => {};
    try {
      return await f();
    } finally {
      console.log = log;
    }
  };
  const done = (root: string) => {
    delete process.env.FAKE_COMMANDS_LOG;
    for (const k of ["FAKE_RETIRE", "FAKE_DRAIN_FAIL", "FAKE_SEARCH_FAIL", "FAKE_CRASH"]) delete process.env[k];
    rmSync(root, { recursive: true, force: true });
  };
  const folderOf = (summary: { results_dir: string }) => summary.results_dir;
  const stored = (summary: { results_dir: string }) => JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));

  test("measures search and curate in three places: the baseline in a copy of the pool, then the improved sandbox straight after the drain, then after the reindex", async () => {
    const { root, ctx, commands } = setup();
    try {
      const summary = await quiet(() => runPool({ ...ctx, queries, label: "on" }, join(root, "results")));
      const r = stored(summary).retrieval;
      expect(r).toMatchObject({ n_queries: 64, n_retire_queries: 24, n_control_queries: 40, accepted: { n: 2, safe: 2, unsafe: 0, wrong_successor: 0 } });
      // the stale-worded queries rank the older note first until the reindex
      expect(r.phases.before.search.retire.banned_above_first).toBeGreaterThan(0);
      expect(r.phases.after_accept.search.retire).toEqual(r.phases.before.search.retire);
      expect(r.phases.after.search.retire.banned_above_first).toBeLessThan(r.phases.before.search.retire.banned_above_first);
      expect(r.delta.after.search.retire.banned_above_first).toBeLessThan(0);
      // the no-op control: the same queries on the same index
      for (const command of ["search", "curate"]) for (const group of ["retire", "control"]) expect(r.delta.noop[command][group]).toEqual(group === "retire" ? { mrr: 0, success_5: 0, banned_above_first: 0 } : { mrr: 0, success_5: 0, ndcg_10: 0, banned_above_first: null });
      // controls stay findable
      for (const command of ["search", "curate"]) expect(r.delta.after[command].control.success_5).toBe(0);
      // a retired note is still returned straight after the accept, as in akm#1307, and gone after the reindex
      for (const command of ["search", "curate"]) {
        expect(r.retired_ref_returned.before[command]).toEqual({ returned: 2, of: 2, rate: 1 });
        expect(r.retired_ref_returned.after_accept[command]).toEqual({ returned: 2, of: 2, rate: 1 });
        expect(r.retired_ref_returned.after[command]).toEqual({ returned: 0, of: 2, rate: 0 });
      }
      // the existing metrics of the pool are scored from the proposals before the accept
      expect(stored(summary).metrics).toMatchObject({ unsafe: { n: 0, of: 2, staged: 0 }, staged: { n: 2, safe: 2 }, precision: { safe: 2, retired: 2 } });
      // retrieval.json holds the answers: a line for each query, and the accepted retirements
      const file = JSON.parse(readFileSync(join(folderOf(summary), "retrieval.json"), "utf8"));
      expect(file.rows).toHaveLength(64);
      expect(file.accepted.map((a: { retiredRef: string }) => a.retiredRef).sort()).toEqual(["memories/halbrook-deploy-freeze", "memories/quillon-cache-ttl"]);
      expect(Object.keys(file.rows[0].phases)).toEqual(["before", "noop", "after_accept", "after"]);
      expect(stored(summary).manifest.eval_settings).toEqual({ embedder: "deterministic", retrieval: true });
      // no step of the retrieval measurement ran in the sandbox that was improved before the improve did
      const log = commands();
      const improveAt = log.findIndex((c) => c.args[0] === "improve");
      const improved = log[improveAt]!.data;
      const before = log.slice(0, improveAt);
      expect(before.filter((c) => c.args[0] === "search" || c.args[0] === "curate").length).toBeGreaterThan(0);
      expect(before.filter((c) => c.data === improved).map((c) => c.args[0])).toEqual(["index"]); // only the index of the pool itself
      expect(before.filter((c) => c.data !== improved).every((c) => ["index", "search", "curate"].includes(c.args[0] as string))).toBe(true);
      expect(summary.metrics?.warnings).toEqual(["searches seen by improve: 0"]); // the state improve reads is the one it has without queries
    } finally {
      done(root);
    }
  }, 120_000);

  test("the sandbox that is improved gets the commands it always got up to the proposal list, and after it the drain, the accepted list, the queries, a reindex and the queries", async () => {
    const { root, ctx, commands } = setup();
    try {
      await quiet(() => runPool({ ...ctx, queries, label: "on" }, join(root, "results")));
      const log = commands();
      const improved = log.find((c) => c.args[0] === "improve")!.data;
      const mine = log.filter((c) => c.data === improved).map((c) => c.args);
      const kinds = mine.map((a) => (a[0] === "search" || a[0] === "curate" ? a[0] : a.slice(0, 2).join(" ")));
      const collapsed = kinds.filter((k, i) => i === 0 || k !== kinds[i - 1] || !["search", "curate"].includes(k));
      expect(collapsed.slice(0, 3)).toEqual(["index --full", "improve --strategy", "proposal list"]);
      const rest = mine.slice(mine.findIndex((a) => a[0] === "proposal") + 1);
      expect(rest[0]).toEqual(["proposal", "drain", "--promote", "--yes", "--format", "json"]);
      expect(rest[1]).toEqual(["proposal", "list", "--status", "accepted", "--detail", "full", "--format", "json"]);
      expect(rest.filter((a) => a[0] === "index")).toEqual([["index", "--full", "--format", "json"]]);
      const firstAfterReindex = rest.findIndex((a) => a[0] === "index");
      expect(rest.slice(2, firstAfterReindex).every((a) => a[0] === "search" || a[0] === "curate")).toBe(true);
      expect(rest.slice(firstAfterReindex + 1).every((a) => a[0] === "search" || a[0] === "curate")).toBe(true);
      expect(rest.slice(2, firstAfterReindex)).toHaveLength(128); // 64 queries in search and in curate, before the reindex
      expect(rest.slice(firstAfterReindex + 1)).toHaveLength(128);
    } finally {
      done(root);
    }
  }, 120_000);

  test("without queries (--no-retrieval) issues the command sequence the pool run always did and writes nothing of retrieval", async () => {
    const { root, ctx, commands } = setup();
    try {
      const summary = await quiet(() => runPool({ ...ctx, label: "off" }, join(root, "results")));
      expect(commands().map((c) => c.args)).toEqual([
        ["index", "--full", "--format", "json"],
        ["improve", "--strategy", "consolidate", "--no-sync", "--json-to-stdout", "--format", "json"],
        ["proposal", "list", "--detail", "full", "--format", "json"],
      ]);
      expect(new Set(commands().map((c) => c.data)).size).toBe(1);
      const s = stored(summary);
      expect(s).not.toHaveProperty("retrieval");
      expect(s.manifest.eval_settings).toEqual({ embedder: "deterministic" });
      expect(readdirSync(folderOf(summary)).filter((f) => f !== ".running").sort()).toEqual(["improve.json", "samples.jsonl", "summary.json"]);
      // the input digest of every cluster is the one it had before the queries existed
      const old = (c: ReturnType<typeof poolCases>[number]) => sha256Json({ notes: c.notes.map((name) => ({ name, text: c.texts[name], age_days: c.ages[name] })), pool_sha256: c.pool_sha256 });
      for (const c of poolCases(pool)) expect(s.manifest.cases[c.id].input_sha256).toBe(old(c));
    } finally {
      done(root);
    }
  }, 120_000);

  test("the pool's own metrics, rows and proposals are the same with and without queries on the same akm output", async () => {
    const { root, ctx } = setup();
    try {
      const off = await quiet(() => runPool({ ...ctx, label: "off" }, join(root, "results")));
      const on = await quiet(() => runPool({ ...ctx, queries, label: "on" }, join(root, "results")));
      const { retrieval: _r, ...rest } = stored(on);
      const base = stored(off);
      for (const key of ["metrics", "n_run", "n_scored", "n_errored", "n_paired", "served_models", "status", "assets_sha256", "embedder", "n_notes", "n_clusters", "model_calls"]) expect([key, rest[key]]).toEqual([key, base[key]]);
      const rows = (s: { results_dir: string }) => readFileSync(join(s.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => { const { seconds: _s, run, ...row } = JSON.parse(l); return { ...row, run: { ...run, seconds: 0 } }; });
      expect(rows(on)).toEqual(rows(off));
    } finally {
      done(root);
    }
  }, 120_000);

  test("a retirement that is unsafe or to the wrong successor shows in the accepted counts beside the retrieval numbers", async () => {
    const { root, ctx } = setup();
    process.env.FAKE_RETIRE = "quillon-cache-ttl-current>quillon-cache-ttl,halbrook-deploy-freeze>quillon-cache-ttl";
    try {
      const summary = await quiet(() => runPool({ ...ctx, queries, label: "unsafe" }, join(root, "results")));
      const s = stored(summary);
      expect(s.retrieval.accepted).toEqual({ n: 2, safe: 0, unsafe: 1, wrong_successor: 1 });
      expect(s.metrics).toMatchObject({ unsafe: { n: 1, of: 2 }, wrong_successor: 1 });
      // the successor of the supersedes pair is gone after the reindex: the query for it finds nothing relevant and the loss shows
      expect(s.retrieval.delta.after.search.retire.success_5).toBeLessThan(0);
    } finally {
      done(root);
    }
  }, 120_000);

  test("a drain or a search that fails leaves the pool's metrics as they are and says why there are no retrieval numbers", async () => {
    for (const [name, value, reason] of [["FAKE_DRAIN_FAIL", "1", "the retrieval steps after the proposals failed: akm proposal failed (exit 70): drain crashed"], ["FAKE_SEARCH_FAIL", "1", "the baseline of the queries failed"]] as const) {
      const { root, ctx } = setup();
      process.env[name] = value;
      try {
        const summary = await quiet(() => runPool({ ...ctx, queries, label: "failing" }, join(root, "results")));
        const s = stored(summary);
        if (name === "FAKE_SEARCH_FAIL") {
          // a search that errors is an errored call, scored as one; the baseline itself still ran
          expect(s.retrieval).toMatchObject({ n_queries: 64 });
          expect(s.retrieval.phases.before.search.retire.errored).toBe(24);
          // and a retired note that no call could have returned is not counted as gone: the pass criterion of akm#1307 reads after_accept
          for (const p of ["before", "after_accept", "after"]) expect(s.retrieval.retired_ref_returned[p].search).toEqual({ returned: 0, of: 0, rate: null });
        } else {
          expect(s.retrieval).toEqual({ error: expect.stringContaining(reason) });
        }
        expect(s.status).toBe("complete");
        expect(s.metrics.precision).toEqual({ value: 1, safe: 2, retired: 2 });
      } finally {
        done(root);
      }
    }
  }, 120_000);

  test("a pool run whose improve failed asked nothing after it, and the summary says so", async () => {
    const { root, ctx } = setup();
    process.env.FAKE_CRASH = "1";
    try {
      await expect(quiet(() => runPool({ ...ctx, queries, label: "crash" }, join(root, "results")))).rejects.toThrow("the pool run failed");
      const dir = join(root, "results", readdirSync(join(root, "results"))[0] as string);
      const s = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
      expect(s).toMatchObject({ status: "aborted", metrics: null });
      expect(s.retrieval).toEqual({ error: "the pool run failed, so the queries were not asked after it" });
    } finally {
      done(root);
    }
  }, 120_000);
});
