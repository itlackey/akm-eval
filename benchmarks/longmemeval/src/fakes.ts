// Test doubles shared by the tests.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, createSandbox } from "../../../lib/akm/akm.ts";
import { DATA_FILE, type Question } from "./dataset.ts";

/**
 * An akm that is a few lines of TypeScript: it keeps what the bundle holds and answers search from it. With a semantic config it
 * says so, as akm does: an index holds an embedding of each memory and a search answers `searchMode` "semantic". FAKE_AKM_SEARCH_MODE
 * names another mode for a search to answer with, FAKE_AKM_EMBEDDED another count of embeddings for the index, and FAKE_AKM_SLEEP a
 * number of milliseconds every command sleeps first.
 */
const FAKE_AKM = `
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
const dir = join(process.env.AKM_BUNDLE_DIR as string, "memories");
const files = (() => { try { return readdirSync(dir).sort(); } catch { return []; } })();
const config = (() => { try { return JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR as string, "config.json"), "utf8")); } catch { return {}; } })();
const semantic = config.semanticSearchMode !== undefined && config.semanticSearchMode !== "off";
if (process.env.FAKE_AKM_SLEEP) await Bun.sleep(Number(process.env.FAKE_AKM_SLEEP));
if (cmd === "--version") console.log("0.9.99-test");
else if (cmd === "search" && process.argv[3] === "--help") console.log("--detail=<detail> Detail level, or agent");
else if (cmd === "index") {
  const embedded = process.env.FAKE_AKM_EMBEDDED === undefined ? files.length : Number(process.env.FAKE_AKM_EMBEDDED);
  console.log(JSON.stringify({ ok: true, totalEntries: files.length, ...(semantic ? { verification: { embeddingCount: embedded, message: "embedded " + embedded } } : {}) }));
}
else if (cmd === "search") {
  const k = Number(rest[rest.indexOf("--limit") + 1]);
  const query = rest[rest.indexOf("--") + 1].toLowerCase().split(/\\W+/).filter((w) => w.length > 3);
  const scored = files.map((f) => { const text = readFileSync(join(dir, f), "utf8").toLowerCase(); return { f, n: query.filter((w) => text.includes(w)).length }; });
  const hits = scored.filter((s) => s.n > 0).sort((a, b) => b.n - a.n || a.f.localeCompare(b.f)).slice(0, k).map((s) => ({ ref: "memories/" + s.f.replace(/\\.md$/, "") }));
  console.log(JSON.stringify({ hits, searchMode: process.env.FAKE_AKM_SEARCH_MODE ?? (semantic ? "semantic" : "keyword") }));
} else { console.error("unknown command " + cmd); process.exit(1); }
`;

/** Writes the fake akm into `dir`, and returns the path of the script. */
export const fakeAkmScript = (dir: string): string => {
  const script = join(dir, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  return script;
};

/**
 * A sandbox whose akm is this script, run by bun. Its folder goes into `cleanup`, for the test to remove. `semantic` gives it the
 * semantic config, and `env` adds to the environment akm runs in.
 */
export const sandboxRunning = (script: string, cleanup: string[], opts: { semantic?: boolean; env?: Record<string, string> } = {}): Sandbox => {
  const made = createSandbox("longmemeval-test", opts.semantic ? { semantic: true } : {});
  const sandbox = { ...made, cmd: ["bun", script], env: { ...made.env, ...opts.env } };
  cleanup.push(sandbox.dir);
  return sandbox;
};

/** One chat session: an id, a date and a user turn with this text. */
export const evidence = (id: string, text: string) => ({ id, date: "2023/05/20 (Sat) 02:21", turns: [{ role: "user", content: text }, { role: "assistant", content: "Noted." }] });

/** Three questions with four or three sessions each, one of them an abstention question: the dataset the pipeline and generate tests run on. */
export function tinyDataset(): Question[] {
  const fill = (n: number) => Array.from({ length: n }, (_, i) => evidence(`filler_${i}`, `Chat number ${i} about gardening and tea.`));
  const make = (id: string, type: string, question: string, answer: string, ev: ReturnType<typeof evidence>[], evidenceIds: string[]): Question => {
    const sessions = [...fill(2), ...ev, ...fill(1).map((s) => ({ ...s, id: `${s.id}_b` }))];
    return {
      question_id: id,
      question_type: type,
      question,
      question_date: "2023/05/30 (Tue) 23:40",
      answer,
      answer_session_ids: evidenceIds,
      haystack_dates: sessions.map((s) => s.date),
      haystack_session_ids: sessions.map((s) => s.id),
      haystack_sessions: sessions.map((s) => s.turns),
    };
  };
  return [
    make("q-secret", "multi-session", "What is the secret answer?", "BLUE42", [evidence("answer_1", "The secret answer is BLUE42.")], ["answer_1"]),
    make("q-cats", "temporal-reasoning", "How many companions do I own?", "3", [evidence("answer_2", "I own 3 cats named Tom, Mia and Zed.")], ["answer_2"]),
    make("q-passport_abs", "single-session-user", "What is my passport identifier?", "You never mentioned it.", [], []),
  ];
}

/** Writes a public assets folder: the questions, and an ASSETS.lock that pins them by their sha256. */
export function writePublicAssets(dir: string, questions: Question[] = tinyDataset()): void {
  mkdirSync(dir, { recursive: true });
  const data = JSON.stringify(questions);
  writeFileSync(join(dir, DATA_FILE), data);
  writeFileSync(join(dir, "ASSETS.lock"), JSON.stringify({ dataset: "tiny", source: "none", licence: "MIT", revision: "r".repeat(40), files: { [DATA_FILE]: { url: "http://unused", bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") } } }));
}
