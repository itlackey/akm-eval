export interface ParsedTerminalBenchRawOutput {
  benchmarkResults: {
    results: Array<{
      task_id: string;
      is_resolved: boolean | null;
      failure_mode: string;
      total_input_tokens?: number | null;
      total_output_tokens?: number | null;
    }>;
    n_resolved: number;
    n_unresolved: number;
    accuracy: number;
    pass_at_k: Record<string, number>;
  };
  runMetadata: {
    run_id: string;
    dataset_name?: string | null;
    dataset_version?: string | null;
    dataset_path?: string | null;
    output_path: string;
    agent_name: string;
    model_name?: string | null;
    n_concurrent_trials: number;
    n_attempts: number;
    start_time?: string | null;
    end_time?: string | null;
  };
  taskSummaries: Array<{
    taskId: string;
    attempts: number;
    resolvedAttempts: number;
    unresolvedAttempts: number;
    failureModes: string[];
    parserResultKeys: string[];
    trialDirectories: string[];
    commandLogs: string[];
    paneLogs: string[];
    resultFiles: string[];
  }>;
}

export function parseTerminalBenchRawOutput(value: ParsedTerminalBenchRawOutput): ParsedTerminalBenchRawOutput {
  return value;
}
