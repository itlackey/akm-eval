// Semantic proof from the index response and the eval's own searches. Never add a
// probe search to a measured sandbox: its usage history affects improve behavior.
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface SemanticVerification {
  index_checks: number;
  indexed_entries: number;
  embedded_entries: number;
  searches: { semantic: number; non_semantic: number; unknown: number };
  telemetry_errors: number;
  failures: number;
}

const empty = (): SemanticVerification => ({ index_checks: 0, indexed_entries: 0, embedded_entries: 0, searches: { semantic: 0, non_semantic: 0, unknown: 0 }, telemetry_errors: 0, failures: 0 });
let tally = empty();

/** Only present for a sandbox configured with the real native semantic model. */
export interface SemanticState { lastEvent: number }

/** Returns a measurement error when coverage or an observed search violates --semantic. */
export function verifySemantic(state: SemanticState, dataDir: string, command: string, stdout: string): string | null {
  const errors: string[] = [];
  if (command === "index") {
    const result = JSON.parse(stdout) as { totalEntries?: number; verification?: { embeddingCount?: number } };
    const entries = result.totalEntries, embeddings = result.verification?.embeddingCount;
    tally.index_checks++;
    tally.indexed_entries += typeof entries === "number" ? entries : 0;
    tally.embedded_entries += typeof embeddings === "number" ? embeddings : 0;
    if (!Number.isInteger(entries) || entries! < 0 || embeddings !== entries) errors.push(`incomplete semantic index: embedded ${embeddings ?? "unknown"} of ${entries ?? "unknown"} entries`);
  }
  const path = join(dataDir, "state.db");
  if (existsSync(path)) {
    const db = new Database(path, { readonly: true });
    try {
      const rows = db.query("SELECT rowid AS id, metadata_json FROM events WHERE event_type = 'search' AND rowid > ? ORDER BY rowid").all(command === "index" ? 0 : state.lastEvent) as { id: number; metadata_json: string }[];
      if (command === "index") state.lastEvent = rows.at(-1)?.id ?? 0;
      for (const row of command === "index" ? [] : rows) {
        state.lastEvent = row.id;
        const mode = (JSON.parse(row.metadata_json) as { mode?: string }).mode;
        tally.searches[mode === "semantic" ? "semantic" : mode ? "non_semantic" : "unknown"]++;
        if (mode !== "semantic") errors.push(`search used ${mode ?? "an unknown mode"} while semantic search was requested`);
      }
    } catch { tally.telemetry_errors++; } // unavailable telemetry stays visible; it is not proof of semantic retrieval
    finally { db.close(); }
  }
  tally.failures += errors.length;
  return errors.length ? errors.join("; ") : null;
}

/** Null means no semantic verification was performed; zero searches means none were observed. */
export function takeSemanticVerification(): SemanticVerification | null {
  const result = tally;
  tally = empty();
  return result.index_checks || Object.values(result.searches).some(Boolean) || result.failures || result.telemetry_errors ? result : null;
}
