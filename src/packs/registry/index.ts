import { UnknownPackError } from '../../core/errors.ts';
import type { PackAdapter } from '../types.ts';
import { akmBenchAdapter } from '../akm-bench/adapter.ts';
import { terminalBenchAdapter } from '../terminal-bench/adapter.ts';
import { sweBenchAdapter } from '../swe-bench/adapter.ts';
import { longMemEvalAdapter } from '../longmemeval/adapter.ts';
import { beamAdapter } from '../beam/adapter.ts';
import { locomoAdapter } from '../locomo/adapter.ts';
import { tauBenchAdapter } from '../tau-bench/adapter.ts';

export const packRegistry: PackAdapter[] = [
  akmBenchAdapter,
  terminalBenchAdapter,
  sweBenchAdapter,
  tauBenchAdapter,
  longMemEvalAdapter,
  beamAdapter,
  locomoAdapter,
];

export function resolvePack(packId: string): PackAdapter {
  const pack = packRegistry.find((entry) => entry.id === packId);
  if (!pack) {
    throw new UnknownPackError(packId);
  }
  return pack;
}
