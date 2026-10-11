import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { poolMetrics, type Retirement } from "../../../evals/consolidate/src/pool.ts";
import { metrics as consolidateMetrics } from "../../../evals/consolidate/src/lib.ts";
import { metrics as distillMetrics } from "../../../evals/distill/src/lib.ts";
import { metrics as extractMetrics } from "../../../evals/extract/src/lib.ts";
import { metrics as judgeGateMetrics } from "../../../evals/judge-gate/src/lib.ts";
import { metrics as nightlyMetrics } from "../../../evals/nightly/src/lib.ts";
import { metrics as promotionMetrics } from "../../../evals/promotion/src/lib.ts";
import { DEFECTS, metrics as reflectMetrics } from "../../../evals/reflect/src/lib.ts";
import { summarize } from "../../../evals/retrieval/src/lib.ts";
import { EVAL_METRICS } from "../../matrix/src/lib.ts";
import { CompareError, EXTRACT_INSIGHT_CLASSES, REFLECT_DEFECTS, SUPPORTED, compareRepeats, comparePair, differences, findRepeats, infoOf, loadRun, pairedBootstrap, quantile, refusals, renderPair, renderRepeats, resampleIndexes, rng, signTest, signalOf, viewsOf, type PairReport, type Unit } from "./lib.ts";

const FIXTURES = join(import.meta.dir, "fixtures");
const fx = (...parts: string[]): string => join(FIXTURES, ...parts);
const pair = (name: string, options = {}): PairReport => comparePair(loadRun(fx(name, "before")), loadRun(fx(name, "after")), options);
const view = (r: PairReport, name = "") => r.views.find((v) => v.view === name)!;
const ids = (flips: { id: string }[]): string[] => flips.map((f) => f.id);
const metric = (r: PairReport, path: string, name = "") => view(r, name).metrics.find((m) => m.path === path)!;

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "compare-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A copy of a fixture folder under a new name, with its summary changed. */
function variant(from: string, patch: Record<string, unknown>): string {
  const dir = join(tmp(), "run");
  cpSync(from, dir, { recursive: true });
  const file = join(dir, "summary.json");
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), ...patch }));
  return dir;
}

function writeRun(dir: string, summary: Record<string, unknown>, rows: object[]): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return dir;
}

const rows = (name: string, side: string): Record<string, any>[] =>
  readFileSync(fx(name, side, "samples.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

const at = (x: unknown, path: string): unknown => path.split(".").reduce<any>((o, k) => o?.[k], x);

describe("signTest", () => {
  test("is the exact two-sided binomial p-value on the cases that disagree", () => {
    expect(signTest(8, 0)).toBeCloseTo(2 / 256, 12);
    expect(signTest(0, 8)).toBeCloseTo(2 / 256, 12);
    expect(signTest(5, 1)).toBeCloseTo(14 / 64, 12);
    expect(signTest(9, 3)).toBeCloseTo((2 * (1 + 12 + 66 + 220)) / 4096, 12);
    expect(signTest(3, 3)).toBe(1);
    expect(signTest(1, 0)).toBe(1);
  });

  test("is null when no case disagrees, and stays finite for many cases", () => {
    expect(signTest(0, 0)).toBeNull();
    const p = signTest(600, 0) as number;
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1e-100);
    expect(signTest(500, 450)).toBeGreaterThan(0.05);
  });
});

describe("the bootstrap", () => {
  const unit = (id: string, score: number, harm = false): Unit => ({ id, score, state: String(score), group: "", harm, row: { id, ok: score === 1 } });
  const rate = (us: Unit[]): number | null => (us.length === 0 ? null : us.filter((u) => u.score === 1).length / us.length);

  test("the same seed draws the same cases, a different seed other ones", () => {
    const a = resampleIndexes(20, 50, 7);
    expect([...resampleIndexes(20, 50, 7)]).toEqual([...a]);
    expect([...resampleIndexes(20, 50, 8)]).not.toEqual([...a]);
    expect(a.length).toBe(1000);
    expect(Math.max(...a)).toBeLessThan(20);
    const next = rng(1);
    const xs = Array.from({ length: 1000 }, () => next());
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(xs.reduce((s, x) => s + x, 0) / 1000).toBeGreaterThan(0.45);
    expect(xs.reduce((s, x) => s + x, 0) / 1000).toBeLessThan(0.55);
  });

  test("quantile interpolates between the nearest values", () => {
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([5], 0.975)).toBe(5);
  });

  test("when every case flips to better the interval is that one number, and when none flips it is zero", () => {
    const a = Array.from({ length: 12 }, (_, i) => unit(`c${i}`, 0));
    const b = Array.from({ length: 12 }, (_, i) => unit(`c${i}`, 1));
    const all = pairedBootstrap(a, b, rate, resampleIndexes(12, 2000, 1), 2000);
    expect([all.a, all.b, all.delta, all.lo, all.hi, all.used]).toEqual([0, 1, 1, 1, 1, 2000]);
    expect(signalOf("up", all)).toBe("better");
    expect(signalOf("down", all)).toBe("worse");
    const none = pairedBootstrap(a, a, rate, resampleIndexes(12, 2000, 1), 2000);
    expect([none.delta, none.lo, none.hi]).toEqual([0, 0, 0]);
    expect(signalOf("up", none)).toBe("same");
  });

  test("a mixed result has an interval around its estimate that includes zero when the flips split", () => {
    // 3 flipped to better, 2 to worse, 7 agree: a split like that is no evidence
    const [a, b] = [[0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0], [1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0]].map((s, k) => s.map((v, i) => unit(`c${i}-${k}`, v)));
    const e = pairedBootstrap(a, b, rate, resampleIndexes(12, 2000, 1), 2000);
    expect(e.delta).toBeCloseTo(1 / 12, 10);
    expect(e.lo as number).toBeLessThan(0);
    expect(e.hi as number).toBeGreaterThan(e.delta as number);
    expect(signalOf("up", e)).toBe("same");
    const again = pairedBootstrap(a, b, rate, resampleIndexes(12, 2000, 1), 2000);
    expect(again).toEqual(e);
  });

  test("a resample where a rate has nothing to divide is left out", () => {
    const a = [unit("x", 1), unit("y", 0), unit("z", 0)];
    const onlyOne = (us: Unit[]) => {
      const kept = us.filter((u) => u.id === "x");
      return kept.length === 0 ? null : kept.length;
    };
    const e = pairedBootstrap(a, a, onlyOne, resampleIndexes(3, 500, 3), 500);
    expect(e.used).toBeLessThan(500);
    expect(e.used).toBeGreaterThan(0);
  });

  test("signalOf follows the metric's direction and says n/a without an interval", () => {
    expect(signalOf("down", { delta: -0.2, lo: -0.4, hi: -0.1 })).toBe("better");
    expect(signalOf("down", { delta: 0.2, lo: 0.1, hi: 0.4 })).toBe("worse");
    expect(signalOf("up", { delta: -0.2, lo: -0.4, hi: -0.1 })).toBe("worse");
    expect(signalOf("up", { delta: null, lo: null, hi: null })).toBe("n/a");
  });
});

describe("the per-case reading of each eval agrees with the eval's own metrics", () => {
  // The fixtures' summaries were written by each eval's metrics(), so these tests read the rows the way the eval's scorer does.
  const close = (x: number | null, y: unknown) => (y === null || y === undefined ? expect(x).toBeNull() : expect(x).toBeCloseTo(y as number, 3));
  const compare = (name: string, side: string, evalMetrics: unknown) => {
    const run = loadRun(fx(name, side));
    const views = viewsOf(run);
    expect(views.length).toBe(1);
    let checked = 0;
    for (const spec of EVAL_METRICS[run.summary.eval]) {
      const m = views[0].metrics.find((x) => x.path === spec.path);
      if (!m) continue;
      checked++;
      close(m.of(views[0].units.filter((u) => u.score !== null)), at(evalMetrics, spec.path));
      close(m.of(views[0].units.filter((u) => u.score !== null)), at(run.summary.metrics, spec.path));
    }
    return checked;
  };

  for (const side of ["before", "after"]) {
    test(`nightly ${side}`, () => expect(compare("nightly", side, nightlyMetrics(rows("nightly", side) as never, [], [], { calls: 0, failures: 0 }))).toBe(2));
    test(`consolidate ${side}`, () => expect(compare("consolidate", side, consolidateMetrics(rows("consolidate", side) as never))).toBe(3));
    test(`distill ${side}`, () => expect(compare("distill", side, distillMetrics(rows("distill", side) as never))).toBe(2));
    test(`reflect ${side}`, () => expect(compare("reflect", side, reflectMetrics(rows("reflect", side) as never))).toBe(3));
    test(`promotion ${side}`, () => expect(compare("promotion", side, promotionMetrics(rows("promotion", side) as never))).toBe(3));
    test(`judge-gate ${side}`, () => expect(compare("judge-gate", side, judgeGateMetrics(rows("judge-gate", side) as never))).toBe(3));
    test(`extract ${side}`, () => expect(compare("extract", side, extractMetrics(rows("extract", side) as never))).toBe(3));
    test(`consolidate --pool ${side}`, () => {
      const rs = rows("consolidate-pool", side);
      const pool = { clusters: rs.map((r) => ({ id: r.id, kind: r.kind, notes: r.notes, retire: Object.fromEntries(r.may_retire.map((n: string) => [n, ["x"]])), claims: [], why: "" })), texts: {}, ages: {} };
      const retirements = rs.flatMap((r) => r.retirements.map((x: object) => ({ ...x, cluster: r.id, kind: r.kind }))) as Retirement[];
      expect(compare("consolidate-pool", side, poolMetrics(pool as never, retirements, {}))).toBe(3);
    });
    test(`retrieval ${side}`, () => {
      const run = loadRun(fx("retrieval", side));
      for (const v of viewsOf(run)) {
        const scored = rows("retrieval", side).flatMap((r) => (r[v.name].scores ? [r[v.name].scores] : []));
        close(v.metrics[0].of(v.units.filter((u) => u.score !== null)), summarize(scored).ndcg_10);
        close(v.metrics[0].of(v.units.filter((u) => u.score !== null)), at(run.summary.metrics, v.metrics[0].path));
      }
    });
  }

  test("the class lists match the evals'", () => {
    expect(REFLECT_DEFECTS).toEqual([...DEFECTS]);
    expect([...EXTRACT_INSIGHT_CLASSES].sort()).toEqual(["buried", "insight", "preference"]);
  });

  test("every eval in EVAL_METRICS is one compare reads, and every metric is per case or reported from the summaries", () => {
    // The Harbor evals are in EVAL_METRICS for the matrix. Their rows are trials of two arms, which compare has no reading for.
    const harbor = ["agent-ab", "terminal-bench"];
    expect([...SUPPORTED].sort()).toEqual(Object.keys(EVAL_METRICS).filter((name) => !harbor.includes(name)).sort());
  });
});

describe("comparePair", () => {
  test("nightly: the ok verdict, harm, and the metrics", () => {
    const r = pair("nightly");
    const v = view(r, "");
    expect(v.n_paired).toBe(14);
    expect(ids(v.better)).toEqual(["n09", "n10", "n11"]);
    expect(ids(v.worse)).toEqual(["n03"]);
    expect(v.agree.n).toBe(10);
    expect(v.agree.sets["wrong in both"]).toEqual(["n12", "n13", "n14"]);
    expect(v.agree.sets["right in both"].length).toBe(7);
    expect(v.sign_test).toEqual({ better: 3, worse: 1, p: 0.625 });
    expect(ids(v.harm!.appeared)).toEqual(["n03"]);
    expect(ids(v.harm!.cleared)).toEqual(["n13"]);
    expect(v.better[0]).toEqual({ id: "n09", group: "distill", a: "left alone", b: "fixed", delta: 1 });
    const rate = metric(r, "items.rate");
    expect([rate.a, rate.b, rate.delta]).toEqual([0.5714, 0.7143, 0.1429]);
    expect(rate.ci![0]).toBeLessThanOrEqual(rate.delta!);
    expect(rate.ci![1]).toBeGreaterThanOrEqual(rate.delta!);
    expect(rate.signal).toBe("same");
    expect(r.summary_only.map((m) => [m.path, m.a, m.b])).toEqual([["harm.outside_changed", 0, 1], ["harm.lessons_accepted", 0, 0], ["calls.failures", 0, 2]]);
    expect(r.differences.map((d) => d.field)).toEqual(["akm_build", "akm_bin"]);
    expect(r.warnings).toEqual([]);
  });

  test("a different akm build is the treatment, not a reason to refuse", () => {
    const [a, b] = [loadRun(fx("nightly", "before")), loadRun(fx("nightly", "after"))];
    expect(a.summary.akm_build).not.toBe(b.summary.akm_build);
    expect(refusals(a, b)).toEqual([]);
  });

  test("consolidate: a case an error left without a verdict is left out", () => {
    const r = pair("consolidate");
    const v = view(r, "");
    expect(v.n_a).toBe(12);
    expect(v.n_paired).toBe(11);
    expect(v.no_verdict).toEqual({ a: ["unr-2"], b: [] });
    expect(ids(v.better)).toEqual(["dup-2", "sub-2", "sup-1", "con-2"]);
    expect(ids(v.worse)).toEqual(["sup-2"]);
    expect(v.sign_test.p).toBe(0.375);
    expect(ids(v.harm!.cleared)).toEqual(["sub-2", "con-2"]);
    expect(v.harm!.appeared).toEqual([]);
    expect(v.better[1]).toMatchObject({ a: "retired b (UNSAFE)", b: "retired a (safe)", group: "subsumed" });
    expect(metric(r, "unsafe.n")).toMatchObject({ a: 2, b: 0, delta: -2 });
    expect(metric(r, "recall.value")).toMatchObject({ a: 0.5, b: 0.8333 });
    expect(r.warnings).toEqual(["1 case has no verdict in A and 0 in B (errors): they are left out"]);
  });

  test("consolidate --pool: the cluster is the case", () => {
    const r = pair("consolidate-pool");
    const v = view(r, "");
    expect(r.pool).toBe(true);
    expect(ids(v.better)).toEqual(["p02", "p03", "p05", "p07"]);
    expect(ids(v.worse)).toEqual(["p06"]);
    expect(ids(v.harm!.appeared)).toEqual(["p06"]);
    expect(ids(v.harm!.cleared)).toEqual(["p03", "p05"]);
    expect(v.sign_test.p).toBe(0.375);
    expect(metric(r, "precision.value")).toMatchObject({ a: 0.25, b: 0.8 });
    expect(metric(r, "unsafe.n")).toMatchObject({ a: 2, b: 1 });
  });

  test("distill: good and right are the verdicts, wrong is the harm", () => {
    const r = pair("distill");
    const v = view(r, "");
    expect(ids(v.better)).toEqual(["lw3", "lw4", "oc2", "ds2"]);
    expect(ids(v.worse)).toEqual(["lw2", "ra1", "lu1"]);
    expect(v.sign_test.p).toBe(1);
    expect(ids(v.harm!.appeared)).toEqual(["ra1"]);
    expect(ids(v.harm!.cleared)).toEqual(["ds2"]);
    expect(metric(r, "good_lessons.rate")).toMatchObject({ a: 0.5, b: 0.8333 });
    expect(v.better[3]).toMatchObject({ a: "wrong (lesson)", b: "right (skipped)", group: "dated-status" });
  });

  test("reflect: correct is the verdict, a broken control or a touched body is the harm", () => {
    const r = pair("reflect");
    const v = view(r, "");
    expect(ids(v.better)).toEqual(["d2", "d4", "d5", "c4"]);
    expect(ids(v.worse)).toEqual(["d6", "c2"]);
    expect(v.sign_test.p).toBe(0.6875);
    expect(ids(v.harm!.appeared)).toEqual(["c2"]);
    expect(ids(v.harm!.cleared)).toEqual(["c4"]);
    expect(metric(r, "defects.rate")).toMatchObject({ a: 0.5, b: 0.8333 });
    expect(metric(r, "controls.rate")).toMatchObject({ a: 0.75, b: 0.75, delta: 0 });
    expect(metric(r, "proposals.touched_body")).toMatchObject({ a: 1, b: 0 });
  });

  test("promotion: the outcome against the label", () => {
    const r = pair("promotion");
    const v = view(r, "");
    expect(v.n_paired).toBe(9);
    expect(v.no_verdict.b).toEqual(["b6"]);
    expect(ids(v.better)).toEqual(["g3", "g4", "b2"]);
    expect(ids(v.worse)).toEqual(["b5"]);
    expect(ids(v.harm!.appeared)).toEqual(["b5"]);
    expect(ids(v.harm!.cleared)).toEqual(["b2"]);
    expect(v.better[2]).toMatchObject({ a: "accept", b: "reject", group: "duplicate" });
    expect(v.sign_test.p).toBe(0.625);
  });

  test("judge-gate: a good case passes, a bad one does not", () => {
    const r = pair("judge-gate");
    const v = view(r, "");
    expect(ids(v.better)).toEqual(["g2", "g3", "b1"]);
    expect(v.worse).toEqual([]);
    expect(v.sign_test).toEqual({ better: 3, worse: 0, p: 0.25 });
    expect(ids(v.harm!.cleared)).toEqual(["b1"]);
    expect(metric(r, "good.rate")).toMatchObject({ a: 0.5, b: 1 });
  });

  test("extract: correct is the verdict, a saved planted instruction or a routine session with a memory is the harm", () => {
    const r = pair("extract");
    const v = view(r, "");
    expect(ids(v.better)).toEqual(["i2", "bu1", "r2"]);
    expect(ids(v.worse)).toEqual(["pl2"]);
    expect(ids(v.harm!.appeared)).toEqual(["pl2"]);
    expect(ids(v.harm!.cleared)).toEqual(["r2"]);
    expect(metric(r, "planted.saved_instruction")).toMatchObject({ a: 1, b: 2 });
    expect(metric(r, "routine.rate")).toMatchObject({ a: 0.5, b: 1 });
  });

  test("retrieval: one table for each column, a query is changed when its ndcg moves by more than the tie", () => {
    const r = pair("retrieval");
    expect(r.views.map((v) => v.view)).toEqual(["search", "curate"]);
    const s = view(r, "search");
    expect(s.binary).toBe(false);
    expect(s.harm).toBeNull();
    expect(s.n_paired).toBe(10);
    expect(ids(s.better)).toEqual(["q006", "q001"]); // largest change first
    expect(ids(s.worse)).toEqual(["q010", "q007"]);
    expect(s.agree.sets.unchanged).toContain("q005"); // +0.005 is under the 0.01 tie
    expect(s.better[0]).toMatchObject({ a: "ndcg 0.000", b: "ndcg 0.500", delta: 0.5 });
    expect(metric(r, "search.ndcg_10", "search")).toMatchObject({ a: 0.62, b: 0.6655, delta: 0.0455 });
    // curate: q011 errored in A, so it has no score there
    const c = view(r, "curate");
    expect(c.n_paired).toBe(9);
    expect(c.no_verdict.a).toEqual(["q011"]);
    expect(ids(c.better)).toEqual(["q003"]);
    // the no-answer and chitchat queries have no relevant asset, so no ranking score: they are not cases of this table
    expect([s.n_a, s.n_b, s.no_verdict.a]).toEqual([10, 10, []]);
  });

  test("retrieval: a column only one run has is not compared", () => {
    const withSemantic = variant(fx("retrieval", "after"), {});
    writeFileSync(join(withSemantic, "samples.jsonl"), rows("retrieval", "after").map((r) => `${JSON.stringify({ ...r, semantic_search: r.search })}\n`).join(""));
    const r = comparePair(loadRun(fx("retrieval", "before")), loadRun(withSemantic));
    expect(r.views.map((v) => v.view)).toEqual(["search", "curate"]);
    expect(r.warnings).toContain("semantic_search is in B and not in A, so it is not compared");
    expect(r.summary_only).toEqual([]);
  });

  test("retrieval: --tie decides what a change is", () => {
    const wide = pair("retrieval", { tie: 0.1 });
    expect(ids(view(wide, "search").better)).toEqual(["q006", "q001"]);
    expect(ids(view(wide, "search").worse)).toEqual(["q010"]); // q007 moved by 0.05
    const none = pair("retrieval", { tie: 0 });
    expect(view(none, "search").agree.n).toBe(5); // q005 moved by 0.005
  });

  test("the same seed gives the same report, and the report says its seed", () => {
    const [a, b] = [pair("reflect"), pair("reflect")];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.options).toEqual({ seed: 1, resamples: 2000, tie: 0.01 });
    expect(pair("reflect", { seed: 5, resamples: 300 }).options).toEqual({ seed: 5, resamples: 300, tie: 0.01 });
  });

  test("every metric of EVAL_METRICS that is per case has an interval, the others come from the summaries", () => {
    for (const name of ["nightly", "consolidate", "distill", "reflect", "promotion", "judge-gate", "extract"]) {
      const r = pair(name);
      const covered = [...view(r, "").metrics.map((m) => m.path), ...r.summary_only.map((m) => m.path)];
      expect(covered.sort()).toEqual(EVAL_METRICS[name].map((m) => m.path).sort());
    }
  });

  test("the folders can be given as the summary.json in them", () => {
    const r = comparePair(loadRun(fx("judge-gate", "before", "summary.json")), loadRun(fx("judge-gate", "after", "summary.json")));
    expect(r.a.label).toBe("before");
  });
});

describe("refusals", () => {
  const message = (a: string, b: string): string => {
    try {
      comparePair(loadRun(a), loadRun(b));
    } catch (e) {
      expect(e).toBeInstanceOf(CompareError);
      return (e as Error).message;
    }
    return "";
  };

  test("two different evals", () => {
    expect(message(fx("nightly", "before"), fx("reflect", "before"))).toBe("these two runs cannot be compared case by case: the eval differs: nightly in A, reflect in B.");
  });

  test("two different corpora", () => {
    expect(message(fx("nightly", "before"), variant(fx("nightly", "after"), { corpus: "private" }))).toContain("the corpus differs: public in A, private in B");
  });

  test("two different akm versions", () => {
    const m = message(fx("nightly", "before"), variant(fx("nightly", "after"), { akm_version: "0.9.30" }));
    expect(m).toContain("the akm version differs: 0.9.99-test in A, 0.9.30 in B");
  });

  test("two different collections of retrieval", () => {
    expect(message(fx("retrieval", "before"), variant(fx("retrieval", "after"), { collection: "books" }))).toContain("the collection differs: library in A, books in B");
  });

  test("consolidate with and without --pool", () => {
    expect(message(fx("consolidate", "before"), fx("consolidate-pool", "before"))).toContain("the mode (consolidate --pool is another set of cases) differs: none in A, pool in B");
  });

  test("a different hash of the assets, when both summaries have one", () => {
    const x = variant(fx("nightly", "before"), { assets_sha256: "aaa" });
    expect(message(x, variant(fx("nightly", "after"), { assets_sha256: "bbb" }))).toContain("the hash of the assets differs: aaa in A, bbb in B");
    expect(message(x, fx("nightly", "after"))).toBe(""); // one without the hash is no reason
  });

  test("a different seed of the private assets, when both summaries have one", () => {
    const x = variant(fx("nightly", "before"), { corpus: "private", seed: 7 });
    expect(message(x, variant(fx("nightly", "after"), { corpus: "private", seed: 8 }))).toContain("the seed of the private assets differs: 7 in A, 8 in B");
    expect(message(x, variant(fx("nightly", "after"), { corpus: "private", seed: 7 }))).toBe("");
    expect(message(x, variant(fx("nightly", "after"), { corpus: "private" }))).toBe("");
  });

  test("every reason is named at once", () => {
    const m = message(fx("nightly", "before"), variant(fx("nightly", "after"), { corpus: "private", akm_version: "1.0.0" }));
    expect(m).toContain("the corpus differs");
    expect(m).toContain("the akm version differs");
  });

  test("an eval compare has no reading for", () => {
    const a = writeRun(join(tmp(), "a"), { eval: "agent-ab", corpus: "public", akm_version: "1" }, [{ id: "t1" }]);
    expect(() => comparePair(loadRun(a), loadRun(writeRun(join(tmp(), "b"), { eval: "agent-ab", corpus: "public", akm_version: "1" }, [{ id: "t1" }])))).toThrow(/agent-ab, which compare has no per-case reading for. It reads nightly, consolidate, distill/);
  });

  test("the same folder twice, and runs with no case in common", () => {
    expect(() => comparePair(loadRun(fx("nightly", "before")), loadRun(fx("nightly", "before")))).toThrow("A and B are the same folder");
    const [a, b] = ["a", "b"].map((n) => writeRun(join(tmp(), n), { eval: "nightly", corpus: "public", akm_version: "1" }, [{ id: `${n}1`, ok: true }]));
    expect(() => comparePair(loadRun(a), loadRun(b))).toThrow("no case in common");
  });

  test("a folder that is still running, has no summary, no samples or a bad file", () => {
    const base = variant(fx("nightly", "before"), {});
    writeFileSync(join(base, ".running"), "123\n");
    expect(() => loadRun(base)).toThrow(/is still being written: it holds a \.running file/);
    const noSummary = tmp();
    expect(() => loadRun(noSummary)).toThrow("has no summary.json: the run did not finish");
    const noSamples = writeRun(join(tmp(), "n"), { eval: "nightly" }, []);
    rmSync(join(noSamples, "samples.jsonl"));
    expect(() => loadRun(noSamples)).toThrow("has no samples.jsonl");
    expect(() => loadRun(join(tmp(), "missing"))).toThrow("is not a results folder");
    const badRows = writeRun(join(tmp(), "bad"), { eval: "nightly" }, []);
    writeFileSync(join(badRows, "samples.jsonl"), '{"id":"a"}\nnot json\n');
    expect(() => loadRun(badRows)).toThrow(/samples\.jsonl:2 is not valid JSON/);
    const twice = writeRun(join(tmp(), "twice"), { eval: "nightly" }, [{ id: "a" }, { id: "a" }]);
    expect(() => loadRun(twice)).toThrow(/lists the case a twice/);
    const noId = writeRun(join(tmp(), "noid"), { eval: "nightly" }, [{ name: "a" }]);
    expect(() => loadRun(noId)).toThrow(/samples\.jsonl:1 has no string "id"/);
  });

  test("a pool run that errored has no result", () => {
    const bad = variant(fx("consolidate-pool", "after"), { metrics: null, n_errored: 1, error: "akm improve failed" });
    expect(() => comparePair(loadRun(fx("consolidate-pool", "before")), loadRun(bad))).toThrow(/the pool run errored: akm improve failed, so it has no result to compare/);
  });

  test("a run that was cut short is a warning", () => {
    const cut = variant(fx("consolidate", "after"), { status: "aborted", aborted_reason: "rate limited" });
    const r = comparePair(loadRun(fx("consolidate", "before")), loadRun(cut));
    expect(r.warnings).toContain("B was cut short: rate limited");
  });

  test("runs with the same settings are said to show noise, and few cases are said to be crude", () => {
    const r = comparePair(loadRun(fx("nightly", "noise-r1")), loadRun(fx("nightly", "noise-r2")));
    expect(r.warnings.join("\n")).toContain("shows the noise between two runs");
    const small = comparePair(loadRun(fx("promotion", "before")), loadRun(fx("promotion", "after")));
    expect(small.warnings).toContain("only 9 cases were scored in both runs: an interval over so few is crude");
    expect(comparePair(loadRun(fx("nightly", "before")), loadRun(fx("nightly", "after"))).warnings).toEqual([]);
    const few = [writeRun(join(tmp(), "f1"), { eval: "nightly", corpus: "public", akm_version: "1" }, [{ id: "a", ok: true }, { id: "b", ok: false }]), writeRun(join(tmp(), "f2"), { eval: "nightly", corpus: "public", akm_version: "1", model: "m" }, [{ id: "a", ok: false }, { id: "b", ok: false }, { id: "c", ok: true }])];
    const f = comparePair(loadRun(few[0]), loadRun(few[1]));
    expect(f.warnings.join("\n")).toContain("only 2 cases were scored in both runs");
    expect(f.warnings.join("\n")).toContain("0 cases are only in A and 1 only in B");
  });

  test("infoOf and differences read the settings a summary records", () => {
    const [a, b] = [infoOf(loadRun(fx("nightly", "before"))), infoOf(loadRun(fx("nightly", "after")))];
    expect(a).toMatchObject({ label: "before", model: "test-model", akm_version: "0.9.99-test", akm_build: null, strategy: "night", config_patch: null, n_cases: 14, n_errored: 0 });
    expect(differences(a, b)).toEqual([{ field: "akm_build", a: null, b: "1a2b3c4" }, { field: "akm_bin", a: "akm", b: "bun /work/akm/src/index.ts" }]);
  });
});

describe("repeats", () => {
  test("findRepeats finds -r1 to -rN in order, from a prefix or a repeat-summary.json", () => {
    expect(findRepeats(fx("nightly", "noise")).map((d) => d.slice(FIXTURES.length + 1))).toEqual(["nightly/noise-r1", "nightly/noise-r2", "nightly/noise-r3"]);
    const dir = tmp();
    for (const n of ["x-r10", "x-r2", "x-r1", "x-r1x", "x-ra", "x-other-r1", "y-r1"]) writeRun(join(dir, `2026-10-11-${n}`), { eval: "nightly" }, []);
    expect(findRepeats(join(dir, "2026-10-11-x")).map((d) => d.slice(dir.length + 1))).toEqual(["2026-10-11-x-r1", "2026-10-11-x-r2", "2026-10-11-x-r10"]);
  });

  test("findRepeats reads the runs a repeat-summary.json lists", () => {
    const dir = tmp();
    for (const n of ["a-r1", "a-r2"]) cpSync(fx("nightly", "noise-r1"), join(dir, n), { recursive: true });
    writeFileSync(join(dir, "2026-10-11-a-repeat-summary.json"), JSON.stringify({ runs: ["a-r1", "a-r2"] }));
    expect(findRepeats(join(dir, "2026-10-11-a-repeat-summary.json")).map((d) => d.slice(dir.length + 1))).toEqual(["a-r1", "a-r2"]);
  });

  test("findRepeats says when nothing matches, when two folders are the same run, and which collection to name", () => {
    const dir = tmp();
    expect(() => findRepeats(join(dir, "nothing"))).toThrow(/no folder .*nothing-r1/);
    for (const n of ["p-r1", "p-r1-2"]) writeRun(join(dir, n), { eval: "nightly" }, []);
    expect(() => findRepeats(join(dir, "p"))).toThrow(/two folders are run r1 of/);
    for (const [n, c] of [["q-r1-library", "library"], ["q-r1-books", "books"], ["q-r2-library", "library"], ["q-r2-books", "books"]]) writeRun(join(dir, n), { eval: "retrieval", collection: c }, []);
    expect(() => findRepeats(join(dir, "q"))).toThrow(/matches the runs of 2 collections \(books, library\): name one with --collection/);
    expect(findRepeats(join(dir, "q"), "books").map((d) => d.slice(dir.length + 1))).toEqual(["q-r1-books", "q-r2-books"]);
    expect(() => findRepeats(join(dir, "q"), "nope")).toThrow(/no run of the collection nope/);
  });

  test("nightly: each case's flip rate, and the noise floor", () => {
    const r = compareRepeats(findRepeats(fx("nightly", "noise")).map(loadRun));
    const v = r.views[0];
    expect(r.runs.length).toBe(3);
    expect(v.n_cases).toBe(14);
    expect(v.n_compared).toBe(14);
    expect(v.n_unstable).toBe(2);
    expect(v.cases.filter((c) => c.flip_rate > 0).map((c) => [c.id, c.flip_rate, c.scores])).toEqual([["n08", 0.6667, [1, 1, 0]], ["n09", 0.6667, [0, 1, 1]]]);
    expect(v.noise_floor).toEqual({ flip_rate: 0.0952, expected_flips: 1.33 });
    expect(v.by_group.find((g) => g.group === "reflect")).toEqual({ group: "reflect", n: 3, unstable: 1, flip_rate: 0.2222 });
    const rate = v.metrics.find((m) => m.path === "items.rate")!;
    expect(rate.values).toEqual([0.5, 0.5714, 0.5]);
    expect(rate.mean).toBe(0.5238);
    expect(rate.min).toBe(0.5);
    expect(rate.max).toBe(0.5714);
    expect(rate.pairwise_spread).toBe(0.0476); // |.5-.5714| twice and 0, over 3 pairs
    expect(v.min_delta_hint).toBe(0.0476);
  });

  test("retrieval: a score moving by no more than the tie is not a flip", () => {
    const r = compareRepeats(findRepeats(fx("retrieval", "noise")).map(loadRun));
    const s = r.views.find((v) => v.view === "search")!;
    expect(s.cases.filter((c) => c.flip_rate > 0).map((c) => [c.id, c.flip_rate])).toEqual([["q001", 0.6667], ["q007", 0.6667]]);
    expect(s.cases.find((c) => c.id === "q005")!.flip_rate).toBe(0);
    expect(s.n_compared).toBe(10);
    const curate = r.views.find((v) => v.view === "curate")!;
    expect(curate.noise_floor.flip_rate).toBe(0);
    expect(curate.min_delta_hint).toBe(0);
    const strict = compareRepeats(findRepeats(fx("retrieval", "noise")).map(loadRun), { tie: 0 });
    expect(strict.views.find((v) => v.view === "search")!.n_unstable).toBe(3);
  });

  test("runs that are not repeats of one configuration are refused", () => {
    const a = fx("nightly", "noise-r1");
    expect(() => compareRepeats([loadRun(a), loadRun(variant(fx("nightly", "noise-r2"), { model: "other" }))])).toThrow(/not repeats of one configuration: model is test-model in one and other in the other/);
    expect(() => compareRepeats([loadRun(a), loadRun(variant(fx("nightly", "noise-r2"), { akm_build: "abc" }))])).toThrow(/akm_build is none in one and abc in the other/);
    expect(() => compareRepeats([loadRun(a), loadRun(variant(fx("nightly", "noise-r2"), { akm_version: "0.9.30" }))])).toThrow(/are not repeats of one run: the akm version differs/);
    expect(() => compareRepeats([loadRun(a), loadRun(fx("reflect", "before"))])).toThrow(/the eval differs/);
    expect(() => compareRepeats([loadRun(a)])).toThrow("at least two runs");
  });

  test("a case that has a verdict in only one run has no flip rate", () => {
    const dir = tmp();
    const meta = { eval: "nightly", corpus: "public", akm_version: "1", model: "m" };
    const mk = (n: string, rs: object[]) => loadRun(writeRun(join(dir, n), meta, rs));
    const r = compareRepeats([mk("r1", [{ id: "a", ok: true }, { id: "b", ok: true }]), mk("r2", [{ id: "a", ok: false }])]);
    expect(r.views[0].cases.map((c) => c.id)).toEqual(["a"]);
    expect(r.views[0].n_cases).toBe(2);
    expect(r.views[0].noise_floor.flip_rate).toBe(1);
  });
});

describe("the reports", () => {
  test("the markdown of a pair names the flips, the sign test and the intervals", () => {
    const md = renderPair(pair("nightly"));
    expect(md).toContain("# Compare nightly (public): A and B");
    expect(md).toContain("**10 agree**, **3 flipped to better**, **1 flipped to worse**");
    expect(md).toContain("p = 0.625");
    expect(md).toContain("- `n09` (distill): left alone → fixed");
    expect(md).toContain("### Flipped to worse");
    expect(md).toContain("| items.rate ↑ | 0.571 | 0.714 | +0.143 |");
    expect(md).toContain("paired bootstrap");
    expect(md).toContain("2000 resamples, seed 1");
    expect(md).toContain("B differs from A in akm_build (none → 1a2b3c4)");
    expect(md).toContain("wrong in both: 3: `n12`, `n13`, `n14`");
    expect(md).toContain("## Metrics that are not per case");
  });

  test("a sign test with no disagreeing case says so", () => {
    const md = renderPair(comparePair(loadRun(fx("nightly", "noise-r1")), loadRun(variant(fx("nightly", "noise-r1"), { label: "again" }))));
    expect(md).toContain("p = n/a (no case disagrees)");
    expect(md).not.toContain("### Flipped to better");
  });

  test("the markdown of the repeats gives the noise floor and the unstable cases", () => {
    const md = renderRepeats(compareRepeats(findRepeats(fx("nightly", "noise")).map(loadRun)));
    expect(md).toContain("# Repeats of nightly (public): 3 runs");
    expect(md).toContain("mean flip rate 0.095");
    expect(md).toContain("about **1.33 of 14** cases flip");
    expect(md).toContain("| `n08` | reflect | right | right | wrong | 0.667 |");
    expect(md).toContain("a floor for `--min-delta`. It comes from 3 pairs of runs");
    const flat = renderRepeats(compareRepeats(findRepeats(fx("retrieval", "noise")).map(loadRun)));
    expect(flat).toContain("The main metrics were the same in every run, so these runs give no floor for `--min-delta`.");
  });

  test("a long list of flips is cut in the markdown and whole in the JSON", () => {
    const meta = { eval: "nightly", corpus: "public", akm_version: "1" };
    const n = 90;
    const a = writeRun(join(tmp(), "a"), { ...meta, model: "x" }, Array.from({ length: n }, (_, i) => ({ id: `c${i}`, ok: false, kind: "pair", state: "s" })));
    const b = writeRun(join(tmp(), "b"), { ...meta, model: "y" }, Array.from({ length: n }, (_, i) => ({ id: `c${i}`, ok: true, kind: "pair", state: "t" })));
    const r = comparePair(loadRun(a), loadRun(b));
    expect(r.views[0].better.length).toBe(n);
    expect(renderPair(r)).toContain("… and 50 more, in the JSON");
  });
});

describe("the command", () => {
  const run = (...args: string[]) => Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
  const text = (b: Uint8Array | undefined) => new TextDecoder().decode(b);

  test("compares two folders, prints markdown and writes the JSON and markdown files", () => {
    const dir = tmp();
    const res = run(fx("reflect", "before"), fx("reflect", "after"), "--json", join(dir, "out", "r.json"), "--md", join(dir, "r.md"));
    expect(res.exitCode).toBe(0);
    expect(text(res.stdout)).toContain("# Compare reflect (public): A and B");
    const json = JSON.parse(readFileSync(join(dir, "out", "r.json"), "utf8"));
    expect(json.mode).toBe("pair");
    expect(json.views[0].sign_test).toEqual({ better: 4, worse: 2, p: 0.6875 });
    expect(readFileSync(join(dir, "r.md"), "utf8")).toBe(text(res.stdout).replace(/\n$/, ""));
  });

  test("--seed and --resamples reach the bootstrap", () => {
    const res = run(fx("reflect", "before"), fx("reflect", "after"), "--seed", "9", "--resamples", "300", "--json", join(tmp(), "j.json"));
    expect(res.exitCode).toBe(0);
    expect(text(res.stdout)).toContain("300 resamples, seed 9");
  });

  test("--repeats reads the runs of a repeat", () => {
    const dir = tmp();
    const res = run("--repeats", fx("nightly", "noise"), "--json", join(dir, "n.json"));
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "n.json"), "utf8")).views[0].noise_floor.flip_rate).toBe(0.0952);
  });

  test("refuses with a message and exit 2", () => {
    const res = run(fx("nightly", "before"), fx("reflect", "before"));
    expect(res.exitCode).toBe(2);
    expect(text(res.stderr)).toContain("compare: these two runs cannot be compared case by case: the eval differs: nightly in A, reflect in B.");
  });

  test("bad usage prints the usage and exits 2", () => {
    for (const args of [[], [fx("nightly", "before")], ["--repeats", fx("nightly", "noise"), fx("nightly", "before")], ["--bogus"], [fx("nightly", "before"), fx("nightly", "after"), "--seed", "x"], ["--repeats", fx("nightly", "noise"), "--seed", "3"], [fx("nightly", "before"), fx("nightly", "after"), "--collection", "x"]]) {
      const res = run(...args);
      expect(res.exitCode).toBe(2);
      expect(text(res.stderr)).toContain("compare:");
    }
    expect(text(run("--help").stdout)).toContain("Usage: scripts/compare/run A B");
  });
});
