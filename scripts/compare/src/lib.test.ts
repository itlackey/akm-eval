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
import { CompareError, DEFAULT_TREATMENT, EXTRACT_INSIGHT_CLASSES, REFLECT_DEFECTS, SUPPORTED, compareRepeats, comparePair, compareSets, differences, findRepeats, infoOf, loadRun, pairedBootstrap, policyOf, quantile, refusals, renderPair, renderRepeats, resampleIndexes, rng, setBootstrap, signTest, signalOf, viewsOf, type CompareOptions, type PairReport, type Unit } from "./lib.ts";
import { type AkmArm, akmSummary, endpointOf, jobConfig, jobRecord, releaseArm } from "../../../lib/harbor/harbor.ts";
import { engineSettings, redactConfig } from "../../../lib/provenance.ts";
import { AXES, type Axis, type Member, checkMembers, configDigest, identityOf, incompleteOf, parseAxes } from "./policy.ts";

const FIXTURES = join(import.meta.dir, "fixtures");
const fx = (...parts: string[]): string => join(FIXTURES, ...parts);
/** The fixtures are a run before and a run after a change to the akm build, so their treatment is the build. */
const BUILD: Axis[] = ["build"];
const pair = (name: string, options: CompareOptions = {}): PairReport => comparePair(loadRun(fx(name, "before")), loadRun(fx(name, "after")), { treatment: BUILD, ...options });
const view = (r: PairReport, name = "") => r.views.find((v) => v.view === name)!;
const ids = (flips: { id: string }[]): string[] => flips.map((f) => f.id);
const metric = (r: PairReport, path: string, name = "") => [...view(r, name).metrics, ...view(r, name).info].find((m) => m.path === path)!;

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
    test(`distill ${side}`, () => expect(compare("distill", side, distillMetrics(rows("distill", side) as never))).toBe(3));
    test(`reflect ${side}`, () => expect(compare("reflect", side, reflectMetrics(rows("reflect", side) as never))).toBe(3));
    test(`promotion ${side}`, () => expect(compare("promotion", side, promotionMetrics(rows("promotion", side) as never))).toBe(3));
    test(`judge-gate ${side}`, () => expect(compare("judge-gate", side, judgeGateMetrics(rows("judge-gate", side) as never))).toBe(4));
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

  test("a different akm build is the treatment when it is declared, and a refusal when it is not", () => {
    const [a, b] = [loadRun(fx("nightly", "before")), loadRun(fx("nightly", "after"))];
    expect(a.summary.akm_build).not.toBe(b.summary.akm_build);
    expect(refusals(a, b, BUILD)).toEqual([]);
    expect(refusals(a, b)).toEqual(["the akm build differs: release in A, 1a2b3c4 in B", "the akm command (akm_bin) differs: akm in A, bun /work/akm/src/index.ts in B"]); // undeclared, it is a refusal
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
    const r = comparePair(loadRun(fx("retrieval", "before")), loadRun(withSemantic), { treatment: BUILD });
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
    const r = comparePair(loadRun(fx("judge-gate", "before", "summary.json")), loadRun(fx("judge-gate", "after", "summary.json")), { treatment: BUILD });
    expect(r.a.label).toBe("before");
  });
});

describe("refusals", () => {
  const message = (a: string, b: string, treatment: Axis[] = DEFAULT_TREATMENT): string => {
    try {
      comparePair(loadRun(a), loadRun(b), { treatment });
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

  test("a different hash of the cases is a refusal unless the inputs are the treatment, and a missing one makes the report exploratory", () => {
    const x = variant(fx("nightly", "before"), { assets_sha256: "aaa" });
    const y = variant(fx("nightly", "after"), { assets_sha256: "bbb" });
    expect(message(x, y, BUILD)).toContain("the cases (assets_sha256) differs: aaa in A, bbb in B");
    expect(message(x, y, ["build", "inputs"])).toBe("");
    const bare = variant(fx("nightly", "after"), { assets_sha256: null });
    expect(message(x, bare, BUILD)).toBe(""); // no refusal, but nothing says the cases are the same
    expect(comparePair(loadRun(x), loadRun(bare), { treatment: BUILD }).exploratory).toEqual(["the cases (assets_sha256) is not recorded in B"]);
    expect(comparePair(loadRun(variant(fx("nightly", "before"), { assets_sha256: null })), loadRun(bare), { treatment: BUILD }).exploratory).toEqual(["the cases (assets_sha256) is not recorded in A and B"]);
  });

  test("a different seed of the private assets is a refusal; a private run that records no seed makes the report exploratory", () => {
    const x = variant(fx("nightly", "before"), { corpus: "private", seed: 7 });
    expect(message(x, variant(fx("nightly", "after"), { corpus: "private", seed: 8 }), BUILD)).toContain("the seed of the private assets differs: 7 in A, 8 in B");
    expect(message(x, variant(fx("nightly", "after"), { corpus: "private", seed: 7 }), BUILD)).toBe("");
    const bare = variant(fx("nightly", "after"), { corpus: "private" });
    expect(message(x, bare, BUILD)).toBe("");
    expect(comparePair(loadRun(x), loadRun(bare), { treatment: BUILD }).exploratory).toEqual(["the seed of the private assets is not recorded in B"]);
    // a public run has no seed to record
    expect(comparePair(loadRun(fx("nightly", "before")), loadRun(fx("nightly", "after")), { treatment: BUILD }).exploratory).toEqual([]);
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
    expect(() => comparePair(loadRun(fx("consolidate-pool", "before")), loadRun(bad), { treatment: BUILD })).toThrow(/the pool run errored: akm improve failed, so it has no result to compare/);
  });

  test("a run that was cut short, or that does not say it finished, makes the report exploratory", () => {
    const cut = variant(fx("consolidate", "after"), { status: "aborted", aborted_reason: "rate limited" });
    const r = comparePair(loadRun(fx("consolidate", "before")), loadRun(cut), { treatment: BUILD });
    expect(r.exploratory).toEqual(["B was cut short: rate limited"]);
    expect(renderPair(r)).toContain("> **Exploratory.** This is not a conclusion, and an automated decision must not use it: B was cut short: rate limited.");
    expect(r.views[0].metrics.length).toBeGreaterThan(0); // the numbers are still there to read
    const noStatus = variant(fx("consolidate", "after"), { status: undefined });
    expect(comparePair(loadRun(fx("consolidate", "before")), loadRun(noStatus), { treatment: BUILD }).exploratory).toEqual(["B is not complete: the summary records no status, so the run is not known to have finished"]);
    const partial = variant(fx("consolidate", "after"), { n_run: 4 });
    expect(comparePair(loadRun(fx("consolidate", "before")), loadRun(partial), { treatment: BUILD }).exploratory).toEqual(["B is not complete: it ran 4 of 12 cases"]);
    const missing = variant(fx("consolidate", "after"), { completion: { expected: 12, completed: 10, failed: 0, missing: 2 } });
    expect(comparePair(loadRun(fx("consolidate", "before")), loadRun(missing), { treatment: BUILD }).exploratory).toEqual(["B is not complete: 2 of 12 expected results are missing"]);
    expect(pair("consolidate").exploratory).toEqual([]);
  });

  test("runs with the same settings are said to show noise, and few cases are said to be crude", () => {
    const r = comparePair(loadRun(fx("nightly", "noise-r1")), loadRun(fx("nightly", "noise-r2")));
    expect(r.warnings.join("\n")).toContain("shows the noise between two runs");
    const small = pair("promotion");
    expect(small.warnings).toContain("only 9 cases were scored in both runs: an interval over so few is crude");
    expect(pair("nightly").warnings).toEqual([]);
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

  test("runs that are not repeats of one configuration are refused, whichever run differs", () => {
    const a = fx("nightly", "noise-r1");
    const refused = (...others: string[]) => {
      try {
        compareRepeats([a, ...others].map(loadRun));
      } catch (e) {
        expect(e).toBeInstanceOf(CompareError);
        return (e as Error).message;
      }
      return "";
    };
    const r2 = fx("nightly", "noise-r2");
    expect(refused(variant(r2, { model: "other" }))).toContain("the model differs: other in the runs run, test-model in the runs noise-r1");
    expect(refused(variant(r2, { akm_build: "abc" }))).toContain("the akm build differs: abc in the runs run, release in the runs noise-r1");
    expect(refused(variant(r2, { akm_version: "0.9.30" }))).toContain("the akm version differs");
    expect(refused(fx("reflect", "before"))).toContain("the eval differs");
    expect(() => compareRepeats([loadRun(a)])).toThrow("at least two runs");
    // the differing run is the last of three: every run is checked, not the first against one other
    expect(refused(r2, variant(fx("nightly", "noise-r3"), { git_commit: "9999999" }))).toContain("the eval's code differs: commit 5d1c0de in the runs noise-r1 and noise-r2, commit 9999999 in the runs run");
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
    const res = run(fx("reflect", "before"), fx("reflect", "after"), "--treatment", "build", "--json", join(dir, "out", "r.json"), "--md", join(dir, "r.md"));
    expect(res.exitCode).toBe(0);
    expect(text(res.stdout)).toContain("# Compare reflect (public): A and B");
    const json = JSON.parse(readFileSync(join(dir, "out", "r.json"), "utf8"));
    expect(json.mode).toBe("pair");
    expect(json.views[0].sign_test).toEqual({ better: 4, worse: 2, p: 0.6875 });
    expect(readFileSync(join(dir, "r.md"), "utf8")).toBe(text(res.stdout).replace(/\n$/, ""));
  });

  test("--seed and --resamples reach the bootstrap", () => {
    const res = run(fx("reflect", "before"), fx("reflect", "after"), "--treatment", "build", "--seed", "9", "--resamples", "300", "--json", join(tmp(), "j.json"));
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

// ---- the comparison policy (F02, F14, F15) -------------------------------------------------------------------------------------

/** What a summary records of how its run was made, complete, so that two of them are fully identified. */
/** The engine of IDENTITY with the settings of its one engine changed. */
const engineWith = (over: Record<string, unknown>) => ({ ...IDENTITY.engine, ...over, engines: { model: { ...IDENTITY.engine.engines.model, ...over } } });
const IDENTITY = {
  eval: "nightly",
  corpus: "public",
  status: "complete",
  aborted_reason: null,
  akm_version: "0.9.26",
  akm_bin: "akm",
  akm_build: null,
  strategy: "night",
  config_patch: null,
  model: "m1",
  limit: null,
  seed: null,
  assets_sha256: "a".repeat(64),
  git_commit: "5d1c0de",
  config: { defaults: { llmEngine: "model" }, engines: { model: { kind: "llm", model: "m1", endpoint: "<MODEL_BASE_URL>", temperature: 0, enableThinking: false, timeoutMs: 120000 } }, improve: { strategies: { night: { processes: { reflect: {} } } } } },
  engine: { engine: "model", model: "m1", endpoint: "https://gateway.example.com/v1", temperature: 0, enableThinking: false, timeoutMs: 120000, engines: { model: { model: "m1", endpoint: "https://gateway.example.com/v1", temperature: 0, enableThinking: false, timeoutMs: 120000 } } },
};
const member = (side: string, name: string, over: Record<string, unknown> = {}): Member => ({ side, name, identity: identityOf({ ...IDENTITY, ...over }) });
const found = (r: { mismatches: { message: string }[] }): string[] => r.mismatches.map((f) => f.message);

/** A nightly run of 20 cases of which the first `right` are right, with the identity above and the changes `over`. */
function nightlyRun(dir: string, right: number, over: Record<string, unknown> = {}, ok?: boolean[]): string {
  const oks = ok ?? Array.from({ length: 20 }, (_, i) => i < right);
  const rows = oks.map((o, i) => ({ id: `c${String(i + 1).padStart(2, "0")}`, kind: "pair", ok: o, harm: false, state: o ? "fixed" : "left alone" }));
  const n = oks.filter(Boolean).length;
  return writeRun(dir, { ...IDENTITY, n_errored: 0, metrics: { items: { n: 20, ok: n, rate: n / 20 }, harm: { items: 0, outside_changed: 0, lessons_accepted: 0 }, calls: { failures: 0 } }, ...over }, rows);
}

describe("the comparison policy", () => {
  test("a treatment is axes separated by commas, and anything else is refused", () => {
    expect(parseAxes("build")).toEqual(["build"]);
    expect(parseAxes("model, build")).toEqual(["build", "model"]);
    expect(() => parseAxes("builds")).toThrow(/one or more of build, config, model, inputs, harness.*; not builds/);
    expect(() => parseAxes("")).toThrow(/one or more of/);
  });

  test("the config digest leaves out the model's settings, which are the model axis, and the order of the keys", () => {
    const base = identityOf(IDENTITY);
    expect(base.config).toMatch(/^[0-9a-f]{64}$/);
    const otherModel = { ...IDENTITY.config, engines: { model: { ...IDENTITY.config.engines.model, model: "m2", temperature: 0.7, timeoutMs: 1 } } };
    expect(configDigest(otherModel)).toBe(base.config);
    expect(configDigest({ improve: IDENTITY.config.improve, engines: IDENTITY.config.engines, defaults: IDENTITY.config.defaults })).toBe(base.config);
    expect(configDigest({ ...IDENTITY.config, improve: { strategies: { night: { processes: { reflect: { qualityGate: true } } } } } })).not.toBe(base.config);
    expect(configDigest(undefined)).toBeNull();
  });

  test("an axis outside the treatment must be the same: the build, config, model, cases and code each refuse", () => {
    const refused = (over: Record<string, unknown>, treatment: Axis[] = []) => found(checkMembers([member("A", "a"), member("B", "b", over)], treatment));
    expect(refused({})).toEqual([]);
    expect(refused({ akm_version: "0.10.0" })).toEqual(["the akm version differs: 0.9.26 in A, 0.10.0 in B"]);
    expect(refused({ akm_build: "v0.9.0-beta.60-2648-g9f6ad3461" })).toEqual(["the akm build differs: release in A, v0.9.0-beta.60-2648-g9f6ad3461 in B"]);
    expect(refused({ strategy: "quick" })).toEqual(["the strategy differs: night in A, quick in B"]);
    expect(refused({ config_patch: { sha256: "b".repeat(64) } })).toEqual([`the config patch differs: none in A, ${"b".repeat(12)} in B`]);
    expect(refused({ config: { ...IDENTITY.config, improve: { strategies: {} } } })).toHaveLength(1);
    expect(refused({ model: "m2" })).toEqual(["the model differs: m1 in A, m2 in B"]);
    expect(refused({ engine: engineWith({ temperature: 0.7 }) })[0]).toMatch(/^the engine settings .* differs: .*temperature 0.* in A, .*temperature 0.7.* in B$/);
    expect(refused({ engine: engineWith({ endpoint: "other.example.com" }) })).toHaveLength(1);
    expect(refused({ engine: engineWith({ enableThinking: true }) })).toHaveLength(1);
    expect(refused({ engine: engineWith({ timeoutMs: 60000 }) })).toHaveLength(1);
    expect(refused({ assets_sha256: "c".repeat(64) })).toEqual([`the cases (assets_sha256) differs: ${"a".repeat(12)} in A, ${"c".repeat(12)} in B`]);
    expect(refused({ git_commit: "9999999" })).toEqual(["the eval's code differs: commit 5d1c0de in A, commit 9999999 in B"]);
    expect(refused({ harness_sha256: "d".repeat(64) })).toEqual([]); // one side has a digest and the other does not: they fall back to the commit
  });

  test("the uncommitted changes of the akm build are part of the build: another fingerprint is another build, a value against null is too, and null on both sides matches", () => {
    const [A, B] = ["a".repeat(64), "b".repeat(64)];
    const dirty = (fingerprint: string | null) => ({ akm_build: "v0.9.26-1-gabc123-dirty", akm_build_fingerprint: fingerprint });
    const refused = (a: Record<string, unknown>, b: Record<string, unknown>, treatment: Axis[] = []) => found(checkMembers([member("A", "a", a), member("B", "b", b)], treatment));
    const label = "the uncommitted changes and installed dependencies of the akm build (akm_build_fingerprint)";
    expect(identityOf({ ...IDENTITY, ...dirty(A) }).akm_build_fingerprint).toBe(A);
    expect(identityOf(IDENTITY).akm_build_fingerprint).toBeNull();
    expect(refused({}, {})).toEqual([]); // two clean builds, or two releases, or summaries from before the fingerprint
    expect(refused(dirty(null), dirty(null))).toEqual([]);
    expect(refused(dirty(A), dirty(A))).toEqual([]); // the same edits
    expect(refused(dirty(A), dirty(B))).toEqual([`${label} differs: ${A.slice(0, 12)} in A, ${B.slice(0, 12)} in B`]);
    expect(refused(dirty(A), dirty(null))).toEqual([`${label} differs: ${A.slice(0, 12)} in A, none in B`]);
    expect(refused(dirty(null), dirty(A))).toEqual([`${label} differs: none in A, ${A.slice(0, 12)} in B`]);
    // it is on the build axis: a build treatment lets the sides differ in it, and no other treatment does
    expect(checkMembers([member("A", "a", dirty(A)), member("B", "b", dirty(B))], ["build"]).treated.map((f) => f.message)).toEqual([`${label} differs: ${A.slice(0, 12)} in A, ${B.slice(0, 12)} in B`]);
    expect(refused(dirty(A), dirty(B), ["build"])).toEqual([]);
    for (const treatment of [["config"], ["model"], ["inputs"], ["harness"]] as Axis[][]) expect(refused(dirty(A), dirty(B), treatment)).toHaveLength(1);
    // the runs of one side are one build, whatever is being compared
    const repeats = [member("A", "r1", dirty(A)), member("A", "r2", dirty(B)), member("A", "r3", dirty(A)), member("B", "r1", dirty(A))];
    expect(found(checkMembers(repeats, []))).toEqual([`${label} differs: ${A.slice(0, 12)} in A r1 and r3 and B, ${B.slice(0, 12)} in A r2`]);
    expect(found(checkMembers(repeats, ["build"]))).toEqual([`${label} differs among the repeats of A: ${A.slice(0, 12)} in A r1 and r3, ${B.slice(0, 12)} in A r2`]);
  });

  test("a declared axis may differ between the sides, and is listed as the treatment; every other still may not", () => {
    const r = checkMembers([member("A", "a"), member("B", "b", { akm_version: "0.10.0", akm_build: "b2", model: "m2" })], ["build"]);
    expect(found(r)).toEqual(["the model differs: m1 in A, m2 in B"]);
    expect(r.treated.map((f) => f.message)).toEqual(["the akm version differs: 0.9.26 in A, 0.10.0 in B", "the akm build differs: release in A, b2 in B"]);
    expect(found(checkMembers([member("A", "a"), member("B", "b", { akm_version: "0.10.0", model: "m2" })], ["build", "model"]))).toEqual([]);
  });

  test("the repeats of one side must agree on every axis, the declared ones too", () => {
    const members = [member("A", "r1"), member("A", "r2"), member("A", "r3", { akm_build: "other" }), member("B", "r1", { akm_build: "b2" })];
    const r = checkMembers(members, ["build"]);
    expect(found(r)).toEqual(["the akm build differs among the repeats of A: release in A r1 and r2, other in A r3"]);
    // permuting the repeats of a side changes no message
    const permuted = checkMembers([members[2], members[0], members[1], members[3]], ["build"]);
    expect(found(permuted)).toEqual(found(r));
  });

  test("the settings of every engine a run uses are compared, a routed engine too, and the endpoint's path with them (R02)", () => {
    const worker = (over: Record<string, unknown>) => ({ model: "w", endpoint: "https://worker-a.example/v1", temperature: 0, enableThinking: false, timeoutMs: 120000, ...over });
    const routed = (w: Record<string, unknown>) => ({
      config: { ...IDENTITY.config, engines: { ...IDENTITY.config.engines, worker: { kind: "llm", model: "w", endpoint: "<WORKER_URL>" } }, improve: { strategies: { night: { processes: { distill: { engine: "worker" } } } } } },
      engine: { ...IDENTITY.engine, engines: { ...IDENTITY.engine.engines, worker: worker(w) } },
    });
    const refused = (b: Record<string, unknown>, treatment: Axis[] = []) => checkMembers([member("A", "a", routed({})), member("B", "b", routed(b))], treatment);
    expect(found(refused({}))).toEqual([]);
    for (const change of [{ model: "w2" }, { endpoint: "https://worker-b.example/v1" }, { endpoint: "https://worker-a.example/v2" }, { temperature: 0.7 }, { timeoutMs: 60000 }, { enableThinking: true }]) {
      const r = refused(change);
      expect(found(r), JSON.stringify(change)).toHaveLength(1);
      expect(r.mismatches[0].axis).toBe("model");
      expect(found(refused(change, ["model"]))).toEqual([]); // declared as a model treatment
      expect(refused(change, ["model"]).treated).toHaveLength(1);
    }
    // the endpoint path of the default engine is part of the identity too
    expect(found(checkMembers([member("A", "a"), member("B", "b", { engine: { ...IDENTITY.engine, engines: { model: { ...IDENTITY.engine.engines.model, endpoint: "https://gateway.example.com/v2" } } } })], []))).toHaveLength(1);
  });

  test("the order of the keys of the engine settings does not change the identity, and a credential is not in it (R02)", () => {
    const [a, b] = [identityOf(IDENTITY), identityOf({ ...IDENTITY, engine: { engines: { model: Object.fromEntries(Object.entries(IDENTITY.engine.engines.model).reverse()) } } })];
    expect(a.engine).toBe(b.engine);
    const produced = engineSettings({ defaults: { llmEngine: "m" }, engines: { m: { model: "x", endpoint: "https://user:DUMMY_PASS@h.example/v1?api_key=DUMMY_SECRET" } } });
    expect(JSON.stringify(identityOf({ ...IDENTITY, engine: produced }))).not.toMatch(/DUMMY/);
  });

  test("evidence that is missing is a gap, on one side or on neither, never a pass", () => {
    const gaps = (a: Record<string, unknown>, b: Record<string, unknown>) => checkMembers([member("A", "a", a), member("B", "b", b)], []).gaps.map((f) => f.message);
    expect(gaps({}, {})).toEqual([]);
    expect(gaps({ assets_sha256: null }, {})).toEqual(["the cases (assets_sha256) is not recorded in A"]);
    expect(gaps({ assets_sha256: null }, { assets_sha256: null })).toEqual(["the cases (assets_sha256) is not recorded in A and B"]);
    expect(gaps({}, { config: undefined })).toEqual(["the akm config is not recorded in B"]);
    expect(gaps({ engine: undefined }, {})).toEqual(["the engine settings (model, endpoint, temperature, thinking, time limit of each engine used) is not recorded in A"]);
    expect(gaps({ corpus: "private" }, { corpus: "private", seed: 3 })).toEqual(["the seed of the private assets is not recorded in A"]);
    // a declared axis is not checked for evidence
    expect(checkMembers([member("A", "a", { assets_sha256: null }), member("B", "b")], ["inputs"]).gaps).toEqual([]);
  });

  test("the eval's code is identified by a digest when both have one, else by a clean commit; a dirty or missing commit is a gap", () => {
    const run = (a: Record<string, unknown>, b: Record<string, unknown>) => checkMembers([member("A", "a", a), member("B", "b", b)], []);
    expect(run({ git_commit: "5d1c0de-dirty" }, { git_commit: "5d1c0de-dirty" }).gaps.map((f) => f.message)).toEqual(["the eval's code is not identified in A and B (no harness_sha256, and git_commit is missing or has changes that are not committed)"]);
    expect(run({ git_commit: undefined }, {}).gaps.map((f) => f.message)).toEqual(["the eval's code is not identified in A (no harness_sha256, and git_commit is missing or has changes that are not committed)"]);
    expect(run({ git_commit: "unknown" }, {}).gaps).toHaveLength(1);
    // dirty trees with the same digest of the code are the same code
    const digest = { harness_sha256: "d".repeat(64), git_commit: "5d1c0de-dirty" };
    expect(run(digest, digest)).toMatchObject({ gaps: [], mismatches: [] });
    expect(found(run(digest, { ...digest, harness_sha256: "e".repeat(64) }))).toEqual([`the eval's code differs: digest ${"d".repeat(12)} in A, digest ${"e".repeat(12)} in B`]);
    // a digest on one side only falls back to the commits
    expect(run(digest, { git_commit: "5d1c0de" }).gaps).toHaveLength(1);
    expect(run({ ...digest, git_commit: "5d1c0de" }, { git_commit: "5d1c0de" })).toMatchObject({ gaps: [], mismatches: [] });
  });

  test("a summary is complete only when it says status complete and nothing is missing from it", () => {
    expect(incompleteOf({ status: "complete" })).toBeNull();
    expect(incompleteOf({ status: "complete", completion: { expected: 9, completed: 9, failed: 0, missing: 0 } })).toBeNull();
    expect(incompleteOf({ status: "aborted", aborted_reason: "rate limited" })).toEqual({ aborted: true, detail: "rate limited" });
    expect(incompleteOf({ status: "aborted" })).toEqual({ aborted: true, detail: "no reason recorded" });
    expect(incompleteOf({})?.detail).toContain("records no status");
    expect(incompleteOf({ status: "running" })?.detail).toBe('the summary\'s status is "running", not "complete"');
    expect(incompleteOf({ status: "complete", completion: { expected: 9, completed: 7, failed: 0, missing: 2 } })?.detail).toBe("2 of 9 expected results are missing");
    expect(incompleteOf({ status: "complete", n_run: 3, n_cases: 9 })?.detail).toBe("it ran 3 of 9 cases");
    expect(incompleteOf({ status: "complete", n_run: 3, n_cases: 9, limit: 3 })).toBeNull();
  });
});

// ---- the Harbor evals' identity (R01) ------------------------------------------------------------------------------------------

/** A summary of a Harbor eval as the runners write it: the job, the akm arm and its AKM_* settings, the engine and the digest of the cases. */
function harborSummary(over: { arm?: AkmArm; akmEnv?: Record<string, string>; baseUrl?: string; model?: string; attempts?: number; tasks?: string[] } = {}): Record<string, any> {
  const { arm = releaseArm(), akmEnv = {}, baseUrl = "https://gateway.example/deployment-A/v1", model = "openai/m1", attempts = 3, tasks = ["a", "b"] } = over;
  const cfg = jobConfig({ name: "n", model, jobsDir: "/run/jobs", attempts, librariesDir: "/run/libraries", datasets: [{ path: "/repo/evals/agent-ab/tasks", task_names: tasks }], arm, packagesDir: arm.packages ?? undefined, akmEnv });
  const job = jobRecord(cfg, "/run", "/repo");
  const observed = { akm_version: [], plugin_akm_cli: [], assets_indexed: [], env: null };
  return { eval: "agent-ab", corpus: "public", status: "complete", git_commit: "5d1c0de", model, ...akmSummary(arm, akmEnv, [], observed), assets_sha256: "a".repeat(64), engine: { model, endpoint: endpointOf({ OPENAI_BASE_URL: baseUrl }) }, config: redactConfig(job), job };
}
const checkoutArm = (over: Partial<AkmArm> = {}): AkmArm => ({ bin: "~/akm", build: "v0.9.27-3-gabc1234", build_fingerprint: null, cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: "0.9.27", tarball: "akm-opencode-0.9.27.tgz" }, packages: "/run/akm-packages", ...over });

describe("the identity of a Harbor summary (R01)", () => {
  const run = (summary: Record<string, any>, name: string) => ({ dir: name, summary, rows: [] });
  const policy = (a: Record<string, any>[], b: Record<string, any>[], treatment: Axis[]) => policyOf(a.map((s, i) => run(s, `a${i}`)), b.map((s, i) => run(s, `b${i}`)), treatment);

  test("another endpoint, another deployment path or another AKM_* setting is refused unless it is the treatment", () => {
    const base = harborSummary();
    expect(policy([base], [harborSummary()], ["build"])).toMatchObject({ mismatches: [], gaps: [], treated: [] });
    for (const [change, axis] of [
      [{ baseUrl: "https://other.example/deployment-A/v1" }, "model"],
      [{ baseUrl: "https://gateway.example/deployment-B/v1" }, "model"],
      [{ akmEnv: { AKM_CURATE_TIMEOUT: "30" } }, "config"],
    ] as const) {
      const other = harborSummary(change);
      const refused = policy([base], [other], ["build"]);
      expect(refused.mismatches.map((f) => f.axis), JSON.stringify(change)).toEqual([axis]);
      expect(policy([base], [other], ["build", axis as Axis]).mismatches).toEqual([]); // declared, the difference is the treatment
      expect(policy([base], [other], ["build", axis as Axis]).treated).toHaveLength(1);
    }
  });

  test("a summary written before library_assets was left out of the job still compares with one written after", () => {
    const base = harborSummary();
    const older = structuredClone(base);
    older.config.agents = older.config.agents.map((agent: Record<string, any>) => ({ ...agent, kwargs: { ...(agent.kwargs ?? {}), library_assets: 259 } }));
    expect(JSON.stringify(older.config)).toContain('"library_assets":259');
    expect(policy([base], [older], ["build"])).toMatchObject({ mismatches: [], gaps: [], treated: [] });
    expect(found(policy([base], [harborSummary({ akmEnv: { AKM_CURATE_TIMEOUT: "30" } })], ["build"]))).toHaveLength(1); // the digest still tells a real setting apart
  });

  test("a build treatment is not refused for what the build changes: the akm and plugin versions, the tarballs, the folders", () => {
    const [release, checkout] = [harborSummary(), harborSummary({ arm: checkoutArm() })];
    const r = policy([release], [checkout], ["build"]);
    expect(r.mismatches).toEqual([]);
    expect(r.gaps).toEqual([]);
    expect(r.treated.map((f) => f.axis)).toEqual(["build", "build", "build"]); // version (with the plugin's), build, command
    // without the treatment the same pair is refused on the build axis alone
    expect(new Set(policy([release], [checkout], []).mismatches.map((f) => f.axis))).toEqual(new Set(["build"]));
    // another plugin with the same akm is another build
    const plugin = harborSummary({ arm: { ...releaseArm(), plugin: { version: "0.9.99", tarball: null } } });
    expect(policy([release], [plugin], []).mismatches.map((f) => f.axis)).toEqual(["build"]);
  });

  test("the model and the cases are other axes: another model is refused as the model, and the task list is the cases' digest, not the config", () => {
    const base = harborSummary();
    expect(policy([base], [harborSummary({ model: "openai/m2" })], ["build"]).mismatches.map((f) => f.axis).sort()).toEqual(["model", "model"]);
    expect(policy([base], [harborSummary({ tasks: ["a"] })], ["build"]).mismatches).toEqual([]); // the tasks are the cases (assets_sha256), which the summary digests
  });

  test("a summary that records no config, no AKM_* settings or no engine is a gap, so the result is exploratory", () => {
    const base = harborSummary();
    const legacy = { ...base, config: undefined, engine: undefined };
    expect(policy([base], [legacy], ["build"]).gaps.map((f) => f.field).sort()).toEqual(["config", "engine"]);
    expect(policy([legacy], [legacy], ["build"]).gaps).toHaveLength(2);
    expect(policy([base], [{ ...base, akm_env: undefined }], ["build"]).gaps.map((f) => f.field)).toEqual(["config"]);
    // an endpoint recorded as a host only (before the path was kept) does not say which deployment it was
    expect(policy([base], [{ ...base, engine: { model: "openai/m1", endpoint: "gateway.example" } }], ["build"]).gaps.map((f) => f.field)).toEqual(["engine"]);
    // a declared axis is not asked for evidence
    expect(policy([base], [legacy], ["build", "config", "model"]).gaps).toEqual([]);
  });

  test("the repeats of one side must agree too", () => {
    const [a, b, c] = [harborSummary(), harborSummary(), harborSummary({ akmEnv: { AKM_X: "1" } })];
    const r = policy([a, b, c], [harborSummary()], ["build"]);
    expect(found(r)).toHaveLength(1);
    expect(found(r)[0]).toMatch(/^the akm config differs: .* in A a2, .* in A a0 and a1 and B$/);
    expect(found(policy([a, b, c], [harborSummary()], ["build", "config"]))[0]).toContain("among the repeats of A");
  });

  test("no credential reaches the identity", () => {
    const s = harborSummary({ baseUrl: "https://user:DUMMY_PASS@gateway.example/v1?api_key=DUMMY_QUERY" });
    expect(JSON.stringify(identityOf(s))).not.toMatch(/DUMMY/);
  });
});

describe("the embedder is part of the scope (#69)", () => {
  const ALL = [...AXES] as Axis[];

  test("a run with the real embedder and one with the deterministic embedder are refused whatever the treatment", () => {
    const real = variant(fx("nightly", "before"), { embedder: "real" });
    const deterministic = variant(fx("nightly", "after"), { embedder: "deterministic" });
    for (const treatment of [BUILD, DEFAULT_TREATMENT, ALL]) {
      expect(() => comparePair(loadRun(real), loadRun(deterministic), { treatment })).toThrow("the settings that change what a run measures (the embedder) differs: embedder real in A, embedder deterministic in B");
    }
    // the same embedder on both sides is no difference, and a run that records none against one that does is one
    expect(comparePair(loadRun(real), loadRun(variant(fx("nightly", "after"), { embedder: "real" })), { treatment: BUILD }).exploratory).toEqual([]);
    expect(() => comparePair(loadRun(real), loadRun(fx("nightly", "after")), { treatment: BUILD })).toThrow("embedder real in A, none in B");
  });

  test("the policy the matrix applies refuses it too, as a mismatch of the scope", () => {
    const member = (side: string, embedder: string): Member => ({ side, name: side, identity: identityOf({ ...JSON.parse(readFileSync(fx("nightly", "before", "summary.json"), "utf8")), embedder }) });
    const found = checkMembers([member("A", "real"), member("B", "deterministic")], ALL).mismatches;
    expect(found).toEqual([{ axis: "scope", field: "hints", message: "the settings that change what a run measures (the embedder) differs: embedder real in A, embedder deterministic in B" }]);
    expect(checkMembers([member("A", "real"), member("B", "real")], []).mismatches).toEqual([]);
  });
});

describe("retrieval: the judged results (#71)", () => {
  /** The retrieval fixture of a side with its rows changed, for the queries that have a ranking score. */
  function changed(side: string, edit: (scores: Record<string, any>, column: string) => Record<string, any>): string {
    const dir = variant(fx("retrieval", side), {});
    writeFileSync(join(dir, "samples.jsonl"), rows("retrieval", side).map((r) => `${JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (k === "search" || k === "curate") && v?.scores ? { ...v, scores: edit(v.scores, k) } : v])))}\n`).join(""));
    return dir;
  }
  const condensed = (scores: Record<string, any>) => ({ ...scores, ndcg_10_condensed: Math.min(1, scores.ndcg_10 + 0.1) });

  test("ndcg_10_condensed and judged_10 are reported beside ndcg_10, with the metrics the matrix judges and without a verdict of their own to judge by", () => {
    const r = comparePair(loadRun(changed("before", condensed)), loadRun(changed("after", condensed)), { treatment: BUILD });
    const search = view(r, "search");
    expect([...search.metrics, ...search.info].map((m) => [m.path, m.role])).toEqual([["search.ndcg_10", "main"], ["search.ndcg_10_condensed", "info"], ["search.judged_10", "info"]]);
    expect(search.metrics.length).toBe(1); // what the matrix judges is as it was
    expect(metric(r, "search.judged_10", "search")).toMatchObject({ a: 0.9, b: 0.9, delta: 0 });
    expect(metric(r, "search.ndcg_10_condensed", "search")?.a).toBeGreaterThan(metric(r, "search.ndcg_10", "search")?.a as number); // never below ndcg_10
    expect(r.exploratory).toEqual([]);
    const md = renderPair(r);
    expect(md).toContain("| search.ndcg_10_condensed ↑ (not judged) |");
    expect(md).toContain("| search.judged_10 ↑ (not judged) | 0.9 | 0.9 | 0 |");
  });

  test("a judged_10 that falls from A to B makes the comparison exploratory, whatever ndcg_10 says, and the note says to grade the results first", () => {
    const fewerJudged = changed("after", (scores, column) => ({ ...condensed(scores), judged_10: column === "search" ? 0.6 : scores.judged_10 }));
    const r = comparePair(loadRun(changed("before", condensed)), loadRun(fewerJudged), { treatment: BUILD });
    expect(metric(r, "search.judged_10", "search")).toMatchObject({ a: 0.9, b: 0.6, delta: -0.3 });
    expect(r.exploratory).toEqual(["judged_10 (search) fell from 0.9 to 0.6: B surfaces results nobody graded for these queries, and ndcg_10 counts them as not relevant. Grade them with evals/retrieval/label --from <B's results folder> and compare again"]);
    expect(renderPair(r)).toContain("> **Exploratory.**");
    // a fall within the tie is noise, and a rise is not a reason to doubt B
    const slight = changed("after", (scores) => ({ ...condensed(scores), judged_10: 0.895 }));
    expect(comparePair(loadRun(changed("before", condensed)), loadRun(slight), { treatment: BUILD }).exploratory).toEqual([]);
    const more = changed("after", (scores) => ({ ...condensed(scores), judged_10: 1 }));
    expect(comparePair(loadRun(changed("before", condensed)), loadRun(more), { treatment: BUILD }).exploratory).toEqual([]);
  });

  test("a run whose rows have neither shows them as missing, and does not guess", () => {
    const r = pair("retrieval");
    expect(metric(r, "search.ndcg_10_condensed", "search")).toMatchObject({ a: null, b: null, delta: null });
    expect(metric(r, "search.judged_10", "search")).toMatchObject({ a: 0.9 });
  });
});

describe("a release against a release", () => {
  const release = (dir: string, right: number, over: Record<string, unknown> = {}) => nightlyRun(join(tmp(), dir), right, { akm_version: "0.9.26", ...over });

  test("with the build declared, two releases with common cases and code compare, and the report says what the treatment was", () => {
    const [a, b] = [release("a", 8), release("b", 13, { akm_version: "0.10.0", akm_bin: "akm-0.10", akm_build: null })];
    const r = comparePair(loadRun(a), loadRun(b), { treatment: ["build"] });
    expect(r.exploratory).toEqual([]);
    expect(r.treatment).toEqual(["build"]);
    expect(r.treated).toEqual(["the akm version differs: 0.9.26 in A, 0.10.0 in B", "the akm command (akm_bin) differs: akm in A, akm-0.10 in B"]);
    expect(r.views[0].better).toHaveLength(5);
    expect(renderPair(r)).toContain("Treatment: build. Nothing else may differ between A and B. They differ in: the akm version differs");
  });

  test("without it the comparison is refused, and says which axis to declare", () => {
    const [a, b] = [release("a", 8), release("b", 13, { akm_version: "0.10.0" })];
    expect(() => comparePair(loadRun(a), loadRun(b))).toThrow(/the akm version differs: 0.9.26 in A, 0.10.0 in B\. If a difference is what you are measuring, name its axis with --treatment/);
  });

  test("the model, the cases and the eval's code must still be the same", () => {
    const base = release("a", 8);
    const refuse = (over: Record<string, unknown>) => () => comparePair(loadRun(base), loadRun(release("b", 13, { akm_version: "0.10.0", ...over })), { treatment: ["build"] });
    expect(refuse({ model: "m2" })).toThrow(/the model differs: m1 in A, m2 in B/);
    expect(refuse({ engine: engineWith({ temperature: 0.7 }) })).toThrow(/the engine settings .* differs/);
    expect(refuse({ assets_sha256: "c".repeat(64) })).toThrow(/the cases \(assets_sha256\) differs/);
    expect(refuse({ git_commit: "9999999" })).toThrow(/the eval's code differs: commit 5d1c0de in A, commit 9999999 in B/);
    expect(refuse({ strategy: "quick" })).toThrow(/the strategy differs/);
  });

  test("two edits of one akm commit are two builds: refused, unless the build is the treatment", () => {
    const edited = (dir: string, right: number, fingerprint: string | null) => release(dir, right, { akm_build: "v0.9.26-1-gabc123-dirty", akm_build_fingerprint: fingerprint });
    const [a, b] = [edited("a", 8, "a".repeat(64)), edited("b", 13, "b".repeat(64))];
    const refusal = /the uncommitted changes and installed dependencies of the akm build \(akm_build_fingerprint\) differs: aaaaaaaaaaaa in A, bbbbbbbbbbbb in B\. If a difference is what you are measuring, name its axis with --treatment/;
    expect(() => comparePair(loadRun(a), loadRun(b))).toThrow(refusal);
    expect(() => comparePair(loadRun(a), loadRun(edited("c", 13, null)))).toThrow(/differs: aaaaaaaaaaaa in A, none in B/);
    const r = comparePair(loadRun(a), loadRun(b), { treatment: ["build"] });
    expect(r.treated).toEqual([`the uncommitted changes and installed dependencies of the akm build (akm_build_fingerprint) differs: ${"a".repeat(12)} in A, ${"b".repeat(12)} in B`]);
    expect(r.exploratory).toEqual([]);
    // the report shows what tells the two builds apart, and does not call them the same akm
    expect(differences(infoOf(loadRun(a)), infoOf(loadRun(b))).map((d) => d.field)).toEqual(["akm_build_fingerprint"]);
    expect(renderPair(r)).toContain(`build v0.9.26-1-gabc123-dirty (changes ${"b".repeat(12)})`);
    expect(r.warnings.join("\n")).not.toContain("shows the noise between two runs");
    // the same edits are the same build
    expect(comparePair(loadRun(a), loadRun(edited("d", 13, "a".repeat(64)))).views[0].better).toHaveLength(5);
  });

  test("the model and the config may differ when they are the treatment, as they did before there was a flag", () => {
    const base = release("a", 8);
    const plain = comparePair(loadRun(base), loadRun(release("b", 13, { model: "m2", strategy: "quick", config_patch: { sha256: "b".repeat(64) } })));
    expect(plain.treatment).toEqual(["config", "model"]);
    expect(plain.exploratory).toEqual([]);
    expect(plain.differences.map((d) => d.field)).toEqual(["model", "strategy", "config_patch"]);
  });

  test("a partial or aborted comparison, and one that lacks evidence, is exploratory; the numbers are kept", () => {
    const base = release("a", 8);
    const partial = comparePair(loadRun(base), loadRun(release("b", 13, { status: "aborted", aborted_reason: "the endpoint went down" })));
    expect(partial.exploratory).toEqual(["B was cut short: the endpoint went down"]);
    expect(partial.views[0].metrics.length).toBeGreaterThan(0);
    const dirty = comparePair(loadRun(release("c", 8, { git_commit: "5d1c0de-dirty" })), loadRun(release("d", 13, { git_commit: "5d1c0de-dirty" })));
    expect(dirty.exploratory).toEqual(["the eval's code is not identified in A and B (no harness_sha256, and git_commit is missing or has changes that are not committed)"]);
    expect(renderPair(dirty)).toContain("> **Exploratory.**");
    const bare = comparePair(loadRun(release("e", 8, { assets_sha256: null })), loadRun(release("f", 13, { assets_sha256: null })));
    expect(bare.exploratory).toEqual(["the cases (assets_sha256) is not recorded in A and B"]);
  });

  test("a plain two-folder comparison of one build is as it was: no flag, no banner, and the same numbers", () => {
    const res = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), fx("nightly", "before"), variant(fx("nightly", "before"), { label: "again" })], { stdout: "pipe", stderr: "pipe" });
    expect(res.exitCode).toBe(0);
    const out = new TextDecoder().decode(res.stdout);
    expect(out).toContain("# Compare nightly (public): A and B");
    expect(out).not.toContain("Exploratory");
    expect(out).toContain("A and B have the same model, akm, strategy and config patch, so this shows the noise between two runs");
  });
});

describe("two sets of repeats", () => {
  // the baseline's three repeats get 8, 12 and 16 of 20 cases right, the config's 13, 17 and 20
  const A = [8, 12, 16];
  const B = [13, 17, 20];
  const runs = (right: number[], prefix: string, over: Record<string, unknown> = {}): string[] => {
    const parent = tmp();
    return right.map((n, i) => nightlyRun(join(parent, `${prefix}-r${i + 1}`), n, { label: `${prefix}-r${i + 1}`, ...over }));
  };
  const permutations = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

  test("a case scores by its mean over the repeats, a metric by the mean of the metric, and the interval is over the cases", () => {
    const r = compareSets(runs(A, "a").map(loadRun), runs(B, "b").map(loadRun), { treatment: ["config"] });
    const v = r.views[0];
    expect(r.a_runs).toHaveLength(3);
    expect(r.b_runs).toHaveLength(3);
    expect(v.n_paired).toBe(20);
    // c01-c08 are right in all three repeats on both sides; c09-c12 in two of three of A's; c13 in one of three of A's and in all of B's; and so on
    expect(v.better.map((f) => f.id)).toEqual(Array.from({ length: 12 }, (_, i) => `c${String(i + 9).padStart(2, "0")}`));
    expect(v.worse).toEqual([]);
    const rate = v.metrics.find((m) => m.path === "items.rate")!;
    expect([rate.a, rate.b, rate.delta]).toEqual([0.6, 0.8333, 0.2333]);
    expect(rate.ci![0]).toBeGreaterThan(0);
    expect(rate.signal).toBe("better");
    expect(v.better.find((f) => f.id === "c09")).toMatchObject({ a: "2/3 right", b: "3/3 right" });
  });

  test("permuting the repeats of either side, in the list or in the folders, gives the same report", () => {
    const aDirs = runs(A, "a");
    const bDirs = runs(B, "b");
    const report = (as: string[], bs: string[]) => compareSets(as.map(loadRun), bs.map(loadRun), { treatment: ["config"] });
    const first = JSON.stringify(report(aDirs, bDirs));
    for (const pa of permutations(aDirs)) for (const pb of permutations(bDirs)) expect(JSON.stringify(report(pa, pb))).toBe(first);
    // the same repeats written in another order into the folders: the views do not change
    const swapped = runs([16, 8, 12], "s");
    expect(JSON.stringify(report(swapped, bDirs).views)).toBe(JSON.stringify(report(aDirs, bDirs).views));
  });

  test("a plain pair is a set of one on each side", () => {
    const [a, b] = [loadRun(runs([8], "x")[0]), loadRun(runs([13], "y")[0])];
    const one = comparePair(a, b, { treatment: ["config"] });
    expect(one.a_runs).toHaveLength(1);
    expect(one.views[0].better.map((f) => f.id)).toEqual(["c09", "c10", "c11", "c12", "c13"]);
    expect(JSON.stringify(compareSets([a], [b], { treatment: ["config"] }))).toBe(JSON.stringify(one));
  });

  test("every run of both sets is checked against the policy, not the first of each", () => {
    const refuse = (a: string[], b: string[], treatment: Axis[]) => () => compareSets(a.map(loadRun), b.map(loadRun), { treatment });
    const bad = (dirs: string[], over: Record<string, unknown>): string[] => dirs.map((d, i) => (i === 2 ? nightlyRun(join(tmp(), `odd-r${i + 1}`), A[i], over) : d));
    const [aDirs, bDirs] = [runs(A, "a"), runs(B, "b")];
    // the third repeat of A differs in its engine and its commit: the first two agree with each other
    expect(refuse(bad(aDirs, { engine: engineWith({ temperature: 0.7 }) }), bDirs, ["config"])).toThrow(/the engine settings .* differs.*A /);
    expect(refuse(bad(aDirs, { git_commit: "9999999" }), bDirs, ["config"])).toThrow(/the eval's code differs/);
    // under a build treatment too: the repeats of a side are one configuration whatever is being compared
    const releases = runs(B, "r", { akm_version: "0.10.0" });
    expect(refuse(bad(aDirs, { akm_build: "other" }), releases, ["build"])).toThrow(/the akm build differs among the repeats of A/);
    expect(refuse(aDirs, bad(releases, { assets_sha256: "c".repeat(64) }), ["build"])).toThrow(/the cases \(assets_sha256\) differs/);
    // the third repeat of A was made from other edits of the same akm commit: the same, with or without a build treatment
    const edited = (dirs: string[]): string[] => dirs.map((d, i) => nightlyRun(join(tmp(), `edit-r${i + 1}`), A[i], { akm_build: "v0.9.26-1-gabc123-dirty", akm_build_fingerprint: (i === 2 ? "b" : "a").repeat(64) }));
    for (const [treatment, other] of [[["config"], bDirs], [["build"], releases]] as [Axis[], string[]][]) {
      expect(refuse(edited(aDirs), other, treatment)).toThrow(/the uncommitted changes and installed dependencies of the akm build \(akm_build_fingerprint\) differs/);
    }
    expect(refuse(edited(aDirs), edited(aDirs), ["build"])).toThrow(/differs among the repeats of A/);
    // and a release against a release works when all of them agree
    const r = compareSets(aDirs.map(loadRun), releases.map(loadRun), { treatment: ["build"] });
    expect(r.exploratory).toEqual([]);
    expect(r.treated[0]).toBe("the akm version differs: 0.9.26 in A, 0.10.0 in B");
  });

  test("a repeat of one side that did not complete makes the comparison exploratory and names the run", () => {
    const aDirs = runs(A, "a");
    const bDirs = runs(B, "b");
    bDirs[1] = nightlyRun(join(tmp(), "b-r2"), B[1], { status: "aborted", aborted_reason: "rate limited" });
    const r = compareSets(aDirs.map(loadRun), bDirs.map(loadRun), { treatment: ["config"] });
    expect(r.exploratory).toEqual(["B's run b-r2 was cut short: rate limited"]);
  });

  test("setBootstrap with a run a side is the paired bootstrap", () => {
    const unit = (id: string, score: number): Unit => ({ id, score, state: "", group: "", harm: false, row: { id, ok: score === 1 } });
    const rate = (us: Unit[]): number | null => (us.length === 0 ? null : us.filter((u) => u.score === 1).length / us.length);
    const a = [0, 0, 1, 1, 0, 1].map((s, i) => unit(`c${i}`, s));
    const b = [1, 0, 1, 1, 1, 1].map((s, i) => unit(`c${i}`, s));
    const idx = resampleIndexes(6, 400, 3);
    expect(setBootstrap([a], [b], rate, idx, 400)).toEqual(pairedBootstrap(a, b, rate, idx, 400));
    // a case a run has no verdict for is left out of that run's metric
    const e = setBootstrap([a, a.map((u, i) => (i === 0 ? undefined : u))], [b, b], rate, idx, 400);
    expect(e.delta).not.toBeNull();
  });
});

describe("the command with a treatment", () => {
  const run = (...args: string[]) => Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
  const text = (b: Uint8Array | undefined) => new TextDecoder().decode(b);

  test("a release against a release needs --treatment build, and works with it", () => {
    const parent = tmp();
    const a = nightlyRun(join(parent, "a"), 8);
    const b = nightlyRun(join(parent, "b"), 13, { akm_version: "0.10.0" });
    const refused = run(a, b);
    expect(refused.exitCode).toBe(2);
    expect(text(refused.stderr)).toContain("compare: these two runs cannot be compared case by case: the akm version differs: 0.9.26 in A, 0.10.0 in B.");
    expect(text(refused.stderr)).toContain("--treatment");
    const ok = run(a, b, "--treatment", "build");
    expect(ok.exitCode).toBe(0);
    expect(text(ok.stdout)).toContain("Treatment: build.");
    expect(run(a, b, "--treatment", "config,model").exitCode).toBe(2);
  });

  test("--repeats with --against compares two sets of repeats", () => {
    const parent = tmp();
    [8, 12, 16].forEach((n, i) => nightlyRun(join(parent, `2026-10-11-base-r${i + 1}`), n));
    [13, 17, 20].forEach((n, i) => nightlyRun(join(parent, `2026-10-11-new-r${i + 1}`), n, { akm_version: "0.10.0" }));
    const out = join(tmp(), "pair.json");
    const res = run("--repeats", join(parent, "2026-10-11-base"), "--against", join(parent, "2026-10-11-new"), "--treatment", "build", "--json", out);
    expect(res.exitCode).toBe(0);
    const json = JSON.parse(readFileSync(out, "utf8"));
    expect(json.a_runs).toHaveLength(3);
    expect(json.b_runs).toHaveLength(3);
    expect(json.treatment).toEqual(["build"]);
    expect(run("--repeats", join(parent, "2026-10-11-base"), "--against", join(parent, "2026-10-11-new")).exitCode).toBe(2);
  });

  test("bad uses of the new flags exit 2", () => {
    const parent = tmp();
    const a = nightlyRun(join(parent, "a"), 8);
    const b = nightlyRun(join(parent, "b"), 13);
    for (const args of [[a, b, "--treatment", "builds"], [a, b, "--against", a], ["--repeats", fx("nightly", "noise"), "--treatment", "build"]]) {
      const res = run(...args);
      expect(res.exitCode).toBe(2);
      expect(text(res.stderr)).toContain("compare:");
    }
  });
});
