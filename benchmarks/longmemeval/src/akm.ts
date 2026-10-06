// akm as the memory: each question's sessions go into a fresh bundle in a sandbox as memories, are
// indexed, and are searched with the question. The sandbox has its own config and folders, so the
// caller's akm is never read or written.

import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, runAkmJson } from "../../../lib/akm/akm.ts";
import type { SessionView } from "./prompts.ts";

const AKM_TIMEOUT_MS = 120_000; // for the index and for each search

export class Akm {
  constructor(private readonly sandbox: Sandbox) {}

  /**
   * Replaces the bundle with these sessions, one memory each, and indexes it. A memory is named by a hash
   * of the salt and its place, so its name says nothing about which session it is. Returns memory name to
   * session index.
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
      const text = `# Chat session\n\nSession date: ${s.date}\n\n${s.turns.map((t) => `${t.role}: ${t.content}`).join("\n")}\n`;
      writeFileSync(join(bundle, "memories", `${name}.md`), text);
    });
    const indexed = (await runAkmJson<{ totalEntries?: number }>(this.sandbox, ["index", "--full"], { timeoutMs: AKM_TIMEOUT_MS })).totalEntries;
    if (indexed !== sessions.length) throw new Error(`akm indexed ${indexed} entries for ${sessions.length} sessions`);
    return names;
  }

  /** The memory names akm returns for the query, best first. */
  async search(query: string, k: number): Promise<string[]> {
    const found = await runAkmJson<{ hits?: { ref?: string }[] }>(this.sandbox, ["search", "--limit", String(k), "--shape", "agent", "--", query], { timeoutMs: AKM_TIMEOUT_MS });
    const hits = found.hits ?? [];
    return hits.map((h) => {
      if (typeof h.ref !== "string") throw new Error("akm returned a hit with no ref");
      return h.ref.split("/").pop() as string;
    });
  }
}
