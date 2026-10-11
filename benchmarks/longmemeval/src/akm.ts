// akm as the memory: each question's sessions go into a fresh bundle in a sandbox as memories, are
// indexed, and are searched with the question. The sandbox has its own config and folders, so the
// caller's akm is never read or written.

import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, agentDetailArgs, runAkmJson } from "../../../lib/akm/akm.ts";
import type { SessionView } from "./prompts.ts";

const AKM_TIMEOUT_MS = 120_000; // for the index and for each search. A command that takes longer is killed, and its question counts as a timeout.
const SEMANTIC_INDEX_TIMEOUT_MS = 30 * 60_000; // the first semantic index of a machine downloads akm's embedding model (133 MB)

/** How akm searches: its keyword index alone (the default), or that fused with the vectors of its built-in embedder. */
export type SearchMode = "keyword" | "semantic";

/**
 * akm cuts the body of a memory at this many characters in its keyword index (the skillret README has the details). A session
 * past the cut cannot be found by what it says after it.
 */
export const PROJECTION_LIMIT = 16_384;

/** A session as the memory akm is given: a heading, the date and the turns as `role: text` lines. */
export const memoryText = (s: SessionView): string => `# Chat session\n\nSession date: ${s.date}\n\n${s.turns.map((t) => `${t.role}: ${t.content}`).join("\n")}\n`;

/**
 * How many of these sessions, written as memories, are longer than the cut. akm drops fenced code, comments and link targets
 * from the body before it cuts, so this is an upper bound: a session just over the limit may fit once they are gone.
 */
export const overProjectionLimit = (sessions: SessionView[]): number => sessions.filter((s) => memoryText(s).length > PROJECTION_LIMIT).length;

/** Is this the error runAkmJson throws for an akm command that timed out ("akm index timed out after 120s")? */
export const isAkmTimeout = (message: string): boolean => /^akm \S+ timed out after [\d.]+s$/.test(message);

export class Akm {
  /** `mode` is how the sandbox's config makes akm search. In semantic mode every search has to say it searched that way. */
  constructor(
    private readonly sandbox: Sandbox,
    readonly mode: SearchMode = "keyword",
    private readonly timeoutMs = AKM_TIMEOUT_MS,
  ) {}

  /**
   * Replaces the bundle with these sessions, one memory each, and indexes it. A memory is named by a hash of the salt and its
   * place, so its name says nothing about which session it is. Returns memory name to session index. In semantic mode akm also
   * embeds the sessions, and has to have embedded each.
   */
  async load(sessions: SessionView[], salt: string): Promise<Map<string, number>> {
    const { dir } = this.sandbox;
    const bundle = join(dir, "bundle");
    rmSync(bundle, { recursive: true, force: true });
    rmSync(join(dir, "data"), { recursive: true, force: true });
    mkdirSync(join(bundle, "memories"), { recursive: true });
    mkdirSync(join(dir, "data"), { recursive: true });
    const names = new Map<string, number>();
    sessions.forEach((s, i) => {
      const name = `m${createHash("sha256").update(`${salt}/${i}`).digest("hex").slice(0, 12)}`;
      names.set(name, i);
      writeFileSync(join(bundle, "memories", `${name}.md`), memoryText(s));
    });
    const timeoutMs = this.mode === "semantic" ? SEMANTIC_INDEX_TIMEOUT_MS : this.timeoutMs;
    const index = await runAkmJson<{ totalEntries?: number; verification?: { embeddingCount?: number; message?: string } }>(this.sandbox, ["index", "--full"], { timeoutMs });
    if (index.totalEntries !== sessions.length) throw new Error(`akm indexed ${index.totalEntries} entries for ${sessions.length} sessions`);
    if (this.mode === "semantic" && index.verification?.embeddingCount !== sessions.length) {
      throw new Error(`akm embedded ${index.verification?.embeddingCount} of ${sessions.length} sessions: ${index.verification?.message}`);
    }
    return names;
  }

  /** The memory names akm returns for the query, best first. In semantic mode, an answer that does not say it searched with embeddings is an error. */
  async search(query: string, k: number): Promise<string[]> {
    const found = await runAkmJson<{ hits?: { ref?: string }[]; searchMode?: unknown; warnings?: unknown }>(this.sandbox, ["search", "--limit", String(k), ...(await agentDetailArgs(this.sandbox)), "--", query], { timeoutMs: this.timeoutMs });
    if (this.mode === "semantic" && found.searchMode !== "semantic") {
      throw new Error(`akm searched with ${typeof found.searchMode === "string" ? found.searchMode : "no search mode"}, not semantic: ${JSON.stringify(found.warnings ?? null).slice(0, 300)}`);
    }
    const hits = found.hits ?? [];
    return hits.map((h) => {
      if (typeof h.ref !== "string") throw new Error("akm returned a hit with no ref");
      return h.ref.split("/").pop() as string;
    });
  }
}
