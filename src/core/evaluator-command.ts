export interface EvaluatorCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run an evaluator command without starting a login shell.
 *
 * The Docker image prepends its pinned Python virtual environment to PATH.
 * A login shell may replace that PATH from profile files, silently selecting
 * the system Python instead of the image's preinstalled evaluator runtime.
 */
export function runEvaluatorCommand(
  command: string,
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): EvaluatorCommandResult {
  const proc = Bun.spawnSync(["bash", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
  };
}
