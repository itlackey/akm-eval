import { spawnSync } from "node:child_process";

const COMMON_COMMAND_PATHS: Record<string, string[]> = {
  docker: ["/usr/local/bin/docker", "/usr/bin/docker"],
};

export interface ProcessResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runViaShell(command: string, args: string[], cwd: string): ReturnType<typeof spawnSync> {
  const escapedArgs = args.map((arg) => `'${arg.replace(/'/g, `'"'"'`)}'`).join(" ");
  const shellCommand = escapedArgs.length > 0 ? `${command} ${escapedArgs}` : command;
  return spawnSync("bash", ["-lc", shellCommand], {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function runProcess(command: string, args: string[], cwd: string): ProcessResult {
  const options = {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  } as const;
  let result = spawnSync(command, args, options);

  if (result.error?.name === "ENOENT" || result.error?.name === "ENOEXEC") {
    for (const fallbackPath of COMMON_COMMAND_PATHS[command] ?? []) {
      result = spawnSync(fallbackPath, args, options);
      if (!result.error) {
        break;
      }
    }
  }

  if (
    command === "docker" &&
    (result.error?.name === "ENOEXEC" || result.error?.name === "ENOENT")
  ) {
    result = runViaShell(command, args, cwd);
  }

  return {
    success: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status,
  };
}
