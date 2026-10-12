import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { akmVersion, semanticConfig, writeConfig } from "../../../lib/akm/akm.ts";
import { Akm, PROJECTION_LIMIT, isAkmTimeout, overProjectionLimit } from "./akm.ts";
import { fakeAkmScript, sandboxRunning } from "./fakes.ts";
import { TEMPERATURE, chat } from "./llm.ts";

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

  test("calls the chat-completions URL of a base URL: /chat/completions goes before any query, and is not added twice (#73)", async () => {
    const seen: string[] = [];
    server = Bun.serve({ port: 0, fetch: (req) => (seen.push(new URL(req.url).pathname + new URL(req.url).search), reply("ok")) });
    const at = (rest: string) => ({ baseUrl: `http://127.0.0.1:${server?.port}${rest}`, apiKey: "", model: "m" });
    for (const rest of ["/v1", "/v1/", "/v1/chat/completions/", "/openai/deployments/d1?api-version=2024-10-21", "/openai/deployments/d1/?api-version=2024-10-21", "/openai/deployments/d1/chat/completions?api-version=2024-10-21"]) await chat(at(rest), "p");
    expect(seen).toEqual([
      "/v1/chat/completions",
      "/v1/chat/completions",
      "/v1/chat/completions",
      "/openai/deployments/d1/chat/completions?api-version=2024-10-21",
      "/openai/deployments/d1/chat/completions?api-version=2024-10-21",
      "/openai/deployments/d1/chat/completions?api-version=2024-10-21",
    ]);
  });

  test("sends the temperature it records, unless asked for another", async () => {
    const bodies: { temperature: number }[] = [];
    server = Bun.serve({ port: 0, fetch: async (req) => (bodies.push((await req.json()) as { temperature: number }), reply("ok")) });
    const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
    await chat(endpoint, "p");
    await chat(endpoint, "p", { temperature: 0.7 });
    expect(TEMPERATURE).toBe(0);
    expect(bodies.map((b) => b.temperature)).toEqual([TEMPERATURE, 0.7]);
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

  test("a semantic sandbox embeds the sessions as it indexes them, and every search has to say it was semantic", async () => {
    const script = fakeAkmScript(tmp());
    const sandbox = sandboxRunning(script, dirs, { semantic: true });
    expect(JSON.parse(readFileSync(join(sandbox.dir, "config", "config.json"), "utf8"))).toMatchObject({ semanticSearchMode: "auto", embedding: { localModel: "Xenova/bge-small-en-v1.5" } });
    const akm = new Akm(sandbox, "semantic");
    expect(akm.mode).toBe("semantic");
    const names = await akm.load([{ date: "d", turns: [{ role: "user", content: "My dog Biscuit needs a harness" }] }, { date: "d", turns: [{ role: "user", content: "A trip to Lisbon" }] }], "q");
    expect((await akm.search("Which harness does Biscuit need?", 5)).map((h) => names.get(h))).toEqual([0]);

    // a search that fell back to keywords, or says nothing about how it searched, is an error
    const fallback = new Akm(sandboxRunning(script, dirs, { semantic: true, env: { FAKE_AKM_SEARCH_MODE: "fts-fallback" } }), "semantic");
    await fallback.load([{ date: "d", turns: [{ role: "user", content: "harness" }] }], "q");
    await expect(fallback.search("harness", 5)).rejects.toThrow("akm searched with fts-fallback, not semantic");
    const silent = join(tmp(), "silent.ts");
    writeFileSync(silent, 'if (process.argv[2] === "search" && process.argv[3] === "--help") console.log("--detail <detail>"); else console.log(JSON.stringify({ hits: [], totalEntries: 0 }));');
    await expect(new Akm(sandboxRunning(silent, dirs, { semantic: true }), "semantic").search("harness", 5)).rejects.toThrow("akm searched with no search mode, not semantic");
    // keyword search takes whatever akm says, as before
    const keyword = new Akm(sandboxRunning(silent, dirs));
    expect(await keyword.search("harness", 5)).toEqual([]);

    // an index that did not embed every session is an error too
    const partial = new Akm(sandboxRunning(script, dirs, { semantic: true, env: { FAKE_AKM_EMBEDDED: "1" } }), "semantic");
    await expect(partial.load([{ date: "d", turns: [] }, { date: "d", turns: [] }], "q")).rejects.toThrow("akm embedded 1 of 2 sessions");
    const plain = new Akm(sandboxRunning(script, dirs, { env: { FAKE_AKM_EMBEDDED: "1" } }));
    expect((await plain.load([{ date: "d", turns: [] }, { date: "d", turns: [] }], "q")).size).toBe(2); // keyword indexing has no embeddings to count
  });

  test("config is the file the sandbox runs with, keyword or semantic, with any secret redacted", () => {
    const script = fakeAkmScript(tmp());
    expect(new Akm(sandboxRunning(script, dirs)).config()).toEqual({ configVersion: "0.9.0", semanticSearchMode: "off", registries: [] });
    expect(new Akm(sandboxRunning(script, dirs, { semantic: true }), "semantic").config()).toEqual(semanticConfig());
    const sandbox = sandboxRunning(script, dirs);
    writeConfig(sandbox, { semanticSearchMode: "off", engines: { model: { endpoint: "http://h/v1", apiKey: "sk-live", model: "m" }, other: { apiKey: "$MODEL_API_KEY" } } });
    expect(new Akm(sandbox).config()).toEqual({ semanticSearchMode: "off", engines: { model: { endpoint: "http://h/v1", apiKey: "<redacted>", model: "m" }, other: { apiKey: "<redacted>" } } });
  });

  test("a command that outlives its limit is a timeout, with the message the run counts", async () => {
    const akm = new Akm(sandboxRunning(fakeAkmScript(tmp()), dirs, { env: { FAKE_AKM_SLEEP: "5000" } }), "keyword", 300);
    const error = await akm.load([{ date: "d", turns: [] }], "q").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("akm index timed out after 0.3s");
    expect(isAkmTimeout((error as Error).message)).toBe(true);
    // the other ways akm fails are not timeouts
    expect(isAkmTimeout("akm index failed (exit 137): ")).toBe(false);
    expect(isAkmTimeout("akm indexed 1 entries for 2 sessions")).toBe(false);
    expect(isAkmTimeout("the request timed out after 900 s")).toBe(false);
  });

  test("counts the sessions that are longer than akm's keyword index keeps", () => {
    const session = (n: number) => ({ date: "2023/05/20 (Sat) 02:21", turns: [{ role: "user", content: "x".repeat(n) }] });
    const header = "# Chat session\n\nSession date: 2023/05/20 (Sat) 02:21\n\nuser: \n".length;
    expect(PROJECTION_LIMIT).toBe(16_384);
    // the memory file is what counts: the heading, the date and the role go with the text
    expect(overProjectionLimit([session(PROJECTION_LIMIT - header), session(PROJECTION_LIMIT - header + 1), session(100_000), session(0)])).toBe(2);
    expect(overProjectionLimit([])).toBe(0);
  });

  test("stops when akm indexes a different number of entries than there are sessions", async () => {
    const dir = tmp();
    const broken = join(dir, "broken.ts");
    writeFileSync(broken, 'console.log(JSON.stringify({ totalEntries: 1 }));');
    const akm = new Akm(sandboxRunning(broken, dirs));
    await expect(akm.load([{ date: "d", turns: [] }, { date: "d", turns: [] }], "q")).rejects.toThrow("indexed 1 entries for 2 sessions");
  });
});
