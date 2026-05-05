export interface VariantDefinition {
  id: string;
  description: string;
  tags: string[];
}

export type EvalVariant = {
  id: string;
  label?: string;
  agent: {
    // "opencode" is the local/default agent provider label used by this scaffold.
    provider: 'opencode' | 'custom' | 'none';
    model?: string;
    command?: string;
    env?: Record<string, string>;
  };
  akm: {
    enabled: boolean;
    command?: string;
    env?: Record<string, string>;
    configPath?: string;
  };
  memory: {
    backend: 'none' | 'akm' | 'mem0' | 'zep' | 'openviking' | 'raw-vector';
    config?: Record<string, unknown>;
  };
  limits?: {
    timeoutMs?: number;
    maxTokens?: number;
    maxCostUsd?: number;
  };
};
