import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { checkBeamRuntime } from '../src/packs/beam/official.ts';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akm-eval-beam-test-'));
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
});
