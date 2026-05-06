import path from 'node:path';
import type { AgentRunner } from '../../agent/types.ts';
import { ArtifactStore } from '../../core/artifact-store.ts';
import type { RunContext } from '../../core/run-context.ts';
import type { NormalizedRunResult } from '../../core/types.ts';
import type { MemoryBackend, MemoryDocument } from '../../memory/types.ts';
import { markdownReportForResult } from '../../reporting/markdown.ts';
import { estimateCostUsd } from '../../telemetry/cost.ts';
import { summarizeLatencyMs } from '../../telemetry/latency.ts';
import { createLogBuffer } from '../../telemetry/logs.ts';
import { computeTokenUsage } from '../../telemetry/tokens.ts';
import type { PackAdapter } from '../types.ts';
import { loadDataset } from './dataset.ts';
import { aggregateResults, scoreQuestion, type QuestionResult } from './scorer.ts';

export const longMemEvalAdapter: PackAdapter = {
  id: 'longmemeval',
  description: 'LongMemEval benchmark for evaluating long-term memory in conversational AI.',
  checkInstalled() {
    return true;
  },
  async run(context, memory, agent): Promise<NormalizedRunResult> {
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    const packConfig = context.run.packConfig as Record<string, unknown> | undefined;
    const datasetPath = typeof packConfig?.datasetPath === 'string'
      ? packConfig.datasetPath
      : undefined;
    const maxQuestions = typeof packConfig?.maxQuestions === 'number'
      ? packConfig.maxQuestions
      : undefined;
    const questionCategories = Array.isArray(packConfig?.questionCategories)
      ? (packConfig.questionCategories as string[])
      : undefined;
    const smoke = packConfig?.smoke === true;

    const questions = await loadDataset({
      datasetPath,
      maxQuestions,
      questionCategories,
      smoke,
    });

    await memory.reset();

    const results: QuestionResult[] = [];
    const topK = context.run.retrieval?.topK ?? 3;
    const fallbackAnswer = context.run.answer?.actual ?? 'No agent runner available.';

    for (const question of questions) {
      const questionStart = Date.now();

      // Build memory documents from conversation chunks
      const conversationChunks: MemoryDocument[] = question.conversation.map((turn, index) => ({
        id: `${question.id}-turn-${index}`,
        text: `${turn.role}: ${turn.content}`,
        metadata: { questionId: question.id, role: turn.role, category: question.category },
      }));

      // Add chunks to memory backend (skip for 'none' to avoid noise)
      if (memory.id !== 'none') {
        await memory.add(conversationChunks);
      }

      // Search memory for relevant context
      let retrievedResults: MemoryDocument[] = [];
      if (memory.id !== 'none') {
        const memoryResults = await memory.search({ text: question.question, topK });
        retrievedResults = memoryResults.map((r) => ({
          id: r.id,
          text: r.text,
          metadata: r.metadata,
        }));
      }

      // Build prompt
      const conversationHistory = question.conversation
        .map((turn) => `${turn.role}: ${turn.content}`)
        .join('\n');

      const retrievedContext = retrievedResults.length > 0
        ? `\nRetrieved context:\n${retrievedResults.map((r) => `- ${r.text}`).join('\n')}`
        : '';

      const prompt = `Conversation history:\n${conversationHistory}${retrievedContext}\n\nQuestion: ${question.question}\nAnswer:`;

      // Get answer from agent or fallback
      let actualAnswer = '';
      let agentLatency = 0;
      let promptTokens = 0;
      let completionTokens = 0;
      let agentError: string | undefined;

      if (agent) {
        const agentResult = await agent.run({ prompt });
        actualAnswer = agentResult.text;
        agentLatency = agentResult.latencyMs;
        if (agentResult.usage) {
          promptTokens = agentResult.usage.input;
          completionTokens = agentResult.usage.output;
        }
        if (!agentResult.ok) {
          agentError = agentResult.error;
        }
      } else {
        actualAnswer = fallbackAnswer;
        const tokenUsage = computeTokenUsage({ prompt, completion: actualAnswer });
        promptTokens = tokenUsage.promptTokens;
        completionTokens = tokenUsage.completionTokens;
      }

      const questionLatency = agentLatency || Math.max(1, Date.now() - questionStart);

      // Relevant ids for retrieval scoring: all turns for this question
      const relevantIds = conversationChunks.map((c) => c.id);

      const result = scoreQuestion(
        question,
        actualAnswer,
        retrievedResults,
        relevantIds,
        topK,
        questionLatency,
        promptTokens,
        completionTokens,
      );
      results.push(result);

      if (agentError) {
        result.judgeResult = { passed: false, rationale: `Agent error: ${agentError}`, score: 0 };
      }
    }

    const aggregated = aggregateResults(results);

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));

    const warnings: string[] = [];
    if (questions.length === 0) {
      warnings.push('No questions loaded from dataset.');
    }

    const status = warnings.length > 0
      ? 'warning'
      : aggregated.overallAccuracy >= 0.5
        ? 'passed'
        : 'failed';

    const result: NormalizedRunResult = {
      schemaVersion: '1.0',
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status,
      startedAt,
      finishedAt,
      durationMs,
      warnings,
      notes: [
        `LongMemEval executed ${questions.length} questions across ${Object.keys(aggregated.perCategoryAccuracy).length} categories.`,
        `Overall accuracy: ${(aggregated.overallAccuracy * 100).toFixed(1)}%`,
      ],
      metrics: {
        retrieval: aggregated.avgRetrievalMetrics,
        answer: aggregated.avgAnswerMetrics,
        aggregate: {
          score: Number(
            (
              (aggregated.avgRetrievalMetrics.ndcgAtK +
                aggregated.avgAnswerMetrics.tokenF1 +
                aggregated.avgAnswerMetrics.exactMatch +
                aggregated.avgAnswerMetrics.judgedPass) /
              4
            ).toFixed(6),
          ),
          retrievalWeight: 0.5,
          answerWeight: 0.5,
        },
      },
      telemetry: {
        promptTokens: aggregated.totalPromptTokens,
        completionTokens: aggregated.totalCompletionTokens,
        totalTokens: aggregated.totalPromptTokens + aggregated.totalCompletionTokens,
        estimatedCostUsd: estimateCostUsd(aggregated.totalPromptTokens + aggregated.totalCompletionTokens),
        latencyMs: summarizeLatencyMs(aggregated.totalLatencyMs || durationMs),
        logs: createLogBuffer([
          `pack=${context.run.pack}`,
          `variant=${context.run.variant}`,
          `memory=${memory.id}`,
          `questions=${questions.length}`,
          `overallAccuracy=${aggregated.overallAccuracy.toFixed(3)}`,
        ]),
      },
      artifacts: {
        resultPath: '',
        summaryPath: '',
        rawOutputPath: '',
      },
      metadata: {
        ...context.run.metadata,
        overallAccuracy: aggregated.overallAccuracy,
        questionCount: questions.length,
        ...Object.fromEntries(
          Object.entries(aggregated.perCategoryAccuracy).map(([k, v]) => [`accuracy_${k}`, v]),
        ),
      },
    };

    const rawOutput = {
      pack: 'longmemeval',
      memory: memory.id,
      questions: results.map((r) => ({
        id: r.questionId,
        category: r.category,
        expected: r.expectedAnswer,
        actual: r.actualAnswer,
        judge: r.judgeResult,
        retrieval: r.retrievalMetrics,
      })),
      aggregated,
    };

    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', rawOutput);
    result.artifacts.resultPath = path.resolve(store.baseDir, 'result.json');
    result.artifacts.summaryPath = path.resolve(store.baseDir, 'summary.md');
    store.writeJson('result.json', result);
    store.writeText('summary.md', markdownReportForResult(result));
    return result;
  },
};
