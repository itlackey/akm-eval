// compare reads every eval that declares a measurement, case by case. agent-ab, terminal-bench, bakeoff, longmemeval and skillret were on the manifest
// with no reading here: for each of them these tests write two runs from the cases of its golden folder, one that does well and one that does badly,
// compare them, and check what the report says against the eval's own summary of the same rows.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measuredEvals } from "../../../lib/manifest.ts";
import { EVALS, EVAL_METRICS } from "../../matrix/src/lib.ts";
import { type EvalFixture, evalFixture, goldenOf, harborTrials, writeRun } from "./golden-runs.ts";
import { SUPPORTED, type ViewReport, compareRepeats, comparePair, loadRun, renderPair } from "./lib.ts";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "compare-measured-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NEW = ["agent-ab", "terminal-bench", "bakeoff", "longmemeval", "skillret"] as const;
type Obj = Record<string, any>;
const at = (x: unknown, path: string): any => path.split(".").reduce<any>((o, k) => (o !== null && typeof o === "object" ? o[k] : undefined), x);

describe("an eval that declares a measurement is one compare reads and the matrix judges", () => {
  test("every one is in SUPPORTED and in the matrix's EVALS, with the main metrics that the eval's summary has", () => {
    const names = measuredEvals();
    expect(names.length).toBeGreaterThanOrEqual(11);
    for (const name of names) {
      expect(SUPPORTED, name).toContain(name);
      expect(Object.keys(EVALS), name).toContain(name);
      expect(EVAL_METRICS[name]?.some((m) => m.role === "main"), name).toBe(true);
    }
    for (const name of NEW) expect(names, name).toContain(name);
  });
});

/** A run of the fixture written under a fresh folder: `raw` gives the raw output of each case. */
function run(f: EvalFixture, raw: (c: Obj) => Obj | undefined, label: string, options: Partial<Parameters<typeof writeRun>[0]> = {}): string {
  return writeRun({ measurement: f.measurement, cases: f.cases, raw, parent: tmp(), label, harbor: f.harbor, ...options });
}

for (const name of NEW) {
  describe(`${name}`, () => {
    test("two runs are compared per case: the flips, the metrics the matrix judges, and the numbers the eval's own summary has for the same rows", async () => {
      const f = await evalFixture(name);
      const [a, b] = [loadRun(run(f, f.good, "good")), loadRun(run(f, f.bad, "bad"))];
      const r = comparePair(a, b);
      expect(r.exploratory).toEqual([]);
      expect(r.eval).toBe(name);
      const judged = r.views.flatMap((v) => v.metrics);
      // the main metrics the matrix judges that this tool reads per case went down, and none of them went up
      expect(judged.length).toBeGreaterThan(0);
      for (const m of judged) {
        expect(["main", "harm"], m.path).toContain(m.role);
        expect(EVAL_METRICS[name]?.some((spec) => spec.path === m.path), m.path).toBe(true);
        if (m.role === "main") expect(m, m.path).toMatchObject({ signal: "worse" });
      }
      // what each side scored: every case that has a verdict
      for (const v of r.views) {
        expect(v.coverage).toMatchObject({ errored_a: [], errored_b: [], scored_only_a: [], scored_only_b: [] });
        expect(v.coverage.scored_a).toBe(v.coverage.selected_a);
        expect(v.coverage.selected_a).toBeGreaterThan(0);
        expect(v.coverage.selected_a).toBeLessThanOrEqual(f.cases.length); // longmemeval's table of sessions leaves out the abstention question
        expect(v.n_paired).toBeGreaterThan(0);
        expect(v.better).toEqual([]);
        expect(v.worse.length).toBeGreaterThan(0);
        for (const flip of v.worse) expect(flip.delta, flip.id).toBeLessThan(0);
      }
      // every number is the one the eval's summary has for the same rows (to the places the eval rounds to), for A and for B
      for (const [side, folder] of [["a", a], ["b", b]] as const) {
        for (const m of [...r.views.flatMap((v) => v.metrics), ...r.views.flatMap((v) => v.info)]) {
          const stored = at(folder.summary.metrics, m.path);
          if (typeof stored !== "number") continue;
          expect(m[side], `${side} ${m.path}`).toBeCloseTo(stored, 3);
        }
      }
      const md = renderPair(r);
      expect(md).toContain(`# Compare ${name}`);
      expect(md).toContain("Scored: A ");
      expect(md).toContain("### Flipped to worse");
    });

    test("and the other way round the same metrics went up, with no case flipped to worse", async () => {
      const f = await evalFixture(name);
      const r = comparePair(loadRun(run(f, f.bad, "bad")), loadRun(run(f, f.good, "good")));
      for (const m of r.views.flatMap((v) => v.metrics).filter((x) => x.role === "main")) expect(m, m.path).toMatchObject({ signal: "better" });
      for (const v of r.views) {
        expect(v.worse).toEqual([]);
        expect(v.better.length).toBeGreaterThan(0);
      }
    });

    test("runs of the same configuration have a noise floor: nothing flips between two identical runs", async () => {
      const f = await evalFixture(name);
      const report = compareRepeats([run(f, f.good, "r1"), run(f, f.good, "r2"), run(f, f.good, "r3")].map(loadRun));
      expect(report.exploratory).toEqual([]);
      for (const v of report.views) expect(v.noise_floor).toEqual({ flip_rate: 0, expected_flips: 0 });
    });
  });
}

for (const name of ["agent-ab", "terminal-bench"] as const) {
  describe(`${name}: the trials of a task`, () => {
    test("a task is scored by the akm arm's mean reward minus the control's, as the paired difference is, and a task without a reward in an arm has no verdict", async () => {
      const f = await evalFixture(name);
      const [first, second] = [f.cases[0] as Obj, f.cases[1] as Obj];
      const raw = (c: Obj): Obj => {
        if (c.id === first.id) return harborTrials(c.id, [1, 0, 0], [1, 1, 0]); // the akm arm passes 2 of 3 attempts and the control 1 of 3
        if (c.id === second.id) return harborTrials(c.id, [null, null, null], [1, 1, 1]); // the control never got a reward
        return f.good(c);
      };
      const r = comparePair(loadRun(run(f, raw, "mixed")), loadRun(run(f, f.bad, "bad")));
      const view = r.views[0] as ViewReport;
      expect(view.worse.find((flip) => flip.id === first.id)).toEqual({ id: first.id, group: "", a: "control 1/3, akm 2/3", b: "control 0/3, akm 0/3", delta: -0.3333 });
      expect(view.coverage.errored_a).toEqual([second.id]);
      expect(view.coverage.scored_only_b).toEqual([second.id]);
      expect(view.n_paired).toBe(f.cases.length - 1);
      expect(view.metrics.find((m) => m.path === "delta.value")).toMatchObject({ n: f.cases.length - 1 });
      expect(r.exploratory).toEqual([]); // 5 of the 6 tasks both runs selected can be compared: more than 80%
    });

    test("the trials of the harm are shown from the summaries: akm trials that never got a reward, and control trials that called akm", async () => {
      const f = await evalFixture(name);
      const r = comparePair(loadRun(run(f, f.good, "good")), loadRun(run(f, f.badControl as (c: Obj) => Obj, "calls")));
      const harm = r.summary_only.map((m) => [m.path, m.role, m.a, m.b]);
      expect(harm).toEqual([["akm.errored", "harm", 0, 0], ["engagement.control_calls", "harm", 0, f.cases.length * 3]]);
    });
  });
}

describe("longmemeval: a retrieval-only run is another measurement", () => {
  test("a full run and a retrieval-only run are never compared, and two retrieval-only runs have the table of the sessions alone", async () => {
    const f = await evalFixture("longmemeval");
    const full = run(f, f.good, "full");
    const only = (raw: (c: Obj) => Obj, label: string) => run(f, raw, label, { mode: "retrieval-only" });
    expect(() => comparePair(loadRun(full), loadRun(only(f.goodRetrievalOnly as (c: Obj) => Obj, "only")))).toThrow(/the mode \(consolidate --pool is another set of cases, and longmemeval --retrieval-only another measurement\) differs: none in A, retrieval-only in B/);
    const r = comparePair(loadRun(only(f.goodRetrievalOnly as (c: Obj) => Obj, "good")), loadRun(only(f.badRetrievalOnly as (c: Obj) => Obj, "bad")));
    expect(r.views.map((v) => v.view)).toEqual(["retrieval"]);
    expect(r.exploratory).toEqual([]);
    expect(r.views[0]?.metrics.map((m) => [m.path, m.signal])).toEqual([["retrieval.hit_rate", "worse"], ["retrieval.recall", "worse"]]);
    expect(r.views[0]?.info.map((m) => m.path)).toEqual(["retrieval.mrr", "retrieval.ndcg"]);
    // a full run has both tables: the answers given with akm and the sessions it returned
    expect(comparePair(loadRun(full), loadRun(run(f, f.bad, "bad"))).views.map((v) => v.view)).toEqual(["with_akm", "retrieval"]);
  });

  test("the answers of the arm with akm are read as the benchmark does: an arm without a verdict has no score, and the control arm is context", async () => {
    const f = await evalFixture("longmemeval");
    const [first] = f.cases as Obj[];
    const broken = (c: Obj): Obj => (c.question_id === first.question_id ? { ...f.good(c), with_akm: { ...f.good(c).with_akm, verdict: null, error: "judge: HTTP 503" } } : f.good(c));
    const r = comparePair(loadRun(run(f, broken, "broken")), loadRun(run(f, f.bad, "bad")));
    const answers = r.views.find((v) => v.view === "with_akm") as ViewReport;
    expect(answers.coverage.errored_a).toEqual([first.question_id]);
    expect(answers.metrics.map((m) => m.path)).toEqual(["accuracy.with_akm.rate"]);
    expect(answers.info.map((m) => m.path)).toEqual(["accuracy.difference.value"]);
  });
});

describe("skillret: the custom corpus is a split of the dataset", () => {
  test("two runs on it compare like two on the public corpus, whatever the kind says", async () => {
    const f = await evalFixture("skillret");
    const custom = { corpus: "custom" as const, corpusKind: "split", corpusFolder: null };
    const r = comparePair(loadRun(run(f, f.good, "good", custom)), loadRun(run(f, f.bad, "bad", custom)));
    expect(r).toMatchObject({ corpus: "custom", exploratory: [] });
    expect(r.views.map((v) => v.view)).toEqual(["search", "semantic_search"]);
    expect(r.views[0]?.info.map((m) => m.path)).toEqual(["search.Recall@10", "search.Completeness@10", "search.MAP@10"]);
    // a run on the split is not a run on the public corpus
    expect(() => comparePair(loadRun(run(f, f.good, "public")), loadRun(run(f, f.bad, "custom", custom)))).toThrow(/the corpus differs: public in A, custom in B/);
  });
});

describe("extract: planted.ambiguous", () => {
  /** Two runs of the golden cases, in which the model answers the same, except that in B the memory of the planted session holds the planted phrase behind a negation the scorer cannot read. */
  async function twoRuns() {
    const { MEASUREMENT } = await import("../../../evals/extract/src/measurement.ts");
    const { cases, raw } = goldenOf("evals/extract");
    const line = (id: string, note?: string) => raw.find((l) => l.case === id && (note === undefined || l.note === note)) as (typeof raw)[number];
    const stored = (l: (typeof raw)[number]): Obj => (MEASUREMENT.rawOf({ id: l.case, ...l.raw }) as { raw: Obj }).raw;
    const clean = (c: Obj): Obj => stored(line(c.id));
    const doubt = (c: Obj): Obj => (c.id === "planted-01" ? stored(line(c.id, "the memory states the fix and holds the instruction behind do not think we should")) : clean(c));
    const make = (f: (c: Obj) => Obj, label: string) => writeRun({ measurement: MEASUREMENT, cases, raw: f, parent: tmp(), label });
    return { a: make(clean, "clean"), b: make(doubt, "doubt") };
  }

  test("compare reports it beside the metrics it judges, as a count to look at: it has no direction, no verdict, and changes none", async () => {
    const { a, b } = await twoRuns();
    expect(loadRun(a).summary.metrics.planted.ambiguous).toBe(0);
    expect(loadRun(b).summary.metrics.planted.ambiguous).toBe(1);
    const r = comparePair(loadRun(a), loadRun(b));
    const view = r.views[0] as ViewReport;
    expect(view.info).toEqual([expect.objectContaining({ path: "planted.ambiguous", role: "info", dir: null, a: 0, b: 1, delta: 1, signal: "n/a" })]);
    expect(view.metrics.map((m) => [m.path, m.signal])).toEqual([["insights.rate", "same"], ["routine.rate", "same"], ["planted.saved_instruction", "same"]]);
    expect(view.agree.n).toBe(view.n_paired); // the memory does not assert the planted phrase: the case is right in both runs
    expect(renderPair(r)).toContain("| planted.ambiguous (a count to look at, not judged) | 0 | 1 | +1 |");
    expect(JSON.parse(JSON.stringify(r)).views[0].info[0].dir).toBeNull();
  });
});
