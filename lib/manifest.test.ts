import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESS_VERSION, type Measurement, REPO_ROOT, buildManifest, caseDigests, completionOf, corpusFolderOf, evalSettingsOf, loadMeasurement, manifestProblems, measuredEvals, readManifest } from "./manifest.ts";
import { sha256Json, sha256Text, withoutEngineSettings } from "./provenance.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A repository with an eval folder "toy" and no declaration yet. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "manifest-test-"));
  dirs.push(root);
  mkdirSync(join(root, "evals", "toy", "src"), { recursive: true });
  return root;
}

const TOY = { eval: "toy", version: "0.2" };
const toy: Pick<Measurement, "caseId" | "input" | "labels"> & { errored: (r: { bad?: boolean }) => boolean } = {
  caseId: (c: { id: string }) => c.id,
  input: (c: { id: string; text: string }, context?: unknown) => ({ text: c.text, context: context ?? null }),
  labels: (c: { id: string; want: string }) => ({ want: c.want }),
  errored: (r) => r.bad === true,
};

describe("the declarations of an eval", () => {
  test("are found by the file src/measurement.ts of an eval or a benchmark, and loaded again when the file changed", () => {
    const root = repo();
    expect(measuredEvals(root)).toEqual([]);
    expect(loadMeasurement("toy", root)).toBeNull();
    writeFileSync(join(root, "evals", "toy", "src", "measurement.ts"), 'export const MEASUREMENT = { eval: "toy", version: "0.1" };\n');
    expect(measuredEvals(root)).toEqual(["toy"]);
    expect(loadMeasurement("toy", root)?.version).toBe("0.1");
    writeFileSync(join(root, "evals", "toy", "src", "measurement.ts"), 'export const MEASUREMENT = { eval: "toy", version: "0.2" };\n');
    expect(loadMeasurement("toy", root)?.version).toBe("0.2");
    writeFileSync(join(root, "evals", "toy", "src", "measurement.ts"), 'export const MEASUREMENT = { eval: "other" };\n');
    expect(() => loadMeasurement("toy", root)).toThrow('must export MEASUREMENT with eval "toy"');
    mkdirSync(join(root, "benchmarks", "bench", "src"), { recursive: true });
    writeFileSync(join(root, "benchmarks", "bench", "src", "measurement.ts"), 'export const MEASUREMENT = { eval: "bench" };\n');
    expect(measuredEvals(root)).toEqual(["bench", "toy"]);
  });

  test("every eval declares a version", () => {
    for (const name of measuredEvals()) expect((loadMeasurement(name) as Measurement).version, name).toMatch(/\S/);
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
  const config = {
    configVersion: "0.9.0",
    registries: [{ url: "https://registry.example/path" }],
    defaults: { llmEngine: "m" },
    engines: { m: { kind: "llm", model: "the-model", endpoint: "https://gateway.example/k-DUMMYSECRET0123/v1/chat/completions", apiKey: "sk-literal", temperature: 0, enableThinking: false, timeoutMs: 600000 } },
  };
  const build = () =>
    buildManifest({
      measurement: TOY,
      corpus: "public",
      cases: caseDigests(toy, [{ id: "a", text: "t", want: "w" } as never]),
      akm: { version: "0.9.26", bin: "akm" },
      config,
      settings: { strategy: "s", config_patch_sha256: sha256Text("p"), timeout_ms: 5000, seed: "42" },
      eval_settings: { embedder: "real" },
      completion: { selected: ["a"], scored: ["a"], errored: [] },
    });

  test("is sound and holds the version, the akm, the settings and the hints", () => {
    const m = build();
    expect(manifestProblems(m)).toEqual([]);
    expect(m).toMatchObject({ manifest_version: 1, eval: "toy", corpus: "public", collection: null, mode: null, harness_version: HARNESS_VERSION, akm: { version: "0.9.26", bin: "akm", build: null, build_fingerprint: null }, settings: { strategy: "s", config_patch_sha256: sha256Text("p"), timeout_ms: 5000, seed: "42" }, eval_settings: { embedder: "real" } });
    expect(m.collector).toEqual({ version: "0.2" });
    expect(m.scorer).toEqual({ version: "0.2" });
  });

  test("a manifest from before 0.7.1, with treatment_hints in place of eval_settings, is sound and read under the current name", () => {
    const { eval_settings, ...m } = build();
    const old = { ...m, treatment_hints: eval_settings };
    expect(manifestProblems(old)).toEqual([]);
    const read = readManifest({ eval: "toy", corpus: "public", manifest: old });
    expect(read.kind).toBe("manifest");
    if (read.kind !== "manifest") return;
    expect(read.manifest.eval_settings).toEqual({ embedder: "real" });
    expect(read.manifest).not.toHaveProperty("treatment_hints");
    expect(old).toHaveProperty("treatment_hints"); // the saved object is left as it is
    expect([evalSettingsOf(old), evalSettingsOf(build()), evalSettingsOf(undefined)]).toEqual([{ embedder: "real" }, { embedder: "real" }, null]);
    expect(build()).not.toHaveProperty("treatment_hints"); // nothing writes the old name
  });

  test("a scoring-only revision preserves the collector version", () => {
    const m = buildManifest({ measurement: { ...TOY, scoringVersion: "0.3" }, corpus: "public", cases: {}, completion: { selected: [], scored: [], errored: [] } });
    expect(m.collector).toEqual({ version: "0.2" });
    expect(m.scorer).toEqual({ version: "0.3" });
    expect(manifestProblems(m)).toEqual([]);
  });

  test("keeps the config redacted and without the model's settings, with its digest, and the engines with <MODEL_BASE_URL> as their endpoint (#65)", () => {
    const m = build();
    expect(m.config.redacted).toEqual(withoutEngineSettings(m.config.redacted));
    expect(m.config.sha256).toBeUndefined();
    expect(m.engines.m).toEqual({ model: "the-model", endpoint: "<MODEL_BASE_URL>", temperature: 0, enableThinking: false, timeoutMs: 600000 });
    const text = JSON.stringify(m);
    for (const secret of ["sk-literal", "DUMMYSECRET0123", "gateway.example"]) expect(text).not.toContain(secret);
  });

  test("names no host in the config it keeps, whichever field holds an endpoint", () => {
    const withEmbedding = { ...config, embedding: { provider: "openai", endpoint: "https://embed.example.test/v1/embeddings", model: "e" } };
    const m = buildManifest({ measurement: TOY, corpus: "public", cases: {}, config: withEmbedding, completion: { selected: [], scored: [], errored: [] } });
    expect((m.config.redacted as any).embedding.endpoint).toBe("<MODEL_BASE_URL>/v1/embeddings");
    expect(JSON.stringify(m)).not.toMatch(/embed\.example|gateway\.example/);
    expect(manifestProblems(m)).toEqual([]);
  });

  test("a config without engines gives none, and a run with no config has no digest of it", () => {
    const none = buildManifest({ measurement: TOY, corpus: "public", cases: {}, completion: { selected: [], scored: [], errored: [] } });
    expect(none).toMatchObject({ config: { redacted: null }, engines: {}, akm: { version: null }, settings: { strategy: null } });
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
    expect(mutate((x) => (x.collector.version = ""))).toEqual(["collector needs a version"]);
    expect(mutate((x) => (x.collector.sha256 = "short"))).toEqual(["collector needs a version"]); // a digest, when an older manifest has one, is a digest
    expect(mutate((x) => (x.scorer = { version: "0.1", sha256: "a".repeat(64) }))).toEqual([]); // older manifests also name the scorer
    expect(mutate((x) => (x.scorer = { version: 1 }))).toEqual(["scorer, when there is one, needs a version"]);
    expect(mutate((x) => (x.rescored_from = { results: "folder", scorer: { version: 1 }, at: "now", dropped: [] }))).toEqual(["rescored_from needs results (a folder name), scorer (or null), at and dropped"]);
    expect(mutate((x) => (x.rescored_from = { results: "folder", scorer: { version: "0.3", sha256: "a".repeat(64) }, at: "now", dropped: [] }))).toEqual([]);

    expect(mutate((x) => (x.engines.m.endpoint = "https://gateway.example/k-DUMMYSECRET0123/v1"))).toEqual(["the engine m needs a model and an endpoint that is <MODEL_BASE_URL> (or, in an older manifest, a host with no path)"]);
    expect(mutate((x) => (x.engines.m.endpoint = "https://user:pw@gateway.example"))).toHaveLength(1);
    expect(mutate((x) => (x.engines.m.endpoint_sha256 = "a".repeat(64)))).toEqual([]);
    expect(mutate((x) => (x.engines.m.endpoint_sha256 = "short"))).toEqual(["the engine m has an endpoint_sha256 that is not a digest"]);
    expect(mutate((x) => (x.completion.scored = ["a", "zzz"]))).toEqual(["completion.scored and completion.errored name a case that was not selected"]);
    expect(mutate((x) => (x.completion.errored = ["a"]))).toEqual(["a case is both scored and errored"]);

    expect(mutate((x) => (x.eval_settings = { embedder: ["real"] }))).toEqual(["eval_settings is an object of strings, numbers, booleans and nulls"]);
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

describe("the folder of a custom corpus", () => {
  test("is recorded from the repository root when it is inside, with forward slashes, and is null for a folder outside it, never an absolute path", () => {
    const root = "/work/a checkout/key-akm-eval";
    expect(corpusFolderOf("/work/a checkout/key-akm-eval/private/reflect/assets", root)).toBe("private/reflect/assets");
    expect(corpusFolderOf("private/reflect/assets", root)).toBe("private/reflect/assets"); // a relative folder is from the root, as --cases is
    expect(corpusFolderOf("./notes//mine/", root)).toBe("notes/mine");
    expect(corpusFolderOf("a/../b", root)).toBe("b");
    expect(corpusFolderOf("/work/a checkout/key-akm-eval-copy/notes", root)).toBeNull(); // a sibling whose name starts like the root
    expect(corpusFolderOf("/home/user/notes", root)).toBeNull();
    expect(corpusFolderOf("../notes", root)).toBeNull();
    expect(corpusFolderOf("..", root)).toBeNull();
    expect(corpusFolderOf("/work/a checkout/key-akm-eval", root)).toBeNull(); // the repository itself is no corpus folder
    expect(corpusFolderOf("..notes/x", root)).toBe("..notes/x"); // a name that starts with two dots is inside
    expect(corpusFolderOf(join(REPO_ROOT, "private", "x"))).toBe("private/x");
  });
});
