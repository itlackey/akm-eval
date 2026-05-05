import { runDoctorChecks } from '../src/core/environment.ts';

const checks = runDoctorChecks();
for (const check of checks) {
  console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`);
}
if (checks.some((check) => check.status === 'warn')) {
  console.log('Environment check completed with warnings.');
} else {
  console.log('Environment check passed.');
}
