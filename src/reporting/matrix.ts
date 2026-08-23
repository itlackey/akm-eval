import type { EvalConfig } from "../core/types.ts";
import { getMemoryBackendStatus } from "../memory/registry.ts";

export function renderRunMatrix(config: EvalConfig): string {
  const lines = [
    "| Run ID | Pack | Variant | Memory | Memory Status |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const run of config.runs) {
    const memoryBackend = run.memoryBackend ?? config.defaults?.memoryBackend ?? "none";
    const memoryStatus = getMemoryBackendStatus(memoryBackend);
    lines.push(
      `| ${run.id ?? `${run.pack}-${run.variant}`} | ${run.pack} | ${run.variant} | ${memoryBackend} | ${memoryStatus.evaluated ? "evaluated" : `blocked: ${memoryStatus.detail}`} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}
