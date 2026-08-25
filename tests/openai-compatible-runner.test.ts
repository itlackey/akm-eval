/**
 * Unit tests for src/agent/openai-compatible-runner.ts's bounded retry
 * (itlackey/akm-eval#4).
 *
 * A single transient provider failure on question N used to discard the N-1
 * answers already paid for, and — because variants run as separate processes
 * — silently biased which arms completed. These tests pin the two halves of
 * the contract that matter: TRANSIENT classes (request timeout, 408, 429,
 * 5xx, and status-less transport errors) are retried within a bound, and
 * CONFIGURATION errors (401/403/404/400 — bad key, wrong baseURL, unknown
 * model) still fail immediately and loudly on the first attempt rather than
 * being buried under retries.
 *
 * No network: `globalThis.fetch` is replaced with a scripted stub, and the
 * retry backoff is driven to 1ms so exhaustion cases stay fast.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  OpenAICompatibleRunner,
  isTransientStatus,
} from "../src/agent/openai-compatible-runner.ts";
import type { AgentProviderConfig } from "../src/core/types.ts";

const providerConfig: AgentProviderConfig = {
  type: "openai-compatible",
  baseURL: "https://example.invalid/v1",
  apiKey: "test-key",
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type ScriptedResponse =
  | { status: number; body: string }
  | { throws: Error }
  | { hangUntilAborted: true };

/**
 * Replace global fetch with a queue of scripted outcomes (one per attempt).
 * Returns the recorded call count so a test can assert how many attempts the
 * runner actually made — the difference between "retried" and "gave up".
 */
function scriptFetch(responses: ScriptedResponse[]): { callCount: () => number } {
  let calls = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const scripted = responses[calls] ?? responses[responses.length - 1];
    calls += 1;
    if (scripted && "throws" in scripted) throw scripted.throws;
    if (scripted && "hangUntilAborted" in scripted) {
      return await new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted.");
          error.name = "AbortError";
          reject(error);
        });
      });
    }
    const { status, body } = scripted as { status: number; body: string };
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { callCount: () => calls };
}

function okBody(text: string): string {
  return JSON.stringify({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
  });
}

function runner(maxAttempts = 4) {
  return new OpenAICompatibleRunner(providerConfig, "test-model", { maxAttempts, baseDelayMs: 1 });
}

describe("isTransientStatus", () => {
  test("retries only provider-side classes; configuration errors are terminal", () => {
    expect(isTransientStatus(408)).toBe(true);
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(500)).toBe(true);
    expect(isTransientStatus(502)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);

    expect(isTransientStatus(400)).toBe(false);
    expect(isTransientStatus(401)).toBe(false);
    expect(isTransientStatus(403)).toBe(false);
    expect(isTransientStatus(404)).toBe(false);
    expect(isTransientStatus(422)).toBe(false);
  });
});

describe("OpenAICompatibleRunner retry", () => {
  test("retries a transient HTTP 500 and succeeds, reporting the retry count", async () => {
    const { callCount } = scriptFetch([
      { status: 500, body: '{"type":"error","message":"Internal server error"}' },
      { status: 200, body: okBody("recovered") },
    ]);

    const result = await runner().run({ prompt: "hi" });

    expect(result.ok).toBe(true);
    expect(result.text).toBe("recovered");
    expect(result.retries).toBe(1);
    expect(callCount()).toBe(2);
  });

  test("retries HTTP 429", async () => {
    const { callCount } = scriptFetch([
      { status: 429, body: "rate limited" },
      { status: 200, body: okBody("ok") },
    ]);

    const result = await runner().run({ prompt: "hi" });

    expect(result.ok).toBe(true);
    expect(result.retries).toBe(1);
    expect(callCount()).toBe(2);
  });

  test("retries a request timeout (the runner's own abort)", async () => {
    const { callCount } = scriptFetch([
      { hangUntilAborted: true },
      { status: 200, body: okBody("ok") },
    ]);

    const result = await runner().run({ prompt: "hi", timeoutMs: 20 });

    expect(result.ok).toBe(true);
    expect(result.retries).toBe(1);
    expect(callCount()).toBe(2);
  });

  test("retries a status-less transport error (e.g. Bun's 'The operation timed out.')", async () => {
    const { callCount } = scriptFetch([
      { throws: new Error("The operation timed out.") },
      { status: 200, body: okBody("ok") },
    ]);

    const result = await runner().run({ prompt: "hi" });

    expect(result.ok).toBe(true);
    expect(result.retries).toBe(1);
    expect(callCount()).toBe(2);
  });

  test("never retries HTTP 401 — a bad key must fail loudly on the first attempt", async () => {
    const { callCount } = scriptFetch([{ status: 401, body: "invalid api key" }]);

    const result = await runner().run({ prompt: "hi" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("HTTP 401");
    expect(result.retries).toBe(0);
    expect(callCount()).toBe(1);
  });

  test("never retries HTTP 404 (wrong baseURL / unknown model)", async () => {
    const { callCount } = scriptFetch([{ status: 404, body: "model not found" }]);

    const result = await runner().run({ prompt: "hi" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("HTTP 404");
    expect(callCount()).toBe(1);
  });

  test("never retries HTTP 400 (model-not-supported / malformed request)", async () => {
    const { callCount } = scriptFetch([{ status: 400, body: "model not supported" }]);

    const result = await runner().run({ prompt: "hi" });

    expect(result.ok).toBe(false);
    expect(callCount()).toBe(1);
  });

  test("retry is bounded: gives up after maxAttempts and says so", async () => {
    const { callCount } = scriptFetch([{ status: 503, body: "unavailable" }]);

    const result = await runner(3).run({ prompt: "hi" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("HTTP 503");
    expect(result.error).toContain("after 3 attempt(s)");
    expect(result.retries).toBe(2);
    expect(callCount()).toBe(3);
  });

  test("a first-attempt success reports zero retries", async () => {
    const { callCount } = scriptFetch([{ status: 200, body: okBody("straight through") }]);

    const result = await runner().run({ prompt: "hi" });

    expect(result.ok).toBe(true);
    expect(result.retries).toBe(0);
    expect(callCount()).toBe(1);
  });

  test("a missing baseURL is a configuration error, not something to retry", async () => {
    const { callCount } = scriptFetch([{ status: 200, body: okBody("unreachable") }]);
    const noBaseUrl = new OpenAICompatibleRunner({ type: "openai-compatible" }, "test-model", {
      maxAttempts: 4,
      baseDelayMs: 1,
    });

    const result = await noBaseUrl.run({ prompt: "hi" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("requires baseURL");
    expect(callCount()).toBe(0);
  });
});
