import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../../lib/akm/akm.ts";
import { manifestProblems } from "../../../lib/manifest.ts";
import { clearRunning } from "../../../lib/results.ts";
import { rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { endpointHost, harnessSha256 } from "../../../lib/provenance.ts";
import { assetsDigest } from "./inputs.ts";
import { sandboxOptions } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { runPool } from "./run.ts";
import { rawFromPoolRun, retireProposals, usageRows } from "./collect.ts";
import { KINDS, type Kind, type Pool, POOL_STRATEGY, type PoolRaw, budgetWarnings, clusterRows, judgeRetirement, loadPool, makePoolRow, poolCases, poolFiles, poolImproveArgs, poolMetrics, poolProblems, poolRawOf, poolSummarize, retirementsFrom, usageTotals, writePoolNotes } from "./pool.ts";

const POOL_DIR = join(import.meta.dir, "..", "assets", "pool");
const pool = loadPool(POOL_DIR);
const cluster = (id: string) => pool.clusters.find((c) => c.id === id)!;

describe("the public pool", () => {
  test("is 80 notes in 47 clusters of every kind, each note in one cluster", () => {
    expect(Object.keys(pool.texts)).toHaveLength(80);
    expect(pool.clusters).toHaveLength(47);
    const count = (k: Kind) => pool.clusters.filter((c) => c.kind === k).length;
    expect(Object.fromEntries(KINDS.map((k) => [k, count(k)]))).toEqual({ duplicate: 7, triple: 2, subsumed: 5, supersedes: 5, overlap: 7, contradicts: 2, lookalike: 3, single: 16 });
    expect(pool.clusters.flatMap((c) => c.notes).sort()).toEqual(Object.keys(pool.texts).sort());
    expect(poolProblems(pool)).toEqual([]);
  });

  test("allows the retirements its kind gives, and no others", () => {
    for (const c of pool.clusters) {
      const retirable = Object.keys(c.retire);
      if (c.kind === "duplicate") expect(c.retire).toEqual({ [c.notes[0]]: [c.notes[1]], [c.notes[1]]: [c.notes[0]] });
      else if (c.kind === "triple") for (const n of c.notes) expect(c.retire[n].sort()).toEqual(c.notes.filter((x) => x !== n).sort());
      else if (c.kind === "subsumed" || c.kind === "supersedes") expect(c.retire).toEqual({ [c.notes[0]]: [c.notes[1]] });
      else expect(retirable).toEqual([]);
    }
  });

  test("dates the older note of a supersedes pair 3 days and the newer 1, and has duplicates and subsumed pairs both ways, so the order cannot give the answer", () => {
    for (const c of pool.clusters.filter((x) => x.kind === "supersedes")) {
      expect(pool.ages[c.notes[0]]).toBeGreaterThan(pool.ages[c.notes[1]]);
    }
    for (const kind of ["duplicate", "subsumed"] as const) {
      const olderIsFirst = pool.clusters.filter((c) => c.kind === kind).map((c) => pool.ages[c.notes[0]] > pool.ages[c.notes[1]]);
      expect(olderIsFirst).toContain(true);
      expect(olderIsFirst).toContain(false);
    }
    for (const age of Object.values(pool.ages)) expect([1, 2, 3]).toContain(age); // all within akm's week of new material
  });

  test("holds a claim that is in the note it belongs to and in no other note of its cluster", () => {
    for (const c of pool.clusters.filter((x) => ["subsumed", "supersedes", "overlap", "contradicts", "lookalike"].includes(x.kind))) {
      expect(c.claims.length).toBeGreaterThan(0);
      // a note that may not be retired holds a claim of its own
      if (c.kind === "overlap" || c.kind === "contradicts" || c.kind === "lookalike") for (const n of c.notes) expect(c.claims.some((k) => k.notes.length === 1 && k.notes[0] === n)).toBe(true);
      if (c.kind === "subsumed") expect(c.claims).toHaveLength(1);
    }
  });

  test("holds nothing private: no home path, no address and no real domain", () => {
    const text = Object.values(pool.texts).join("\n") + JSON.stringify(pool.clusters);
    expect(text).not.toContain("/home/");
    expect(text).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(text).not.toMatch(/\b[a-z0-9-]+\.(com|net|org|io|dev|app|ai|co)\b/);
    expect(pool.canary).toContain("CONSOLIDATE CANARY");
  });
});

// akm's deterministic embedder (src/llm/embedders/deterministic.ts) and the text it embeds for a memory (buildSearchText): the
// name, the description, the tags, the name and tags again as aliases, the observed_at hint from the file date, and the body.
// Copied from lib.test.ts, which keeps it to itself.
function hashCosine(a: string, b: string): number {
  const embed = (text: string) => {
    const v = new Array<number>(384).fill(0);
    for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      let h = 0x811c9dc5;
      for (const ch of tok) h = (Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0) >>> 0;
      v[h % 384] += (h >>> 16) & 1 ? 1 : -1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map((x) => x / norm);
  };
  const [x, y] = [embed(a), embed(b)];
  return x.reduce((s, xi, i) => s + xi * y[i], 0);
}

function embedText(name: string, text: string, ageDays: number): string {
  const [, front, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text) as RegExpExecArray;
  const description = /^description: (.*)$/m.exec(front)?.[1] ?? "";
  const tags = (/^tags: \[(.*)\]$/m.exec(front)?.[1] ?? "").replaceAll(",", " ");
  const spaced = name.replace(/[-_]/g, " ");
  const observed = new Date(Date.UTC(2026, 9, 5) - ageDays * 86_400_000).toISOString().slice(0, 10);
  return `${spaced} ${description} ${tags} ${spaced} ${tags} observed_at:${observed} ${body.replace(/```[\s\S]*?```/g, " ")}`;
}

describe("the public pool and akm's embedder", () => {
  const texts = Object.fromEntries(Object.entries(pool.texts).map(([n, t]) => [n, embedText(n, t, pool.ages[n])]));
  const cosine = (a: string, b: string) => hashCosine(texts[a], texts[b]);

  // The pair pass judges a pair only when the cosine is 0.93 or more (all the pool's notes are within a week old). With the
  // deterministic embedder this can be computed here, so the pool pairs what it should.
  test("pairs every two notes of a cluster of two or three, with room above akm's floor of 0.93", () => {
    for (const c of pool.clusters.filter((x) => x.notes.length > 1)) {
      for (const [i, a] of c.notes.entries()) for (const b of c.notes.slice(i + 1)) expect(cosine(a, b)).toBeGreaterThan(0.935);
    }
  });

  test("pairs no two notes of different clusters, so the single notes and the clusters stay apart", () => {
    const names = Object.keys(pool.texts);
    const clusterOf = Object.fromEntries(pool.clusters.flatMap((c) => c.notes.map((n) => [n, c.id])));
    let max = 0;
    for (const [i, a] of names.entries()) {
      for (const b of names.slice(i + 1)) if (clusterOf[a] !== clusterOf[b]) max = Math.max(max, cosine(a, b));
    }
    expect(max).toBeLessThan(0.8);
  });
});

describe("writePoolNotes", () => {
  test("writes every note to bundle/memories with the file time its age gives", () => {
    const dir = mkdtempSync(join(tmpdir(), "pool-test-"));
    try {
      const now = Date.UTC(2026, 9, 9);
      writePoolNotes({ dir, cmd: ["akm"], env: {} }, pool, now);
      const first = pool.clusters[0].notes[0];
      const file = join(dir, "bundle", "memories", `${first}.md`);
      expect(readFileSync(file, "utf8")).toBe(pool.texts[first]);
      expect(statSync(file).mtimeMs).toBe(now - pool.ages[first] * 86_400_000);
      expect(existsSync(join(dir, "bundle", "memories", `${pool.clusters.at(-1)!.notes[0]}.md`))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("poolImproveArgs", () => {
  test("runs one consolidate improve with no sync, and passes akm's budget only when given", () => {
    expect(POOL_STRATEGY).toBe("consolidate");
    expect(poolImproveArgs(POOL_STRATEGY)).toEqual(["improve", "--strategy", "consolidate", "--no-sync", "--json-to-stdout", "--format", "json"]);
    expect(poolImproveArgs("catchup").slice(0, 3)).toEqual(["improve", "--strategy", "catchup"]);
    expect(poolImproveArgs("catchup", 60000).slice(-2)).toEqual(["--timeout-ms", "60000"]);
  });
});

describe("poolProblems", () => {
  const clone = (): Pool => JSON.parse(JSON.stringify(pool));

  test("names a note without a cluster, a retirement outside the cluster and a claim that is not where it says", () => {
    const noCluster = clone();
    noCluster.clusters = noCluster.clusters.filter((c) => c.id !== "single-01");
    expect(poolProblems(noCluster)[0]).toContain("is in no cluster");

    const outside = clone();
    outside.clusters.find((c) => c.id === "duplicate-01")!.retire[outside.clusters[0].notes[0]] = ["harrow-coffee-rota"];
    expect(poolProblems(outside)[0]).toContain("not other notes of the cluster");

    const claim = clone();
    claim.clusters.find((c) => c.id === "overlap-01")!.claims[0].notes = ["vantage-report-export-notes"];
    expect(poolProblems(claim).join("\n")).toMatch(/also in|missing from/);
  });
});

// A run's result as akm prints it, and the proposals it made, for the notes of two clusters.
const retire = (retired: string, successor: string, over: Record<string, unknown> = {}) => ({
  ref: `bundle//memories/${retired}`,
  source: "consolidate-pair",
  retirement: { retiredRef: `memories/${retired}`, successorRef: `memories/${successor}`, judgeLabel: "duplicate", judgeReason: "same claims", onlyInRetired: [], onlyInSuccessor: [] },
  ...over,
});
const listing = (...proposals: unknown[]) => ({ totalCount: proposals.length, proposals });
const improve = (extra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  consolidation: {
    totalChunks: 7,
    failedChunks: 0,
    deferredMemories: 0,
    planned: [{ op: "promote" }, { op: "promote" }],
    warnings: ["Anti-collapse: injected 4 random (non-similarity-driven) cluster member(s) into consolidation pool (fraction=0.05)."],
    pairPass: { initiators: 80, pairsConsidered: 40, pairsJudged: 38, failedJudgments: 2, labelCounts: { duplicate: 10, overlap: 8, unrelated: 3 }, retired: [], ...extra },
    ...over,
  },
  usageReport: {
    byProcessEngineModel: [
      { process: "consolidate", engine: "consolidate", model: "served-a", calls: 60, failures: 1, promptTokens: 1000, completionTokens: 200 },
      { process: "consolidate", engine: "consolidate", model: "served-b", calls: 10, failures: 0, promptTokens: 500, completionTokens: 50 },
    ],
  },
});

/** The raw output of a whole run, as the collector makes it from akm's result. */
const runOf = (result: unknown, proposals: unknown = listing(), seconds = 5) => rawFromPoolRun(pool, result, proposals, seconds).run;

describe("judgeRetirement", () => {
  test("a note the cluster allows is safe for its successor, wrong-successor for any other, and unsafe when it holds a claim of its own", () => {
    const [a, b] = cluster("subsumed-01").notes;
    expect(judgeRetirement(pool, a, b)?.verdict).toBe("safe");
    expect(judgeRetirement(pool, a, "harrow-coffee-rota")?.verdict).toBe("wrong_successor");
    expect(judgeRetirement(pool, a, null)?.verdict).toBe("wrong_successor");
    expect(judgeRetirement(pool, b, a)?.verdict).toBe("unsafe");
    const [x, y] = cluster("overlap-01").notes;
    expect(judgeRetirement(pool, x, y)?.verdict).toBe("unsafe");
    expect(judgeRetirement(pool, "harrow-coffee-rota", y)?.verdict).toBe("unsafe");
    expect(judgeRetirement(pool, "not-a-note", y)).toBeUndefined();
  });

  test("either note of a duplicate is safe for the other", () => {
    const [a, b] = cluster("duplicate-03").notes;
    expect(judgeRetirement(pool, a, b)?.verdict).toBe("safe");
    expect(judgeRetirement(pool, b, a)?.verdict).toBe("safe");
  });
});

describe("retirementsFrom", () => {
  test("reads the retire proposals, with the successor, the label and whether akm staged it, and leaves out promotions", () => {
    const [a, b] = cluster("duplicate-01").notes;
    const rows = retirementsFrom(pool, retireProposals(listing(retire(a, b, { gateDecision: { outcome: "staged" } }), { ref: "bundle//knowledge/x", source: "consolidate" })));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cluster: "duplicate-01", kind: "duplicate", retired: a, successor: b, verdict: "safe", staged: true, judged_as: "duplicate", reason: "same claims" });
  });

  test("throws on a retirement of a note that is not in the pool", () => {
    expect(() => retirementsFrom(pool, retireProposals(listing(retire("stranger", "harrow-coffee-rota"))))).toThrow("not a note of the pool");
  });
});

describe("poolMetrics", () => {
  const [d1a, d1b] = cluster("duplicate-01").notes;
  const [s1a, s1b] = cluster("subsumed-01").notes;
  const [o1a, o1b] = cluster("overlap-01").notes;
  const [t1a, t1b] = cluster("triple-01").notes;

  const proposals = listing(
    retire(d1a, d1b, { gateDecision: { outcome: "staged" } }), // safe, staged
    retire(s1b, s1a, { gateDecision: { outcome: "staged" } }), // the bigger note: unsafe, staged
    retire(o1a, "harrow-coffee-rota"), // unsafe, not staged
    retire(t1a, "harrow-coffee-rota"), // allowed note, successor outside its cluster: wrong successor
  );
  const rows = retirementsFrom(pool, retireProposals(proposals));
  const m = poolMetrics(pool, rows, runOf(improve()));

  test("counts unsafe retirements and how many akm staged, precision, wrong successors and recall over the clusters that have a note to retire", () => {
    expect(m.unsafe).toEqual({ n: 2, of: 4, staged: 1 });
    expect(m.staged).toEqual({ n: 2, safe: 1 });
    expect(m.precision).toEqual({ value: 0.25, safe: 1, retired: 4 });
    expect(m.wrong_successor).toBe(1);
    const withSafe = pool.clusters.filter((c) => Object.keys(c.retire).length > 0).length;
    expect(withSafe).toBe(7 + 2 + 5 + 5);
    expect(m.recall).toEqual({ value: Number((1 / withSafe).toFixed(4)), retired_safe: 1, of: withSafe });
  });

  test("counts per kind, with the clusters akm left alone", () => {
    expect(m.classes.duplicate).toMatchObject({ clusters: 7, with_safe_retirement: 7, hit: 1, retired_safe: 1, untouched: 6 });
    expect(m.classes.subsumed).toMatchObject({ retired_unsafe: 1, hit: 0, untouched: 4 });
    expect(m.classes.overlap).toMatchObject({ retired_unsafe: 1, with_safe_retirement: 0, untouched: 6 });
    expect(m.classes.triple).toMatchObject({ wrong_successor: 1, hit: 0 });
    expect(m.classes.single).toMatchObject({ clusters: 16, untouched: 16 });
    expect(t1b).toBeDefined();
  });

  test("reports pairs, calls, chunks and the anti-collapse warning", () => {
    expect(m.pairs).toEqual({ initiators: 80, judged: 38, considered: 40, failed: 2, labels: { duplicate: 10, overlap: 8, unrelated: 3 } });
    expect(m.calls).toEqual({ calls: 70, failures: 1, prompt_tokens: 1500, completion_tokens: 250 });
    expect(m.chunks).toEqual({ total: 7, failed: 0, deferred_memories: 0, promote_ops: 2 });
    expect(m.anti_collapse_injected).toBe(4);
    expect(m.cold_start_budget).toBeNull();
  });

  test("has no precision or recall to speak of when akm retires nothing, and recall 0", () => {
    const none = poolMetrics(pool, [], runOf(improve()));
    expect(none.precision.value).toBeNull();
    expect(none.recall.value).toBe(0);
    expect(none.unsafe).toEqual({ n: 0, of: 0, staged: 0 });
    expect(none.staged).toEqual({ n: 0, safe: 0 });
  });
});

describe("clusterRows", () => {
  test("is the rows of a pool and its retirements without the raw output, as the fixtures of scripts/compare make them", () => {
    const [a, b] = cluster("duplicate-01").notes;
    const rows = clusterRows(pool, retirementsFrom(pool, retireProposals(listing(retire(a, b))))) as { id: string; outcome: string }[];
    expect(rows).toHaveLength(47);
    expect(rows.find((r) => r.id === "duplicate-01")).toMatchObject({ outcome: "safe" });
    expect(rows.find((r) => r.id === "duplicate-02")).toMatchObject({ outcome: "kept" });
  });
});

describe("budgetWarnings", () => {
  test("reads the anti-collapse count and the cold-start cut from akm's own words, and null when akm said neither", () => {
    expect(
      budgetWarnings([
        "Anti-collapse: injected 4 random (non-similarity-driven) cluster member(s) into consolidation pool (fraction=0.05).",
        "[consolidate] cold-start budget: reducing pool from 80 to 24 memories (2 safe chunks; remainder deferred).",
      ]),
    ).toEqual({ anti_collapse_injected: 4, cold_start_budget: { from: 80, to: 24, safe_chunks: 2 } });
    expect(budgetWarnings(["Pre-flight: filtered 1 stale DB entry"])).toEqual({ anti_collapse_injected: null, cold_start_budget: null });
  });

  test("keeps the cut pool and the deferred memories in the metrics", () => {
    const run = improve({}, { deferredMemories: 56, warnings: ["[consolidate] cold-start budget: reducing pool from 80 to 24 memories (2 safe chunks; remainder deferred)."] });
    const m = poolMetrics(pool, [], runOf(run));
    expect(m.cold_start_budget).toEqual({ from: 80, to: 24, safe_chunks: 2 });
    expect(m.anti_collapse_injected).toBeNull();
    expect(m.chunks.deferred_memories).toBe(56);
    expect(m.warnings).toHaveLength(1);
  });
});

describe("usageTotals", () => {
  test("adds the calls, failures and tokens of every row, and is zero for a report without rows", () => {
    expect(usageTotals(usageRows(improve())).calls).toBe(70);
    expect(usageTotals(usageRows({}))).toEqual({ calls: 0, failures: 0, prompt_tokens: 0, completion_tokens: 0 });
  });
});

describe("the raw output of a pool run, and the rows scored from it", () => {
  const rawOfRun = (result: unknown, proposals: unknown) => {
    const { run, byCluster } = rawFromPoolRun(pool, result, proposals, 5);
    return new Map<string, PoolRaw>(pool.clusters.map((c) => [c.id, { run, retire_proposals: byCluster.get(c.id) ?? [] }]));
  };
  const rowsOf = (raw: Map<string, PoolRaw>) => poolCases(pool).map((c) => makePoolRow(c, raw.get(c.id) as PoolRaw));

  test("puts each retire proposal with the cluster that holds its note, and keeps the refs of those outside the pool", () => {
    const [a, b] = cluster("duplicate-02").notes;
    const [x] = cluster("overlap-02").notes;
    const { run, byCluster } = rawFromPoolRun(pool, improve(), listing(retire(a, b), retire(x, a), retire("stranger", a), { ref: "bundle//knowledge/x", source: "consolidate" }), 7);
    expect(byCluster.get("duplicate-02")).toHaveLength(1);
    expect(byCluster.get("overlap-02")).toHaveLength(1);
    expect([...byCluster.values()].reduce((n, list) => n + list.length, 0)).toBe(2);
    expect(run.outside).toEqual(["memories/stranger"]);
    expect(run).toMatchObject({ seconds: 7, chunks: { totalChunks: 7, failedChunks: 0, deferredMemories: 0, planned: 2 }, pair_pass: { initiators: 80, pairsConsidered: 40, pairsJudged: 38, failedJudgments: 2 } });
  });

  test("a result with no pair pass is an error row for every cluster, and so is a retirement outside the pool", () => {
    const none = rowsOf(rawOfRun({ consolidation: {} }, listing()));
    expect(none).toHaveLength(47);
    expect(none.every((r) => r.outcome === "error" && r.error?.includes("no pair pass"))).toBe(true);
    const stray = rowsOf(rawOfRun(improve(), listing(retire("stranger", "harrow-coffee-rota"))));
    expect(stray.every((r) => r.outcome === "error" && r.error === "akm retired memories/stranger, which is not a note of the pool")).toBe(true);
    expect(poolSummarize(stray)).toMatchObject({ n_errored: 1, n_scored: 0, metrics: null, status: "aborted", aborted_reason: "akm retired memories/stranger, which is not a note of the pool" });
  });

  test("scores a good run, keeps the served model names, and writes one row per cluster with the worst verdict", () => {
    const [a, b] = cluster("duplicate-02").notes;
    const [x] = cluster("overlap-02").notes;
    const rows = rowsOf(rawOfRun(improve(), listing(retire(a, b), retire(x, a))));
    expect(rows).toHaveLength(47);
    expect(rows.find((r) => r.id === "duplicate-02")).toMatchObject({ outcome: "safe" });
    expect(rows.find((r) => r.id === "overlap-02")).toMatchObject({ outcome: "unsafe" });
    expect(rows.find((r) => r.id === "single-03")).toMatchObject({ outcome: "kept", retirements: [] });
    const summary = poolSummarize(rows);
    expect(summary).toMatchObject({ n_run: 1, n_scored: 1, n_errored: 0, n_paired: 38, seconds: 5, status: "complete", aborted_reason: null });
    expect(summary.served_models).toEqual({ "served-a": 59, "served-b": 10 });
    expect(summary.metrics?.unsafe).toEqual({ n: 1, of: 2, staged: 0 });
  });

  test("the rows have the shape the compare tool reads, and the raw output is what a retirement is scored from", () => {
    const [a, b] = cluster("duplicate-02").notes;
    const rows = rowsOf(rawOfRun(improve(), listing(retire(a, b, { gateDecision: { outcome: "staged" } }))));
    const row = rows.find((r) => r.id === "duplicate-02") as (typeof rows)[number];
    expect(row).toMatchObject({ id: "duplicate-02", kind: "duplicate", notes: [a, b], may_retire: [a, b], outcome: "safe" });
    expect(row.retirements).toEqual([{ retired: a, successor: b, verdict: "safe", staged: true, judged_as: "duplicate", reason: "same claims", only_in_retired: [], only_in_successor: [] }]);
    expect(row.retire_proposals).toEqual(retireProposals(listing(retire(a, b, { gateDecision: { outcome: "staged" } }))));
    expect(row.run?.pair_pass).toMatchObject({ pairsJudged: 38 });
    // the stored row is enough to score it again, and gives the same row
    const read = poolRawOf(JSON.parse(JSON.stringify(row)));
    expect("raw" in read && makePoolRow(poolCases(pool).find((c) => c.id === "duplicate-02")!, read.raw)).toEqual(row);
  });

  test("a run that failed gives every cluster its error, and a row that lacks the raw output is refused", () => {
    const failed: PoolRaw = { error: "akm improve timed out after 1.5s", timedOut: true, seconds: 1.5 };
    const rows = poolCases(pool).map((c) => makePoolRow(c, failed));
    expect(rows[0]).toMatchObject({ outcome: "error", error: "akm improve timed out after 1.5s", timed_out: true, run: null, retirements: [] });
    expect(poolSummarize(rows)).toMatchObject({ n_errored: 1, n_scored: 0, timeouts: 1, seconds: 1.5, status: "aborted" });
    expect(poolRawOf(JSON.parse(JSON.stringify(rows[0])))).toEqual({ raw: failed });
    expect(poolRawOf({ id: "duplicate-01", kind: "duplicate", outcome: "safe", retirements: [] })).toEqual({ missing: ["run", "retire_proposals"] });
  });
});

// An akm that records how it was run: the improve arguments and the config patch key, in a warning, and retires the first note of duplicate-01.
const FAKE_AKM = `
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const config = JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8"));
const proposals = join(process.env.AKM_STATE_DIR, "proposals.json");
if (args[0] === "index") {
  const real = process.env.FAKE_EMBEDDER === "real";
  if (process.env.FAKE_EMBEDDER && real !== (config.embedding?.localModel === "Xenova/bge-small-en-v1.5" && !!process.env.HF_HOME && !process.env.AKM_EMBED_DETERMINISTIC)) { console.error("not the embedder the test asked for"); process.exit(3); }
  if (process.env.FAKE_EMBEDDER === "deterministic" && process.env.AKM_EMBED_DETERMINISTIC !== "1") { console.error("no deterministic embedder"); process.exit(3); }
  console.log(JSON.stringify({ ok: true, totalEntries: 80, verification: { embeddingCount: 80 } }));
} else if (args[0] === "improve") {
  if (process.env.FAKE_SLEEP) await Bun.sleep(30000);
  if (process.env.FAKE_CRASH) { console.error("boom"); process.exit(70); }
  writeFileSync(proposals, JSON.stringify([{ id: "p1", ref: "bundle//memories/halbrook-deploy-freeze", source: "consolidate-pair", retirement: { retiredRef: "memories/halbrook-deploy-freeze", successorRef: "memories/halbrook-freeze-rules", judgeLabel: "duplicate", judgeReason: "same" } }]));
  console.log(JSON.stringify({ ok: true, consolidation: { totalChunks: 7, warnings: ["fake: probe=" + config.probe + " args=" + args.join(" ")], pairPass: { initiators: 80, pairsConsidered: 1, pairsJudged: 1, failedJudgments: 0, labelCounts: { duplicate: 1 } } }, usageReport: { byProcessEngineModel: [{ model: "fake-served", calls: 3, failures: 0 }] } }));
} else if (args[0] === "proposal") console.log(JSON.stringify({ totalCount: 1, proposals: JSON.parse(readFileSync(proposals, "utf8")) }));
else process.exit(1);
`;

describe("runPool", () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), "pool-run-"));
    const script = join(root, "fake-akm.ts");
    writeFileSync(script, FAKE_AKM);
    const newSandbox = () => ({ ...createSandbox("consolidate-pool-test", { keepModelKey: true }), cmd: ["bun", script] });
    const ctx = { newSandbox, baseUrl: "http://localhost:1/v1", model: "the-model", hasKey: false, version: "0.9.99-test", label: "t" };
    return { root, ctx };
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

  test("runs one improve with the strategy, the config patch and the budget it is given, and scores it", async () => {
    const { root, ctx } = setup();
    try {
      const overrides = { strategy: "catchup", configPatch: { path: "patches/p.json", sha256: "abc123", patch: { probe: "anti-collapse-off" } } };
      const summary = await quiet(() => runPool({ ...ctx, overrides, timeoutMs: 60_000 }, pool, join(root, "results")));
      expect(summary).toMatchObject({ eval: "consolidate", mode: "pool", corpus: "public", n_notes: 80, n_clusters: 47, n_cases: 1, n_run: 1, n_scored: 1, n_errored: 0, n_paired: 1, strategy: "catchup", config_patch: { path: "patches/p.json", sha256: "abc123" }, timeout_ms: 60_000 });
      expect(summary.metrics?.warnings).toEqual(["fake: probe=anti-collapse-off args=improve --strategy catchup --no-sync --json-to-stdout --format json --timeout-ms 60000"]);
      expect(summary.metrics?.precision).toEqual({ value: 1, safe: 1, retired: 1 });
      expect(summary.served_models).toEqual({ "fake-served": 3 });
      const dir = join(root, "results", readdirSync(join(root, "results"))[0]);
      expect(readdirSync(dir).filter((f) => f !== ".running").sort()).toEqual(["improve.json", "samples.jsonl", "summary.json"]);
      expect(readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n")).toHaveLength(47);
      const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
      expect(stored.results_dir).toBeUndefined();
      expect(stored.harness_sha256).toMatch(/^[0-9a-f]{64}$/); // the digest of this eval's code and lib/
      expect(stored.harness_sha256).toBe(harnessSha256(import.meta.dir));
      expect(stored.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
      expect(stored).toMatchObject({ status: "complete", aborted_reason: null });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a failed akm run is an errored run, written to summary.json and thrown", async () => {
    const { root, ctx } = setup();
    process.env.FAKE_CRASH = "1";
    try {
      await expect(quiet(() => runPool({ ...ctx, overrides: { strategy: "consolidate", configPatch: null } }, pool, join(root, "results")))).rejects.toThrow("exit 70");
      const dir = join(root, "results", readdirSync(join(root, "results"))[0]);
      const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
      expect(stored).toMatchObject({ mode: "pool", n_errored: 1, n_scored: 0, metrics: null, config_patch: null, timeouts: 0 });
      expect(stored).toMatchObject({ status: "aborted" });
      expect(stored.aborted_reason).toContain("akm improve failed (exit 70)");
      expect(stored.aborted_reason).toBe(stored.error);
    } finally {
      delete process.env.FAKE_CRASH;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an akm that the eval kills for running too long is a timeout, apart from other failures", async () => {
    const { root, ctx } = setup();
    process.env.FAKE_SLEEP = "1";
    try {
      await expect(quiet(() => runPool({ ...ctx, improveTimeoutMs: 1500, overrides: { strategy: "consolidate", configPatch: null } }, pool, join(root, "results")))).rejects.toThrow("akm improve timed out after 1.5s");
      const dir = join(root, "results", readdirSync(join(root, "results"))[0]);
      expect(JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"))).toMatchObject({ status: "aborted", aborted_reason: "akm improve timed out after 1.5s", n_errored: 1, timeouts: 1 });
    } finally {
      delete process.env.FAKE_SLEEP;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("records the config it wrote, the engine's settings, the digest of the pool, no seed, and a complete run", async () => {
    const { root, ctx } = setup();
    try {
      const summary = await quiet(() => runPool({ ...ctx, overrides: { strategy: "consolidate", configPatch: null } }, pool, join(root, "results")));
      const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
      expect(stored).toMatchObject({ status: "complete", aborted_reason: null, embedder: "deterministic", seed: null, timeouts: 0 });
      expect(stored.assets_sha256).toBe(assetsDigest(POOL_DIR, poolFiles(POOL_DIR)));
      expect(poolFiles(POOL_DIR)).toHaveLength(81); // labels.json and the 80 notes
      expect(stored.engine).toEqual({ engine: "consolidate", model: "the-model", endpoint: endpointHost("http://localhost:1/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000, engines: { consolidate: { model: "the-model", endpoint: endpointHost("http://localhost:1/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 } } });
      expect(stored.config.engines.consolidate).toMatchObject({ endpoint: "<MODEL_BASE_URL>/chat/completions", temperature: 0, enableThinking: false });
      expect(JSON.stringify(stored.config)).not.toContain("localhost:1/v1"); // the config hides the endpoint; engine records its host
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("writes a sound manifest of the pool mode, and its rows hold the raw output, so scripts/rescore scores the run again without akm", async () => {
    const { root, ctx } = setup();
    try {
      const summary = await quiet(() => runPool({ ...ctx, overrides: { strategy: "consolidate", configPatch: null }, timeoutMs: 90_000 }, pool, join(root, "results")));
      const dir = summary.results_dir;
      const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
      expect(manifestProblems(stored.manifest)).toEqual([]);
      expect(stored.manifest).toMatchObject({ eval: "consolidate", corpus: "public", mode: "pool", treatment_hints: { embedder: "deterministic" }, settings: { strategy: "consolidate", timeout_ms: 90_000, seed: null } });
      expect(Object.keys(stored.manifest.cases)).toEqual(pool.clusters.map((c) => c.id));
      expect(stored.manifest.completion).toMatchObject({ selected: pool.clusters.map((c) => c.id), errored: [] });
      // every cluster is run beside every other note, so a change to any note changes the input digest of every cluster
      const digests = poolCases(pool).map((c) => MEASUREMENT.input(c));
      expect(new Set(digests.map((d: any) => d.pool_sha256)).size).toBe(1);
      const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(rows).toHaveLength(47);
      expect(rows.every((r) => r.run?.pair_pass !== undefined && Array.isArray(r.retire_proposals))).toBe(true);
      expect(rows.find((r) => r.id === "duplicate-01")).toMatchObject({ outcome: "safe" });
      clearRunning(dir); // the run ended in this process, which is where the marker is removed
      const { out, result } = rescoreFolder(dir);
      expect(result).toMatchObject({ changed: [], dropped: [] });
      expect(readFileSync(join(out, "samples.jsonl"), "utf8")).toBe(readFileSync(join(dir, "samples.jsonl"), "utf8"));
      expect(JSON.parse(readFileSync(join(out, "summary.json"), "utf8")).metrics).toEqual(stored.metrics);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("with the real embedder it runs in a semantic sandbox with akm's model in the config, and records it", async () => {
    const { root, ctx } = setup();
    process.env.FAKE_EMBEDDER = "real";
    try {
      const newSandbox = () => ({ ...createSandbox("consolidate-pool-test", sandboxOptions("real")), cmd: ["bun", join(root, "fake-akm.ts")] });
      const summary = await quiet(() => runPool({ ...ctx, newSandbox, embedder: "real", overrides: { strategy: "consolidate", configPatch: null } }, pool, join(root, "results")));
      expect(summary).toMatchObject({ embedder: "real", status: "complete", n_errored: 0 });
      expect(summary.config).toMatchObject({ embedding: { localModel: "Xenova/bge-small-en-v1.5" } });
    } finally {
      delete process.env.FAKE_EMBEDDER;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("with the default embedder it sets the hash embedder's switch and no embedding model", async () => {
    const { root, ctx } = setup();
    process.env.FAKE_EMBEDDER = "deterministic";
    try {
      const summary = await quiet(() => runPool({ ...ctx, overrides: { strategy: "consolidate", configPatch: null } }, pool, join(root, "results")));
      expect(summary).toMatchObject({ embedder: "deterministic", n_errored: 0 });
      expect(summary.config.embedding).toBeUndefined();
    } finally {
      delete process.env.FAKE_EMBEDDER;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
