import fs from 'node:fs';
import path from 'node:path';

export interface SweBenchHarnessRunReport {
  total_instances: number;
  submitted_instances: number;
  completed_instances: number;
  resolved_instances: number;
  unresolved_instances: number;
  empty_patch_instances: number;
  error_instances: number;
  completed_ids: string[];
  incomplete_ids: string[];
  empty_patch_ids: string[];
  submitted_ids: string[];
  resolved_ids: string[];
  unresolved_ids: string[];
  error_ids: string[];
  schema_version: number;
}

export interface SweBenchInstanceReport {
  instanceId: string;
  resolved: boolean;
  reportPath: string;
  raw: Record<string, unknown>;
}

export interface ParsedSweBenchRawOutput {
  runReport: SweBenchHarnessRunReport;
  instanceReports: SweBenchInstanceReport[];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function parseRunReport(filePath: string): SweBenchHarnessRunReport {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;

  return {
    total_instances: Number(parsed.total_instances ?? 0),
    submitted_instances: Number(parsed.submitted_instances ?? 0),
    completed_instances: Number(parsed.completed_instances ?? 0),
    resolved_instances: Number(parsed.resolved_instances ?? 0),
    unresolved_instances: Number(parsed.unresolved_instances ?? 0),
    empty_patch_instances: Number(parsed.empty_patch_instances ?? 0),
    error_instances: Number(parsed.error_instances ?? 0),
    completed_ids: asStringArray(parsed.completed_ids),
    incomplete_ids: asStringArray(parsed.incomplete_ids),
    empty_patch_ids: asStringArray(parsed.empty_patch_ids),
    submitted_ids: asStringArray(parsed.submitted_ids),
    resolved_ids: asStringArray(parsed.resolved_ids),
    unresolved_ids: asStringArray(parsed.unresolved_ids),
    error_ids: asStringArray(parsed.error_ids),
    schema_version: Number(parsed.schema_version ?? 0),
  };
}

function parseInstanceReports(logRootDir: string): SweBenchInstanceReport[] {
  if (!fs.existsSync(logRootDir)) {
    return [];
  }

  const reports: SweBenchInstanceReport[] = [];

  for (const entry of fs.readdirSync(logRootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const reportPath = path.resolve(logRootDir, entry.name, 'report.json');
    if (!fs.existsSync(reportPath)) {
      continue;
    }

    const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as Record<string, unknown>;
    const reportEntry = parsed[entry.name];
    if (!reportEntry || typeof reportEntry !== 'object') {
      continue;
    }

    const raw = reportEntry as Record<string, unknown>;
    reports.push({
      instanceId: entry.name,
      resolved: raw.resolved === true,
      reportPath,
      raw,
    });
  }

  return reports;
}

export function parseSweBenchRawOutput(input: {
  runReportPath: string;
  instanceLogRootDir: string;
}): ParsedSweBenchRawOutput {
  return {
    runReport: parseRunReport(input.runReportPath),
    instanceReports: parseInstanceReports(input.instanceLogRootDir),
  };
}
