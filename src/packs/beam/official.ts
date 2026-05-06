import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentRunResult, AgentRunner } from '../../agent/types.ts';
import { runProcess } from '../../core/process.ts';
import { BenchmarkRuntimeError } from '../../core/errors.ts';

export const BEAM_DATASET_REPO = 'Mohammadta/BEAM';
export const BEAM_DATASET_10M_REPO = 'Mohammadta/BEAM-10M';

export interface BeamPackConfig {
  repoPath?: string;
  datasetPath?: string;
  dataset10MPath?: string;
  pythonBin?: string;
  smoke?: boolean;
  chatSizes?: string[];
  maxConversations?: number;
  maxQuestionsPerType?: number;
  evaluatorModel?: string;
  evaluatorConcurrency?: number;
  evaluatorAllowedResultFile?: string;
}

export interface BeamDoctorStatus {
  installed: boolean;
  detail: string;
}

export interface BeamRuntime {
  repoPath: string;
  pythonBin: string;
  datasetPath: string;
  dataset10MPath: string | null;
}

export interface BeamQuestion {
  type: string;
  index: number;
  question: string;
  rubric: unknown;
}

export interface BeamConversation {
  conversationId: string;
  chatSize: string;
  chat: unknown;
  probingQuestionsPath: string;
  questions: BeamQuestion[];
}

export interface BeamEvaluationEntry {
  llm_judge_score?: number;
  tau_norm?: number;
}

export interface BeamEvaluationResult {
  conversationId: string;
  chatSize: string;
  answerFilePath: string;
  evaluationFilePath: string;
  evaluation: Record<string, BeamEvaluationEntry[]>;
}

const BEAM_REQUIRED_FILES = [
  'requirements.txt',
  'src/evaluation/run_evaluation.py',
  'src/beam/download_dataset.py',
  'src/answer_probing_questions/answer_generation.py',
];

const CHAT_SIZE_DIRECTORY_NAMES: Record<string, string> = {
  '100K': '100K',
  '128K': '100K',
  '500K': '500K',
  '1M': '1M',
  '10M': '10M',
};

const DEFAULT_BEAM_REPO_ENV = 'BEAM_REPO_PATH';
const DEFAULT_BEAM_DATASET_ENV = 'BEAM_DATASET_PATH';
const DEFAULT_BEAM_DATASET_10M_ENV = 'BEAM_DATASET_10M_PATH';
const DEFAULT_BEAM_PYTHON_ENV = 'BEAM_PYTHON_BIN';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function resolveConfiguredPath(rootDir: string, configuredPath?: string, envName?: string): string | null {
  if (isNonEmptyString(configuredPath)) {
    return path.resolve(rootDir, configuredPath);
  }

  const envValue = envName ? process.env[envName] : undefined;
  return isNonEmptyString(envValue) ? path.resolve(rootDir, envValue) : null;
}

function resolveBeamPythonBin(packConfig: BeamPackConfig): string {
  if (isNonEmptyString(packConfig.pythonBin)) {
    return packConfig.pythonBin;
  }

  return isNonEmptyString(process.env[DEFAULT_BEAM_PYTHON_ENV]) ? process.env[DEFAULT_BEAM_PYTHON_ENV] : 'python3';
}

function beamRootCandidates(rootDir: string, packConfig: BeamPackConfig): string[] {
  const configuredRepoPath = resolveConfiguredPath(rootDir, packConfig.repoPath, DEFAULT_BEAM_REPO_ENV);
  const configured = configuredRepoPath ? [configuredRepoPath] : [];
  return [...configured, path.resolve(rootDir, 'vendor/BEAM'), path.resolve(rootDir, 'third_party/BEAM')];
}

function requestedBeamChatSizes(packConfig: BeamPackConfig): string[] {
  return Array.isArray(packConfig.chatSizes) && packConfig.chatSizes.length > 0 ? packConfig.chatSizes : ['100K'];
}

function judgeConfigurationError(): string | null {
  const openAiBaseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (openAiApiKey || openAiBaseUrl !== 'https://api.openai.com/v1') {
    return null;
  }

  return 'beam judge credentials are not configured. Set OPENAI_API_KEY for the upstream judge path, or set OPENAI_BASE_URL to an OpenAI-compatible local judge endpoint.';
}

function datasetCandidates(rootDir: string, repoPath: string, packConfig: BeamPackConfig, type: 'default' | '10m'): string[] {
  const configuredPath =
    type === '10m'
      ? resolveConfiguredPath(rootDir, packConfig.dataset10MPath, DEFAULT_BEAM_DATASET_10M_ENV)
      : resolveConfiguredPath(rootDir, packConfig.datasetPath, DEFAULT_BEAM_DATASET_ENV);
  const normalizedNames = type === '10m' ? ['test_chats/10M', 'chats/10M', 'beam_10M_dataset'] : ['test_chats', 'chats', 'beam_dataset'];
  return [
    ...(configuredPath ? [configuredPath] : []),
    ...normalizedNames.map((relativePath) => path.resolve(repoPath, relativePath)),
  ];
}

function findBeamDatasetDirectory(
  rootDir: string,
  repoPath: string,
  packConfig: BeamPackConfig,
  type: 'default' | '10m',
): string | null {
  return datasetCandidates(rootDir, repoPath, packConfig, type).find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function checkBeamRuntime(rootDir: string, packConfig: BeamPackConfig = {}): BeamDoctorStatus {
  const pythonBin = resolveBeamPythonBin(packConfig);
  const python = runProcess(pythonBin, ['--version'], rootDir);
  if (!python.success) {
    return {
      installed: false,
      detail: `python runtime not found via ${pythonBin}; BEAM official evaluator requires Python`,
    };
  }

  for (const candidate of beamRootCandidates(rootDir, packConfig)) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
      continue;
    }

    const missing = BEAM_REQUIRED_FILES.filter((relativePath) => !fs.existsSync(path.resolve(candidate, relativePath)));
    if (missing.length > 0) {
      return {
        installed: false,
        detail: `BEAM repo found at ${candidate} but is missing required files: ${missing.join(', ')}`,
      };
    }

    const datasetPath = findBeamDatasetDirectory(rootDir, candidate, packConfig, 'default');
    if (!datasetPath) {
      return {
        installed: false,
        detail:
          `BEAM repo found at ${candidate} but the prepared dataset is missing. ` +
          `Set pack.config.datasetPath or ${DEFAULT_BEAM_DATASET_ENV}, or run the upstream dataset preparation from ${candidate}.`,
      };
    }

    if (requestedBeamChatSizes(packConfig).some((size) => normalizeChatSize(size) === '10M')) {
      const dataset10MPath = findBeamDatasetDirectory(rootDir, candidate, packConfig, '10m');
      if (!dataset10MPath) {
        return {
          installed: false,
          detail:
            `BEAM repo found at ${candidate} but the prepared 10M dataset is missing. ` +
            `Set pack.config.dataset10MPath or ${DEFAULT_BEAM_DATASET_10M_ENV}, or run the upstream 10M dataset preparation from ${candidate}.`,
        };
      }
    }

    const judgeError = judgeConfigurationError();
    if (judgeError) {
      return {
        installed: false,
        detail: `${judgeError} Repo: ${candidate}. Dataset: ${datasetPath}.`,
      };
    }

    return {
      installed: true,
      detail: `official BEAM repo available at ${candidate}; dataset ready at ${datasetPath}; judge configuration detected`,
    };
  }

  return {
    installed: false,
    detail:
      'official BEAM repo not found. Set pack.config.repoPath to a checkout of mohammadtavakoli78/BEAM or place it under vendor/BEAM.',
  };
}

export function resolveBeamRuntime(rootDir: string, packConfig: BeamPackConfig = {}): BeamRuntime {
  const status = checkBeamRuntime(rootDir, packConfig);
  if (!status.installed) {
    throw new BenchmarkRuntimeError(`beam requires the official BEAM repo and evaluator. ${status.detail}`);
  }

  const repoPath = beamRootCandidates(rootDir, packConfig).find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory(),
  );
  if (!repoPath) {
    throw new BenchmarkRuntimeError('beam runtime detection failed unexpectedly.');
  }

  const pythonBin = resolveBeamPythonBin(packConfig);
  const datasetPath = resolveBeamDatasetDirectory(rootDir, repoPath, packConfig, 'default');
  const dataset10MPath = resolveBeamDatasetDirectory(rootDir, repoPath, packConfig, '10m', false);

  return {
    repoPath,
    pythonBin,
    datasetPath,
    dataset10MPath,
  };
}

function resolveBeamDatasetDirectory(
  rootDir: string,
  repoPath: string,
  packConfig: BeamPackConfig,
  type: 'default' | '10m',
  required = true,
): string | null {
  const candidates = datasetCandidates(rootDir, repoPath, packConfig, type);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (!required) {
    return null;
  }

  const downloadCommand = type === '10m'
    ? `${resolveBeamPythonBin(packConfig)} src/beam/download_dataset.py`
    : `${resolveBeamPythonBin(packConfig)} src/beam/download_dataset.py`;
  throw new BenchmarkRuntimeError(
    `beam dataset directory is missing. Expected one of: ${candidates.join(', ')}. ` +
      `Run the official BEAM dataset preparation first, for example ${downloadCommand} from ${repoPath}.`,
  );
}

function normalizeChatSize(chatSize: string): string {
  const normalized = CHAT_SIZE_DIRECTORY_NAMES[chatSize];
  if (!normalized) {
    throw new BenchmarkRuntimeError(`beam does not support chat size ${chatSize}`);
  }
  return normalized;
}

function listConversationDirectories(directoryPath: string): string[] {
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(left) - Number(right));
}

function questionEntriesFromObject(probingQuestions: Record<string, unknown>, maxQuestionsPerType?: number): BeamQuestion[] {
  const questions: BeamQuestion[] = [];
  for (const [type, rawEntries] of Object.entries(probingQuestions)) {
    if (!Array.isArray(rawEntries)) {
      continue;
    }
    const sliced = typeof maxQuestionsPerType === 'number' && maxQuestionsPerType > 0 ? rawEntries.slice(0, maxQuestionsPerType) : rawEntries;
    sliced.forEach((entry, index) => {
      const question = asObject(entry);
      if (!question || !isNonEmptyString(question.question)) {
        return;
      }
      questions.push({
        type,
        index,
        question: question.question,
        rubric: question.rubric,
      });
    });
  }
  return questions;
}

export function loadBeamConversations(runtime: BeamRuntime, packConfig: BeamPackConfig = {}): BeamConversation[] {
  const requestedChatSizes = Array.isArray(packConfig.chatSizes) && packConfig.chatSizes.length > 0 ? packConfig.chatSizes : ['100K'];
  const chatSizes = packConfig.smoke ? requestedChatSizes.slice(0, 1) : requestedChatSizes;
  const maxConversations = typeof packConfig.maxConversations === 'number' && packConfig.maxConversations > 0 ? packConfig.maxConversations : undefined;
  const conversations: BeamConversation[] = [];

  for (const rawChatSize of chatSizes) {
    const chatSize = normalizeChatSize(rawChatSize);
    const datasetRoot = chatSize === '10M' ? runtime.dataset10MPath : runtime.datasetPath;
    if (!datasetRoot) {
      throw new BenchmarkRuntimeError('beam 10M dataset requested but dataset10MPath is not available.');
    }

    const chatDirectory = chatSize === '10M' ? datasetRoot : path.resolve(datasetRoot, chatSize);
    if (!fs.existsSync(chatDirectory) || !fs.statSync(chatDirectory).isDirectory()) {
      throw new BenchmarkRuntimeError(`beam dataset missing expected chat directory: ${chatDirectory}`);
    }

    const ids = listConversationDirectories(chatDirectory);
    const limitedIds = maxConversations ? ids.slice(0, maxConversations) : ids;
    for (const conversationId of limitedIds) {
      const conversationRoot = path.resolve(chatDirectory, conversationId);
      const probingQuestionsPath = path.resolve(conversationRoot, 'probing_questions', 'probing_questions.json');
      const chatPath = path.resolve(conversationRoot, 'chat.json');
      if (!fs.existsSync(probingQuestionsPath) || !fs.existsSync(chatPath)) {
        throw new BenchmarkRuntimeError(
          `beam conversation ${conversationId} in ${chatSize} is missing official artifacts. Expected ${chatPath} and ${probingQuestionsPath}.`,
        );
      }

      const probingQuestions = parseJsonFile<Record<string, unknown>>(probingQuestionsPath);
      const questions = questionEntriesFromObject(probingQuestions, packConfig.maxQuestionsPerType);
      conversations.push({
        conversationId,
        chatSize,
        chat: parseJsonFile<unknown>(chatPath),
        probingQuestionsPath,
        questions,
      });
    }
  }

  if (conversations.length === 0) {
    throw new BenchmarkRuntimeError('beam dataset load resolved zero conversations for the requested chat sizes.');
  }

  return conversations;
}

function flattenChatMessages(chat: unknown): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const objectValue = asObject(value);
    if (!objectValue) {
      return;
    }

    if (isNonEmptyString(objectValue.role) && typeof objectValue.content === 'string') {
      messages.push({ role: objectValue.role, content: objectValue.content });
      return;
    }

    for (const nestedValue of Object.values(objectValue)) {
      visit(nestedValue);
    }
  };

  visit(chat);
  return messages;
}

function truncateMessagesForPrompt(messages: Array<{ role: string; content: string }>, maxMessages = 200): string {
  const selected = messages.length > maxMessages ? messages.slice(-maxMessages) : messages;
  return selected.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n');
}

function sanitizeQuestion(question: string): string {
  return question.replace(/\s+/g, ' ').trim();
}

export async function answerBeamQuestion(
  agent: AgentRunner,
  conversation: BeamConversation,
  question: BeamQuestion,
): Promise<AgentRunResult> {
  const messages = flattenChatMessages(conversation.chat);
  const prompt = [
    `You are answering an official BEAM probing question for a conversation with chat size ${conversation.chatSize}.`,
    'Only provide the answer without extra explanation.',
    '',
    'Conversation history:',
    truncateMessagesForPrompt(messages),
    '',
    `Question: ${sanitizeQuestion(question.question)}`,
    'Answer:',
  ].join('\n');

  return agent.run({ prompt });
}

export function createBeamAnswersFile(
  outputDirectory: string,
  conversation: BeamConversation,
  entries: Array<{ question: BeamQuestion; response: string }>,
  fileName: string,
): string {
  const payload: Record<string, Array<Record<string, unknown>>> = {};
  for (const entry of entries) {
    const bucket = payload[entry.question.type] ?? [];
    bucket.push({
      question: entry.question.question,
      rubric: entry.question.rubric,
      llm_response: entry.response,
    });
    payload[entry.question.type] = bucket;
  }

  const conversationDirectory = path.resolve(outputDirectory, conversation.conversationId);
  fs.mkdirSync(conversationDirectory, { recursive: true });
  const targetPath = path.resolve(conversationDirectory, fileName);
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return targetPath;
}

function writeBeamLlmsConfig(runtime: BeamRuntime, evaluatorModel: string): string {
  const configPath = path.resolve(runtime.repoPath, 'src', 'llms_config.json');
  const existing = fs.existsSync(configPath) ? parseJsonFile<Record<string, unknown>>(configPath) : {};
  const openAiBaseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  let openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey && openAiBaseUrl === 'https://api.openai.com/v1') {
    throw new BenchmarkRuntimeError(
      'beam official evaluator requires OPENAI_API_KEY for the upstream LLM judge. Set OPENAI_API_KEY before running beam, or set OPENAI_BASE_URL for an OpenAI-compatible local judge endpoint.',
    );
  }
  if (!openAiApiKey) {
    openAiApiKey = 'dummy';
  }

  const nextConfig = {
    ...existing,
    gpt: {
      model_url: openAiBaseUrl,
      model_name: evaluatorModel,
      api_key: openAiApiKey,
    },
    llama: {
      model_url: openAiBaseUrl,
      model_name: evaluatorModel,
      api_key: openAiApiKey,
    },
    qwen: {
      model_url: openAiBaseUrl,
      model_name: evaluatorModel,
      api_key: openAiApiKey,
    },
  };

  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  return configPath;
}

export function runBeamEvaluation(
  runtime: BeamRuntime,
  conversation: BeamConversation,
  answersRoot: string,
  allowedResultFile: string,
  evaluatorModel: string,
  maxWorkers: number,
): BeamEvaluationResult {
  writeBeamLlmsConfig(runtime, evaluatorModel);

  const inputDirectory = answersRoot;
  const startIndex = Number(conversation.conversationId) - 1;
  const endIndex = startIndex + 1;
  const result = runProcess(
    runtime.pythonBin,
    [
      '-m',
      'src.evaluation.run_evaluation',
      '--input_directory',
      inputDirectory,
      '--chat_size',
      conversation.chatSize,
      '--start_index',
      String(startIndex),
      '--end_index',
      String(endIndex),
      '--max_workers',
      String(maxWorkers),
      '--allowed_result_files',
      allowedResultFile,
    ],
    runtime.repoPath,
  );

  if (!result.success) {
    throw new BenchmarkRuntimeError(
      `beam official evaluator failed for conversation ${conversation.conversationId} with exit code ${result.exitCode}. stderr: ${result.stderr || '(empty)'}`,
    );
  }

  const conversationDirectory = path.resolve(inputDirectory, conversation.conversationId);
  const answerFilePath = path.resolve(conversationDirectory, allowedResultFile);
  const evaluationFilePath = path.resolve(conversationDirectory, `evaluation-${allowedResultFile}`);
  if (!fs.existsSync(evaluationFilePath)) {
    throw new BenchmarkRuntimeError(
      `beam official evaluator did not produce expected file ${evaluationFilePath} for conversation ${conversation.conversationId}`,
    );
  }

  return {
    conversationId: conversation.conversationId,
    chatSize: conversation.chatSize,
    answerFilePath,
    evaluationFilePath,
    evaluation: parseJsonFile<Record<string, BeamEvaluationEntry[]>>(evaluationFilePath),
  };
}

export interface BeamAggregateScores {
  byType: Record<string, number>;
  overall: number;
  judgedPassRate: number;
  questionCount: number;
}

export function aggregateBeamScores(results: BeamEvaluationResult[]): BeamAggregateScores {
  const totals = new Map<string, { score: number; count: number }>();
  let totalScore = 0;
  let totalQuestions = 0;
  let passCount = 0;

  for (const result of results) {
    for (const [type, entries] of Object.entries(result.evaluation)) {
      for (const entry of entries) {
        const score = type === 'event_ordering' ? entry.tau_norm ?? 0 : entry.llm_judge_score ?? 0;
        const bucket = totals.get(type) ?? { score: 0, count: 0 };
        bucket.score += score;
        bucket.count += 1;
        totals.set(type, bucket);
        totalScore += score;
        totalQuestions += 1;
        if (score >= 0.5) {
          passCount += 1;
        }
      }
    }
  }

  const byType = Object.fromEntries(
    [...totals.entries()].map(([type, bucket]) => [type, Number((bucket.score / bucket.count).toFixed(6))]),
  );

  return {
    byType,
    overall: totalQuestions > 0 ? Number((totalScore / totalQuestions).toFixed(6)) : 0,
    judgedPassRate: totalQuestions > 0 ? Number((passCount / totalQuestions).toFixed(6)) : 0,
    questionCount: totalQuestions,
  };
}

export function createBeamResultsRoot(outputDir: string, chatSize: string): string {
  const root = path.resolve(outputDir, 'beam-official-results', chatSize);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function createTemporaryBeamRepoPath(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'akm-eval-beam-'));
}
