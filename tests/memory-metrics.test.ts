import { describe, expect, test } from 'bun:test';
import { MemoryBackendUnavailableError } from '../src/core/errors.ts';
import { createAkmBackend } from '../src/memory/backends/akm.ts';
import { createMem0Backend } from '../src/memory/backends/mem0.ts';
import { scoreAnswer } from '../src/memory/answer-metrics.ts';
import { scoreRetrieval } from '../src/memory/retrieval-metrics.ts';
import { createRawVectorBackend } from '../src/memory/backends/raw-vector.ts';

describe('memory backend and metrics', () => {
  test('raw-vector search is deterministic', async () => {
    const backend = createRawVectorBackend();
    await backend.add([
      { id: 'b', text: 'second document about memory evaluation' },
      { id: 'a', text: 'first document about vector retrieval' },
      { id: 'c', text: 'unrelated content' },
    ]);
    const results = await backend.search({ text: 'vector retrieval document', topK: 2 });
    expect(results.map((item) => item.id)).toEqual(['a', 'b']);
    const retrieval = scoreRetrieval(['a'], results, 2);
    expect(retrieval.precisionAtK).toBe(0.5);
    expect(retrieval.mrr).toBe(1);
  });

  test('answer metrics stay separate from retrieval metrics', () => {
    const answer = scoreAnswer('raw vector search is deterministic', 'Raw vector search is deterministic.');
    expect(answer.exactMatch).toBe(1);
    expect(answer.tokenF1).toBe(1);
  });

  test('akm backend fails explicitly instead of returning fake empty retrieval', async () => {
    const backend = createAkmBackend();
    expect(backend.healthCheck().detail).toContain('fails explicitly');
    await expect(backend.add([{ id: '1', text: 'memory document' }])).rejects.toBeInstanceOf(MemoryBackendUnavailableError);
    await expect(backend.search({ text: 'memory document', topK: 1 })).rejects.toBeInstanceOf(MemoryBackendUnavailableError);
  });

  test('mem0 stub reports its own backend id in failures', async () => {
    const backend = createMem0Backend();
    await expect(backend.search({ text: 'memory document', topK: 1 })).rejects.toThrow('Memory backend "mem0" is unavailable');
  });
});
