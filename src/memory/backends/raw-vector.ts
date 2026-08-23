import type { MemoryBackend, MemoryDocument, MemoryQuery, MemorySearchResult } from "../types.ts";

interface IndexedDocument {
  source: MemoryDocument;
  vector: Map<string, number>;
  magnitude: number;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function vectorize(value: string): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of tokenize(value)) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }
  return vector;
}

function magnitude(vector: Map<string, number>): number {
  let sum = 0;
  for (const weight of vector.values()) {
    sum += weight * weight;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
  aMagnitude: number,
  bMagnitude: number,
): number {
  if (aMagnitude === 0 || bMagnitude === 0) {
    return 0;
  }

  let dot = 0;
  for (const [token, count] of a.entries()) {
    dot += count * (b.get(token) ?? 0);
  }

  return dot / (aMagnitude * bMagnitude);
}

export function createRawVectorBackend(): MemoryBackend {
  const documents = new Map<string, IndexedDocument>();

  return {
    id: "raw-vector",
    kind: "in-memory",
    async add(input: MemoryDocument[]): Promise<void> {
      for (const document of input) {
        const vector = vectorize(document.text);
        documents.set(document.id, {
          source: document,
          vector,
          magnitude: magnitude(vector),
        });
      }
    },
    async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
      const queryVector = vectorize(query.text);
      const queryMagnitude = magnitude(queryVector);
      return Array.from(documents.values())
        .map((document) => ({
          id: document.source.id,
          text: document.source.text,
          metadata: document.source.metadata,
          score: cosineSimilarity(queryVector, document.vector, queryMagnitude, document.magnitude),
        }))
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }
          return left.id.localeCompare(right.id);
        })
        .slice(0, query.topK)
        .map((result) => ({
          ...result,
          score: Number(result.score.toFixed(6)),
        }));
    },
    async reset(): Promise<void> {
      documents.clear();
    },
    healthCheck() {
      return { status: "ok", detail: "deterministic in-memory vector backend ready" } as const;
    },
  };
}
