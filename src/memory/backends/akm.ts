import type { MemoryBackend, MemoryDocument, MemoryQuery, MemorySearchResult } from '../types.ts';

function createExternalStub(id: string, detail: string): MemoryBackend {
  return {
    id,
    kind: 'external',
    async add(_documents: MemoryDocument[]): Promise<void> {},
    async search(_query: MemoryQuery): Promise<MemorySearchResult[]> {
      return [];
    },
    async reset(): Promise<void> {},
    healthCheck() {
      return { status: 'warn', detail } as const;
    },
  };
}

export function createAkmBackend(): MemoryBackend {
  return createExternalStub('akm', 'AKM backend stub only; integration intentionally optional.');
}
