import { createExternalStub } from './akm.ts';

export function createZepBackend() {
  return createExternalStub(
    'zep',
    'zep is kept as a planned external backend ID, but this repo does not yet implement a truthful evaluated retrieval integration for `memory.backend: zep`.',
  );
}
