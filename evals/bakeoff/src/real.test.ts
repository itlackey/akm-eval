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

const NO_CHANGE = { noChange: true, title: "", description: "", content: "", tags: [], searchHints: [] };

/**
 * What a model that knows the answer says to the prompt of each process. For a note whose case expects no change, that is a no-change decision.
 * `mode` changes it: a reply in prose, an HTTP 500, a model that is too slow, or one that decides no-change for every note (the always-abstain treatment).
 */
function model(mode: "oracle" | "prose" | "down" | "slow" | "abstain", prompts: string[] = []) {
  const caseFor = (process: LoadedCase["process"], prompt: string): LoadedCase | undefined => cases.find((c) => c.process === process && c.files.some((f) => f.endsWith(".md") && prompt.includes(bodyOf(c.texts[f] as string).slice(0, 60))));
  return Bun.serve({
    port: 0,
    idleTimeout: 120,
    async fetch(req) {
      const body = (await req.json().catch(() => ({}))) as { messages?: { content: string }[]; response_format?: { json_schema?: { schema?: { properties?: object } } } };
      // Which process asked is read from the keys the reply must hold, not from the prompt's prose, so a prompt edit cannot break this model.
      // Those are the keys of the request's schema; the repair and enrich calls send none, and ask for their keys in the prompt as JSON field names.
      const keys = new Set(Object.keys(body.response_format?.json_schema?.schema?.properties ?? {}));
      const prompt = (body.messages ?? []).map((m) => m.content).join("\n");
      const asks = (...wanted: string[]): boolean => wanted.every((k) => (body.response_format ? keys.has(k) : prompt.includes(`"${k}"`)));
      prompts.push(prompt);
      if (mode === "down") return new Response("upstream failure", { status: 500 });
      if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 8000));
      let reply: unknown = {};
      if (mode === "prose") reply = "I cannot answer in JSON.";
      else if (asks("title", "description", "content", "tags", "searchHints")) {
        const e = caseFor("memory-inference", prompt)?.expected ?? {};
        if (e.noChange || mode === "abstain") reply = NO_CHANGE;
        else reply = { title: "A derived memory", description: `It keeps ${(e.required ?? []).join(" and ")}.`, tags: ["one", "two", "three"], searchHints: ["first hint", "second hint", "third hint"], content: `${(e.required ?? []).join(". ")}. ${e.date ?? ""}` };
      } else if (asks("description", "when_to_use")) {
        const c = cases.find((x) => x.process === "schema-repair" && prompt.includes(bodyOf(x.texts[x.files[0] as string] as string).slice(0, 40)));
        reply = { description: `This lesson covers ${(c?.expected.keywords ?? []).join(" and ")} in some detail.`, when_to_use: `Use when you ${(c?.expected.trigger ?? ["act"])[0]} something in a release.` };
      } else if (asks("tags", "description") && !asks("title")) {
        const e = caseFor("remember-enrich", prompt)?.expected ?? {};
        reply = { tags: (e.keywords ?? []).map((k) => k.toLowerCase()).slice(0, 4), description: `About ${(e.keywords ?? []).join(" ")}.`, ...(e.observed_at ? { [prompt.includes('"observed":') ? "observed" : "observed_at"]: e.observed_at } : {}) };
      } else if (asks("summary", "key_topics")) {
        const opening = (x: LoadedCase): string => String((JSON.parse((x.texts[x.files[0] as string] as string).split("\n")[0] as string) as { message: { content: unknown } }).message.content).slice(0, 60);
        const e = cases.find((x) => x.process === "session-summary" && prompt.includes(opening(x)))?.expected ?? {};
        reply = { summary: `The session covered ${(e.required ?? []).join(", ")} and ended well, with the canary and the health checks green.`, key_topics: e.topics, tags: ["release"] };
      } else if (asks("candidates")) reply = { candidates: [], rationale_if_empty: "Nothing durable in this session." };
      else if (asks("operations")) {
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

  const run = async (mode: "oracle" | "prose" | "down" | "slow" | "abstain", list: LoadedCase[], more: Partial<Parameters<typeof runCase>[1]> = {}, prompts: string[] = []) => {
    const server = model(mode, prompts);
    try {
      const rows = [];
      for (const c of list) rows.push(await runCase(c, { baseUrl: `http://localhost:${server.port}/v1`, model: "scripted-model", hasKey: true, ...more }));
      return rows;
    } finally {
      server.stop(true);
    }
  };

  const inference = cases.filter((c) => c.process === "memory-inference");
  const restraint = inference.filter((c) => c.expected.noChange);
  const one = (id: string) => cases.find((c) => c.id === id) as LoadedCase;

  test("every case of the public corpus, answered right, is correct: a child where one is wanted, akm's no-change decision where it is not", async () => {
    const prompts: string[] = [];
    const rows = await run("oracle", cases, {}, prompts);
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual(cases.map((c) => [c.id, c.expected.noChange ? "no-change" : "output", true]));
    for (const r of rows.filter((x) => x.outcome === "no-change")) expect(r.inference).toMatchObject({ noChange: 1, skippedNoFacts: 0, writtenFacts: 0 }); // from akm's own result, not from a missing file
    for (const r of rows.filter((x) => x.process === "memory-inference" && x.outcome === "output")) expect(r.inference).toMatchObject({ noChange: 0, writtenFacts: 1 });
    const contextFor = (id: string) => {
      const cs = one(id);
      const prompt = prompts.find((p) => p.includes(bodyOf(cs.texts[cs.files[0] as string] as string).slice(0, 60))) as string;
      return JSON.parse(prompt.split("Source context:\n")[1]?.split("\n\nBody:\n")[0] ?? "{}");
    };
    expect(contextFor("infer-scoped-incident").scope).toEqual(one("infer-scoped-incident").expected.scope);
    expect(contextFor("infer-flat-scoped-request").scope).toEqual(one("infer-flat-scoped-request").expected.scope);
    const observed = (context: Record<string, unknown>) => context.observed ?? context.observed_at; // akm drops the `_at` in newer builds
    expect(contextFor("infer-metadata-observation-date")).toMatchObject({ updated: "2026-10-18" });
    expect(observed(contextFor("infer-metadata-observation-date"))).toBe("2026-06-12");
    expect(observed(contextFor("infer-file-date-not-observation"))).toBeUndefined();
  }, 600_000);

  test("a model that decides no-change for every note passes the notes that need none and fails every note that needs a child", async () => {
    const rows = await run("abstain", inference);
    expect(rows.map((r) => r.outcome)).toEqual(inference.map(() => "no-change"));
    expect(rows.map((r) => [r.id, r.correct])).toEqual(inference.map((c) => [c.id, !!c.expected.noChange]));
    expect(rows.filter((r) => !r.correct).every((r) => r.checks?.["does not abstain"] === false)).toBe(true);
    expect(restraint.length).toBeGreaterThan(0);
  }, 600_000);

  test("a malformed reply is unusable, never a no-change, even for a note that needs no child", async () => {
    const rows = await run("prose", restraint);
    expect(rows.map((r) => [r.outcome, r.correct, r.inference?.noChange, r.inference?.skippedNoFacts])).toEqual(restraint.map(() => ["unusable", false, 0, 1]));
  }, 600_000);

  test("a memory akm does not consider, so that no derived memory and no count follow, is an error and not a no-change", async () => {
    const stamped = { ...one("infer-tool-tally-noise"), texts: { "memories/session-tool-tally.md": one("infer-tool-tally-noise").texts["memories/session-tool-tally.md"]?.replace("updated:", "inferenceProcessed: true\nupdated:") as string } };
    const [row] = await run("oracle", [stamped]);
    expect(row).toMatchObject({ outcome: "error", correct: null });
    expect(row?.error).toContain("its counters do not explain it");
  }, 600_000);

  test("a pass that is switched off is an error saying so, not a no-change", async () => {
    const off = { strategy: "", configPatch: { path: "off", sha256: "", patch: { improve: { strategies: { "bakeoff-memory-inference": { processes: { memoryInference: { enabled: false } } } } } } } };
    const [row] = await run("oracle", [one("infer-tool-tally-noise")], { overrides: off });
    expect(row).toMatchObject({ outcome: "error", correct: null });
    expect(row?.error).toContain("improve ran no memory inference");
  }, 600_000);

  test("a model that is too slow is a timeout error, not a no-change", async () => {
    const [row] = await run("slow", [one("infer-tool-tally-noise")], { timeoutMs: 2000 });
    expect(row).toMatchObject({ outcome: "error", correct: null, timed_out: true });
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
