// What a run's model calls cost, from the `llm_usage` events akm writes to the state.db of each sandbox, one per call. removeSandbox
// adds a sandbox's calls before its folder goes, and a run takes them once for its summary.json. akm does not stream, so a call's time
// is the whole request: prefill and decode are not told apart.

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The model calls of a run, as `model_calls` in its summary.json. Token and time figures are means over the calls that succeeded. */
export interface ModelCalls {
  calls: number;
  /** Calls akm recorded as failed: an error status, a timeout, a reply it could not parse. */
  errors: number;
  /** Mean tokens sent per call, as the provider counted them; null when it reported none. */
  prompt_tokens: number | null;
  /** Mean tokens generated per call, reasoning included; null when the provider reported none. */
  completion_tokens: number | null;
  /** Mean seconds per call, from request to parsed reply. */
  seconds: number;
  /** Generated tokens over the time of the calls that reported them. The time includes prefill. */
  output_tokens_per_second: number | null;
}

const empty = () => ({ calls: 0, errors: 0, ok: 0, ms: 0, counted: 0, countedMs: 0, prompt: 0, completion: 0 });
let tally = empty();
/** The last event added from each state.db, so a sandbox that lives through several runs adds each call once. */
const seen = new Map<string, number>();

/**
 * Adds the calls akm recorded in the sandbox whose data folder this is, since the last time it was read. An eval that keeps one sandbox
 * for a whole run calls it before writing its summary. Best effort: an akm that keeps no such events adds none.
 */
export function tallyCalls(dataDir: string | undefined): void {
  const path = dataDir === undefined ? "" : join(dataDir, "state.db");
  if (!existsSync(path)) return;
  try {
    const db = new Database(path, { readonly: true });
    try {
      const rows = db.query("SELECT rowid AS id, metadata_json FROM events WHERE event_type = 'llm_usage' AND rowid > ? ORDER BY rowid").all(seen.get(path) ?? 0) as { id: number; metadata_json: string }[];
      for (const { id, metadata_json } of rows) {
        seen.set(path, id);
        const m = JSON.parse(metadata_json) as { outcome?: string; durationMs?: number; promptTokens?: number; completionTokens?: number };
        tally.calls++;
        if (m.outcome !== "success") {
          tally.errors++;
          continue;
        }
        tally.ok++;
        tally.ms += m.durationMs ?? 0;
        if (typeof m.promptTokens === "number" && typeof m.completionTokens === "number") {
          tally.counted++;
          tally.countedMs += m.durationMs ?? 0;
          tally.prompt += m.promptTokens;
          tally.completion += m.completionTokens;
        }
      }
    } finally {
      db.close();
    }
  } catch {} // no events table, or a row that is not JSON: nothing to add
}

/** The calls added since the last take, or null when akm called no model. */
export function takeModelCalls(): ModelCalls | null {
  const t = tally;
  tally = empty();
  if (t.calls === 0) return null;
  const round = (x: number, digits: number) => Number(x.toFixed(digits));
  return {
    calls: t.calls,
    errors: t.errors,
    prompt_tokens: t.counted > 0 ? round(t.prompt / t.counted, 1) : null,
    completion_tokens: t.counted > 0 ? round(t.completion / t.counted, 1) : null,
    seconds: t.ok > 0 ? round(t.ms / t.ok / 1000, 2) : 0,
    output_tokens_per_second: t.countedMs > 0 ? round(t.completion / (t.countedMs / 1000), 1) : null,
  };
}
