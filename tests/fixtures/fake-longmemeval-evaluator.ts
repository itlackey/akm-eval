#!/usr/bin/env bun
/**
 * A fake LongMemEval "official evaluator" standing in for
 * scripts/longmemeval-evaluator.py in this repo's own adapter-wiring unit
 * tests (tests/longmemeval-adapter.test.ts) -- a real subprocess (not an
 * in-process mock), invoked with the exact CLI contract the real evaluator
 * documents: `<metric_model> <predictions_path> <dataset_path>`. Output is
 * written to `<predictions_path>.eval-results-<metric_model>` (one JSON line
 * per prediction, each augmented with `autoeval_label: {model, label}`) and
 * that path is printed to stdout as the sole line, matching
 * `resolveEvaluationLogPath`'s expectation in src/packs/longmemeval/adapter.ts.
 *
 * Judging here is a deterministic substring-containment check (does the
 * hypothesis contain the expected answer?) -- good enough to pin THIS repo's
 * OWN retrieval-wiring behavior in tests (which prompt reached the model,
 * how many questions were scored, whether the right context was used), never
 * a stand-in for a real judged-pass signal. Production runs always require
 * `pack.config.evaluatorCommand` to point at the real
 * scripts/longmemeval-evaluator.py (LLM-judged, per this repo's trust
 * policy); this fixture is wired into tests only, never into a shipped
 * config.
 */
import fs from "node:fs";

interface Prediction {
  question_id: string;
  hypothesis: string;
  [key: string]: unknown;
}

interface DatasetEntry {
  question_id: string;
  answer: string;
  [key: string]: unknown;
}

const [metricModel, predictionsPath, datasetPath] = process.argv.slice(2);
if (!metricModel || !predictionsPath || !datasetPath) {
  console.error("Usage: fake-longmemeval-evaluator.ts metric_model predictions.jsonl dataset.json");
  process.exit(2);
}

function loadEntries<T>(filePath: string): T[] {
  const raw = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".jsonl")) {
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as T);
  }
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

const predictions = loadEntries<Prediction>(predictionsPath);
const dataset = loadEntries<DatasetEntry>(datasetPath);
const byId = new Map(dataset.map((entry) => [entry.question_id, entry]));

const outputPath = `${predictionsPath}.eval-results-${metricModel}`;
const lines: string[] = [];
for (const prediction of predictions) {
  const reference = byId.get(prediction.question_id);
  if (!reference) {
    console.error(`fake-longmemeval-evaluator: unknown question_id ${prediction.question_id}`);
    process.exit(1);
  }
  const expected = String(reference.answer ?? "")
    .trim()
    .toLowerCase();
  const actual = String(prediction.hypothesis ?? "")
    .trim()
    .toLowerCase();
  const label = expected.length > 0 && actual.includes(expected);
  lines.push(JSON.stringify({ ...prediction, autoeval_label: { model: metricModel, label } }));
}

fs.writeFileSync(outputPath, lines.length > 0 ? `${lines.join("\n")}\n` : "", "utf8");
console.log(outputPath);
