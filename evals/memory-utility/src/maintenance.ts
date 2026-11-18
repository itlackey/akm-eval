import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ChatError } from "../../../benchmarks/longmemeval/src/llm.ts";
import { createSandbox, removeSandbox, writeConfig, type Sandbox } from "../../../lib/akm/akm.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { sha256Json } from "../../../lib/provenance.ts";
import { embedderEnv } from "../../consolidate/src/sandbox.ts";
import { runMaintenanceCycle } from "../../nightly/src/collect.ts";
import { AKM_FOLDER } from "../../nightly/src/library.ts";
import { blankArm, index, place, readAnswer, sandboxRelative, seconds, snapshot } from "./collect.ts";
import type { Case } from "./inputs.ts";
import { sourceFiles } from "./protocol.ts";
import { scoreArm, type RawArm } from "./score.ts";

export const EVAL = "memory-maintenance";
export const VERSION = "0.1";
const ARMS = ["originals", "maintained"] as const;
const STAGES = ["initial", "no-new-evidence", "follow-up"] as const;
type Arm = typeof ARMS[number];
type Files = Record<string, string>;
export type History = { id: string; initial: string[]; followUp: string[]; questions: Pick<Case, "id" | "question" | "fields">[] };
type Outcome = "changed" | "no-change" | "skipped" | "failed" | "unsupported" | "not-run";
type Cycle = {
  stage: typeof STAGES[number];
  outcome: Outcome;
  error: string | null;
  improve: unknown;
  drain: unknown;
  changed_paths: string[] | null;
  seconds: number | null;
};
type Options = Parameters<typeof readAnswer>[3];
type HistoryRaw = ReturnType<typeof pendingHistory>;

export function pendingHistory(history: History, ordinal: number) {
  const notes = [...history.initial, ...history.followUp];
  return {
    id: history.id,
    order: ordinal % 2 ? [...ARMS].reverse() : [...ARMS],
    originals: sourceFiles({ id: history.id, notes }),
    maintained: null as Files | null,
    cycles: STAGES.map((stage): Cycle => ({ stage, outcome: "not-run", error: null, improve: null, drain: null, changed_paths: null, seconds: null })),
    questions: history.questions.map((q) => ({
      case: { ...q, category: history.id, common: "", notes },
      arms: { originals: blankArm(), maintained: blankArm() },
    })),
  };
}

type Native = { ok?: boolean; skipped?: unknown; skippedProcesses?: unknown[]; actions?: { result?: { ok?: boolean; outcome?: string; error?: unknown } }[];
  usageReport?: { byProcessEngineModel?: { failures?: number }[] }; triage?: { failed?: number }; schemaRepairs?: { outcome?: string }[];
  validationFailures?: unknown[]; consolidation?: { failedChunks?: number } };

/** Preserve native failures and skipped work even when the process exited zero. */
export function cycleOutcome(improved: unknown, drained: unknown, changed: string[]): Outcome {
  const i = improved as Native | null;
  const d = drained as { ok?: boolean; failed?: unknown[] } | null;
  if (i?.ok === false || d?.ok === false || d?.failed?.length || i?.triage?.failed ||
      i?.validationFailures?.length || i?.consolidation?.failedChunks ||
      i?.actions?.some((a) => a.result?.ok === false || a.result?.outcome === "error" || !!a.result?.error) ||
      i?.schemaRepairs?.some((r) => r.outcome === "error") ||
      i?.usageReport?.byProcessEngineModel?.some((r) => typeof r.failures === "number" && r.failures > 0)) return "failed";
  if (i?.skipped || i?.skippedProcesses?.length) return "skipped";
  // If the selected build does not report an outcome we can interpret, don't invent one.
  if (i?.ok !== true || d?.ok !== true || !Array.isArray(d.failed)) return "unsupported";
  return changed.length ? "changed" : "no-change";
}

/**
 * Run all stages in one persistent writer. Callers only pass source files, never
 * future questions or labels. Keep the previous cycle's files, DB and queue.
 */
export async function replay(
  original: Files, initialCount: number, cycles: Cycle[],
  ops: { append: (files: Files) => void; snapshot: () => Files; run: (cycle: Cycle) => Promise<void>; sanitize: (e: unknown) => string },
): Promise<Files | null> {
  const entries = Object.entries(original);
  const arrivals = [entries.slice(0, initialCount), [], entries.slice(initialCount)];
  for (const [n, cycle] of cycles.entries()) {
    const started = performance.now();
    try {
      ops.append(Object.fromEntries(arrivals[n]!));
      const before = ops.snapshot();
      await ops.run(cycle);
      const after = ops.snapshot();
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((p) => before[p] !== after[p]).sort();
      cycle.changed_paths = changed;
      cycle.outcome = cycleOutcome(cycle.improve, cycle.drain, changed);
      if (cycle.outcome === "failed" || cycle.outcome === "skipped" || cycle.outcome === "unsupported") return null;
      if (n === cycles.length - 1) return after;
    } catch (e) {
      cycle.outcome = "failed";
      cycle.error = ops.sanitize(e);
      return null;
    } finally { cycle.seconds = seconds(started); }
  }
  throw new Error("maintenance history has no cycles");
}

export async function collectHistory(raw: HistoryRaw, initialCount: number, writerConfig: unknown, o: Options, checkpoint: () => void) {
  const writer = createSandbox(EVAL, { isolateHome: true });
  try {
    Object.assign(writer.env, embedderEnv("deterministic"));
    writeConfig(writer, writerConfig);
    raw.maintained = await replay(raw.originals, initialCount, raw.cycles, {
      append: (files) => place(writer, files),
      snapshot: () => snapshot(writer, AKM_FOLDER),
      sanitize: (e) => sandboxRelative(hideEndpoint(String(e), o.endpoint.baseUrl), writer.dir),
      run: async (cycle) => {
        await index(writer, o, true);
        const { drained } = await runMaintenanceCycle(writer, {
          baseUrl: o.endpoint.baseUrl, timeoutMs: o.timeoutMs, improveTimeoutMs: o.timeoutMs + 30_000,
        }, (report) => { cycle.improve = sandboxRelative(hideEndpoint(report, o.endpoint.baseUrl), writer.dir); });
        cycle.drain = sandboxRelative(hideEndpoint(drained, o.endpoint.baseUrl), writer.dir);
      },
    });
  } finally { removeSandbox(writer); }
  checkpoint();
  for (const name of raw.order) {
    const library = raw[name];
    for (const q of raw.questions) {
      const arm = q.arms[name];
      if (!library) {
        const bad = raw.cycles.find((c) => c.outcome === "failed" || c.outcome === "skipped" || c.outcome === "unsupported");
        arm.state = "error";
        arm.error = bad ? `${bad.stage}: ${bad.error ?? bad.outcome}` : "maintained library unavailable";
        checkpoint();
        continue;
      }
      const reader = createSandbox(`${EVAL}-reader`, { isolateHome: true });
      try {
        // All paths come from sourceFiles or the symlink-rejecting walk of the
        // writer's active bundle; lessons/knowledge can be native outputs too.
        stageReader(reader, library);
        await readAnswer(reader, q.case, arm, o, checkpoint, true);
      } catch (e) {
        arm.state = "error";
        arm.error = sandboxRelative(hideEndpoint(String(e), o.endpoint.baseUrl), reader.dir);
        if (e instanceof ChatError) arm.failed_usage = e.usage;
      } finally { try { checkpoint(); } finally { removeSandbox(reader); } }
    }
  }
}

function stageReader(reader: Sandbox, library: Files) {
  for (const [file, contents] of Object.entries(library)) {
    const path = join(reader.dir, "bundle", file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  if (sha256Json(snapshot(reader)) !== sha256Json(library)) throw new Error("reader corpus differs from the frozen library");
}

export function scoreHistory(raw: HistoryRaw) {
  const questions = raw.questions.map(({ case: c, arms }) => {
    const originals = scoreArm(c, arms.originals), maintained = scoreArm(c, arms.maintained);
    return { id: c.id, originals, maintained,
      incomplete: ARMS.some(a => arms[a].state === "not-run"),
      operational_failure: ARMS.some(a => arms[a].state === "error" || (arms[a].state === "complete" && arms[a].answer === null)) };
  });
  const n = questions.length;
  const counted = ARMS.map((a) => questions.filter(q => q[a].correct).length);
  const [originals, maintained] = counted as [number, number];
  const incomplete = questions.some(q => q.incomplete);
  const unsupported = raw.cycles.some(c => c.outcome === "unsupported");
  return {
    id: raw.id, n, correct: { originals, maintained }, delta: incomplete || unsupported ? null : (maintained - originals) / n,
    helped: questions.filter(q => !q.operational_failure && !q.incomplete && !q.originals.correct && q.maintained.correct).length,
    harmed: questions.filter(q => !q.operational_failure && !q.incomplete && q.originals.correct && !q.maintained.correct).length,
    unchanged: questions.filter(q => !q.operational_failure && !q.incomplete && q.originals.correct === q.maintained.correct).length,
    operational_failures: questions.filter(q => q.operational_failure).length,
    incomplete, unsupported, questions,
  };
}
