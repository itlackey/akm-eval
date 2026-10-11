import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { metricsOf } from "../../../lib/harbor/harbor.ts";
import { buildReport } from "../../../lib/harbor/report.ts";
import { spreadOf } from "../../../lib/repeat.ts";
import { buildDecision, noiseFloors, noiseLine, renderMarkdown } from "./decision.ts";
import { EVAL_METRICS, type Measured, type Matrix, type MetricSpec, type RunRecord, type State, abortedReason, baselineFor, compareAll, confirmJobs, cutShort, emptyState, findResults, incomparable, labelOf, loadMeasured, metricSpread, parseMatrix, resultsParents, runnerFolder, runnerPath, schedule, screenDiffers, screenJobs, selectForConfirm, treatmentOf, verdictOf } from "./lib.ts";

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
  const dir = join(root, runnerFolder(evalName), evalName, "results", `2026-10-09-${label}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "summary.json"), JSON.stringify(s));
  return dir;
}

/** What `--repeat` writes: the runs and a repeat summary beside them (lib/repeat.ts). `samples` are the rows of each run's samples.jsonl. */
function writeRepeat(root: string, evalName: string, label: string, runs: any[], collection?: string, samples?: object[][]): void {
  const parent = join(root, runnerFolder(evalName), evalName, "results");
  const names = runs.map((s, i) => {
    const n = `2026-10-09-${label}-r${i + 1}${collection ? `-${collection}` : ""}`;
    mkdirSync(join(parent, n), { recursive: true });
    writeFileSync(join(parent, n, "summary.json"), JSON.stringify({ ...s, label: `${label}-r${i + 1}`, ...(collection ? { collection } : {}) }));
    if (samples) writeFileSync(join(parent, n, "samples.jsonl"), samples[i].map((row) => `${JSON.stringify(row)}\n`).join(""));
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

// ---- a build treatment (A3) ---------------------------------------------------------------------------------------------------

describe("treatmentOf", () => {
  const m = parseMatrix(
    {
      prefix: "sw",
      baseline: [
        { name: "base", eval: "reflect", args: ["--akm", "bun ~/akm-main/src/cli.ts"] },
        { name: "base-n", eval: "nightly" },
        { name: "base-d", eval: "distill" },
        { name: "base-ab", eval: "agent-ab" },
      ],
      configs: [
        { name: "pr", eval: "reflect", args: ["--akm", "bun ~/akm-pr/src/cli.ts"] },
        { name: "pr-eq", eval: "reflect", args: ["--akm=bun ~/akm-main/src/cli.ts", "--strategy", "quick"] },
        { name: "strategy", eval: "reflect", args: ["--akm", "bun ~/akm-main/src/cli.ts", "--config-patch", "p.json"] },
        { name: "pr-n", eval: "nightly", args: ["--akm", "bun ~/akm-pr/src/cli.ts"] },
        { name: "quick-n", eval: "nightly", args: ["--strategy", "quick"] },
        { name: "marked", eval: "distill", treatment: "build" },
        { name: "ab-release", eval: "agent-ab", args: ["--akm", "akm-cli@0.9.27"] },
        { name: "ab-env", eval: "agent-ab", args: ["--akm-env", "AKM_CURATE_TIMEOUT=30"] },
      ],
    },
    FILE,
  );
  const of = (name: string, matrix: Matrix = m) => treatmentOf(matrix, matrix.configs.find((c) => c.name === name)!);

  test("a config that runs another --akm than its baseline compares builds, and so does one against a baseline on AKM_BIN", () => {
    expect(of("pr")).toBe("build");
    expect(of("pr-n")).toBe("build");
    expect(of("ab-release")).toBe("build");
  });

  test("the same --akm in either spelling, or none, is a config of one build", () => {
    expect(of("pr-eq")).toBe("config");
    expect(of("strategy")).toBe("config");
    expect(of("quick-n")).toBe("config");
    expect(of("ab-env")).toBe("config");
  });

  test('"treatment": "build" marks a row, whatever its flags', () => {
    expect(of("marked")).toBe("build");
    expect(m.configs.find((c) => c.name === "marked")?.treatment).toBe("build");
    expect(m.baselines[0].treatment).toBeUndefined();
  });

  test("the file's akm is the same for both rows and is not a treatment, but a row's own --akm that differs from it is", () => {
    const f = parseMatrix({ prefix: "sw", akm: "bun ~/akm-main/src/cli.ts", baseline: [{ name: "base", eval: "reflect" }], configs: [{ name: "a", eval: "reflect", args: ["--strategy", "x"] }, { name: "b", eval: "reflect", args: ["--akm", "bun ~/akm-pr/src/cli.ts"] }] }, FILE);
    expect([of("a", f), of("b", f)]).toEqual(["config", "build"]);
  });

  test("only \"build\" is a treatment, and only on a config", () => {
    expect(() => parseMatrix({ prefix: "sw", baseline: { eval: "reflect" }, configs: [{ name: "a", eval: "reflect", treatment: "branch" }] }, FILE)).toThrow('treatment must be "build"');
    expect(() => parseMatrix({ prefix: "sw", baseline: { eval: "reflect", treatment: "build" }, configs: [{ name: "a", eval: "reflect" }] }, FILE)).toThrow("treatment is for a config row");
  });
});

describe("a verdict across builds", () => {
  const night = (rate: [number, number], over: Partial<Measured> = {}) => meas({ items: { rate: sp(...rate) }, harm: { items: sp(0, 0), outside_changed: sp(0, 0), lessons_accepted: sp(0, 0) }, calls: { failures: sp(0, 0) } }, over);
  const b = night([0.5, 0.55]);
  const better = (over: Partial<Measured>) => night([0.8, 0.85], over);
  const verdictAt = (c: Measured, treatment: "build" | "config") => verdictOf(compareAll("nightly", b, c), b, c, treatment);

  test("a config treatment needs the same build and version, a build treatment lets them differ", () => {
    const other = better({ akm_build: "b2", akm_version: "0.10.0" });
    expect(verdictAt(other, "config")).toBe("not comparable");
    expect(verdictOf(compareAll("nightly", b, other), b, other)).toBe("not comparable"); // the default is a config treatment
    expect(verdictAt(other, "build")).toBe("better");
    expect(verdictAt(better({ akm_build: null, akm_version: "0.9.26" }), "build")).toBe("better"); // a release against a checkout
  });

  test("the model must be the same whatever the treatment", () => {
    const other = better({ akm_build: "b2", model: "m2" });
    expect(verdictAt(other, "build")).toBe("not comparable");
    expect(incomparable(b, other, "build")).toBe("the model differs: m1 in the baseline, m2 in the config");
  });

  test("the reasons are named, with release for a build that is null", () => {
    expect(incomparable(b, better({ akm_build: null, akm_version: "0.10.0" }))).toBe("the akm build differs: b1 in the baseline, release in the config; the akm version differs: 0.9.30 in the baseline, 0.10.0 in the config");
    expect(incomparable(b, better({}))).toBeNull();
  });
});

/** A sweep of a baseline and one config of the reflect eval, each with three repeats, as the confirm stage leaves them. */
function reflectSweep(m: Matrix, cfgOver: object, baseOver: object = {}): { root: string; state: State } {
  const root = tmp();
  const state = emptyState(m);
  const rep = (name: string, runs: [number, number][], over: object) => {
    const label = labelOf("sw", name, "confirm");
    writeRepeat(root, "reflect", label, runs.map(([d, c]) => reflectSummary(label, d, c, 0, over)));
    state.confirm[name] = record("confirm", name, "reflect", label, root, "repeat", runs.length);
  };
  rep("base", [[0.8, 0.9], [0.82, 0.92], [0.84, 0.94]], baseOver);
  rep("pr", [[0.9, 0.9], [0.92, 0.92], [0.94, 0.94]], cfgOver);
  return { root, state };
}
const oneConfig = (args: string[], extra: object = {}) => parseMatrix({ prefix: "sw", baseline: { name: "base", eval: "reflect" }, configs: [{ name: "pr", eval: "reflect", args, ...extra }] }, FILE);

describe("a build sweep in the decision", () => {
  test("a config with its own --akm on another build is compared, and the row and the table show both builds", () => {
    const m = oneConfig(["--akm", "bun ~/akm-pr/src/cli.ts"]);
    const { root, state } = reflectSweep(m, { akm_build: "v0.9.0-beta.60-2648-g9f6ad3461", akm_version: "0.10.0" }, { akm_build: null, akm_version: "0.9.26" });
    const d = buildDecision(root, m, state, 0);
    expect(d.rows[0]).toMatchObject({ verdict: "better", treatment: "build", baseline_akm_build: null, baseline_akm_version: "0.9.26", akm_build: "v0.9.0-beta.60-2648-g9f6ad3461", akm_version: "0.10.0" });
    expect(d.rows[0].note).not.toContain("not comparable");
    const md = renderMarkdown(d);
    expect(md).toContain("release 0.9.26 → v0.9.0-beta.60-2648-g9f6ad3461");
    expect(md).toContain("shows both builds in the akm build column. The model must still be the same");
  });

  test('the same comparison from a row marked "treatment": "build", with no --akm in its flags', () => {
    const m = oneConfig([], { treatment: "build" });
    const { root, state } = reflectSweep(m, { akm_build: "b2" });
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ verdict: "better", treatment: "build", baseline_akm_build: "b1", akm_build: "b2" });
  });

  test("a config sweep on a build that moved is not comparable, and the note names the two builds", () => {
    const m = oneConfig(["--strategy", "quick"]);
    const { root, state } = reflectSweep(m, { akm_build: "b2" });
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row).toMatchObject({ verdict: "not comparable", treatment: "config", note: "the akm build differs: b1 in the baseline, b2 in the config" });
    expect(renderMarkdown(buildDecision(root, m, state, 0))).not.toContain("shows both builds");
  });

  test("a build treatment with another model is not comparable", () => {
    const m = oneConfig(["--akm", "x"]);
    const { root, state } = reflectSweep(m, { akm_build: "b2", model: "m2" });
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ verdict: "not comparable", note: "the model differs: m1 in the baseline, m2 in the config" });
  });

  test("a build treatment where both ran the same build says so, since nothing was changed", () => {
    const m = oneConfig(["--akm", "x"]);
    const { root, state } = reflectSweep(m, {});
    expect(buildDecision(root, m, state, 0).rows[0].note).toContain("both ran the same akm build (b1), so this treatment changes nothing");
  });
});

// ---- what the summaries record (C1) and runs cut short (C2) ----------------------------------------------------------------

describe("assets_sha256 and seed", () => {
  const a = "a".repeat(64);
  const bb = "b".repeat(64);
  const withAssets = (over: Partial<Measured>) => meas(BASE, over);

  test("two summaries with another digest scored other cases, for either treatment", () => {
    for (const t of ["config", "build"] as const) {
      expect(incomparable(withAssets({ assets_sha256: a }), withAssets({ assets_sha256: bb }), t)).toBe("the cases (assets_sha256) differs: aaaaaaaaaaaa in the baseline, bbbbbbbbbbbb in the config");
    }
  });

  test("a summary that records none is compared as before, and so is the same digest", () => {
    expect(incomparable(withAssets({ assets_sha256: a }), withAssets({}))).toBeNull();
    expect(incomparable(withAssets({ assets_sha256: null }), withAssets({ assets_sha256: bb }))).toBeNull();
    expect(incomparable(withAssets({ assets_sha256: a }), withAssets({ assets_sha256: a }))).toBeNull();
  });

  test("two private runs on other seeds scored other cases; one without a seed is no reason", () => {
    expect(incomparable(withAssets({ seed: 7 }), withAssets({ seed: "8" }))).toBe("the seed of the private assets differs: 7 in the baseline, 8 in the config");
    expect(incomparable(withAssets({ seed: 7 }), withAssets({ seed: "7" }))).toBeNull();
    expect(incomparable(withAssets({ seed: 7 }), withAssets({ seed: null }))).toBeNull();
  });

  test("the verdict is not comparable even when the numbers say better", () => {
    const [x, y] = [withAssets({ assets_sha256: a }), meas(rm([0.9, 0.95], [0.9, 0.95]), { assets_sha256: bb })];
    expect(verdictOf(compareAll("reflect", x, y), x, y)).toBe("not comparable");
  });

  test("loadMeasured reads them from a run, and from the first run of a repeat", () => {
    const root = tmp();
    writeRun(root, "reflect", "sw-a-s", reflectSummary("sw-a-s", 0.5, 0.5, 0, { assets_sha256: a, seed: 42 }));
    const one = loadMeasured(root, findResults(root, { label: "sw-a-s", repeat: null, args: [], row: { name: "a", eval: "reflect", args: [] } }, 0)[0], 5, null)!;
    expect([one.assets_sha256, one.seed]).toEqual([a, 42]);
    writeRepeat(root, "reflect", "sw-b-c", [reflectSummary("x", 0.5, 0.5, 0, { assets_sha256: bb }), reflectSummary("x", 0.6, 0.5, 0, { assets_sha256: bb })]);
    const rep = loadMeasured(root, findResults(root, { label: "sw-b-c", repeat: 2, args: [], row: { name: "b", eval: "reflect", args: [] } }, 0)[0], 5, 2)!;
    expect([rep.assets_sha256, rep.seed]).toEqual([bb, null]);
  });

  test("a confirm of two sweeps made from other assets is not comparable in the decision, with the digests in the note", () => {
    const m = oneConfig(["--strategy", "quick"]);
    const { root, state } = reflectSweep(m, { assets_sha256: bb, seed: 2 }, { assets_sha256: a, seed: 1 });
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ verdict: "not comparable", note: "the cases (assets_sha256) differs: aaaaaaaaaaaa in the baseline, bbbbbbbbbbbb in the config; the seed of the private assets differs: 1 in the baseline, 2 in the config" });
  });
});

describe("a run that was cut short", () => {
  const cut = { status: "aborted", aborted_reason: "the first 5 cases got no verdict, so the run stopped. Last error: HTTP 500", n_run: 5, n_cases: 50 };
  const refOf = (root: string, label: string, repeat: number | null = null) => findResults(root, { label, repeat, args: [], row: { name: "x", eval: "reflect", args: [] } }, 0)[0];

  test("its summary is found, and is no result", () => {
    const root = tmp();
    writeRun(root, "reflect", "sw-a-s", reflectSummary("sw-a-s", 0.5, 0.5, 0, cut));
    writeRun(root, "reflect", "sw-b-s", reflectSummary("sw-b-s", 0.5, 0.5, 0, { status: "complete", aborted_reason: null }));
    expect(loadMeasured(root, refOf(root, "sw-a-s"), 5, null)).toBeNull();
    expect(abortedReason(root, refOf(root, "sw-a-s"))).toBe(cut.aborted_reason);
    expect(loadMeasured(root, refOf(root, "sw-b-s"), 5, null)).not.toBeNull();
    expect(abortedReason(root, refOf(root, "sw-b-s"))).toBeNull();
  });

  test("a repeat with a run that was cut short is no result, and names the run", () => {
    const root = tmp();
    writeRepeat(root, "reflect", "sw-a-c", [reflectSummary("x", 0.5, 0.5), reflectSummary("x", 0.5, 0.5, 0, cut)]);
    expect(loadMeasured(root, refOf(root, "sw-a-c", 2), 5, 2)).toBeNull();
    expect(abortedReason(root, refOf(root, "sw-a-c", 2))).toBe(`run r2: ${cut.aborted_reason}`);
  });

  test("a summary that says aborted with no reason is still no result", () => {
    const root = tmp();
    writeRun(root, "reflect", "sw-a-s", reflectSummary("sw-a-s", 0.5, 0.5, 0, { status: "aborted" }));
    expect(loadMeasured(root, refOf(root, "sw-a-s"), 5, null)).toBeNull();
    expect(abortedReason(root, refOf(root, "sw-a-s"))).toBe("no reason recorded");
  });

  test("the decision row is no result and carries the reason and the log", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }], prefix: "sw" });
    const state = emptyState(m);
    for (const [n, over] of [["base", {}], ["a", cut]] as const) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, 0.8, 0.9, 0, over));
      state.screen[n] = { ...record("screen", n, "reflect", label, root, "run"), exit_code: n === "a" ? 1 : 0, log: `logs/${label}.log` };
    }
    expect(buildDecision(root, m, state, 0).rows.map((r) => [r.config, r.verdict, r.note])).toEqual([["a", "no result", `the run was cut short: ${cut.aborted_reason}, see logs/sw-a-s.log`]]);
    expect(cutShort(root, state.screen.a)).toBe(cut.aborted_reason);
    expect(cutShort(root, state.screen.base)).toBeNull();
    expect(cutShort(root, undefined)).toBeNull();
  });

  test("a baseline that was cut short is named in the config's row", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }], prefix: "sw" });
    const state = emptyState(m);
    for (const [n, over] of [["base", cut], ["a", {}]] as const) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, 0.8, 0.9, 0, over));
      state.screen[n] = record("screen", n, "reflect", label, root, "run");
    }
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ verdict: "no result", note: `the baseline run was cut short: ${cut.aborted_reason}` });
  });

  test("a confirm that was cut short falls back to the screen, and the note says why", () => {
    const m = oneConfig(["--strategy", "quick"]);
    const { root, state } = reflectSweep(m, {});
    for (const n of ["base", "pr"]) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, n === "pr" ? 0.9 : 0.8, 0.9));
      state.screen[n] = record("screen", n, "reflect", label, root, "run");
    }
    const label = labelOf("sw", "pr", "confirm");
    writeRepeat(root, "reflect", `${label}-again`, [reflectSummary("x", 0.9, 0.9, 0, cut), reflectSummary("x", 0.9, 0.9)]);
    state.confirm.pr = { ...record("confirm", "pr", "reflect", `${label}-again`, root, "repeat", 2), label: `${label}-again` };
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row).toMatchObject({ stage: "screen", verdict: "screen only" });
    expect(row.note).toBe(`the confirm run was cut short: run r1: ${cut.aborted_reason}`);
  });

  test("a screen that was cut short is not confirmed, and says why", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }], prefix: "sw" });
    const state = emptyState(m);
    for (const [n, over] of [["base", {}], ["a", cut]] as const) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, 0.8, 0.9, 0, over));
      state.screen[n] = record("screen", n, "reflect", label, root, "run");
    }
    expect(selectForConfirm(root, m, state, { minDelta: 0 }).skipped.map((s) => [s.config.name, s.reason])).toEqual([["a", `no screen result, the run was cut short: ${cut.aborted_reason}`]]);
  });
});

// ---- the Harbor evals and benchmarks (B2) ---------------------------------------------------------------------------------------

describe("the Harbor evals", () => {
  const trial = (task: string, arm: "control" | "akm", reward: number | null, extra: Record<string, unknown> = {}) => ({ task, arm, trial: `${task}-${arm}`, reward, error: null, akm: arm === "akm" ? { akm_show: 1 } : null, tools: 2, tokens: null, costUsd: null, seconds: 60, timed_out: false, ...extra });
  /** What a Harbor eval writes: the metrics of lib/harbor/harbor.ts for the akm arm's rewards on three tasks against a control that passes the first. */
  const summaryOf = (akmRewards: number[], name = "agent-ab", controlCalls = false) => {
    const trials = [...akmRewards.map((r, i) => trial(`t${i}`, "akm", r)), ...akmRewards.map((_, i) => trial(`t${i}`, "control", i === 0 ? 1 : 0, controlCalls ? { akm: { akm_show: 1 } } : {}))];
    return { eval: name, corpus: "public", model: "m1", akm_version: "0.9.26", akm_bin: "akm-cli@0.9.26", akm_build: null, n_errored: 0, metrics: metricsOf(buildReport(trials), trials) };
  };

  test("are registered with the difference of the arms as the main metric and the akm arm's errors and the control's calls as harm", () => {
    const want: MetricSpec[] = [{ path: "delta.value", dir: "up", role: "main" }, { path: "akm.errored", dir: "down", role: "harm" }, { path: "engagement.control_calls", dir: "down", role: "harm" }];
    expect(EVAL_METRICS["agent-ab"]).toEqual(want);
    expect(EVAL_METRICS["terminal-bench"]).toEqual(want);
  });

  for (const name of ["agent-ab", "terminal-bench"]) {
    test(`${name}: every metric path is a number in a summary the runner writes, and has a spread in a repeat summary`, () => {
      const s = summaryOf([1, 1, 0], name);
      const m: Measured = { scope: "", n: 1, model: null, akm_build: null, akm_version: null, n_errored: null, calls: null, seconds: null, metrics: s.metrics, repeated: false };
      for (const spec of EVAL_METRICS[name]) expect(metricSpread(m, spec.path), spec.path).not.toBeNull();
      const rep: Measured = { ...m, n: 2, metrics: spreadOf([s.metrics, summaryOf([0, 1, 0], name).metrics]), repeated: true };
      for (const spec of EVAL_METRICS[name]) expect(metricSpread(rep, spec.path), spec.path).not.toBeNull();
    });
  }

  test("a better difference between the arms is better, unless the control called akm, which makes it mixed", () => {
    const measured = (akm: number[], controlCalls = false): Measured => ({ scope: "", n: 3, model: "m1", akm_build: null, akm_version: "0.9.26", n_errored: 0, calls: null, seconds: null, repeated: true, metrics: spreadOf([1, 2, 3].map(() => summaryOf(akm, "agent-ab", controlCalls).metrics)) });
    const [base, better, called] = [measured([0, 0, 0]), measured([1, 1, 1]), measured([1, 1, 1], true)];
    expect(verdictOf(compareAll("agent-ab", base, better), base, better)).toBe("better");
    expect(compareAll("agent-ab", base, called).map((c) => [c.path, c.signal])).toEqual([["delta.value", "better"], ["akm.errored", "same"], ["engagement.control_calls", "worse"]]);
    expect(verdictOf(compareAll("agent-ab", base, called), base, called)).toBe("mixed");
  });
});

describe("a row that names a benchmark", () => {
  const ROOT = resolve(import.meta.dir, "..", "..", "..");
  const file = { prefix: "sw", model: "cloud/some-model", akm: "bun ~/akm/src/cli.ts", baseline: [{ name: "base", eval: "reflect" }, { name: "base-ab", eval: "agent-ab" }, { name: "base-tb", eval: "terminal-bench" }], configs: [{ name: "tb-env", eval: "terminal-bench", args: ["--akm-env", "AKM_X=1", "--attempts", "2"] }, { name: "tb-pr", eval: "terminal-bench", args: ["--akm", "/home/me/akm"] }], screen: { limit: 2 } };

  test("every eval and benchmark of EVAL_METRICS has a run script where the runner looks for it", () => {
    for (const name of Object.keys(EVAL_METRICS)) expect(existsSync(runnerPath(ROOT, name)), runnerPath(ROOT, name)).toBe(true);
    expect([runnerFolder("terminal-bench"), runnerFolder("agent-ab"), runnerFolder("reflect")]).toEqual(["benchmarks", "evals", "evals"]);
    expect(runnerPath("/r", "terminal-bench")).toBe("/r/benchmarks/terminal-bench/run");
    expect(runnerPath("/r", "nightly")).toBe("/r/evals/nightly/run");
  });

  test("parses, and gets --model and --limit but not the file's akm command", () => {
    const jobs = screenJobs(parseMatrix(file, FILE));
    expect(jobs.map((j) => j.args)).toEqual([
      ["--model", "cloud/some-model", "--akm", "bun ~/akm/src/cli.ts", "--limit", "2", "--label", "sw-base-s"],
      ["--model", "cloud/some-model", "--limit", "2", "--label", "sw-base-ab-s"],
      ["--model", "cloud/some-model", "--limit", "2", "--label", "sw-base-tb-s"],
      ["--model", "cloud/some-model", "--akm-env", "AKM_X=1", "--attempts", "2", "--limit", "2", "--label", "sw-tb-env-s"],
      ["--model", "cloud/some-model", "--akm", "/home/me/akm", "--limit", "2", "--label", "sw-tb-pr-s"],
    ]);
  });

  test("its confirm run is --repeat of the benchmark", () => {
    const m = parseMatrix(file, FILE);
    const jobs = confirmJobs(m, [{ config: m.configs[0], reason: "named" }]);
    expect(jobs.map((j) => [j.row.eval, j.label])).toEqual([["terminal-bench", "sw-base-tb-c"], ["terminal-bench", "sw-tb-env-c"]]);
    expect(jobs[1].args).toEqual(["--model", "cloud/some-model", "--akm-env", "AKM_X=1", "--attempts", "2", "--repeat", "3", "--label", "sw-tb-env-c"]);
  });

  test("its results are looked for in benchmarks/<name>/results, and in private/<name>/ for a private corpus", () => {
    expect(resultsParents("/r", "terminal-bench", [])).toEqual(["/r/benchmarks/terminal-bench/results"]);
    expect(resultsParents("/r", "agent-ab", [])).toEqual(["/r/evals/agent-ab/results"]);
    expect(resultsParents("/r", "terminal-bench", ["--corpus", "private"])[0]).toBe("/r/private/terminal-bench/results");
  });

  test("a run and a repeat of a benchmark are found by their label", () => {
    const root = tmp();
    const s = (label: string) => ({ eval: "terminal-bench", corpus: "public", label, model: "m1", akm_version: "0.9.26", akm_bin: "akm-cli@0.9.26", akm_build: null, n_errored: 0, metrics: { delta: { value: 0.1 }, akm: { errored: 0 }, engagement: { control_calls: 0 } } });
    writeRun(root, "terminal-bench", "sw-tb-s", s("sw-tb-s"));
    writeRepeat(root, "terminal-bench", "sw-tb-c", [s("x"), s("x")]);
    const row = { name: "tb", eval: "terminal-bench", args: [] };
    expect(findResults(root, { label: "sw-tb-s", repeat: null, args: [], row }, 0)).toEqual([{ scope: "", kind: "run", file: "benchmarks/terminal-bench/results/2026-10-09-sw-tb-s/summary.json" }]);
    expect(findResults(root, { label: "sw-tb-c", repeat: 2, args: [], row }, 0).map((r) => r.kind)).toEqual(["repeat"]);
  });

  test("--dry-run names the run script of each row, in benchmarks/ for a benchmark and in evals/ for an eval", async () => {
    const dir = tmp();
    const matrix = join(dir, "m.json");
    writeFileSync(matrix, JSON.stringify(file));
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "run.ts"), matrix, "--stage", "screen", "--dry-run"], { stdout: "pipe", stderr: "pipe" });
    const [out, code] = [await new Response(proc.stdout).text(), await proc.exited];
    expect(code).toBe(0);
    expect(out.split("\n").filter(Boolean).map((l) => l.split(" ")[0])).toEqual(["evals/reflect/run", "evals/agent-ab/run", "benchmarks/terminal-bench/run", "benchmarks/terminal-bench/run", "benchmarks/terminal-bench/run"]);
  });

  test("the confirm stage says there is no noise floor yet before any baseline has repeats, and still names the benchmark's script", async () => {
    const dir = tmp();
    const matrix = join(dir, "m.json");
    writeFileSync(matrix, JSON.stringify(file));
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "run.ts"), matrix, "--stage", "confirm", "--only", "tb-env", "--dry-run", "--out", join(dir, "out")], { stdout: "pipe", stderr: "pipe" });
    const [out, code] = [await new Response(proc.stdout).text(), await proc.exited];
    expect(code).toBe(0);
    expect(out).toContain("noise    none yet: no baseline has been confirmed");
    expect(out).toContain("benchmarks/terminal-bench/run --model cloud/some-model --akm-env AKM_X=1 --attempts 2 --repeat 3 --label sw-tb-env-c");
  });
});

// ---- the paired comparison (B1) and the noise floor ---------------------------------------------------------------------------

const nightlyRows = (oks: boolean[]) => oks.map((ok, i) => ({ id: `c${String(i + 1).padStart(2, "0")}`, kind: "pair", class: "duplicate", ok, harm: false, checks: {}, state: ok ? "fixed" : "left alone", detail: {} }));
const nightlySummary = (label: string, oks: boolean[], over: object = {}) => {
  const ok = oks.filter(Boolean).length;
  return { eval: "nightly", corpus: "public", label, model: "m1", akm_version: "0.9.30", akm_bin: "akm", akm_build: "b1", n_errored: 0, metrics: { items: { n: oks.length, ok, rate: ok / oks.length }, harm: { items: 0, outside_changed: 0, lessons_accepted: 0 }, calls: { failures: 0 } }, ...over };
};
/** The first n of 20 cases right. */
const firstOk = (n: number, total = 20): boolean[] => Array.from({ length: total }, (_, i) => i < n);

/** A nightly baseline and config, each repeated: `base` and `cfg` are the cases each repeat got right. */
function nightlySweep(m: Matrix, base: boolean[][], cfg: boolean[][], cfgOver: object = {}, withSamples = true): { root: string; state: State } {
  const root = tmp();
  const state = emptyState(m);
  const rep = (name: string, runs: boolean[][], over: object) => {
    const label = labelOf("sw", name, "confirm");
    writeRepeat(root, "nightly", label, runs.map((oks) => nightlySummary(label, oks, over)), undefined, withSamples ? runs.map(nightlyRows) : undefined);
    state.confirm[name] = record("confirm", name, "nightly", label, root, "repeat", runs.length);
  };
  rep("base", base, {});
  rep("cfg", cfg, cfgOver);
  return { root, state };
}
const nightlyMatrix = (args: string[] = ["--strategy", "quick"]) => parseMatrix({ prefix: "sw", baseline: { name: "base", eval: "nightly" }, configs: [{ name: "cfg", eval: "nightly", args }] }, FILE);
// The repeats of the baseline are 8, 12 and 16 cases right; the config's are the same runs with 5, 5 and 4 more right. Its range overlaps the baseline's.
const [BASE_RUNS, CFG_RUNS] = [[8, 12, 16].map((n) => firstOk(n)), [13, 17, 20].map((n) => firstOk(n))];

describe("the paired comparison in the confirm stage", () => {
  test("adds the flips, the sign test and the intervals of the first pair of repeats, and of every pair when the counts match", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS);
    const row = buildDecision(root, m, state, 0).rows[0];
    const p = row.paired!;
    expect(p).toMatchObject({ pairs: 3, view: "", n_paired: 20, better: 5, worse: 0, agree: 15, p: 0.0625 });
    expect(p.runs.map((r) => [r.run, r.better, r.worse, r.agree])).toEqual([[1, 5, 0, 15], [2, 5, 0, 15], [3, 4, 0, 16]]);
    const rate = p.ci.find((x) => x.path === "items.rate")!;
    expect(rate).toMatchObject({ role: "main", dir: "up", delta: 0.25, signal: "better" });
    expect(rate.ci![0]).toBeGreaterThan(0);
    expect(rate.ci![1]).toBeLessThanOrEqual(0.5);
    expect(p.ci.find((x) => x.path === "harm.items")).toMatchObject({ role: "harm", delta: 0, signal: "same" });
  });

  test("keeps the min-max verdict, and says in the note that the paired interval excludes 0", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS);
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row.verdict).toBe("no difference"); // the ranges 0.4-0.8 and 0.65-1.0 overlap
    expect(row.note).toMatch(/^paired says different: items\.rate better \+0\.25 \(\+0\.\d+ to \+0\.\d+\), in 3 of 3 pairs of repeats$/);
  });

  test("a pair that is the same raises nothing", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, BASE_RUNS);
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row.verdict).toBe("no difference");
    expect(row.paired).toMatchObject({ better: 0, worse: 0, agree: 20, p: null });
    expect(row.note).toBe("");
  });

  test("adds a column to the table with the flips and the interval, and explains it once", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS);
    const md = renderMarkdown(buildDecision(root, m, state, 0));
    expect(md).toContain("| akm build | model | paired | verdict |");
    expect(md).toContain("5 better, 0 worse, 15 agree, p 0.063<br>items.rate +0.25 (+");
    expect(md).toContain("**better**<br>harm.items 0 (0 to 0)<br>r1 of 3 pairs");
    expect(md).toContain("The paired column is scripts/compare on the first repeat");
    expect(md).toContain("paired says different");
  });

  test("with one side short of repeats, only the first pair is compared", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS.slice(0, 2));
    const p = buildDecision(root, m, state, 0).rows[0].paired!;
    expect([p.pairs, p.runs.length, p.better]).toEqual([1, 1, 5]);
  });

  test("compare's refusal is a note and no paired column, whatever the verdict says", () => {
    const m = nightlyMatrix(["--akm", "bun ~/akm-pr/src/cli.ts"]); // a build treatment, so another akm version is not a reason to refuse here
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS, { akm_build: "b2", akm_version: "0.10.0" });
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row).toMatchObject({ treatment: "build", paired: null });
    expect(row.note).toContain("no paired comparison: these two runs cannot be compared case by case: the akm version differs: 0.9.30 in A, 0.10.0 in B");
    expect(renderMarkdown(buildDecision(root, m, state, 0))).not.toContain("| paired |");
  });

  test("a run with no samples.jsonl is a note", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS, {}, false);
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row.paired).toBeNull();
    expect(row.note).toContain("no paired comparison: ");
    expect(row.note).toContain("has no samples.jsonl");
  });

  test("the screen stage has none, and neither has a row that is not comparable", () => {
    const m = nightlyMatrix();
    const root = tmp();
    const state = emptyState(m);
    for (const [n, oks] of [["base", firstOk(8)], ["cfg", firstOk(13)]] as const) {
      const label = labelOf("sw", n, "screen");
      const dir = writeRun(root, "nightly", label, nightlySummary(label, oks));
      writeFileSync(join(dir, "samples.jsonl"), nightlyRows(oks).map((r) => `${JSON.stringify(r)}\n`).join(""));
      state.screen[n] = record("screen", n, "nightly", label, root, "run");
    }
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ stage: "screen", verdict: "screen only", paired: null });
    const moved = nightlySweep(m, BASE_RUNS, CFG_RUNS, { akm_build: "b2" });
    expect(buildDecision(moved.root, m, moved.state, 0).rows[0]).toMatchObject({ verdict: "not comparable", paired: null });
  });

  test("an eval compare has no per-case reading for has no paired column and no note", () => {
    const m = parseMatrix({ prefix: "sw", baseline: { name: "base", eval: "agent-ab" }, configs: [{ name: "cfg", eval: "agent-ab", args: ["--akm-env", "AKM_X=1"] }] }, FILE);
    const root = tmp();
    const state = emptyState(m);
    const metrics = (v: number) => ({ delta: { value: v }, akm: { errored: 0 }, engagement: { control_calls: 0 } });
    for (const [n, v] of [["base", [0.1, 0.12, 0.14]], ["cfg", [0.5, 0.52, 0.54]]] as const) {
      const label = labelOf("sw", n, "confirm");
      writeRepeat(root, "agent-ab", label, v.map((x) => ({ eval: "agent-ab", model: "m1", akm_version: "0.9.26", akm_build: null, n_errored: 0, metrics: metrics(x) })));
      state.confirm[n] = record("confirm", n, "agent-ab", label, root, "repeat", 3);
    }
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ verdict: "better", paired: null, note: "" });
  });
});

describe("the noise floor of the baselines", () => {
  test("is the flip rate of a baseline's repeats from scripts/compare, with the largest change of a main metric between two runs", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS);
    const { floors, notes } = noiseFloors(root, m, state);
    expect(notes).toEqual([]);
    expect(floors).toHaveLength(1);
    // 8 cases are right in only some of the runs and flip in 2 of the 3 pairs of runs; the other 12 are the same in all three.
    expect(floors[0]).toMatchObject({ eval: "nightly", baseline: "base", scope: "", view: "", runs: 3, n_compared: 20, n_unstable: 8, flip_rate: 0.2667, expected_flips: 5.33 });
    expect(floors[0].min_delta_hint).toBe(0.2667); // items.rate is 0.4, 0.6 and 0.8, so two runs differ by 0.2, 0.4 and 0.2 and the mean is 0.2667
  });

  test("is printed as a line with the --min-delta to start from", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS);
    const line = noiseLine(noiseFloors(root, m, state).floors[0]);
    expect(line).toContain("nightly base: 3 runs, mean flip rate ");
    expect(line).toContain("cases flip between two runs of one configuration");
    expect(line).toContain("a main metric differs by 0.267 between two runs of one configuration, so start --min-delta at 0.267");
  });

  test("a baseline whose repeats never changed gives no floor for --min-delta", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, [firstOk(8), firstOk(8)], [firstOk(8), firstOk(8)]);
    const [f] = noiseFloors(root, m, state).floors;
    expect(f).toMatchObject({ flip_rate: 0, min_delta_hint: 0 });
    expect(noiseLine(f)).toContain("there is no floor for --min-delta");
  });

  test("has none before a baseline is confirmed, and none for an eval compare does not read; repeats it cannot read are a note", () => {
    const m = nightlyMatrix();
    expect(noiseFloors(tmp(), m, emptyState(m))).toEqual({ floors: [], notes: [] });
    const unread = nightlySweep(m, BASE_RUNS, CFG_RUNS, {}, false);
    const r = noiseFloors(unread.root, m, unread.state);
    expect(r.floors).toEqual([]);
    expect(r.notes[0]).toMatch(/^base: .*has no samples\.jsonl/);
  });
});
