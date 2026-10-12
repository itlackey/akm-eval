import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { REPO_ROOT, corpusFolderOf, manifestProblems } from "../../../lib/manifest.ts";
import { clearRunning } from "../../../lib/results.ts";
import { RescoreError, readStored, rescoreRun } from "../../../scripts/rescore/src/lib.ts";
import { FAKE_AKM } from "./fakes.ts";
import { runCorpus } from "./run.ts";

// A run on a custom corpus is scored again from the folder the summary records (`corpus_folder`), or from the one scripts/rescore is given with
// --cases. The fake akm answers; the scorer and the cases are the real ones.

const dirs: string[] = [];
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_PLAN: process.env.FAKE_PLAN, FAKE_LOG: process.env.FAKE_LOG, MODEL_API_KEY: process.env.MODEL_API_KEY };
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const MEMORY = "---\ndescription: Retry policy.\n---\n\nOn 2026-03-04 we found that retries back off at 2 seconds. After 3 failures the job parks.\n";
const DERIVED = "---\ninferred: true\ndescription: Retries back off at two seconds.\ntags:\n  - retry\n  - backoff\n  - queue\nsearchHints:\n  - retry delay\n  - backoff seconds\n  - job parks\ntitle: Retry backoff\n---\n\n# Retry backoff\n\nRetries wait 2 seconds on 2026-03-04.\n";
const POOL = { "memories/signed.md": "---\ndescription: Signing.\n---\nArtifacts are signed.\n", "memories/other.md": "---\ndescription: Other.\n---\nSomething current.\n" };
const CASES = (required: string[]) => [
  { id: "infer", process: "memory-inference", files: ["memories/retry.md"], expected: { required, date: "2026-03-04" } },
  { id: "promote", process: "consolidate-promote", files: Object.keys(POOL), expected: { promote: ["memories/signed"], strict: true } },
];

/** A corpus folder in `parent`, a fake akm and a results folder, and a custom run on it. The fake derives the memory and plans the one promotion. */
async function customRun(parent: string, required = ["retries", "2 seconds"]) {
  const root = mkdtempSync(join(tmpdir(), "bakeoff-rescore-"));
  dirs.push(root);
  const folder = join(parent, "corpus");
  mkdirSync(join(folder, "memories"), { recursive: true });
  for (const [path, text] of Object.entries({ "memories/retry.md": MEMORY, ...POOL })) writeFileSync(join(folder, path), text);
  writeFileSync(join(folder, "cases.json"), JSON.stringify(CASES(required)));
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  process.env.AKM_BIN = commandLine(["bun", script]);
  process.env.FAKE_PLAN = JSON.stringify({ infer: { retry: { derived: DERIVED } }, promote: { refs: ["memories/signed"] } });
  process.env.FAKE_LOG = join(root, "calls.jsonl");
  process.env.MODEL_API_KEY = "model-secret";
  const corpus: ResolvedCorpus = { name: "custom", folder, config: { kind: "own", private: true }, configFile: null, flag: `--cases ${folder}` };
  const log = console.log;
  console.log = () => {};
  try {
    const summary = await runCorpus(corpus, { baseUrl: "http://localhost:9/v1", model: "the-model", hasKey: true, version: "0.9.99-test", label: "t" }, join(root, "results"));
    clearRunning(summary.results_dir); // the process lives on, so the marker of the finished run would stay, and rescore refuses a folder that holds one
    return { summary, folder, root };
  } finally {
    console.log = log;
  }
}

/** A folder inside the repository that no other file is in, for a custom corpus the summary can name by its path from the root. Removed after the test. */
function insideRepository(): string {
  const dir = mkdtempSync(join(REPO_ROOT, "evals", "bakeoff", ".test-corpus-"));
  dirs.push(dir);
  return dir;
}

const outside = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "bakeoff-outside-"));
  dirs.push(dir);
  return dir;
};

describe("a custom run is scored again from its corpus_folder", () => {
  test("a corpus inside the repository is recorded by its path from the root, and its run is rescored from it with the same rows", async () => {
    const parent = insideRepository();
    const { summary, folder } = await customRun(parent);
    expect(summary.corpus).toBe("custom");
    expect(summary.corpus_folder).toBe(corpusFolderOf(folder));
    expect(summary.corpus_folder).toMatch(/^evals\/bakeoff\/\.test-corpus-[^/]+\/corpus$/);
    // the summary names the corpus by its path from the root, never by an absolute one
    const text = readFileSync(join(summary.results_dir, "summary.json"), "utf8") + readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8");
    expect(text).not.toContain(folder);
    expect(text).not.toContain(REPO_ROOT);
    const done = rescoreRun(readStored(summary.results_dir));
    expect(done.changed).toEqual([]);
    expect(done.dropped).toEqual([]);
    expect(done.rows.map((r) => [r.id, r.correct])).toEqual([["infer", true], ["promote", true]]);
    expect(done.summary.corpus_folder).toBe(summary.corpus_folder);
    expect(manifestProblems(done.summary.manifest)).toEqual([]);
    expect(done.summary.manifest.rescored_from).toMatchObject({ results: summary.results_dir.split("/").pop() });
  });

  test("a label changed in that folder since the run is picked up: the row changes and the case is named as relabelled", async () => {
    const parent = insideRepository();
    const { summary, folder } = await customRun(parent);
    writeFileSync(join(folder, "cases.json"), JSON.stringify(CASES(["retries", "2 seconds", "a term the derived memory never had"])));
    const done = rescoreRun(readStored(summary.results_dir));
    expect(done.relabelled).toEqual(["infer"]);
    expect(done.changed).toEqual(["infer"]);
    expect(done.rows.map((r) => [r.id, r.correct])).toEqual([["infer", false], ["promote", true]]);
  });

  test("a folder that has been taken away is refused with the way to name it", async () => {
    const parent = insideRepository();
    const { summary, folder } = await customRun(parent);
    rmSync(folder, { recursive: true });
    expect(() => rescoreRun(readStored(summary.results_dir))).toThrow(new RescoreError(`${summary.results_dir} was made on the custom corpus in ${summary.corpus_folder}, which is not a folder here. Put it back, or give scripts/rescore its place with --cases DIR`));
  });
});

describe("a custom run on a folder outside the repository is rescored with --cases", () => {
  test("the summary records no folder, and rescore refuses until it is told one", async () => {
    const { summary } = await customRun(outside());
    expect(summary.corpus_folder).toBeNull();
    expect(() => rescoreRun(readStored(summary.results_dir))).toThrow(RescoreError);
    expect(() => rescoreRun(readStored(summary.results_dir))).toThrow(/made on a custom corpus outside the repository, so the folder of its cases is not known here\. Give it to scripts\/rescore with --cases DIR/);
  });

  test("--cases names the folder, and the rescored summary still records none", async () => {
    const { summary, folder } = await customRun(outside());
    const done = rescoreRun(readStored(summary.results_dir), { cases: folder });
    expect(done.changed).toEqual([]);
    expect(done.rows.map((r) => [r.id, r.correct])).toEqual([["infer", true], ["promote", true]]);
    expect(done.summary.corpus_folder).toBeNull(); // the folder is outside the repository, so it is not written
    expect(JSON.stringify(done.summary)).not.toContain(folder);
  });

  test("--cases also gives the place of a corpus that has moved, and a folder with other labels scores the run against them", async () => {
    const { summary, folder } = await customRun(outside());
    const moved = outside();
    mkdirSync(join(moved, "memories"));
    for (const [path, text] of Object.entries({ "memories/retry.md": MEMORY, ...POOL })) writeFileSync(join(moved, path), text);
    writeFileSync(join(moved, "cases.json"), JSON.stringify(CASES(["retries", "a term the derived memory never had"])));
    const done = rescoreRun(readStored(summary.results_dir), { cases: moved });
    expect(done.relabelled).toEqual(["infer"]);
    expect(done.rows.map((r) => [r.id, r.correct])).toEqual([["infer", false], ["promote", true]]);
    expect(folder).not.toBe(moved);
  });
});

describe("a run of the Python bakeoff", () => {
  test("is legacy and cannot be rescored, whatever corpus it names", () => {
    const root = mkdtempSync(join(tmpdir(), "bakeoff-legacy-"));
    dirs.push(root);
    for (const corpus of ["public", "private"]) {
      const dir = join(root, corpus);
      mkdirSync(dir);
      writeFileSync(join(dir, "summary.json"), JSON.stringify({ eval: "bakeoff", corpus, prompts_version: "0.9.15-style", models: [] }));
      writeFileSync(join(dir, "samples.jsonl"), `${JSON.stringify({ case_id: "consolidate-memory-pool", output: "{}" })}\n`);
      expect(() => rescoreRun(readStored(dir))).toThrow("was made before the manifest, and cannot be scored again: it is a result of the Python bakeoff");
    }
  });
});
