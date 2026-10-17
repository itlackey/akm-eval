import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePublicAssets } from "./fakes";
import { collectQuestion, sampling } from "./collect";
import type { Akm } from "./akm";
import type { Question } from "./dataset";
import { chat } from "./llm";
import { rawOf, summarize } from "./score";
import { isRunning, resolveEndpoints } from "./run";

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => server?.stop(true));
const question = {
  question_id: "q", question_type: "single-session-user", question: "Which color?", answer: "blue", question_date: "2024-02-01",
  haystack_sessions: [[{ role: "user", content: "My color is blue." }]], haystack_dates: ["2024-01-01"],
  haystack_session_ids: ["s"], answer_session_ids: ["s"],
} as Question;
const akm = { load: async () => new Map([["m", 0]]), search: async () => ["m"] } as unknown as Akm;
const usage = { prompt_tokens: 7, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 2 }, completion_tokens_details: { reasoning_tokens: 1 }, cost: 0.001 };

test("model chat settings override only the selected role and persist the actual token field", async () => {
  const bodies: Record<string, unknown>[] = [];
  server = Bun.serve({ port: 0, async fetch(req) { bodies.push(await req.json() as Record<string, unknown>); return Response.json({ choices: [{ message: { content: "blue" } }], usage }); } });
  const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "reader" };
  const reader = { ...endpoint, chat: { max_completion_tokens: 2048, reasoning_effort: "none" } };
  const result = await chat(reader, "q", { maxTokens: 512 });
  await chat(endpoint, "q", { maxTokens: 10 });
  expect(bodies[0]).toMatchObject({ max_completion_tokens: 2048, reasoning_effort: "none" });
  expect(bodies[0]).not.toHaveProperty("max_tokens");
  expect(bodies[1]).toMatchObject({ max_tokens: 10 });
  expect(bodies[1]).not.toHaveProperty("reasoning_effort");
  expect(result.usage).toMatchObject({ cached_tokens: 2, reasoning_tokens: 1, cost_usd: 0.001, retries: 0, failed: false });
  expect(sampling(false, reader, endpoint).max_tokens).toEqual({ model: 2048, judge: 10 });
  const settings = resolveEndpoints({ model: "configured", "judge-model": "judge" }, m => { throw new Error(m); }, {}, { configured: { base_url: endpoint.baseUrl, chat: reader.chat }, judge: { base_url: endpoint.baseUrl } });
  expect(settings.model.chat).toEqual(reader.chat);
  expect(settings.judge.chat).toBeUndefined();
});

test("chat.temperature goes to the role whose line sets it, and sampling records the reader's and the judge's apart", async () => {
  const bodies: Record<string, unknown>[] = [];
  server = Bun.serve({ port: 0, async fetch(req) { bodies.push(await req.json() as Record<string, unknown>); return Response.json({ choices: [{ message: { content: "blue" } }], usage }); } });
  const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
  const reader = { ...endpoint, chat: { temperature: 1 } };
  await chat(reader, "q");
  await chat(endpoint, "q");
  expect(bodies.map((b) => b.temperature)).toEqual([1, 0]);
  // a temperature of 0 on a line is a setting, and a line's setting wins over what a caller asks for
  await chat({ ...endpoint, chat: { temperature: 0 } }, "q", { temperature: 0.7 });
  expect(bodies[2]?.temperature).toBe(0);
  expect(sampling(false, reader, endpoint)).toMatchObject({ temperature: 1, judge_temperature: 0 });
  expect(sampling(false, endpoint, { ...endpoint, chat: { temperature: 0.5 } })).toMatchObject({ temperature: 0, judge_temperature: 0.5 });
  expect(sampling(true, reader, endpoint)).toMatchObject({ temperature: null, judge_temperature: null });
  const lines = { configured: { base_url: endpoint.baseUrl, chat: { temperature: 1 } }, judge: { base_url: endpoint.baseUrl, chat: { temperature: 0.3 } } };
  const settings = resolveEndpoints({ model: "configured", "judge-model": "judge" }, m => { throw new Error(m); }, {}, lines);
  expect([settings.model.chat, settings.judge.chat]).toEqual([{ temperature: 1 }, { temperature: 0.3 }]);
});

test("identical answers share one grade and record each real call only once", async () => {
  let judges = 0;
  server = Bun.serve({ port: 0, async fetch(req) {
    const body = await req.json() as { messages: { content: string }[] };
    const grade = body.messages[0]!.content.includes("Model Response:");
    return Response.json({ model: "observed", choices: [{ message: { content: grade ? (++judges === 1 ? "yes" : "no") : "blue" }, finish_reason: "stop" }], usage });
  } });
  const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
  const row = await collectQuestion(question, { akm, model: endpoint, judge: endpoint });
  expect(judges).toBe(1);
  expect([row.without_akm?.correct, row.with_akm?.correct]).toEqual([true, true]);
  expect(row.without_akm?.judge_usage?.cost_usd).toBe(0.001);
  expect(row.with_akm?.judge_usage).toBeNull();
  expect(row.with_akm?.judge_cached).toBe(true);
  const recovered = rawOf(row);
  expect("raw" in recovered && recovered.raw.without_akm?.reader_usage?.cached_tokens).toBe(2);
});

test("an undecidable grade is a grading failure, not a wrong reader answer", async () => {
  server = Bun.serve({ port: 0, async fetch(req) {
    const body = await req.json() as { messages: { content: string }[] };
    return Response.json({ choices: [{ message: { content: body.messages[0]!.content.includes("Model Response:") ? "I am uncertain" : "blue" } }], usage });
  } });
  const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
  const row = await collectQuestion(question, { akm, model: endpoint, judge: endpoint });
  expect(row.without_akm).toMatchObject({ ok: false, correct: null, error: "judge: undecidable verdict: I am uncertain" });
  expect(summarize([row])).toMatchObject({ n_scored: 0, n_errored: 1, judge_undecidable: 2 });
});

test("a judge that reasons first is read by what follows its reasoning, as the reader is", async () => {
  let verdict = "<think>The response says blue, which is the key, so probably yes. Or is it no?</think>\n\nYes.";
  server = Bun.serve({ port: 0, async fetch(req) {
    const body = await req.json() as { messages: { content: string }[] };
    return Response.json({ choices: [{ message: { content: body.messages[0]!.content.includes("Model Response:") ? verdict : "blue" } }], usage });
  } });
  const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
  const yes = await collectQuestion(question, { akm, model: endpoint, judge: endpoint });
  expect(yes.without_akm).toMatchObject({ ok: true, correct: true, decidable: true, verdict: "Yes.", error: null });
  expect(summarize([yes])).toMatchObject({ n_scored: 1, n_errored: 0, judge_undecidable: 0 });
  // the word yes in its thinking decides nothing
  verdict = "<think>It could be yes, but the response is wrong.</think>No";
  const no = await collectQuestion(question, { akm, model: endpoint, judge: endpoint });
  expect(no.without_akm).toMatchObject({ ok: true, correct: false, verdict: "No", error: null });
});

test("a judge that ran out of tokens inside its reasoning has no verdict: a grading error that shows how its reply began", async () => {
  server = Bun.serve({ port: 0, async fetch(req) {
    const body = await req.json() as { messages: { content: string }[] };
    const grade = body.messages[0]!.content.includes("Model Response:");
    return Response.json({ choices: [{ message: { content: grade ? "<think>Let me see whether" : "blue" }, finish_reason: grade ? "length" : "stop" }], usage });
  } });
  const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
  const row = await collectQuestion(question, { akm, model: endpoint, judge: endpoint });
  expect(row.without_akm).toMatchObject({ ok: false, correct: null, verdict: "", error: "judge: undecidable verdict: <think>Let me see whether (cut off at the token limit)" });
  expect(summarize([row])).toMatchObject({ n_scored: 0, n_errored: 1, judge_undecidable: 2 });
});

test("failed requests retain latency and retry count without inventing usage", async () => {
  server = Bun.serve({ port: 0, fetch: () => new Response("context overflow", { status: 400 }) });
  const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
  const row = await collectQuestion(question, { akm, model: endpoint, judge: endpoint });
  expect(row.without_akm?.reader_usage).toMatchObject({ failed: true, retries: 0, prompt_tokens: null, cost_usd: null });
});

/** perl is there to make a zombie with, on a host with /proc to read it from. */
const zombies = existsSync("/proc/self/status") && Bun.which("perl") !== null;

test("isRunning tells a running process from one that is gone", async () => {
  const child = Bun.spawn([process.execPath, "-e", "await Bun.sleep(30_000)"], { stdout: "ignore", stderr: "ignore" });
  expect(isRunning(child.pid)).toBe(true);
  expect(isRunning(process.pid)).toBe(true);
  child.kill();
  await child.exited; // Bun reaps it
  expect(isRunning(child.pid)).toBe(false);
});

test.skipIf(!zombies)("a zombie, which signal 0 still reaches, is not running", async () => {
  // perl forks a child that exits at once and does not wait for it, so it stays a zombie of perl for as long as perl sleeps
  const parent = Bun.spawn(["perl", "-e", "$| = 1; my $pid = fork(); exit 0 unless $pid; print qq($pid\\n); sleep 30"], { stdout: "pipe", stderr: "ignore" });
  try {
    const reader = parent.stdout.getReader();
    let out = "";
    while (!out.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      out += new TextDecoder().decode(value);
    }
    const pid = Number(out);
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    for (let i = 0; i < 200 && !/^State:\s*Z/m.test(readFileSync(`/proc/${pid}/status`, "utf8")); i++) await Bun.sleep(10);
    expect(() => process.kill(pid, 0)).not.toThrow();
    expect(isRunning(pid)).toBe(false);
  } finally {
    parent.kill();
  }
});

test("SIGTERM checkpoints the first question, stops the owned AKM process and removes the sandbox", async () => {
  const dir = mkdtempSync(join(tmpdir(), "longmem-stop-"));
  const assets = join(dir, "assets"); writePublicAssets(assets, [question]);
  const childScript = join(dir, "child.ts");
  writeFileSync(childScript, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(join(dir, "child-pid"))}, String(process.pid)); await Bun.sleep(60_000);`);
  const runner = join(dir, "runner.ts");
  writeFileSync(runner, `
    import { runCorpus } from ${JSON.stringify(new URL("./run.ts", import.meta.url).pathname)};
    import { Akm } from ${JSON.stringify(new URL("./akm.ts", import.meta.url).pathname)};
    import { sandboxIn } from ${JSON.stringify(new URL("../../../lib/akm/akm.ts", import.meta.url).pathname)};
    const dir = ${JSON.stringify(dir)};
    const akm = new Akm({ ...sandboxIn(dir + "/sandbox"), cmd: [${JSON.stringify(process.execPath)}, ${JSON.stringify(childScript)}] });
    await runCorpus({ name: "public", folder: dir + "/assets", rewrite: false }, { label: "stop", sampleSeed: 1 }, { akm, model: null, judge: null, version: "fixture", build: { akm_bin: "fixture", akm_build: null, akm_build_fingerprint: null } }, { results: dir + "/results" });
  `);
  const proc = Bun.spawn([process.execPath, "--no-env-file", runner], { stdout: "ignore", stderr: "pipe" });
  let child = 0;
  try {
    for (let i = 0; i < 100 && !existsSync(join(dir, "child-pid")); i++) await Bun.sleep(20);
    expect(existsSync(join(dir, "child-pid"))).toBe(true);
    child = Number(readFileSync(join(dir, "child-pid"), "utf8"));
    const result = join(dir, "results", readdirSync(join(dir, "results"))[0]!);
    expect(JSON.parse(readFileSync(join(result, "summary.json"), "utf8")).status).toBe("running");
    proc.kill("SIGTERM");
    expect(await Promise.race([proc.exited, Bun.sleep(3000).then(() => -1)])).toBe(130);
    expect(JSON.parse(readFileSync(join(result, "summary.json"), "utf8"))).toMatchObject({ status: "aborted", aborted_reason: "interrupted by the operator", n_run: 0 });
    expect(existsSync(join(result, ".running"))).toBe(false);
    expect(existsSync(join(dir, "sandbox"))).toBe(false); // process.exit skipped the finally of main that removes it, so the handler does
    for (let i = 0; i < 100 && isRunning(child); i++) await Bun.sleep(10);
    expect(isRunning(child)).toBe(false);
  } finally {
    proc.kill(); if (child && isRunning(child)) { try { process.kill(child, "SIGKILL"); } catch {} }
    rmSync(dir, { recursive: true, force: true });
  }
});
