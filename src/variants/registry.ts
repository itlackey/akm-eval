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
    description: 'AKM memory backend variant, backed by the real akm CLI (see docs/memory-backends.md).',
    tags: ['akm', 'memory'],
  },
  {
    id: 'mem0-oss',
    description: 'Planned external mem0 OSS comparison variant; benchmark runs are currently blocked.',
    tags: ['memory', 'external'],
  },
  {
    id: 'openviking',
    description: 'Planned external OpenViking comparison variant; benchmark runs are currently blocked.',
    tags: ['memory', 'external'],
  },
  {
    id: 'zep',
    description: 'Planned external Zep comparison variant; benchmark runs are currently blocked.',
    tags: ['memory', 'external'],
  },
  {
    id: 'raw-vector',
    description: 'Deterministic raw-vector baseline backend.',
    tags: ['memory', 'baseline'],
  },
];
