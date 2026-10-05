// akm as the memory: each question's sessions go into a fresh bundle in a sandbox as memories, are
// indexed, and are searched with the question. The sandbox has its own config and folders, so the
// caller's akm is never read or written.

import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionView } from "./prompts.ts";

export class Akm {
  readonly dir: string;
  private readonly cmd: string[];

  /** `command` is the akm command, one or more words: `akm`, or `bun /path/to/akm/src/cli.ts`. */
  constructor(command: string, dir: string) {
    this.cmd = command.trim().split(/\s+/);
    this.dir = dir;
  }

  private env(): Record<string, string> {
    const env: Record<string, string> = {};
    // akm needs none of the eval's keys.
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("AKM_") && k !== "MODEL_API_KEY" && k !== "JUDGE_API_KEY") env[k] = v;
    const d = (name: string) => join(this.dir, name);
    return {
      ...env,
      AKM_BUNDLE_DIR: d("bundle"),
      AKM_CONFIG_DIR: d("config"),
      AKM_DATA_DIR: d("data"),
      AKM_CACHE_DIR: d("cache"),
      AKM_STATE_DIR: d("state"),
      XDG_CONFIG_HOME: d("xdg-config"),
      XDG_DATA_HOME: d("xdg-data"),
      XDG_STATE_HOME: d("xdg-state"),
    };
  }

  private async run(args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string; code: number }> {
    const proc = Bun.spawn([...this.cmd, ...args], { env: this.env(), cwd: this.dir, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: timeoutMs, killSignal: "SIGKILL" });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { stdout, stderr, code };
  }

  /** Makes the sandbox. Keyword search only: embeddings need a model download, and the config has no registries, so nothing goes to the network. */
  init(): void {
    for (const name of ["config", "data", "cache", "state", "xdg-config", "xdg-data", "xdg-state"]) mkdirSync(join(this.dir, name), { recursive: true });
    writeFileSync(join(this.dir, "config", "config.json"), `${JSON.stringify({ configVersion: "0.9.0", semanticSearchMode: "off", registries: [] }, null, 2)}\n`);
  }

  async version(): Promise<string> {
    const { stdout, stderr, code } = await this.run(["--version"], 60_000).catch((e: Error) => ({ stdout: "", stderr: e.message, code: 127 }));
    const version = stdout.trim().match(/\d+\.\d+\.\d+\S*/)?.[0];
    if (code !== 0 || !version) throw new Error(`could not run \`${this.cmd.join(" ")} --version\`. Install akm or set AKM_BIN. ${stderr.trim().slice(0, 200)}`);
    return version;
  }

  /**
   * Replaces the bundle with these sessions, one memory each, and indexes it. A memory is named by a hash
   * of the salt and its place, so its name says nothing about which session it is. Returns memory name to
   * session index.
   */
  async load(sessions: SessionView[], salt: string): Promise<Map<string, number>> {
    const bundle = join(this.dir, "bundle");
    rmSync(bundle, { recursive: true, force: true });
    rmSync(join(this.dir, "data"), { recursive: true, force: true });
    mkdirSync(join(bundle, "memories"), { recursive: true });
    mkdirSync(join(this.dir, "data"), { recursive: true });
    const names = new Map<string, number>();
    sessions.forEach((s, i) => {
      const name = `m${createHash("sha256").update(`${salt}/${i}`).digest("hex").slice(0, 12)}`;
      names.set(name, i);
      const text = `# Chat session\n\nSession date: ${s.date}\n\n${s.turns.map((t) => `${t.role}: ${t.content}`).join("\n")}\n`;
      writeFileSync(join(bundle, "memories", `${name}.md`), text);
    });
    const { stdout, stderr, code } = await this.run(["index", "--full", "--format", "json"]);
    if (code !== 0) throw new Error(`akm index failed (exit ${code}): ${stderr.trim().slice(-300)}`);
    const indexed = (JSON.parse(stdout) as { totalEntries?: number }).totalEntries;
    if (indexed !== sessions.length) throw new Error(`akm indexed ${indexed} entries for ${sessions.length} sessions`);
    return names;
  }

  /** The memory names akm returns for the query, best first. */
  async search(query: string, k: number): Promise<string[]> {
    const { stdout, stderr, code } = await this.run(["search", "--limit", String(k), "--shape", "agent", "--format", "json", "--", query]);
    if (code !== 0) throw new Error(`akm search failed (exit ${code}): ${stderr.trim().slice(-300)}`);
    const hits = (JSON.parse(stdout) as { hits?: { ref?: string }[] }).hits ?? [];
    return hits.map((h) => {
      if (typeof h.ref !== "string") throw new Error("akm returned a hit with no ref");
      return h.ref.split("/").pop() as string;
    });
  }
}
