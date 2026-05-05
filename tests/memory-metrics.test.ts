import { describe, expect, test } from 'bun:test';
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
});
