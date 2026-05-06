import { MemoryBackendUnavailableError } from '../../core/errors.ts';
import { runProcess } from '../../core/process.ts';
import type { MemoryBackend, MemoryDocument, MemoryQuery, MemorySearchResult } from '../types.ts';

interface AkmBackendRuntime {
  available: boolean;
  detail: string;
}

function inspectAkmRuntime(): AkmBackendRuntime {
  const helpResult = runProcess('akm', ['--help'], process.cwd());
  if (!helpResult.success) {
    const detail = helpResult.stderr.trim() || helpResult.stdout.trim() || 'akm CLI not found in PATH';
    return {
      available: false,
      detail: `requires the AKM CLI in PATH. ${detail}`,
    };
  }

  const infoResult = runProcess('akm', ['info', '--format', 'json'], process.cwd());
  if (!infoResult.success) {
    const detail = infoResult.stderr.trim() || infoResult.stdout.trim() || 'akm info failed';
    return {
      available: false,
      detail: `akm CLI is present, but \`akm info --format json\` failed: ${detail}`,
    };
  }

  const memoryHelpResult = runProcess('akm', ['memory', '--help'], process.cwd());

  let parsed: { version?: string; semanticSearch?: { status?: string } } | null = null;
  try {
    parsed = JSON.parse(infoResult.stdout) as { version?: string; semanticSearch?: { status?: string } };
  } catch {
    parsed = null;
  }

  const version = parsed?.version?.trim() || 'unknown version';
  const semanticStatus = parsed?.semanticSearch?.status?.trim();
  const semanticDetail = semanticStatus ? ` semanticSearch=${semanticStatus}.` : '';
  const memoryContractDetail = memoryHelpResult.success
    ? 'Verified `akm --help` and `akm info --format json`, but `akm memory --help` still does not expose a documented add/search contract that maps truthfully onto this repo\'s `MemoryBackend.add` and `MemoryBackend.search` interface.'
    : `Verified \`akm --help\` and \`akm info --format json\`, but \`akm memory --help\` failed: ${memoryHelpResult.stderr.trim() || memoryHelpResult.stdout.trim() || 'unknown error'}.`;

  return {
    available: false,
    detail:
      `akm CLI ${version} is installed, but this repo does not yet have a truthful evaluated retrieval integration for \`memory.backend: akm\`. ` +
      `${memoryContractDetail} The backend fails explicitly instead of silently returning empty results.${semanticDetail}`,
  };
}

export function createExternalStub(id: string, detail: string): MemoryBackend {
  const unavailable = () => {
    throw new MemoryBackendUnavailableError(id, detail);
  };

  return {
    id,
    kind: 'external',
    async add(_documents: MemoryDocument[]): Promise<void> {
      unavailable();
    },
    async search(_query: MemoryQuery): Promise<MemorySearchResult[]> {
      unavailable();
    },
    async reset(): Promise<void> {},
    healthCheck() {
      return { status: 'warn', detail } as const;
    },
  };
}

export function getAkmBackendDoctorDetail() {
  const runtime = inspectAkmRuntime();
  return {
    status: runtime.available ? 'ok' : 'warn',
    detail: runtime.detail,
  } as const;
}

export function createAkmBackend(): MemoryBackend {
  return createExternalStub('akm', inspectAkmRuntime().detail);
}
