// The akm calls the retrieval eval makes, on a sandbox from lib/akm: load a library, list the assets, search, curate.
// A semantic sandbox has akm embed the assets as it indexes them, and every call has to say that it searched with them.

import { cpSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { type Sandbox, agentDetailArgs, runAkm, writeConfig } from "../../../lib/akm/akm.ts";
import { digestTree } from "../../../lib/akm/index-cache.ts";
import { type Asset, DEPTH, foldRefs } from "./lib.ts";

const TYPES = ["skill", "command", "agent", "knowledge", "workflow", "script", "lesson", "fact", "memory"];

const bundleOf = (sb: Sandbox): string => join(sb.dir, "bundle");

/**
 * What the library is to lib/akm's index cache: each of its files, by path, with the sha256 of its content. A library of
 * bundles that is indexed where it is has `extra` as well, which says where the bundles are and what adapters they have.
 */
export function libraryFiles(library: string, bundles?: string): { files: Record<string, string>; extra?: string } {
  if (bundles && existsSync(bundles)) return { files: digestTree(realpathSync(library)), extra: JSON.stringify({ root: realpathSync(library), adapters: JSON.parse(readFileSync(bundles, "utf8")) }) };
  return { files: digestTree(library) };
}

/**
 * Indexes the library in the sandbox and returns how many assets akm found. The library, or the folder a link points
 * to, is copied into the sandbox's bundle. When `bundles` is a file that exists, the library is instead a folder of
 * bundles that stays where it is: the file maps each bundle's folder name to its akm adapter, and akm gets one bundle
 * for each. Their refs then read `<folder>//<path>`. A semantic index takes as long as akm needs to embed every asset,
 * and has to hold an embedding of each.
 */
export async function load(sb: Sandbox, library: string, bundles?: string, semantic = false): Promise<number> {
  if (bundles && existsSync(bundles)) {
    const adapters = JSON.parse(readFileSync(bundles, "utf8")) as Record<string, string>;
    const root = realpathSync(library);
    const config = JSON.parse(readFileSync(join(sb.dir, "config", "config.json"), "utf8"));
    writeConfig(sb, { ...config, bundles: Object.fromEntries(Object.entries(adapters).map(([name, adapter]) => [name, { path: join(root, name), components: { main: { adapter } }, writable: false }])) });
  } else {
    cpSync(library, bundleOf(sb), { recursive: true, dereference: true });
  }
  const { stdout, stderr, code } = await runAkm(sb, ["index", "--full", "--format", "json"], { timeoutMs: semantic ? 8 * 3600_000 : 10 * 60_000 });
  if (code !== 0) throw new Error(`akm index failed (exit ${code}): ${stderr.trim().slice(-300)}`);
  const out = JSON.parse(stdout) as { totalEntries?: number; verification?: { embeddingCount?: number; message?: string } };
  const total = out.totalEntries;
  if (typeof total !== "number") throw new Error("akm index did not say how many entries it found");
  if (semantic && out.verification?.embeddingCount !== total) throw new Error(`akm embedded ${out.verification?.embeddingCount} of ${total} assets: ${out.verification?.message}`);
  return total;
}

/** Every asset akm indexed, with the file it came from. An empty search lists a type, up to its limit. */
export async function assets(sb: Sandbox, expected: number): Promise<Asset[]> {
  const found: Asset[] = [];
  for (const type of TYPES) {
    const { stdout, stderr, code } = await runAkm(sb, ["search", "", "--type", type, "--limit", "5000", ...(await agentDetailArgs(sb)), "--format", "json"]);
    if (code !== 0) throw new Error(`akm search --type ${type} failed (exit ${code}): ${stderr.trim().slice(-300)}`);
    for (const h of (JSON.parse(stdout) as { hits?: Record<string, string>[] }).hits ?? []) {
      found.push({ ref: h.ref, type: h.type, name: h.name ?? h.ref, description: h.description ?? "", path: relative(bundleOf(sb), h.path) });
    }
  }
  if (found.length !== expected) throw new Error(`akm indexed ${expected} assets, but listing the types ${TYPES.join(", ")} found ${found.length}. Add the missing type to TYPES in src/akm.ts.`);
  return found;
}

export interface Answer {
  /** The assets in akm's order, sections folded into their asset. */
  refs: string[];
  /** What akm said of each of them, from its first hit: the type, name, description and file. label needs it for a library it cannot list. */
  assets: Asset[];
  /** akm's own name for how it searched: keyword, or something else when embeddings are on. */
  mode: string | null;
  seconds: number;
  error?: string;
  /** The call ran into its time limit and was killed. It is an error too, and the only kind that says akm is slow and not wrong. */
  timedOut?: boolean;
}

/** How long one call may take before it is killed. */
const CALL_TIMEOUT_MS = 120_000;

/**
 * One `akm search` or `akm curate` call. A failed call is an answer with an error and no refs. So is an answer that
 * says it searched another way than `mode` (keyword or semantic): when akm cannot embed a query it answers with keyword
 * search, `fts-fallback`, and that is not the semantic result. A semantic call has to say `searchMode: "semantic"`: an
 * answer that does not say how it searched could be keyword rankings, and is an error as well. A keyword call that
 * does not say is taken as it comes.
 */
export async function ask(sb: Sandbox, system: "search" | "curate", query: string, limit = DEPTH, mode: "keyword" | "semantic" = "keyword", timeoutMs = CALL_TIMEOUT_MS): Promise<Answer> {
  const { stdout, stderr, code, ms, timedOut } = await runAkm(sb, [system, "--limit", String(limit), ...(await agentDetailArgs(sb)), "--format", "json", "--", query], { timeoutMs }).catch((e: Error) => ({ stdout: "", stderr: e.message, code: 127, ms: 0, timedOut: false }));
  const seconds = () => Number((ms / 1000).toFixed(2));
  const failed = (error: string, extra: { timedOut?: true } = {}): Answer => ({ refs: [], assets: [], mode: null, seconds: seconds(), error, ...extra });
  if (timedOut) return failed(`akm ${system} timed out after ${+(timeoutMs / 1000).toFixed(1)}s`, { timedOut: true });
  if (code !== 0) return failed(`akm ${system} exited ${code}: ${(stderr.trim() || stdout.trim()).slice(-300)}`);
  type Hit = { ref?: unknown; type?: unknown; name?: unknown; description?: unknown; path?: unknown };
  let out: { hits?: Hit[]; items?: Hit[]; searchMode?: unknown; warnings?: unknown };
  try {
    out = JSON.parse(stdout);
  } catch {
    return failed(`akm ${system} printed no JSON: ${stdout.slice(0, 200)}`);
  }
  const said = typeof out.searchMode === "string" ? out.searchMode : null;
  if (said !== null ? said !== mode : mode === "semantic") {
    const what = said !== null ? `searched with ${said}, not ${mode}` : "did not say how it searched (no searchMode), and a semantic call has to say semantic";
    return failed(`akm ${system} ${what}: ${JSON.stringify(out.warnings ?? null).slice(0, 300)}`);
  }
  const refs: string[] = [];
  const assets = new Map<string, Asset>();
  for (const h of (system === "search" ? out.hits : out.items) ?? []) {
    if (typeof h.ref !== "string") return failed(`akm ${system} returned a result with no ref`);
    refs.push(h.ref);
    const [ref] = foldRefs([h.ref]);
    if (ref && !assets.has(ref)) assets.set(ref, { ref, type: String(h.type ?? ""), name: String(h.name ?? ref), description: String(h.description ?? ""), path: String(h.path ?? "") });
  }
  return { refs: foldRefs(refs), assets: [...assets.values()], mode: said, seconds: seconds() };
}
