import type { AgentRunner } from '../../agent/types.ts';
import type { RunContext } from '../../core/run-context.ts';
import type { NormalizedRunResult } from '../../core/types.ts';
import type { MemoryBackend } from '../../memory/types.ts';
import type { PackAdapter } from '../types.ts';
import { blockedPackDoctorDetail } from '../runtime-requirements.ts';
import { BenchmarkRuntimeError } from '../../core/errors.ts';

export const akmBenchAdapter: PackAdapter = {
  id: 'akm-bench',
  description: 'AKM-bench is process-boundary only and blocked until authoritative result ingestion is wired.',
  checkInstalled() {
    return false;
  },
  getDoctorDetail() {
    return blockedPackDoctorDetail(
      'blocked: akm-bench process integration is not yet wired to authoritative result artifacts; local proxy scoring is disabled',
    );
  },
  async run(
    _context: RunContext,
    _memory: MemoryBackend,
    _agent?: AgentRunner,
  ): Promise<NormalizedRunResult> {
    throw new BenchmarkRuntimeError(
      'akm-bench is blocked in this repo until it can launch the external akm-bench process and normalize only its authoritative result artifacts. ' +
        'The previous adapter mixed CLI stdout with local heuristic scoring, which was misleading and has been removed.',
    );
  },
};
