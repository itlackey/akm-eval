import { createExternalStub } from './external-stub.ts';

export function createMem0Backend() {
  return createExternalStub(
    'mem0',
    'mem0 is kept as a planned external backend ID, but this repo does not yet implement a truthful evaluated retrieval integration for `memory.backend: mem0`.',
  );
}
