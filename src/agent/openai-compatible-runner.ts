import type { AgentProviderConfig } from '../core/types.ts';
import type { AgentRunOptions, AgentRunResult, AgentRunner } from './types.ts';

function resolveEnvRefs(value: string): string {
  return value.replace(/\{env:([A-Z_][A-Z0-9_]*)\}/g, (_m, name) => process.env[name] ?? '');
}

export class OpenAICompatibleRunner implements AgentRunner {
  private providerConfig: AgentProviderConfig;
  private model: string;

  constructor(providerConfig: AgentProviderConfig, model: string) {
    this.providerConfig = providerConfig;
    this.model = model;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const baseURL = this.providerConfig.baseURL;
    if (!baseURL) {
      return {
        ok: false,
        text: '',
        latencyMs: Date.now() - startedAt,
        error: 'openai-compatible provider requires baseURL',
      };
    }

    const url = `${baseURL.replace(/\/$/, '')}/chat/completions`;
    const apiKey = this.providerConfig.apiKey ? resolveEnvRefs(this.providerConfig.apiKey) : undefined;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      ...(this.providerConfig.options ?? {}),
    };

    const abortController = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.providerConfig.timeout ?? 120000;
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const text = await response.text();
        return {
          ok: false,
          text: '',
          latencyMs,
          error: `HTTP ${response.status}: ${text}`,
        };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content ?? '';
      const usage = data.usage
        ? {
            input: data.usage.prompt_tokens ?? 0,
            output: data.usage.completion_tokens ?? 0,
            total: data.usage.total_tokens ?? (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0),
          }
        : undefined;

      return {
        ok: true,
        text: content,
        usage,
        latencyMs,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        text: '',
        latencyMs,
        error: message,
      };
    }
  }
}
