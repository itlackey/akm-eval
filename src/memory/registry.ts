import { UnknownMemoryBackendError } from '../core/errors.ts';
import type { MemoryBackend } from './types.ts';
import { createAkmBackend } from './backends/akm.ts';
import { createMem0Backend } from './backends/mem0.ts';
import { createNoneBackend } from './backends/none.ts';
import { createOpenVikingBackend } from './backends/openviking.ts';
import { createRawVectorBackend } from './backends/raw-vector.ts';
import { createZepBackend } from './backends/zep.ts';

type BackendFactory = () => MemoryBackend;

export const memoryBackendRegistry: Record<string, BackendFactory> = {
  none: createNoneBackend,
  akm: createAkmBackend,
  mem0: createMem0Backend,
  zep: createZepBackend,
  openviking: createOpenVikingBackend,
  'raw-vector': createRawVectorBackend,
};

export function createMemoryBackend(id = 'none'): MemoryBackend {
  const factory = memoryBackendRegistry[id];
  if (!factory) {
    throw new UnknownMemoryBackendError(id);
  }
  return factory();
}

export function listMemoryBackends(): string[] {
  return Object.keys(memoryBackendRegistry).sort();
}
