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
  writePublicAssets(join(root, "benchmarks", "longmemeval", "assets"), questions);
  return root;
}

/**
 * A run of the tiny dataset with a model and a judge, written as run.ts writes it, in a results folder of its own. On the public corpus, or
 * on a custom corpus of your own (`own`), whose folder is outside the repository and so is not recorded.
 */
async function stored(on: "public" | "own" = "public"): Promise<{ dir: string; root: string }> {
  const work = tmp();
  const assets = join(work, "assets");
  writePublicAssets(assets);
  const corpus: ResolvedCorpus = on === "public" ? { name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" } : { name: "custom", folder: assets, rewrite: false, seed: null, flag: `--cases ${assets}` };
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
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
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

  test("a run from before an empty answer was kept from the judge is scored again to the new verdict, and the summary counts the empty and cut-off answers (#62)", async () => {
    const { dir, root } = await stored();
    // as an earlier run stored them: the reader returned nothing and the judge said yes to it, and another answer was cut off
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    Object.assign(rows[0].without_akm, { hypothesis: "", verdict: "yes", correct: true, decidable: true, completion_tokens: 0 });
    rows[1].with_akm.finish_reason = "length";
    writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
    const { answers_cut_off: _cut, answers_empty: _empty, ...before } = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")); // as that run's summary had it: no counts
    writeFileSync(join(dir, "summary.json"), JSON.stringify(before));
    expect(before.metrics.accuracy.without_akm).toMatchObject({ n: 3, correct: 3 });
    const { out, result } = rescoreFolder(dir, { root });
    expect(result.changed).toEqual([rows[0].id]);
    const again = readFileSync(join(out, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(again[0].without_akm).toMatchObject({ ok: true, hypothesis: "", verdict: "yes", correct: false, decidable: null });
    const summary = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"));
    expect(summary.metrics.accuracy.without_akm).toMatchObject({ n: 3, correct: 2 });
    expect(summary).toMatchObject({ answers_empty: { without_akm: 1, with_akm: 0 }, answers_cut_off: { without_akm: 0, with_akm: 1 } });
    expect(summary.notes).toContainEqual(expect.stringContaining("1 of 6 answers stopped at the token limit (finish_reason length), and 1 had no text left for the judge"));
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

  test("a run on a custom corpus is scored again from the folder its summary records, or from the one --cases names", async () => {
    const { dir, root } = await stored("own");
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    // the run recorded the kind and that its folder, which is outside the repository, is not recorded
    expect(summary).toMatchObject({ corpus: "custom", corpus_folder: null });
    expect(() => rescoreFolder(dir, { root })).toThrow("was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts/rescore with --cases DIR");
    // --cases names the folder, and the result says where the cases were read from this time
    cpSync(join(root, "benchmarks", "longmemeval", "assets"), join(root, "private", "longmemeval", "own"), { recursive: true });
    const named = rescoreFolder(dir, { root, cases: "private/longmemeval/own" });
    expect(named.result).toMatchObject({ changed: [], dropped: [] });
    expect(JSON.parse(readFileSync(join(named.out, "summary.json"), "utf8"))).toMatchObject({ corpus: "custom", corpus_folder: "private/longmemeval/own", n_scored: 3 });
    // a run that recorded its folder (one inside the repository) needs no --cases, and its labels are those of that folder: a key changed there is seen
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ ...summary, corpus_folder: "private/longmemeval/own" }));
    writePublicAssets(join(root, "private", "longmemeval", "own"), tinyDataset().map((q, i) => (i === 0 ? { ...q, answer_session_ids: ["filler_0"] } : q)));
    const recorded = rescoreFolder(dir, { root });
    expect(recorded.result.relabelled).toEqual(["q-secret"]);
    expect(recorded.result.changed).toEqual(["q-secret"]); // akm returned answer_1, which is no longer the evidence
    expect(JSON.parse(readFileSync(join(recorded.out, "summary.json"), "utf8")).corpus_folder).toBe("private/longmemeval/own");
    // a folder that is not there is named
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ ...summary, corpus_folder: "private/longmemeval/moved" }));
    expect(() => rescoreFolder(dir, { root })).toThrow("was made on the custom corpus in private/longmemeval/moved, which is not a folder here");
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
    // a summary from before the corpora were renamed (`private`) has the rewrite where generate-assets puts it
    expect(m.loadCases(root, { corpus: "private" })).toHaveLength(3);
    expect(() => m.loadCases(root, { corpus: "custom", corpus_folder: null })).toThrow("does not say which folder holds its questions");
    expect(() => m.loadCases(root, { corpus: "own" })).toThrow("does not say which folder holds its questions");
    expect(() => m.loadCases(root, { corpus: "custom", corpus_folder: "private/longmemeval/nowhere" })).toThrow("private/longmemeval/nowhere/longmemeval_s_cleaned.json is missing");
  });
});
