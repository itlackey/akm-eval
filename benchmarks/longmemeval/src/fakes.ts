// Test doubles shared by the tests.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, createSandbox } from "../../../lib/akm/akm.ts";

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
