// compare over runs that carry a manifest (harness-v3): reflect is the eval that writes one, so these tests build reflect runs from the golden
// raw outputs of evals/reflect/golden, score them with the eval's own scorer, and write them as results folders with a manifest. The policy
// they exercise: the collector (a difference is refused unless it is the treatment), the scorer and the labels (a difference is scored
// again), the inputs of each case (a case with another input is left out), the coverage of each side (#41), and runs with no manifest.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunManifest, buildManifest, caseDigests, completionOf, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { type Case, type Raw, type Row, isDefect, labelledQueries, reflectConfig } from "../../../evals/reflect/src/lib.ts";
import { MEASUREMENT } from "../../../evals/reflect/src/measurement.ts";
import { engineSettings } from "../../../lib/provenance.ts";
import { CompareError, compareRepeats, comparePair, loadRun, renderPair, renderRepeats } from "./lib.ts";
import { type Member, checkMembers, identityOf } from "./policy.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const FIXTURES = join(ROOT, "evals", "reflect", "fixtures");
const CASES: Case[] = jsonl(join(FIXTURES, "cases.jsonl"));
const RAW: { case: string; note: string; raw: Raw }[] = jsonl(join(FIXTURES, "raw.jsonl"));
const raw = (id: string, note: string): Raw => (RAW.find((l) => l.case === id && l.note === note) as { raw: Raw }).raw;

/** What a model that does well, and one that does badly, answers for a case. */
const GOOD = (c: Case): Raw => raw(c.id, isDefect(c.class) ? "the model restores what the injection took away" : "the model leaves the note alone");
const BAD = (c: Case): Raw => raw(c.id, isDefect(c.class) ? "the model proposes no change" : "the model rewrites the description and the when_to_use");
const ERROR: Raw = { outcome: "error", reason: "non_zero_exit: HTTP 503 from <MODEL_BASE_URL>/chat/completions", error: "non_zero_exit: HTTP 503 from <MODEL_BASE_URL>/chat/completions", seconds: 3 };
const ids = CASES.map((c) => c.id);
const DEFECT_IDS = CASES.filter((c) => isDefect(c.class)).map((c) => c.id);

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "compare-manifest-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const CONFIG = reflectConfig("http://localhost:9/v1", "the-model", true);

interface Spec {
  label?: string;
  cases?: Case[];
  /** The raw output for each case; a case with none was not run. */
  raw: (c: Case) => Raw | undefined;
  /** The searches the run recorded for a case. */
  searches?: (c: Case) => string[];
  /** Changes the manifest the run writes. */
  manifest?: (m: RunManifest) => RunManifest;
  /** Changes the rows the run writes, after they were scored. */
  rows?: (rows: Row[]) => Record<string, any>[];
  summary?: Record<string, unknown>;
}

/** A reflect run written as harness-v3 writes it: rows scored by the eval's scorer, and a summary with its manifest. Returns the folder. */
function run(spec: Spec): string {
  const cases = spec.cases ?? CASES;
  const scored: Row[] = cases.flatMap((c) => {
    const r = spec.raw(c);
    return r === undefined ? [] : [MEASUREMENT.score(c, r)];
  });
  const base = buildManifest({
    measurement: MEASUREMENT,
    corpus: "public",
    cases: caseDigests(MEASUREMENT, cases, spec.searches),
    akm: { version: "0.9.99-test", bin: "akm", build: null, build_fingerprint: null },
    config: CONFIG,
    settings: { strategy: "reflect-only" },
    completion: completionOf(MEASUREMENT, cases.map((c) => c.id), scored),
  });
  const dir = join(tmp(), spec.label ?? "run");
  mkdirSync(dir, { recursive: true });
  const summary = {
    eval: "reflect",
    corpus: "public",
    label: spec.label ?? "run",
    date: "2026-10-12T09:00:00.000Z",
    git_commit: "5d1c0de",
    harness_sha256: "b".repeat(64),
    model: "the-model",
    akm_version: "0.9.99-test",
    akm_bin: "akm",
    akm_build: null,
    akm_build_fingerprint: null,
    limit: null,
    strategy: "reflect-only",
    config_patch: null,
    config: JSON.parse(JSON.stringify(CONFIG)),
    engine: engineSettings(CONFIG),
    assets_sha256: "a".repeat(64),
    seed: null,
    status: "complete",
    aborted_reason: null,
    n_cases: cases.length,
    ...MEASUREMENT.summarize(scored),
    manifest: spec.manifest ? spec.manifest(base) : base,
    ...spec.summary,
  };
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
  writeFileSync(join(dir, "samples.jsonl"), (spec.rows ? spec.rows(scored) : scored).map((r) => `${JSON.stringify(r)}\n`).join(""));
  return dir;
}

const compare = (a: string, b: string, options = {}) => comparePair(loadRun(a), loadRun(b), options);
const STALE = { version: "9.9", sha256: "c".repeat(64) }; // a scorer other than the live one
const lit = (version: string): string => version.replace(/\./g, "\\."); // a version as the text of a regular expression
const metric = (r: ReturnType<typeof compare>, path: string) => r.views[0]?.metrics.find((m) => m.path === path);

describe("two runs with a manifest", () => {
  test("compare when their version and cases are the same, scoring both again, and the report shows the version and the denominators", () => {
    const r = compare(run({ label: "good", raw: GOOD }), run({ label: "bad", raw: BAD }));
    expect(r.exploratory).toEqual([]);
    expect(r.rescored).toHaveLength(2);
    expect(r.inputs_differ).toEqual([]);
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(r.a).toMatchObject({ collector: `v${parts.collector.version}`, label: "good", rescored_from: null }); // scored again in memory: the report shows the run as stored
    expect(r.views[0]?.coverage).toEqual({ selected_a: 10, selected_b: 10, scored_a: 10, scored_b: 10, errored_a: [], errored_b: [], in_both: 10, scored_only_a: [], scored_only_b: [] });
    expect(metric(r, "defects.rate")).toMatchObject({ a: 1, b: 0, n: 6 });
    expect(metric(r, "controls.rate")).toMatchObject({ a: 1, b: 0, n: 4 });
    const md = renderPair(r);
    expect(md).toContain("Scored: A 10 of 10 cases, B 10 of 10. Every number below is over the 10 scored in both.");
    expect(md).toContain("| defects.rate ↑ | 1 | 0 | -1 |");
    expect(md).toContain("| 6 of 10 |");
    expect(md).toContain(`| version | v${parts.collector.version} | v${parts.collector.version} |`);
  });

  test("a different collector is refused, naming both, unless the collector (harness) is the treatment, and then it is listed as the treatment", () => {
    // the version the lock gives reflect now, and another one: the test holds whatever version the live lock is at
    const live = MEASUREMENT.version;
    const other = "9.9";
    const harness = HARNESS_VERSION;
    const a = run({ label: "a", raw: GOOD });
    const b = run({ label: "b", raw: BAD, manifest: (m) => ({ ...m, collector: { version: other, sha256: "d".repeat(64) } }) });
    const then = (f: () => unknown) => {
      try {
        f();
      } catch (e) {
        return (e as CompareError).message;
      }
      return "";
    };
    const refused = then(() => compare(a, b));
    expect(refused).toContain("these two runs cannot be compared case by case");
    expect(refused).toContain(`the eval's code differs: version ${live} (harness ${harness}) in A, version ${other} (harness ${harness}) in B`);
    expect(refused).toContain("--treatment");
    const allowed = compare(a, b, { treatment: ["config", "model", "harness"] });
    expect(allowed.treated.join(" ")).toContain(`the eval's code differs: version ${live} (harness ${harness}) in A, version ${other} (harness ${harness}) in B`);
    expect(allowed.exploratory).toEqual([]);
  });

  test("runs scored by different scorers are each scored again with the current scorer, and the folders are not touched", () => {
    // A was scored by an older scorer that called every row of the defect cases right; B by the current one
    const a = run({ label: "stale", raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map((r) => ({ ...r, correct: true, checks: Object.fromEntries(Object.keys(r.checks ?? {}).map((k) => [k, true])) })) });
    const b = run({ label: "now", raw: GOOD });
    const before = [a, b].map((d) => readFileSync(join(d, "summary.json"), "utf8") + readFileSync(join(d, "samples.jsonl"), "utf8"));
    const r = compare(a, b);
    expect(r.rescored).toEqual([loadRun(a).dir, loadRun(b).dir]);
    expect(r.exploratory).toEqual([]);
    // the numbers are the current scorer's: A answered nothing for every defect, whatever its old rows say
    expect(metric(r, "defects.rate")).toMatchObject({ a: 0, b: 1 });
    expect(r.a.rescored_from).toBeNull(); // scored again in memory: nothing was written
    expect([a, b].map((d) => readFileSync(join(d, "summary.json"), "utf8") + readFileSync(join(d, "samples.jsonl"), "utf8"))).toEqual(before);
  });

  test("the same scorer with another label for a case is scored again too", () => {
    const a = run({ label: "a", raw: GOOD });
    const b = run({ label: "b", raw: BAD, manifest: (m) => ({ ...m, cases: { ...m.cases, [ids[0] as string]: { ...(m.cases[ids[0] as string] as object), label_sha256: "e".repeat(64) } } as RunManifest["cases"] }) });
    const r = compare(a, b);
    expect(r.rescored.length).toBe(2);
    expect(r.exploratory).toEqual([]);
  });

  test("runs that agree with each other but were scored by an older scorer are scored again with the current one, as the matrix does", () => {
    const allRight = (rows: Record<string, any>[]) => rows.map((r) => ({ ...r, correct: true, checks: Object.fromEntries(Object.keys(r.checks ?? {}).map((k) => [k, true])) }));
    const a = run({ label: "old-a", raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }), rows: allRight });
    const b = run({ label: "old-b", raw: GOOD, manifest: (m) => ({ ...m, scorer: STALE }) });
    const r = compare(a, b);
    expect(r.rescored).toEqual([loadRun(a).dir, loadRun(b).dir]);
    expect(metric(r, "defects.rate")).toMatchObject({ a: 0, b: 1 });
  });

  test("runs whose case was relabelled after both were made are scored again against the current labels", () => {
    const before = (m: RunManifest): RunManifest => ({ ...m, cases: { ...m.cases, [ids[0] as string]: { ...(m.cases[ids[0] as string] as object), label_sha256: "e".repeat(64) } } as RunManifest["cases"] });
    const r = compare(run({ label: "a", raw: GOOD, manifest: before }), run({ label: "b", raw: BAD, manifest: before }));
    expect(r.rescored.length).toBe(2);
    expect(r.exploratory).toEqual([]);
  });

  test("a run that cannot be scored again, for want of the raw output the scorer reads, is compared as it was scored, and the report says so and names the fields", () => {
    const a = run({ label: "a", raw: GOOD, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map((r) => (r.outcome === "proposal" ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "proposal")) : r)) });
    const b = run({ label: "b", raw: BAD });
    const r = compare(a, b);
    expect(r.rescored).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/A cannot be scored again with the current scorer \(.*its rows lack the raw output the reflect scorer reads: proposal \(6 rows: .*\), so the runs are compared as they were scored/);
  });

  test("a case given another input in a few runs is left out and named; the verdict is over the rest", () => {
    const moved = [ids[0], ids[5]] as string[];
    const a = run({ label: "a", raw: GOOD });
    const b = run({ label: "b", raw: GOOD, manifest: (m) => ({ ...m, cases: Object.fromEntries(Object.entries(m.cases).map(([id, d]) => [id, moved.includes(id) ? { ...d, input_sha256: "f".repeat(64) } : d])) }) });
    const r = compare(a, b);
    expect(r.inputs_differ).toEqual(moved);
    expect(r.views[0]?.n_paired).toBe(8);
    expect(r.exploratory).toEqual([]);
    const md = renderPair(r);
    expect(md).toContain(`> Left out. 2 cases were not given the same input in every run, so they are not compared: \`${moved[0]}\`, \`${moved[1]}\`.`);
    expect(md).toContain("Every number below is over the 8 scored in both.");
    expect(md).toContain("2 more cases are left out because their input differs.");
  });

  test("cases given another input are left out however many they are, and with the inputs as the treatment every case is compared", () => {
    const moved = ids.slice(0, 7);
    const a = run({ label: "a", raw: GOOD });
    const b = run({ label: "b", raw: BAD, manifest: (m) => ({ ...m, cases: Object.fromEntries(Object.entries(m.cases).map(([id, d]) => [id, moved.includes(id) ? { ...d, input_sha256: "f".repeat(64) } : d])) }) });
    const left = compare(a, b);
    expect(left.inputs_differ).toEqual(moved);
    expect([left.views[0]?.n_paired, left.exploratory]).toEqual([3, []]);
    const r = compare(a, b, { treatment: ["config", "model", "inputs"] });
    expect(r.inputs_differ).toEqual([]);
    expect(r.views[0]?.n_paired).toBe(10);
    expect(r.treated.join(" ")).toContain("7 cases were given another input in some run (the inputs are the treatment)");
  });

  test("--retrieval-queries is part of a run's identity: a run with the searches and a run without them compare only the notes with no searches, and all of them with the inputs as the treatment (#37)", () => {
    const every = jsonl(join(ROOT, "evals", "reflect", "assets", "cases.jsonl")) as Case[];
    const searches = labelledQueries(readFileSync(join(ROOT, "evals", "retrieval", "assets", "queries.jsonl"), "utf8"), readFileSync(join(ROOT, "evals", "retrieval", "assets", "qrels.jsonl"), "utf8"));
    const refOf = (c: Case) => c.path.replace(/\.md$/, "").replace(/\/SKILL$/, "");
    const noop = (c: Case): Raw => ({ outcome: "none", reason: "no_change: unchanged", served: "m", seconds: 2 });
    const without = run({ label: "without", cases: every, raw: noop });
    const withQueries = run({ label: "with", cases: every, raw: noop, searches: (c) => searches.get(refOf(c)) ?? [], summary: { retrieval_queries: { cases: 46 } } });
    expect(every.filter((c) => (searches.get(refOf(c))?.length ?? 0) > 0).length).toBeGreaterThan(40);
    const left = compare(without, withQueries);
    expect(left.inputs_differ.length).toBeGreaterThan(40);
    expect(left.views[0]?.n_paired).toBe(50 - left.inputs_differ.length);
    const r = compare(without, withQueries, { treatment: ["config", "model", "inputs"] });
    expect(r.views[0]?.n_paired).toBe(50);
    expect(r.treated.join(" ")).toMatch(/\d+ cases were given another input in some run/);
    // the same pair of runs, with the searches of one note changed, differs in that note only, and is compared on the others
    const other = run({ label: "other", cases: every, raw: noop, searches: (c) => (c === every[3] ? ["something else"] : searches.get(refOf(c)) ?? []), summary: { retrieval_queries: { cases: 46 } } });
    const again = compare(withQueries, other);
    expect(again.inputs_differ).toEqual([(every[3] as Case).id]);
  });

  test("a side that errored on cases the other scored, with equal error counts, is not compared as if it covered the same cases (#41)", () => {
    const hard = DEFECT_IDS.slice(0, 2);
    const easy = ids.filter((id) => !DEFECT_IDS.includes(id)).slice(0, 2);
    // A is right on every case but errors on two easy ones; B errors on two hard ones and is wrong on the rest. Two errors each.
    const a = run({ label: "a", raw: (c) => (easy.includes(c.id) ? ERROR : GOOD(c)) });
    const b = run({ label: "b", raw: (c) => (hard.includes(c.id) ? ERROR : BAD(c)) });
    const r = compare(a, b);
    const cov = r.views[0]?.coverage;
    expect(cov).toMatchObject({ selected_a: 10, scored_a: 8, scored_b: 8, errored_a: easy, errored_b: hard, scored_only_a: hard, scored_only_b: easy });
    expect(r.views[0]?.n_paired).toBe(6); // only the cases both scored decide it
    expect(r.exploratory).toEqual([]);
    const md = renderPair(r);
    expect(md).toContain(`Scored: A 8 of 10 cases, B 8 of 10 (errored: A ${easy.map((id) => `\`${id}\``).join(", ")}; B ${hard.map((id) => `\`${id}\``).join(", ")}).`);
    expect(md).toContain(`Scored on one side only, and so left out: in A ${hard.map((id) => `\`${id}\``).join(", ")}; in B ${easy.map((id) => `\`${id}\``).join(", ")}.`);
  });

  test("an error on one case is a case less on one side: the others are compared", () => {
    const r = compare(run({ label: "a", raw: GOOD }), run({ label: "b", raw: (c) => (c.id === ids[1] ? ERROR : BAD(c)) }));
    expect(r.views[0]?.coverage).toMatchObject({ scored_a: 10, scored_b: 9, errored_b: [ids[1]], scored_only_a: [ids[1]], scored_only_b: [] });
    expect(r.exploratory).toEqual([]);
    expect(renderPair(r)).toContain(`Scored: A 10 of 10 cases, B 9 of 10 (errored: A none; B \`${ids[1]}\`).`);
  });
});

describe("a run without a sound manifest", () => {
  test("a run made before akm-eval 0.2 (no manifest) is refused before anything else, with what to do", () => {
    const dir = run({ label: "old", raw: GOOD, summary: { manifest: undefined, eval: "toy" } });
    expect(() => loadRun(dir)).toThrow(`${dir} was made before akm-eval 0.2 (it has no manifest), so it cannot be compared or scored again: run it again`);
    expect(() => compare(dir, run({ label: "new", raw: GOOD }))).toThrow(CompareError);
  });

  test("a manifest that is not sound stops the run being read, and says what is wrong", () => {
    const dir = run({ label: "bad", raw: GOOD, manifest: (m) => ({ ...m, manifest_version: 7 }) });
    expect(() => loadRun(dir)).toThrow("has a manifest that is not sound: manifest_version is 7");
    const dir2 = run({ label: "bad2", raw: GOOD, manifest: (m) => ({ ...m, engines: { reflect: { model: "x", endpoint: "https://gateway.example/k-DUMMYSECRET0123/v1", temperature: 0, enableThinking: false, timeoutMs: 1 } } }) });
    const problem = (() => {
      try {
        loadRun(dir2);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(problem).toContain("the engine reflect needs a model and an endpoint that is a host with no path");
  });
});

describe("repeats with a manifest", () => {
  test("repeats that were scored by different scorers are all scored again with the current one", () => {
    const runs = ["r1", "r2", "r3"].map((label, i) => run({ label, raw: (c) => (i === 1 && c.id === ids[0] ? BAD(c) : GOOD(c)), manifest: i === 0 ? (m) => ({ ...m, scorer: STALE }) : undefined }));
    const r = compareRepeats(runs.map(loadRun));
    expect(r.rescored.length).toBe(3);
    expect(r.exploratory).toEqual([]);
    expect(r.views[0]?.n_compared).toBe(10);
  });

  test("repeats of one configuration whose collector differs are refused", () => {
    const runs = [run({ label: "r1", raw: GOOD }), run({ label: "r2", raw: GOOD, manifest: (m) => ({ ...m, collector: { version: "9.9", sha256: "d".repeat(64) } }) })];
    expect(() => compareRepeats(runs.map(loadRun))).toThrow("these runs are not repeats of one configuration: the eval's code differs");
  });
});

describe("the endpoint is never written whole into a comparison (#65)", () => {
  const URL_A = "https://gateway.example/k-DUMMYSECRET0123/v1/chat/completions";
  const URL_B = "https://gateway.example/deployment-B/v1/chat/completions";
  const URL_C = "https://other.example:8443/k-DUMMYSECRET0123/v1/chat/completions";
  const withEndpoint = (label: string, url: string): string => {
    const config = { ...CONFIG, engines: { reflect: { ...CONFIG.engines.reflect, endpoint: url } } };
    const dir = run({ label, raw: GOOD, manifest: (m) => ({ ...m, engines: engineSettings(config).engines }) });
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ ...summary, engine: engineSettings(config) }));
    return dir;
  };

  test("an engine is its model and the host of its endpoint: two paths on one host compare, another host is refused, named by its host and not its path", () => {
    expect(compare(withEndpoint("a", URL_A), withEndpoint("b", URL_B), { treatment: ["config"] }).views[0]?.n_paired).toBe(10);
    let message = "";
    try {
      compare(withEndpoint("c", URL_A), withEndpoint("d", URL_C), { treatment: ["config"] });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("endpoint https://gateway.example, temperature 0");
    expect(message).toContain("endpoint https://other.example:8443, temperature 0");
    expect(message).not.toMatch(/DUMMYSECRET|k-DUMMY|\/v1/);
  });

  test("declared as the treatment, the difference is listed without the path, in the report and in its JSON", () => {
    const r = compare(withEndpoint("a", URL_A), withEndpoint("b", URL_C), { treatment: ["model"] });
    const text = JSON.stringify(r) + renderPair(r);
    expect(r.treated.join(" ")).toContain("endpoint https://gateway.example, temperature 0");
    expect(text).not.toMatch(/DUMMYSECRET|k-DUMMY/);
  });

  test("the endpoint_id an older manifest has is left out", () => {
    const older = run({ label: "e", raw: GOOD, manifest: (m) => ({ ...m, engines: { reflect: { ...m.engines.reflect, endpoint_id: "f".repeat(64) } as any } }) });
    expect(compare(run({ label: "f", raw: GOOD }), older, { treatment: ["config"] }).views[0]?.n_paired).toBe(10);
  });
});

describe("the policy", () => {
  const member = (side: string, dir: string): Member => ({ side, name: side, identity: identityOf(JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"))) });
  const withSummary = (dir: string, patch: Record<string, unknown>): string => {
    const copy = join(tmp(), "copy");
    cpSync(dir, copy, { recursive: true });
    writeFileSync(join(copy, "summary.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")), ...patch }));
    return copy;
  };

  test("reads a summary with a manifest from it: the build, the config digest, the engines, the settings and the parts", () => {
    const dir = run({ label: "a", raw: GOOD });
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    const identity = identityOf(summary);
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(identity).toMatchObject({ akm_version: "0.9.99-test", akm_bin: "akm", strategy: "reflect-only", collector: parts.collector.version, harness_version: String(parts.harness_version), hints: null });
    expect(identity.engine).toContain('"endpoint":"http://localhost:9"');
    expect(identity.engine).not.toContain("localhost:9/v1");
  });

  test("the cases are compared one by one and the harness is the collector: assets_sha256 and the digest of the code are not compared", () => {
    const a = run({ label: "a", raw: GOOD });
    const b = withSummary(run({ label: "b", raw: GOOD }), { assets_sha256: "9".repeat(64), harness_sha256: "8".repeat(64), git_commit: "9999999" });
    expect(checkMembers([member("A", a), member("B", b)], []).mismatches).toEqual([]);
  });
});
