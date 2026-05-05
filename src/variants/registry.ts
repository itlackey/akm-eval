import type { VariantDefinition } from './types.ts';

export const variantRegistry: VariantDefinition[] = [
  {
    id: 'baseline',
    description: 'Baseline agent without AKM or external memory.',
    tags: ['baseline'],
  },
  {
    id: 'akm-no-memory',
    description: 'AKM-enabled agent without memory backend.',
    tags: ['akm'],
  },
  {
    id: 'akm-memory',
    description: 'AKM-enabled agent with AKM memory backend.',
    tags: ['akm', 'memory'],
  },
  {
    id: 'mem0-oss',
    description: 'External mem0 OSS backend comparison variant.',
    tags: ['memory', 'external'],
  },
  {
    id: 'openviking',
    description: 'External OpenViking memory backend comparison variant.',
    tags: ['memory', 'external'],
  },
  {
    id: 'zep',
    description: 'External Zep memory backend comparison variant.',
    tags: ['memory', 'external'],
  },
  {
    id: 'raw-vector',
    description: 'Deterministic raw-vector baseline backend.',
    tags: ['memory', 'baseline'],
  },
];
