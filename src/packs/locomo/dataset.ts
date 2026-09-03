import fs from "node:fs";
import path from "node:path";
import { type SampleProvenance, sampleItems } from "../../core/sampling.ts";
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
  /** Required whenever maxSamples/maxQuestions subsets a non-smoke run -- see src/core/sampling.ts. */
  sampleSeed?: number;
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

  const totalSamples = samples.length;
  const maxSamples = options.smoke ? Math.min(options.maxSamples ?? 1, 1) : options.maxSamples;
  const sampledConversations = sampleItems(samples, maxSamples, {
    seed: options.sampleSeed,
    smoke: options.smoke,
    label: "LoCoMo (conversations)",
  });
  samples = sampledConversations.items;

  const totalQuestions = samples.reduce((sum, sample) => sum + sample.qa.length, 0);
  const maxQuestions = options.smoke
    ? Math.min(options.maxQuestions ?? 5, 5)
    : options.maxQuestions;

  // Sample across the FLATTENED question pool, not per-conversation. The old
  // loop filled its budget from the first conversation before touching the
  // second, so a 25-question cap over 10 conversations read 25 questions from
  // one of them -- a subset of a subset, both taken in file order.
  const flattened = samples.flatMap((sample) =>
    sample.qa.map((qa) => ({ sampleId: sample.sample_id, qa })),
  );
  const sampledQuestions = sampleItems(flattened, maxQuestions, {
    seed: options.sampleSeed,
    smoke: options.smoke,
    label: "LoCoMo (questions)",
  });

  if (sampledQuestions.provenance.order !== "full") {
    const keptBySample = new Map<string, LoCoMoSample["qa"]>();
    for (const entry of sampledQuestions.items) {
      const list = keptBySample.get(entry.sampleId) ?? [];
      list.push(entry.qa);
      keptBySample.set(entry.sampleId, list);
    }
    samples = samples
      .filter((sample) => keptBySample.has(sample.sample_id))
      .map((sample) => ({ ...sample, qa: keptBySample.get(sample.sample_id) ?? [] }));
  }

  lastSampleProvenance = {
    conversations: { ...sampledConversations.provenance, total: totalSamples },
    questions: { ...sampledQuestions.provenance, total: totalQuestions },
  };

  if (samples.length === 0 || samples.every((sample) => sample.qa.length === 0)) {
    throw new BenchmarkRuntimeError(
      "LoCoMo dataset selection resolved to zero QA examples. Adjust pack.config filters.",
    );
  }

  return samples;
}

/**
 * Provenance of the most recent `loadDataset` sample, for the adapter to record
 * in `result.json` -- see docs/comparability.md A3 and A7. LoCoMo subsets twice
 * (conversations, then questions within them), so both are reported.
 */
let lastSampleProvenance: {
  conversations: SampleProvenance;
  questions: SampleProvenance;
} | null = null;

export function getLastSampleProvenance() {
  return lastSampleProvenance;
}
