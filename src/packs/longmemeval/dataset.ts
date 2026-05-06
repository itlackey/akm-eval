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

const OFFICIAL_DATASET_URL = 'https://huggingface.co/datasets/anon_user/longmemeval/resolve/main/longmemeval.json';

export async function loadDataset(options: DatasetLoadOptions): Promise<LongMemEvalQuestion[]> {
  let datasetFile: string;

  if (options.datasetPath) {
    datasetFile = options.datasetPath;
    if (!fs.existsSync(datasetFile)) {
      throw new Error(
        `LongMemEval dataset not found at "${datasetFile}". ` +
        `Remove datasetPath from config to auto-download, or provide a valid local path.`,
      );
    }
  } else {
    try {
      datasetFile = await downloadDataset({
        name: 'longmemeval',
        url: OFFICIAL_DATASET_URL,
        targetPath: 'longmemeval.json',
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

  const raw = fs.readFileSync(datasetFile, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`LongMemEval dataset at "${datasetFile}" is not valid JSON.`);
  }

  let questions: LongMemEvalQuestion[] = [];
  if (Array.isArray(data)) {
    questions = data as LongMemEvalQuestion[];
  } else if (isPlainObject(data) && Array.isArray(data.questions)) {
    questions = data.questions as LongMemEvalQuestion[];
  } else {
    throw new Error(
      `LongMemEval dataset at "${datasetFile}" has an unexpected format. ` +
      `Expected an array of questions or an object with a "questions" array.`,
    );
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
