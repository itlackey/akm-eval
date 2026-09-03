import { UnknownMemoryBackendError } from "../core/errors.ts";
import { createAkmBackend, getAkmBackendDoctorDetail } from "./backends/akm.ts";
import { createNoneBackend } from "./backends/none.ts";
import { createRawVectorBackend } from "./backends/raw-vector.ts";
import type { MemoryBackend } from "./types.ts";

// `workDir` is optional and only consumed by the `akm` backend today (a
// per-instance hermetic root for its AKM_* directories). Every other
// factory ignores extra arguments, so this widening needed no changes to
// none/raw-vector's own signatures.
type BackendFactory = (rootDir?: string, workDir?: string) => MemoryBackend;
type BackendStatus = {
  evaluated: boolean;
  status: "ok" | "warn";
  detail: string;
};

export const memoryBackendRegistry: Record<string, BackendFactory> = {
  none: createNoneBackend,
  akm: createAkmBackend,
  "raw-vector": createRawVectorBackend,
};

const backendStatusRegistry: Record<string, (rootDir?: string) => BackendStatus> = {
  none: () => ({
    evaluated: true,
    status: "ok",
    detail: "truthful disabled baseline backend ready",
  }),
  "raw-vector": () => ({
    evaluated: true,
    status: "ok",
    detail: "truthful deterministic in-memory vector backend ready",
  }),
  akm: (rootDir) => {
    const detail = getAkmBackendDoctorDetail(rootDir);
    return {
      evaluated: true,
      status: detail.status,
      detail: detail.detail,
    };
  },
};

export function createMemoryBackend(
  id = "none",
  rootDir?: string,
  workDir?: string,
): MemoryBackend {
  const factory = memoryBackendRegistry[id];
  if (!factory) {
    throw new UnknownMemoryBackendError(id);
  }
  return factory(rootDir, workDir);
}

export function listMemoryBackends(): string[] {
  return Object.keys(memoryBackendRegistry).sort();
}

export function getMemoryBackendStatus(id: string, rootDir = process.cwd()): BackendStatus {
  const statusFactory = backendStatusRegistry[id];
  if (!statusFactory) {
    throw new UnknownMemoryBackendError(id);
  }
  return statusFactory(rootDir);
}

export function listEvaluatedMemoryBackends(): string[] {
  return listMemoryBackends().filter((id) => getMemoryBackendStatus(id).evaluated);
}

export function listBlockedMemoryBackends(): string[] {
  return listMemoryBackends().filter((id) => !getMemoryBackendStatus(id).evaluated);
}
