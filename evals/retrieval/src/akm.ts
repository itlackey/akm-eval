// The akm calls the retrieval eval makes, on a sandbox from lib/akm: load a library, list the assets, search, curate.

import { cpSync } from "node:fs";
import { join, relative } from "node:path";
import { type Sandbox, runAkm } from "../../../lib/akm/akm.ts";
import { type Asset, DEPTH, foldRefs } from "./lib.ts";

const TYPES = ["skill", "command", "agent", "knowledge", "workflow", "script"];

const bundleOf = (sb: Sandbox): string => join(sb.dir, "bundle");

/** Copies the library into the sandbox's bundle, indexes it, and returns how many assets akm found. */
export async function load(sb: Sandbox, library: string): Promise<number> {
  cpSync(library, bundleOf(sb), { recursive: true });
  const { stdout, stderr, code } = await runAkm(sb, ["index", "--full", "--format", "json"], { timeoutMs: 10 * 60_000 });
  if (code !== 0) throw new Error(`akm index failed (exit ${code}): ${stderr.trim().slice(-300)}`);
  const total = (JSON.parse(stdout) as { totalEntries?: number }).totalEntries;
  if (typeof total !== "number") throw new Error("akm index did not say how many entries it found");
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

/** One `akm search` or `akm curate` call. A failed call is an answer with an error and no refs. */
export async function ask(sb: Sandbox, system: "search" | "curate", query: string, limit = DEPTH): Promise<Answer> {
  const { stdout, stderr, code, ms } = await runAkm(sb, [system, "--limit", String(limit), "--shape", "agent", "--format", "json", "--", query], { timeoutMs: 120_000 }).catch((e: Error) => ({ stdout: "", stderr: e.message, code: 127, ms: 0 }));
  const seconds = () => Number((ms / 1000).toFixed(2));
  const failed = (error: string): Answer => ({ refs: [], mode: null, seconds: seconds(), error });
  if (code !== 0) return failed(`akm ${system} exited ${code}: ${(stderr.trim() || stdout.trim()).slice(-300)}`);
  let out: { hits?: { ref?: unknown }[]; items?: { ref?: unknown }[]; searchMode?: unknown };
  try {
    out = JSON.parse(stdout);
  } catch {
    return failed(`akm ${system} printed no JSON: ${stdout.slice(0, 200)}`);
  }
  const refs: string[] = [];
  for (const h of (system === "search" ? out.hits : out.items) ?? []) {
    if (typeof h.ref !== "string") return failed(`akm ${system} returned a result with no ref`);
    refs.push(h.ref);
  }
  return { refs: foldRefs(refs), mode: typeof out.searchMode === "string" ? out.searchMode : null, seconds: seconds() };
}
