import fs from "node:fs";
import type { AgentRunner } from "../agent/types.ts";
import { BenchmarkRuntimeError } from "../core/errors.ts";

export function requireAgentRunner(agent: AgentRunner | undefined, packId: string): AgentRunner {
  if (!agent) {
    throw new BenchmarkRuntimeError(
      `${packId} requires a configured model provider. Baseline runs must still connect to a real model; disable AKM memory instead of using provider:none.`,
    );
  }

  return agent;
}

export function requireExistingFile(filePath: string | undefined, message: string): string {
  if (!filePath) {
    throw new BenchmarkRuntimeError(message);
  }
  if (!fs.existsSync(filePath)) {
    throw new BenchmarkRuntimeError(`${message} Missing file: ${filePath}`);
  }
  return filePath;
}

export function requireExistingDirectory(
  directoryPath: string | undefined,
  message: string,
): string {
  if (!directoryPath) {
    throw new BenchmarkRuntimeError(message);
  }
  if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
    throw new BenchmarkRuntimeError(`${message} Missing directory: ${directoryPath}`);
  }
  return directoryPath;
}

export function blockedPackDoctorDetail(detail: string): { status: "warn"; detail: string } {
  return {
    status: "warn",
    detail,
  };
}
