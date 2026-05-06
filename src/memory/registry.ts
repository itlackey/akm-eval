import { UnknownMemoryBackendError } from '../core/errors.ts';
import type { MemoryBackend } from './types.ts';
import { createAkmBackend } from './backends/akm.ts';
import { createMem0Backend } from './backends/mem0.ts';
import { createNoneBackend } from './backends/none.ts';
import { createOpenVikingBackend } from './backends/openviking.ts';
import { createRawVectorBackend } from './backends/raw-vector.ts';
import { createZepBackend } from './backends/zep.ts';

type BackendFactory = () => MemoryBackend;
type BackendStatus = {
  evaluated: boolean;
  status: 'ok' | 'warn';
  detail: string;
};

export const memoryBackendRegistry: Record<string, BackendFactory> = {
  none: createNoneBackend,
  akm: createAkmBackend,
  mem0: createMem0Backend,
  zep: createZepBackend,
  openviking: createOpenVikingBackend,
  'raw-vector': createRawVectorBackend,
};

const backendStatusRegistry: Record<string, () => BackendStatus> = {
  none: () => ({
    evaluated: true,
    status: 'ok',
    detail: 'truthful disabled baseline backend ready',
  }),
  'raw-vector': () => ({
    evaluated: true,
    status: 'ok',
    detail: 'truthful deterministic in-memory vector backend ready',
  }),
  akm: () => {
    const detail = createAkmBackend().healthCheck();
    return {
      evaluated: false,
      status: detail.status,
      detail: detail.detail,
    };
  },
  mem0: () => ({
    evaluated: false,
    status: 'warn',
    detail:
      'mem0 is planned only; this repo does not yet have a truthful evaluated retrieval integration for `memory.backend: mem0`.',
  }),
  zep: () => ({
    evaluated: false,
    status: 'warn',
    detail:
      'zep is planned only; this repo does not yet have a truthful evaluated retrieval integration for `memory.backend: zep`.',
  }),
  openviking: () => ({
    evaluated: false,
    status: 'warn',
    detail:
      'openviking is planned only; this repo does not yet have a truthful evaluated retrieval integration for `memory.backend: openviking`.',
  }),
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

export function getMemoryBackendStatus(id: string): BackendStatus {
  const statusFactory = backendStatusRegistry[id];
  if (!statusFactory) {
    throw new UnknownMemoryBackendError(id);
  }
  return statusFactory();
}

export function listEvaluatedMemoryBackends(): string[] {
  return listMemoryBackends().filter((id) => getMemoryBackendStatus(id).evaluated);
}

export function listBlockedMemoryBackends(): string[] {
  return listMemoryBackends().filter((id) => !getMemoryBackendStatus(id).evaluated);
}
