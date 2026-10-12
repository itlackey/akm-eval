import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Measurement, REPO_ROOT, buildManifest, caseDigests, completionOf, loadMeasurement, lockedParts, manifestProblems, measuredEvals, measuredFiles, partSha256, readLock, readManifest } from "./manifest.ts";
import { endpointId, sha256Json, sha256Text, withoutEngineSettings } from "./provenance.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A repository with two files, a lock that names an eval "toy" and a declaration for it. */
function repo(lock: object = { lock_version: 1, harness_version: 3, evals: {} }): string {
  const root = mkdtempSync(join(tmpdir(), "manifest-test-"));
  dirs.push(root);
  mkdirSync(join(root, "evals", "toy", "src"), { recursive: true });
  writeFileSync(join(root, "evals", "toy", "src", "collect.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "evals", "toy", "src", "score.ts"), "export const b = 1;\n");
  writeFileSync(join(root, "MEASUREMENT.lock"), JSON.stringify(lock));
  return root;
}
const PART = { version: 2, sha256: "a".repeat(64), files: ["x.ts"] };

const TOY = { eval: "toy", collector: ["evals/toy/src/collect.ts"], scorer: ["evals/toy/src/score.ts"] };
const toy: Pick<Measurement, "caseId" | "input" | "labels"> & { errored: (r: { bad?: boolean }) => boolean } = {
  caseId: (c: { id: string }) => c.id,
  input: (c: { id: string; text: string }, context?: unknown) => ({ text: c.text, context: context ?? null }),
  labels: (c: { id: string; want: string }) => ({ want: c.want }),
  errored: (r) => r.bad === true,
};

describe("the digests of a part", () => {
  test("a part is the digest of its files by path and content, whatever the order, and a missing file, a path outside or a file in both parts is named", () => {
    const root = repo();
    const one = partSha256(["evals/toy/src/collect.ts", "evals/toy/src/score.ts"], root);
    expect(partSha256(["evals/toy/src/score.ts", "evals/toy/src/collect.ts"], root)).toBe(one);
    expect(partSha256(["evals/toy/src/collect.ts"], root)).not.toBe(one);
    writeFileSync(join(root, "evals", "toy", "src", "collect.ts"), "export const a = 2;\n");
    expect(partSha256(["evals/toy/src/collect.ts", "evals/toy/src/score.ts"], root)).not.toBe(one);
    expect(() => partSha256(["evals/toy/src/gone.ts"], root)).toThrow("evals/toy/src/gone.ts is listed in a measurement and does not exist");
    expect(() => partSha256(["../outside.ts"], root)).toThrow("is named from the repository root, with forward slashes");
    expect(() => partSha256([join(root, "evals/toy/src/score.ts")], root)).toThrow("is named from the repository root");
    expect(() => partSha256(["evals/toy/src/score.ts", "evals/toy/src/score.ts"], root)).toThrow("is listed twice");
    expect(() => partSha256([], root)).toThrow("needs at least one file");
    expect(() => measuredFiles({ eval: "toy", collector: ["a.ts"], scorer: ["a.ts", "b.ts"] })).toThrow("toy: a.ts is in both the collector and the scorer");
  });

  test("the same files in another checkout give the same digest", () => {
    expect(partSha256(["evals/toy/src/collect.ts"], repo())).toBe(partSha256(["evals/toy/src/collect.ts"], repo()));
  });
});

describe("the lock", () => {
  test("gives a run the versions of the lock and the digests of the files now, and refuses an eval it has no entry for", () => {
    const root = repo({ lock_version: 1, harness_version: 3, evals: { toy: { collector: { ...PART, version: 4 }, scorer: { ...PART, version: 7 } } } });
    const parts = lockedParts(TOY, root);
    expect(parts).toEqual({ collector: { version: 4, sha256: partSha256(TOY.collector, root) }, scorer: { version: 7, sha256: partSha256(TOY.scorer, root) }, harness_version: 3 });
    expect(() => lockedParts({ ...TOY, eval: "other" }, root)).toThrow('MEASUREMENT.lock has no entry for other. Add it with: scripts/measurement/run bump other collector --reason "first lock entry"');
  });

  test("says what is wrong with a lock that is missing, broken or incomplete", () => {
    const missing = repo();
    rmSync(join(missing, "MEASUREMENT.lock"));
    expect(() => readLock(missing)).toThrow("MEASUREMENT.lock is missing");
    const broken = repo();
    writeFileSync(join(broken, "MEASUREMENT.lock"), "nope");
    expect(() => readLock(broken)).toThrow("is not valid JSON");
    expect(() => readLock(repo({ lock_version: 2, harness_version: 3, evals: {} }))).toThrow("is not a lock");
    expect(() => readLock(repo({ lock_version: 1, harness_version: 3, evals: { toy: { collector: PART } } }))).toThrow("has a bad entry for toy");
  });

  test("the lock of this repository names the harness version and an entry for reflect", () => {
    const lock = readLock(REPO_ROOT);
    expect(lock.harness_version).toBeGreaterThanOrEqual(3);
    expect(lock.evals.reflect?.collector.version).toBeGreaterThanOrEqual(1);
  });
});

describe("the declarations of an eval", () => {
  test("are found by the file src/measurement.ts of an eval or a benchmark, and loaded again when the file changed", () => {
    const root = repo();
    expect(measuredEvals(root)).toEqual([]);
    expect(loadMeasurement("toy", root)).toBeNull();
    writeFileSync(join(root, "evals", "toy", "src", "measurement.ts"), 'export const MEASUREMENT = { eval: "toy", collector: ["a"] };\n');
    expect(measuredEvals(root)).toEqual(["toy"]);
    expect(loadMeasurement("toy", root)?.collector).toEqual(["a"]);
    writeFileSync(join(root, "evals", "toy", "src", "measurement.ts"), 'export const MEASUREMENT = { eval: "toy", collector: ["b"] };\n');
    expect(loadMeasurement("toy", root)?.collector).toEqual(["b"]);
    writeFileSync(join(root, "evals", "toy", "src", "measurement.ts"), 'export const MEASUREMENT = { eval: "other" };\n');
    expect(() => loadMeasurement("toy", root)).toThrow('must export MEASUREMENT with eval "toy"');
    mkdirSync(join(root, "benchmarks", "bench", "src"), { recursive: true });
    writeFileSync(join(root, "benchmarks", "bench", "src", "measurement.ts"), 'export const MEASUREMENT = { eval: "bench" };\n');
    expect(measuredEvals(root)).toEqual(["bench", "toy"]);
  });

  test("reflect declares its collector and its scorer, in two lists with no file in both", () => {
    const m = loadMeasurement("reflect") as Measurement;
    expect(m.eval).toBe("reflect");
    expect(m.scorer).toEqual(["evals/reflect/src/score.ts"]);
    expect(m.collector).toContain("evals/reflect/src/collect.ts");
    expect(() => measuredFiles(m)).not.toThrow();
    expect(() => lockedParts(m)).not.toThrow();
  });
});

describe("the case digests and the completion", () => {
  const cases = [{ id: "a", text: "note a", want: "x" }, { id: "b", text: "note b", want: "y" }];

  test("digest what a case presents and what it is judged by apart, so a changed label is no changed input", () => {
    const base = caseDigests(toy, cases);
    expect(base.a).toEqual({ input_sha256: sha256Json({ text: "note a", context: null }), label_sha256: sha256Json({ want: "x" }) });
    const relabelled = caseDigests(toy, [{ ...(cases[0] as object), want: "z" } as (typeof cases)[0], cases[1] as (typeof cases)[0]]);
    expect(relabelled.a?.input_sha256).toBe(base.a?.input_sha256);
    expect(relabelled.a?.label_sha256).not.toBe(base.a?.label_sha256);
    expect(relabelled.b).toEqual(base.b);
    const edited = caseDigests(toy, [{ ...(cases[0] as object), text: "other" } as (typeof cases)[0], cases[1] as (typeof cases)[0]]);
    expect(edited.a?.input_sha256).not.toBe(base.a?.input_sha256);
    expect(edited.a?.label_sha256).toBe(base.a?.label_sha256);
  });

  test("take what a run adds to a case's input for that case only", () => {
    const base = caseDigests(toy, cases);
    const searched = caseDigests(toy, cases, (c) => (c.id === "a" ? ["q"] : undefined));
    expect(searched.a?.input_sha256).not.toBe(base.a?.input_sha256);
    expect(searched.b).toEqual(base.b);
  });

  test("a case twice in the corpus is refused", () => {
    expect(() => caseDigests(toy, [...cases, cases[0] as (typeof cases)[0]])).toThrow("the case a is twice in the corpus");
  });

  test("the completion lists the selected cases in order, and those scored and errored of the ones that ran", () => {
    expect(completionOf(toy, ["a", "b", "c"], [{ id: "c" }, { id: "a", bad: true }] as { id: string; bad?: boolean }[])).toEqual({ selected: ["a", "b", "c"], scored: ["c"], errored: ["a"] });
  });
});

describe("the manifest", () => {
  /** A repository for each test, since the folder of a test is removed when it ends. */
  let root = "";
  beforeEach(() => {
    root = repo({ lock_version: 1, harness_version: 3, evals: { toy: { collector: PART, scorer: PART } } });
  });
  const config = {
    configVersion: "0.9.0",
    registries: [{ url: "https://user:pw@registry.example/path?token=abc" }],
    defaults: { llmEngine: "m" },
    engines: { m: { kind: "llm", model: "the-model", endpoint: "https://gateway.example/k-DUMMYSECRET0123/v1/chat/completions", apiKey: "sk-literal", temperature: 0, enableThinking: false, timeoutMs: 600000 } },
  };
  const build = () =>
    buildManifest({
      measurement: TOY,
      parts: lockedParts(TOY, root),
      corpus: "public",
      cases: caseDigests(toy, [{ id: "a", text: "t", want: "w" } as never]),
      akm: { version: "0.9.26", bin: "akm" },
      config,
      settings: { strategy: "s", config_patch_sha256: sha256Text("p"), timeout_ms: 5000, seed: "42" },
      treatment_hints: { embedder: "real" },
      completion: { selected: ["a"], scored: ["a"], errored: [] },
    });

  test("is sound and holds the parts, the akm, the settings and the hints", () => {
    const m = build();
    expect(manifestProblems(m)).toEqual([]);
    expect(m).toMatchObject({ manifest_version: 1, eval: "toy", corpus: "public", collection: null, mode: null, harness_version: 3, akm: { version: "0.9.26", bin: "akm", build: null, build_fingerprint: null }, settings: { strategy: "s", config_patch_sha256: sha256Text("p"), timeout_ms: 5000, seed: "42" }, treatment_hints: { embedder: "real" } });
    expect(m.collector).toEqual({ version: 2, sha256: partSha256(TOY.collector, root) });
    expect(m.scorer.version).toBe(2);
  });

  test("keeps the config redacted and without the model's settings, with its digest, and the engines with a host and a digest and no path (#65)", () => {
    const m = build();
    expect(m.config.redacted).toEqual(withoutEngineSettings(m.config.redacted));
    expect(m.config.sha256).toBe(sha256Json(m.config.redacted));
    expect(m.engines.m).toEqual({ model: "the-model", endpoint: "https://gateway.example", endpoint_id: endpointId("https://gateway.example/k-DUMMYSECRET0123/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600000 });
    const text = JSON.stringify(m);
    for (const secret of ["sk-literal", "DUMMYSECRET0123", "pw@", "token=abc"]) expect(text).not.toContain(secret);
  });

  test("a config without engines gives none, and a run with no config has no digest of it", () => {
    const none = buildManifest({ measurement: TOY, parts: lockedParts(TOY, root), corpus: "public", cases: {}, completion: { selected: [], scored: [], errored: [] } });
    expect(none).toMatchObject({ config: { sha256: null, redacted: null }, engines: {}, akm: { version: null }, settings: { strategy: null } });
    expect(manifestProblems(none)).toEqual([]);
  });

  test("the validator names what is wrong, and a path in an endpoint is one of them", () => {
    const m = build();
    const mutate = (f: (x: any) => void): string[] => {
      const copy = JSON.parse(JSON.stringify(m));
      f(copy);
      return manifestProblems(copy);
    };
    expect(manifestProblems(null)).toEqual(["the manifest is not an object"]);
    expect(mutate((x) => (x.manifest_version = 2))).toEqual(["manifest_version is 2, and this harness reads 1"]);
    expect(mutate((x) => (x.collector.sha256 = "short"))).toEqual(["collector needs a version and a sha256 digest"]);
    expect(mutate((x) => (x.cases.a.input_sha256 = null))).toEqual(["the case a needs an input_sha256 and a label_sha256"]);
    expect(mutate((x) => (x.engines.m.endpoint = "https://gateway.example/k-DUMMYSECRET0123/v1"))).toEqual(["the engine m needs a model, an endpoint that is a host with no path, and an endpoint_id digest"]);
    expect(mutate((x) => (x.engines.m.endpoint = "https://user:pw@gateway.example"))).toHaveLength(1);
    expect(mutate((x) => (x.completion.scored = ["a", "zzz"]))).toEqual(["completion.scored and completion.errored name a case that was not selected"]);
    expect(mutate((x) => (x.completion.errored = ["a"]))).toEqual(["a case is both scored and errored"]);
    expect(mutate((x) => (x.completion.selected = ["a", "nope"]))).toEqual(["completion.selected names a case that cases does not hold"]);
    expect(mutate((x) => (x.treatment_hints = { embedder: ["real"] }))).toEqual(["treatment_hints is an object of strings, numbers, booleans and nulls"]);
    expect(mutate((x) => (x.rescored_from = { results: "a/b", scorer: null, at: "now", dropped: [] }))).toEqual(["rescored_from needs results (a folder name), scorer (or null), at and dropped"]);
    expect(mutate((x) => (x.rescored_from = { results: "folder", scorer: null, at: "now", dropped: [] }))).toEqual([]);
    expect(mutate((x) => (x.settings.timeout_ms = "soon")).join()).toContain("settings needs strategy");
  });

  test("a summary is read as a manifest, as legacy when it has none, and as invalid when its manifest is not sound or disagrees with it", () => {
    const m = build();
    expect(readManifest({ eval: "toy", corpus: "public", manifest: m })).toEqual({ kind: "manifest", manifest: m });
    expect(readManifest({ eval: "toy", corpus: "public" })).toEqual({ kind: "legacy" });
    expect(readManifest({ eval: "toy", corpus: "public", manifest: { ...m, harness_version: "x" } })).toMatchObject({ kind: "invalid" });
    expect(readManifest({ eval: "toy", corpus: "private", manifest: m })).toEqual({ kind: "invalid", problems: ['the manifest says corpus is "public" and the summary says "private"'] });
    expect(readManifest({ eval: "other", manifest: m })).toMatchObject({ kind: "invalid" });
    expect(readManifest({ manifest: m })).toEqual({ kind: "manifest", manifest: m }); // a summary that leaves a field out is not contradicted by it
  });
});
