import { createAkmBackend } from './akm.ts';

export function createOpenVikingBackend() {
  const backend = createAkmBackend();
  return {
    ...backend,
    id: 'openviking',
    healthCheck() {
      return { status: 'warn', detail: 'openviking backend stub only; package/config not wired yet.' } as const;
    },
  };
}
