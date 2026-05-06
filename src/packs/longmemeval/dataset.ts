import fs from 'node:fs';
import { downloadDataset } from '../utils/dataset-downloader.ts';

export interface LongMemEvalQuestion {
  id: string;
  category: 'single-session' | 'multi-session' | 'temporal' | 'preference';
  conversation: Array<{ role: string; content: string }>;
  question: string;
  expectedAnswer: string;
}

export interface DatasetLoadOptions {
  datasetPath?: string;
  maxQuestions?: number;
  questionCategories?: string[];
  smoke?: boolean;
}

const OFFICIAL_DATASET_URL = 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json';

interface RawLongMemEvalItem {
  question_id: string;
  question_type: string;
  question: string;
  answer: string;
  haystack_sessions: Array<Array<{ role: string; content: string }>>;
}

interface NormalizedLongMemEvalItem {
  id: string;
  category: LongMemEvalQuestion['category'];
  conversation: Array<{ role: string; content: string }>;
  question: string;
  expectedAnswer: string;
}

export async function resolveDatasetFile(datasetPath?: string): Promise<string> {
  if (datasetPath) {
    if (!fs.existsSync(datasetPath)) {
      throw new Error(
        `LongMemEval dataset not found at "${datasetPath}". ` +
          `Remove datasetPath from config to auto-download, or provide a valid local path.`,
      );
    }
    return datasetPath;
  }

  try {
    return await downloadDataset({
      name: 'longmemeval',
      url: OFFICIAL_DATASET_URL,
      targetPath: 'longmemeval_s_cleaned.json',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to download LongMemEval dataset. ` +
        `The official dataset may be unavailable or the URL may have changed. ` +
        `Error: ${message}`,
    );
  }
}

function normalizeCategory(rawType: string): LongMemEvalQuestion['category'] {
  const type = rawType.toLowerCase();
  if (type.includes('single')) return 'single-session';
  if (type.includes('multi')) return 'multi-session';
  if (type.includes('temporal')) return 'temporal';
  if (type.includes('preference')) return 'preference';
  return 'single-session';
}

function flattenSessions(sessions: Array<Array<{ role: string; content: string }>>): Array<{ role: string; content: string }> {
  const flat: Array<{ role: string; content: string }> = [];
  for (const session of sessions) {
    for (const turn of session) {
      flat.push(turn);
    }
  }
  return flat;
}

function isNormalizedItem(value: unknown): value is NormalizedLongMemEvalItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.category === 'string' &&
    Array.isArray(item.conversation) &&
    typeof item.question === 'string' &&
    typeof item.expectedAnswer === 'string'
  );
}

export async function loadDataset(options: DatasetLoadOptions): Promise<LongMemEvalQuestion[]> {
  const datasetFile = await resolveDatasetFile(options.datasetPath);

  const raw = fs.readFileSync(datasetFile, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`LongMemEval dataset at "${datasetFile}" is not valid JSON.`);
  }

  if (!Array.isArray(data)) {
    throw new Error(
      `LongMemEval dataset at "${datasetFile}" has an unexpected format. ` +
      `Expected an array of questions.`,
    );
  }

  let questions: LongMemEvalQuestion[];
  if (data.length > 0 && isNormalizedItem(data[0])) {
    questions = (data as NormalizedLongMemEvalItem[]).map((item) => ({
      id: item.id,
      category: item.category,
      conversation: item.conversation,
      question: item.question,
      expectedAnswer: item.expectedAnswer,
    }));
  } else {
    const rawItems = data as RawLongMemEvalItem[];
    questions = rawItems.map((item) => ({
      id: item.question_id,
      category: normalizeCategory(item.question_type),
      conversation: flattenSessions(item.haystack_sessions),
      question: item.question,
      expectedAnswer: item.answer,
    }));
  }

  if (options.smoke) {
    questions = questions.slice(0, 5);
  }

  if (options.questionCategories && options.questionCategories.length > 0) {
    questions = questions.filter((q) => options.questionCategories!.includes(q.category));
  }

  if (options.maxQuestions && options.maxQuestions > 0) {
    questions = questions.slice(0, options.maxQuestions);
  }

  return questions;
}
