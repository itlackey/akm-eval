// Test doubles for the LongMemEval cases: an akm that does native inference by writing a child note per memory, and a model server that
// answers as a reader and as the judge. Both record what they were asked.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A few lines of TypeScript run by bun. It keeps what the bundle holds, writes `<name>.derived.md` for each memory on `improve` (the first
 * line of the session, so a "summary" keeps the first turn), and answers search by word overlap. Every command is appended to
 * FAKE_AKM_LOG; FAKE_AKM_IMPROVE_SLEEP is a number of milliseconds `improve` sleeps first, and FAKE_AKM_IMPROVE_FAIL makes it exit non-zero.
 */
const FAKE_AKM = `
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
const dir = join(process.env.AKM_BUNDLE_DIR as string, "memories");
const files = () => { try { return readdirSync(dir).filter((f) => f.endsWith(".md")).sort(); } catch { return []; } };
if (process.env.FAKE_AKM_LOG) appendFileSync(process.env.FAKE_AKM_LOG, [cmd, ...rest.filter((a) => a === "--help" || a.startsWith("memories/"))].join(" ") + "\\n");
if (cmd === "--version") console.log("0.10.fake");
else if (cmd === "search" && process.argv[3] === "--help") console.log("--detail=<detail> Detail level, or agent");
else if (cmd === "index") console.log(JSON.stringify({ ok: true, totalEntries: files().length }));
else if (cmd === "improve") {
  if (process.env.FAKE_AKM_IMPROVE_SLEEP) await Bun.sleep(Number(process.env.FAKE_AKM_IMPROVE_SLEEP));
  if (process.env.FAKE_AKM_IMPROVE_FAIL) { console.error("improve failed on purpose"); process.exit(1); }
  const sources = files().filter((f) => !f.includes(".derived."));
  for (const f of sources) {
    const body = readFileSync(join(dir, f), "utf8").split("\\n").filter((l) => l.startsWith("user:"))[0] ?? "";
    writeFileSync(join(dir, f.replace(/\\.md$/, ".derived.md")), "Derived note: " + body.slice(0, 160) + "\\n");
  }
  console.log(JSON.stringify({ ok: true, memoryInference: { considered: sources.length, noChange: 0, writtenFacts: sources.length, skippedNoFacts: 0, htmlErrorCount: 0 } }));
} else if (cmd === "search") {
  const k = Number(rest[rest.indexOf("--limit") + 1]);
  const query = rest[rest.indexOf("--") + 1].toLowerCase().split(/\\W+/).filter((w) => w.length > 3);
  const scored = files().map((f) => { const text = readFileSync(join(dir, f), "utf8").toLowerCase(); return { f, n: query.filter((w) => text.includes(w)).length }; });
  const hits = scored.filter((s) => s.n > 0).sort((a, b) => b.n - a.n || a.f.localeCompare(b.f)).slice(0, k).map((s) => ({ ref: "memories/" + s.f.replace(/\\.md$/, "") }));
  console.log(JSON.stringify({ hits, searchMode: "keyword" }));
} else if (cmd === "show") {
  const name = rest[0].replace(/^memories\\//, "");
  console.log(JSON.stringify({ ref: rest[0], content: readFileSync(join(dir, name + ".md"), "utf8") }));
} else { console.error("unknown command " + cmd); process.exit(1); }
`;
export const writeFakeAkm = (dir: string): string => {
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  return script;
};

export interface FakeModel {
  url: string;
  /** Every prompt the server was sent, with whether it came from the judge. */
  calls: { prompt: string; judge: boolean }[];
  /** The next requests fail with HTTP 500 while this is true. */
  failing: boolean;
  stop: () => void;
}
/**
 * A chat-completions server. As the judge (its prompt asks for yes or no) it answers "yes" when the model response holds `gold`, else "no".
 * As the reader it answers `gold` when the history chats hold it, else that it does not know.
 */
export function fakeModel(gold: string): FakeModel {
  const calls: FakeModel["calls"] = [];
  const state = { failing: false };
  const server = Bun.serve({ port: 0, async fetch(req) {
    const body = (await req.json()) as { messages: { content: string }[] };
    const prompt = body.messages[0]!.content;
    const judge = /Answer yes or no only|Does the model correctly identify/.test(prompt);
    calls.push({ prompt, judge });
    if (state.failing) return new Response("busy", { status: 500 });
    const response = prompt.split("Model Response:")[1] ?? "";
    const text = judge ? (response.includes(gold) ? "yes" : "no") : prompt.split("History Chats:")[1]?.includes(gold) ? `The detail is ${gold}.` : "I do not know.";
    return Response.json({ model: "fake-model", choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: Math.ceil(prompt.length / 4), completion_tokens: 8 } });
  } });
  return { url: `http://localhost:${server.port}/v1`, calls, get failing() { return state.failing; }, set failing(v: boolean) { state.failing = v; }, stop: () => server.stop(true) };
}
