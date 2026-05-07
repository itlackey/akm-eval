import type { AgentRunner } from '../agent/types.ts';
import type { RunContext } from '../core/run-context.ts';
import type { NormalizedRunResult } from '../core/types.ts';
import type { MemoryBackend } from '../memory/types.ts';

export interface PackAdapter {
  id: string;
  description: string;
  optionalDependency?: string;
  checkInstalled(rootDir?: string): boolean;
  getDoctorDetail?(rootDir?: string): { status: 'ok' | 'warn'; detail: string };
  run(context: RunContext, memory: MemoryBackend, agent?: AgentRunner): Promise<NormalizedRunResult>;
}
