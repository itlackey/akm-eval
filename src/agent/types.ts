export interface AgentRunOptions {
  prompt: string;
  systemPrompt?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface AgentRunResult {
  ok: boolean;
  text: string;
  usage?: { input: number; output: number; total: number };
  latencyMs: number;
  error?: string;
  /**
   * Extra attempts the runner needed beyond the first (0 when the first
   * attempt succeeded). Packs sum this into `result.json.metadata` so a run
   * that had to retry through transient provider failures is visibly
   * different from one that did not — see itlackey/akm-eval#4.
   */
  retries?: number;
}

export interface AgentRunner {
  run(options: AgentRunOptions): Promise<AgentRunResult>;
}
