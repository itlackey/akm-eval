import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spreadOf } from "../../../lib/repeat.ts";
import { EVAL_METRICS, type Measured, type Matrix, type RunRecord, type State, baselineFor, buildDecision, compareAll, confirmJobs, emptyState, findResults, labelOf, loadMeasured, metricSpread, parseMatrix, renderMarkdown, schedule, screenDiffers, screenJobs, selectForConfirm, verdictOf } from "./lib.ts";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "matrix-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const FILE = "/work/sweeps/x/matrix.json";
const MATRIX = {
  prefix: "sw",
  baseline: [
    { name: "base", eval: "reflect", args: [] },
    { name: "base-pool", eval: "consolidate", args: ["--pool"] },
  ],
  configs: [
    { name: "gate", eval: "reflect", args: ["--config-patch", "patches/gate.json"] },
    { name: "short", eval: "consolidate", args: ["--pool", "--timeout-ms", "150000"] },
    { name: "quick", eval: "nightly", args: ["--strategy", "quick"] },
  ],
  screen: { limit: { reflect: 10, nightly: 8, consolidate: 5 } },
};
const withNightly = { ...MATRIX, baseline: [...MATRIX.baseline, { name: "base-n", eval: "nightly" }] };
const parse = (j: unknown = withNightly) => parseMatrix(j, FILE);

describe("parseMatrix", () => {
  test("reads baselines, configs, limits and the default repeats", () => {
    const m = parse();
    expect(m.prefix).toBe("sw");
    expect(m.repeats).toBe(3);
    expect(m.baselines.map((b) => b.name)).toEqual(["base", "base-pool", "base-n"]);
    expect(m.screenLimit).toEqual({ reflect: 10, nightly: 8, consolidate: 5 });
  });

  test("a relative patch path resolves from the matrix file's folder, in both spellings", () => {
    const m = parse({ ...withNightly, configs: [{ name: "a", eval: "reflect", args: ["--config-patch", "patches/gate.json"] }, { name: "b", eval: "reflect", args: ["--config-patch=../p.json"] }, { name: "c", eval: "reflect", args: ["--config-patch", "/abs/p.json"] }] });
    expect(m.configs[0].args).toEqual(["--config-patch", "/work/sweeps/x/patches/gate.json"]);
    expect(m.configs[1].args).toEqual(["--config-patch=/work/sweeps/p.json"]);
    expect(m.configs[2].args).toEqual(["--config-patch", "/abs/p.json"]);
  });

  test("a single baseline object is named base, and the prefix is the file's name without one in the file", () => {
    const m = parseMatrix({ baseline: { eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }] }, "/w/my-sweep.json");
    expect(m.baselines[0].name).toBe("base");
    expect(m.prefix).toBe("my-sweep");
  });

  test("screen.limit as one number applies to every eval", () => {
    const m = parseMatrix({ baseline: [{ eval: "reflect" }, { name: "bd", eval: "distill" }], configs: [{ name: "a", eval: "distill" }], screen: { limit: 4 } }, FILE);
    expect(m.screenLimit).toEqual({ reflect: 4, distill: 4 });
  });

  test("rejects what would make a run or a comparison wrong", () => {
    const bad = (patch: object, msg: RegExp) => expect(() => parseMatrix({ ...withNightly, ...patch }, FILE)).toThrow(msg);
    bad({ baseline: undefined }, /needs a `baseline`/);
    bad({ configs: [] }, /non-empty/);
    bad({ configs: [{ name: "base", eval: "reflect" }] }, /used twice/);
    bad({ configs: [{ name: "a", eval: "nope" }] }, /eval must be one of/);
    bad({ configs: [{ name: "a", eval: "reflect", args: ["--label", "x"] }] }, /leave out --label/);
    bad({ configs: [{ name: "a", eval: "reflect", args: ["--repeat=2"] }] }, /leave out --repeat/);
    bad({ configs: [{ name: "a", eval: "reflect", args: ["--corpus", "all"] }] }, /pools corpora/);
    bad({ configs: [{ name: "a b", eval: "reflect" }] }, /name must use/);
    bad({ repeats: 1 }, /2 or more/);
    bad({ screen: { limit: { reflect: 0 } } }, /positive integer/);
    bad({ configs: [{ name: "a", eval: "distill" }] }, /no baseline row that runs the same cases/);
  });

  test("a config is compared only with the baseline of the same cases: pool apart from per-case, corpus apart from corpus", () => {
    const m = parse();
    expect(baselineFor(m, m.configs[0]).name).toBe("base");
    expect(baselineFor(m, m.configs[1]).name).toBe("base-pool");
    expect(() => parse({ ...withNightly, configs: [{ name: "a", eval: "reflect", args: ["--corpus", "private"] }] })).toThrow(/no baseline/);
    expect(() => parse({ ...withNightly, baseline: [...withNightly.baseline, { name: "dup", eval: "reflect" }] })).toThrow(/matches 2 baseline rows/);
  });
});

describe("screenJobs", () => {
  test("every row once, baselines first, with the eval's limit, never on a pool run, and a label", () => {
    const jobs = screenJobs(parse());
    expect(jobs.map((j) => j.label)).toEqual(["sw-base-s", "sw-base-pool-s", "sw-base-n-s", "sw-gate-s", "sw-short-s", "sw-quick-s"]);
    expect(jobs[0].args).toEqual(["--limit", "10", "--label", "sw-base-s"]);
    expect(jobs[1].args).toEqual(["--pool", "--label", "sw-base-pool-s"]);
    expect(jobs[3].args).toEqual(["--config-patch", "/work/sweeps/x/patches/gate.json", "--limit", "10", "--label", "sw-gate-s"]);
    expect(jobs[5].args).toEqual(["--strategy", "quick", "--limit", "8", "--label", "sw-quick-s"]);
    expect(jobs.every((j) => j.repeat === null)).toBe(true);
  });

  test("a row with its own --limit keeps it, and no limit in the file means none", () => {
    const m = parse({ baseline: { eval: "reflect", args: ["--limit", "3"] }, configs: [{ name: "a", eval: "reflect", args: ["--limit", "3"] }], screen: { limit: { reflect: 10 } } });
    expect(screenJobs(m)[0].args).toEqual(["--limit", "3", "--label", "x-base-s".replace("x", m.prefix)]);
    const none = parse({ baseline: { eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }] });
    expect(screenJobs(none)[1].args).toEqual(["--label", `${none.prefix}-a-s`]);
  });
});

describe("a model and an akm build for the whole file", () => {
  const file = { ...withNightly, model: "cloud/some-model", akm: "bun ~/akm/src/cli.ts", baseline: [...withNightly.baseline, { name: "base-r", eval: "retrieval" }], configs: [...withNightly.configs, { name: "own-model", eval: "reflect", args: ["--model", "my-model"] }] };

  test("every row gets --model and --akm first, retrieval only --akm, and a row's own flag wins", () => {
    const jobs = screenJobs(parse(file));
    expect(jobs[0].args).toEqual(["--model", "cloud/some-model", "--akm", "bun ~/akm/src/cli.ts", "--limit", "10", "--label", "sw-base-s"]);
    expect(jobs.find((j) => j.row.name === "base-r")?.args).toEqual(["--akm", "bun ~/akm/src/cli.ts", "--label", "sw-base-r-s"]);
    expect(jobs.find((j) => j.row.name === "own-model")?.args).toEqual(["--akm", "bun ~/akm/src/cli.ts", "--model", "my-model", "--limit", "10", "--label", "sw-own-model-s"]);
  });

  test("without them the arguments are the row's, and an empty one is refused", () => {
    expect(screenJobs(parse())[0].args).toEqual(["--limit", "10", "--label", "sw-base-s"]);
    expect(() => parse({ ...withNightly, model: " " })).toThrow("model must be a non-empty string");
    expect(() => parse({ ...withNightly, akm: 3 })).toThrow("akm must be a non-empty string");
  });
});

// ---- fixtures: results written the way the evals write them ----------------------------------------------------------------

const fixture = (name: string): any => JSON.parse(readFileSync(join(import.meta.dir, "fixtures", `${name}.json`), "utf8"));

/** A reflect summary with the given rates. */
const reflectSummary = (label: string, defects: number, controls: number, touched = 0, extra: object = {}): any => ({
  ...fixture("reflect"),
  label,
  model: "m1",
  akm_build: "b1",
  metrics: { defects: { n: 32, correct: 0, rate: defects }, controls: { n: 18, correct: 0, rate: controls }, proposals: { n: 39, touched_body: touched } },
  ...extra,
});

function writeRun(root: string, evalName: string, label: string, s: any): string {
  const dir = join(root, "evals", evalName, "results", `2026-10-09-${label}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "summary.json"), JSON.stringify(s));
  return dir;
}

/** What `--repeat` writes: the runs and a repeat summary beside them (lib/repeat.ts). */
function writeRepeat(root: string, evalName: string, label: string, runs: any[], collection?: string): void {
  const parent = join(root, "evals", evalName, "results");
  const names = runs.map((s, i) => {
    const n = `2026-10-09-${label}-r${i + 1}${collection ? `-${collection}` : ""}`;
    mkdirSync(join(parent, n), { recursive: true });
    writeFileSync(join(parent, n, "summary.json"), JSON.stringify({ ...s, label: `${label}-r${i + 1}`, ...(collection ? { collection } : {}) }));
    return n;
  });
  const first = runs[0];
  const summary = { eval: evalName, label: collection ? `${label}-${collection}` : label, repeat: runs.length, model: first.model, akm_version: first.akm_version, akm_bin: first.akm_bin, akm_build: first.akm_build, runs: names, n_errored: spreadOf(runs.map((r) => r.n_errored ?? 0)), seconds: spreadOf(runs.map(() => 60)), metrics: spreadOf(runs.map((r) => r.metrics)) };
  writeFileSync(join(parent, `2026-10-09-${label}${collection ? `-${collection}` : ""}-repeat-summary.json`), JSON.stringify(summary));
}

const record = (stage: "screen" | "confirm", name: string, evalName: string, label: string, root: string, kind: "run" | "repeat", repeat: number | null = null, scope = ""): RunRecord => {
  const refs = findResults(root, { label, repeat, args: [], row: { name, eval: evalName, args: [] } }, 0);
  expect(refs.map((r) => r.kind)).toEqual([kind]);
  return { stage, name, eval: evalName, label, args: [], repeat, started: "", wall_seconds: 30, exit_code: 0, log: "", results: refs.filter((r) => r.scope === scope) };
};

describe("every eval's metric paths exist in a real summary", () => {
  const fixtures: Record<string, string> = { nightly: "nightly", consolidate: "consolidate", distill: "distill", reflect: "reflect", promotion: "promotion", "judge-gate": "judge-gate", extract: "extract", retrieval: "retrieval" };
  for (const [evalName, file] of Object.entries(fixtures)) {
    test(evalName, () => {
      const s = fixture(file);
      const m: Measured = { scope: "", n: 1, model: null, akm_build: null, akm_version: null, n_errored: null, calls: null, seconds: null, metrics: s.metrics, repeated: false };
      for (const spec of EVAL_METRICS[evalName]) {
        const present = spec.path.split(".").reduce<any>((o, k) => (o && typeof o === "object" ? o[k] : undefined), s.metrics);
        // a rate may be null (nothing to divide, or no scored case), but the key is there
        expect(present !== undefined, `${evalName} ${spec.path}`).toBe(true);
        if (present !== null) expect(metricSpread(m, spec.path)).not.toBeNull();
      }
    });
  }

  test("the pool run has the consolidate keys", () => {
    const s = fixture("consolidate-pool");
    expect(s.mode).toBe("pool");
    for (const spec of EVAL_METRICS.consolidate) expect(typeof spec.path.split(".").reduce((o: any, k) => o[k], s.metrics)).toBe("number");
  });

  test("a repeat summary has {min, max, mean} at every one of them", () => {
    const rs = { ...fixture("reflect"), metrics: spreadOf([fixture("reflect").metrics, fixture("reflect").metrics]) };
    const m: Measured = { scope: "", n: 2, model: null, akm_build: null, akm_version: null, n_errored: null, calls: null, seconds: null, metrics: rs.metrics, repeated: true };
    expect(metricSpread(m, "defects.rate")).toEqual({ min: 0.9375, max: 0.9375, mean: 0.9375 });
  });
});

// ---- the verdict ------------------------------------------------------------------------------------------------------------

const meas = (metrics: object, over: Partial<Measured> = {}): Measured => ({ scope: "", n: 3, model: "m1", akm_build: "b1", akm_version: "0.9.30", n_errored: 0, calls: null, seconds: null, metrics, repeated: true, ...over });
const sp = (min: number, max: number) => ({ min, max, mean: (min + max) / 2 });
const rm = (defects: [number, number], controls: [number, number], touched: [number, number] = [0, 0]) => ({ defects: { rate: sp(...defects) }, controls: { rate: sp(...controls) }, proposals: { touched_body: sp(...touched) } });
const verdict = (b: Measured, c: Measured) => verdictOf(compareAll("reflect", b, c), b, c);
const BASE = rm([0.8, 0.85], [0.9, 0.95]);

describe("verdictOf", () => {
  test("better: the main metric's range does not overlap the baseline's and harm does not rise", () => {
    expect(verdict(meas(BASE), meas(rm([0.9, 0.95], [0.9, 0.95])))).toBe("better");
  });

  test("overlapping ranges are no difference, even with a higher mean; touching ranges overlap", () => {
    expect(verdict(meas(BASE), meas(rm([0.82, 0.95], [0.9, 0.95])))).toBe("no difference");
    expect(verdict(meas(BASE), meas(rm([0.85, 0.9], [0.9, 0.95])))).toBe("no difference");
  });

  test("mixed: a better main metric with more harm, even when the harm ranges overlap", () => {
    expect(verdict(meas(BASE), meas(rm([0.9, 0.95], [0.85, 0.93])))).toBe("mixed"); // controls.rate (harm when it falls): mean 0.89 vs 0.925
    expect(verdict(meas(BASE), meas(rm([0.9, 0.95], [0.9, 0.95], [0, 1])))).toBe("mixed"); // touched_body rose
  });

  test("worse: the main metric is below the baseline's range, or harm rose with nothing gained", () => {
    expect(verdict(meas(BASE), meas(rm([0.5, 0.7], [0.9, 0.95])))).toBe("worse");
    expect(verdict(meas(BASE), meas(rm([0.8, 0.85], [0.6, 0.7])))).toBe("worse");
  });

  test("a harm metric that clearly falls counts as better", () => {
    expect(verdict(meas(rm([0.8, 0.85], [0.7, 0.75], [2, 3])), meas(rm([0.8, 0.85], [0.9, 0.95], [0, 0])))).toBe("better");
  });

  test("n=1 on either side is screen only, whatever the numbers say", () => {
    const one = (m: object) => meas(m, { n: 1, repeated: false });
    const flat = (d: number, c: number) => ({ defects: { rate: d }, controls: { rate: c }, proposals: { touched_body: 0 } });
    expect(verdict(one(flat(0.5, 0.9)), one(flat(0.9, 0.9)))).toBe("screen only");
    expect(verdict(meas(BASE), one(flat(0.99, 0.99)))).toBe("screen only");
  });

  test("a different model or akm build is not comparable; no number is no result", () => {
    expect(verdict(meas(BASE), meas(rm([0.9, 0.95], [0.9, 0.95]), { akm_build: "b2" }))).toBe("not comparable");
    expect(verdict(meas(BASE), meas(rm([0.9, 0.95], [0.9, 0.95]), { model: "m2" }))).toBe("not comparable");
    expect(verdict(meas(BASE), meas({ defects: { rate: null }, controls: { rate: null } }))).toBe("no result");
  });

  test("lower-is-better direction: a nightly night with fewer failed calls is better", () => {
    const night = (rate: [number, number], failures: [number, number]) => meas({ items: { rate: sp(...rate) }, harm: { items: sp(0, 0), outside_changed: sp(0, 0), lessons_accepted: sp(0, 0) }, calls: { failures: sp(...failures) } });
    const [b, c] = [night([0.6, 0.65], [10, 14]), night([0.8, 0.85], [0, 1])];
    expect(verdictOf(compareAll("nightly", b, c), b, c)).toBe("better");
  });
});

describe("screenDiffers", () => {
  const one = (m: object) => meas(m, { n: 1, repeated: false });
  const flat = (d: number, c: number, t = 0) => ({ defects: { rate: d }, controls: { rate: c }, proposals: { touched_body: t } });
  test("any change by default, only a larger one with --min-delta, and harm counts", () => {
    expect(screenDiffers("reflect", one(flat(0.8, 0.9)), one(flat(0.8, 0.9)), 0)).toEqual([]);
    expect(screenDiffers("reflect", one(flat(0.8, 0.9)), one(flat(0.82, 0.9)), 0)).toEqual(["defects.rate"]);
    expect(screenDiffers("reflect", one(flat(0.8, 0.9)), one(flat(0.82, 0.9)), 0.05)).toEqual([]);
    expect(screenDiffers("reflect", one(flat(0.8, 0.9)), one(flat(0.8, 0.9, 2)), 0)).toEqual(["proposals.touched_body"]);
  });
});

// ---- results and stage selection ---------------------------------------------------------------------------------------------

describe("findResults", () => {
  test("finds a run by the label in its summary, not by the folder name", () => {
    const root = tmp();
    writeRun(root, "reflect", "sw-a-s", reflectSummary("sw-a-s", 0.5, 0.5));
    writeRun(root, "reflect", "sw-a-s-x", reflectSummary("sw-a-s-x", 0.9, 0.9)); // a label that merely starts with this one
    const refs = findResults(root, { label: "sw-a-s", repeat: null, args: [], row: { name: "a", eval: "reflect", args: [] } }, 0);
    expect(refs).toEqual([{ scope: "", kind: "run", file: "evals/reflect/results/2026-10-09-sw-a-s/summary.json" }]);
  });

  test("ignores a folder older than the run, and takes the newest of two", () => {
    const root = tmp();
    const old = writeRun(root, "reflect", "sw-a-s", reflectSummary("sw-a-s", 0.5, 0.5));
    utimesSync(join(old, "summary.json"), new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));
    const job = { label: "sw-a-s", repeat: null, args: [], row: { name: "a", eval: "reflect", args: [] } };
    expect(findResults(root, job, Date.now() - 60_000)).toEqual([]);
    expect(findResults(root, job, 0).length).toBe(1);
  });

  test("a repeat is found by its first run, one result per collection", () => {
    const root = tmp();
    const run = (n: number) => ({ ...fixture("retrieval"), n_errored: 0, metrics: { search: { ndcg_10: 0.8 + n / 100 } } });
    writeRepeat(root, "retrieval", "sw-a-c", [run(1), run(2)], "library");
    writeRepeat(root, "retrieval", "sw-a-c", [run(3), run(4)], "books");
    const refs = findResults(root, { label: "sw-a-c", repeat: 2, args: [], row: { name: "a", eval: "retrieval", args: [] } }, 0);
    expect(refs.map((r) => r.scope).sort()).toEqual(["books", "library"]);
    expect(refs.every((r) => r.kind === "repeat")).toBe(true);
  });

  test("a private corpus is read from private/", () => {
    const root = tmp();
    const dir = join(root, "private", "reflect", "results", "2026-10-09-sw-a-s");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "summary.json"), JSON.stringify(reflectSummary("sw-a-s", 1, 1)));
    expect(findResults(root, { label: "sw-a-s", repeat: null, args: ["--corpus", "private"], row: { name: "a", eval: "reflect", args: [] } }, 0).length).toBe(1);
  });
});

describe("stage selection", () => {
  function setup(): { root: string; m: Matrix; state: State } {
    const root = tmp();
    const m = parse();
    const state = emptyState(m);
    const screen = (name: string, ev: string, defects: number, controls: number) => {
      writeRun(root, ev, labelOf("sw", name, "screen"), reflectSummary(labelOf("sw", name, "screen"), defects, controls));
      state.screen[name] = record("screen", name, ev, labelOf("sw", name, "screen"), root, "run");
    };
    screen("base", "reflect", 0.8, 0.9);
    screen("gate", "reflect", 0.85, 0.9); // differs
    return { root, m, state };
  }

  test("confirms the configs whose screen result differs from their baseline's, and the baseline once", () => {
    const { root, m, state } = setup();
    const { selected, skipped } = selectForConfirm(root, m, state, { minDelta: 0 });
    expect(selected.map((s) => s.config.name)).toEqual(["gate"]);
    expect(selected[0].reason).toContain("defects.rate");
    expect(skipped.map((s) => [s.config.name, s.reason])).toEqual([["short", "no screen result"], ["quick", "no screen result"]]);
    const jobs = confirmJobs(m, selected);
    expect(jobs.map((j) => j.label)).toEqual(["sw-base-c", "sw-gate-c"]);
    expect(jobs[0].args).toEqual(["--repeat", "3", "--label", "sw-base-c"]); // the full set: no screen limit
    expect(jobs[1].args).toEqual(["--config-patch", "/work/sweeps/x/patches/gate.json", "--repeat", "3", "--label", "sw-gate-c"]);
  });

  test("a config that matches its baseline is skipped, until --min-delta is below the change", () => {
    const { root, m, state } = setup();
    expect(selectForConfirm(root, m, state, { minDelta: 0.1 }).selected).toEqual([]);
    expect(selectForConfirm(root, m, state, { minDelta: 0.1 }).skipped[0].reason).toBe("screen result matches the baseline");
  });

  test("--only takes the named configs whatever the screen said, and refuses an unknown name", () => {
    const { root, m, state } = setup();
    expect(selectForConfirm(root, m, state, { only: ["short"], minDelta: 0 }).selected.map((s) => s.config.name)).toEqual(["short"]);
    expect(confirmJobs(m, selectForConfirm(root, m, state, { only: ["short", "gate"], minDelta: 0 }).selected).map((j) => j.label)).toEqual(["sw-base-c", "sw-base-pool-c", "sw-gate-c", "sw-short-c"]);
    expect(() => selectForConfirm(root, m, state, { only: ["nope"], minDelta: 0 })).toThrow(/names no config/);
  });
});

describe("schedule", () => {
  test("runs jobs in order, at most N at a time, never two of one key", async () => {
    const jobs = [["a", 1], ["a", 2], ["b", 1], ["c", 1], ["b", 2]] as [string, number][];
    const running = new Map<string, number>();
    let peak = 0;
    let overlap = false;
    const started: string[] = [];
    await schedule(jobs, 2, (j) => j[0], async (j) => {
      running.set(j[0], (running.get(j[0]) ?? 0) + 1);
      if (running.get(j[0])! > 1) overlap = true;
      peak = Math.max(peak, [...running.values()].reduce((a, b) => a + b, 0));
      started.push(`${j[0]}${j[1]}`);
      await new Promise((r) => setTimeout(r, 15));
      running.set(j[0], running.get(j[0])! - 1);
    });
    expect(overlap).toBe(false);
    expect(peak).toBe(2);
    expect(started).toEqual(["a1", "b1", "a2", "c1", "b2"]);
  });

  test("sequential by default and survives a failing job", async () => {
    const seen: number[] = [];
    await schedule([1, 2, 3], 1, () => "x", async (n) => {
      seen.push(n);
      if (n === 2) throw new Error("boom");
    });
    expect(seen).toEqual([1, 2, 3]);
  });
});

// ---- the report ---------------------------------------------------------------------------------------------------------------

describe("report", () => {
  function results(): { root: string; m: Matrix; state: State } {
    const root = tmp();
    const m = parseMatrix({ prefix: "sw", baseline: [{ name: "base", eval: "reflect" }, { name: "base-r", eval: "retrieval" }], configs: [{ name: "gate", eval: "reflect" }, { name: "off", eval: "reflect", args: ["--strategy", "x"] }, { name: "ret", eval: "retrieval", args: ["--x"] }] }, FILE);
    const state = emptyState(m);
    const rep = (name: string, ev: string, base: [number, number][], build = "b1", collection?: string) => {
      const label = labelOf("sw", name, "confirm");
      const runs = base.map(([d, c], i) => (ev === "reflect" ? reflectSummary(label, d, c, 0, { akm_build: build }) : { ...fixture("retrieval"), model: undefined, akm_build: build, metrics: { search: { ndcg_10: d }, curate: { ndcg_10: d }, semantic_search: { ndcg_10: d }, semantic_curate: { ndcg_10: d } } }));
      writeRepeat(root, ev, label, runs, collection);
      state.confirm[name] = record("confirm", name, ev, label, root, "repeat", base.length, collection ?? "");
      return state.confirm[name];
    };
    rep("base", "reflect", [[0.8, 0.9], [0.82, 0.92], [0.84, 0.94]]);
    rep("gate", "reflect", [[0.9, 0.9], [0.92, 0.92], [0.94, 0.94]]); // better
    rep("off", "reflect", [[0.8, 0.8], [0.82, 0.82], [0.9, 0.84]]); // overlapping main, controls down: worse by harm
    rep("base-r", "retrieval", [[0.7, 0], [0.71, 0]], "b1", "library");
    rep("ret", "retrieval", [[0.7, 0], [0.72, 0]], "b1", "library");
    return { root, m, state };
  }

  test("one row per config with the verdict, ranges, build and model", () => {
    const { root, m, state } = results();
    const d = buildDecision(root, m, state, 0, new Date("2026-10-09T12:00:00Z"));
    expect(d.rows.map((r) => [r.config, r.scope, r.verdict, r.stage, r.n])).toEqual([
      ["gate", "", "better", "confirm", 3],
      ["off", "", "worse", "confirm", 3],
      ["ret", "library", "no difference", "confirm", 2],
    ]);
    const gate = d.rows[0];
    expect(gate.metrics.find((x) => x.path === "defects.rate")).toMatchObject({ signal: "better", baseline: { min: 0.8, max: 0.84, mean: 0.82 }, config: { min: 0.9, max: 0.94, mean: 0.92 } });
    expect(gate.akm_build).toBe("b1");
    expect(gate.model).toBe("m1");
    expect(gate.seconds).toEqual({ baseline: 60, config: 60 });
  });

  test("markdown has a table per eval and baseline, with mean and min-max, harm and the verdict", () => {
    const { root, m, state } = results();
    const md = renderMarkdown(buildDecision(root, m, state, 0, new Date("2026-10-09T12:00:00Z")));
    expect(md).toContain("## reflect vs base");
    expect(md).toContain("## retrieval (library) vs base-r");
    expect(md).toContain("defects.rate ↑ 0.82 (0.8–0.84) → 0.92 (0.9–0.94)");
    expect(md).toContain("controls.rate ↑ 0.92 (0.9–0.94) → 0.82 (0.8–0.84)");
    expect(md).toContain("**better**");
    expect(md).toContain("**worse**");
    expect(md).toContain("**no difference**");
    expect(md).not.toContain("proposals.touched_body ↓ –");
  });

  test("with the screen only it says so, and names the metrics that moved", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }, { name: "b", eval: "reflect" }], prefix: "sw" });
    const state = emptyState(m);
    for (const [n, d] of [["base", 0.8], ["a", 0.9], ["b", 0.8]] as const) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, d, 0.9));
      state.screen[n] = record("screen", n, "reflect", label, root, "run");
    }
    const d = buildDecision(root, m, state, 0);
    expect(d.rows.map((r) => [r.config, r.verdict, r.stage, r.note])).toEqual([["a", "screen only", "screen", "screen differs: defects.rate"], ["b", "screen only", "screen", "screen matches the baseline"]]);
    expect(renderMarkdown(d)).toContain("**screen only**<br>screen differs: defects.rate");
  });

  test("a config whose run wrote nothing is a no result row that points at the log; a config not run says so", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }, { name: "b", eval: "reflect" }], prefix: "sw" });
    const state = emptyState(m);
    state.screen.a = { stage: "screen", name: "a", eval: "reflect", label: "sw-a-s", args: [], repeat: null, started: "", wall_seconds: 1, exit_code: 1, log: "logs/sw-a-s.log", results: [] };
    const d = buildDecision(root, m, state, 0);
    expect(d.rows.map((r) => [r.config, r.verdict, r.note])).toEqual([["a", "no result", "the run wrote no summary (exit 1), see logs/sw-a-s.log"], ["b", "no result", "not run"]]);
  });

  test("seconds and calls: a single run reports the runner's wall time, a repeat the mean of the runs", () => {
    const root = tmp();
    const label = "sw-p-s";
    writeRun(root, "promotion", label, { ...fixture("promotion"), label });
    const ref = findResults(root, { label, repeat: null, args: [], row: { name: "p", eval: "promotion", args: [] } }, 0)[0];
    const one = loadMeasured(root, ref, 12.5, null)!;
    expect([one.seconds, one.calls, one.n]).toEqual([12.5, 21, 1]);
  });
});
