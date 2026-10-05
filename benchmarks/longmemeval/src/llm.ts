// A chat request to any OpenAI-compatible endpoint, with retries for a busy or dropped connection.

export interface Endpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
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
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export function chatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One user message in, the reply text out. Throws when the request fails for good. */
export async function chat(endpoint: Endpoint, prompt: string, options: ChatOptions = {}): Promise<ChatResult> {
  const { temperature = 0, maxTokens, timeoutMs = 900_000, retries = 5, retryBackoffMs = 2000 } = options;
  const body = JSON.stringify({
    model: endpoint.model,
    messages: [{ role: "user", content: prompt }],
    temperature,
    ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
    stream: false,
  });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (endpoint.apiKey) headers.authorization = `Bearer ${endpoint.apiKey}`;

  const started = performance.now();
  for (let attempt = 0; ; attempt++) {
    let failure: string;
    let retryable: boolean;
    try {
      const response = await fetch(chatUrl(endpoint.baseUrl), { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) });
      const raw = await response.text();
      if (response.ok) {
        const reply = JSON.parse(raw) as {
          model?: string;
          choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
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
    if (!retryable || attempt >= retries) throw new Error(failure);
    await sleep(Math.min(retryBackoffMs * 2 ** attempt, 30_000));
  }
}
