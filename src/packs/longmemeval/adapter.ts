import fs from 'node:fs';
import path from 'node:path';
import { ArtifactStore } from '../../core/artifact-store.ts';
import { BenchmarkRuntimeError } from '../../core/errors.ts';
import type { RunContext } from '../../core/run-context.ts';
import type { NormalizedRunResult } from '../../core/types.ts';
import type { MemoryBackend } from '../../memory/types.ts';
import { markdownReportForResult } from '../../reporting/markdown.ts';
import type { PackAdapter } from '../types.ts';
import { requireAgentRunner, requireExistingFile } from '../runtime-requirements.ts';
import { loadDataset, resolveDatasetFile } from './dataset.ts';

interface LongMemEvalPackConfig {
  datasetPath?: string;
  maxQuestions?: number;
  questionCategories?: string[];
  smoke?: boolean;
  evaluatorCommand?: string;
  evaluatorModel?: string;
  predictionsPath?: string;
  evaluationLogPath?: string;
}

interface EvaluationLogEntry {
  question_id?: string;
  autoeval_label?: {
    model?: string;
    label?: boolean;
  };
}

function isOpenAICompatibleConfig(config: unknown): config is { type: 'openai-compatible'; baseURL?: string; apiKey?: string } {
  return typeof config === 'object' && config !== null && (config as { type?: string }).type === 'openai-compatible';
}

function runCommand(command: string, cwd: string, env: Record<string, string | undefined>): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(['bash', '-lc', command], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  });

  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
  };
}

function readJsonLines(filePath: string): EvaluationLogEntry[] {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EvaluationLogEntry);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveEvaluationLogPath(evalStdout: string, fallbackPath: string): string {
  const candidate = evalStdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  return candidate && fs.existsSync(candidate) ? candidate : fallbackPath;
}

function evaluatorWrapperPath(rootDir: string): string {
  return path.resolve(rootDir, 'scripts/longmemeval-evaluator.py');
}

export const longMemEvalAdapter: PackAdapter = {
  id: 'longmemeval',
  description: 'LongMemEval using the official dataset and a configured official-evaluator command (default wrapper bundled in this repo).',
  checkInstalled(rootDir = process.cwd()) {
    return fs.existsSync(evaluatorWrapperPath(rootDir));
  },
  getDoctorDetail(rootDir = process.cwd()) {
    if (!fs.existsSync(evaluatorWrapperPath(rootDir))) {
      return {
        status: 'warn' as const,
        detail: 'repo-bundled LongMemEval evaluator wrapper missing at scripts/longmemeval-evaluator.py; runs need a configured evaluator command and this repo does not fall back to heuristic local judging.',
      };
    }
    return {
      status: 'ok' as const,
      detail: 'repo-bundled LongMemEval evaluator wrapper available at scripts/longmemeval-evaluator.py; runs still need pack.config.evaluatorCommand plus Python openai and OPENAI_BASE_URL or OPENAI_API_KEY in that evaluator environment.',
    };
  },
  async run(context, memory, agent): Promise<NormalizedRunResult> {
    const resolvedAgent = requireAgentRunner(agent, 'longmemeval');
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    await memory.reset();

    const packConfig = (context.run.packConfig ?? {}) as LongMemEvalPackConfig;
    const evaluatorCommand = typeof packConfig.evaluatorCommand === 'string' ? packConfig.evaluatorCommand : undefined;
    if (!evaluatorCommand) {
      throw new BenchmarkRuntimeError(
        'longmemeval requires `pack.config.evaluatorCommand` pointing at the official LongMemEval evaluation script or wrapper. ' +
          'This repo no longer falls back to heuristic local scoring.',
      );
    }

    const datasetPath = await resolveDatasetFile(packConfig.datasetPath, context.rootDir);
    const questions = await loadDataset({
      rootDir: context.rootDir,
      datasetPath: packConfig.datasetPath,
      maxQuestions: packConfig.maxQuestions,
      questionCategories: packConfig.questionCategories,
      smoke: packConfig.smoke,
    });

    const predictions = [] as Array<{ question_id: string; hypothesis: string }>;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalLatencyMs = 0;

    for (const question of questions) {
      const conversationHistory = question.conversation
        .map((turn) => `${turn.role}: ${turn.content}`)
        .join('\n');
      const prompt = [
        'Conversation history:',
        conversationHistory,
        '',
        `Question: ${question.question}`,
        'Answer with only the minimal factual answer needed.',
        'Do not add explanation, markdown, qualifiers, or extra context.',
        'If the answer is not in the conversation history, answer exactly: I don\'t know',
        'Answer:',
      ].join('\n');

      const agentResult = await resolvedAgent.run({ prompt });
      if (!agentResult.ok) {
        throw new BenchmarkRuntimeError(`longmemeval agent run failed for ${question.id}: ${agentResult.error ?? 'unknown error'}`);
      }

      totalPromptTokens += agentResult.usage?.input ?? 0;
      totalCompletionTokens += agentResult.usage?.output ?? 0;
      totalTokens += agentResult.usage?.total ?? 0;
      totalLatencyMs += agentResult.latencyMs;

      predictions.push({
        question_id: question.id,
        hypothesis: agentResult.text,
      });
    }

    const predictionsPath = path.resolve(
      context.outputDir,
      typeof packConfig.predictionsPath === 'string' ? packConfig.predictionsPath : 'predictions.jsonl',
    );
    requireExistingFile(datasetPath, 'longmemeval requires a concrete dataset file for the official evaluator.');

    fs.writeFileSync(predictionsPath, `${predictions.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');

    const evaluatorModel = typeof packConfig.evaluatorModel === 'string' ? packConfig.evaluatorModel : 'gpt-4o';
    const evaluatorEnv: Record<string, string | undefined> = { ...process.env };
    const provider = context.run.agentProviderConfig;
    if (isOpenAICompatibleConfig(provider)) {
      if (provider.baseURL) {
        evaluatorEnv.OPENAI_BASE_URL = provider.baseURL;
      }
      if (provider.apiKey !== undefined) {
        evaluatorEnv.OPENAI_API_KEY = provider.apiKey;
      }
    }
    const evalResult = runCommand(
      `${evaluatorCommand} ${JSON.stringify(evaluatorModel)} ${JSON.stringify(predictionsPath)} ${JSON.stringify(datasetPath)}`,
      context.rootDir,
      evaluatorEnv,
    );
    if (evalResult.exitCode !== 0) {
      throw new BenchmarkRuntimeError(
        `longmemeval official evaluator failed with exit code ${evalResult.exitCode}. stderr: ${evalResult.stderr || '(empty)'}`,
      );
    }

    const configuredEvaluationLogPath = typeof packConfig.evaluationLogPath === 'string'
      ? path.resolve(context.rootDir, packConfig.evaluationLogPath)
      : `${predictionsPath}.eval-results-${evaluatorModel}`;
    const evaluationLogPath = requireExistingFile(
      resolveEvaluationLogPath(evalResult.stdout, configuredEvaluationLogPath),
      'longmemeval official evaluator did not produce the expected evaluation log.',
    );

    const evaluationEntries = readJsonLines(evaluationLogPath);
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const perQuestion = evaluationEntries.map((entry) => {
      const questionId = entry.question_id;
      if (!questionId) {
        throw new BenchmarkRuntimeError(`longmemeval evaluation log entry is missing question_id: ${JSON.stringify(entry)}`);
      }
      const question = questionMap.get(questionId);
      if (!question) {
        throw new BenchmarkRuntimeError(`longmemeval evaluation log referenced unknown question_id: ${questionId}`);
      }
      const passed = entry.autoeval_label?.label === true;
      return {
        questionId,
        category: question.category,
        expectedAnswer: question.expectedAnswer,
        actualAnswer: predictions.find((prediction) => prediction.question_id === questionId)?.hypothesis ?? '',
        passed,
      };
    });

    const overallAccuracy = average(perQuestion.map((entry) => (entry.passed ? 1 : 0)));
    const categories = new Map<string, number[]>();
    for (const entry of perQuestion) {
      const bucket = categories.get(entry.category) ?? [];
      bucket.push(entry.passed ? 1 : 0);
      categories.set(entry.category, bucket);
    }

    const perCategoryAccuracy = Object.fromEntries(
      [...categories.entries()].map(([category, values]) => [category, Number(average(values).toFixed(6))]),
    );

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));
    const score = Number(overallAccuracy.toFixed(6));

    const result: NormalizedRunResult = {
      schemaVersion: '1.0',
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status: perQuestion.length === 0 ? 'warning' : overallAccuracy > 0 ? 'passed' : 'failed',
      startedAt,
      finishedAt,
      durationMs,
      warnings: [],
      notes: [
        `LongMemEval executed ${questions.length} question(s) and scored them with the official evaluator command.`,
        `Overall accuracy: ${(overallAccuracy * 100).toFixed(1)}%`,
        `Evaluator model: ${evaluatorModel}`,
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
          judgedPass: score,
        },
        aggregate: {
          score,
          retrievalWeight: 0,
          answerWeight: 1,
        },
      },
      telemetry: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
        estimatedCostUsd: 0,
        latencyMs: totalLatencyMs || durationMs,
        logs: [
          `pack=${context.run.pack}`,
          `variant=${context.run.variant}`,
          `memory=${memory.id}`,
          `questions=${questions.length}`,
          `evaluatorModel=${evaluatorModel}`,
        ],
      },
      artifacts: {
        resultPath: '',
        summaryPath: '',
        rawOutputPath: '',
      },
      metadata: {
        ...context.run.metadata,
        benchmarkId: path.basename(datasetPath, path.extname(datasetPath)),
        questionCount: questions.length,
        overallAccuracy: score,
        evaluatorCommand,
        evaluatorModel,
        predictionsPath,
        evaluationLogPath,
        ...Object.fromEntries(Object.entries(perCategoryAccuracy).map(([key, value]) => [`accuracy_${key}`, value])),
      },
    };

    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
      pack: 'longmemeval',
      predictionsPath,
      datasetPath,
      evaluationLogPath,
      evaluatorCommand,
      evaluatorModel,
      evaluatorStdout: evalResult.stdout,
      evaluatorStderr: evalResult.stderr,
      results: perQuestion,
      perCategoryAccuracy,
    });
    result.artifacts.resultPath = path.resolve(store.baseDir, 'result.json');
    result.artifacts.summaryPath = path.resolve(store.baseDir, 'summary.md');
    store.writeJson('result.json', result);
    store.writeText('summary.md', markdownReportForResult(result));
    return result;
  },
};
