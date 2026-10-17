// The tests of lib/probe.ts, against endpoints in this process that record what they are sent.

import { afterEach, describe, expect, test } from "bun:test";
import { probeModel } from "./probe.ts";

interface Seen {
  method: string;
  /** The path and the query, as sent. */
  target: string;
  url: string;
  authorization: string | null;
  contentType: string | null;
  body: any;
}

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

/** An endpoint that records every request and answers each with `answer`. `url` is its base URL, with /v1, and `host` is what a message may name of it. */
function endpoint(answer: (seen: Seen) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const { pathname, search } = new URL(req.url);
      const text = await req.text();
      const entry: Seen = { method: req.method, target: pathname + search, url: req.url, authorization: req.headers.get("authorization"), contentType: req.headers.get("content-type"), body: text ? JSON.parse(text) : null };
      seen.push(entry);
      return answer(entry);
    },
  });
  servers.push(server);
  return { url: `http://127.0.0.1:${server.port}/v1`, host: `http://127.0.0.1:${server.port}`, seen };
}

const reply = (model: unknown = "served-model") => Response.json({ model, choices: [{ message: { content: "p" } }] });
const target = (baseUrl: string, apiKey = "the-key") => ({ baseUrl, apiKey, model: "the-model" });

describe("what is sent", () => {
  test("one chat completion: the model, one token to say, and the key as a bearer token", async () => {
    const e = endpoint(() => reply());
    expect(await probeModel(target(e.url, "secret-key"))).toEqual({ ok: true, served: "served-model" });
    expect(e.seen).toEqual([
      { method: "POST", target: "/v1/chat/completions", url: `${e.host}/v1/chat/completions`, authorization: "Bearer secret-key", contentType: "application/json", body: { model: "the-model", messages: [{ role: "user", content: "ping" }], max_tokens: 1 } },
    ]);
  });

  test("a key of none sends no authorization at all", async () => {
    const e = endpoint(() => reply());
    expect((await probeModel(target(e.url, ""))).ok).toBe(true);
    expect(e.seen.map((s) => s.authorization)).toEqual([null]);
  });

  test("/chat/completions is added to the path once, before a query, as akm's endpoint has it", async () => {
    const e = endpoint(() => reply());
    for (const base of [`${e.url}/`, `${e.url}/chat/completions`, `${e.url}?api-version=2`]) await probeModel(target(base));
    expect(e.seen.map((s) => s.target)).toEqual(["/v1/chat/completions", "/v1/chat/completions", "/v1/chat/completions?api-version=2"]);
  });
});

describe("what it answers", () => {
  test("`served` is the model name the reply carries, which may not be the one asked for, and null when the reply has none", async () => {
    for (const [answer, served] of [[reply("a-dated-snapshot"), "a-dated-snapshot"], [Response.json({ choices: [] }), null], [reply(7), null], [Response.json({}), null]] as const) {
      const e = endpoint(() => answer.clone());
      expect(await probeModel(target(e.url))).toEqual({ ok: true, served });
    }
  });

  test("a refused connection fails with what the network said and where it went, and nothing else", async () => {
    const closed = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
    const host = `http://127.0.0.1:${closed.port}`;
    closed.stop(true);
    const r = await probeModel(target(`${host}/v1/`));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toEndWith(` (${host})`);
    expect(r.reason.length).toBeGreaterThan(host.length + 4); // the message of the network comes before the host
    expect(r.reason).not.toContain("\n");
  });

  test("an HTTP error is its status, its host and the first 200 characters of its body, on one line, and is asked once", async () => {
    const body = JSON.stringify({ error: { message: `Incorrect API key provided. ${"The key is read from MODEL_API_KEY. ".repeat(12)}`, type: "invalid_request_error" } }, null, 2);
    const e = endpoint(() => new Response(body, { status: 401 }));
    const r = await probeModel(target(e.url));
    const quoted = body.replace(/\s+/g, " ").trim().slice(0, 200);
    expect(r).toEqual({ ok: false, reason: `HTTP 401 from ${e.host}: ${quoted}` });
    expect(quoted).toHaveLength(200);
    expect(body.length).toBeGreaterThan(300);
    expect(e.seen).toHaveLength(1);
  });

  test("an error with no body is its status and host alone", async () => {
    const e = endpoint(() => new Response("", { status: 502 }));
    expect(await probeModel(target(e.url))).toEqual({ ok: false, reason: `HTTP 502 from ${e.host}` });
  });

  test("there are no retries: a refusal, a rate limit and a server error are one request each", async () => {
    for (const status of [400, 404, 429, 500, 503]) {
      const e = endpoint(() => new Response(`{"error":"no ${status}"}`, { status }));
      const r = await probeModel(target(e.url));
      expect(r).toEqual({ ok: false, reason: `HTTP ${status} from ${e.host}: {"error":"no ${status}"}` });
      expect(e.seen).toHaveLength(1);
    }
  });

  test("a 2xx that is not a JSON object is a failure: a web page that answers every path, a bare string, nothing", async () => {
    for (const [text, quoted] of [["<html><body>It works!</body></html>", ": <html><body>It works!</body></html>"], ['"ok"', ': "ok"'], ["", ""], ["[1]", ": [1]"]] as const) {
      const e = endpoint(() => new Response(text, { status: 200 }));
      expect(await probeModel(target(e.url))).toEqual({ ok: false, reason: `HTTP 200 from ${e.host}, but the body is not a JSON object${quoted}` });
    }
  });

  test("no answer within the timeout is a failure that says how long it waited, and where", async () => {
    const e = endpoint(() => new Promise<Response>(() => {}));
    const r = await probeModel(target(e.url), { timeoutMs: 150 });
    expect(r).toEqual({ ok: false, reason: `no answer in 0.15s (a server that loads the model on its first request may need a second try) (${e.host})` });
    expect(e.seen).toHaveLength(1);
  });

  test("a base URL that is no URL is said so, and nothing is sent", async () => {
    for (const base of ["localhost:8080/v1", "", "/v1", "http://"]) {
      expect(await probeModel(target(base))).toEqual({ ok: false, reason: "the base URL is not a URL: it needs http:// or https:// and a host" });
    }
  });
});

describe("what a reason never holds", () => {
  test("the key, and the endpoint's URL, which can carry one, are not in what a server says back or in what the network says", async () => {
    const e = endpoint((s) => new Response(JSON.stringify({ error: `rejected ${s.authorization} sent to ${s.url}; the key is secret-key` }), { status: 401 }));
    const r = await probeModel(target(`${e.url}?key=in-the-query`, "secret-key"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("<MODEL_API_KEY>");
    expect(r.reason).toContain("<MODEL_BASE_URL>");
    for (const secret of ["secret-key", "in-the-query", `${e.url}`]) expect(r.reason).not.toContain(secret);
    expect(r.reason).toStartWith(`HTTP 401 from ${e.host}: `); // the host is what a message may name
  });
});

describe("a reasoning model", () => {
  const REFUSED = { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", type: "invalid_request_error" } };

  test("that answers 400 to max_tokens and asks for max_completion_tokens is asked once more with that, as akm asks, and is ok", async () => {
    const e = endpoint((s) => ("max_tokens" in s.body ? Response.json(REFUSED, { status: 400 }) : reply("gpt-reasoning-2026")));
    expect(await probeModel(target(e.url))).toEqual({ ok: true, served: "gpt-reasoning-2026" });
    expect(e.seen.map((s) => s.body)).toEqual([
      { model: "the-model", messages: [{ role: "user", content: "ping" }], max_tokens: 1 },
      { model: "the-model", messages: [{ role: "user", content: "ping" }], max_completion_tokens: 1 },
    ]);
    expect(e.seen.map((s) => s.authorization)).toEqual(["Bearer the-key", "Bearer the-key"]);
  });

  test("is asked once more and no more, and only after a 4xx that is not a rate limit: that is a verdict on the shape of the request, as for akm", async () => {
    const stubborn = endpoint(() => Response.json(REFUSED, { status: 400 }));
    expect((await probeModel(target(stubborn.url))).ok).toBe(false);
    expect(stubborn.seen).toHaveLength(2);
    for (const [status, requests] of [[400, 2], [422, 2], [429, 1], [500, 1], [503, 1]] as const) {
      const e = endpoint(() => Response.json(REFUSED, { status }));
      expect((await probeModel(target(e.url))).ok).toBe(false);
      expect([status, e.seen.length]).toEqual([status, requests]);
    }
  });
});
