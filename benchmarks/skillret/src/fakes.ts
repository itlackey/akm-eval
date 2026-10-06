// Test doubles shared by the tests: an akm that is a few lines of TypeScript, and a small dataset in the files' format.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, createSandbox } from "../../../lib/akm/akm.ts";

/**
 * An akm that counts the skills of its bundle and answers `search` and `curate` by how many words of at least four
 * letters of the query a skill's SKILL.md holds, best first and then by id. A query that says FLAKY fails the first time
 * it is asked, BROKEN always fails, STRAY returns a skill that is not in the library, EMPTY returns nothing and
 * CURATEDIFF has curate answer in the reverse of search's order.
 *
 * Its config says whether it is semantic. A semantic akm embeds every skill when it indexes, except that a skill that says
 * NOEMBED is left out, and answers with every skill, the ones that share no word with the query after the others and
 * each group by id, last first, as a vector search does. It answers with keyword search alone, "fts-fallback", to a
 * query that says FALLBACK.
 */
const FAKE_AKM = `
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
const skills = join(process.env.AKM_BUNDLE_DIR as string, "skills");
const ids = (() => { try { return readdirSync(skills).sort(); } catch { return []; } })();
const semantic = JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR as string, "config.json"), "utf8")).semanticSearchMode === "auto";
if (cmd === "--version") console.log("0.9.99-test");
else if (cmd === "index") {
  const left = ids.filter((id) => readFileSync(join(skills, id, "SKILL.md"), "utf8").includes("NOEMBED")).length;
  console.log(JSON.stringify({ ok: true, totalEntries: ids.length, verification: { embeddingCount: semantic ? ids.length - left : 0, message: "embedded" } }));
} else if (cmd === "search" || cmd === "curate") {
  const k = Number(rest[rest.indexOf("--limit") + 1]);
  const query = rest[rest.indexOf("--") + 1];
  const seen = join(process.env.AKM_STATE_DIR as string, "flaky-" + cmd);
  if (query.includes("FLAKY") && !existsSync(seen)) { writeFileSync(seen, "x"); console.error("busy"); process.exit(75); }
  if (query.includes("BROKEN")) { console.error("boom"); process.exit(70); }
  const words = query.toLowerCase().split(/\\W+/).filter((w) => w.length > 3);
  const scored = ids.map((id) => { const text = readFileSync(join(skills, id, "SKILL.md"), "utf8").toLowerCase(); return { id, n: words.filter((w) => text.includes(w)).length }; });
  const fellBack = semantic && query.includes("FALLBACK");
  const vectors = semantic && !fellBack;
  let refs = scored.filter((s) => vectors || s.n > 0).sort((a, b) => b.n - a.n || (vectors ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id))).slice(0, k).map((s) => "skills/" + s.id);
  if (query.includes("STRAY")) refs = ["skills/not-a-skill"];
  if (query.includes("EMPTY")) refs = [];
  if (cmd === "curate" && query.includes("CURATEDIFF")) refs = refs.reverse();
  const hits = refs.map((ref) => ({ ref }));
  const answer = { searchMode: fellBack ? "fts-fallback" : vectors ? "semantic" : "keyword", ...(fellBack ? { warnings: ["Vector search unavailable: local embedding model is unavailable (request failed)"] } : {}) };
  console.log(JSON.stringify(cmd === "search" ? { hits, ...answer } : { items: hits, ...answer }));
} else { console.error("unknown command " + cmd); process.exit(1); }
`;

/** Writes the fake akm into `dir`, and returns the path of the script. */
export function fakeAkmScript(dir: string): string {
  const script = join(dir, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  return script;
}

/** A sandbox whose akm is this script, run by bun, with keyword search or semantic. Its folder goes into `cleanup`, for the test to remove. */
export function sandboxRunning(script: string, cleanup: string[], semantic = false): Sandbox {
  const sandbox = { ...createSandbox("skillret-test", { semantic }), cmd: ["bun", script] };
  cleanup.push(sandbox.dir);
  return sandbox;
}

export interface Split {
  skills: [id: string, text: string][];
  /** Query id, text and the ids it needs. */
  queries: [id: string, query: string, needs: string[]][];
}

const jsonl = (rows: object[]): string => rows.map((r) => `${JSON.stringify(r)}\n`).join("");

/**
 * Writes the six data files and ASSETS.lock into `dir`, the way the dataset has them: skills with a skill_md and a body,
 * queries with their skill_ids, and one qrel for each pair. The lock holds the real sizes, checksums and line counts, with
 * every url under `baseUrl`, for a test that fetches them.
 */
export function writeAssets(dir: string, test: Split, train: Split, baseUrl = "http://127.0.0.1:1"): void {
  mkdirSync(dir, { recursive: true });
  const files: Record<string, string> = {};
  for (const [name, split] of [["test", test], ["train", train]] as const) {
    files[`${name}-skills.jsonl`] = jsonl(split.skills.map(([id, text]) => ({ id, name: id, description: "d", skill_md: text, body: text })));
    files[`${name}-queries.jsonl`] = jsonl(split.queries.map(([id, query, needs]) => ({ id, query, skill_ids: needs, k: needs.length })));
    files[`${name}-qrels.jsonl`] = jsonl(split.queries.flatMap(([id, , needs]) => needs.map((skill_id) => ({ query_id: id, skill_id, relevance: 1 }))));
  }
  const lock = {
    dataset: "tiny",
    paper: "p",
    source: "s",
    licence: "l",
    revision: "r".repeat(40),
    files: Object.fromEntries(Object.entries(files).map(([name, body]) => [name, { url: `${baseUrl}/${name}`, bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex"), records: body.split("\n").filter(Boolean).length }])),
  };
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  writeFileSync(join(dir, "ASSETS.lock"), JSON.stringify(lock, null, 2));
}
