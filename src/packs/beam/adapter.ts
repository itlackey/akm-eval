import path from 'node:path';
import { ArtifactStore } from '../../core/artifact-store.ts';
import { BenchmarkRuntimeError } from '../../core/errors.ts';
import type { RunContext } from '../../core/run-context.ts';
import type { NormalizedRunResult } from '../../core/types.ts';
import type { MemoryBackend } from '../../memory/types.ts';
import { markdownReportForResult } from '../../reporting/markdown.ts';
import type { PackAdapter } from '../types.ts';
import { requireAgentRunner } from '../runtime-requirements.ts';
import {
  aggregateBeamScores,
  answerBeamQuestion,
  type BeamPackConfig,
  checkBeamRuntime,
  createBeamRuntimeFingerprint,
  createBeamAnswersFile,
  createBeamResultsRoot,
  loadBeamConversations,
  resolveBeamRuntime,
  runBeamEvaluation,
} from './official.ts';

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export const beamAdapter: PackAdapter = {
  id: 'beam',
  description: 'BEAM using the official dataset and upstream evaluation pipeline.',
  checkInstalled(rootDir = process.cwd()) {
    return checkBeamRuntime(rootDir).installed;
  },
  getDoctorDetail(rootDir = process.cwd()) {
    const detail = checkBeamRuntime(rootDir);
    return {
      status: detail.installed ? 'ok' : 'warn',
      detail: detail.detail,
    };
  },
  async run(context, memory, agent): Promise<NormalizedRunResult> {
    const resolvedAgent = requireAgentRunner(agent, 'beam');
    const packConfig = (context.run.packConfig ?? {}) as BeamPackConfig;
    const runtime = resolveBeamRuntime(context.rootDir, packConfig);
    const runtimeFingerprint = createBeamRuntimeFingerprint(context.rootDir, runtime);
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    await memory.reset();

    const conversations = loadBeamConversations(runtime, packConfig);
    const allowedResultFile =
      typeof packConfig.evaluatorAllowedResultFile === 'string' && packConfig.evaluatorAllowedResultFile.trim().length > 0
        ? packConfig.evaluatorAllowedResultFile
        : `${context.run.variant}.json`;
    const evaluatorModel =
      typeof packConfig.evaluatorModel === 'string' && packConfig.evaluatorModel.trim().length > 0
        ? packConfig.evaluatorModel
        : 'gpt-4.1-mini';
    const evaluatorConcurrency =
      typeof packConfig.evaluatorConcurrency === 'number' && packConfig.evaluatorConcurrency > 0
        ? packConfig.evaluatorConcurrency
        : 1;
    const requestedChatSizes = [...new Set(conversations.map((conversation) => conversation.chatSize))].sort().join(',');

    const totalPromptTokens: number[] = [];
    const totalCompletionTokens: number[] = [];
    const totalTokens: number[] = [];
    const totalLatencies: number[] = [];
    const evaluationResults = [] as ReturnType<typeof runBeamEvaluation>[];
    const perConversationSummary: Array<Record<string, unknown>> = [];

    for (const conversation of conversations) {
      const answers = [] as Array<{ question: (typeof conversation.questions)[number]; response: string }>;
      for (const question of conversation.questions) {
        const answer = await answerBeamQuestion(resolvedAgent, conversation, question);
        if (!answer.ok) {
          throw new BenchmarkRuntimeError(
            `beam agent run failed for conversation ${conversation.conversationId} question ${question.type}[${question.index}]: ${answer.error ?? 'unknown error'}`,
          );
        }

        totalPromptTokens.push(answer.usage?.input ?? 0);
        totalCompletionTokens.push(answer.usage?.output ?? 0);
        totalTokens.push(answer.usage?.total ?? 0);
        totalLatencies.push(answer.latencyMs);
        answers.push({
          question,
          response: answer.text,
        });
      }

      const answersRoot = createBeamResultsRoot(context.outputDir, conversation.chatSize);
      const answerFilePath = createBeamAnswersFile(answersRoot, conversation, answers, allowedResultFile);
      const evaluationResult = runBeamEvaluation(
        runtime,
        conversation,
        answersRoot,
        allowedResultFile,
        evaluatorModel,
        evaluatorConcurrency,
      );
      evaluationResults.push(evaluationResult);
      perConversationSummary.push({
        conversationId: conversation.conversationId,
        chatSize: conversation.chatSize,
        questionCount: conversation.questions.length,
        answerFilePath,
        evaluationFilePath: evaluationResult.evaluationFilePath,
      });
    }

    const scores = aggregateBeamScores(evaluationResults);
    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));
    const score = scores.overall;

    const result: NormalizedRunResult = {
      schemaVersion: '1.0',
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status: scores.questionCount === 0 ? 'warning' : score > 0 ? 'passed' : 'failed',
      startedAt,
      finishedAt,
      durationMs,
      warnings: [],
      notes: [
        `BEAM executed ${conversations.length} conversation(s) and ${scores.questionCount} probing question(s).`,
        `Official evaluator model: ${evaluatorModel}`,
        `Overall BEAM score: ${(score * 100).toFixed(1)}%`,
      ],
      metrics: {
        retrieval: {
          queryCount: 0,
          precisionAtK: 0,
          recallAtK: 0,
          mrr: 0,
          ndcgAtK: 0,
        },
        answer: {
          exactMatch: 0,
          tokenF1: 0,
          containsExpected: 0,
          // BEAM's own mean LLM-judge / tau_norm score, not a pass rate:
          // upstream defines no pass threshold, so this repo does not invent
          // one. See aggregateBeamScores() in ./official.ts.
          judgedPass: score,
        },
        aggregate: {
          score,
          retrievalWeight: 0,
          answerWeight: 1,
        },
      },
      telemetry: {
        promptTokens: totalPromptTokens.reduce((sum, value) => sum + value, 0),
        completionTokens: totalCompletionTokens.reduce((sum, value) => sum + value, 0),
        totalTokens: totalTokens.reduce((sum, value) => sum + value, 0),
        estimatedCostUsd: 0,
        latencyMs: Math.round(totalLatencies.reduce((sum, value) => sum + value, 0) || durationMs),
        logs: [
          `pack=${context.run.pack}`,
          `variant=${context.run.variant}`,
          `memory=${memory.id}`,
          `conversations=${conversations.length}`,
        `questions=${scores.questionCount}`,
        `evaluatorModel=${evaluatorModel}`,
        `beamRepo=${runtime.repoPath}`,
        `beamRuntimeFingerprint=${runtimeFingerprint.fingerprintSha256}`,
      ],
      },
      artifacts: {
        resultPath: '',
        summaryPath: '',
        rawOutputPath: '',
      },
      metadata: {
        ...context.run.metadata,
        benchmarkId: 'BEAM',
        conversationCount: conversations.length,
        questionCount: scores.questionCount,
        evaluatorModel,
        beamRepoCommit: runtime.repoCommit,
        beamRepoPath: runtime.repoPath,
        beamPythonBin: runtime.pythonBin,
        beamPythonVersion: runtime.pythonVersion,
        beamDatasetPath: runtime.datasetPath,
        beamDataset10MPath: runtime.dataset10MPath,
        beamJudgeBaseUrl: runtime.judgeBaseUrl,
        beamJudgeProvider: runtime.judgeProvider,
        beamRuntimeFingerprint: runtimeFingerprint.fingerprintSha256,
        beamChatSizes: requestedChatSizes,
        ...Object.fromEntries(Object.entries(scores.byType).map(([key, value]) => [`score_${key}`, value])),
      },
    };

    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
      pack: 'beam',
      evaluatorModel,
      beamRepoCommit: runtime.repoCommit,
      beamRepoPath: runtime.repoPath,
      beamPythonBin: runtime.pythonBin,
      beamPythonVersion: runtime.pythonVersion,
      beamDatasetPath: runtime.datasetPath,
      beamDataset10MPath: runtime.dataset10MPath,
      beamJudgeBaseUrl: runtime.judgeBaseUrl,
      beamJudgeProvider: runtime.judgeProvider,
      runtimeFingerprint,
      beamChatSizes: requestedChatSizes,
      perConversationSummary,
      scores,
      evaluationResults,
      telemetry: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
        latenciesMs: totalLatencies,
        avgLatencyMs: Number(average(totalLatencies).toFixed(3)),
      },
    });
    result.artifacts.resultPath = path.resolve(store.baseDir, 'result.json');
    result.artifacts.summaryPath = path.resolve(store.baseDir, 'summary.md');
    store.writeJson('result.json', result);
    store.writeText('summary.md', markdownReportForResult(result));
    return result;
  },
};
