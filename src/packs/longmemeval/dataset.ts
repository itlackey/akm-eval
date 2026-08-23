import fs from "node:fs";
import path from "node:path";
import { downloadDataset } from "../utils/dataset-downloader.ts";

export interface LongMemEvalSession {
  /** Original dataset session id (`haystack_session_ids[i]`), or a synthesized fallback — see loadDataset. */
  sessionId: string;
  /** Original dataset session timestamp (`haystack_dates[i]`), when the source provided one. */
  timestamp?: string;
  turns: Array<{ role: string; content: string }>;
}

export interface LongMemEvalQuestion {
  id: string;
  category: "single-session" | "multi-session" | "temporal" | "preference";
  /** Full haystack flattened into one turn sequence — used only by the disabled-backend (full-context) arm. */
  conversation: Array<{ role: string; content: string }>;
  /** Haystack sessions with session-level identity, used by the memory-backend (retrieval) arm as add() documents. */
  haystackSessions: LongMemEvalSession[];
  /**
   * Ground-truth session ids that actually contain the evidence for `expectedAnswer`
   * (the official dataset's `answer_session_ids`). Empty when the source dataset does
   * not carry this field — retrieval metrics computed against an empty evidence set are
   * not fabricated, they are simply zero-recall by construction (see scoreRetrieval).
   */
  evidenceSessionIds: string[];
  /**
   * True when `haystackSessions` was NOT given real session boundaries by the source
   * dataset and this loader had to wrap the entire flattened haystack in one synthetic
   * session (see the pre-normalized branch of loadDataset). When true, the
   * memory-backend arm's `add()` is handed exactly one document containing the whole
   * haystack, so retrieval necessarily returns either that whole document or nothing —
   * the "retrieved excerpts, not the full haystack" framing in the retrieval-arm prompt
   * does not hold for this question, and callers must disclose that rather than publish
   * it as ordinary session-level retrieval.
   */
  haystackSessionsSynthesized: boolean;
  question: string;
  expectedAnswer: string;
}

export interface DatasetLoadOptions {
  rootDir?: string;
  datasetPath?: string;
  maxQuestions?: number;
  questionCategories?: string[];
  smoke?: boolean;
}

const OFFICIAL_DATASET_URL =
  "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/98d7416c24c778c2fee6e6f3006e7a073259d48f/longmemeval_s_cleaned.json";
const REPO_MANAGED_DATASET_PATH = "datasets/longmemeval/dataset.json";

interface RawLongMemEvalItem {
  question_id: string;
  question_type: string;
  question: string;
  answer: string;
  haystack_sessions: Array<Array<{ role: string; content: string }>>;
  /**
   * Official LongMemEval fields (xiaowu0162/longmemeval-cleaned and upstream
   * snap-research/LongMemEval share this shape): parallel arrays to
   * `haystack_sessions`, one entry per session. Optional here because this
   * repo's own hand-written test fixtures (tests/longmemeval-dataset.test.ts,
   * tests/config.test.ts) intentionally use a minimal raw shape without them
   * to test category filtering / the disabled-backend path, neither of which
   * touches session ids, dates, or evidence.
   */
  haystack_session_ids?: string[];
  haystack_dates?: string[];
  /** Ground-truth session ids for retrieval scoring (see LongMemEvalQuestion.evidenceSessionIds). */
  answer_session_ids?: string[];
}

interface NormalizedLongMemEvalItem {
  id: string;
  category: LongMemEvalQuestion["category"];
  conversation: Array<{ role: string; content: string }>;
  question: string;
  expectedAnswer: string;
  haystackSessions?: LongMemEvalSession[];
  evidenceSessionIds?: string[];
}

export async function resolveDatasetFile(
  datasetPath?: string,
  rootDir = process.cwd(),
): Promise<string> {
  if (datasetPath) {
    const resolvedDatasetPath = path.isAbsolute(datasetPath)
      ? datasetPath
      : path.resolve(rootDir, datasetPath);
    if (!fs.existsSync(resolvedDatasetPath)) {
      throw new Error(
        `LongMemEval dataset not found at "${datasetPath}". Remove datasetPath from config to auto-download, or provide a valid local path.`,
      );
    }
    return resolvedDatasetPath;
  }

  const repoManagedDatasetPath = path.resolve(rootDir, REPO_MANAGED_DATASET_PATH);
  if (fs.existsSync(repoManagedDatasetPath)) {
    return repoManagedDatasetPath;
  }

  try {
    return await downloadDataset({
      name: "longmemeval",
      url: OFFICIAL_DATASET_URL,
      targetPath: "longmemeval_s_cleaned.json",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to download LongMemEval dataset. The official dataset may be unavailable or the URL may have changed. Error: ${message}`,
    );
  }
}

function normalizeCategory(rawType: string): LongMemEvalQuestion["category"] {
  const type = rawType.toLowerCase();
  if (type.includes("single")) return "single-session";
  if (type.includes("multi")) return "multi-session";
  if (type.includes("temporal")) return "temporal";
  if (type.includes("preference")) return "preference";
  return "single-session";
}

function flattenSessions(
  sessions: Array<Array<{ role: string; content: string }>>,
): Array<{ role: string; content: string }> {
  const flat: Array<{ role: string; content: string }> = [];
  for (const session of sessions) {
    for (const turn of session) {
      flat.push(turn);
    }
  }
  return flat;
}

function isNormalizedItem(value: unknown): value is NormalizedLongMemEvalItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.category === "string" &&
    Array.isArray(item.conversation) &&
    typeof item.question === "string" &&
    typeof item.expectedAnswer === "string"
  );
}

export async function loadDataset(options: DatasetLoadOptions): Promise<LongMemEvalQuestion[]> {
  const datasetFile = await resolveDatasetFile(options.datasetPath, options.rootDir);

  const raw = fs.readFileSync(datasetFile, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`LongMemEval dataset at "${datasetFile}" is not valid JSON.`);
  }

  if (!Array.isArray(data)) {
    throw new Error(
      `LongMemEval dataset at "${datasetFile}" has an unexpected format. Expected an array of questions.`,
    );
  }

  let questions: LongMemEvalQuestion[];
  if (data.length > 0 && isNormalizedItem(data[0])) {
    questions = (data as NormalizedLongMemEvalItem[]).map((item) => {
      // A pre-normalized dataset that doesn't carry session boundaries has no
      // session identity to give -- fall back to one synthetic session
      // wrapping the whole flattened conversation, so the memory-backend arm
      // still has something to add()/search(). evidenceSessionIds defaults to
      // empty (not fabricated: see LongMemEvalQuestion.evidenceSessionIds).
      // Flagged via haystackSessionsSynthesized: with only one document to
      // retrieve from, the memory-backend arm cannot do session-level
      // retrieval for this question -- it either returns the whole haystack
      // or nothing, so this must be disclosed rather than published as
      // ordinary retrieval (see the field's own doc comment).
      const usedFallbackSession = item.haystackSessions === undefined;
      return {
        id: item.id,
        category: item.category,
        conversation: item.conversation,
        haystackSessions: item.haystackSessions ?? [
          { sessionId: `${item.id}-session-0`, turns: item.conversation },
        ],
        evidenceSessionIds: item.evidenceSessionIds ?? [],
        haystackSessionsSynthesized: usedFallbackSession,
        question: item.question,
        expectedAnswer: item.expectedAnswer,
      };
    });
  } else {
    const rawItems = data as RawLongMemEvalItem[];
    questions = rawItems.map((item) => {
      // haystack_session_ids is the official field name and is expected to be
      // present and parallel to haystack_sessions on the real dataset; a
      // *present* array whose length disagrees with haystack_sessions would
      // otherwise silently mix real dataset session ids with synthesized
      // fallback ids within the same question (indices past the short array
      // fall back to `${question_id}-session-${i}`), breaking
      // evidenceSessionIds matching for the trailing sessions with no
      // disclosure at all. Refuse to load rather than silently mis-key half a
      // question's sessions -- this is a dataset-loading defect, not a
      // per-question scoring nuance.
      if (
        item.haystack_session_ids &&
        item.haystack_session_ids.length !== item.haystack_sessions.length
      ) {
        throw new Error(
          `LongMemEval dataset item "${item.question_id}" has ${item.haystack_session_ids.length} haystack_session_ids but ${item.haystack_sessions.length} haystack_sessions. These must be the same length -- a short haystack_session_ids array would silently mix real dataset session ids with synthesized fallback ids within the same question. Fix the dataset file rather than loading it partially keyed.`,
        );
      }
      return {
        id: item.question_id,
        category: normalizeCategory(item.question_type),
        conversation: flattenSessions(item.haystack_sessions),
        haystackSessions: item.haystack_sessions.map((turns, sessionIndex) => ({
          // The synthesized fallback (missing haystack_session_ids entirely)
          // only fires for this repo's own minimal test fixtures that omit it
          // (see the RawLongMemEvalItem comment) -- the length-mismatch case
          // above is refused, not silently patched.
          sessionId:
            item.haystack_session_ids?.[sessionIndex] ??
            `${item.question_id}-session-${sessionIndex}`,
          timestamp: item.haystack_dates?.[sessionIndex],
          turns,
        })),
        evidenceSessionIds: item.answer_session_ids ?? [],
        haystackSessionsSynthesized: false,
        question: item.question,
        expectedAnswer: item.answer,
      };
    });
  }

  if (options.questionCategories && options.questionCategories.length > 0) {
    questions = questions.filter((q) => options.questionCategories?.includes(q.category));
  }

  if (options.smoke) {
    questions = questions.slice(0, 5);
  }

  if (options.maxQuestions && options.maxQuestions > 0) {
    questions = questions.slice(0, options.maxQuestions);
  }

  return questions;
}
