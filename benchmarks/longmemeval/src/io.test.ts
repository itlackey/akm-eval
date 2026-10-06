import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { akmVersion } from "../../../lib/akm/akm.ts";
import { Akm } from "./akm.ts";
import { fakeAkmScript, sandboxRunning } from "./fakes.ts";
import { chat, chatUrl } from "./llm.ts";

const dirs: string[] = [];
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
  server?.stop(true);
  server = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "lme-io-"));
  dirs.push(d);
  return d;
};

const reply = (content: string) => Response.json({ model: "observed-model", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 11, completion_tokens: 3 } });

describe("chat", () => {
  test("sends one user message and reads the reply, the model name and the usage", async () => {
    let seen: { auth: string | null; body: any; path: string } | undefined;
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen = { auth: req.headers.get("authorization"), body: await req.json(), path: new URL(req.url).pathname };
        return reply("Blue");
      },
    });
    const result = await chat({ baseUrl: `http://127.0.0.1:${server.port}/v1/`, apiKey: "k", model: "m" }, "the prompt", { maxTokens: 50 });
    expect(seen?.path).toBe("/v1/chat/completions");
    expect(seen?.auth).toBe("Bearer k");
    expect(seen?.body).toEqual({ model: "m", messages: [{ role: "user", content: "the prompt" }], temperature: 0, max_tokens: 50, stream: false });
    expect(result).toMatchObject({ text: "Blue", model: "observed-model", promptTokens: 11, completionTokens: 3, finishReason: "stop", retries: 0 });
  });

  test("sends no key header when there is no key", async () => {
    let auth: string | null = "unset";
    server = Bun.serve({ port: 0, fetch: (req) => ((auth = req.headers.get("authorization")), reply("ok")) });
    await chat({ baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" }, "p");
    expect(auth).toBeNull();
  });

  test("retries a busy endpoint, and does not retry a refusal", async () => {
    let calls = 0;
    server = Bun.serve({ port: 0, fetch: () => (++calls < 3 ? new Response("busy", { status: 503 }) : reply("ok")) });
    const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
    expect((await chat(endpoint, "p", { retryBackoffMs: 0 })).retries).toBe(2);
    server.stop(true);
    calls = 0;
    server = Bun.serve({ port: 0, fetch: () => (calls++, new Response('{"error":"context length exceeded"}', { status: 400 })) });
    await expect(chat({ ...endpoint, baseUrl: `http://127.0.0.1:${server.port}/v1` }, "p", { retryBackoffMs: 0 })).rejects.toThrow("HTTP 400: {\"error\":\"context length exceeded\"}");
    expect(calls).toBe(1);
  });

  test("gives up after its retries, and an endpoint that is down is an error", async () => {
    let calls = 0;
    server = Bun.serve({ port: 0, fetch: () => (calls++, new Response("busy", { status: 503 })) });
    await expect(chat({ baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" }, "p", { retries: 2, retryBackoffMs: 0 })).rejects.toThrow("HTTP 503");
    expect(calls).toBe(3);
    await expect(chat({ baseUrl: "http://127.0.0.1:9/v1", apiKey: "", model: "m" }, "p", { retries: 0 })).rejects.toThrow();
  });

  test("a request that takes too long is an error and is not tried again", async () => {
    let calls = 0;
    server = Bun.serve({
      port: 0,
      async fetch() {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return reply("late");
      },
    });
    await expect(chat({ baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" }, "p", { timeoutMs: 1000, retryBackoffMs: 0 })).rejects.toThrow("the request timed out after 1 s");
    expect(calls).toBe(1);
  });

  test("accepts a full chat-completions URL", () => {
    expect(chatUrl("http://h/v1")).toBe("http://h/v1/chat/completions");
    expect(chatUrl("http://h/v1/chat/completions/")).toBe("http://h/v1/chat/completions");
  });
});

describe("Akm", () => {
  test("puts the sessions in a fresh bundle as memories with opaque names, and searches them", async () => {
    const sandbox = sandboxRunning(fakeAkmScript(tmp()), dirs);
    const akm = new Akm(sandbox);
    expect(JSON.parse(readFileSync(join(sandbox.dir, "config", "config.json"), "utf8"))).toEqual({ configVersion: "0.9.0", semanticSearchMode: "off", registries: [] });
    expect(await akmVersion(sandbox)).toBe("0.9.99-test");
    const sessions = [
      { date: "2023/05/20 (Sat) 02:21", turns: [{ role: "user", content: "My dog Biscuit needs a harness" }] },
      { date: "2023/05/21 (Sun) 10:00", turns: [{ role: "user", content: "Planning a trip to Lisbon" }] },
    ];
    const names = await akm.load(sessions, "q1");
    expect(names.size).toBe(2);
    for (const name of names.keys()) expect(name).toMatch(/^m[0-9a-f]{12}$/);
    const files = readdirSync(join(sandbox.dir, "bundle", "memories"));
    expect(files.sort()).toEqual([...names.keys()].map((n) => `${n}.md`).sort());
    const text = readFileSync(join(sandbox.dir, "bundle", "memories", files[0]), "utf8");
    expect(text).toStartWith("# Chat session\n\nSession date: 2023/05/2");
    const hits = await akm.search("Which harness does Biscuit need?", 5);
    expect(hits.map((h) => names.get(h))).toEqual([0]);
    // the next question starts from an empty bundle
    const again = await akm.load([sessions[1]], "q2");
    expect(readdirSync(join(sandbox.dir, "bundle", "memories"))).toHaveLength(1);
    expect(again.size).toBe(1);
    expect(existsSync(join(sandbox.dir, "bundle"))).toBe(true);
  });

  test("stops when akm indexes a different number of entries than there are sessions", async () => {
    const dir = tmp();
    const broken = join(dir, "broken.ts");
    writeFileSync(broken, 'console.log(JSON.stringify({ totalEntries: 1 }));');
    const akm = new Akm(sandboxRunning(broken, dirs));
    await expect(akm.load([{ date: "d", turns: [] }, { date: "d", turns: [] }], "q")).rejects.toThrow("indexed 1 entries for 2 sessions");
  });
});
