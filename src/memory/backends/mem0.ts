import { createAkmBackend } from './akm.ts';

export function createMem0Backend() {
  const backend = createAkmBackend();
  return {
    ...backend,
    id: 'mem0',
    healthCheck() {
      return { status: 'warn', detail: 'mem0 backend stub only; package/config not wired yet.' } as const;
    },
  };
}
