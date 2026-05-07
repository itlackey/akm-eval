import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { AgentRunner } from '../../agent/types.ts';
import { ArtifactStore } from '../../core/artifact-store.ts';
import { BenchmarkRuntimeError } from '../../core/errors.ts';
import type { RunContext } from '../../core/run-context.ts';
import type { NormalizedRunResult } from '../../core/types.ts';
import { scoreRetrieval } from '../../memory/retrieval-metrics.ts';
import type { MemoryBackend, MemoryDocument, MemorySearchResult, RetrievalMetrics } from '../../memory/types.ts';
import { markdownReportForResult } from '../../reporting/markdown.ts';
import type { PackAdapter } from '../types.ts';
import { requireAgentRunner } from '../runtime-requirements.ts';
import { loadDataset, resolveDatasetFile, type LoCoMoConversationTurn, type LoCoMoQaExample, type LoCoMoSample } from './dataset.ts';
import { parseLocomoRawOutput } from './parse.ts';
import { scoreLocomoAdapter } from './scorer.ts';

interface LoCoMoPackConfig {
  datasetPath?: string;
  smoke?: boolean;
  maxSamples?: number;
  maxQuestions?: number;
  sampleIds?: string[];
  topK?: number;
  maxContextTokens?: number;
  evaluatorCommand?: string;
  predictionsPath?: string;
  evaluationOutputPath?: string;
  modelKey?: string;
}

interface FlattenedTurn extends MemoryDocument {
  sessionNumber: number;
  dateTime: string;
}

const DEFAULT_EVALUATOR_COMMAND = 'python3 scripts/locomo-evaluator.py';
const DEFAULT_MAX_CONTEXT_TOKENS = 16000;
const PER_QA_TOKEN_BUDGET = 50;
const QA_PROMPT =
  'Based on the above context, write an answer in the form of a short phrase for the following question. ' +
  'Answer with exact words from the context whenever possible.\n\nQuestion: %s Short answer:';
const QA_PROMPT_CAT_5 =
  'Based on the above context, answer the following question.\n\nQuestion: %s Short answer:';
const CONV_START_PROMPT =
  'Below is a conversation between two people: %s and %s. ' +
  'The conversation takes place over multiple days and the date of each conversation is wriiten at the beginning of the conversation.\n\n';

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(Buffer.byteLength(value, 'utf8') / 4));
}

function runCommand(command: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(['bash', '-lc', command], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });

  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
  };
}

function checkPythonDeps(rootDir = process.cwd()): { ok: boolean; detail: string } {
  const result = spawnSync('python3', ['-c', 'import numpy, regex, nltk'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0) {
    return { ok: true, detail: 'python3 with numpy, regex, and nltk available' };
  }

  const detail = (result.stderr || result.stdout || 'python3 dependency check failed').trim();
  return { ok: false, detail };
}

function evaluatorScriptExists(rootDir = process.cwd()): boolean {
  return fs.existsSync(path.resolve(rootDir, 'scripts/locomo-evaluator.py'));
}

function getSpeakerNames(sample: LoCoMoSample): [string, string] {
  const sessionOne = sample.conversation.session_1;
  if (!Array.isArray(sessionOne) || sessionOne.length === 0) {
    throw new BenchmarkRuntimeError(`LoCoMo sample ${sample.sample_id} is missing conversation.session_1`);
  }

  const speakers = [...new Set(sessionOne.map((entry) => (entry as { speaker?: string }).speaker).filter(Boolean))];
  if (speakers.length < 2) {
    throw new BenchmarkRuntimeError(`LoCoMo sample ${sample.sample_id} is missing the two expected speakers`);
  }

  return [String(speakers[0]), String(speakers[1])];
}

function getSessionNumbers(conversation: Record<string, unknown>): number[] {
  return Object.keys(conversation)
    .filter((key) => /^session_\d+$/.test(key))
    .map((key) => Number(key.split('_')[1]))
    .sort((left, right) => left - right);
}

function formatDialogTurn(dialog: LoCoMoConversationTurn): string {
  let turn = `${dialog.speaker} said, "${dialog.text}"\n`;
  if (typeof dialog.blip_caption === 'string' && dialog.blip_caption.trim().length > 0) {
    turn += ` and shared ${dialog.blip_caption}.`;
  }
  turn += '\n';
  return turn;
}

function flattenConversation(sample: LoCoMoSample): FlattenedTurn[] {
  const turns: FlattenedTurn[] = [];
  for (const sessionNumber of getSessionNumbers(sample.conversation)) {
    const sessionKey = `session_${sessionNumber}`;
    const dateKey = `session_${sessionNumber}_date_time`;
    const session = sample.conversation[sessionKey];
    if (!Array.isArray(session)) {
      continue;
    }
    const dateTime = typeof sample.conversation[dateKey] === 'string' ? String(sample.conversation[dateKey]) : '';
    for (const rawDialog of session) {
      const dialog = rawDialog as LoCoMoConversationTurn;
      turns.push({
        id: dialog.dia_id,
        text: `DATE: ${dateTime}\nCONVERSATION:\n${formatDialogTurn(dialog)}`,
        metadata: {
          sampleId: sample.sample_id,
          sessionNumber,
          dateTime,
          speaker: dialog.speaker,
        },
        sessionNumber,
        dateTime,
      });
    }
  }
  return turns;
}

function buildQuestionText(question: LoCoMoQaExample): string {
  if (question.category === 2) {
    return `${question.question} Use DATE of CONVERSATION to answer with an approximate date.`;
  }
  if (question.category === 5) {
    return `${question.question} Select the correct answer: (a) Not mentioned in the conversation (b) ${question.answer}. `;
  }
  return question.question;
}

function normalizeCategoryFiveAnswer(answer: string, question: LoCoMoQaExample): string {
  const normalized = answer.trim().toLowerCase();
  if (normalized === 'a' || normalized === '(a)') {
    return 'Not mentioned in the conversation';
  }
  if (normalized === 'b' || normalized === '(b)') {
    return question.answer;
  }
  return answer.trim();
}

function buildConversationPrompt(sample: LoCoMoSample, question: LoCoMoQaExample, maxContextTokens: number): string {
  const [speakerA, speakerB] = getSpeakerNames(sample);
  const startPrompt = CONV_START_PROMPT.replace('%s', speakerA).replace('%s', speakerB);
  const questionText = buildQuestionText(question);
  const qaPrompt = (question.category === 5 ? QA_PROMPT_CAT_5 : QA_PROMPT).replace('%s', questionText);
  const reservedTokens = estimateTokens(startPrompt) + estimateTokens(qaPrompt) + PER_QA_TOKEN_BUDGET;

  let queryConversation = '';
  let stop = false;
  for (const sessionNumber of getSessionNumbers(sample.conversation)) {
    const sessionKey = `session_${sessionNumber}`;
    const dateKey = `session_${sessionNumber}_date_time`;
    const session = sample.conversation[sessionKey];
    if (!Array.isArray(session)) {
      continue;
    }

    queryConversation += '\n\n';
    for (const rawDialog of [...session].reverse()) {
      const dialog = rawDialog as LoCoMoConversationTurn;
      const turn = formatDialogTurn(dialog);
      const candidate = `DATE: ${String(sample.conversation[dateKey] ?? '')}\nCONVERSATION:\n${turn}`;
      if (estimateTokens(candidate) + estimateTokens(queryConversation) + reservedTokens < maxContextTokens) {
        queryConversation = turn + queryConversation;
      } else {
        stop = true;
        break;
      }
    }
    queryConversation = `DATE: ${String(sample.conversation[dateKey] ?? '')}\nCONVERSATION:\n${queryConversation}`;
    if (stop) {
      break;
    }
  }

  return `${startPrompt}${queryConversation}\n\n${qaPrompt}`;
}

function buildRetrievedPrompt(question: LoCoMoQaExample, retrieved: MemorySearchResult[]): string {
  const questionText = buildQuestionText(question);
  const qaPrompt = (question.category === 5 ? QA_PROMPT_CAT_5 : QA_PROMPT).replace('%s', questionText);
  const context = retrieved.map((entry) => entry.text).join('\n\n');
  return `${context}\n\n${qaPrompt}`.trim();
}

function averageRetrieval(metrics: RetrievalMetrics[]): RetrievalMetrics {
  if (metrics.length === 0) {
    return {
      queryCount: 0,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      ndcgAtK: 0,
    };
  }

  const sum = metrics.reduce(
    (acc, entry) => ({
      queryCount: acc.queryCount + entry.queryCount,
      precisionAtK: acc.precisionAtK + entry.precisionAtK,
      recallAtK: acc.recallAtK + entry.recallAtK,
      mrr: acc.mrr + entry.mrr,
      ndcgAtK: acc.ndcgAtK + entry.ndcgAtK,
    }),
    { queryCount: 0, precisionAtK: 0, recallAtK: 0, mrr: 0, ndcgAtK: 0 },
  );

  return {
    queryCount: sum.queryCount,
    precisionAtK: Number((sum.precisionAtK / metrics.length).toFixed(6)),
    recallAtK: Number((sum.recallAtK / metrics.length).toFixed(6)),
    mrr: Number((sum.mrr / metrics.length).toFixed(6)),
    ndcgAtK: Number((sum.ndcgAtK / metrics.length).toFixed(6)),
  };
}

function buildModelKey(input: string): string {
  const normalized = input.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : 'akm_eval';
}

export const locomoAdapter: PackAdapter = {
  id: 'locomo',
  description: 'LoCoMo question answering with the official dataset and authoritative QA scoring rules.',
  checkInstalled(rootDir = process.cwd()) {
    const deps = checkPythonDeps(rootDir);
    return deps.ok && evaluatorScriptExists(rootDir);
  },
  getDoctorDetail(rootDir = process.cwd()) {
    if (!evaluatorScriptExists(rootDir)) {
      return {
        status: 'warn' as const,
        detail: 'LoCoMo evaluator wrapper missing at scripts/locomo-evaluator.py; pack runs are blocked until it is available.',
      };
    }

    const deps = checkPythonDeps(rootDir);
    if (!deps.ok) {
      return {
        status: 'warn' as const,
        detail:
          'LoCoMo requires python3 plus numpy, regex, and nltk for the bundled official-score wrapper. ' +
          `Current check failed: ${deps.detail}`,
      };
    }

    const datasetCached = fs.existsSync(path.resolve(rootDir, 'datasets/locomo/locomo10.json'));
    return {
      status: 'ok' as const,
      detail: datasetCached
        ? 'official LoCoMo evaluator wrapper ready; dataset cache present at datasets/locomo/locomo10.json'
        : 'official LoCoMo evaluator wrapper ready; dataset will download from snap-research/locomo on first run',
    };
  },
  async run(context, memory, agent): Promise<NormalizedRunResult> {
    const resolvedAgent = requireAgentRunner(agent, 'locomo');
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    const packConfig = (context.run.packConfig ?? {}) as LoCoMoPackConfig;
    const datasetPath = await resolveDatasetFile(packConfig.datasetPath);
    const samples = await loadDataset({
      datasetPath: packConfig.datasetPath,
      maxSamples: packConfig.maxSamples,
      maxQuestions: packConfig.maxQuestions,
      sampleIds: packConfig.sampleIds,
      smoke: packConfig.smoke,
    });

    const deps = checkPythonDeps();
    if (!deps.ok) {
      throw new BenchmarkRuntimeError(
        'LoCoMo official evaluator wrapper requires python3 with numpy, regex, and nltk. ' +
          `Dependency check failed: ${deps.detail}`,
      );
    }
    if (!evaluatorScriptExists()) {
      throw new BenchmarkRuntimeError(
        'LoCoMo official evaluator wrapper is missing. Expected scripts/locomo-evaluator.py to exist.',
      );
    }

    await memory.reset();

    const topK = typeof packConfig.topK === 'number' && packConfig.topK > 0 ? packConfig.topK : 5;
    const maxContextTokens =
      typeof packConfig.maxContextTokens === 'number' && packConfig.maxContextTokens > 0
        ? packConfig.maxContextTokens
        : DEFAULT_MAX_CONTEXT_TOKENS;
    const modelKey =
      typeof packConfig.modelKey === 'string' && packConfig.modelKey.trim().length > 0
        ? packConfig.modelKey.trim()
        : buildModelKey(context.run.agentModel ?? 'akm_eval');
    const predictionKey = `${modelKey}_prediction`;

    const scoredSamples: Array<Record<string, unknown>> = [];
    const retrievalMetrics: RetrievalMetrics[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalLatencyMs = 0;
    let totalQuestions = 0;

    for (const sample of samples) {
      const documents = flattenConversation(sample);
      if (memory.kind !== 'disabled') {
        await memory.reset();
        await memory.add(documents);
      }

      const outputSample: Record<string, unknown> = {
        sample_id: sample.sample_id,
        qa: [],
      };

      for (const question of sample.qa) {
        totalQuestions += 1;

        let searchResults: MemorySearchResult[] = [];
        let prompt: string;
        if (memory.kind === 'disabled') {
          prompt = buildConversationPrompt(sample, question, maxContextTokens);
        } else {
          searchResults = await memory.search({ text: question.question, topK });
          prompt = buildRetrievedPrompt(question, searchResults);
          retrievalMetrics.push(scoreRetrieval(question.evidence ?? [], searchResults, topK));
        }

        const agentResult = await resolvedAgent.run({ prompt });
        if (!agentResult.ok) {
          throw new BenchmarkRuntimeError(
            `locomo agent run failed for ${sample.sample_id}: ${question.question}. ${agentResult.error ?? 'unknown error'}`,
          );
        }

        totalPromptTokens += agentResult.usage?.input ?? 0;
        totalCompletionTokens += agentResult.usage?.output ?? 0;
        totalTokens += agentResult.usage?.total ?? 0;
        totalLatencyMs += agentResult.latencyMs;

        const prediction = question.category === 5 ? normalizeCategoryFiveAnswer(agentResult.text, question) : agentResult.text.trim();
        const outputQuestion: Record<string, unknown> = JSON.parse(JSON.stringify(question));
        outputQuestion[predictionKey] = prediction;
        if (memory.kind !== 'disabled') {
          outputQuestion[`${predictionKey}_context`] = searchResults.map((entry) => entry.id);
        }
        (outputSample.qa as unknown[]).push(outputQuestion);
      }

      scoredSamples.push(outputSample);
    }

    const predictionsPath = path.resolve(
      context.outputDir,
      typeof packConfig.predictionsPath === 'string' ? packConfig.predictionsPath : 'locomo-predictions.json',
    );
    fs.writeFileSync(predictionsPath, `${JSON.stringify(scoredSamples, null, 2)}\n`, 'utf8');

    const evaluationOutputPath = path.resolve(
      context.outputDir,
      typeof packConfig.evaluationOutputPath === 'string' ? packConfig.evaluationOutputPath : 'locomo-evaluation.json',
    );
    const evaluatorCommand =
      typeof packConfig.evaluatorCommand === 'string' && packConfig.evaluatorCommand.trim().length > 0
        ? packConfig.evaluatorCommand.trim()
        : DEFAULT_EVALUATOR_COMMAND;
    const evalResult = runCommand(
      `${evaluatorCommand} ${JSON.stringify(predictionsPath)} ${JSON.stringify(datasetPath)} ${JSON.stringify(evaluationOutputPath)} ${JSON.stringify(modelKey)} ${JSON.stringify(predictionKey)}`,
      context.rootDir,
    );
    if (evalResult.exitCode !== 0) {
      throw new BenchmarkRuntimeError(
        `locomo official evaluator failed with exit code ${evalResult.exitCode}. stderr: ${evalResult.stderr || '(empty)'}`,
      );
    }

    if (!fs.existsSync(evaluationOutputPath)) {
      throw new BenchmarkRuntimeError(
        `locomo official evaluator did not create the expected output file: ${evaluationOutputPath}`,
      );
    }

    const parsed = parseLocomoRawOutput(JSON.parse(fs.readFileSync(evaluationOutputPath, 'utf8')));
    const answerMetrics = scoreLocomoAdapter(parsed);
    const retrieval = averageRetrieval(retrievalMetrics);

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));
    const score = Number(parsed.overall_accuracy.toFixed(6));

    const result: NormalizedRunResult = {
      schemaVersion: '1.0',
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status: totalQuestions === 0 ? 'warning' : score > 0 ? 'passed' : 'failed',
      startedAt,
      finishedAt,
      durationMs,
      warnings: [],
      notes: [
        `LoCoMo executed ${parsed.question_count} question(s) from ${samples.length} sample(s).`,
        `Official LoCoMo QA score: ${(parsed.overall_accuracy * 100).toFixed(1)}%`,
        memory.kind === 'disabled'
          ? `Conversation-only mode with approximate truncation budget ${maxContextTokens} tokens.`
          : `Memory-backed retrieval mode using topK=${topK}.`,
      ],
      metrics: {
        retrieval,
        answer: answerMetrics,
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
          `samples=${samples.length}`,
          `questions=${parsed.question_count}`,
          `datasetPath=${datasetPath}`,
          `evaluatorCommand=${evaluatorCommand}`,
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
        questionCount: parsed.question_count,
        sampleCount: samples.length,
        overallAccuracy: score,
        modelKey,
        predictionKey,
        topK,
        maxContextTokens,
        datasetPath,
        predictionsPath,
        evaluationOutputPath,
        ...Object.fromEntries(Object.entries(parsed.category_accuracy).map(([key, value]) => [`accuracy_category_${key}`, value])),
      },
    };

    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
      pack: 'locomo',
      datasetPath,
      predictionsPath,
      evaluationOutputPath,
      evaluatorCommand,
      evaluatorStdout: evalResult.stdout,
      evaluatorStderr: evalResult.stderr,
      parsed,
    });
    result.artifacts.resultPath = path.resolve(store.baseDir, 'result.json');
    result.artifacts.summaryPath = path.resolve(store.baseDir, 'summary.md');
    store.writeJson('result.json', result);
    store.writeText('summary.md', markdownReportForResult(result));
    return result;
  },
};
