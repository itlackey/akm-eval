import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, median, request } from './throughput.mjs';

test('both runtimes receive the same explicit sampling and prompt, apart from their model ID', () => {
  const lm = request('flint-q4-k-m', 1);
  const rec = request('flint', 1);
  expect({ ...lm, model: 'same' }).toEqual({ ...rec, model: 'same' });
  expect(rec).toMatchObject({ temperature: 1, top_p: 0.95, top_k: 20, seed: 42, max_tokens: 1024, stream: false });
  expect(rec).not.toHaveProperty('enable_thinking');
  expect(request('flint', 2).messages[0].content).not.toEqual(rec.messages[0].content);
});

test('median excludes no values implicitly, handles even counts and leaves its input unchanged', () => {
  const input = [8, 1, 4, 2, 3];
  expect(median(input)).toBe(3);
  expect(input).toEqual([8, 1, 4, 2, 3]);
  expect(median([4, 1, 3, 2])).toBe(2.5);
  expect(() => median([])).toThrow('No measurements');
});

test('collects six calls, excludes warmup, and saves no endpoint or credential', async () => {
  const previous = globalThis.fetch;
  const folder = mkdtempSync(join(tmpdir(), 'flint-throughput-test-'));
  let calls = 0;
  globalThis.fetch = (async (_url, init) => {
    calls++;
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer private-test-credential' });
    return Response.json({ choices: [{ finish_reason: 'length', message: { content: '' } }],
      usage: { prompt_tokens: 955, completion_tokens: 1024, completion_tokens_details: { reasoning_tokens: 1023 } } });
  }) as typeof fetch;
  try {
    const path = join(folder, 'output.json');
    const result = await main(['test', path], { MODEL_BASE_URL: 'http://private.invalid/v1', MODEL_NAME: 'flint', MODEL_API_KEY: 'private-test-credential' });
    expect(calls).toBe(6);
    expect(result.rows.filter(row => !row.warmup)).toHaveLength(5);
    expect(result.all_measured_replies_reached_limit).toBe(true);
    const saved = readFileSync(path, 'utf8');
    expect(saved).not.toContain('private.invalid');
    expect(saved).not.toContain('private-test-credential');
  } finally {
    globalThis.fetch = previous;
    rmSync(folder, { recursive: true });
  }
});

test('fails explicitly on an unavailable endpoint instead of recording a measurement', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
  try {
    await expect(main(['test', '/not-written.json'], { MODEL_BASE_URL: 'http://unused.invalid/v1', MODEL_NAME: 'flint' })).rejects.toThrow('HTTP 503');
  } finally {
    globalThis.fetch = previous;
  }
});
