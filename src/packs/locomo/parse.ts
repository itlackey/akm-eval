export interface LoCoMoScoredQuestion {
  category: number;
  question: string;
  answer: string;
  evidence: string[];
  [key: string]: unknown;
}

export interface LoCoMoScoredSample {
  sample_id: string;
  qa: LoCoMoScoredQuestion[];
}

export interface ParsedLoCoMoEvaluatorOutput {
  dataset_path: string;
  predictions_path: string;
  model_key: string;
  prediction_key: string;
  question_count: number;
  overall_accuracy: number;
  category_accuracy: Record<string, number>;
  stats: Record<string, unknown>;
  scored_samples: LoCoMoScoredSample[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseLocomoRawOutput(value: unknown): ParsedLoCoMoEvaluatorOutput {
  if (!isObject(value)) {
    throw new Error("LoCoMo evaluator output must be an object.");
  }
  if (typeof value.dataset_path !== "string" || typeof value.predictions_path !== "string") {
    throw new Error("LoCoMo evaluator output is missing dataset_path or predictions_path.");
  }
  if (typeof value.model_key !== "string" || typeof value.prediction_key !== "string") {
    throw new Error("LoCoMo evaluator output is missing model_key or prediction_key.");
  }
  if (typeof value.question_count !== "number" || typeof value.overall_accuracy !== "number") {
    throw new Error("LoCoMo evaluator output is missing question_count or overall_accuracy.");
  }
  if (!Array.isArray(value.scored_samples)) {
    throw new Error("LoCoMo evaluator output is missing scored_samples.");
  }

  return value as ParsedLoCoMoEvaluatorOutput;
}
