// A chat request to any OpenAI-compatible endpoint, with retries for a busy or dropped connection.

import type { ChatSettings } from "../../../lib/models.ts";
import { completionsUrl } from "../../../lib/akm/akm.ts";

export interface Endpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  chat?: ChatSettings;
}

export interface ChatResult {
  text: string;
  /** The model name the endpoint reports. A gateway may route a name to another model. */
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  finishReason: string | null;
  seconds: number;
  retries: number;
  usage: CallUsage;
}

export interface CallUsage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_tokens: number | null;
  reasoning_tokens: number | null;
  cost_usd: number | null;
  seconds: number;
  retries: number;
  failed: boolean;
}
export class ChatError extends Error {
  constructor(message: string, readonly usage: CallUsage) { super(message); }
}
export const tokenLimit = (endpoint: Endpoint | null, fallback: number): number => endpoint?.chat?.max_completion_tokens ?? endpoint?.chat?.max_tokens ?? fallback;

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** The last three are for tests: a run takes the defaults. */
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

/** How long a request may take, unless the caller says otherwise. */
export const CHAT_TIMEOUT_MS = 900_000;

/** The temperature of a request whose role has no chat.temperature in its models.json line: the benchmark's own, for the model and the judge. */
export const TEMPERATURE = 0;

/** The temperature a role is sent: its line's chat.temperature, else TEMPERATURE. summary.json and the manifest record it, for the reader and for the judge. */
export const temperatureOf = (endpoint: Endpoint | null): number => endpoint?.chat?.temperature ?? TEMPERATURE;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One user message in, the reply text out. Throws when the request fails for good. */
export async function chat(endpoint: Endpoint, prompt: string, options: ChatOptions = {}): Promise<ChatResult> {
  const { temperature = TEMPERATURE, maxTokens, timeoutMs = CHAT_TIMEOUT_MS, retries = 5, retryBackoffMs = 2000 } = options;
  const body = JSON.stringify({
    model: endpoint.model,
    messages: [{ role: "user", content: prompt }],
    temperature: endpoint.chat?.temperature ?? temperature,
    ...(endpoint.chat?.max_completion_tokens !== undefined ? { max_completion_tokens: endpoint.chat.max_completion_tokens }
      : endpoint.chat?.max_tokens !== undefined ? { max_tokens: endpoint.chat.max_tokens }
      : maxTokens === undefined ? {} : { max_tokens: maxTokens }),
    ...(endpoint.chat?.reasoning_effort !== undefined ? { reasoning_effort: endpoint.chat.reasoning_effort } : {}),
    stream: false,
  });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (endpoint.apiKey) headers.authorization = `Bearer ${endpoint.apiKey}`;

  const started = performance.now();
  for (let attempt = 0; ; attempt++) {
    let failure: string;
    let retryable: boolean;
    try {
      const response = await fetch(completionsUrl(endpoint.baseUrl), { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
      const raw = await response.text();
      if (response.ok) {
        const reply = JSON.parse(raw) as {
          model?: string;
          choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens_details?: { reasoning_tokens?: number } };
        };
        const choice = reply.choices?.[0];
        if (!choice) throw new Error(`the reply has no choices: ${raw.slice(0, 200)}`);
        return {
          text: choice.message?.content ?? "",
          model: reply.model ?? null,
          promptTokens: reply.usage?.prompt_tokens ?? null,
          completionTokens: reply.usage?.completion_tokens ?? null,
          finishReason: choice.finish_reason ?? null,
          seconds: Number(((performance.now() - started) / 1000).toFixed(1)),
          retries: attempt,
          usage: {
            prompt_tokens: reply.usage?.prompt_tokens ?? null, completion_tokens: reply.usage?.completion_tokens ?? null,
            cached_tokens: reply.usage?.prompt_tokens_details?.cached_tokens ?? null,
            reasoning_tokens: reply.usage?.completion_tokens_details?.reasoning_tokens ?? null,
            cost_usd: reply.usage?.cost ?? null,
            seconds: Number(((performance.now() - started) / 1000).toFixed(1)), retries: attempt, failed: false,
          },
        };
      }
      failure = `HTTP ${response.status}: ${raw.trim().slice(0, 300)}`;
      retryable = RETRYABLE.has(response.status);
    } catch (e) {
      // A dropped connection is retried. A timeout is not: a request that took the whole time will take it again.
      const error = e as Error;
      const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
      failure = timedOut ? `the request timed out after ${Math.round(timeoutMs / 1000)} s` : `${error.name}: ${error.message}`.slice(0, 300);
      retryable = !timedOut && (error instanceof TypeError || /ECONN|socket|connect|network|fetch failed/i.test(error.message));
    }
    if (!retryable || attempt >= retries) throw new ChatError(failure, {
      prompt_tokens: null, completion_tokens: null, cached_tokens: null, reasoning_tokens: null, cost_usd: null,
      seconds: Number(((performance.now() - started) / 1000).toFixed(1)), retries: attempt, failed: true,
    });
    await sleep(Math.min(retryBackoffMs * 2 ** attempt, 30_000));
  }
}
