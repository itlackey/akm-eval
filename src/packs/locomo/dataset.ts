import fs from "node:fs";
import path from "node:path";
import { BenchmarkRuntimeError } from "../../core/errors.ts";

const OFFICIAL_LOCOMO_DATASET_URL =
  "https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json";
const DEFAULT_DATASET_PATH = path.resolve(process.cwd(), "datasets/locomo/locomo10.json");

export interface LoCoMoQaExample {
  question: string;
  answer: string;
  category: number;
  evidence: string[];
}

export interface LoCoMoConversationTurn {
  speaker: string;
  dia_id: string;
  text: string;
  blip_caption?: string;
}

export interface LoCoMoSample {
  sample_id: string;
  conversation: Record<string, unknown>;
  qa: LoCoMoQaExample[];
}

export interface LoadLoCoMoDatasetOptions {
  datasetPath?: string;
  maxSamples?: number;
  maxQuestions?: number;
  sampleIds?: string[];
  smoke?: boolean;
}

function isLoCoMoSample(value: unknown): value is LoCoMoSample {
  return (
    typeof value === "object" &&
    value !== null &&
    "sample_id" in value &&
    "conversation" in value &&
    "qa" in value
  );
}

async function downloadOfficialDataset(targetPath: string): Promise<void> {
  const response = await fetch(OFFICIAL_LOCOMO_DATASET_URL);
  if (!response.ok) {
    throw new BenchmarkRuntimeError(
      `Failed to download official LoCoMo dataset from ${OFFICIAL_LOCOMO_DATASET_URL}: HTTP ${response.status}`,
    );
  }

  const body = await response.text();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, body, "utf8");
}

export async function resolveDatasetFile(datasetPath?: string): Promise<string> {
  if (typeof datasetPath === "string" && datasetPath.trim().length > 0) {
    const resolved = path.resolve(datasetPath);
    if (!fs.existsSync(resolved)) {
      throw new BenchmarkRuntimeError(
        `LoCoMo dataset file not found: ${resolved}. Provide pack.config.datasetPath pointing at the official locomo10.json file.`,
      );
    }
    return resolved;
  }

  if (!fs.existsSync(DEFAULT_DATASET_PATH)) {
    await downloadOfficialDataset(DEFAULT_DATASET_PATH);
  }

  return DEFAULT_DATASET_PATH;
}

export async function loadDataset(options: LoadLoCoMoDatasetOptions = {}): Promise<LoCoMoSample[]> {
  const datasetPath = await resolveDatasetFile(options.datasetPath);
  const raw = JSON.parse(fs.readFileSync(datasetPath, "utf8")) as unknown;
  if (!Array.isArray(raw) || raw.some((entry) => !isLoCoMoSample(entry))) {
    throw new BenchmarkRuntimeError(
      `LoCoMo dataset at ${datasetPath} is not in the expected official format (expected an array of samples with sample_id, conversation, and qa).`,
    );
  }

  let samples = raw as LoCoMoSample[];
  if (Array.isArray(options.sampleIds) && options.sampleIds.length > 0) {
    const selected = new Set(options.sampleIds);
    samples = samples.filter((sample) => selected.has(sample.sample_id));
  }

  const maxSamples = options.smoke ? Math.min(options.maxSamples ?? 1, 1) : options.maxSamples;
  if (typeof maxSamples === "number" && maxSamples > 0) {
    samples = samples.slice(0, maxSamples);
  }

  const maxQuestions = options.smoke
    ? Math.min(options.maxQuestions ?? 5, 5)
    : options.maxQuestions;
  if (typeof maxQuestions === "number" && maxQuestions > 0) {
    let remaining = maxQuestions;
    const limited: LoCoMoSample[] = [];
    for (const sample of samples) {
      if (remaining <= 0) {
        break;
      }
      const qa = sample.qa.slice(0, remaining);
      if (qa.length > 0) {
        limited.push({
          ...sample,
          qa,
        });
        remaining -= qa.length;
      }
    }
    samples = limited;
  }

  if (samples.length === 0 || samples.every((sample) => sample.qa.length === 0)) {
    throw new BenchmarkRuntimeError(
      "LoCoMo dataset selection resolved to zero QA examples. Adjust pack.config filters.",
    );
  }

  return samples;
}
