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
}

export interface AgentRunner {
  run(options: AgentRunOptions): Promise<AgentRunResult>;
}
