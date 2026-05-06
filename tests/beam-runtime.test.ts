import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { checkBeamRuntime, createBeamRuntimeFingerprint, resolveBeamRuntime } from '../src/packs/beam/official.ts';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akm-eval-beam-test-'));
  const requirementsSnapshot = path.resolve(process.cwd(), 'requirements-beam.txt');
  if (fs.existsSync(requirementsSnapshot)) {
    fs.copyFileSync(requirementsSnapshot, path.resolve(root, 'requirements-beam.txt'));
  }
  tempRoots.push(root);
  return root;
}

function writeBeamRepo(rootDir: string): string {
  const repoPath = path.resolve(rootDir, 'vendor/BEAM');
  fs.mkdirSync(path.resolve(repoPath, 'src/evaluation'), { recursive: true });
  fs.mkdirSync(path.resolve(repoPath, 'src/beam'), { recursive: true });
  fs.mkdirSync(path.resolve(repoPath, 'src/answer_probing_questions'), { recursive: true });
  fs.writeFileSync(path.resolve(repoPath, 'requirements.txt'), 'requests==2.32.3\n', 'utf8');
  fs.writeFileSync(path.resolve(repoPath, 'src/evaluation/run_evaluation.py'), 'print("ok")\n', 'utf8');
  fs.writeFileSync(path.resolve(repoPath, 'src/beam/download_dataset.py'), 'print("ok")\n', 'utf8');
  fs.writeFileSync(path.resolve(repoPath, 'src/answer_probing_questions/answer_generation.py'), 'print("ok")\n', 'utf8');
  return repoPath;
}

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.BEAM_REPO_PATH;
  delete process.env.BEAM_DATASET_PATH;
  delete process.env.BEAM_DATASET_10M_PATH;
  delete process.env.BEAM_PYTHON_BIN;

  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('beam runtime preflight', () => {
  test('reports missing prepared dataset before claiming beam is installed', () => {
    const rootDir = createTempRoot();
    writeBeamRepo(rootDir);

    const status = checkBeamRuntime(rootDir, { pythonBin: process.execPath });
    expect(status.installed).toBe(false);
    expect(status.detail).toContain('prepared dataset is missing');
  });

  test('reports missing judge credentials when repo and dataset are present', () => {
    const rootDir = createTempRoot();
    const repoPath = writeBeamRepo(rootDir);
    const datasetPath = path.resolve(repoPath, 'test_chats');
    fs.mkdirSync(datasetPath, { recursive: true });

    const status = checkBeamRuntime(rootDir, { pythonBin: process.execPath });
    expect(status.installed).toBe(false);
    expect(status.detail).toContain('judge credentials are not configured');
  });

  test('accepts env-backed repo and dataset overrides when judge config exists', () => {
    const rootDir = createTempRoot();
    const externalRoot = createTempRoot();
    const repoPath = writeBeamRepo(externalRoot);
    const datasetPath = path.resolve(externalRoot, 'prepared-dataset');
    fs.mkdirSync(datasetPath, { recursive: true });

    process.env.BEAM_REPO_PATH = repoPath;
    process.env.BEAM_DATASET_PATH = datasetPath;
    process.env.OPENAI_BASE_URL = 'http://localhost:8000/v1';

    const status = checkBeamRuntime(rootDir, { pythonBin: process.execPath });
    expect(status.installed).toBe(true);
    expect(status.detail).toContain(repoPath);
    expect(status.detail).toContain(datasetPath);
  });

  test('reports missing prepared 10M dataset when requested', () => {
    const rootDir = createTempRoot();
    const repoPath = writeBeamRepo(rootDir);
    const datasetPath = path.resolve(repoPath, 'test_chats');
    fs.mkdirSync(datasetPath, { recursive: true });
    process.env.OPENAI_BASE_URL = 'http://localhost:8000/v1';

    const status = checkBeamRuntime(rootDir, {
      pythonBin: process.execPath,
      chatSizes: ['10M'],
    });
    expect(status.installed).toBe(false);
    expect(status.detail).toContain('prepared 10M dataset is missing');
  });

  test('captures a stable runtime fingerprint from resolved repo and dataset state', () => {
    const rootDir = createTempRoot();
    const repoPath = writeBeamRepo(rootDir);
    const datasetPath = path.resolve(repoPath, 'test_chats');
    fs.mkdirSync(path.resolve(datasetPath, '100K/1'), { recursive: true });
    fs.mkdirSync(path.resolve(datasetPath, '100K/2'), { recursive: true });
    fs.mkdirSync(path.resolve(datasetPath, '500K/7'), { recursive: true });
    process.env.OPENAI_BASE_URL = 'http://localhost:8000/v1';

    const runtime = resolveBeamRuntime(rootDir, { pythonBin: process.execPath });
    const fingerprint = createBeamRuntimeFingerprint(rootDir, runtime);

    expect(fingerprint.repoPath).toBe(repoPath);
    expect(fingerprint.repoPathOrigin).toBe('workspace');
    expect(fingerprint.dataset.conversationCounts).toEqual({
      '100K': 2,
      '500K': 1,
      '1M': 0,
    });
    expect(fingerprint.dataset.pathOrigin).toBe('workspace');
    expect(fingerprint.dataset10M).toBeNull();
    expect(fingerprint.requirementsSnapshotNormalizedSha256).not.toBeNull();
    expect(fingerprint.upstreamRequirementsNormalizedSha256).not.toBeNull();
    expect(fingerprint.requirementsSnapshotMatchesUpstream).toBe(false);
    expect(fingerprint.fingerprintSha256).toHaveLength(64);
  });
});
