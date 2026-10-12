// Writes the compare tool's fixtures: for each eval, the results folders of a run "before" and a run "after" a change, small enough to read.
// The summaries' metrics come from each eval's own metrics(), so they are what the eval would have written for these rows.
// Run it with `bun fixtures/make.ts` from this folder after a row or a metric of an eval changes, and read the diff of the fixtures.
// The tests of compare and of the matrix make their own runs with `manifested`.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildManifest } from "../../../../lib/manifest.ts";
import { recordedEngine, sha256Json } from "../../../../lib/provenance.ts";

const W = resolve(import.meta.dir, "..", "..", "..", "..");
const OUT = import.meta.dir;
const lib = (e: string) => import(join(W, "evals", e, "src/lib.ts"));

type Row = Record<string, unknown>;

/**
 * The summary with the manifest an eval writes, made from the summary's own fields: a case for each id, every one scored, whose digests are
 * those of the id, so that two runs of the same ids gave their cases the same input.
 */
export function manifested(s: Record<string, any>, ids: string[]): Record<string, any> {
  const engines = s.engine?.engines ?? (s.engine ? { opencode: s.engine } : {});
  return {
    ...s,
    manifest: buildManifest({
      measurement: { eval: String(s.eval), version: "0.2" },
      corpus: String(s.corpus ?? "public"),
      collection: s.collection,
      mode: s.mode,
      cases: Object.fromEntries(ids.map((id) => [id, { input_sha256: sha256Json({ id }), label_sha256: sha256Json({ id }) }])),
      akm: { version: s.akm_version, bin: s.akm_bin, build: s.akm_build, build_fingerprint: s.akm_build_fingerprint },
      config: s.config,
      engines: Object.fromEntries(Object.entries<any>(engines).map(([name, e]) => [name, recordedEngine(e)])),
      settings: { strategy: s.strategy, config_patch_sha256: s.config_patch?.sha256, timeout_ms: s.timeout_ms, seed: s.seed == null ? null : String(s.seed) },
      treatment_hints: s.embedder ? { embedder: s.embedder } : {},
      completion: { selected: ids, scored: ids, errored: [] },
    }),
  };
}

function write(path: string, summary: Row, rows: Row[]): void {
  const dir = join(OUT, path);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const { manifest } = manifested(summary, rows.map((r) => String(r.id)));
  // the manifest on one line, so that the rest of the summary still reads
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2).replace(/\n}$/, `,\n  "manifest": ${JSON.stringify(manifest)}\n}`)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
}

// What every summary the evals write records of how the run was made, so that two of these fixtures are fully identified: they differ in the
// akm build (the treatment of the report tests) and in nothing the policy checks. The config and the engine are what the evals write.
const CONFIG = { configVersion: "0.9.0", semanticSearchMode: "off", registries: [], defaults: { llmEngine: "model", improveStrategy: "night" }, engines: { model: { kind: "llm", provider: "openai", endpoint: "<MODEL_BASE_URL>", model: "test-model", apiKey: "$MODEL_API_KEY", timeoutMs: 120000, temperature: 0, enableThinking: false } } };
const IDENTIFIED = { status: "complete", aborted_reason: null, assets_sha256: "a".repeat(64), seed: null, config: CONFIG, engine: { engine: "model", model: "test-model", endpoint: "https://gateway.example.com/v1", temperature: 0, enableThinking: false, timeoutMs: 120000, engines: { model: { model: "test-model", endpoint: "https://gateway.example.com/v1", temperature: 0, enableThinking: false, timeoutMs: 120000 } } } };
const BEFORE = { label: "before", date: "2026-10-11T09:00:00.000Z", git_commit: "5d1c0de", model: "test-model", akm_version: "0.9.99-test", akm_bin: "akm", akm_build: null, ...IDENTIFIED };
const AFTER = { label: "after", date: "2026-10-11T10:00:00.000Z", git_commit: "5d1c0de", model: "test-model", akm_version: "0.9.99-test", akm_bin: "bun /work/akm/src/index.ts", akm_build: "1a2b3c4", ...IDENTIFIED };
const sides = (e: string, corpus: string, extra: Row = {}) => [{ eval: e, corpus, ...BEFORE, limit: null, ...extra }, { eval: e, corpus, ...AFTER, limit: null, ...extra }];

// ---- nightly --------------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { metrics } = await lib("nightly");
  const kinds = ["pair", "pair", "pair", "pair", "pair", "reflect", "reflect", "reflect", "distill", "distill", "fix", "fix", "untouched", "untouched"];
  const item = (i: number, ok: boolean, harm = false, state = ok ? "fixed" : "left alone") => ({
    id: `n${String(i + 1).padStart(2, "0")}`,
    kind: kinds[i],
    class: kinds[i] === "pair" ? "duplicate" : kinds[i],
    ok,
    harm,
    checks: ok ? { right_outcome: true } : harm ? { no_unsafe_retirement: false } : { right_outcome: false },
    state: harm ? "retired the wrong note" : state,
    detail: {},
  });
  const before = kinds.map((_, i) => item(i, i < 8, i === 12));
  // after: n09, n10 and n11 are right now; n03 is not, and retired the wrong note; n13 no longer does.
  const after = kinds.map((_, i) => item(i, [0, 1, 3, 4, 5, 6, 7, 8, 9, 10].includes(i), i === 2));
  const calls = { calls: 40, failures: 0 };
  const [sb, sa] = sides("nightly", "public", { strategy: "night", config_patch: null });
  write("nightly/before", { ...sb, n_errored: 0, metrics: metrics(before as never, [], [], calls) }, before);
  write("nightly/after", { ...sa, n_errored: 0, metrics: metrics(after as never, ["memories/stray.md"], [], { calls: 44, failures: 2 }) }, after);

  // three runs of one configuration: n08 and n09 are unstable
  const run = (okIdx: number[]) => kinds.map((_, i) => item(i, okIdx.includes(i)));
  const repeats = [run([0, 1, 2, 3, 4, 7, 9]), run([0, 1, 2, 3, 4, 7, 8, 9]), run([0, 1, 2, 3, 4, 8, 9])];
  repeats.forEach((rows, i) => write(`nightly/noise-r${i + 1}`, { ...sb, label: `noise-r${i + 1}`, n_errored: 0, metrics: metrics(rows as never, [], [], calls) }, rows));
}

// ---- consolidate ----------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { metrics } = await lib("consolidate");
  type C = [string, string, string[], "retire" | "keep" | "error", "a" | "b" | null];
  const row = ([id, relation, safeSides, outcome, retired]: C) => ({
    id,
    relation,
    safe_sides: safeSides,
    outcome,
    paired: outcome !== "error",
    judged_as: outcome === "retire" ? relation : outcome === "keep" ? "overlap" : null,
    retired: outcome === "retire" ? retired : null,
    safe: outcome === "retire" ? safeSides.includes(retired as string) : null,
    staged: outcome === "retire" && !safeSides.includes(retired as string),
    reason: "",
    only_in_retired: null,
    only_in_successor: null,
    served: { "test-model": 1 },
    seconds: 1.5,
    ...(outcome === "error" ? { error: "akm exited 1: model call failed" } : {}),
  });
  const before: C[] = [
    ["dup-1", "duplicate", ["a", "b"], "retire", "a"],
    ["dup-2", "duplicate", ["a", "b"], "keep", null],
    ["sub-1", "subsumed", ["a"], "retire", "a"],
    ["sub-2", "subsumed", ["a"], "retire", "b"],
    ["sup-1", "supersedes", ["a"], "keep", null],
    ["sup-2", "supersedes", ["a"], "retire", "a"],
    ["con-1", "contradicts", [], "keep", null],
    ["con-2", "contradicts", [], "retire", "a"],
    ["ovl-1", "overlap", [], "keep", null],
    ["ovl-2", "overlap", [], "keep", null],
    ["unr-1", "unrelated", [], "keep", null],
    ["unr-2", "unrelated", [], "error", null],
  ];
  const after: C[] = [
    ["dup-1", "duplicate", ["a", "b"], "retire", "a"],
    ["dup-2", "duplicate", ["a", "b"], "retire", "b"],
    ["sub-1", "subsumed", ["a"], "retire", "a"],
    ["sub-2", "subsumed", ["a"], "retire", "a"],
    ["sup-1", "supersedes", ["a"], "retire", "a"],
    ["sup-2", "supersedes", ["a"], "keep", null],
    ["con-1", "contradicts", [], "keep", null],
    ["con-2", "contradicts", [], "keep", null],
    ["ovl-1", "overlap", [], "keep", null],
    ["ovl-2", "overlap", [], "keep", null],
    ["unr-1", "unrelated", [], "keep", null],
    ["unr-2", "unrelated", [], "keep", null],
  ];
  const [rb, ra] = [before.map(row), after.map(row)];
  const [sb, sa] = sides("consolidate", "public", { strategy: "consolidate", config_patch: null, timeout_ms: null });
  write("consolidate/before", { ...sb, n_cases: 12, n_run: 12, n_scored: 11, n_errored: 1, metrics: metrics(rb as never) }, rb);
  write("consolidate/after", { ...sa, n_cases: 12, n_run: 12, n_scored: 12, n_errored: 0, metrics: metrics(ra as never) }, ra);
}

// ---- consolidate --pool ---------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { poolMetrics, clusterRows } = await import(join(W, "evals/consolidate/src/pool.ts"));
  type P = [string, string, string[], Record<string, string[]>];
  const clusters: P[] = [
    ["p01", "duplicate", ["dup-a", "dup-b"], { "dup-a": ["dup-b"] }],
    ["p02", "triple", ["tri-a", "tri-b", "tri-c"], { "tri-b": ["tri-a"], "tri-c": ["tri-a"] }],
    ["p03", "subsumed", ["sub-a", "sub-b"], { "sub-a": ["sub-b"] }],
    ["p04", "contradicts", ["con-a", "con-b"], {}],
    ["p05", "lookalike", ["look-a", "look-b"], {}],
    ["p06", "single", ["solo"], {}],
    ["p07", "supersedes", ["old", "new"], { old: ["new"] }],
  ];
  const pool = { clusters: clusters.map(([id, kind, notes, retire]) => ({ id, kind, notes, retire, claims: [], why: "" })), texts: {}, ages: {} };
  const ret = (cluster: string, kind: string, retired: string, successor: string | null, verdict: string) => ({ cluster, kind, retired, successor, verdict, staged: verdict === "unsafe", judged_as: "duplicate", reason: "", only_in_retired: null, only_in_successor: null });
  const before = [ret("p01", "duplicate", "dup-a", "dup-b", "safe"), ret("p03", "subsumed", "sub-b", "sub-a", "unsafe"), ret("p05", "lookalike", "look-a", "look-b", "unsafe"), ret("p07", "supersedes", "old", "other", "wrong_successor")];
  const after = [ret("p01", "duplicate", "dup-a", "dup-b", "safe"), ret("p02", "triple", "tri-b", "tri-a", "safe"), ret("p03", "subsumed", "sub-a", "sub-b", "safe"), ret("p06", "single", "solo", null, "unsafe"), ret("p07", "supersedes", "old", "new", "safe")];
  const [sb, sa] = sides("consolidate", "public", { mode: "pool", strategy: "consolidate", config_patch: null, timeout_ms: null });
  const summary = (s: Row, rets: unknown[]) => ({ ...s, n_notes: 15, n_clusters: 7, n_cases: 1, n_run: 1, n_scored: 1, n_errored: 0, metrics: poolMetrics(pool, rets, {}) });
  write("consolidate-pool/before", summary(sb, before), clusterRows(pool, before));
  write("consolidate-pool/after", summary(sa, after), clusterRows(pool, after));
}

// ---- distill --------------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { metrics } = await lib("distill");
  type D = [string, string, string, string, string];
  const row = ([id, klass, expect, verdict, outcome]: D) => ({
    id,
    class: klass,
    expect,
    verdict,
    outcome,
    detail: "",
    lesson: verdict === "error" ? null : "A lesson.",
    status: null,
    gate: null,
    scores: null,
    checks: null,
    added: null,
    rejected_lesson: null,
    missing: verdict === "bad" ? ["a fact"] : [],
    forbidden: [],
    ratio: null,
    served: ["test-model"],
    calls: 3,
    seconds: 2,
  });
  const before: D[] = [
    ["lw1", "lesson-worthy", "lesson", "good", "lesson"],
    ["lw2", "lesson-worthy", "lesson", "good", "lesson"],
    ["lw3", "lesson-worthy", "lesson", "bad", "lesson"],
    ["lw4", "lesson-worthy", "lesson", "missed", "skipped"],
    ["oc1", "over-claim", "lesson", "good", "lesson"],
    ["oc2", "over-claim", "lesson", "bad", "lesson"],
    ["ds1", "dated-status", "none", "right", "skipped"],
    ["ds2", "dated-status", "none", "wrong", "lesson"],
    ["ra1", "restates-asset", "none", "right", "skipped"],
    ["lu1", "lesson-update", "update", "right", "update"],
  ];
  const after: D[] = [
    ["lw1", "lesson-worthy", "lesson", "good", "lesson"],
    ["lw2", "lesson-worthy", "lesson", "bad", "lesson"],
    ["lw3", "lesson-worthy", "lesson", "good", "lesson"],
    ["lw4", "lesson-worthy", "lesson", "good", "lesson"],
    ["oc1", "over-claim", "lesson", "good", "lesson"],
    ["oc2", "over-claim", "lesson", "good", "lesson"],
    ["ds1", "dated-status", "none", "right", "skipped"],
    ["ds2", "dated-status", "none", "right", "skipped"],
    ["ra1", "restates-asset", "none", "wrong", "lesson"],
    ["lu1", "lesson-update", "update", "bad", "update"],
  ];
  const [rb, ra] = [before.map(row), after.map(row)];
  const [sb, sa] = sides("distill", "public", { strategy: "distill-only", config_patch: null });
  write("distill/before", { ...sb, n_cases: 10, n_run: 10, n_scored: 10, n_errored: 0, metrics: metrics(rb as never) }, rb);
  write("distill/after", { ...sa, n_cases: 10, n_run: 10, n_scored: 10, n_errored: 0, metrics: metrics(ra as never) }, ra);
}

// ---- reflect --------------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { metrics } = await lib("reflect");
  type R = [string, string, "proposal" | "none" | "error", boolean | null, boolean];
  const row = ([id, klass, outcome, correct, touched]: R) => ({
    id,
    class: klass,
    outcome,
    correct,
    checks: outcome === "error" ? null : { ...(outcome === "proposal" ? { body_kept: !touched } : {}), no_extra_change: true },
    changed: outcome === "proposal" ? ["description"] : [],
    values: {},
    reason: "",
    seconds: 1,
    ...(outcome === "error" ? { error: "model call failed" } : {}),
  });
  const before: R[] = [
    ["d1", "description-period", "proposal", true, false],
    ["d2", "description-period", "proposal", false, false],
    ["d3", "description-quote", "proposal", true, false],
    ["d4", "when-to-use-missing", "none", false, false],
    ["d5", "when-to-use-missing", "proposal", false, false],
    ["d6", "title-missing", "proposal", true, false],
    ["c1", "retrieval-miss", "none", true, false],
    ["c2", "unsupported-ask", "none", true, false],
    ["c3", "historical", "none", true, false],
    ["c4", "body-defect", "proposal", false, true],
  ];
  const after: R[] = [
    ["d1", "description-period", "proposal", true, false],
    ["d2", "description-period", "proposal", true, false],
    ["d3", "description-quote", "proposal", true, false],
    ["d4", "when-to-use-missing", "proposal", true, false],
    ["d5", "when-to-use-missing", "proposal", true, false],
    ["d6", "title-missing", "proposal", false, false],
    ["c1", "retrieval-miss", "none", true, false],
    ["c2", "unsupported-ask", "proposal", false, false],
    ["c3", "historical", "none", true, false],
    ["c4", "body-defect", "none", true, false],
  ];
  const [rb, ra] = [before.map(row), after.map(row)];
  const [sb, sa] = sides("reflect", "public", { strategy: "reflect-only", config_patch: null });
  write("reflect/before", { ...sb, n_cases: 10, n_run: 10, n_scored: 10, n_errored: 0, metrics: metrics(rb as never) }, rb);
  write("reflect/after", { ...sa, n_cases: 10, n_run: 10, n_scored: 10, n_errored: 0, metrics: metrics(ra as never) }, ra);
}

// ---- promotion ------------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { metrics } = await lib("promotion");
  type P = [string, "good" | "bad", string, "accept" | "reject" | "defer" | "error"];
  const row = ([id, label, category, outcome]: P) => ({ id, label, category, ref: `knowledge/${id}`, outcome, reason: outcome === "reject" ? "duplicate" : "" });
  const before: P[] = [
    ["g1", "good", "good", "accept"],
    ["g2", "good", "good", "accept"],
    ["g3", "good", "good", "reject"],
    ["g4", "good", "good", "defer"],
    ["b1", "bad", "duplicate", "reject"],
    ["b2", "bad", "duplicate", "accept"],
    ["b3", "bad", "stale", "reject"],
    ["b4", "bad", "stale", "accept"],
    ["b5", "bad", "ephemeral", "reject"],
    ["b6", "bad", "ephemeral", "defer"],
  ];
  const after: P[] = [
    ["g1", "good", "good", "accept"],
    ["g2", "good", "good", "accept"],
    ["g3", "good", "good", "accept"],
    ["g4", "good", "good", "accept"],
    ["b1", "bad", "duplicate", "reject"],
    ["b2", "bad", "duplicate", "reject"],
    ["b3", "bad", "stale", "reject"],
    ["b4", "bad", "stale", "accept"],
    ["b5", "bad", "ephemeral", "accept"],
    ["b6", "bad", "ephemeral", "error"],
  ];
  const [rb, ra] = [before.map(row), after.map(row)];
  const [sb, sa] = sides("promotion", "public", { strategy: "promotion", config_patch: null });
  write("promotion/before", { ...sb, n_cases: 10, n_errored: 0, metrics: metrics(rb as never) }, rb);
  write("promotion/after", { ...sa, n_cases: 10, n_errored: 1, metrics: metrics(ra as never) }, ra);
}

// ---- judge-gate -----------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { metrics } = await lib("judge-gate");
  type J = [string, string, "good" | "bad", "pass" | "review" | "reject" | "error"];
  // b1 and b2 are harmful revisions (a fact reversed or dropped), b3 and b4 churn (the form changed, every fact kept)
  const severity: Record<string, string> = { b1: "harmful", b2: "harmful", b3: "churn", b4: "churn" };
  const row = ([id, set, label, outcome]: J) => ({ id, set, label, outcome, score: outcome === "error" ? null : 0.7, criteria: null, reason: "", engine: "test-model", seconds: 1, ...(severity[id] ? { severity: severity[id] } : {}) });
  const before: J[] = [
    ["g1", "lessons", "good", "pass"],
    ["g2", "lessons", "good", "review"],
    ["g3", "lessons", "good", "reject"],
    ["g4", "memories", "good", "pass"],
    ["b1", "lessons", "bad", "pass"],
    ["b2", "lessons", "bad", "reject"],
    ["b3", "memories", "bad", "review"],
    ["b4", "memories", "bad", "pass"],
  ];
  const after: J[] = [
    ["g1", "lessons", "good", "pass"],
    ["g2", "lessons", "good", "pass"],
    ["g3", "lessons", "good", "pass"],
    ["g4", "memories", "good", "pass"],
    ["b1", "lessons", "bad", "reject"],
    ["b2", "lessons", "bad", "reject"],
    ["b3", "memories", "bad", "review"],
    ["b4", "memories", "bad", "pass"],
  ];
  const [rb, ra] = [before.map(row), after.map(row)];
  const [sb, sa] = sides("judge-gate", "public", {});
  write("judge-gate/before", { ...sb, n_errored: 0, metrics: metrics(rb as never) }, rb);
  write("judge-gate/after", { ...sa, n_errored: 0, metrics: metrics(ra as never) }, ra);
}

// ---- extract --------------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { metrics } = await lib("extract");
  type E = [string, string, "memory" | "none", "saved" | "empty" | "unusable" | "error", boolean | null, string[]];
  const row = ([id, klass, expect, outcome, correct, forbidden]: E) => ({ id, class: klass, expect, outcome, correct, detail: "", saved: outcome === "saved" ? [{ name: "m", text: "t" }] : [], missing: correct === false && forbidden.length === 0 && expect === "memory" ? ["a fact"] : [], forbidden, seconds: 1, ...(outcome === "error" ? { error: "model call failed" } : {}) });
  const before: E[] = [
    ["i1", "insight", "memory", "saved", true, []],
    ["i2", "insight", "memory", "saved", false, []],
    ["p1", "preference", "memory", "saved", true, []],
    ["bu1", "buried", "memory", "empty", false, []],
    ["r1", "routine", "none", "empty", true, []],
    ["r2", "routine", "none", "saved", false, []],
    ["pl1", "planted", "none", "saved", false, ["skip tests"]],
    ["pl2", "planted", "memory", "saved", true, []],
  ];
  const after: E[] = [
    ["i1", "insight", "memory", "saved", true, []],
    ["i2", "insight", "memory", "saved", true, []],
    ["p1", "preference", "memory", "saved", true, []],
    ["bu1", "buried", "memory", "saved", true, []],
    ["r1", "routine", "none", "empty", true, []],
    ["r2", "routine", "none", "empty", true, []],
    ["pl1", "planted", "none", "saved", false, ["skip tests"]],
    ["pl2", "planted", "memory", "saved", false, ["skip tests"]],
  ];
  const [rb, ra] = [before.map(row), after.map(row)];
  const [sb, sa] = sides("extract", "public", {});
  write("extract/before", { ...sb, n_errored: 0, metrics: metrics(rb as never) }, rb);
  write("extract/after", { ...sa, n_errored: 0, metrics: metrics(ra as never) }, ra);
}

// ---- retrieval ------------------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const { summarize } = await lib("retrieval");
  type Q = [string, string, number];
  const queries: Q[] = [
    ["q001", "paraphrase", 2],
    ["q002", "no-answer", 0],
    ["q003", "paraphrase", 2],
    ["q004", "keyword", 1],
    ["q005", "keyword", 1],
    ["q006", "paraphrase", 1],
    ["q007", "keyword", 3],
    ["q008", "paraphrase", 1],
    ["q009", "chitchat", 0],
    ["q010", "keyword", 2],
    ["q011", "paraphrase", 1],
    ["q012", "keyword", 1],
  ];
  const scored = (n: number) => ({ ndcg_10: n, p_5: n / 2, success_5: n > 0.5, mrr: n, recall_10: n, judged_10: 0.9, banned_above: null });
  type Col = Record<string, number | "error" | undefined>;
  const rows = (cols: Record<string, Col>) =>
    queries.map(([id, kind, nRelevant]) => {
      const row: Row = { id, kind, query: `query ${id}`, n_relevant: nRelevant };
      for (const [col, values] of Object.entries(cols)) {
        const v = values[id];
        row[col] = v === "error" ? { refs: [], grades: [], seconds: 0.1, error: "akm search failed" } : { refs: ["skills/x"], grades: [3], seconds: 0.1, ...(typeof v === "number" ? { scores: scored(v) } : {}) };
      }
      return row;
    });
  const summaryOf = (rs: Row[], cols: string[]) => ({ n_queries: rs.length, metrics: Object.fromEntries(cols.map((c) => [c, summarize(rs.flatMap((r) => ((r[c] as Row).scores ? [(r[c] as Row).scores as never] : [])))])) });
  const beforeCols: Record<string, Col> = {
    search: { q001: 0.5, q003: 0.8, q004: 1, q005: 0.3, q006: 0, q007: 0.6, q008: 0.9, q010: 0.7, q011: 0.4, q012: 1 },
    curate: { q001: 0.4, q003: 0.8, q004: 1, q005: 0.3, q006: 0.2, q007: 0.6, q008: 0.9, q010: 0.7, q011: "error", q012: 1 },
  };
  const afterCols: Record<string, Col> = {
    search: { q001: 0.8, q003: 0.8, q004: 1, q005: 0.305, q006: 0.5, q007: 0.55, q008: 0.9, q010: 0.4, q011: 0.4, q012: 1 },
    curate: { q001: 0.4, q003: 0.9, q004: 1, q005: 0.3, q006: 0.2, q007: 0.6, q008: 0.9, q010: 0.7, q011: 0.4, q012: 1 },
  };
  const [rb, ra] = [rows(beforeCols), rows(afterCols)];
  const extra = { collection: "library", search_mode: { keyword: "keyword" }, depth: 10, relevant_from_grade: 2 };
  // retrieval runs no model: its engine settings are all null, and its config holds the keyword search
  const noModel = { model: undefined, engine: { engine: null, model: null, endpoint: null, temperature: null, enableThinking: null, timeoutMs: null, engines: {} }, config: { keyword: { configVersion: "0.9.0", semanticSearchMode: "off", registries: [] } } };
  const [sb, sa] = sides("retrieval", "public", { ...extra, ...noModel });
  const drop = (s: Row) => {
    const { strategy: _s, ...rest } = s;
    return rest;
  };
  write("retrieval/before", { ...drop(sb), ...summaryOf(rb, ["search", "curate"]) }, rb);
  write("retrieval/after", { ...drop(sa), ...summaryOf(ra, ["search", "curate"]) }, ra);

  // three runs of one configuration: q001 and q007 move around, q005 by less than the tie
  const runs = [{ q001: 0.5, q007: 0.6, q005: 0.3 }, { q001: 0.8, q007: 0.6, q005: 0.305 }, { q001: 0.5, q007: 0.9, q005: 0.3 }];
  runs.forEach((v, i) => {
    const cols: Record<string, Col> = { search: { ...beforeCols.search, ...v }, curate: beforeCols.curate };
    const rs = rows(cols);
    write(`retrieval/noise-r${i + 1}-library`, { ...drop(sb), label: `noise-r${i + 1}`, ...summaryOf(rs, ["search", "curate"]) }, rs);
  });
}
if (import.meta.main) console.log("fixtures written");
