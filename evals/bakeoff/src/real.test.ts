import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { atLeast } from "../../reflect/src/lib.ts";
import { type LoadedCase, loadCases, runCase } from "./lib.ts";
import { MIN_AKM } from "./run.ts";

/**
 * The real akm these tests run against, only when AKM_EVAL_REAL_AKM=1 asks for it: an akm that happens to be on PATH, or an
 * AKM_BIN the caller exported, is never picked up by itself, so the default suite stays fake-only whatever is installed.
 * It must be new enough to run this eval. The tests use the public corpus and a model that answers as a script says, so they need no model.
 */
function realAkm(): string | undefined {
  if (process.env.AKM_EVAL_REAL_AKM !== "1") return undefined;
  const cmd = (process.env.AKM_BIN?.trim() || "akm").split(/\s+/);
  try {
    const out = Bun.spawnSync([...cmd, "--version"], { stdout: "pipe", stderr: "ignore" });
    const version = out.stdout.toString().match(/\d+\.\d+\.\d+\S*/)?.[0];
    return out.exitCode === 0 && version && atLeast(version, MIN_AKM) ? version : undefined;
  } catch {
    return undefined;
  }
}
const realVersion = realAkm();

const cases = loadCases(join(import.meta.dir, "..", "assets"));
const bodyOf = (text: string): string => text.replace(/^---[\s\S]*?\n---\n?/, "").trim();

/** What a model that knows the answer says to the prompt of each process. `mode` makes it fail: a reply in prose, or an HTTP 500. */
function model(mode: "oracle" | "prose" | "down") {
  const caseFor = (process: LoadedCase["process"], prompt: string): LoadedCase | undefined => cases.find((c) => c.process === process && c.files.some((f) => f.endsWith(".md") && prompt.includes(bodyOf(c.texts[f] as string).slice(0, 60))));
  return Bun.serve({
    port: 0,
    idleTimeout: 120,
    async fetch(req) {
      const body = (await req.json().catch(() => ({}))) as { messages?: { content: string }[] };
      const prompt = (body.messages ?? []).map((m) => m.content).join("\n");
      if (mode === "down") return new Response("upstream failure", { status: 500 });
      let reply: unknown = {};
      if (mode === "prose") reply = "I cannot answer in JSON.";
      else if (/Compress the memory/.test(prompt)) {
        const e = caseFor("memory-inference", prompt)?.expected ?? {};
        reply = { title: "A derived memory", description: `It keeps ${(e.required ?? []).join(" and ")}.`, tags: ["one", "two", "three"], searchHints: ["first hint", "second hint", "third hint"], content: `${(e.required ?? []).join(". ")}. ${e.date ?? ""}` };
      } else if (/memory tagger/.test(prompt)) {
        const e = caseFor("remember-enrich", prompt)?.expected ?? {};
        reply = { tags: (e.keywords ?? []).map((k) => k.toLowerCase()).slice(0, 4), description: `About ${(e.keywords ?? []).join(" ")}.`, ...(e.observed_at ? { observed_at: e.observed_at } : {}) };
      } else if (/Generate the missing frontmatter/.test(prompt)) {
        const c = cases.find((x) => x.process === "schema-repair" && prompt.includes(bodyOf(x.texts[x.files[0] as string] as string).slice(0, 40)));
        reply = { description: `This lesson covers ${(c?.expected.keywords ?? []).join(" and ")} in some detail.`, when_to_use: `Use when you ${(c?.expected.trigger ?? ["act"])[0]} something in a release.` };
      } else if (/summarizing an agent coding session/.test(prompt)) {
        const e = cases.find((x) => x.process === "session-summary")?.expected ?? {};
        reply = { summary: `The session covered ${(e.required ?? []).join(", ")} and ended well, with the canary and the health checks green.`, key_topics: e.topics, tags: ["release"] };
      } else if (/extracting durable engineering insights/.test(prompt)) reply = { candidates: [], rationale_if_empty: "Nothing durable in this session." };
      else if (/consolidate assistant/.test(prompt)) {
        const wanted = new Set(cases.filter((c) => c.process === "consolidate-promote").flatMap((c) => c.expected.promote ?? []));
        const shown = [...prompt.matchAll(/^\[\d+\] (memories\/[A-Za-z0-9-]+)/gm)].map((m) => m[1] as string);
        reply = { operations: shown.filter((r) => wanted.has(r)).map((ref) => ({ op: "promote", ref, knowledgeRef: `knowledge/${ref.split("/")[1]}`, reason: "A stable fact.", description: "A durable fact.", confidence: 0.95 })) };
      }
      return Response.json({ id: "x", object: "chat.completion", model: "scripted-model", choices: [{ index: 0, message: { role: "assistant", content: typeof reply === "string" ? reply : JSON.stringify(reply) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    },
  });
}

describe.skipIf(!realVersion)(`with the akm on this machine (${realVersion})`, () => {
  const saved = { AKM_BIN: process.env.AKM_BIN, MODEL_API_KEY: process.env.MODEL_API_KEY };
  beforeAll(() => {
    process.env.MODEL_API_KEY = "real-akm-test-key-8431";
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const run = async (mode: "oracle" | "prose" | "down", list: LoadedCase[]) => {
    const server = model(mode);
    try {
      const rows = [];
      for (const c of list) rows.push(await runCase(c, { baseUrl: `http://localhost:${server.port}/v1`, model: "scripted-model", hasKey: true }));
      return rows;
    } finally {
      server.stop(true);
    }
  };

  test("every case of the public corpus, answered right, is correct, and akm wrote what the scorer reads", async () => {
    const rows = await run("oracle", cases);
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual(cases.map((c) => [c.id, "output", true]));
  }, 600_000);

  test("a reply in prose is unusable for every case, and never correct", async () => {
    const rows = await run("prose", cases);
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual(cases.map((c) => [c.id, "unusable", false]));
    for (const r of rows) expect(r.reason).not.toBe("");
  }, 600_000);

  test("an endpoint that is down is an error for every case, left out of the counts", async () => {
    const rows = await run("down", cases);
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual(cases.map((c) => [c.id, "error", null]));
  }, 600_000);
});
