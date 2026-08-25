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
  status: "ok" | "warn";
  detail: string;
}

export interface MemoryBackend {
  id: string;
  kind: "disabled" | "in-memory" | "external";
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

/**
 * Answer-side scores for one run.
 *
 * `null` means "this pack does not compute this metric", never "this pack
 * measured zero". The distinction is load-bearing: LongMemEval, BEAM and
 * tau-bench all score on their own official LLM judge and compute no lexical
 * overlap at all, so reporting their `tokenF1` as `0` reads as a measured
 * zero and invites a false comparison against a pack (LoCoMo) that really
 * does measure it. Reporting renders `null` as `n/a` and refuses to derive a
 * delta from it.
 */
export interface AnswerMetrics {
  exactMatch: number | null;
  tokenF1: number | null;
  containsExpected: number | null;
  judgedPass: number;
}
