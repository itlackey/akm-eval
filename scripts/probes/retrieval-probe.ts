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
import { averageRetrieval, scoreRetrieval } from "../../src/memory/retrieval-metrics.ts";
import type { MemoryDocument } from "../../src/memory/types.ts";
import type { RetrievalMetrics } from "../../src/memory/types.ts";
import { sessionToMemoryDocument } from "../../src/packs/longmemeval/adapter.ts";
import { loadDataset } from "../../src/packs/longmemeval/dataset.ts";
import {
  type IdentityPermutationDiagnostic,
  type IdentityPermutationObservation,
  compareIdentityPermutationObservations,
  hasScoreSaturatedTopK,
  permuteOpaqueDocumentIdentities,
  remapPermutedHits,
} from "../../src/probes/retrieval-diagnostics.ts";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

interface ProbeResult {
  pack: string;
  akmVersion: string;
  questions: number;
  zeroHit: number;
  zeroHitRate: number;
  evidenceScored: number;
  /** Fraction of questions where ANY evidence doc was retrieved (hit/miss). */
  evidenceRecallAt5: number | null;
  /**
   * The repo's canonical per-question metrics, averaged — the same
   * `scoreRetrieval` the pack adapters report, so probe and adapter numbers
   * are directly comparable. `precisionAtK` is the one `evidenceRecallAt5`
   * cannot express: it distinguishes "retrieved the answer plus four
   * irrelevant documents" from "retrieved the answer cleanly".
   */
  retrieval: RetrievalMetrics;
  /** Fraction of full returned top-Ks with one finite public score. Disclosure only. */
  scoreSaturatedTopKRate: number;
  /** Present only when IDENTITY_PERMUTATION_CHECK=1 / bin/probe --identity-permutation. */
  identityPermutation?: IdentityPermutationDiagnostic;
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

const TOP_K = 5;
const RUN_IDENTITY_PERMUTATION_CHECK = process.env.IDENTITY_PERMUTATION_CHECK === "1";

function metricVector(metric: RetrievalMetrics): number[] {
  return [metric.precisionAtK, metric.recallAtK, metric.mrr, metric.ndcgAtK];
}

function duplicateContentIds(documents: readonly MemoryDocument[]): ReadonlySet<string> {
  const idsByText = new Map<string, string[]>();
  for (const document of documents) {
    const ids = idsByText.get(document.text) ?? [];
    ids.push(document.id);
    idsByText.set(document.text, ids);
  }
  return new Set([...idsByText.values()].filter((ids) => ids.length > 1).flat());
}

function observation(
  queryId: string,
  hits: Awaited<ReturnType<ReturnType<typeof createAkmBackend>["search"]>>,
  metric: RetrievalMetrics,
  duplicateIds: ReadonlySet<string>,
): IdentityPermutationObservation {
  return {
    queryId,
    hitIds: hits.map((hit) => hit.id),
    publicScores: hits.map((hit) => hit.score),
    metric: metricVector(metric),
    hasDuplicateContent: hits.some((hit) => duplicateIds.has(hit.id)),
  };
}

interface IdentityPermutationQuery {
  id: string;
  text: string;
  evidence: readonly string[];
  documents: readonly MemoryDocument[];
}

async function checkIdentityPermutation(
  backend: ReturnType<typeof createAkmBackend>,
  queries: readonly IdentityPermutationQuery[],
  baseline: readonly IdentityPermutationObservation[],
): Promise<IdentityPermutationDiagnostic | undefined> {
  if (!RUN_IDENTITY_PERMUTATION_CHECK) return undefined;
  const replay: IdentityPermutationObservation[] = [];
  let activeDocuments: readonly MemoryDocument[] | undefined;
  let activePermutation: ReturnType<typeof permuteOpaqueDocumentIdentities> | undefined;
  for (const query of queries) {
    if (query.documents !== activeDocuments) {
      activeDocuments = query.documents;
      activePermutation = permuteOpaqueDocumentIdentities(query.documents);
      await backend.reset();
      await backend.add(activePermutation.documents);
    }
    if (!activePermutation) throw new Error("Identity permutation setup failed");
    const hits = remapPermutedHits(
      await backend.search({ text: query.text, topK: TOP_K }),
      activePermutation.originalIdByPermutedId,
    );
    const metric = scoreRetrieval(query.evidence, hits, TOP_K);
    replay.push(observation(query.id, hits, metric, duplicateContentIds(query.documents)));
  }
  const diagnostic = compareIdentityPermutationObservations(baseline, replay);
  return diagnostic;
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

/** Minimal structural view of a LoCoMo sample — the fields this probe reads. */
interface LocomoSample {
  sample_id: string;
  conversation: Record<string, unknown>;
  qa: { question: string; evidence?: string[] }[];
}

function flattenLocomo(sample: LocomoSample): MemoryDocument[] {
  const docs: MemoryDocument[] = [];
  for (const n of sessionNumbers(sample.conversation)) {
    const session = sample.conversation[`session_${n}`] as unknown[];
    if (!Array.isArray(session)) continue;
    const raw = sample.conversation[`session_${n}_date_time`];
    const dateTime = typeof raw === "string" ? raw : "";
    for (const entry of session) {
      const d = entry as Record<string, unknown>;
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
  const sample = (Array.isArray(raw) ? raw : raw.samples)[0] as LocomoSample;
  const { backend, workDir } = hermeticBackend();
  const health = backend.healthCheck();
  const documents = flattenLocomo(sample);
  await backend.reset();
  await backend.add(documents);

  let zeroHit = 0;
  let evidenceScored = 0;
  let evidenceHit = 0;
  let guardTripped = 0;
  let asked = 0;
  const perQuestion: RetrievalMetrics[] = [];
  let scoreSaturatedTopK = 0;
  const observations: IdentityPermutationObservation[] = [];
  const queries: IdentityPermutationQuery[] = [];
  const duplicateIds = duplicateContentIds(documents);

  for (const [index, q] of sample.qa.slice(0, maxQ).entries()) {
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
    const metric = scoreRetrieval(evidence, hits, TOP_K);
    perQuestion.push(metric);
    if (hasScoreSaturatedTopK(hits, TOP_K)) scoreSaturatedTopK += 1;
    observations.push(observation(String(index), hits, metric, duplicateIds));
    queries.push({ id: String(index), text: q.question, evidence, documents });
    if (evidence.length > 0) {
      evidenceScored += 1;
      if (recall(hits, evidence)) evidenceHit += 1;
    }
  }

  const identityPermutation = await checkIdentityPermutation(backend, queries, observations);
  fs.rmSync(workDir, { recursive: true, force: true });
  return {
    pack: `locomo (${sample.sample_id})`,
    akmVersion: health.detail ?? "unknown",
    questions: asked,
    zeroHit,
    zeroHitRate: asked ? Number((zeroHit / asked).toFixed(3)) : 0,
    evidenceScored,
    evidenceRecallAt5: evidenceScored ? Number((evidenceHit / evidenceScored).toFixed(3)) : null,
    retrieval: averageRetrieval(perQuestion),
    scoreSaturatedTopKRate: asked ? Number((scoreSaturatedTopK / asked).toFixed(3)) : 0,
    identityPermutation,
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
  const perQuestion: RetrievalMetrics[] = [];
  let scoreSaturatedTopK = 0;
  const observations: IdentityPermutationObservation[] = [];
  const queries: IdentityPermutationQuery[] = [];

  for (const q of questions.slice(0, maxQ)) {
    const documents = q.haystackSessions.map(sessionToMemoryDocument);
    await backend.reset();
    await backend.add(documents);
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
    const metric = scoreRetrieval(evidence, hits, TOP_K);
    perQuestion.push(metric);
    if (hasScoreSaturatedTopK(hits, TOP_K)) scoreSaturatedTopK += 1;
    observations.push(observation(q.id, hits, metric, duplicateContentIds(documents)));
    queries.push({ id: q.id, text: q.question, evidence, documents });
    if (evidence.length > 0) {
      evidenceScored += 1;
      if (recall(hits, evidence)) evidenceHit += 1;
    }
  }

  const identityPermutation = await checkIdentityPermutation(backend, queries, observations);
  fs.rmSync(workDir, { recursive: true, force: true });
  return {
    pack: "longmemeval",
    akmVersion: health.detail ?? "unknown",
    questions: asked,
    zeroHit,
    zeroHitRate: asked ? Number((zeroHit / asked).toFixed(3)) : 0,
    evidenceScored,
    evidenceRecallAt5: evidenceScored ? Number((evidenceHit / evidenceScored).toFixed(3)) : null,
    retrieval: averageRetrieval(perQuestion),
    scoreSaturatedTopKRate: asked ? Number((scoreSaturatedTopK / asked).toFixed(3)) : 0,
    identityPermutation,
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
  console.error(
    `\nNOTE: ${result.guardTripped} query/queries aborted on a backend guard — investigate, do not read as zero-hit.`,
  );
}
if (result.identityPermutation?.rankingOrMetricDependent) {
  console.error(
    `\nIDENTITY-PERMUTATION RELEASE GATE FAILED: ${result.identityPermutation.rankChangedQueries}/${result.identityPermutation.queriesCompared} rankings and ${result.identityPermutation.metricChangedQueries}/${result.identityPermutation.queriesCompared} metric rows changed when only opaque generated identities changed.`,
  );
  process.exitCode = 1;
}
