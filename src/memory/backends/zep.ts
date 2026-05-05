import { createAkmBackend } from './akm.ts';

export function createZepBackend() {
  const backend = createAkmBackend();
  return {
    ...backend,
    id: 'zep',
    healthCheck() {
      return { status: 'warn', detail: 'zep backend stub only; package/config not wired yet.' } as const;
    },
  };
}
