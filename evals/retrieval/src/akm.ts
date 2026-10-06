// The akm calls the retrieval eval makes, on a sandbox from lib/akm: load a library, list the assets, search, curate.
// A semantic sandbox has akm embed the assets as it indexes them, and every call has to say that it searched with them.

import { cpSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { type Sandbox, runAkm, writeConfig } from "../../../lib/akm/akm.ts";
import { type Asset, DEPTH, foldRefs } from "./lib.ts";

const TYPES = ["skill", "command", "agent", "knowledge", "workflow", "script", "lesson", "fact", "memory"];

const bundleOf = (sb: Sandbox): string => join(sb.dir, "bundle");

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
    const { stdout, stderr, code } = await runAkm(sb, ["search", "", "--type", type, "--limit", "5000", "--shape", "agent", "--format", "json"]);
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
  /** akm's own name for how it searched: keyword, or something else when embeddings are on. */
  mode: string | null;
  seconds: number;
  error?: string;
}

/**
 * One `akm search` or `akm curate` call. A failed call is an answer with an error and no refs. So is an answer that
 * says it searched another way than `mode` (keyword or semantic): when akm cannot embed a query it answers with keyword
 * search, `fts-fallback`, and that is not the semantic result.
 */
export async function ask(sb: Sandbox, system: "search" | "curate", query: string, limit = DEPTH, mode: "keyword" | "semantic" = "keyword"): Promise<Answer> {
  const { stdout, stderr, code, ms } = await runAkm(sb, [system, "--limit", String(limit), "--shape", "agent", "--format", "json", "--", query], { timeoutMs: 120_000 }).catch((e: Error) => ({ stdout: "", stderr: e.message, code: 127, ms: 0 }));
  const seconds = () => Number((ms / 1000).toFixed(2));
  const failed = (error: string): Answer => ({ refs: [], mode: null, seconds: seconds(), error });
  if (code !== 0) return failed(`akm ${system} exited ${code}: ${(stderr.trim() || stdout.trim()).slice(-300)}`);
  let out: { hits?: { ref?: unknown }[]; items?: { ref?: unknown }[]; searchMode?: unknown; warnings?: unknown };
  try {
    out = JSON.parse(stdout);
  } catch {
    return failed(`akm ${system} printed no JSON: ${stdout.slice(0, 200)}`);
  }
  if (typeof out.searchMode === "string" && out.searchMode !== mode) return failed(`akm ${system} searched with ${out.searchMode}, not ${mode}: ${JSON.stringify(out.warnings ?? null).slice(0, 300)}`);
  const refs: string[] = [];
  for (const h of (system === "search" ? out.hits : out.items) ?? []) {
    if (typeof h.ref !== "string") return failed(`akm ${system} returned a result with no ref`);
    refs.push(h.ref);
  }
  return { refs: foldRefs(refs), mode: typeof out.searchMode === "string" ? out.searchMode : null, seconds: seconds() };
}
