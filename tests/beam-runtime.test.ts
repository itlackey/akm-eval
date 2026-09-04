import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  aggregateBeamScores,
  checkBeamRuntime,
  createBeamRuntimeFingerprint,
  resolveBeamRuntime,
} from "../src/packs/beam/official.ts";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-beam-test-"));
  const requirementsSnapshot = path.resolve(process.cwd(), "requirements-beam.txt");
  if (fs.existsSync(requirementsSnapshot)) {
    fs.copyFileSync(requirementsSnapshot, path.resolve(root, "requirements-beam.txt"));
  }
  tempRoots.push(root);
  return root;
}

function writeBeamRepo(rootDir: string): string {
  const repoPath = path.resolve(rootDir, "vendor/BEAM");
  fs.mkdirSync(path.resolve(repoPath, "src/evaluation"), { recursive: true });
  fs.mkdirSync(path.resolve(repoPath, "src/beam"), { recursive: true });
  fs.mkdirSync(path.resolve(repoPath, "src/answer_probing_questions"), { recursive: true });
  fs.writeFileSync(path.resolve(repoPath, "requirements.txt"), "requests==2.32.3\n", "utf8");
  fs.writeFileSync(
    path.resolve(repoPath, "src/evaluation/run_evaluation.py"),
    'print("ok")\n',
    "utf8",
  );
  fs.writeFileSync(path.resolve(repoPath, "src/beam/download_dataset.py"), 'print("ok")\n', "utf8");
  fs.writeFileSync(
    path.resolve(repoPath, "src/answer_probing_questions/answer_generation.py"),
    'print("ok")\n',
    "utf8",
  );
  return repoPath;
}

const beamEnvNames = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "BEAM_REPO_PATH",
  "BEAM_DATASET_PATH",
  "BEAM_DATASET_10M_PATH",
  "BEAM_PYTHON_BIN",
] as const;

beforeEach(() => {
  for (const name of beamEnvNames) Reflect.deleteProperty(process.env, name);
});

afterEach(() => {
  for (const name of beamEnvNames) Reflect.deleteProperty(process.env, name);

  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("beam runtime preflight", () => {
  test("reports missing prepared dataset before claiming beam is installed", () => {
    const rootDir = createTempRoot();
    writeBeamRepo(rootDir);

    const status = checkBeamRuntime(rootDir, { pythonBin: process.execPath });
    expect(status.installed).toBe(false);
    expect(status.detail).toContain("prepared dataset is missing");
  });

  test("reports missing judge credentials when repo and dataset are present", () => {
    const rootDir = createTempRoot();
    const repoPath = writeBeamRepo(rootDir);
    const datasetPath = path.resolve(repoPath, "test_chats");
    fs.mkdirSync(datasetPath, { recursive: true });

    const status = checkBeamRuntime(rootDir, { pythonBin: process.execPath });
    expect(status.installed).toBe(false);
    expect(status.detail).toContain("judge credentials are not configured");
  });

  test("accepts env-backed repo and dataset overrides when judge config exists", () => {
    const rootDir = createTempRoot();
    const externalRoot = createTempRoot();
    const repoPath = writeBeamRepo(externalRoot);
    const datasetPath = path.resolve(externalRoot, "prepared-dataset");
    fs.mkdirSync(datasetPath, { recursive: true });

    process.env.BEAM_REPO_PATH = repoPath;
    process.env.BEAM_DATASET_PATH = datasetPath;
    process.env.OPENAI_BASE_URL = "http://localhost:8000/v1";

    const status = checkBeamRuntime(rootDir, { pythonBin: process.execPath });
    expect(status.installed).toBe(true);
    expect(status.detail).toContain(repoPath);
    expect(status.detail).toContain(datasetPath);
  });

  test("reports missing prepared 10M dataset when requested", () => {
    const rootDir = createTempRoot();
    const repoPath = writeBeamRepo(rootDir);
    const datasetPath = path.resolve(repoPath, "test_chats");
    fs.mkdirSync(datasetPath, { recursive: true });
    process.env.OPENAI_BASE_URL = "http://localhost:8000/v1";

    const status = checkBeamRuntime(rootDir, {
      pythonBin: process.execPath,
      chatSizes: ["10M"],
    });
    expect(status.installed).toBe(false);
    expect(status.detail).toContain("prepared 10M dataset is missing");
  });

  test("captures a stable runtime fingerprint from resolved repo and dataset state", () => {
    const rootDir = createTempRoot();
    const repoPath = writeBeamRepo(rootDir);
    const datasetPath = path.resolve(repoPath, "test_chats");
    fs.mkdirSync(path.resolve(datasetPath, "100K/1"), { recursive: true });
    fs.mkdirSync(path.resolve(datasetPath, "100K/2"), { recursive: true });
    fs.mkdirSync(path.resolve(datasetPath, "500K/7"), { recursive: true });
    process.env.OPENAI_BASE_URL = "http://localhost:8000/v1";

    const runtime = resolveBeamRuntime(rootDir, { pythonBin: process.execPath });
    const fingerprint = createBeamRuntimeFingerprint(rootDir, runtime);

    expect(fingerprint.repoPath).toBe(repoPath);
    expect(fingerprint.repoPathOrigin).toBe("workspace");
    expect(fingerprint.dataset.conversationCounts).toEqual({
      "100K": 2,
      "500K": 1,
      "1M": 0,
    });
    expect(fingerprint.dataset.pathOrigin).toBe("workspace");
    expect(fingerprint.dataset10M).toBeNull();
    expect(fingerprint.requirementsSnapshotNormalizedSha256).not.toBeNull();
    expect(fingerprint.upstreamRequirementsNormalizedSha256).not.toBeNull();
    expect(fingerprint.requirementsSnapshotMatchesUpstream).toBe(false);
    expect(fingerprint.fingerprintSha256).toHaveLength(64);
  });

  test("setup script honors documented BEAM_REPO_PATH and BEAM_PYTHON_BIN env overrides", () => {
    const rootDir = createTempRoot();
    const externalRoot = createTempRoot();
    const repoPath = writeBeamRepo(externalRoot);
    const datasetPath = path.resolve(externalRoot, "prepared-dataset");
    // A stub interpreter, not a real system python: GitHub runners do not ship
    // python3.11 (this repo's dev sandboxes often do, which is how the
    // dependency stayed invisible until CI first ran). The test proves the
    // script HONORS the override -- resolving and version-probing whatever
    // BEAM_PYTHON_BIN names -- which a hermetic stub demonstrates on any host.
    const stubBinDir = path.resolve(externalRoot, "stub-bin");
    fs.mkdirSync(stubBinDir, { recursive: true });
    const pythonBin = path.resolve(stubBinDir, "python3.11");
    fs.writeFileSync(
      pythonBin,
      '#!/usr/bin/env bash\necho "Python 3.11.99 (beam runtime test stub)"\n',
      {
        mode: 0o755,
      },
    );
    // --check validates an already-installed interpreter and deliberately does
    // not require uv. Operator wrappers run this path in the prebuilt BEAM
    // image, so uv is not a host dependency.
    const requirementsSnapshot = fs.readFileSync(
      path.resolve(process.cwd(), "requirements-beam.txt"),
      "utf8",
    );
    fs.mkdirSync(datasetPath, { recursive: true });
    fs.writeFileSync(path.resolve(repoPath, "requirements.txt"), requirementsSnapshot, "utf8");

    const result = Bun.spawnSync({
      cmd: ["bash", path.resolve(process.cwd(), "scripts/setup-beam-runtime.sh"), "--check"],
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${stubBinDir}:${process.env.PATH ?? ""}`,
        BEAM_REPO_PATH: repoPath,
        BEAM_DATASET_PATH: datasetPath,
        BEAM_PYTHON_BIN: pythonBin,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe("");
    expect(result.stdout.toString()).toContain(
      `BEAM runtime check passed for repo ${repoPath} using ${pythonBin}`,
    );
    expect(result.stdout.toString()).toContain(`Dataset: ${datasetPath}`);
  });
});

describe("beam score aggregation", () => {
  // BEAM's evaluator emits continuous per-question scores and defines no
  // pass/fail threshold. This repo therefore reports the mean of those scores
  // and must never derive a pass rate from them — a locally invented threshold
  // is precisely the "synthetic or heuristic success metric" the trust policy
  // in README.md rules out.
  const results = [
    {
      conversationId: "c1",
      chatSize: "small",
      answerFilePath: "/tmp/a.json",
      evaluationFilePath: "/tmp/e.json",
      evaluation: {
        // Deliberately straddles 0.5: the old thresholded pass rate would have
        // reported 0.5 here (1 of 2 "passing"), which is not a BEAM number.
        knowledge_update: [{ llm_judge_score: 0.4 }, { llm_judge_score: 0.6 }],
        event_ordering: [{ tau_norm: 0.5 }],
      },
    },
  ] as unknown as Parameters<typeof aggregateBeamScores>[0];

  test("reports the mean of BEAM's own per-question scores, overall and per ability type", () => {
    const scores = aggregateBeamScores(results);
    expect(scores.questionCount).toBe(3);
    expect(scores.overall).toBe(0.5);
    expect(scores.byType.knowledge_update).toBe(0.5);
    expect(scores.byType.event_ordering).toBe(0.5);
  });

  test("exposes no pass-rate field derived from a locally invented threshold", () => {
    const scores = aggregateBeamScores(results);
    expect(Object.keys(scores).sort()).toEqual(["byType", "overall", "questionCount"]);
    expect("judgedPassRate" in scores).toBe(false);
  });

  test("an empty result set scores zero rather than dividing by zero", () => {
    const scores = aggregateBeamScores([]);
    expect(scores).toEqual({ byType: {}, overall: 0, questionCount: 0 });
  });
});
