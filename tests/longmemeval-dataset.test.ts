import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { loadDataset } from '../src/packs/longmemeval/dataset.ts';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'akm-eval-longmemeval-test-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe('longmemeval dataset loading', () => {
  test('filters categories before smoke truncation', async () => {
    const rootDir = createTempRoot();
    const datasetPath = path.resolve(rootDir, 'dataset.json');
    const rows = [
      { question_id: 'q1', question_type: 'temporal-reasoning', question: 'q1', answer: 'a1', haystack_sessions: [[{ role: 'user', content: 'u1' }]] },
      { question_id: 'q2', question_type: 'preference', question: 'q2', answer: 'a2', haystack_sessions: [[{ role: 'user', content: 'u2' }]] },
      { question_id: 'q3', question_type: 'single-session-user', question: 'q3', answer: 'a3', haystack_sessions: [[{ role: 'user', content: 'u3' }]] },
      { question_id: 'q4', question_type: 'multi-session', question: 'q4', answer: 'a4', haystack_sessions: [[{ role: 'user', content: 'u4' }]] },
      { question_id: 'q5', question_type: 'single-session-assistant', question: 'q5', answer: 'a5', haystack_sessions: [[{ role: 'user', content: 'u5' }]] },
      { question_id: 'q6', question_type: 'multi-session', question: 'q6', answer: 'a6', haystack_sessions: [[{ role: 'user', content: 'u6' }]] },
    ];
    fs.writeFileSync(datasetPath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');

    const questions = await loadDataset({
      rootDir,
      datasetPath,
      questionCategories: ['single-session', 'multi-session'],
      smoke: true,
      maxQuestions: 5,
    });

    expect(questions.map((entry) => entry.id)).toEqual(['q3', 'q4', 'q5', 'q6']);
    expect(questions.map((entry) => entry.category)).toEqual(['single-session', 'multi-session', 'single-session', 'multi-session']);
  });
});
