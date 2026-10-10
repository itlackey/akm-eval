// Test doubles shared by the tests.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, createSandbox } from "../../../lib/akm/akm.ts";

/** An akm that is a few lines of TypeScript: it keeps what the bundle holds and answers search from it. */
const FAKE_AKM = `
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
const dir = join(process.env.AKM_BUNDLE_DIR as string, "memories");
const files = (() => { try { return readdirSync(dir).sort(); } catch { return []; } })();
if (cmd === "--version") console.log("0.9.99-test");
else if (cmd === "search" && process.argv[3] === "--help") console.log("--detail=<detail> Detail level, or agent");
else if (cmd === "index") console.log(JSON.stringify({ ok: true, totalEntries: files.length }));
else if (cmd === "search") {
  const k = Number(rest[rest.indexOf("--limit") + 1]);
  const query = rest[rest.indexOf("--") + 1].toLowerCase().split(/\\W+/).filter((w) => w.length > 3);
  const scored = files.map((f) => { const text = readFileSync(join(dir, f), "utf8").toLowerCase(); return { f, n: query.filter((w) => text.includes(w)).length }; });
  const hits = scored.filter((s) => s.n > 0).sort((a, b) => b.n - a.n || a.f.localeCompare(b.f)).slice(0, k).map((s) => ({ ref: "memories/" + s.f.replace(/\\.md$/, "") }));
  console.log(JSON.stringify({ hits }));
} else { console.error("unknown command " + cmd); process.exit(1); }
`;

/** Writes the fake akm into `dir`, and returns the path of the script. */
export const fakeAkmScript = (dir: string): string => {
  const script = join(dir, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  return script;
};

/** A sandbox whose akm is this script, run by bun. Its folder goes into `cleanup`, for the test to remove. */
export const sandboxRunning = (script: string, cleanup: string[]): Sandbox => {
  const sandbox = { ...createSandbox("longmemeval-test"), cmd: ["bun", script] };
  cleanup.push(sandbox.dir);
  return sandbox;
};
