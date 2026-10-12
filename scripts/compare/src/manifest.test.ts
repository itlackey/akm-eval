// compare over runs that carry a manifest (harness-v3): reflect is the eval that writes one, so these tests build reflect runs from the golden
// raw outputs of evals/reflect/golden, score them with the eval's own scorer, and write them as results folders with a manifest. The policy
// they exercise: the collector (a difference is refused unless it is the treatment), the scorer and the labels (a difference is scored
// again), the inputs of each case (a case with another input is left out), the coverage of each side (#41), and the legacy runs.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { endpointId } from "../../../lib/provenance.ts";
import { rescoreFolder } from "../../rescore/src/lib.ts";
import { type RunManifest, buildManifest, caseDigests, completionOf, lockedParts } from "../../../lib/manifest.ts";
import { type Case, type Raw, type Row, assetsSha256, isDefect, labelledQueries, reflectConfig } from "../../../evals/reflect/src/lib.ts";
import { MEASUREMENT } from "../../../evals/reflect/src/measurement.ts";
import { engineSettings } from "../../../lib/provenance.ts";
import { CompareError, MIN_SHARE, compareRepeats, comparePair, loadRun, renderPair, renderRepeats } from "./lib.ts";
import { type Member, checkMembers, configDigest, identityOf } from "./policy.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const GOLDEN = join(ROOT, "evals", "reflect", "golden");
const CASES: Case[] = jsonl(join(GOLDEN, "cases.jsonl"));
const RAW: { case: string; note: string; raw: Raw }[] = jsonl(join(GOLDEN, "raw.jsonl"));
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
    parts: lockedParts(MEASUREMENT),
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
const STALE = { version: 1, sha256: "c".repeat(64) };
const metric = (r: ReturnType<typeof compare>, path: string) => r.views[0]?.metrics.find((m) => m.path === path);

describe("two runs with a manifest", () => {
  test("compare when their collector, scorer and cases are the same, and the report shows the parts and the denominators", () => {
    const r = compare(run({ label: "good", raw: GOOD }), run({ label: "bad", raw: BAD }));
    expect(r.exploratory).toEqual([]);
    expect(r.rescored).toEqual([]);
    expect(r.inputs_differ).toEqual([]);
    const parts = lockedParts(MEASUREMENT);
    expect(r.a).toMatchObject({ collector: `v${parts.collector.version} ${parts.collector.sha256.slice(0, 12)}`, scorer: `v${parts.scorer.version} ${parts.scorer.sha256.slice(0, 12)}`, rescored_from: null });
    expect(r.views[0]?.coverage).toEqual({ selected_a: 10, selected_b: 10, scored_a: 10, scored_b: 10, errored_a: [], errored_b: [], in_both: 10, scored_only_a: [], scored_only_b: [] });
    expect(metric(r, "defects.rate")).toMatchObject({ a: 1, b: 0, n: 6 });
    expect(metric(r, "controls.rate")).toMatchObject({ a: 1, b: 0, n: 4 });
    const md = renderPair(r);
    expect(md).toContain("Scored: A 10 of 10 cases, B 10 of 10. Every number below is over the 10 scored in both.");
    expect(md).toContain("| defects.rate ↑ | 1 | 0 | -1 |");
    expect(md).toContain("| 6 of 10 |");
    expect(md).toContain(`| collector | v${parts.collector.version} ${parts.collector.sha256.slice(0, 12)} | v${parts.collector.version} ${parts.collector.sha256.slice(0, 12)} |`);
  });

  test("a different collector is refused, naming both, unless the collector (harness) is the treatment, and then it is listed as the treatment", () => {
    // the version the lock gives reflect now, and another one: the test holds whatever version the live lock is at
    const live = lockedParts(MEASUREMENT).collector.version;
    const other = live + 1;
    const harness = lockedParts(MEASUREMENT).harness_version;
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
    expect(refused).toMatch(new RegExp(`the eval's code differs: collector ${live} [0-9a-f]{12} \\(harness ${harness}\\) in A, collector ${other} dddddddddddd \\(harness ${harness}\\) in B`));
    expect(refused).toContain("--treatment");
    const allowed = compare(a, b, { treatment: ["config", "model", "harness"] });
    expect(allowed.treated.join(" ")).toMatch(new RegExp(`the eval's code differs: collector ${live} .* in A, collector ${other} dddddddddddd`));
    expect(allowed.exploratory).toEqual([]);
  });

  test("a change to the scorer alone is no difference: another version of the scorer is not an axis", () => {
    const a = run({ label: "a", raw: GOOD });
    const b = run({ label: "b", raw: BAD, manifest: (m) => ({ ...m, scorer: { version: lockedParts(MEASUREMENT).scorer.version + 1, sha256: lockedParts(MEASUREMENT).scorer.sha256 } }) });
    expect(compare(a, b).rescored).toEqual([]); // the same digest under another version: nothing differs that scoring would change
  });

  test("runs scored by different scorers are each scored again with the current scorer, the report says so, and the folders are not touched", () => {
    // A was scored by an older scorer that called every row of the defect cases right; B by the current one
    const a = run({ label: "stale", raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map((r) => ({ ...r, correct: true, checks: Object.fromEntries(Object.keys(r.checks ?? {}).map((k) => [k, true])) })) });
    const b = run({ label: "now", raw: GOOD });
    const before = [a, b].map((d) => readFileSync(join(d, "summary.json"), "utf8") + readFileSync(join(d, "samples.jsonl"), "utf8"));
    const r = compare(a, b);
    expect(r.rescored).toEqual([loadRun(a).dir, loadRun(b).dir]);
    expect(r.exploratory).toEqual([]);
    // the numbers are the current scorer's: A answered nothing for every defect, whatever its old rows say
    expect(metric(r, "defects.rate")).toMatchObject({ a: 0, b: 1 });
    expect(r.a.rescored_from).toBe("stale");
    expect(r.a.scorer).toBe(r.b.scorer);
    const md = renderPair(r);
    expect(md).toContain("> Scored again. The runs had been scored by different scorers or against different labels");
    expect(md).toContain("| scored again from | `stale` | `now` |");
    expect([a, b].map((d) => readFileSync(join(d, "summary.json"), "utf8") + readFileSync(join(d, "samples.jsonl"), "utf8"))).toEqual(before);
  });

  test("the same scorer with another label for a case is scored again too", () => {
    const a = run({ label: "a", raw: GOOD });
    const b = run({ label: "b", raw: BAD, manifest: (m) => ({ ...m, cases: { ...m.cases, [ids[0] as string]: { ...(m.cases[ids[0] as string] as object), label_sha256: "e".repeat(64) } } as RunManifest["cases"] }) });
    const r = compare(a, b);
    expect(r.rescored.length).toBe(2);
    expect(r.exploratory).toEqual([]);
  });

  test("a run that cannot be scored again, for want of the raw output the scorer reads, makes the comparison refused and names the fields", () => {
    const a = run({ label: "a", raw: GOOD, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map((r) => (r.outcome === "proposal" ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "proposal")) : r)) });
    const b = run({ label: "b", raw: BAD });
    expect(() => compare(a, b)).toThrow(/cannot be: .*its rows lack the raw output the reflect scorer reads: proposal \(6 rows: .*\)/);
  });

  test("a case given another input in a few runs is left out and named; the verdict is over the rest", () => {
    const moved = [ids[0], ids[5]] as string[];
    const a = run({ label: "a", raw: GOOD });
    const b = run({ label: "b", raw: GOOD, manifest: (m) => ({ ...m, cases: Object.fromEntries(Object.entries(m.cases).map(([id, d]) => [id, moved.includes(id) ? { ...d, input_sha256: "f".repeat(64) } : d])) }) });
    const r = compare(a, b);
    expect(r.inputs_differ).toEqual(moved);
    expect(r.views[0]?.n_paired).toBe(8);
    expect(r.exploratory).toEqual([]); // 8 of the 10 cases both selected is the least a comparison may use
    const md = renderPair(r);
    expect(md).toContain(`> Left out. 2 cases were not given the same input in every run, so they are not compared: \`${moved[0]}\`, \`${moved[1]}\`.`);
    expect(md).toContain("Every number below is over the 8 scored in both.");
    expect(md).toContain("2 more cases are left out because their input differs.");
  });

  test("more than a fifth of the cases given another input is a difference of inputs: refused unless inputs are the treatment, and then every case is compared", () => {
    const moved = ids.slice(0, 3);
    const a = run({ label: "a", raw: GOOD });
    const b = run({ label: "b", raw: BAD, manifest: (m) => ({ ...m, cases: Object.fromEntries(Object.entries(m.cases).map(([id, d]) => [id, moved.includes(id) ? { ...d, input_sha256: "f".repeat(64) } : d])) }) });
    expect(() => compare(a, b)).toThrow(`the cases were not given the same input in every run for 3 of the 10 cases they share (${moved.map((id) => `\`${id}\``).join(", ")}), and ${MIN_SHARE * 100}% must match.`);
    expect(() => compare(a, b)).toThrow("--treatment inputs");
    const r = compare(a, b, { treatment: ["config", "model", "inputs"] });
    expect(r.inputs_differ).toEqual([]);
    expect(r.views[0]?.n_paired).toBe(10);
    expect(r.treated.join(" ")).toContain("3 cases were given another input in some run (the inputs are the treatment)");
  });

  test("--retrieval-queries is part of a run's identity: a run with the searches and a run without them are refused, and compare with the inputs as the treatment (#37)", () => {
    const every = jsonl(join(ROOT, "evals", "reflect", "assets", "cases.jsonl")) as Case[];
    const searches = labelledQueries(readFileSync(join(ROOT, "evals", "retrieval", "assets", "queries.jsonl"), "utf8"), readFileSync(join(ROOT, "evals", "retrieval", "assets", "qrels.jsonl"), "utf8"));
    const refOf = (c: Case) => c.path.replace(/\.md$/, "").replace(/\/SKILL$/, "");
    const noop = (c: Case): Raw => ({ outcome: "none", reason: "no_change: unchanged", served: "m", seconds: 2 });
    const without = run({ label: "without", cases: every, raw: noop });
    const withQueries = run({ label: "with", cases: every, raw: noop, searches: (c) => searches.get(refOf(c)) ?? [], summary: { retrieval_queries: { cases: 46 } } });
    expect(every.filter((c) => (searches.get(refOf(c))?.length ?? 0) > 0).length).toBeGreaterThan(40);
    expect(() => compare(without, withQueries)).toThrow(/cases were not given the same input in every run for \d+ of the 50 cases they share/);
    expect(() => compare(without, withQueries)).toThrow("--treatment inputs");
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
    expect(r.exploratory.join(" ")).toContain("only 6 of the 10 cases both runs selected could be compared (60%, and the least is 80%): 2 errored in A, 2 errored in B");
    const md = renderPair(r);
    expect(md).toContain(`Scored: A 8 of 10 cases, B 8 of 10 (errored: A ${easy.map((id) => `\`${id}\``).join(", ")}; B ${hard.map((id) => `\`${id}\``).join(", ")}).`);
    expect(md).toContain(`Scored on one side only, and so left out: in A ${hard.map((id) => `\`${id}\``).join(", ")}; in B ${easy.map((id) => `\`${id}\``).join(", ")}.`);
    expect(md).toContain("> **Exploratory.**");
  });

  test("an error on one case is a case less on one side: the others are compared, with the share they make", () => {
    const r = compare(run({ label: "a", raw: GOOD }), run({ label: "b", raw: (c) => (c.id === ids[1] ? ERROR : BAD(c)) }));
    expect(r.views[0]?.coverage).toMatchObject({ scored_a: 10, scored_b: 9, errored_b: [ids[1]], scored_only_a: [ids[1]], scored_only_b: [] });
    expect(r.exploratory).toEqual([]); // 9 of 10
    expect(renderPair(r)).toContain(`Scored: A 10 of 10 cases, B 9 of 10 (errored: A none; B \`${ids[1]}\`).`);
  });
});

describe("a run without a manifest", () => {
  const legacy = (label: string, raw: (c: Case) => Raw): string => {
    const dir = run({ label, raw });
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    const { manifest: _m, ...rest } = summary;
    writeFileSync(join(dir, "summary.json"), JSON.stringify(rest));
    return dir;
  };

  test("is compared as before and the report is exploratory, naming the run", () => {
    const withManifest = run({ label: "new", raw: GOOD });
    const r = compare(legacy("old", BAD), withManifest);
    expect(r.exploratory).toEqual(["A has no manifest (written before harness-v3), so its collector, its scorer and the inputs of its cases are not verified"]);
    expect(metric(r, "defects.rate")).toMatchObject({ a: 0, b: 1 });
    expect(compare(legacy("old1", BAD), legacy("old2", GOOD)).exploratory).toEqual(["A and B have no manifest (written before harness-v3), so its collector, its scorer and the inputs of its cases are not verified"]);
  });

  test("a legacy run scored again by scripts/rescore has collector version 0: refused against a run of collector 1 unless the harness is the treatment, and then exploratory", () => {
    const dir = run({ label: "old", raw: BAD, summary: { assets_sha256: assetsSha256(join(ROOT, "evals", "reflect", "assets")) } });
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    const { manifest: _m, ...rest } = summary;
    writeFileSync(join(dir, "summary.json"), JSON.stringify(rest));
    const { out } = rescoreFolder(dir);
    const current = run({ label: "new", raw: GOOD });
    expect(() => compare(out, current)).toThrow(new RegExp(`the eval's code differs: collector 0 b{12} \\(harness 0\\) in A, collector ${lockedParts(MEASUREMENT).collector.version} [0-9a-f]{12} \\(harness ${lockedParts(MEASUREMENT).harness_version}\\) in B`));
    const r = compare(out, current, { treatment: ["config", "model", "harness"] });
    expect(r.exploratory).toEqual(["A was collected before harness-v3 (collector version 0, known only by its harness_sha256), so what the collector did is not versioned"]);
    expect(metric(r, "defects.rate")).toMatchObject({ a: 0, b: 1 });
  });

  test("an eval that declares no measurement yet has no manifest to write, so its runs are compared by the earlier rules", () => {
    const fixtures = join(import.meta.dir, "fixtures", "nightly");
    const r = comparePair(loadRun(join(fixtures, "before")), loadRun(join(fixtures, "after")), { treatment: ["build"] });
    expect(r.exploratory).toEqual([]);
  });

  test("a manifest that is not sound stops the run being read, and says what is wrong", () => {
    const dir = run({ label: "bad", raw: GOOD, manifest: (m) => ({ ...m, manifest_version: 7 }) });
    expect(() => loadRun(dir)).toThrow("has a manifest that is not sound: manifest_version is 7");
    const dir2 = run({ label: "bad2", raw: GOOD, manifest: (m) => ({ ...m, engines: { reflect: { model: "x", endpoint: "https://gateway.example/k-DUMMYSECRET0123/v1", endpoint_id: null, temperature: 0, enableThinking: false, timeoutMs: 1 } } }) });
    const problem = (() => {
      try {
        loadRun(dir2);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(problem).toContain("the engine reflect needs a model, an endpoint that is a host with no path, and an endpoint_id digest");
  });
});

describe("repeats with a manifest", () => {
  test("repeats that were scored by different scorers are scored again, and the report says so", () => {
    const runs = ["r1", "r2", "r3"].map((label, i) => run({ label, raw: (c) => (i === 1 && c.id === ids[0] ? BAD(c) : GOOD(c)), manifest: i === 0 ? (m) => ({ ...m, scorer: STALE }) : undefined }));
    const r = compareRepeats(runs.map(loadRun));
    expect(r.rescored.length).toBe(3);
    expect(r.exploratory).toEqual([]);
    expect(renderRepeats(r)).toContain("> Scored again.");
    expect(r.views[0]?.n_compared).toBe(10);
  });

  test("repeats of one configuration whose collector differs are refused", () => {
    const runs = [run({ label: "r1", raw: GOOD }), run({ label: "r2", raw: GOOD, manifest: (m) => ({ ...m, collector: { version: lockedParts(MEASUREMENT).collector.version + 1, sha256: "d".repeat(64) } }) })];
    expect(() => compareRepeats(runs.map(loadRun))).toThrow("these runs are not repeats of one configuration: the eval's code differs");
  });
});

describe("the endpoint is never written whole into a comparison (#65)", () => {
  const URL_A = "https://gateway.example/k-DUMMYSECRET0123/v1/chat/completions";
  const URL_B = "https://gateway.example/deployment-B/v1/chat/completions";
  const withEndpoint = (label: string, url: string): string => {
    const config = { ...CONFIG, engines: { reflect: { ...CONFIG.engines.reflect, endpoint: url } } };
    const dir = run({ label, raw: GOOD, manifest: (m) => ({ ...m, engines: engineSettings(config).engines }) });
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ ...summary, engine: engineSettings(config) }));
    return dir;
  };

  test("two deployments on one host are two engines, the refusal names the host and the start of each digest, and not the path", () => {
    let message = "";
    try {
      compare(withEndpoint("a", URL_A), withEndpoint("b", URL_B), { treatment: ["config"] });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain(`endpoint https://gateway.example (id ${endpointId(URL_A)?.slice(0, 12)}), temperature 0`);
    expect(message).toContain(`endpoint https://gateway.example (id ${endpointId(URL_B)?.slice(0, 12)}), temperature 0`);
    expect(message).not.toMatch(/DUMMYSECRET|k-DUMMY|deployment-B|\/v1/);
  });

  test("declared as the treatment, the difference is listed without the path, in the report and in its JSON", () => {
    const r = compare(withEndpoint("a", URL_A), withEndpoint("b", URL_B), { treatment: ["model"] });
    const text = JSON.stringify(r) + renderPair(r);
    expect(r.treated.join(" ")).toContain(`endpoint https://gateway.example (id ${endpointId(URL_A)?.slice(0, 12)}), temperature 0`);
    expect(text).not.toMatch(/DUMMYSECRET|k-DUMMY|deployment-B/);
  });

  test("a run that is not on the manifest, whose summary holds the identity with its path, is told apart the same way and shown without it", () => {
    const old = (label: string, url: string): string => {
      const dir = withEndpoint(label, url);
      const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
      const { manifest: _m, ...rest } = summary;
      const spec = { model: "the-model", endpoint: url.replace("/chat/completions", ""), temperature: 0, enableThinking: false, timeoutMs: 600000 };
      writeFileSync(join(dir, "summary.json"), JSON.stringify({ ...rest, engine: { engine: "reflect", ...spec, engines: { reflect: spec } } }));
      return dir;
    };
    let message = "";
    try {
      compare(old("a", URL_A), old("b", URL_B), { treatment: ["config"] });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("the engine settings");
    expect(message).toContain("endpoint https://gateway.example (id ");
    expect(message).not.toMatch(/DUMMYSECRET|k-DUMMY|deployment-B/);
  });

  test("an old summary and a new one for the same deployment have the same engine", () => {
    const url = "https://gateway.example/deployment-A/v1/chat/completions";
    const fresh = withEndpoint("fresh", url);
    const summary = JSON.parse(readFileSync(join(fresh, "summary.json"), "utf8"));
    const { manifest: _m, ...rest } = summary;
    const spec = { model: "the-model", endpoint: "https://gateway.example/deployment-A/v1/chat/completions", temperature: 0, enableThinking: false, timeoutMs: 600000 };
    const old = join(tmp(), "old");
    cpSync(fresh, old, { recursive: true });
    writeFileSync(join(old, "summary.json"), JSON.stringify({ ...rest, engine: { engine: "reflect", ...spec, engines: { reflect: spec } } }));
    expect(() => compare(old, fresh, { treatment: ["config"] })).not.toThrow(/engine settings/);
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
    const parts = lockedParts(MEASUREMENT);
    expect(identity).toMatchObject({ manifest: true, akm_version: "0.9.99-test", akm_bin: "akm", strategy: "reflect-only", collector: `${parts.collector.version} ${parts.collector.sha256}`, scorer: `${parts.scorer.version} ${parts.scorer.sha256}`, harness_version: String(parts.harness_version), hints: null });
    expect(identity.config).toBe(configDigest(summary.config)); // the digest the earlier summaries get
    expect(identity.engine).toContain(endpointId("http://localhost:9/v1/chat/completions") as string);
    expect(identity.engine).not.toContain("localhost:9/v1");
  });

  test("with the manifest option the cases are compared one by one and the harness is the collector; without it, as scripts/matrix applies it, assets_sha256 and the digest of the code are compared", () => {
    const a = run({ label: "a", raw: GOOD });
    const b = withSummary(run({ label: "b", raw: GOOD }), { assets_sha256: "9".repeat(64), harness_sha256: "8".repeat(64) });
    const members = [member("A", a), member("B", b)];
    expect(checkMembers(members, [], { manifest: true }).mismatches).toEqual([]);
    expect(checkMembers(members, []).mismatches.map((f) => f.field).sort()).toEqual(["assets_sha256", "harness"]);
    // a member without a manifest keeps every field on its earlier rule
    const old = withSummary(run({ label: "c", raw: GOOD }), { manifest: undefined, harness_sha256: "7".repeat(64) });
    expect(checkMembers([member("A", a), member("B", old)], [], { manifest: true }).mismatches.map((f) => f.field)).toEqual(["harness"]);
  });
});
