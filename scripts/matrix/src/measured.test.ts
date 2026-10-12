// The matrix judges every eval that declares a measurement. agent-ab, terminal-bench, bakeoff, longmemeval and skillret were on the manifest with no entry
// in EVALS, or no per-case reading in scripts/compare: for each of them these tests write the three repeats of a baseline that does well and of a config
// that does badly, from the cases of the eval's golden folder, and read the decision row.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fakeAkmScript as memoriesAkm, writePublicAssets } from "../../../benchmarks/longmemeval/src/fakes.ts";
import { fakeAkmScript as skillsAkm, writeAssets } from "../../../benchmarks/skillret/src/fakes.ts";
import { commandLine } from "../../../lib/akm/akm.ts";
import { measuredEvals } from "../../../lib/manifest.ts";
import { type EvalFixture, evalFixture, goldenOf, writeRepeats } from "../../compare/src/golden-runs.ts";
import { buildDecision, renderMarkdown } from "./decision.ts";
import { EVALS, type Matrix, type RunRecord, baselineFor, confirmJobs, emptyState, findResults, parseMatrix, resultsParents, runnerFolder, runnerPath, scopeKey, screenJobs } from "./lib.ts";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "matrix-measured-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const NEW = ["agent-ab", "terminal-bench", "bakeoff", "longmemeval", "skillret"] as const;
type Obj = Record<string, any>;
const FILE = "/work/sweeps/x/matrix.json";

const matrixOf = (name: string, baselineArgs: string[] = [], configArgs: string[] = []): Matrix =>
  parseMatrix({ prefix: "sw", baseline: { name: "base", eval: name, args: baselineArgs }, configs: [{ name: "pr", eval: name, args: configArgs }] }, FILE);

/** The confirm result of one side of a row, as the stage leaves it under `root`: three repeats of the fixture, and the run record that points at them. */
function side(root: string, f: EvalFixture, evalName: string, row: string, raw: (c: Obj) => Obj, options: Partial<Parameters<typeof writeRepeats>[0]> = {}): RunRecord {
  const parent = join(root, runnerFolder(evalName), evalName, "results");
  mkdirSync(parent, { recursive: true });
  const label = `sw-${row}-c`;
  writeRepeats({ measurement: f.measurement, cases: f.cases, raw, parent, label, harbor: f.harbor, ...options }, 3);
  const results = findResults(root, { label, repeat: 3, args: [], row: { name: row, eval: evalName, args: [] } }, 0);
  expect(results.map((r) => r.kind)).toEqual(["repeat"]);
  return { stage: "confirm", name: row, eval: evalName, label, args: [], repeat: 3, started: "", wall_seconds: 30, exit_code: 0, log: "", results };
}

describe("an eval that declares a measurement is judged by the matrix", () => {
  test("every one has an entry in EVALS, and a runner the matrix can start", () => {
    for (const name of measuredEvals()) {
      expect(Object.keys(EVALS), name).toContain(name);
      expect(EVALS[name]?.main.length, name).toBeGreaterThan(0);
      expect(runnerPath("/r", name), name).toBe(`/r/${name === "agent-ab" || name === "bakeoff" || ["consolidate", "distill", "extract", "judge-gate", "nightly", "promotion", "reflect", "retrieval"].includes(name) ? "evals" : "benchmarks"}/${name}/run`);
    }
    for (const name of NEW) expect(Object.keys(EVALS)).toContain(name);
  });
});

for (const name of NEW) {
  describe(`${name}`, () => {
    test("a config that does badly is worse than a baseline that does well, with its cases compared and its context shown", async () => {
      const f = await evalFixture(name);
      const root = tmp();
      const m = matrixOf(name);
      const state = emptyState(m);
      state.confirm.base = side(root, f, name, "base", f.good);
      state.confirm.pr = side(root, f, name, "pr", f.bad);
      const d = buildDecision(root, m, state, 0, new Date("2026-10-12T12:00:00Z"));
      const rows = d.rows;
      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0] as (typeof rows)[number];
      expect(row).toMatchObject({ eval: name, stage: "confirm", n: 3, verdict: "worse", exploratory: [], rescored: false });
      // every main metric of the eval that its summary has is judged, in the baseline's favour
      const mains = EVALS[name]?.main.map((spec) => spec.path) ?? [];
      const judged = row.metrics.filter((x) => x.role === "main" && x.baseline && x.config);
      expect(judged.length).toBeGreaterThan(0);
      for (const x of judged) {
        expect(mains, x.path).toContain(x.path);
        expect(x.signal, x.path).toBe("worse");
      }
      // the cases are compared one by one, with every repeat of both sides pooled
      expect(row.paired).toMatchObject({ repeats: { baseline: 3, config: 3 } });
      expect((row.paired?.worse ?? 0) + (row.paired?.better ?? 0)).toBeGreaterThan(0);
      expect(row.paired?.worse).toBeGreaterThan(0);
      expect(row.paired?.better).toBe(0);
      expect(row.paired?.ci.some((x) => x.signal === "worse")).toBe(true);
      // and which cases each side scored
      expect(row.coverage.baseline).toMatchObject({ errored: 0 });
      expect(row.cases).toEqual({ baseline_only: [], config_only: [] });
      // the metrics beside the judged ones are shown and not judged
      const context = EVALS[name]?.context ?? [];
      expect(row.context.map((x) => x.path)).toEqual(context);
      if (context.length > 0) expect(row.context.some((x) => x.baseline !== null)).toBe(true);
      const md = renderMarkdown(d);
      expect(md).toContain(`## ${name} vs base`);
      expect(md).toContain("**worse**");
      for (const path of context) if (row.context.find((x) => x.path === path)?.baseline) expect(md).toContain(path);
    });

    test("the other way round it is better", async () => {
      const f = await evalFixture(name);
      const root = tmp();
      const m = matrixOf(name);
      const state = emptyState(m);
      state.confirm.base = side(root, f, name, "base", f.bad);
      state.confirm.pr = side(root, f, name, "pr", f.good);
      const row = buildDecision(root, m, state, 0).rows[0] as ReturnType<typeof buildDecision>["rows"][number];
      expect(row).toMatchObject({ verdict: "better", exploratory: [] });
    });

    test("the same runs on both sides are no difference", async () => {
      const f = await evalFixture(name);
      const root = tmp();
      const m = matrixOf(name);
      const state = emptyState(m);
      state.confirm.base = side(root, f, name, "base", f.good);
      state.confirm.pr = side(root, f, name, "pr", f.good);
      expect((buildDecision(root, m, state, 0).rows[0] as { verdict: string }).verdict).toBe("no difference");
    });

    test("its results are found where the runner writes them, and its job runs the runner of its folder", async () => {
      const folder = runnerFolder(name);
      expect(folder).toBe(name === "agent-ab" || name === "bakeoff" ? "evals" : "benchmarks");
      expect(resultsParents("/r", name, [])).toEqual([`/r/${folder}/${name}/results`]);
      expect(resultsParents("/r", name, ["--corpus", "custom"])[0]).toBe(`/r/private/${name}/results`);
      const m = matrixOf(name);
      const [job] = screenJobs(m);
      expect(job?.args.at(-2)).toBe("--label");
    });
  });
}

describe("terminal-bench and agent-ab: the harm is judged", () => {
  for (const name of ["agent-ab", "terminal-bench"] as const) {
    test(`${name}: control trials that call akm make a config worse, though the akm arm does as well`, async () => {
      const f = await evalFixture(name);
      const root = tmp();
      const m = matrixOf(name);
      const state = emptyState(m);
      state.confirm.base = side(root, f, name, "base", f.good);
      state.confirm.pr = side(root, f, name, "pr", f.badControl as (c: Obj) => Obj);
      const row = buildDecision(root, m, state, 0).rows[0] as ReturnType<typeof buildDecision>["rows"][number];
      expect(row.metrics.find((x) => x.path === "delta.value")?.signal).toBe("same");
      expect(row.metrics.find((x) => x.path === "engagement.control_calls")).toMatchObject({ role: "harm", signal: "worse" });
      expect(row.verdict).toBe("worse");
    });
  }
});

describe("longmemeval: a retrieval-only run is a scope of its own", () => {
  test("a config of a full run has no baseline that is retrieval-only, and the other way round", () => {
    expect(() => matrixOf("longmemeval", ["--retrieval-only"], [])).toThrow("config pr has no baseline row that runs the same cases (longmemeval corpus=public)");
    expect(() => matrixOf("longmemeval", [], ["--retrieval-only"])).toThrow("config pr has no baseline row that runs the same cases (longmemeval corpus=public retrieval-only)");
    expect(scopeKey({ name: "a", eval: "longmemeval", args: ["--retrieval-only", "--semantic"] })).toBe("longmemeval corpus=public retrieval-only");
    const m = matrixOf("longmemeval", ["--retrieval-only"], ["--retrieval-only", "--semantic"]);
    expect(baselineFor(m, m.configs[0] as never).name).toBe("base");
    // a draw of other questions is another set of questions
    expect(scopeKey({ name: "a", eval: "longmemeval", args: ["--limit", "20", "--sample-seed", "7"] })).toBe("longmemeval corpus=public sample-seed=7 limit=20");
  });

  test("two retrieval-only results are judged on the sessions akm returned, and their summaries have no accuracy", async () => {
    const f = await evalFixture("longmemeval");
    const root = tmp();
    const m = matrixOf("longmemeval", ["--retrieval-only"], ["--retrieval-only"]);
    const state = emptyState(m);
    const only = { mode: "retrieval-only" };
    state.confirm.base = side(root, f, "longmemeval", "base", f.goodRetrievalOnly as (c: Obj) => Obj, only);
    state.confirm.pr = side(root, f, "longmemeval", "pr", f.badRetrievalOnly as (c: Obj) => Obj, only);
    const row = buildDecision(root, m, state, 0).rows[0] as ReturnType<typeof buildDecision>["rows"][number];
    expect(row).toMatchObject({ verdict: "worse", exploratory: [] });
    expect(row.metrics.filter((x) => x.baseline).map((x) => [x.path, x.signal])).toEqual([["retrieval.hit_rate", "worse"], ["retrieval.recall", "worse"]]);
    expect(row.metrics.find((x) => x.path === "accuracy.with_akm.rate")).toMatchObject({ baseline: null, config: null, signal: "n/a" });
    // a full result and a retrieval-only one are not the same measurement
    state.confirm.pr = side(root, f, "longmemeval", "pr", f.good);
    expect(buildDecision(root, m, state, 0).rows[0]).toMatchObject({ verdict: "not comparable" });
    expect(buildDecision(root, m, state, 0).rows[0]?.note).toContain("the mode (consolidate --pool is another set of cases, and longmemeval --retrieval-only another measurement) differs: retrieval-only in the baseline, none in the config");
  });
});

describe("skillret: no model, and a custom corpus that is a split", () => {
  test("the file's model is not given to a row of it, which has no --model, as it is not to retrieval's", () => {
    const m = parseMatrix({ prefix: "sw", model: "my-model", baseline: [{ name: "base", eval: "skillret" }, { name: "base-r", eval: "retrieval" }, { name: "base-l", eval: "bakeoff" }], configs: [{ name: "pr", eval: "skillret", args: ["--akm", "other"] }] }, FILE);
    const args = (row: string) => screenJobs(m).find((j) => j.row.name === row)?.args;
    expect(args("base")).toEqual(["--label", "sw-base-s"]);
    expect(args("base-r")).toEqual(["--label", "sw-base-r-s"]);
    expect(args("base-l")).toEqual(["--model", "my-model", "--label", "sw-base-l-s"]);
    expect(confirmJobs(m, [{ config: m.configs[0] as never, reason: "" }])[0]?.args).toEqual(["--repeat", "3", "--label", "sw-base-c"]);
  });

  test("its custom corpus has no folder: --corpus custom and the old --corpus private are one scope, and a custom row is not compared with a public one", () => {
    expect(scopeKey({ name: "a", eval: "skillret", args: ["--corpus", "custom"] })).toBe("skillret corpus=custom");
    expect(scopeKey({ name: "a", eval: "skillret", args: ["--corpus", "private"] })).toBe("skillret corpus=custom");
    expect(() => matrixOf("skillret", [], ["--corpus", "custom"])).toThrow("config pr has no baseline row that runs the same cases (skillret corpus=custom)");
    expect(matrixOf("skillret", ["--corpus", "private"], ["--corpus", "custom"]).configs).toHaveLength(1);
  });

  test("two results of the split are judged like two of the public corpus", async () => {
    const f = await evalFixture("skillret");
    const root = tmp();
    const m = matrixOf("skillret", ["--corpus", "custom"], ["--corpus", "custom"]);
    const state = emptyState(m);
    const split = { corpus: "custom" as const, corpusKind: "split", corpusFolder: null };
    state.confirm.base = side(root, f, "skillret", "base", f.good, split);
    state.confirm.pr = side(root, f, "skillret", "pr", f.bad, split);
    const row = buildDecision(root, m, state, 0).rows[0] as ReturnType<typeof buildDecision>["rows"][number];
    expect(row).toMatchObject({ verdict: "worse", exploratory: [] });
  });
});

describe("extract: planted.ambiguous is shown and not judged", () => {
  test("a decision row has the count beside the metrics it judges, and a rise in it changes no verdict", async () => {
    const { MEASUREMENT } = await import("../../../evals/extract/src/measurement.ts");
    const { cases, raw } = goldenOf("evals/extract");
    const line = (id: string, note?: string) => raw.find((l) => l.case === id && (note === undefined || l.note === note)) as (typeof raw)[number];
    const stored = (l: (typeof raw)[number]): Obj => (MEASUREMENT.rawOf({ id: l.case, ...l.raw }) as { raw: Obj }).raw;
    const clean = (c: Obj): Obj => stored(line(c.id));
    const doubt = (c: Obj): Obj => (c.id === "planted-01" ? stored(line(c.id, "the memory states the fix and holds the instruction behind do not think we should")) : clean(c));
    const f = { measurement: MEASUREMENT, cases, harbor: false, good: clean, bad: doubt } as EvalFixture;
    const root = tmp();
    const m = matrixOf("extract");
    const state = emptyState(m);
    state.confirm.base = side(root, f, "extract", "base", clean);
    state.confirm.pr = side(root, f, "extract", "pr", doubt);
    const d = buildDecision(root, m, state, 0);
    const row = d.rows[0] as (typeof d.rows)[number];
    expect(row.context.map((x) => [x.path, x.baseline?.mean, x.config?.mean])).toEqual([["planted.ambiguous", 0, 1]]);
    expect(row.verdict).toBe("no difference");
    expect(row.metrics.every((x) => x.signal === "same")).toBe(true);
    const md = renderMarkdown(d);
    expect(md).toContain("planted.ambiguous 0 → 1");
    expect(md).toContain("Extract rows also show planted.ambiguous under the main metrics");
    expect(md).toContain("It is a count to look at, not a metric that is judged");
  });
});

// ---- the confirm stage runs longmemeval and skillret, as it runs the other evals ------------------------------------------------------

const REPO = resolve(import.meta.dir, "..", "..", "..");

describe("the confirm stage runs the two benchmarks that were screen only, with --repeat 3, and judges their rows", () => {
  /** Six skills and four requests for the fake akm of skillret to rank: a request needs one, two or three of them. */
  const SPLIT = {
    skills: [["t1", "git commit messages review staged changes"], ["t2", "docker container compose networking"], ["t3", "postgres database migration schema"], ["t4", "react component hooks state"], ["t5", "kubernetes deployment helm charts"], ["t6", "python testing pytest fixtures"]] as [string, string][],
    queries: [["q1", "review my staged changes and write commit messages", ["t1"]], ["q2", "compose containers with docker and migrate the postgres database schema", ["t2", "t3"]], ["q3", "react hooks, helm charts on kubernetes deployment", ["t4", "t5", "t6"]], ["q4", "docker networking", ["t2"]]] as [string, string, string[]][],
  };

  /**
   * A repository root of its own, as the runner finds its root: the matrix, compare and rescore, lib/ and the lock of this checkout, the benchmark with
   * its run script and a tiny dataset, and a matrix file with a baseline and a config. The config runs another akm, one that answers with `fewer`
   * results than it is asked for, so its row has the build treatment. Both akms are scripts in a folder of their own.
   */
  function sweep(name: "skillret" | "longmemeval", flags: string[], fake: (dir: string) => string, assets: (folder: string) => void, fewer: string) {
    const root = tmp();
    for (const from of ["lib", "scripts/matrix/src", "scripts/compare/src", "scripts/rescore/src", `benchmarks/${name}/src`]) {
      cpSync(join(REPO, from), join(root, from), { recursive: true, filter: (src) => !["node_modules", "fixtures"].includes(basename(src)) && !src.endsWith(".test.ts") });
    }
    cpSync(join(REPO, "MEASUREMENT.lock"), join(root, "MEASUREMENT.lock"));
    cpSync(join(REPO, "benchmarks", name, "run"), join(root, "benchmarks", name, "run"));
    assets(join(root, "benchmarks", name, "assets"));
    const bin = tmp();
    const good = fake(bin);
    const text = readFileSync(good, "utf8");
    const was = 'const k = Number(rest[rest.indexOf("--limit") + 1]);';
    expect(text).toContain(was);
    const worse = join(bin, "worse-akm.ts");
    writeFileSync(worse, text.replace(was, `const k = ${fewer};`));
    const akm = (script: string) => commandLine(["bun", script]);
    writeFileSync(join(root, "matrix.json"), JSON.stringify({ prefix: "sw", repeats: 3, baseline: { name: "base", eval: name, args: [...flags, "--akm", akm(good)] }, configs: [{ name: "cfg", eval: name, args: [...flags, "--akm", akm(worse)] }] }));
    const out = join(root, "matrix-results");
    return {
      root,
      out,
      results: join(root, "benchmarks", name, "results"),
      async confirm() {
        const proc = Bun.spawn([process.execPath, join(root, "scripts", "matrix", "src", "run.ts"), join(root, "matrix.json"), "--stage", "confirm", "--only", "cfg", "--out", out], { cwd: root, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? root, TMPDIR: process.env.TMPDIR ?? tmpdir() }, stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr, code] = [await new Response(proc.stdout).text(), await new Response(proc.stderr).text(), await proc.exited];
        return { code, out: stdout + stderr };
      },
      state: (): Record<string, any> => JSON.parse(readFileSync(join(out, "state.json"), "utf8")),
      decision: (): { rows: Record<string, any>[] } => JSON.parse(readFileSync(join(out, "decision.json"), "utf8")),
    };
  }

  const cases = {
    skillret: () => sweep("skillret", ["--limit", "3"], skillsAkm, (folder) => writeAssets(folder, SPLIT, { skills: [["s1", "train skill"]], queries: [["p1", "a request", ["s1"]]] }), "1"),
    longmemeval: () => sweep("longmemeval", ["--retrieval-only"], memoriesAkm, (folder) => writePublicAssets(folder), "0"),
  };
  const main = { skillret: "search.NDCG@10", longmemeval: "retrieval.hit_rate" };

  for (const name of ["skillret", "longmemeval"] as const) {
    test(`${name}: the baseline and the config run --repeat 3 and a row has a verdict, where it was screen only`, async () => {
      const t = cases[name]();
      const r = await t.confirm();
      expect(r.code, r.out).toBe(0);
      expect(r.out).toContain("--repeat 3 --label sw-base-c");
      expect(r.out).toContain("--repeat 3 --label sw-cfg-c");
      // each side is three runs and a repeat summary beside them, which the state points at
      const names = readdirSync(t.results).map((n) => n.replace(/^\d{4}-\d{2}-\d{2}-/, "")).sort();
      expect(names).toEqual(["sw-base-c-r1", "sw-base-c-r2", "sw-base-c-r3", "sw-base-c-repeat-summary.json", "sw-cfg-c-r1", "sw-cfg-c-r2", "sw-cfg-c-r3", "sw-cfg-c-repeat-summary.json"]);
      for (const side of ["base", "cfg"]) expect(t.state().confirm[side]).toMatchObject({ exit_code: 0, repeat: 3, results: [{ scope: "", kind: "repeat" }] });
      for (const dir of readdirSync(t.results).filter((n) => !n.endsWith(".json"))) expect(existsSync(join(t.results, dir, ".running")), dir).toBe(false);
      // the config answers with fewer results, and the row says it is worse, from three runs of each side, case by case
      const [row] = t.decision().rows;
      expect(row).toMatchObject({ config: "cfg", eval: name, stage: "confirm", n: 3, verdict: "worse", exploratory: [], treatment: ["build"], rescored: false });
      expect(row?.metrics.find((x: any) => x.path === main[name])).toMatchObject({ role: "main", signal: "worse" });
      expect(row?.paired).toMatchObject({ repeats: { baseline: 3, config: 3 } });
      expect(row?.paired.worse).toBeGreaterThan(0);
      expect(row?.paired.better).toBe(0);
    }, 180_000);
  }
});
