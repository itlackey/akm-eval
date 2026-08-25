import type { AgentProviderConfig } from "../core/types.ts";
import type { AgentRunOptions, AgentRunResult, AgentRunner } from "./types.ts";

function resolveEnvRefs(value: string): string {
  return value.replace(/\{env:([A-Z_][A-Z0-9_]*)\}/g, (_m, name) => process.env[name] ?? "");
}

/** One initial attempt plus this many retries. */
export const DEFAULT_MAX_ATTEMPTS = 4;
/** First backoff wait; doubles per retry (1s, 2s, 4s by default). */
export const DEFAULT_BASE_DELAY_MS = 1000;

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
}

/**
 * Which HTTP statuses are worth retrying. Deliberately narrow: a request
 * timeout (408), rate limiting (429), and any 5xx are provider-side
 * conditions a later identical request can succeed through. Everything else —
 * in particular 401 (bad/absent key), 403, 404 (wrong baseURL or unknown
 * model), and 400 (malformed request / model-not-supported) — is a
 * configuration error that retrying only hides, so it fails immediately and
 * loudly on the first attempt.
 */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

type Attempt =
  | { kind: "ok"; result: AgentRunResult }
  | { kind: "transient"; error: string }
  | { kind: "fatal"; error: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAICompatibleRunner implements AgentRunner {
  private providerConfig: AgentProviderConfig;
  private model: string;
  private retryPolicy: RetryPolicy;

  constructor(
    providerConfig: AgentProviderConfig,
    model: string,
    retryPolicy?: Partial<RetryPolicy>,
  ) {
    this.providerConfig = providerConfig;
    this.model = model;
    this.retryPolicy = {
      maxAttempts: retryPolicy?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      baseDelayMs: retryPolicy?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    };
  }

  /**
   * Bounded retry with exponential backoff over transient provider failures
   * only (see `isTransientStatus`, plus request timeouts and transport-level
   * errors, which carry no status at all). Without this a single provider
   * blip on question N discards the N-1 answers already paid for and —
   * because variants run as separate processes — silently biases which arms
   * complete (itlackey/akm-eval#4). `latencyMs` covers the whole retried
   * sequence, and `retries` reports how many extra attempts it took, so a run
   * that needed them is visibly different from one that did not.
   */
  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const startedAt = Date.now();
    let lastError = "unknown error";

    for (let attempt = 1; attempt <= this.retryPolicy.maxAttempts; attempt++) {
      const outcome = await this.attempt(options);
      if (outcome.kind === "ok") {
        return { ...outcome.result, latencyMs: Date.now() - startedAt, retries: attempt - 1 };
      }
      lastError = outcome.error;
      if (outcome.kind === "fatal") {
        return {
          ok: false,
          text: "",
          latencyMs: Date.now() - startedAt,
          error: lastError,
          retries: attempt - 1,
        };
      }
      if (attempt < this.retryPolicy.maxAttempts) {
        await sleep(this.retryPolicy.baseDelayMs * 2 ** (attempt - 1));
      }
    }

    return {
      ok: false,
      text: "",
      latencyMs: Date.now() - startedAt,
      error: `${lastError} (after ${this.retryPolicy.maxAttempts} attempt(s))`,
      retries: this.retryPolicy.maxAttempts - 1,
    };
  }

  private async attempt(options: AgentRunOptions): Promise<Attempt> {
    const startedAt = Date.now();
    const baseURL = this.providerConfig.baseURL;
    if (!baseURL) {
      return { kind: "fatal", error: "openai-compatible provider requires baseURL" };
    }

    const url = `${baseURL.replace(/\/$/, "")}/chat/completions`;
    const apiKey = this.providerConfig.apiKey
      ? resolveEnvRefs(this.providerConfig.apiKey)
      : undefined;

    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: options.prompt });

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
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const text = await response.text();
        const error = `HTTP ${response.status}: ${text}`;
        return isTransientStatus(response.status)
          ? { kind: "transient", error }
          : { kind: "fatal", error };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage
        ? {
            input: data.usage.prompt_tokens ?? 0,
            output: data.usage.completion_tokens ?? 0,
            total:
              data.usage.total_tokens ??
              (data.usage.prompt_tokens ?? 0) + (data.usage.completion_tokens ?? 0),
          }
        : undefined;

      return { kind: "ok", result: { ok: true, text: content, usage, latencyMs } };
    } catch (err) {
      clearTimeout(timeoutId);
      if (abortController.signal.aborted) {
        return {
          kind: "transient",
          error: `openai-compatible request timed out after ${timeoutMs}ms`,
        };
      }
      // No HTTP status at all: a socket/DNS/TLS-level failure. Bun surfaces
      // these as bare messages such as "The operation timed out.", which is
      // indistinguishable from a provider blip at this layer, so they are
      // treated as transient and bounded by `maxAttempts`.
      return { kind: "transient", error: err instanceof Error ? err.message : String(err) };
    }
  }
}
