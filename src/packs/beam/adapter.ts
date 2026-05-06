import fs from 'node:fs';
import type { AgentRunner } from '../../agent/types.ts';
import { ArtifactStore } from '../../core/artifact-store.ts';
import type { RunContext } from '../../core/run-context.ts';
import type { NormalizedRunResult } from '../../core/types.ts';
import { scoreAnswer } from '../../memory/answer-metrics.ts';
import { judgeAnswer } from '../../memory/judge.ts';
import { scoreRetrieval } from '../../memory/retrieval-metrics.ts';
import type { MemoryBackend } from '../../memory/types.ts';
import { markdownReportForResult } from '../../reporting/markdown.ts';
import { estimateCostUsd } from '../../telemetry/cost.ts';
import { summarizeLatencyMs } from '../../telemetry/latency.ts';
import { createLogBuffer } from '../../telemetry/logs.ts';
import { computeTokenUsage } from '../../telemetry/tokens.ts';
import { downloadDataset } from '../utils/dataset-downloader.ts';
import type { PackAdapter } from '../types.ts';

interface BeamExample {
  id: string;
  query: string;
  passages: Array<{ id: string; text: string }>;
  answer: string;
}

interface BeamPackConfig {
  datasetPath?: string;
  maxTasks?: number;
  smoke?: boolean;
}

const BEAM_DATASET_URL = 'https://huggingface.co/datasets/xlangai/BEAM/resolve/main/beam_dev.json';

async function downloadBeamDataset(): Promise<string> {
  try {
    return await downloadDataset({
      name: 'beam',
      url: BEAM_DATASET_URL,
      targetPath: 'beam_dev.json',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to download BEAM dataset. ` +
      `Install instructions: https://github.com/xlang-ai/BEAM ` +
      `Error: ${message}`,
    );
  }
}

function loadDataset(datasetPath: string): BeamExample[] {
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`BEAM dataset not found at "${datasetPath}".`);
  }
  const raw = fs.readFileSync(datasetPath, 'utf8');
  const data = JSON.parse(raw) as unknown;
  if (Array.isArray(data)) {
    return data as BeamExample[];
  }
  if (isPlainObject(data) && Array.isArray(data.examples)) {
    return data.examples as BeamExample[];
  }
  if (isPlainObject(data) && Array.isArray(data.data)) {
    return data.data as BeamExample[];
  }
  throw new Error(`BEAM dataset at "${datasetPath}" has unexpected format.`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const beamAdapter: PackAdapter = {
  id: 'beam',
  description: 'BEAM benchmark for evaluating browser-based agentic task completion.',
  checkInstalled() {
    return true;
  },
  async run(context, memory, agent): Promise<NormalizedRunResult> {
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    const packConfig = context.run.packConfig as BeamPackConfig | undefined;
    let datasetPath = packConfig?.datasetPath;
    const maxTasks = packConfig?.maxTasks ?? Number.MAX_SAFE_INTEGER;
    const smoke = packConfig?.smoke === true;

    if (!datasetPath) {
      datasetPath = await downloadBeamDataset();
    }

    let examples = loadDataset(datasetPath);

    if (smoke) {
      examples = examples.slice(0, 5);
    }

    examples = examples.slice(0, maxTasks);

    await memory.reset();
    await memory.add(context.run.memoryDocuments ?? []);

    const results: Array<{
      id: string;
      query: string;
      expected: string;
      actual: string;
      passed: boolean;
      latencyMs: number;
    }> = [];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalAgentLatency = 0;
    let passedCount = 0;

    for (const example of examples) {
      const start = Date.now();
      let actual = '';
      let agentLatency = 0;

      // Add passages to memory for retrieval-augmented answering
      const docs = example.passages.map((p) => ({
        id: p.id,
        text: p.text,
        metadata: { exampleId: example.id },
      }));
      if (memory.id !== 'none') {
        await memory.add(docs);
      }

      const topK = context.run.retrieval?.topK ?? 3;
      let retrieved: string[] = [];
      if (memory.id !== 'none') {
        const searchResults = await memory.search({ text: example.query, topK });
        retrieved = searchResults.map((r) => r.text);
      }

      const contextText = retrieved.length > 0
        ? `Context:\n${retrieved.join('\n')}\n\n`
        : '';
      const prompt = `${contextText}Question: ${example.query}\nAnswer:`;

      if (agent) {
        const agentResult = await agent.run({ prompt });
        actual = agentResult.text;
        agentLatency = agentResult.latencyMs;
        if (agentResult.usage) {
          totalPromptTokens += agentResult.usage.input;
          totalCompletionTokens += agentResult.usage.output;
          totalTokens += agentResult.usage.total;
        }
        totalAgentLatency += agentLatency;
      } else {
        actual = context.run.answer?.actual ?? 'No agent runner available.';
      }

      const answerMetrics = scoreAnswer(example.answer, actual);
      const judge = judgeAnswer(example.answer, actual);
      answerMetrics.judgedPass = judge.passed ? 1 : 0;

      const passed = judge.passed;
      if (passed) passedCount++;

      results.push({
        id: example.id,
        query: example.query,
        expected: example.answer,
        actual,
        passed,
        latencyMs: Date.now() - start,
      });
    }

    const successRate = examples.length > 0 ? passedCount / examples.length : 0;

    const retrievalQuery = context.run.retrieval?.query ?? `${context.run.pack} ${context.run.variant}`;
    const topK = context.run.retrieval?.topK ?? 3;
    const searchResults = await memory.search({ text: retrievalQuery, topK });
    const retrieval = scoreRetrieval(context.run.retrieval?.relevantIds ?? [], searchResults, topK);

    const allExpected = examples.map((e) => e.answer).join('\n');
    const allActual = results.map((r) => r.actual).join('\n');
    const answer = scoreAnswer(allExpected, allActual);
    const judge = judgeAnswer(allExpected, allActual);
    answer.judgedPass = judge.passed ? 1 : 0;

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));

    const fallbackTokenUsage = computeTokenUsage({ prompt: retrievalQuery, completion: allActual });

    const warnings: string[] = [];
    if (examples.length === 0) {
      warnings.push('No examples loaded from BEAM dataset.');
    }

    const result: NormalizedRunResult = {
      schemaVersion: '1.0',
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status: warnings.length > 0 ? 'warning' : passedCount > 0 ? 'passed' : 'failed',
      startedAt,
      finishedAt,
      durationMs,
      warnings,
      notes: [
        `BEAM executed ${examples.length} example(s) from official dataset.`,
        `Passed: ${passedCount}/${examples.length}`,
        `Agent runner: ${agent ? 'available' : 'none'}`,
      ],
      metrics: {
        retrieval,
        answer,
        aggregate: {
          score: Number(successRate.toFixed(6)),
          retrievalWeight: 0.5,
          answerWeight: 0.5,
        },
      },
      telemetry: {
        promptTokens: agent ? totalPromptTokens : fallbackTokenUsage.promptTokens,
        completionTokens: agent ? totalCompletionTokens : fallbackTokenUsage.completionTokens,
        totalTokens: agent ? totalTokens : fallbackTokenUsage.totalTokens,
        estimatedCostUsd: estimateCostUsd(agent ? totalTokens : fallbackTokenUsage.totalTokens),
        latencyMs: summarizeLatencyMs(agent ? totalAgentLatency : durationMs),
        logs: createLogBuffer([
          `pack=${context.run.pack}`,
          `variant=${context.run.variant}`,
          `memory=${memory.id}`,
          `examples=${examples.length}`,
          `passed=${passedCount}`,
        ]),
      },
      artifacts: {
        resultPath: '',
        summaryPath: '',
        rawOutputPath: '',
      },
      metadata: {
        ...context.run.metadata,
        exampleCount: examples.length,
        passedCount,
        successRate: Number(successRate.toFixed(4)),
      },
    };

    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
      pack: 'beam',
      memory: memory.id,
      results,
      searchResults,
      judge,
    });
    result.artifacts.resultPath = store.writeJson('result.json', result);
    result.artifacts.summaryPath = store.writeText('summary.md', markdownReportForResult(result));

    return result;
  },
};
