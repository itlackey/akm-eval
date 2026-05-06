import { MemoryBackendUnavailableError } from '../../core/errors.ts';
import { runProcess } from '../../core/process.ts';
import type { MemoryBackend, MemoryDocument, MemoryQuery, MemorySearchResult } from '../types.ts';

interface AkmBackendRuntime {
  available: boolean;
  detail: string;
}

function inspectAkmRuntime(): AkmBackendRuntime {
  const versionResult = runProcess('akm', ['--version'], process.cwd());
  if (!versionResult.success) {
    const detail = versionResult.stderr.trim() || versionResult.stdout.trim() || 'akm CLI not found in PATH';
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
      detail: `akm CLI is present (${versionResult.stdout.trim().split('\n')[0] ?? 'version unknown'}) but \`akm info --format json\` failed: ${detail}`,
    };
  }

  let parsed: { version?: string; semanticSearch?: { status?: string } } | null = null;
  try {
    parsed = JSON.parse(infoResult.stdout) as { version?: string; semanticSearch?: { status?: string } };
  } catch {
    parsed = null;
  }

  const version = parsed?.version?.trim() || versionResult.stdout.trim().split('\n')[0] || 'unknown version';
  const semanticStatus = parsed?.semanticSearch?.status?.trim();
  const semanticDetail = semanticStatus ? ` semanticSearch=${semanticStatus}.` : '';

  return {
    available: false,
    detail:
      `akm CLI ${version} is installed, but this repo does not yet have a truthful evaluated retrieval integration for \`memory.backend: akm\`. ` +
      `The backend now fails explicitly instead of silently returning empty results.${semanticDetail}`,
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
