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

interface LocomoSession {
  session_id: string;
  conversation: Array<{ role: string; content: string }>;
  questions: Array<{
    id: string;
    question: string;
    answer: string;
    category?: string;
  }>;
}

interface LocomoPackConfig {
  datasetPath?: string;
  maxTasks?: number;
  smoke?: boolean;
}

const LOCOMO_DATASET_URL = 'https://huggingface.co/datasets/locuslab/locomo/resolve/main/locomo.json';

async function downloadLocomoDataset(): Promise<string> {
  try {
    return await downloadDataset({
      name: 'locomo',
      url: LOCOMO_DATASET_URL,
      targetPath: 'locomo.json',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to download LoCoMo dataset. ` +
      `Install instructions: https://github.com/locuslab/locomo ` +
      `Error: ${message}`,
    );
  }
}

function loadDataset(datasetPath: string): LocomoSession[] {
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`LoCoMo dataset not found at "${datasetPath}".`);
  }
  const raw = fs.readFileSync(datasetPath, 'utf8');
  const data = JSON.parse(raw) as unknown;
  if (Array.isArray(data)) {
    return data as LocomoSession[];
  }
  if (isPlainObject(data) && Array.isArray(data.sessions)) {
    return data.sessions as LocomoSession[];
  }
  if (isPlainObject(data) && Array.isArray(data.data)) {
    return data.data as LocomoSession[];
  }
  throw new Error(`LoCoMo dataset at "${datasetPath}" has unexpected format.`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const locomoAdapter: PackAdapter = {
  id: 'locomo',
  description: 'LoCoMo benchmark for evaluating long-context conversational memory.',
  checkInstalled() {
    return true;
  },
  async run(context, memory, agent): Promise<NormalizedRunResult> {
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    const packConfig = context.run.packConfig as LocomoPackConfig | undefined;
    let datasetPath = packConfig?.datasetPath;
    const maxTasks = packConfig?.maxTasks ?? Number.MAX_SAFE_INTEGER;
    const smoke = packConfig?.smoke === true;

    if (!datasetPath) {
      datasetPath = await downloadLocomoDataset();
    }

    let sessions = loadDataset(datasetPath);

    if (smoke) {
      sessions = sessions.slice(0, 2);
    }

    sessions = sessions.slice(0, maxTasks);

    await memory.reset();
    await memory.add(context.run.memoryDocuments ?? []);

    const sessionResults: Array<{
      sessionId: string;
      questions: Array<{
        questionId: string;
        question: string;
        expected: string;
        actual: string;
        passed: boolean;
      }>;
      accuracy: number;
    }> = [];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalAgentLatency = 0;
    let totalQuestions = 0;
    let passedCount = 0;

    for (const session of sessions) {
      const conversationDocs = session.conversation.map((turn, idx) => ({
        id: `${session.session_id}-turn-${idx}`,
        text: `${turn.role}: ${turn.content}`,
        metadata: { sessionId: session.session_id, role: turn.role },
      }));

      if (memory.id !== 'none') {
        await memory.add(conversationDocs);
      }

      const questionResults: Array<{
        questionId: string;
        question: string;
        expected: string;
        actual: string;
        passed: boolean;
      }> = [];

      for (const q of session.questions) {
        const start = Date.now();
        let actual = '';
        let agentLatency = 0;

        const topK = context.run.retrieval?.topK ?? 3;
        let retrieved: string[] = [];
        if (memory.id !== 'none') {
          const searchResults = await memory.search({ text: q.question, topK });
          retrieved = searchResults.map((r) => r.text);
        }

        const contextText = retrieved.length > 0
          ? `Conversation context:\n${retrieved.join('\n')}\n\n`
          : '';
        const prompt = `${contextText}Question: ${q.question}\nAnswer:`;

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

        const judge = judgeAnswer(q.answer, actual);
        const passed = judge.passed;
        if (passed) passedCount++;
        totalQuestions++;

        questionResults.push({
          questionId: q.id,
          question: q.question,
          expected: q.answer,
          actual,
          passed,
        });
      }

      const accuracy = session.questions.length > 0
        ? questionResults.filter((r) => r.passed).length / session.questions.length
        : 0;

      sessionResults.push({
        sessionId: session.session_id,
        questions: questionResults,
        accuracy: Number(accuracy.toFixed(4)),
      });
    }

    const successRate = totalQuestions > 0 ? passedCount / totalQuestions : 0;

    const retrievalQuery = context.run.retrieval?.query ?? `${context.run.pack} ${context.run.variant}`;
    const topK = context.run.retrieval?.topK ?? 3;
    const searchResults = await memory.search({ text: retrievalQuery, topK });
    const retrieval = scoreRetrieval(context.run.retrieval?.relevantIds ?? [], searchResults, topK);

    const allExpected = sessions.flatMap((s) => s.questions.map((q) => q.answer)).join('\n');
    const allActual = sessionResults.flatMap((s) => s.questions.map((q) => q.actual)).join('\n');
    const answer = scoreAnswer(allExpected, allActual);
    const judge = judgeAnswer(allExpected, allActual);
    answer.judgedPass = judge.passed ? 1 : 0;

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));

    const fallbackTokenUsage = computeTokenUsage({ prompt: retrievalQuery, completion: allActual });

    const warnings: string[] = [];
    if (sessions.length === 0) {
      warnings.push('No sessions loaded from LoCoMo dataset.');
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
        `LoCoMo executed ${sessions.length} session(s) with ${totalQuestions} question(s) from official dataset.`,
        `Passed: ${passedCount}/${totalQuestions}`,
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
          `sessions=${sessions.length}`,
          `questions=${totalQuestions}`,
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
        sessionCount: sessions.length,
        questionCount: totalQuestions,
        passedCount,
        successRate: Number(successRate.toFixed(4)),
        ...Object.fromEntries(
          sessionResults.map((s) => [`accuracy_${s.sessionId}`, s.accuracy]),
        ),
      },
    };

    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
      pack: 'locomo',
      memory: memory.id,
      sessions: sessionResults,
      searchResults,
      judge,
    });
    result.artifacts.resultPath = store.writeJson('result.json', result);
    result.artifacts.summaryPath = store.writeText('summary.md', markdownReportForResult(result));

    return result;
  },
};
