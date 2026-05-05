import type { MemoryBackend, MemoryDocument, MemoryQuery, MemorySearchResult } from '../types.ts';

export function createNoneBackend(): MemoryBackend {
  return {
    id: 'none',
    kind: 'disabled',
    async add(_documents: MemoryDocument[]): Promise<void> {},
    async search(_query: MemoryQuery): Promise<MemorySearchResult[]> {
      return [];
    },
    async reset(): Promise<void> {},
    healthCheck() {
      return { status: 'ok', detail: 'disabled backend active' } as const;
    },
  };
}
