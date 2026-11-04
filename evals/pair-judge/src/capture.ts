// What akm's consolidate pair pass sends its judge, captured from a real run: the notes are planted as memories in a sandbox bundle, indexed with
// akm's deterministic embedder, and `akm improve --strategy consolidate` runs on them with a local stub in place of the model. The pass chooses the
// pairs (its neighbours, cosine floor, scope and twin rules), orders them by age and builds each judge call, whatever the model answers, so the stub
// sees exactly the pairs the judge would be given. The stub answers every pair with one claim on each side, which retires nothing.

import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSandbox, engineConfig, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";

/** A note to plant: the memory `memories/<name>.md` with this text, `ageDays` old by its file time (akm dates a note by it when the bundle is not a git repository). */
export interface Note {
  name: string;
  text: string;
  /** Milliseconds since the epoch the file time is set to. */
  mtimeMs: number;
}

/** One note of a pair as the judge reads it (`PairNote` of akm's pair-pass.ts). */
export interface PairNote {
  ref: string;
  type: string;
  created: string;
  updated: string;
  /** The whole note file: frontmatter and body. */
  content: string;
}

/** A pair as the pass judged it: `a` the older note (or, with equal dates, the pass's initiator). */
export interface Judged {
  a: PairNote;
  b: PairNote;
  /** The text the judge was sent as its user message. */
  prompt: string;
}

/** The first words of the pair judge's system prompt: how a request to it is told from the pass's other calls. */
const PAIR_SYSTEM = "You compare the complete claims of two assets";
const STUB_VERDICT = JSON.stringify({ reason: "stub", onlyInA: ["a claim of A"], onlyInB: ["a claim of B"], confidence: 0.5 });

/** A local chat-completions endpoint that records the requests it gets and answers the pair judge with STUB_VERDICT and every other call with `{}`. */
function recordingStub(): { url: string; pairPrompts: string[]; stop(): void } {
  const pairPrompts: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const body = (await req.json().catch(() => ({}))) as { model?: string; messages?: { role?: string; content?: unknown }[] };
      const text = (role: string): string => {
        const m = [...(body.messages ?? [])].reverse().find((x) => x.role === role);
        return typeof m?.content === "string" ? m.content : "";
      };
      const pair = text("system").startsWith(PAIR_SYSTEM);
      if (pair) pairPrompts.push(text("user"));
      const content = pair ? STUB_VERDICT : "{}";
      return Response.json({ id: "capture", object: "chat.completion", created: 0, model: body.model ?? "stub", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}/v1`, pairPrompts, stop: () => void server.stop(true) };
}

/** The header lines of one side of a pair prompt (`sideSection` in akm's pair-pass.ts), and the label the pass gave the side. */
function sideOf(prompt: string, which: "A" | "B"): { ref: string; type: string; created: string; updated: string } {
  const at = prompt.indexOf(`Asset ${which} (`);
  const m = /^Asset [AB] \([^)]*\):\nRef: (.*)\nType: (.*)\nCreated: (.*)\nUpdated: (.*)\n/.exec(prompt.slice(at));
  if (at < 0 || !m) throw new Error(`the pair prompt has no readable Asset ${which}: ${prompt.slice(0, 200)}`);
  return { ref: m[1] as string, type: m[2] as string, created: m[3] as string, updated: m[4] as string };
}

/** The pairs the pass judged among `notes`, from the prompts it sent. `akmCommand` is the akm under test: the folder it runs in is a sandbox of its own. */
export async function judgedPairs(notes: Note[], akmCommand?: string): Promise<Judged[]> {
  const stub = recordingStub();
  const saved = process.env.AKM_BIN;
  if (akmCommand !== undefined) process.env.AKM_BIN = akmCommand;
  const sandbox = createSandbox("pair-judge-capture", { keepModelKey: true });
  try {
    const config = engineConfig(stub.url, "capture-stub", false, "consolidate");
    config.engines.consolidate.temperature = 0;
    config.semanticSearchMode = "auto";
    writeConfig(sandbox, config);
    sandbox.env.AKM_EMBED_DETERMINISTIC = "1";
    const dir = join(sandbox.dir, "bundle", "memories");
    mkdirSync(dir, { recursive: true });
    const byRef = new Map<string, string>();
    for (const n of notes) {
      const file = join(dir, `${n.name}.md`);
      writeFileSync(file, n.text);
      utimesSync(file, new Date(n.mtimeMs), new Date(n.mtimeMs));
      byRef.set(`memories/${n.name}`, n.text);
    }
    await runAkmJson(sandbox, ["index", "--full"], { timeoutMs: 5 * 60_000 });
    const run = await runAkm(sandbox, ["improve", "--strategy", "consolidate", "--no-sync", "--json-to-stdout", "--format", "json"], { timeoutMs: 15 * 60_000 });
    if (run.code !== 0) throw new Error(`akm improve failed (exit ${run.code}): ${run.stderr.trim().slice(-300)}`);
    const content = (ref: string): string => byRef.get(ref) ?? (() => { throw new Error(`the pass judged ${ref}, which was not planted`); })();
    return stub.pairPrompts.map((prompt) => {
      const [a, b] = [sideOf(prompt, "A"), sideOf(prompt, "B")];
      return { a: { ...a, content: content(a.ref) }, b: { ...b, content: content(b.ref) }, prompt };
    });
  } finally {
    removeSandbox(sandbox);
    stub.stop();
    if (saved === undefined) delete process.env.AKM_BIN;
    else process.env.AKM_BIN = saved;
  }
}
