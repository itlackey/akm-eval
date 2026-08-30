/**
 * Retrieval-only probes for the memory packs — no LLM in the loop.
 *
 * WHY THIS EXISTS
 *
 * An end-to-end judged run answers "did the model produce a good answer",
 * which confounds retrieval quality with model and judge behaviour, costs
 * real money, and is noisy at the sample sizes this repo can afford. When the
 * question is narrower — "did akm's retrieval change?" — none of that is
 * needed. These probes replicate each pack adapter's EXACT ingest and query
 * path (`flatten -> backend.add -> backend.search`) and stop there, so a
 * retrieval regression is visible in minutes, deterministically, for free.
 *
 * They are what established that akm#819 lifted the body-prose retrieval
 * ceiling. Same corpora, same code path, only the CLI version differing:
 *
 *   LoCoMo (conv-26, 40q)     zero-hit 75.0% -> 0.0%, recall@5 0.154 -> 0.590
 *   LongMemEval (20q)         zero-hit  100% -> 0.0%, recall@5 0.000 -> 0.950
 *
 * READING THE OUTPUT
 *
 * `zeroHitRate` alone is NOT sufficient evidence of good retrieval: a
 * retriever that returns five arbitrary documents for every query also scores
 * 0% zero-hit. `evidenceRecallAt5` is what separates retrieval from noise —
 * at topK=5 over a 419-document haystack, chance recall is ~1%.
 *
 * USAGE
 *
 *   AKM_EVAL_AKM_CMD='["/path/to/akm"]' bun scripts/probes/retrieval-probe.ts locomo
 *   AKM_EVAL_AKM_CMD='["/path/to/akm"]' MAX_Q=20 bun scripts/probes/retrieval-probe.ts longmemeval
 *
 * `AKM_EVAL_AKM_CMD` selects the akm binary under test — pin it explicitly
 * when comparing versions. Each run uses a fresh hermetic bundle under the OS
 * temp dir and never touches a real stash.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAkmBackend } from "../../src/memory/backends/akm.ts";
import { sessionToMemoryDocument } from "../../src/packs/longmemeval/adapter.ts";
import { loadDataset } from "../../src/packs/longmemeval/dataset.ts";
import type { MemoryDocument } from "../../src/memory/types.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

interface ProbeResult {
  pack: string;
  akmVersion: string;
  questions: number;
  zeroHit: number;
  zeroHitRate: number;
  evidenceScored: number;
  evidenceRecallAt5: number | null;
  /** Queries the backend refused outright (e.g. a contamination guard). */
  guardTripped: number;
}

/** Fresh hermetic bundle; never a real stash. */
function hermeticBackend() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-probe-"));
  return { backend: createAkmBackend(ROOT, workDir), workDir };
}

function recall(hits: readonly { id?: string }[], evidence: readonly string[]): boolean {
  const ids = new Set(hits.map((h) => String(h.id)));
  return evidence.some((e) => ids.has(String(e)));
}

// ── LoCoMo ───────────────────────────────────────────────────────────────────
// Mirrors the adapter's own `flattenConversation` / `formatDialogTurn`. Kept in
// step with src/packs/locomo/adapter.ts; if that changes, change this.

const sessionNumbers = (c: Record<string, unknown>): number[] =>
  Object.keys(c)
    .filter((k) => /^session_\d+$/.test(k))
    .map((k) => Number(k.split("_")[1]))
    .sort((a, b) => a - b);

function formatTurn(d: Record<string, unknown>): string {
  let turn = `${d.speaker} said, "${d.text}"\n`;
  const caption = d.blip_caption;
  if (typeof caption === "string" && caption.trim().length > 0) turn += ` and shared ${caption}.`;
  return `${turn}\n`;
}

function flattenLocomo(sample: Record<string, any>): MemoryDocument[] {
  const docs: MemoryDocument[] = [];
  for (const n of sessionNumbers(sample.conversation)) {
    const session = sample.conversation[`session_${n}`];
    if (!Array.isArray(session)) continue;
    const raw = sample.conversation[`session_${n}_date_time`];
    const dateTime = typeof raw === "string" ? raw : "";
    for (const d of session) {
      docs.push({
        id: d.dia_id,
        text: `DATE: ${dateTime}\nCONVERSATION:\n${formatTurn(d)}`,
        metadata: { sampleId: sample.sample_id, sessionNumber: n, dateTime, speaker: d.speaker },
      });
    }
  }
  return docs;
}

async function probeLocomo(maxQ: number): Promise<ProbeResult> {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "datasets/locomo/locomo10.json"), "utf8"));
  const sample = (Array.isArray(raw) ? raw : raw.samples)[0];
  const { backend, workDir } = hermeticBackend();
  const health = backend.healthCheck();
  await backend.reset();
  await backend.add(flattenLocomo(sample));

  let zeroHit = 0;
  let evidenceScored = 0;
  let evidenceHit = 0;
  let guardTripped = 0;
  let asked = 0;

  for (const q of sample.qa.slice(0, maxQ)) {
    let hits: Awaited<ReturnType<typeof backend.search>>;
    try {
      hits = await backend.search({ text: q.question, topK: 5 });
    } catch (err) {
      // A backend guard (e.g. contamination) is a real finding, not a zero-hit.
      if (String((err as Error).message).includes("never added")) {
        guardTripped += 1;
        continue;
      }
      throw err;
    }
    asked += 1;
    if (hits.length === 0) zeroHit += 1;
    const evidence: string[] = Array.isArray(q.evidence) ? q.evidence : [];
    if (evidence.length > 0) {
      evidenceScored += 1;
      if (recall(hits, evidence)) evidenceHit += 1;
    }
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  return {
    pack: `locomo (${sample.sample_id})`,
    akmVersion: health.detail ?? "unknown",
    questions: asked,
    zeroHit,
    zeroHitRate: asked ? Number((zeroHit / asked).toFixed(3)) : 0,
    evidenceScored,
    evidenceRecallAt5: evidenceScored ? Number((evidenceHit / evidenceScored).toFixed(3)) : null,
    guardTripped,
  };
}

// ── LongMemEval ──────────────────────────────────────────────────────────────
// Reuses the adapter's own exports rather than re-deriving them.

async function probeLongMemEval(maxQ: number): Promise<ProbeResult> {
  const questions = await loadDataset({
    rootDir: ROOT,
    datasetPath: path.join(ROOT, "datasets/longmemeval/dataset.json"),
  });
  const { backend, workDir } = hermeticBackend();
  const health = backend.healthCheck();

  let zeroHit = 0;
  let evidenceScored = 0;
  let evidenceHit = 0;
  let guardTripped = 0;
  let asked = 0;

  for (const q of questions.slice(0, maxQ)) {
    await backend.reset();
    await backend.add(q.haystackSessions.map(sessionToMemoryDocument));
    let hits: Awaited<ReturnType<typeof backend.search>>;
    try {
      hits = await backend.search({ text: q.question, topK: 5 });
    } catch (err) {
      if (String((err as Error).message).includes("never added")) {
        guardTripped += 1;
        continue;
      }
      throw err;
    }
    asked += 1;
    if (hits.length === 0) zeroHit += 1;
    const evidence = q.evidenceSessionIds ?? [];
    if (evidence.length > 0) {
      evidenceScored += 1;
      if (recall(hits, evidence)) evidenceHit += 1;
    }
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  return {
    pack: "longmemeval",
    akmVersion: health.detail ?? "unknown",
    questions: asked,
    zeroHit,
    zeroHitRate: asked ? Number((zeroHit / asked).toFixed(3)) : 0,
    evidenceScored,
    evidenceRecallAt5: evidenceScored ? Number((evidenceHit / evidenceScored).toFixed(3)) : null,
    guardTripped,
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

const pack = (process.argv[2] ?? "").toLowerCase();
const maxQ = Number(process.env.MAX_Q ?? (pack === "locomo" ? "40" : "20"));

if (pack !== "locomo" && pack !== "longmemeval") {
  console.error("usage: bun scripts/probes/retrieval-probe.ts <locomo|longmemeval>");
  console.error("  env: AKM_EVAL_AKM_CMD='[\"/path/to/akm\"]'  MAX_Q=<n>");
  process.exit(2);
}

const result = pack === "locomo" ? await probeLocomo(maxQ) : await probeLongMemEval(maxQ);
console.log(JSON.stringify(result, null, 2));
if (result.guardTripped > 0) {
  console.error(`\nNOTE: ${result.guardTripped} query/queries aborted on a backend guard — investigate, do not read as zero-hit.`);
}
