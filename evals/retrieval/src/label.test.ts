import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Answer } from "./akm.ts";
import { Bm25 } from "./bm25.ts";
import { type Judge, grade, makeJudge, pending, poolQueries } from "./label.ts";
import { type Asset, type Query, parseQrels } from "./lib.ts";

const dirs: string[] = [];
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
  server?.stop(true);
  server = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "retrieval-label-"));
  dirs.push(d);
  return d;
};

const queries: Query[] = [
  { id: "q1", query: "print the pdf", kind: "direct" },
  { id: "q2", query: "write tests", kind: "paraphrase" },
];
const answer = (refs: string[]): Answer => ({ refs, mode: "keyword", seconds: 0 });

describe("poolQueries", () => {
  const bm25 = new Bm25([
    { ref: "a/print", text: "print the pdf for the printer" },
    { ref: "b/tests", text: "write tests" },
    { ref: "c/other", text: "nothing" },
  ]);

  test("pools the top of akm search, akm curate and BM25 for each query", async () => {
    const ask = async (system: "search" | "curate", query: string) => answer(query === "print the pdf" ? (system === "search" ? ["x/1", "a/print"] : ["x/2", "x/1"]) : ["b/tests"]);
    const pooled = await poolQueries(queries, ask, bm25, 10);
    expect(pooled.get("q1")).toEqual(["x/1", "a/print", "x/2"]);
    expect(pooled.get("q2")).toEqual(["b/tests"]);
  });

  test("adds the assets the author expected, graded like any other pooled asset", async () => {
    const ask = async () => answer(["x/1"]);
    const withExpected: Query[] = [{ ...queries[0], expected: ["a/print", "e/never-returned"] }, queries[1]];
    const pooled = await poolQueries(withExpected, ask, bm25, 10);
    expect(pooled.get("q1")).toEqual(["x/1", "a/print", "e/never-returned"]);
    expect(pooled.get("q2")).toEqual(["x/1", "b/tests"]);
  });

  test("takes only the top `depth` of each list", async () => {
    const ask = async (system: "search" | "curate") => answer(system === "search" ? ["s/1", "s/2", "s/3"] : ["c/1", "c/2", "c/3"]);
    const pooled = await poolQueries([queries[0]], ask, bm25, 2);
    expect(pooled.get("q1")).toEqual(["s/1", "s/2", "c/1", "c/2", "a/print"]);
  });

  test("stops when akm fails, since a pool without akm's results would be half a pool", async () => {
    const ask = async (system: "search" | "curate") => (system === "curate" ? { refs: [], mode: null, seconds: 0, error: "akm curate exited 70: boom" } : answer(["a"]));
    await expect(poolQueries(queries, ask, bm25, 10)).rejects.toThrow("q1: akm curate exited 70: boom");
  });
});

describe("pending", () => {
  const pooled = new Map([
    ["q1", ["a", "b", "c"]],
    ["q2", ["a", "d"]],
  ]);

  test("lists the pooled pairs that have no grade, in query order", () => {
    expect(pending(queries, pooled, new Set())).toEqual([
      { id: "q1", query: "print the pdf", ref: "a" },
      { id: "q1", query: "print the pdf", ref: "b" },
      { id: "q1", query: "print the pdf", ref: "c" },
      { id: "q2", query: "write tests", ref: "a" },
      { id: "q2", query: "write tests", ref: "d" },
    ]);
    expect(pending(queries, pooled, new Set(["q1\tb", "q2\ta"])).map((t) => `${t.id}/${t.ref}`)).toEqual(["q1/a", "q1/c", "q2/d"]);
    expect(pending(queries, pooled, new Set(["q1\ta", "q1\tb", "q1\tc", "q2\ta", "q2\td"]))).toEqual([]);
  });
});

describe("grade", () => {
  const asset = (ref: string) => ({ asset: { ref, type: "knowledge", name: ref, description: "d", path: `${ref}.md` } as Asset, text: `text of ${ref}` });
  const todo = ["a", "b", "c", "d"].map((ref) => ({ id: "q1", query: "print the pdf", ref }));

  test("grades each pair with the judge's prompt and appends one qrels line per grade, as it goes", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const seen: string[] = [];
    const judge: Judge = async (messages) => {
      seen.push(messages[1].content);
      return `{"grade": ${seen.length % 4}, "reason": "reason ${seen.length}"}`;
    };
    const out = await grade(todo, asset, judge, qrels, { concurrency: 1 });
    expect(out).toEqual({ total: 4, graded: 4, failed: 0, retried: 0, stopped: false, gaveUp: false });
    expect(seen[0]).toContain("Query: print the pdf\n");
    expect(seen[0]).toContain("Ref: a\n");
    expect(seen[0]).toContain("Content:\ntext of a");
    expect(parseQrels(readFileSync(qrels, "utf8")).map((r) => [r.id, r.ref, r.grade])).toEqual([["q1", "a", 1], ["q1", "b", 2], ["q1", "c", 3], ["q1", "d", 0]]);
  });

  test("keeps the grades it has when it is stopped, and a second run grades only what is left", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    let calls = 0;
    const judge: Judge = async () => `{"grade": 2, "reason": "r"}`;
    const first = await grade(todo, asset, judge, qrels, { concurrency: 1, stop: () => calls++ >= 2 });
    expect(first).toMatchObject({ graded: 2, stopped: true });
    const done = new Set(parseQrels(readFileSync(qrels, "utf8")).map((r) => `${r.id}\t${r.ref}`));
    expect([...done]).toEqual(["q1\ta", "q1\tb"]);
    const left = pending(queries.slice(0, 1), new Map([["q1", ["a", "b", "c", "d"]]]), done);
    expect(left.map((t) => t.ref)).toEqual(["c", "d"]);
    const second = await grade(left, asset, judge, qrels, { concurrency: 1 });
    expect(second).toMatchObject({ graded: 2, stopped: false });
    expect(readFileSync(qrels, "utf8").trim().split("\n")).toHaveLength(4);
  });

  test("asks again once when a reply holds no grade, and counts it", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const replies = ["I need more room to think", '{"grade": 2, "reason": "second try"}', '{"grade": 3, "reason": "r"}'];
    const judge: Judge = async () => replies.shift() as string;
    const out = await grade(todo.slice(0, 2), asset, judge, qrels, { concurrency: 1 });
    expect(out).toMatchObject({ graded: 2, failed: 0, retried: 1 });
    expect(parseQrels(readFileSync(qrels, "utf8")).map((r) => [r.ref, r.grade, r.reason])).toEqual([["a", 2, "second try"], ["b", 3, "r"]]);
  });

  test("does not append a pair it could not grade, so the next run tries it again", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    // a: graded. b: no grade twice. c: the endpoint fails. d: graded.
    const replies = ['{"grade": 3, "reason": "r"}', "I cannot say.", "Still no JSON.", "boom", '{"grade": 1, "reason": "r"}'];
    const judge: Judge = async () => {
      const r = replies.shift() as string;
      if (r === "boom") throw new Error("HTTP 500");
      return r;
    };
    const lines: string[] = [];
    const out = await grade(todo, asset, judge, qrels, { concurrency: 1, log: (l) => lines.push(l) });
    expect(out).toMatchObject({ graded: 2, failed: 2, retried: 1, gaveUp: false, lastError: "HTTP 500" });
    expect(parseQrels(readFileSync(qrels, "utf8")).map((r) => r.ref)).toEqual(["a", "d"]);
    expect(lines.filter((l) => l.includes("FAILED"))).toHaveLength(2);
  });

  test("gives up when the endpoint answers nothing, rather than failing every pair", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const many = Array.from({ length: 40 }, (_, i) => ({ id: "q1", query: "p", ref: `r${i}` }));
    let calls = 0;
    const judge: Judge = async () => {
      calls++;
      throw new Error("connection refused");
    };
    const out = await grade(many, asset, judge, qrels, { concurrency: 2 });
    expect(out).toMatchObject({ graded: 0, gaveUp: true, lastError: "connection refused" });
    expect(calls).toBeLessThan(15);
  });
});

describe("makeJudge", () => {
  const messages = [
    { role: "system" as const, content: "s" },
    { role: "user" as const, content: "u" },
  ];
  const reply = (content: string) => Response.json({ choices: [{ message: { content } }] });

  test("posts a chat request that asks for a JSON grade, with the key and no visible thinking", async () => {
    const seen: { url: string; auth: string | null; body: any }[] = [];
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen.push({ url: new URL(req.url).pathname, auth: req.headers.get("authorization"), body: await req.json() });
        return reply('{"grade": 2, "reason": "r"}');
      },
    });
    const judge = makeJudge(`http://127.0.0.1:${server.port}/v1/`, "secret", "the-model");
    expect(await judge(messages)).toBe('{"grade": 2, "reason": "r"}');
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("/v1/chat/completions");
    expect(seen[0].auth).toBe("Bearer secret");
    expect(seen[0].body).toMatchObject({ model: "the-model", messages, temperature: 0, stream: false, enable_thinking: false, reasoning_effort: "none", chat_template_kwargs: { enable_thinking: false } });
    expect(seen[0].body.max_tokens).toBeGreaterThanOrEqual(1000); // room for a model that thinks anyway
    expect(seen[0].body.response_format.json_schema.schema.required).toEqual(["grade", "reason"]);
  });

  test("sends no key header when there is no key", async () => {
    let auth: string | null = "unset";
    server = Bun.serve({
      port: 0,
      fetch(req) {
        auth = req.headers.get("authorization");
        return reply("{}");
      },
    });
    await makeJudge(`http://127.0.0.1:${server.port}/v1/chat/completions`, "", "m")(messages);
    expect(auth).toBeNull();
  });

  test("asks again without the schema when the endpoint refuses one, and not a third time", async () => {
    const bodies: any[] = [];
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = await req.json();
        bodies.push(body);
        return body.response_format ? new Response("response_format is not supported", { status: 400 }) : reply('{"grade": 1, "reason": "r"}');
      },
    });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).toBe('{"grade": 1, "reason": "r"}');
    expect(bodies.map((b) => "response_format" in b)).toEqual([true, false]);

    bodies.length = 0;
    server.stop(true);
    server = Bun.serve({ port: 0, fetch: async (req) => (bodies.push(await req.json()), new Response("bad request", { status: 400 })) });
    await expect(makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).rejects.toThrow("HTTP 400");
    expect(bodies).toHaveLength(2);
  });

  test("retries a server error, then gives up", async () => {
    let calls = 0;
    server = Bun.serve({
      port: 0,
      fetch() {
        calls++;
        return calls < 3 ? new Response("busy", { status: 503 }) : reply("{}");
      },
    });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m", 5000, 1)(messages)).toBe("{}");
    expect(calls).toBe(3);

    calls = 0;
    server.stop(true);
    server = Bun.serve({ port: 0, fetch: () => (calls++, new Response("down", { status: 502 })) });
    await expect(makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m", 5000, 1)(messages)).rejects.toThrow("HTTP 502");
    expect(calls).toBe(6);
  });

  test("when the server says to wait, every request waits, not only the one it refused", async () => {
    const arrivals: number[] = [];
    server = Bun.serve({
      port: 0,
      fetch() {
        arrivals.push(Date.now());
        return arrivals.length === 1 ? new Response("slow down", { status: 429, headers: { "Retry-After": "0.3" } }) : reply('{"grade": 1, "reason": "r"}');
      },
    });
    const judge = makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m", 5000, 1);
    const a = judge(messages);
    await new Promise((r) => setTimeout(r, 100)); // the first request is refused by now
    const b = judge(messages);
    expect(await Promise.all([a, b])).toEqual(['{"grade": 1, "reason": "r"}', '{"grade": 1, "reason": "r"}']);
    expect(arrivals).toHaveLength(3);
    expect(arrivals[1] - arrivals[0]).toBeGreaterThanOrEqual(250);
    expect(arrivals[2] - arrivals[0]).toBeGreaterThanOrEqual(250);
  });

  test("falls back to the reasoning text when the reply has no content", async () => {
    const text = 'thinking... {"grade": 3, "reason": "r"} done';
    server = Bun.serve({ port: 0, fetch: () => Response.json({ choices: [{ message: { content: "", reasoning_content: text } }] }) });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).toBe(text);
    server.stop(true);
    server = Bun.serve({ port: 0, fetch: () => Response.json({ choices: [{ message: { content: null, reasoning: text } }] }) });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).toBe(text);
  });

  test("prefers the content when there is some", async () => {
    server = Bun.serve({ port: 0, fetch: () => Response.json({ choices: [{ message: { content: '{"grade": 1, "reason": "c"}', reasoning_content: '{"grade": 3, "reason": "r"}' } }] }) });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).toBe('{"grade": 1, "reason": "c"}');
  });
});
