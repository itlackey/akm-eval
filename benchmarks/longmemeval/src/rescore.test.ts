// scripts/rescore on a run of longmemeval: a run made by the pipeline (a fake akm, a fake model and a fake judge) is scored again from the raw
// output its rows hold, with no akm, no model and no judge. The checkout the scorer and the questions are read from is a small copy of this one,
// with the tiny dataset where the public one is fetched to.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { readManifest } from "../../../lib/manifest.ts";
import { RescoreError, readStored, rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { Akm } from "./akm.ts";
import type { Question } from "./dataset.ts";
import { fakeAkmScript, sandboxRunning, tinyDataset, writePublicAssets } from "./fakes.ts";
import { MEASUREMENT } from "./measurement.ts";
import { runCorpus } from "./run.ts";

const REPO = join(import.meta.dir, "..", "..", "..");
const dirs: string[] = [];
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
  server?.stop(true);
  server = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "lme-rescore-"));
  dirs.push(d);
  return d;
};

/** A model that reads the history it is given and a judge that compares the answer to the key. */
const fakeEndpoint = () =>
  Bun.serve({
    port: 0,
    async fetch(req) {
      const prompt = ((await req.json()) as { messages: { content: string }[] }).messages[0].content;
      const text = (() => {
        if (prompt.includes("Model Response:")) {
          const key = /Correct Answer: (.*)/.exec(prompt)?.[1];
          const response = /Model Response: (.*)/.exec(prompt)?.[1] ?? "";
          return key === undefined ? (response.includes("do not know") ? "yes" : "no") : response.includes(key) ? "yes" : "no";
        }
        if (prompt.includes("BLUE42")) return "BLUE42";
        if (prompt.includes("3 cats")) return "3";
        return "I do not know";
      })();
      return Response.json({ model: "fake-model", choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    },
  });

/** A checkout to score from: the code of lib/ and of this benchmark, the lock, and the dataset where the public one is read. */
function checkout(questions: Question[]): string {
  const root = tmp();
  const code = (src: string) => !/(^|[\\/])(node_modules|__pycache__|fixtures)([\\/]|$)|\.test\.ts$/.test(src);
  cpSync(join(REPO, "lib"), join(root, "lib"), { recursive: true, filter: code });
  cpSync(join(REPO, "benchmarks", "longmemeval", "src"), join(root, "benchmarks", "longmemeval", "src"), { recursive: true, filter: code });
  cpSync(join(REPO, "MEASUREMENT.lock"), join(root, "MEASUREMENT.lock"));
  writePublicAssets(join(root, "benchmarks", "longmemeval", "assets"), questions);
  return root;
}

/** A run of the tiny dataset with a model and a judge, written as run.ts writes it, in a results folder of its own. */
async function stored(): Promise<{ dir: string; root: string }> {
  const work = tmp();
  const assets = join(work, "assets");
  writePublicAssets(assets);
  const corpus: ResolvedCorpus = { name: "public", folder: assets, config: { kind: "public", private: false }, configFile: null, flag: "--corpus public" };
  server = fakeEndpoint();
  const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "fake-model" };
  const log = console.log;
  console.log = () => {};
  try {
    await runCorpus(corpus, { label: "t", sampleSeed: 1 }, { akm: new Akm(sandboxRunning(fakeAkmScript(work), dirs)), model: endpoint, judge: { ...endpoint, model: "fake-judge" }, version: "0.9.99-test" }, { results: join(work, "results") });
  } finally {
    console.log = log;
  }
  return { dir: join(work, "results", readdirSync(join(work, "results"))[0]), root: checkout(tinyDataset()) };
}

describe("scripts/rescore on a run of longmemeval", () => {
  test("scores a stored run again from its rows alone, gives the rows and the metrics it stored, and leaves the original as it was", async () => {
    const { dir, root } = await stored();
    const before = [readFileSync(join(dir, "summary.json"), "utf8"), readFileSync(join(dir, "samples.jsonl"), "utf8")];
    const { out, result } = rescoreFolder(dir, { root, now: new Date("2026-10-12T10:00:00Z") });
    expect(basename(out)).toBe(`${basename(dir)}-rescored`);
    expect([readFileSync(join(dir, "summary.json"), "utf8"), readFileSync(join(dir, "samples.jsonl"), "utf8")]).toEqual(before);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const original = JSON.parse(before[0]);
    const again = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"));
    expect(readFileSync(join(out, "samples.jsonl"), "utf8")).toBe(before[1]);
    for (const key of ["metrics", "n_run", "n_scored", "n_errored", "timeouts", "notes", "judge_undecidable", "observed_models", "observed_judge_models"]) expect(again[key], key).toEqual(original[key]);
    expect(again.label).toBe("t-rescored");
    // the manifest is the run's own, with the scorer of the checkout and where it was scored from
    const reading = readManifest(again);
    expect(reading.kind).toBe("manifest");
    const manifest = (reading as { manifest: any }).manifest;
    expect(manifest.collector).toEqual(original.manifest.collector);
    expect(manifest.rescored_from).toEqual({ results: basename(dir), scorer: original.manifest.scorer, at: "2026-10-12T10:00:00.000Z", dropped: [] });
    expect(manifest.completion).toEqual(original.manifest.completion);
    expect(manifest.cases).toEqual(original.manifest.cases);
  });

  test("a stored verdict is read again by the scorer of the checkout, with the same questions' labels", async () => {
    const { dir, root } = await stored();
    // as if an earlier scorer had read the judge's reply otherwise: the stored rows say correct where the verdict says no
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    rows[1].with_akm.correct = true; // the verdict of this arm is "no"
    expect(rows[1].with_akm.verdict).toBe("no");
    writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
    const { out, result } = rescoreFolder(dir, { root });
    expect(result.changed).toEqual([rows[1].id]);
    const again = readFileSync(join(out, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(again[1].with_akm).toMatchObject({ verdict: "no", correct: false });
    expect(JSON.parse(readFileSync(join(out, "summary.json"), "utf8")).metrics.accuracy.with_akm).toMatchObject({ n: 3, correct: 2 });
  });

  test("a run whose rows lack part of the raw output is refused, and the fields are named", async () => {
    const { dir, root } = await stored();
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const { finish_reason: _gone, ...arm } = rows[0].with_akm;
    rows[0].with_akm = arm;
    delete rows[2].retrieved_session_ids;
    writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
    let message = "";
    try {
      rescoreFolder(dir, { root });
    } catch (e) {
      expect(e).toBeInstanceOf(RescoreError);
      message = (e as Error).message;
    }
    expect(message).toContain("its rows lack the raw output the longmemeval scorer reads");
    expect(message).toContain("with_akm.finish_reason (1 row: q-secret)");
    expect(message).toContain("retrieved_session_ids (1 row: q-passport_abs)");
    expect(existsSync(join(dir, "..", `${basename(dir)}-rescored`))).toBe(false); // nothing was written
  });

  test("a run from before the manifest cannot be scored again, and says why", async () => {
    const { dir, root } = await stored();
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    const { manifest: _gone, ...legacy } = summary;
    writeFileSync(join(dir, "summary.json"), JSON.stringify(legacy));
    expect(() => rescoreFolder(dir, { root })).toThrow("was made before the manifest, and cannot be scored again: its rows name the question as `question_id`");
    expect(readStored(dir).rows).toHaveLength(3);
  });

  test("the questions of a custom corpus are read from the folder the summary names, and a public one from the benchmark's assets", async () => {
    const { root } = await stored();
    mkdirSync(join(root, "private", "longmemeval"), { recursive: true });
    const m = MEASUREMENT;
    // the public corpus is read from the benchmark's assets, whatever the summary says of a folder
    expect(m.loadCases(root, { corpus: "public" }).map((q) => q.question_id)).toEqual(["q-secret", "q-cats", "q-passport_abs"]);
    // a custom one from corpus_folder, which is relative to the repository root
    cpSync(join(root, "benchmarks", "longmemeval", "assets"), join(root, "private", "longmemeval", "assets"), { recursive: true });
    expect(m.loadCases(root, { corpus: "custom", corpus_folder: "private/longmemeval/assets" })).toHaveLength(3);
    expect(() => m.loadCases(root, { corpus: "custom", corpus_folder: null })).toThrow("does not say which folder holds its questions");
    expect(() => m.loadCases(root, { corpus: "custom", corpus_folder: "private/longmemeval/nowhere" })).toThrow("private/longmemeval/nowhere/longmemeval_s_cleaned.json is missing");
  });
});
