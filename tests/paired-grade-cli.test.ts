import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const artifact = (pack: string) => ({
  pack,
  questions: 20,
  evidenceScored: 20,
  zeroHitRate: 0,
  evidenceRecallAt5: 0.8,
  retrieval: { precisionAtK: 0.5, recallAtK: 0.6, mrr: 0.7, ndcgAtK: 0.65 },
  guardTripped: 0,
  scoreSaturatedTopKRate: 1,
  identityPermutation: { rankingOrMetricDependent: false },
  probeContext: {
    evaluatorCommit: "a",
    evaluatorDirty: "false",
    bunVersion: "1",
    datasetSha256: "d",
    topK: 5,
    maxQuestions: 20,
    platform: "linux",
    arch: "x64",
    targetCommit: "published-or-unresolved",
    targetDirty: "false",
    akmCommand: '["akm"]',
  },
});

test("paired-grade CLI writes an inspectable verdict on a failing candidate", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-pair-cli-"));
  dirs.push(rootDir);
  const control = path.join(rootDir, "control");
  const candidate = path.join(rootDir, "candidate");
  fs.mkdirSync(control);
  fs.mkdirSync(candidate);
  for (const pack of ["locomo", "longmemeval"]) {
    fs.writeFileSync(path.join(control, `${pack}.json`), JSON.stringify(artifact(pack)));
    fs.writeFileSync(
      path.join(candidate, `${pack}.json`),
      JSON.stringify({ ...artifact(pack), guardTripped: 1 }),
    );
  }
  const out = path.join(candidate, "paired-verdict.json");
  const result = Bun.spawnSync(
    [
      "bun",
      "scripts/probes/paired-grade.ts",
      "--control",
      control,
      "--candidate",
      candidate,
      "--out",
      out,
    ],
    { cwd: root },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(fs.readFileSync(out, "utf8"))).toMatchObject({
    passed: false,
    mode: "paired-release",
    controlContexts: { evaluatorCommit: "a", targetCommit: "published-or-unresolved" },
    candidateContexts: { evaluatorCommit: "a", targetCommit: "published-or-unresolved" },
  });
  const verdict = JSON.parse(fs.readFileSync(out, "utf8"));
  expect(verdict.packs).toHaveLength(2);
  expect(verdict.packs[0].scoreSaturatedTopKRate).toEqual({ control: 1, candidate: 1 });
});
