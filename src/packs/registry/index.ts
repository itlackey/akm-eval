import { UnknownPackError } from '../../core/errors.ts';
import type { PackAdapter } from '../types.ts';
import { longMemEvalAdapter } from '../longmemeval/adapter.ts';
import { beamAdapter } from '../beam/adapter.ts';
import { locomoAdapter } from '../locomo/adapter.ts';
import { tauBenchAdapter } from '../tau-bench/adapter.ts';

export const packRegistry: PackAdapter[] = [
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
