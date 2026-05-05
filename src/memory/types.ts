export interface MemoryDocument {
  id: string;
  text: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MemoryQuery {
  text: string;
  topK: number;
}

export interface MemorySearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MemoryHealth {
  status: 'ok' | 'warn';
  detail: string;
}

export interface MemoryBackend {
  id: string;
  kind: 'disabled' | 'in-memory' | 'external';
  add(documents: MemoryDocument[]): Promise<void>;
  search(query: MemoryQuery): Promise<MemorySearchResult[]>;
  reset(): Promise<void>;
  healthCheck(): MemoryHealth;
}

export interface RetrievalMetrics {
  queryCount: number;
  precisionAtK: number;
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
}

export interface AnswerMetrics {
  exactMatch: number;
  tokenF1: number;
  containsExpected: number;
  judgedPass: number;
}
