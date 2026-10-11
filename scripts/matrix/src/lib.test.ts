import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { metricsOf } from "../../../lib/harbor/harbor.ts";
import { buildReport } from "../../../lib/harbor/report.ts";
import { spreadOf } from "../../../lib/repeat.ts";
import { buildDecision, noiseFloors, noiseLine, renderMarkdown } from "./decision.ts";
import { EVALS, EVAL_METRICS, type Measured, type Matrix, type MetricSpec, type RunRecord, type State, assess, baselineFor, compareAll, confirmJobs, emptyState, findResults, incomparable, incompleteReason, judge, labelOf, loadMeasured, measuredOf, metricSpread, moreErrors, parseMatrix, resultsParents, runnerFolder, runnerPath, schedule, screenDiffers, screenJobs, selectForConfirm, treatmentAxes, unusableReason, verdictOf } from "./lib.ts";
import { type Axis, identityOf } from "../../compare/src/policy.ts";
import { fingerprintOf, readDotEnv, resumable } from "./fingerprint.ts";
import { pairedOf } from "./paired.ts";

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

/** What a summary records of how its run was made and that it finished, so that two runs of a sweep are fully identified and complete. */
const IDENTIFIED = {
  status: "complete",
  aborted_reason: null,
  git_commit: "5d1c0de",
  assets_sha256: "a".repeat(64),
  seed: null,
  strategy: "reflect-only",
  config_patch: null,
  config: { defaults: { llmEngine: "model" }, engines: { model: { kind: "llm", model: "m1", endpoint: "<MODEL_BASE_URL>", temperature: 0, enableThinking: false, timeoutMs: 120000 } }, improve: { strategies: { "reflect-only": { processes: { reflect: {} } } } } },
  engine: { engine: "model", model: "m1", endpoint: "gateway.example.com", temperature: 0, enableThinking: false, timeoutMs: 120000 },
};

/** A reflect summary with the given rates. */
const reflectSummary = (label: string, defects: number, controls: number, touched = 0, extra: object = {}): any => ({
  ...fixture("reflect"),
  ...IDENTIFIED,
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
      const m: Measured = { scope: "", n: 1, model: null, akm_build: null, akm_version: null, n_errored: null, calls: null, seconds: null, metrics: s.metrics, repeated: false, failed: null, runs: [] };
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
    const m: Measured = { scope: "", n: 2, model: null, akm_build: null, akm_version: null, n_errored: null, calls: null, seconds: null, metrics: rs.metrics, repeated: true, failed: null, runs: [] };
    expect(metricSpread(m, "defects.rate")).toEqual({ min: 0.9375, max: 0.9375, mean: 0.9375 });
  });
});

// ---- the verdict ------------------------------------------------------------------------------------------------------------

/**
 * A result of `n` runs (3 unless the override says) of the reflect eval, fully identified: each run's identity is IDENTIFIED with the
 * model, akm build and version, cases and seed the override gives. `identity` changes the identity of the runs behind the numbers
 * (every run, or `{ 1: ... }` for the second only).
 */
const meas = (metrics: object, over: Partial<Measured> & { identity?: Record<string, unknown> } = {}): Measured => {
  const { identity = {}, ...rest } = over;
  const m: Measured = { scope: "", n: 3, model: "m1", akm_build: "b1", akm_version: "0.9.30", n_errored: 0, failed: null, calls: null, seconds: null, metrics, repeated: true, runs: [], ...rest };
  const record = { ...IDENTIFIED, eval: "reflect", corpus: "public", akm_bin: "akm", model: m.model, akm_build: m.akm_build, akm_version: m.akm_version, ...(m.assets_sha256 !== undefined ? { assets_sha256: m.assets_sha256 } : {}), ...(m.seed !== undefined ? { seed: m.seed } : {}), ...identity };
  return { ...m, runs: rest.runs ?? Array.from({ length: m.n }, (_, i) => ({ name: `r${i + 1}`, identity: identityOf(record) })) };
};
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
      const runs = base.map(([d, c], i) => (ev === "reflect" ? reflectSummary(label, d, c, 0, { akm_build: build }) : { ...fixture("retrieval"), ...IDENTIFIED, model: undefined, akm_build: build, metrics: { search: { ndcg_10: d }, curate: { ndcg_10: d }, semantic_search: { ndcg_10: d }, semantic_curate: { ndcg_10: d } } }));
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
    writeRun(root, "promotion", label, { ...fixture("promotion"), ...IDENTIFIED, label });
    const ref = findResults(root, { label, repeat: null, args: [], row: { name: "p", eval: "promotion", args: [] } }, 0)[0];
    const one = loadMeasured(root, ref, 12.5, null)!;
    expect([one.seconds, one.calls, one.n]).toEqual([12.5, 21, 1]);
  });
});

// ---- a build treatment (A3) ---------------------------------------------------------------------------------------------------

describe("treatmentAxes", () => {
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
        { name: "other-model", eval: "reflect", args: ["--akm", "bun ~/akm-main/src/cli.ts", "--model", "other"], treatment: "model" },
        { name: "pr-and-patch", eval: "reflect", args: ["--akm", "bun ~/akm-main/src/cli.ts"], treatment: ["config", "build"] },
        { name: "pr-other-model", eval: "reflect", args: ["--akm", "bun ~/akm-pr/src/cli.ts"], treatment: "model" },
      ],
    },
    FILE,
  );
  const of = (name: string, matrix: Matrix = m) => treatmentAxes(matrix, matrix.configs.find((c) => c.name === name)!);

  test("a config that runs another --akm than its baseline compares builds, and so does one against a baseline on AKM_BIN", () => {
    expect(of("pr")).toEqual(["build"]);
    expect(of("pr-n")).toEqual(["build"]);
    expect(of("ab-release")).toEqual(["build"]);
  });

  test("the same --akm in either spelling, or none, is a config of one build", () => {
    expect(of("pr-eq")).toEqual(["config"]);
    expect(of("strategy")).toEqual(["config"]);
    expect(of("quick-n")).toEqual(["config"]);
    expect(of("ab-env")).toEqual(["config"]);
  });

  test('"treatment": "build" marks a row, whatever its flags', () => {
    expect(of("marked")).toEqual(["build"]);
    expect(m.configs.find((c) => c.name === "marked")?.treatment).toEqual(["build"]);
    expect(m.baselines[0].treatment).toBeUndefined();
  });

  test("a row declares any of the axes, alone or in a list, and a different --akm adds the build", () => {
    expect(of("other-model")).toEqual(["model"]);
    expect(of("pr-and-patch")).toEqual(["build", "config"]);
    expect(of("pr-other-model")).toEqual(["build", "model"]);
    const f = parseMatrix({ prefix: "sw", baseline: { eval: "reflect" }, configs: [{ name: "a", eval: "reflect", treatment: ["harness", "inputs"] }] }, FILE);
    expect(of("a", f)).toEqual(["inputs", "harness"]);
  });

  test("the file's akm is the same for both rows and is not a treatment, but a row's own --akm that differs from it is", () => {
    const f = parseMatrix({ prefix: "sw", akm: "bun ~/akm-main/src/cli.ts", baseline: [{ name: "base", eval: "reflect" }], configs: [{ name: "a", eval: "reflect", args: ["--strategy", "x"] }, { name: "b", eval: "reflect", args: ["--akm", "bun ~/akm-pr/src/cli.ts"] }] }, FILE);
    expect([of("a", f), of("b", f)]).toEqual([["config"], ["build"]]);
  });

  test("a treatment is an axis or a list of them, and only on a config", () => {
    for (const bad of ["branch", [], ["build", "nope"], 3]) expect(() => parseMatrix({ prefix: "sw", baseline: { eval: "reflect" }, configs: [{ name: "a", eval: "reflect", treatment: bad }] }, FILE)).toThrow("treatment must be one of build, config, model, inputs, harness");
    expect(() => parseMatrix({ prefix: "sw", baseline: { eval: "reflect", treatment: "build" }, configs: [{ name: "a", eval: "reflect" }] }, FILE)).toThrow("treatment is for a config row");
  });
});

describe("a verdict across builds", () => {
  const night = (rate: [number, number], over: Partial<Measured> & { identity?: Record<string, unknown> } = {}) => meas({ items: { rate: sp(...rate) }, harm: { items: sp(0, 0), outside_changed: sp(0, 0), lessons_accepted: sp(0, 0) }, calls: { failures: sp(0, 0) } }, over);
  const b = night([0.5, 0.55]);
  const better = (over: Partial<Measured> & { identity?: Record<string, unknown> }) => night([0.8, 0.85], over);
  const verdictAt = (c: Measured, treatment: Axis[]) => verdictOf(compareAll("nightly", b, c), b, c, treatment);

  test("a config treatment needs the same build and version, a build treatment lets them differ", () => {
    const other = better({ akm_build: "b2", akm_version: "0.10.0" });
    expect(verdictAt(other, ["config"])).toBe("not comparable");
    expect(verdictOf(compareAll("nightly", b, other), b, other)).toBe("not comparable"); // the default is a config treatment
    expect(verdictAt(other, ["build"])).toBe("better");
    expect(verdictAt(better({ akm_build: null, akm_version: "0.9.26" }), ["build"])).toBe("better"); // a release against a checkout
  });

  test("the model must be the same unless it is the treatment, whatever else is", () => {
    const other = better({ akm_build: "b2", model: "m2" });
    expect(verdictAt(other, ["build"])).toBe("not comparable");
    expect(incomparable(b, other, ["build"])).toBe("the model differs: m1 in the baseline, m2 in the config");
    expect(verdictAt(other, ["build", "model"])).toBe("better");
  });

  test("the reasons are named, with release for a build that is null", () => {
    expect(incomparable(b, better({ akm_build: null, akm_version: "0.10.0" }))).toBe("the akm version differs: 0.9.30 in the baseline, 0.10.0 in the config; the akm build differs: b1 in the baseline, release in the config");
    expect(incomparable(b, better({}))).toBeNull();
  });
});

/**
 * A sweep of a baseline and one config of the reflect eval, each with three repeats, as the confirm stage leaves them. `over` changes the
 * summaries of a side: one object for every run, or a list with one for each run. `nErrored` is the errored cases of each run.
 */
function reflectSweep(m: Matrix, cfgOver: object | object[], baseOver: object | object[] = {}, nErrored: { base?: number; pr?: number } = {}): { root: string; state: State } {
  const root = tmp();
  const state = emptyState(m);
  const rep = (name: "base" | "pr", runs: [number, number][], over: object | object[]) => {
    const label = labelOf("sw", name, "confirm");
    writeRepeat(root, "reflect", label, runs.map(([d, c], i) => reflectSummary(label, d, c, 0, { n_errored: nErrored[name] ?? 0, ...(Array.isArray(over) ? (over[i] ?? {}) : over) })));
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
    expect(d.rows[0]).toMatchObject({ verdict: "better", treatment: ["build"], baseline_akm_build: null, baseline_akm_version: "0.9.26", akm_build: "v0.9.0-beta.60-2648-g9f6ad3461", akm_version: "0.10.0" });
    expect(d.rows[0].note).not.toContain("not comparable");
    const md = renderMarkdown(d);
    expect(md).toContain("release 0.9.26 → v0.9.0-beta.60-2648-g9f6ad3461");
    expect(md).toContain("shows both builds in the akm build column. Every axis outside the row's treatment must still be the same");
  });

  test('the same comparison from a row marked "treatment": "build", with no --akm in its flags', () => {
    const m = oneConfig([], { treatment: "build" });
    const { root, state } = reflectSweep(m, { akm_build: "b2" });
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ verdict: "better", treatment: ["build"], baseline_akm_build: "b1", akm_build: "b2" });
  });

  test("a config sweep on a build that moved is not comparable, and the note names the two builds", () => {
    const m = oneConfig(["--strategy", "quick"]);
    const { root, state } = reflectSweep(m, { akm_build: "b2" });
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row).toMatchObject({ verdict: "not comparable", treatment: ["config"], note: "the akm build differs: b1 in the baseline, b2 in the config" });
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
  const withAssets = (over: Partial<Measured> & { identity?: Record<string, unknown> }) => meas(BASE, over);
  const better = (over: Partial<Measured> & { identity?: Record<string, unknown> }) => meas(rm([0.9, 0.95], [0.9, 0.95]), over);

  test("two summaries with another digest scored other cases, for either treatment", () => {
    for (const t of [["config"], ["build"]] as Axis[][]) {
      expect(incomparable(withAssets({ assets_sha256: a }), withAssets({ assets_sha256: bb }), t)).toBe("the cases (assets_sha256) differs: aaaaaaaaaaaa in the baseline, bbbbbbbbbbbb in the config");
    }
    expect(incomparable(withAssets({ assets_sha256: a }), withAssets({ assets_sha256: a }))).toBeNull();
  });

  test("the cases are the treatment only when the row says so", () => {
    expect(incomparable(withAssets({ assets_sha256: a }), withAssets({ assets_sha256: bb }), ["inputs"])).toBeNull();
  });

  test("a digest that a summary does not record is no pass: the verdict is exploratory, whether it is missing on one side or on both", () => {
    const [x, y] = [withAssets({ assets_sha256: a }), better({ assets_sha256: null })];
    expect(incomparable(x, y)).toBeNull();
    const one = judge("reflect", compareAll("reflect", x, y), x, y);
    expect(one).toMatchObject({ verdict: "exploratory", reading: "better", exploratory: ["the cases (assets_sha256) is not recorded in the config"] });
    const none = judge("reflect", compareAll("reflect", withAssets({ assets_sha256: null }), y), withAssets({ assets_sha256: null }), y);
    expect(none).toMatchObject({ verdict: "exploratory", exploratory: ["the cases (assets_sha256) is not recorded in the baseline and the config"] });
    expect(judge("reflect", compareAll("reflect", x, better({ assets_sha256: a })), x, better({ assets_sha256: a })).verdict).toBe("better");
  });

  test("two private runs on other seeds scored other cases; a private run without a seed is exploratory", () => {
    const priv = { identity: { corpus: "private" } };
    expect(incomparable(withAssets({ seed: 7, ...priv }), withAssets({ seed: "8", ...priv }))).toBe("the seed of the private assets differs: 7 in the baseline, 8 in the config");
    expect(incomparable(withAssets({ seed: 7, ...priv }), withAssets({ seed: "7", ...priv }))).toBeNull();
    const [x, y] = [withAssets({ seed: 7, ...priv }), better({ seed: null, ...priv })];
    expect(incomparable(x, y)).toBeNull();
    expect(judge("reflect", compareAll("reflect", x, y), x, y)).toMatchObject({ verdict: "exploratory", exploratory: ["the seed of the private assets is not recorded in the config"] });
    // a public run has no seed to record
    expect(incomparable(withAssets({ seed: null }), withAssets({ seed: null }))).toBeNull();
    expect(judge("reflect", compareAll("reflect", withAssets({ seed: null }), better({ seed: null })), withAssets({ seed: null }), better({ seed: null })).verdict).toBe("better");
  });

  test("the verdict is not comparable even when the numbers say better", () => {
    const [x, y] = [withAssets({ assets_sha256: a }), meas(rm([0.9, 0.95], [0.9, 0.95]), { assets_sha256: bb })];
    expect(verdictOf(compareAll("reflect", x, y), x, y)).toBe("not comparable");
  });

  test("loadMeasured reads the identity of every run of a repeat, and the first run's digest and seed", () => {
    const root = tmp();
    writeRun(root, "reflect", "sw-a-s", reflectSummary("sw-a-s", 0.5, 0.5, 0, { assets_sha256: a, seed: 42 }));
    const one = loadMeasured(root, findResults(root, { label: "sw-a-s", repeat: null, args: [], row: { name: "a", eval: "reflect", args: [] } }, 0)[0], 5, null)!;
    expect([one.assets_sha256, one.seed]).toEqual([a, 42]);
    expect(one.runs.map((r) => r.identity.assets_sha256)).toEqual([a]);
    writeRepeat(root, "reflect", "sw-b-c", [reflectSummary("x", 0.5, 0.5, 0, { assets_sha256: bb }), reflectSummary("x", 0.6, 0.5, 0, { assets_sha256: a }), reflectSummary("x", 0.6, 0.5, 0, { assets_sha256: bb })]);
    const rep = loadMeasured(root, findResults(root, { label: "sw-b-c", repeat: 3, args: [], row: { name: "b", eval: "reflect", args: [] } }, 0)[0], 5, 3)!;
    expect([rep.assets_sha256, rep.seed]).toEqual([bb, null]);
    expect(rep.runs.map((r) => r.identity.assets_sha256)).toEqual([bb, a, bb]);
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
    expect(incompleteReason(root, refOf(root, "sw-a-s"))).toBe(`was cut short: ${cut.aborted_reason}`);
    expect(loadMeasured(root, refOf(root, "sw-b-s"), 5, null)).not.toBeNull();
    expect(incompleteReason(root, refOf(root, "sw-b-s"))).toBeNull();
  });

  test("a repeat with a run that was cut short is no result, and names the run", () => {
    const root = tmp();
    writeRepeat(root, "reflect", "sw-a-c", [reflectSummary("x", 0.5, 0.5), reflectSummary("x", 0.5, 0.5, 0, cut)]);
    expect(loadMeasured(root, refOf(root, "sw-a-c", 2), 5, 2)).toBeNull();
    expect(incompleteReason(root, refOf(root, "sw-a-c", 2))).toBe(`was cut short: run r2: ${cut.aborted_reason}`);
  });

  test("a summary that says aborted with no reason is still no result", () => {
    const root = tmp();
    writeRun(root, "reflect", "sw-a-s", reflectSummary("sw-a-s", 0.5, 0.5, 0, { status: "aborted" }));
    expect(loadMeasured(root, refOf(root, "sw-a-s"), 5, null)).toBeNull();
    expect(incompleteReason(root, refOf(root, "sw-a-s"))).toBe("was cut short: no reason recorded");
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
    expect(unusableReason(root, state.screen.a)).toBe(`was cut short: ${cut.aborted_reason}`);
    expect(unusableReason(root, state.screen.base)).toBeNull();
    expect(unusableReason(root, undefined)).toBeNull();
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
    return { eval: name, corpus: "public", status: "complete", aborted_reason: null, git_commit: "5d1c0de", assets_sha256: "a".repeat(64), model: "m1", akm_version: "0.9.26", akm_bin: "akm-cli@0.9.26", akm_build: null, n_errored: 0, completion: { expected: 6, completed: 6, failed: 0, missing: 0 }, metrics: metricsOf(buildReport(trials), trials) };
  };

  test("are registered with the difference of the arms as the main metric and the akm arm's errors and the control's calls as harm", () => {
    const want: MetricSpec[] = [{ path: "delta.value", dir: "up", role: "main" }, { path: "akm.errored", dir: "down", role: "harm" }, { path: "engagement.control_calls", dir: "down", role: "harm" }];
    expect(EVAL_METRICS["agent-ab"]).toEqual(want);
    expect(EVAL_METRICS["terminal-bench"]).toEqual(want);
    expect(EVALS["agent-ab"].completeness.errors).toEqual(["n_errored", "completion.failed"]);
  });

  for (const name of ["agent-ab", "terminal-bench"]) {
    test(`${name}: every metric path is a number in a summary the runner writes, and has a spread in a repeat summary`, () => {
      const s = summaryOf([1, 1, 0], name);
      const m: Measured = { scope: "", n: 1, model: null, akm_build: null, akm_version: null, n_errored: null, calls: null, seconds: null, metrics: s.metrics, repeated: false, failed: null, runs: [] };
      for (const spec of EVAL_METRICS[name]) expect(metricSpread(m, spec.path), spec.path).not.toBeNull();
      const rep: Measured = { ...m, n: 2, metrics: spreadOf([s.metrics, summaryOf([0, 1, 0], name).metrics]), repeated: true };
      for (const spec of EVAL_METRICS[name]) expect(metricSpread(rep, spec.path), spec.path).not.toBeNull();
    });
  }

  const measured = (akm: number[], controlCalls = false, over: Partial<Measured> = {}): Measured => ({ scope: "", n: 3, model: "m1", akm_build: null, akm_version: "0.9.26", n_errored: 0, failed: 0, calls: null, seconds: null, repeated: true, metrics: spreadOf([1, 2, 3].map(() => summaryOf(akm, "agent-ab", controlCalls).metrics)), runs: [1, 2, 3].map((i) => ({ name: `r${i}`, identity: identityOf(summaryOf(akm, "agent-ab", controlCalls)) })), ...over });
  const verdictHarbor = (b: Measured, c: Measured) => verdictOf(compareAll("agent-ab", b, c), b, c, ["config"], "agent-ab");

  test("a better difference between the arms is better, unless the control called akm, which makes it mixed", () => {
    const [base, better, called] = [measured([0, 0, 0]), measured([1, 1, 1]), measured([1, 1, 1], true)];
    expect(verdictHarbor(base, better)).toBe("better");
    expect(compareAll("agent-ab", base, called).map((c) => [c.path, c.signal])).toEqual([["delta.value", "better"], ["akm.errored", "same"], ["engagement.control_calls", "worse"]]);
    expect(verdictHarbor(base, called)).toBe("mixed");
  });

  test("a Harbor summary has no akm config or engine to record, and is not exploratory for it", () => {
    const [base, better] = [measured([0, 0, 0]), measured([1, 1, 1])];
    expect(judge("agent-ab", compareAll("agent-ab", base, better), base, better).exploratory).toEqual([]);
    // an eval that does record a config is exploratory without one
    expect(judge("reflect", compareAll("agent-ab", base, better), base, better, ["build"]).exploratory).toEqual(["the akm config is not recorded in the baseline and the config", "the engine settings (temperature, thinking, endpoint host, time limit) is not recorded in the baseline and the config"]);
  });

  test("a config with more failed tasks than its baseline can never be better, however much its pass rate gained", () => {
    const [base, better] = [measured([0, 0, 0]), measured([1, 1, 1], false, { failed: 2 })];
    expect(compareAll("agent-ab", base, better).find((c) => c.path === "delta.value")?.signal).toBe("better");
    expect(moreErrors("agent-ab", base, better)).toEqual(["more failed tasks (2 vs 0)"]);
    expect(verdictHarbor(base, better)).toBe("incomplete");
    expect(verdictHarbor(base, measured([1, 1, 1], false, { failed: 0 }))).toBe("better");
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
  return { ...IDENTIFIED, eval: "nightly", corpus: "public", label, model: "m1", akm_version: "0.9.30", akm_bin: "akm", akm_build: "b1", n_errored: 0, metrics: { items: { n: oks.length, ok, rate: ok / oks.length }, harm: { items: 0, outside_changed: 0, lessons_accepted: 0 }, calls: { failures: 0 } }, ...over };
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
  test("pools all the repeats of both sides by case: the cases whose mean went up or down, the sign test and the intervals", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS);
    const row = buildDecision(root, m, state, 0).rows[0];
    const p = row.paired!;
    // c01-c08 are right in every repeat of both sides; the other 12 cases are right in more of the config's repeats than of the baseline's
    expect(p).toMatchObject({ repeats: { baseline: 3, config: 3 }, view: "", n_paired: 20, better: 12, worse: 0, agree: 8, p: 0.000488 });
    expect(p).not.toHaveProperty("runs");
    const rate = p.ci.find((x) => x.path === "items.rate")!;
    expect(rate).toMatchObject({ role: "main", dir: "up", delta: 0.2333, signal: "better" });
    expect(rate.ci![0]).toBeGreaterThan(0);
    expect(rate.ci![1]).toBeLessThanOrEqual(0.5);
    expect(p.ci.find((x) => x.path === "harm.items")).toMatchObject({ role: "harm", delta: 0, signal: "same" });
  });

  test("keeps the min-max verdict, and says in the note that the paired interval excludes 0", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS);
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row.verdict).toBe("no difference"); // the ranges 0.4-0.8 and 0.65-1.0 overlap
    expect(row.note).toMatch(/^paired says different: items\.rate better \+0\.233 \(\+0\.\d+ to \+0\.\d+\)$/);
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
    expect(md).toContain("12 better, 0 worse, 8 agree, p < 0.001<br>items.rate +0.233 (+");
    expect(md).toContain("harm.items 0 (0 to 0)<br>3 → 3 repeats pooled");
    expect(md).toContain("The paired column is scripts/compare on all the repeats");
    expect(md).toContain("paired says different");
  });

  test("with one side short of repeats, all the repeats it has are pooled", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS.slice(0, 2));
    const p = buildDecision(root, m, state, 0).rows[0].paired!;
    expect([p.repeats, p.better]).toEqual([{ baseline: 3, config: 2 }, 9]);
  });

  test("the repeats of two releases are compared, because the row's treatment is the build", () => {
    const m = nightlyMatrix(["--akm", "bun ~/akm-pr/src/cli.ts"]);
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS, { akm_build: "b2", akm_version: "0.10.0" });
    const d = buildDecision(root, m, state, 0);
    const row = d.rows[0];
    expect(row).toMatchObject({ treatment: ["build"] });
    expect(row.paired).toMatchObject({ n_paired: 20, better: 12, worse: 0 });
    expect(row.note).not.toContain("no paired comparison");
    expect(renderMarkdown(d)).toContain("| paired |");
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
      writeRepeat(root, "agent-ab", label, v.map((x) => ({ eval: "agent-ab", corpus: "public", status: "complete", git_commit: "5d1c0de", assets_sha256: "a".repeat(64), model: "m1", akm_version: "0.9.26", akm_build: null, n_errored: 0, completion: { expected: 9, completed: 9, failed: 0, missing: 0 }, metrics: metrics(x) })));
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

// ---- a job that did not succeed is no result (F01) ---------------------------------------------------------------------------

describe("a job that did not succeed is no result", () => {
  const setup = (exitCode: number, over: object = {}, baseExit = 0) => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }], prefix: "sw" });
    const state = emptyState(m);
    for (const [n, defects, code, extra] of [["base", 0.8, baseExit, {}], ["a", 0.95, exitCode, over]] as const) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, defects, 0.9, 0, extra));
      state.screen[n] = { ...record("screen", n, "reflect", label, root, "run"), exit_code: code, log: `logs/${label}.log` };
    }
    return { root, m, state };
  };
  const exited = "exited 1, so what it wrote is kept and not used";

  test("a run that exited 1 with a complete-looking summary is not used, though its artifacts are there", () => {
    const { root, state } = setup(1);
    expect(unusableReason(root, state.screen.a)).toBe(exited);
    expect(measuredOf(root, state.screen.a)).toEqual([]);
    expect(state.screen.a.results).toHaveLength(1); // retained: the record still points at the summary
    expect(existsSync(join(root, state.screen.a.results[0].file))).toBe(true);
    expect(unusableReason(root, setup(0).state.screen.a)).toBeNull();
  });

  test("it is not selected for confirmation, however far its numbers moved", () => {
    const ok = setup(0);
    expect(selectForConfirm(ok.root, ok.m, ok.state, { minDelta: 0 }).selected.map((s) => s.config.name)).toEqual(["a"]);
    const bad = setup(1);
    const { selected, skipped } = selectForConfirm(bad.root, bad.m, bad.state, { minDelta: 0 });
    expect(selected).toEqual([]);
    expect(skipped.map((s) => [s.config.name, s.reason])).toEqual([["a", `no screen result, the run ${exited}`]]);
    expect(confirmJobs(bad.m, selected)).toEqual([]);
  });

  test("a baseline that exited 1 leaves its configs with no baseline to be compared with", () => {
    const { root, m, state } = setup(0, {}, 1);
    expect(selectForConfirm(root, m, state, { minDelta: 0 }).skipped.map((s) => [s.config.name, s.reason])).toEqual([["a", `no baseline screen result, the baseline run ${exited}`]]);
    expect(buildDecision(root, m, state, 0).rows.map((r) => [r.config, r.verdict, r.note])).toEqual([["a", "no result", `the baseline run ${exited}`]]);
  });

  test("it reaches no verdict: the decision row is no result and points at the log", () => {
    const { root, m, state } = setup(1);
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row).toMatchObject({ config: "a", verdict: "no result", metrics: [], note: `the run ${exited}, see logs/sw-a-s.log` });
    expect(renderMarkdown(buildDecision(root, m, state, 0))).not.toContain("**better**");
  });

  test("two runs that both exited 1 and wrote summaries give two rows without a verdict", () => {
    const { root, m, state } = setup(1, {}, 1);
    const d = buildDecision(root, m, state, 0);
    expect(d.rows.map((r) => r.verdict)).toEqual(["no result"]);
    expect(selectForConfirm(root, m, state, { minDelta: 0 }).selected).toEqual([]);
  });

  test("a confirm that exited 1 falls back to the screen, and the note says why", () => {
    const m = oneConfig(["--strategy", "quick"]);
    const { root, state } = reflectSweep(m, {});
    for (const n of ["base", "pr"]) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, n === "pr" ? 0.9 : 0.8, 0.9));
      state.screen[n] = record("screen", n, "reflect", label, root, "run");
    }
    state.confirm.pr = { ...state.confirm.pr, exit_code: 1 };
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row).toMatchObject({ stage: "screen", verdict: "screen only" });
    expect(row.note).toContain("the confirm run exited 1, so what it wrote is kept and not used");
  });

  test("a baseline whose confirm exited 1 has no noise floor", () => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, BASE_RUNS, CFG_RUNS);
    expect(noiseFloors(root, m, state).floors).toHaveLength(1);
    state.confirm.base = { ...state.confirm.base, exit_code: 1 };
    expect(noiseFloors(root, m, state)).toEqual({ floors: [], notes: [] });
  });

  test("a summary is a result only when it says status complete and nothing is missing from it", () => {
    const root = tmp();
    const refOf = (label: string) => findResults(root, { label, repeat: null, args: [], row: { name: "x", eval: "reflect", args: [] } }, 0)[0];
    const cases: [string, object, string | null][] = [
      ["ok", {}, null],
      ["nostatus", { status: undefined }, "is not complete: the summary records no status, so the run is not known to have finished"],
      ["running", { status: "running" }, 'is not complete: the summary\'s status is "running", not "complete"'],
      ["missing", { completion: { expected: 9, completed: 7, failed: 0, missing: 2 } }, "is not complete: 2 of 9 expected results are missing"],
      ["none-missing", { completion: { expected: 9, completed: 8, failed: 1, missing: 0 } }, null],
    ];
    for (const [label, over, why] of cases) {
      writeRun(root, "reflect", label, reflectSummary(label, 0.5, 0.5, 0, over));
      expect(incompleteReason(root, refOf(label)), label).toBe(why);
      expect(loadMeasured(root, refOf(label), 5, null) === null, label).toBe(why !== null);
    }
  });

  test("a repeat is no result when any of its runs does not say it finished, or when the repeat summary lists fewer runs than it ran", () => {
    const root = tmp();
    const refOf = (label: string, repeat: number) => findResults(root, { label, repeat, args: [], row: { name: "x", eval: "reflect", args: [] } }, 0)[0];
    writeRepeat(root, "reflect", "sw-a-c", [reflectSummary("x", 0.5, 0.5), reflectSummary("x", 0.5, 0.5, 0, { status: undefined }), reflectSummary("x", 0.5, 0.5)]);
    expect(incompleteReason(root, refOf("sw-a-c", 3))).toBe("is not complete: run r2: the summary records no status, so the run is not known to have finished");
    writeRepeat(root, "reflect", "sw-b-c", [reflectSummary("x", 0.5, 0.5), reflectSummary("x", 0.5, 0.5, 0, { completion: { expected: 4, completed: 3, failed: 0, missing: 1 } })]);
    expect(incompleteReason(root, refOf("sw-b-c", 2))).toBe("is not complete: run r2: 1 of 4 expected result is missing");
    const file = join(root, refOf("sw-b-c", 2).file);
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), repeat: 3 }));
    expect(incompleteReason(root, refOf("sw-b-c", 2))).toBe("is not complete: its repeat summary lists 2 of 3 runs");
  });
});

// ---- the identity of every run, and what is missing (F02) -------------------------------------------------------------------------

describe("the identity of every run behind a result", () => {
  const verdictAndNote = (m: Matrix, cfg: object | object[], base: object | object[] = {}) => {
    const { root, state } = reflectSweep(m, cfg, base);
    const row = buildDecision(root, m, state, 0).rows[0];
    return { verdict: row.verdict, note: row.note, exploratory: row.exploratory };
  };
  const quick = () => oneConfig(["--strategy", "quick"]);
  const cfg2 = (over: object) => [{}, over, {}];

  test("a repeat set with inputs A and inputs B is not represented as inputs A", () => {
    const { verdict, note } = verdictAndNote(quick(), cfg2({ assets_sha256: "b".repeat(64) }));
    expect(verdict).toBe("not comparable");
    expect(note).toContain(`the cases (assets_sha256) differs: ${"a".repeat(12)} in the baseline and the config 2026-10-09-sw-pr-c-r1 and`);
    expect(note).toContain(`${"b".repeat(12)} in the config 2026-10-09-sw-pr-c-r2`);
  });

  test("the baseline's third repeat is checked as much as its first", () => {
    const { verdict, note } = verdictAndNote(quick(), {}, [{}, {}, { assets_sha256: "b".repeat(64) }]);
    expect(verdict).toBe("not comparable");
    expect(note).toContain("the cases (assets_sha256) differs");
  });

  test("two repeats with another engine and another commit are not repeats of one configuration", () => {
    const { verdict, note } = verdictAndNote(quick(), cfg2({ engine: { ...IDENTIFIED.engine, temperature: 0.7 }, git_commit: "9999999" }));
    expect(verdict).toBe("not comparable");
    expect(note).toContain("the engine settings (temperature, thinking, endpoint host, time limit) differs");
    expect(note).toContain("temperature 0.7");
    expect(note).toContain("the eval's code differs: commit 5d1c0de in");
  });

  test("a config row cannot hide a change of the engine, the akm config or the model behind its treatment", () => {
    const build = oneConfig(["--akm", "bun ~/akm-pr/src/cli.ts"]);
    expect(verdictAndNote(build, { akm_build: "b2", engine: { ...IDENTIFIED.engine, timeoutMs: 1 } }).verdict).toBe("not comparable");
    expect(verdictAndNote(build, { akm_build: "b2", config: { ...IDENTIFIED.config, improve: { strategies: {} } } }).note).toContain("the akm config differs");
    expect(verdictAndNote(build, { akm_build: "b2", akm_version: "0.10.0" }).verdict).toBe("better");
    // the same change is the treatment when the row says so
    expect(verdictAndNote(oneConfig(["--akm", "x"], { treatment: ["model"] }), { akm_build: "b2", model: "m2", engine: { ...IDENTIFIED.engine, model: "m2" } }).verdict).toBe("better");
    expect(verdictAndNote(oneConfig([], { treatment: "model" }), { model: "m2" }).verdict).toBe("better");
  });

  test("two edits of one akm commit are two builds: not comparable inside a repeat set and across the sides, unless the build is the treatment", () => {
    const [A, B] = ["a".repeat(64), "b".repeat(64)];
    const edited = (fingerprint: string | null) => ({ akm_build: "v0.9.26-1-gabc123-dirty", akm_build_fingerprint: fingerprint });
    // the runs of the config were made from two edits of the commit
    const inside = verdictAndNote(quick(), [edited(A), edited(B), edited(A)], edited(A));
    expect(inside.verdict).toBe("not comparable");
    expect(inside.note).toContain("the uncommitted changes of the akm build (akm_build_fingerprint) differs");
    expect(inside.note).toContain(`${A.slice(0, 12)} in the baseline and the config 2026-10-09-sw-pr-c-r1`);
    expect(inside.note).toContain(`${B.slice(0, 12)} in the config 2026-10-09-sw-pr-c-r2`);
    // the baseline and the config were made from two edits, or from an edit and from the clean commit
    expect(verdictAndNote(quick(), edited(B), edited(A)).verdict).toBe("not comparable");
    expect(verdictAndNote(quick(), edited(A), edited(null)).verdict).toBe("not comparable");
    expect(verdictAndNote(quick(), edited(null), edited(A)).note).toContain(`the uncommitted changes of the akm build (akm_build_fingerprint) differs: ${A.slice(0, 12)} in the baseline, none in the config`);
    // a clean build has none on both sides, and the same edits have the same fingerprint
    expect(verdictAndNote(quick(), edited(null), edited(null)).verdict).toBe("better");
    expect(verdictAndNote(quick(), edited(A), edited(A)).verdict).toBe("better");
    // a run of a summary written before the key existed is a clean build
    expect(verdictAndNote(quick(), { akm_build: "v0.9.26-1-gabc123" }, { akm_build: "v0.9.26-1-gabc123", akm_build_fingerprint: null }).verdict).toBe("better");
    // the build is the treatment of a row that names another akm: the sides may differ, and the repeats of a side still may not
    const build = oneConfig(["--akm", "bun ~/akm-pr/src/cli.ts"]);
    expect(verdictAndNote(build, edited(B), edited(A)).verdict).toBe("better");
    expect(verdictAndNote(build, edited(A), edited(null)).verdict).toBe("better");
    expect(verdictAndNote(build, [edited(A), edited(B), edited(A)], edited(null)).verdict).toBe("not comparable");
  });

  test("a hash or digest that is missing is exploratory, never a fully comparable decision", () => {
    const sameMissing = verdictAndNote(quick(), { assets_sha256: undefined }, { assets_sha256: undefined });
    expect(sameMissing.verdict).toBe("exploratory");
    expect(sameMissing.note).toContain("exploratory, not a conclusion: the cases (assets_sha256) is not recorded in the baseline and the config (the metrics read: better)");
    expect(verdictAndNote(quick(), { assets_sha256: undefined }).exploratory).toEqual(["the cases (assets_sha256) is not recorded in the config"]);
    expect(verdictAndNote(quick(), {}, { assets_sha256: undefined }).exploratory).toEqual(["the cases (assets_sha256) is not recorded in the baseline"]);
    // one run of three that lacks it is enough
    expect(verdictAndNote(quick(), cfg2({ engine: undefined })).exploratory).toEqual(["the engine settings (temperature, thinking, endpoint host, time limit) is not recorded in the config 2026-10-09-sw-pr-c-r2"]);
    expect(verdictAndNote(quick(), {}).verdict).toBe("better");
  });

  test("the eval's code is identified by a clean commit or a digest, and a dirty or missing commit is exploratory", () => {
    const dirty = { git_commit: "5d1c0de-dirty" };
    expect(verdictAndNote(quick(), dirty, dirty).exploratory[0]).toContain("the eval's code is not identified in the baseline and the config");
    expect(verdictAndNote(quick(), { git_commit: undefined }, { git_commit: undefined }).verdict).toBe("exploratory");
    const digest = { git_commit: "5d1c0de-dirty", harness_sha256: "d".repeat(64) };
    expect(verdictAndNote(quick(), digest, digest)).toMatchObject({ verdict: "better", exploratory: [] });
    expect(verdictAndNote(quick(), digest, { ...digest, harness_sha256: "e".repeat(64) }).verdict).toBe("not comparable");
    expect(verdictAndNote(quick(), { git_commit: "9999999" }).verdict).toBe("not comparable");
  });

  test("the harness is a treatment when the row says so", () => {
    expect(verdictAndNote(oneConfig([], { treatment: "harness" }), { git_commit: "9999999" }).verdict).toBe("better");
  });

  test("an exploratory screen is still a screen, and its candidates are still selected", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }], prefix: "sw" });
    const state = emptyState(m);
    for (const [n, d] of [["base", 0.8], ["a", 0.9]] as const) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, d, 0.9, 0, { assets_sha256: undefined }));
      state.screen[n] = record("screen", n, "reflect", label, root, "run");
    }
    expect(selectForConfirm(root, m, state, { minDelta: 0 }).selected.map((s) => s.config.name)).toEqual(["a"]);
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ verdict: "screen only", exploratory: ["the cases (assets_sha256) is not recorded in the baseline and the config"] });
  });

  test("a screen of another model or other cases than its baseline's is not selected for confirmation", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "reflect" }, configs: [{ name: "a", eval: "reflect" }], prefix: "sw" });
    const state = emptyState(m);
    for (const [n, d, extra] of [["base", 0.8, {}], ["a", 0.9, { model: "m2" }]] as const) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "reflect", label, reflectSummary(label, d, 0.9, 0, extra));
      state.screen[n] = record("screen", n, "reflect", label, root, "run");
    }
    expect(selectForConfirm(root, m, state, { minDelta: 0 }).skipped.map((s) => [s.config.name, s.reason])).toEqual([["a", "screen not comparable: the model differs: m1 in the baseline, m2 in the config"]]);
  });
});

// ---- the registry: main metrics, harm and a completeness policy (F09) -----------------------------------------------------------

describe("what the matrix judges each eval on", () => {
  test("every eval declares its main metrics, its harm metrics and a completeness policy", () => {
    for (const [name, e] of Object.entries(EVALS)) {
      expect(e.main.length, `${name} main`).toBeGreaterThan(0);
      expect(e.main.every((x) => x.role === "main"), name).toBe(true);
      expect(e.harm.every((x) => x.role === "harm"), name).toBe(true);
      expect(e.completeness.errors, name).toContain("n_errored");
      expect(EVAL_METRICS[name].map((x) => x.path)).toEqual([...e.main, ...e.harm].map((x) => x.path));
    }
  });

  test("distill scores lesson updates as a main metric, and judge-gate keeps harmful and churn revisions apart", () => {
    expect(EVALS.distill.main.map((x) => x.path)).toEqual(["good_lessons.rate", "lesson_updates.rate"]);
    expect(EVALS["judge-gate"].harm.map((x) => [x.path, x.dir])).toEqual([["bad_harmful.rate", "down"], ["bad_churn.rate", "down"]]);
    expect(EVAL_METRICS["judge-gate"].map((x) => x.path)).not.toContain("bad.rate");
  });

  test("an update-only improvement is selected for confirmation", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "distill" }, configs: [{ name: "a", eval: "distill" }, { name: "same", eval: "distill" }], prefix: "sw" });
    const state = emptyState(m);
    const distill = (label: string, updates: number) => ({ ...fixture("distill"), ...IDENTIFIED, n_run: 30, n_scored: 30, n_errored: 0, label, model: "m1", akm_version: "0.9.30", metrics: { ...fixture("distill").metrics, lesson_updates: { n: 8, right: updates * 8, rate: updates, checks: {} } } });
    for (const [n, updates] of [["base", 0.25], ["a", 0.75], ["same", 0.25]] as const) {
      const label = labelOf("sw", n, "screen");
      writeRun(root, "distill", label, distill(label, updates));
      state.screen[n] = record("screen", n, "distill", label, root, "run");
    }
    const { selected, skipped } = selectForConfirm(root, m, state, { minDelta: 0 });
    expect(skipped.map((s) => [s.config.name, s.reason])).toEqual([["same", "screen result matches the baseline"]]);
    expect(selected.map((s) => [s.config.name, s.reason])).toEqual([["a", "screen differs: lesson_updates.rate"]]);
    expect(skipped.map((s) => s.config.name)).toEqual(["same"]);
  });

  /** A judge-gate sweep: the baseline's three repeats and the config's, each with the rates the arguments give. */
  const judgeSweep = (base: { harmful: number; churn: number; precision: number }, cfg: { harmful: number; churn: number; precision: number }) => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "judge-gate" }, configs: [{ name: "a", eval: "judge-gate", args: ["--strategy", "x"] }], prefix: "sw" });
    const state = emptyState(m);
    const summary = (label: string, v: { harmful: number; churn: number; precision: number }) => ({
      ...fixture("judge-gate"),
      ...IDENTIFIED,
      label,
      model: "m1",
      akm_version: "0.9.30",
      metrics: {
        good: { n: 10, passed: 8, rate: 0.8 },
        bad: { n: 20, passed: 4, rate: (v.harmful + v.churn) / 2 },
        bad_harmful: { n: 10, passed: v.harmful * 10, rate: v.harmful },
        bad_churn: { n: 10, passed: v.churn * 10, rate: v.churn },
        precision: { value: v.precision, passed_good: 8, passed: 12 },
      },
    });
    for (const [name, v] of [["base", base], ["a", cfg]] as const) {
      const label = labelOf("sw", name, "confirm");
      writeRepeat(root, "judge-gate", label, [0, 0.01, 0.02].map((d) => summary(label, { harmful: v.harmful + d, churn: v.churn + d, precision: v.precision + d })));
      state.confirm[name] = record("confirm", name, "judge-gate", label, root, "repeat", 3);
    }
    return buildDecision(root, m, state, 0).rows[0];
  };

  test("a config that passes fewer churn revisions and more harmful ones is not better, whatever the pooled rate does", () => {
    // the pooled bad.rate falls (0.5 -> 0.35) and the main metric rises, as the old registry read it
    const row = judgeSweep({ harmful: 0.2, churn: 0.8, precision: 0.6 }, { harmful: 0.5, churn: 0.2, precision: 0.8 });
    expect(row.verdict).toBe("mixed");
    const signals = Object.fromEntries(row.metrics.map((m) => [m.path, m.signal]));
    expect(signals).toMatchObject({ "precision.value": "better", "bad_harmful.rate": "worse", "bad_churn.rate": "better" });
  });

  test("a config that is better on the main metric and harms nothing is better", () => {
    expect(judgeSweep({ harmful: 0.2, churn: 0.8, precision: 0.6 }, { harmful: 0.1, churn: 0.2, precision: 0.8 }).verdict).toBe("better");
  });

  test("replacing a bad lesson with an error raised good_lessons.rate and the verdict is not better", () => {
    const root = tmp();
    const m = parse({ baseline: { name: "base", eval: "distill" }, configs: [{ name: "a", eval: "distill", args: ["--strategy", "x"] }], prefix: "sw" });
    const state = emptyState(m);
    // two lessons, one good and one bad: 0.5. The bad one becomes an error: one scored lesson, and it is good: 1.
    for (const [name, rate, errored] of [["base", 0.5, 0], ["a", 1, 1]] as const) {
      const label = labelOf("sw", name, "confirm");
      const run = { ...fixture("distill"), ...IDENTIFIED, n_run: 30, n_scored: 30, label, model: "m1", akm_version: "0.9.30", n_errored: errored, metrics: { ...fixture("distill").metrics, good_lessons: { n: 2 - errored, good: 1, rate }, lesson_updates: { n: 0, right: 0, rate: null, checks: {} } } };
      writeRepeat(root, "distill", label, [run, run, run]);
      state.confirm[name] = record("confirm", name, "distill", label, root, "repeat", 3);
    }
    const row = buildDecision(root, m, state, 0).rows[0];
    expect(row.metrics.find((x) => x.path === "good_lessons.rate")?.signal).toBe("better");
    expect(row.verdict).toBe("incomplete");
    expect(row.verdict).not.toBe("better");
    expect(row.note).toContain("more errored cases (1 vs 0)");
    expect(row.n_errored).toEqual({ baseline: 0, config: 1 });
  });

  test("the same gain with no more errors is better, and fewer errors do not stand in the way", () => {
    const { root, state } = reflectSweep(oneConfig(["--strategy", "quick"]), {}, {}, { base: 2, pr: 0 });
    expect(buildDecision(root, oneConfig(["--strategy", "quick"]), state, 0).rows[0].verdict).toBe("better");
    const more = reflectSweep(oneConfig(["--strategy", "quick"]), {}, {}, { base: 0, pr: 1 });
    expect(buildDecision(more.root, oneConfig(["--strategy", "quick"]), more.state, 0).rows[0].verdict).toBe("incomplete");
  });

  test("a worse result stays worse when it also errored more", () => {
    const m = oneConfig(["--strategy", "quick"]);
    const { root, state } = reflectSweep(m, {}, {}, { base: 0, pr: 3 });
    const label = labelOf("sw", "pr", "confirm");
    writeRepeat(root, "reflect", `${label}-bad`, [reflectSummary("x", 0.5, 0.9, 0, { n_errored: 3 }), reflectSummary("x", 0.5, 0.9, 0, { n_errored: 3 }), reflectSummary("x", 0.5, 0.9, 0, { n_errored: 3 })]);
    state.confirm.pr = { ...record("confirm", "pr", "reflect", `${label}-bad`, root, "repeat", 3), label: `${label}-bad` };
    expect(buildDecision(root, m, state, 0).rows[0].verdict).toBe("worse");
  });
});

// ---- the paired comparison does not depend on the order of the repeats (F14) ----------------------------------------------------

describe("the paired comparison pools the repeats, so their order changes nothing", () => {
  const permutations = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
  const output = (base: boolean[][], cfg: boolean[][]) => {
    const m = nightlyMatrix();
    const { root, state } = nightlySweep(m, base, cfg);
    return JSON.stringify(buildDecision(root, m, state, 0, new Date("2026-10-11T00:00:00Z")).rows);
  };

  test("every order of the baseline's repeats and of the config's gives the identical decision rows", () => {
    const reference = output(BASE_RUNS, CFG_RUNS);
    for (const base of permutations(BASE_RUNS)) expect(output(base, CFG_RUNS)).toBe(reference);
    for (const cfg of permutations(CFG_RUNS)) expect(output(BASE_RUNS, cfg)).toBe(reference);
    const row = JSON.parse(reference)[0];
    expect(row.paired.ci.filter((x: { signal: string }) => x.signal === "better" || x.signal === "worse").map((x: { path: string }) => x.path)).toEqual(["items.rate"]);
    expect(row.note).toContain("paired says different: items.rate better");
  });

  test("it pools the repeats the same way when the repeats of the two sides are of different numbers", () => {
    const reference = output(BASE_RUNS, CFG_RUNS.slice(0, 2));
    expect(output([BASE_RUNS[2], BASE_RUNS[0], BASE_RUNS[1]], [CFG_RUNS[1], CFG_RUNS[0]])).toBe(reference);
  });

  test("the highlighted metrics come from the pooled aggregate: a pair of repeats that differs by chance is not one", () => {
    // the repeats of the config are the baseline's, in another order: nothing changed, so nothing is highlighted
    for (const cfg of permutations(BASE_RUNS)) {
      const m = nightlyMatrix();
      const { root, state } = nightlySweep(m, BASE_RUNS, cfg);
      const row = buildDecision(root, m, state, 0).rows[0];
      expect(row.paired).toMatchObject({ better: 0, worse: 0, agree: 20 });
      expect(row.note).toBe("");
    }
  });
});

// ---- the runner as a process: a failed job (F01) and a stage that resumes (F07) -------------------------------------------------------

const REPO = resolve(import.meta.dir, "..", "..", "..");

/** A fake reflect eval: it writes a summary the way an eval does, from the plan in FAKE_PLAN, logs its label, and exits as the plan says. */
const FAKE_EVAL = `#!/usr/bin/env bun
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const root = resolve(import.meta.dir, "..", "..");
const label = flag("--label");
appendFileSync(join(root, "invocations.log"), label + "\\n");
const plans = JSON.parse(process.env.FAKE_PLAN ?? "{}");
const key = Object.keys(plans).find((k) => label.includes(k));
const plan = { defects: 0.8, ...(key ? plans[key] : {}) };
const base = JSON.parse(process.env.FAKE_SUMMARY);
const summary = (runLabel) => ({ ...base, label: runLabel, ...(plan.status ? { status: plan.status, aborted_reason: plan.status === "aborted" ? "the endpoint went down" : null } : {}), metrics: { defects: { n: 32, correct: 0, rate: plan.defects }, controls: { n: 18, correct: 0, rate: 0.9 }, proposals: { n: 39, touched_body: 0 } } });
const results = join(root, "evals", "reflect", "results");
const repeat = flag("--repeat");
if (repeat === undefined) {
  mkdirSync(join(results, "2026-10-11-" + label), { recursive: true });
  writeFileSync(join(results, "2026-10-11-" + label, "summary.json"), JSON.stringify(summary(label)));
} else {
  const names = [];
  for (let i = 1; i <= Number(repeat); i++) {
    const name = "2026-10-11-" + label + "-r" + i;
    mkdirSync(join(results, name), { recursive: true });
    writeFileSync(join(results, name, "summary.json"), JSON.stringify(summary(label + "-r" + i)));
    names.push(name);
  }
  const spread = (v) => ({ min: v, max: v, mean: v });
  writeFileSync(join(results, "2026-10-11-" + label + "-repeat-summary.json"), JSON.stringify({ eval: "reflect", corpus: "public", label, repeat: names.length, model: base.model, akm_version: base.akm_version, akm_bin: base.akm_bin, akm_build: base.akm_build, runs: names, n_errored: spread(0), seconds: spread(1), metrics: { defects: { rate: spread(plan.defects) }, controls: { rate: spread(0.9) }, proposals: { touched_body: spread(0) } } }));
}
process.exit(plan.exit ?? 0);
`;

const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-C", cwd, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { stdout: "pipe", stderr: "pipe" });

/**
 * The runner and the code it imports, copied into a temp folder that is its repository root (the runner finds its root from where it is), with a
 * fake reflect eval at evals/reflect/run, a git repository around them, a matrix file and a config patch beside them.
 */
function runnerTree() {
  const root = tmp();
  for (const from of ["lib", "scripts/matrix/src", "scripts/compare/src"]) cpSync(join(REPO, from), join(root, from), { recursive: true, filter: (src) => !/node_modules|fixtures|\.test\.ts$/.test(src) });
  mkdirSync(join(root, "evals", "reflect"), { recursive: true });
  writeFileSync(join(root, "evals", "reflect", "run"), FAKE_EVAL, { mode: 0o755 });
  writeFileSync(join(root, "matrix.json"), JSON.stringify({ prefix: "sw", model: "m1", repeats: 2, baseline: { name: "base", eval: "reflect" }, configs: [{ name: "cfg", eval: "reflect", args: ["--config-patch", "patch.json"] }] }));
  writeFileSync(join(root, "patch.json"), '{"improve":{"strategies":{}}}\n');
  git(root, "init", "-q");
  git(root, "add", "scripts", "lib", "evals");
  git(root, "commit", "-q", "-m", "tree");
  const summary = { ...fixture("reflect"), ...IDENTIFIED, model: "m1", akm_build: "b1", akm_bin: "akm", akm_version: "0.9.30" };
  // The environment the runner gets is spelled out: nothing of the caller's, and so not its AKM_BIN.
  const baseEnv: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? root, TMPDIR: process.env.TMPDIR ?? tmpdir(), AKM_BIN: "fake-akm", MODEL_NAME: "m1", MODEL_BASE_URL: "https://gateway-a.example.com/v1", MODEL_API_KEY: "key-one", FAKE_SUMMARY: JSON.stringify(summary) };
  const out = join(root, "matrix-results");
  return {
    root,
    out,
    state: (): State => JSON.parse(readFileSync(join(out, "state.json"), "utf8")),
    decision: (): { rows: { config: string; verdict: string; note: string }[] } => JSON.parse(readFileSync(join(out, "decision.json"), "utf8")),
    /** How many jobs the fake eval ran so far. */
    runs: (): number => (existsSync(join(root, "invocations.log")) ? readFileSync(join(root, "invocations.log"), "utf8").split("\n").filter(Boolean).length : 0),
    /** Runs the matrix command; `env` changes the environment (undefined removes a variable). */
    async stage(args: string[], env: Record<string, string | undefined> = {}): Promise<{ code: number; out: string }> {
      const merged: Record<string, string> = { ...baseEnv };
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete merged[k];
        else merged[k] = v;
      }
      const proc = Bun.spawn([process.execPath, join(root, "scripts", "matrix", "src", "run.ts"), join(root, "matrix.json"), ...args], { cwd: root, env: merged, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = [await new Response(proc.stdout).text(), await new Response(proc.stderr).text(), await proc.exited];
      return { code, out: stdout + stderr };
    },
  };
}
const planFor = (plan: Record<string, object>): Record<string, string> => ({ FAKE_PLAN: JSON.stringify(plan) });

describe("a stage as a process: a failed job (F01)", () => {
  test("a runner that writes partial diagnostics and then exits 1 fails the stage, keeps its artifacts and is left out of every conclusion", async () => {
    const t = runnerTree();
    // the config's numbers are far better than the baseline's: they would be selected, and read better, if they counted
    const r = await t.stage(["--stage", "screen"], planFor({ "sw-cfg-": { defects: 0.99, exit: 1 } }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("screen  cfg: exit 1");
    expect(r.out).toContain("the run exited 1, so what it wrote is kept and not used, see ");
    // the artifacts are kept: the record points at the summary, which is on disk
    const record = t.state().screen.cfg;
    expect(record.exit_code).toBe(1);
    expect(record.results).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(t.root, record.results[0].file), "utf8")).metrics.defects.rate).toBe(0.99);
    expect(existsSync(join(t.root, record.log))).toBe(true);
    // the baseline, which succeeded, is a result, and the config reaches no verdict
    expect(t.state().screen.base.exit_code).toBe(0);
    expect(t.decision().rows.map((x) => [x.config, x.verdict])).toEqual([["cfg", "no result"]]);
    expect(t.decision().rows[0].note).toContain("the run exited 1, so what it wrote is kept and not used");
    // the confirm stage does not select it
    const c = await t.stage(["--stage", "confirm", "--dry-run"]);
    expect(c.code).toBe(0);
    expect(c.out).toContain("skip     cfg: no screen result, the run exited 1, so what it wrote is kept and not used");
    expect(c.out).not.toContain("confirm  cfg");
    expect(c.out).not.toContain("sw-cfg-c");
    // a stage that runs again runs the failed job and not the one that succeeded
    const again = await t.stage(["--stage", "screen"]);
    expect(again.code).toBe(0);
    expect(t.runs()).toBe(3);
    expect(again.out).toContain("screen  base: already ran with the same inputs, skipped");
    expect(again.out).toContain("screen  cfg: running again, its last run exited 1");
    expect(t.decision().rows[0].verdict).toBe("screen only");
  });

  test("a run that wrote an aborted summary and exited 1 is the same, and says why it stopped", async () => {
    const t = runnerTree();
    const r = await t.stage(["--stage", "screen"], planFor({ "sw-cfg-": { defects: 0.99, exit: 1, status: "aborted" } }));
    expect(r.code).toBe(1);
    expect(t.decision().rows[0]).toMatchObject({ verdict: "no result" });
    expect(t.decision().rows[0].note).toContain("the run was cut short: the endpoint went down");
  });

  test("two children that exit 1 after writing summaries leave a stage that exits 1 and no scored row", async () => {
    const t = runnerTree();
    const r = await t.stage(["--stage", "screen"], planFor({ "sw-": { exit: 1 } }));
    expect(r.code).toBe(1);
    expect(t.decision().rows.map((x) => x.verdict)).toEqual(["no result"]);
    expect(t.decision().rows[0].note).toContain("the run exited 1, so what it wrote is kept and not used");
    const c = await t.stage(["--stage", "confirm", "--dry-run"]);
    expect(c.out).toContain("skip     cfg: no screen result, the run exited 1");
  });

  test("a child that exits 0 with a summary that does not say it is complete also fails the stage", async () => {
    const t = runnerTree();
    const r = await t.stage(["--stage", "screen"], planFor({ "sw-cfg-": { status: "running" } }));
    expect(r.code).toBe(1);
    expect(t.decision().rows[0].note).toContain('the run is not complete: the summary\'s status is "running", not "complete"');
  });

  test("a stage in which every job succeeded exits 0", async () => {
    const t = runnerTree();
    expect((await t.stage(["--stage", "screen"])).code).toBe(0);
    expect(t.runs()).toBe(2);
  });
});

describe("a stage as a process: what makes it resume or run again (F07)", () => {
  test("a byte-identical invocation resumes, and an edited patch, in place, runs the job that uses it again", async () => {
    const t = runnerTree();
    expect((await t.stage(["--stage", "screen"])).code).toBe(0);
    expect(t.runs()).toBe(2);
    const resumed = await t.stage(["--stage", "screen"]);
    expect(resumed.code).toBe(0);
    expect(t.runs()).toBe(2);
    expect(resumed.out).toContain("screen  base: already ran with the same inputs, skipped");
    expect(resumed.out).toContain("screen  cfg: already ran with the same inputs, skipped");
    writeFileSync(join(t.root, "patch.json"), '{"improve":{"strategies":{"x":{}}}}\n'); // the same path, other bytes
    const edited = await t.stage(["--stage", "screen"]);
    expect(t.runs()).toBe(3);
    expect(edited.out).toContain("screen  base: already ran with the same inputs, skipped");
    expect(edited.out).toContain("screen  cfg: running again, a file its arguments name (a config patch or a cases folder) changed since its last run");
    expect((await t.stage(["--stage", "screen"])).out).not.toContain("running again");
    expect(t.runs()).toBe(3);
  });

  test("another MODEL_BASE_URL runs every job again, and the same one resumes; a key is not part of it", async () => {
    const t = runnerTree();
    await t.stage(["--stage", "screen"]);
    const moved = await t.stage(["--stage", "screen"], { MODEL_BASE_URL: "https://gateway-b.example.com/v1" });
    expect(t.runs()).toBe(4);
    expect(moved.out).toContain("screen  base: running again, the model settings");
    expect(moved.out).toContain("screen  cfg: running again, the model settings");
    await t.stage(["--stage", "screen"], { MODEL_BASE_URL: "https://gateway-b.example.com/v1" });
    expect(t.runs()).toBe(4);
    // only the host counts, so the path does not, and neither does a key
    await t.stage(["--stage", "screen"], { MODEL_BASE_URL: "https://gateway-b.example.com/v2" });
    expect(t.runs()).toBe(4);
    await t.stage(["--stage", "screen"], { MODEL_BASE_URL: "https://gateway-b.example.com/v1", MODEL_API_KEY: "key-two" });
    expect(t.runs()).toBe(4);
    const state = readFileSync(join(t.out, "state.json"), "utf8");
    for (const secret of ["key-one", "key-two"]) expect(state).not.toContain(secret); // the exact values given, not any "key-" in a path of the checkout
  });

  test("another MODEL_NAME, JUDGE_* setting or .env runs the jobs again", async () => {
    const t = runnerTree();
    await t.stage(["--stage", "screen"]);
    await t.stage(["--stage", "screen"], { MODEL_NAME: "m2" });
    expect(t.runs()).toBe(4);
    await t.stage(["--stage", "screen"], { MODEL_NAME: "m2", JUDGE_BASE_URL: "https://judge.example.com/v1" });
    expect(t.runs()).toBe(6);
    await t.stage(["--stage", "screen"], { MODEL_NAME: "m2", JUDGE_BASE_URL: "https://judge.example.com/v1", JUDGE_MODEL: "j1" });
    expect(t.runs()).toBe(8);
    // a setting in .env counts when the caller's environment does not set it
    writeFileSync(join(t.root, ".env"), "export MODEL_NAME=m9 # the local one\nMODEL_BASE_URL='https://gateway-c.example.com/v1'\n");
    await t.stage(["--stage", "screen"], { MODEL_NAME: undefined, MODEL_BASE_URL: undefined, JUDGE_BASE_URL: undefined, JUDGE_MODEL: undefined });
    expect(t.runs()).toBe(10);
    await t.stage(["--stage", "screen"], { MODEL_NAME: undefined, MODEL_BASE_URL: undefined, JUDGE_BASE_URL: undefined, JUDGE_MODEL: undefined });
    expect(t.runs()).toBe(10);
  });

  test("another AKM_BIN, another commit of this repository's code or changes to it run the jobs again", async () => {
    const t = runnerTree();
    await t.stage(["--stage", "screen"]);
    const bin = await t.stage(["--stage", "screen"], { AKM_BIN: "fake-akm-2" });
    expect(t.runs()).toBe(4);
    expect(bin.out).toContain("running again, the akm (AKM_BIN or --akm, or the build it runs) changed");
    await t.stage(["--stage", "screen"], { AKM_BIN: "fake-akm-2" });
    expect(t.runs()).toBe(4);
    const lib = join(t.root, "scripts", "matrix", "src", "paired.ts");
    writeFileSync(lib, `${readFileSync(lib, "utf8")}// an uncommitted change\n`);
    const dirty = await t.stage(["--stage", "screen"], { AKM_BIN: "fake-akm-2" });
    expect(t.runs()).toBe(6);
    expect(dirty.out).toContain("running again, this repository's code changed since its last run");
    await t.stage(["--stage", "screen"], { AKM_BIN: "fake-akm-2" });
    expect(t.runs()).toBe(6); // the same uncommitted change resumes
    writeFileSync(lib, `${readFileSync(lib, "utf8")}// another\n`);
    await t.stage(["--stage", "screen"], { AKM_BIN: "fake-akm-2" });
    expect(t.runs()).toBe(8);
    git(t.root, "commit", "-q", "-a", "-m", "commit it");
    await t.stage(["--stage", "screen"], { AKM_BIN: "fake-akm-2" });
    expect(t.runs()).toBe(10);
  });

  test("a result file that is gone or cannot be read, a record from before there were fingerprints, and --force run the job again", async () => {
    const t = runnerTree();
    await t.stage(["--stage", "screen"]);
    rmSync(join(t.root, t.state().screen.cfg.results[0].file));
    const gone = await t.stage(["--stage", "screen"]);
    expect(t.runs()).toBe(3);
    expect(gone.out).toContain("screen  cfg: running again, its result file ");
    const file = join(t.root, t.state().screen.base.results[0].file);
    writeFileSync(file, "{ not json");
    await t.stage(["--stage", "screen"]);
    expect(t.runs()).toBe(4);
    const state = t.state();
    for (const rec of Object.values(state.screen)) {
      delete rec.fingerprint;
      delete rec.fingerprint_parts;
    }
    writeFileSync(join(t.out, "state.json"), JSON.stringify(state));
    const old = await t.stage(["--stage", "screen"]);
    expect(t.runs()).toBe(6);
    expect(old.out).toContain("running again, its last run did not record what it was made from");
    await t.stage(["--stage", "screen"]);
    expect(t.runs()).toBe(6);
    await t.stage(["--stage", "screen", "--force"]);
    expect(t.runs()).toBe(8);
  });

  test("the confirm stage resumes the same way, and a job of it that changed runs again", async () => {
    const t = runnerTree();
    await t.stage(["--stage", "screen"], planFor({ "sw-cfg-": { defects: 0.9 } }));
    const first = await t.stage(["--stage", "confirm"], planFor({ "sw-cfg-": { defects: 0.9 } }));
    expect(first.code).toBe(0);
    expect(t.runs()).toBe(4);
    await t.stage(["--stage", "confirm"], planFor({ "sw-cfg-": { defects: 0.9 } }));
    expect(t.runs()).toBe(4);
    writeFileSync(join(t.root, "patch.json"), '{"improve":{"strategies":{"y":{}}}}\n');
    await t.stage(["--stage", "confirm", "--only", "cfg"], planFor({ "sw-cfg-": { defects: 0.9 } }));
    expect(t.runs()).toBe(5);
  });
});

describe("the fingerprint of a job", () => {
  const job = (args: string[] = ["--config-patch", "PATCH", "--label", "x"], evalName = "reflect") => ({ args, row: { name: "r", eval: evalName, args: [] } });
  const setup = () => {
    const root = tmp();
    writeFileSync(join(root, "patch.json"), "{}");
    return { root, args: ["--config-patch", join(root, "patch.json"), "--label", "x"] };
  };
  const env = { AKM_BIN: "fake-akm", MODEL_NAME: "m1", MODEL_BASE_URL: "https://a.example.com/v1", MODEL_API_KEY: "key-one" };

  test("is the same for the same job, and changes with the bytes of a file an argument names", () => {
    const { root, args } = setup();
    const a = fingerprintOf(root, job(args), env);
    expect(fingerprintOf(root, job(args), env).sha256).toBe(a.sha256);
    writeFileSync(join(root, "patch.json"), '{"a":1}');
    const b = fingerprintOf(root, job(args), env);
    expect(b.sha256).not.toBe(a.sha256);
    expect(Object.keys(b.parts).filter((k) => b.parts[k] !== a.parts[k])).toEqual(["files"]);
  });

  test("covers the files of a --cases folder, in a relative path from the root, and a file that is missing", () => {
    const root = tmp();
    mkdirSync(join(root, "own"), { recursive: true });
    writeFileSync(join(root, "own", "cases.jsonl"), "{}\n");
    const args = ["--cases", "own", "--label", "x"];
    const a = fingerprintOf(root, job(args, "promotion"), env).sha256;
    writeFileSync(join(root, "own", "cases.jsonl"), '{"id":"b"}\n');
    const b = fingerprintOf(root, job(args, "promotion"), env).sha256;
    mkdirSync(join(root, "own", "library"));
    writeFileSync(join(root, "own", "library", "n.md"), "note");
    const c = fingerprintOf(root, job(args, "promotion"), env).sha256;
    expect(new Set([a, b, c]).size).toBe(3);
    expect(fingerprintOf(root, job(["--config-patch=nope.json"]), env).sha256).not.toBe(fingerprintOf(root, job([]), env).sha256);
  });

  test("covers the model settings and the akm, never a key", () => {
    const { root, args } = setup();
    const base = fingerprintOf(root, job(args), env).sha256;
    const of = (over: Record<string, string>) => fingerprintOf(root, job(args), { ...env, ...over }).sha256;
    expect(of({ MODEL_API_KEY: "key-two", JUDGE_API_KEY: "key-three" })).toBe(base);
    expect(of({ MODEL_BASE_URL: "https://a.example.com/v2" })).toBe(base);
    for (const over of [{ MODEL_NAME: "m2" }, { MODEL_BASE_URL: "https://b.example.com/v1" }, { JUDGE_MODEL: "j" }, { JUDGE_BASE_URL: "https://j.example.com/v1" }, { AKM_BIN: "fake-akm-2" }] as Record<string, string>[]) expect(of(over), JSON.stringify(over)).not.toBe(base);
    expect(JSON.stringify(fingerprintOf(root, job(args), env))).not.toContain("key-one");
  });

  test("the akm of a Harbor eval is the release it names, or the build of the checkout", () => {
    const { root } = setup();
    const release = (akm: string) => fingerprintOf(root, job(["--akm", akm], "agent-ab"), env).parts.akm;
    expect(release("akm-cli@0.9.26")).not.toBe(release("akm-cli@0.9.27"));
    expect(fingerprintOf(root, job(["--akm", "akm-cli@0.9.26"], "agent-ab"), { ...env, AKM_BIN: "other" }).parts.akm).toBe(release("akm-cli@0.9.26")); // AKM_BIN is not read by a Harbor eval
  });

  test("the akm of a checkout includes its uncommitted changes, for an AKM_BIN and for the folder a Harbor eval names", () => {
    const root = tmp();
    const akm = join(root, "akm");
    mkdirSync(akm);
    git(akm, "init", "-q");
    writeFileSync(join(akm, "cli.ts"), "one\n");
    git(akm, "add", "cli.ts");
    git(akm, "commit", "-q", "-m", "one");
    const local = () => fingerprintOf(root, job([]), { ...env, AKM_BIN: `bun ${join(akm, "cli.ts")}` }).parts.akm;
    const harbor = () => fingerprintOf(root, job(["--akm", akm], "agent-ab"), env).parts.akm;
    const clean = [local(), harbor()];
    writeFileSync(join(akm, "cli.ts"), "two\n");
    const edited = [local(), harbor()];
    writeFileSync(join(akm, "cli.ts"), "three\n");
    const other = [local(), harbor()];
    for (const i of [0, 1]) expect(new Set([clean[i], edited[i], other[i]]).size).toBe(3);
    writeFileSync(join(akm, "cli.ts"), "one\n");
    expect([local(), harbor()]).toEqual(clean);
  });

  test("the harness is the commit and the digest of the uncommitted changes, and a folder that is no checkout has its own", () => {
    const root = tmp();
    expect(fingerprintOf(root, job([]), env).parts.harness).toBe(fingerprintOf(root, job([]), env).parts.harness);
    git(root, "init", "-q");
    writeFileSync(join(root, "f.txt"), "one\n");
    git(root, "add", "f.txt");
    git(root, "commit", "-q", "-m", "one");
    const clean = fingerprintOf(root, job([]), env).parts.harness;
    writeFileSync(join(root, "f.txt"), "two\n");
    const dirty = fingerprintOf(root, job([]), env).parts.harness;
    writeFileSync(join(root, "f.txt"), "three\n");
    const other = fingerprintOf(root, job([]), env).parts.harness;
    expect(new Set([clean, dirty, other]).size).toBe(3);
    writeFileSync(join(root, "f.txt"), "one\n");
    expect(fingerprintOf(root, job([]), env).parts.harness).toBe(clean);
  });

  test("reads a .env the way lib/env.sh does", () => {
    const root = tmp();
    writeFileSync(join(root, ".env"), ['# comment', 'MODEL_NAME=small # the local one', 'export MODEL_BASE_URL="https://x.example.com/v1#frag"', "JUDGE_MODEL='j 1'", "  SPACED = value", "1BAD=no", "MODEL_NAME=second", "novalue"].join("\n"));
    expect(readDotEnv(join(root, ".env"))).toEqual({ MODEL_NAME: "small", MODEL_BASE_URL: "https://x.example.com/v1#frag", JUDGE_MODEL: "j 1", SPACED: " value" });
    expect(readDotEnv(join(root, "missing"))).toEqual({});
  });

  test("resumable says why a job runs again and skips only a complete, unchanged one", () => {
    const { root, args } = setup();
    const j = { label: "x", args };
    const fp = fingerprintOf(root, job(args), env);
    expect(resumable(root, undefined, j, fp)).toEqual({ skip: false, why: "" });
    const dir = join(root, "evals", "reflect", "results", "2026-10-11-x");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ ...IDENTIFIED, eval: "reflect", label: "x" }));
    const rec: RunRecord = { stage: "screen", name: "r", eval: "reflect", label: "x", args, repeat: null, started: "", wall_seconds: 1, exit_code: 0, log: "", results: [{ scope: "", kind: "run", file: "evals/reflect/results/2026-10-11-x/summary.json" }], fingerprint: fp.sha256, fingerprint_parts: fp.parts };
    expect(resumable(root, rec, j, fp)).toEqual({ skip: true, why: "" });
    expect(resumable(root, { ...rec, exit_code: 2 }, j, fp).why).toBe("its last run exited 2");
    expect(resumable(root, { ...rec, args: [...args, "--limit", "3"] }, j, fp).why).toBe("its arguments changed");
    expect(resumable(root, { ...rec, results: [] }, j, fp).why).toBe("its last run wrote no result");
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ ...IDENTIFIED, eval: "reflect", label: "x", status: "aborted", aborted_reason: "gave up" }));
    expect(resumable(root, rec, j, fp)).toMatchObject({ skip: false, why: "its last result is no result: the run was cut short: gave up" });
  });
});
