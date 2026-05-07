import { packRegistry } from '../packs/registry/index.ts';
import { getMemoryBackendStatus, listMemoryBackends } from '../memory/registry.ts';
import { runProcess } from './process.ts';
import { getProjectRoot } from './project-root.ts';

export interface DoctorCheck {
  name: string;
  status: 'ok' | 'warn';
  detail: string;
}

export function commandVersion(command: string, args: string[] = ['--version'], cwd = getProjectRoot()): string | null {
  const result = runProcess(command, args, cwd);
  if (!result.success) {
    return null;
  }
  return result.stdout.trim().split('\n')[0] ?? null;
}

export function runDoctorChecks(rootDir = getProjectRoot()): DoctorCheck[] {
  const bunVersion = commandVersion('bun', ['--version'], rootDir);
  const nodeVersion = commandVersion('node', ['--version'], rootDir);

  const checks: DoctorCheck[] = [
    {
      name: 'bun',
      status: bunVersion ? 'ok' : 'warn',
      detail: bunVersion ? `found ${bunVersion}` : 'bun not found in PATH',
    },
    {
      name: 'node',
      status: nodeVersion ? 'ok' : 'warn',
      detail: nodeVersion ? `found ${nodeVersion}` : 'node not found in PATH',
    },
  ];

  for (const backendId of listMemoryBackends()) {
    const detail = getMemoryBackendStatus(backendId, rootDir);
    checks.push({
      name: `memory:${backendId}`,
      status: detail.status,
      detail: detail.detail,
    });
  }

  for (const pack of packRegistry) {
    const doctorDetail = pack.getDoctorDetail?.();
    if (doctorDetail) {
      checks.push({
        name: `pack:${pack.id}`,
        status: doctorDetail.status,
        detail: doctorDetail.detail,
      });
      continue;
    }

    if (!pack.optionalDependency) {
      continue;
    }
    const installed = pack.checkInstalled(rootDir);
    checks.push({
      name: `pack:${pack.id}`,
      status: installed ? 'ok' : 'warn',
      detail: installed
        ? `optional dependency ${pack.optionalDependency} available`
        : `optional dependency ${pack.optionalDependency} not installed; runs are blocked until the official harness is available`,
    });
  }

  return checks;
}
