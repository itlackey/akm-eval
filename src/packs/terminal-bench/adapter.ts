import fs from 'node:fs';
import path from 'node:path';
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

export interface TerminalBenchTask {
  id: string;
  description: string;
  setup?: string[];
  expected?: string;
  verifier?: string;
  difficulty?: string;
  category?: string;
}

interface TerminalBenchPackConfig {
  datasetPath?: string;
  maxTasks?: number;
  difficulty?: string;
  smoke?: boolean;
}

const OFFICIAL_DATASET_URL = 'https://raw.githubusercontent.com/evalplus/terminal-bench/main/tasks.jsonl';

async function downloadOfficialDataset(): Promise<string> {
  try {
    return await downloadDataset({
      name: 'terminal-bench',
      url: OFFICIAL_DATASET_URL,
      targetPath: 'tasks.jsonl',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to download Terminal-Bench dataset. ` +
      `Install instructions: https://github.com/evalplus/terminal-bench ` +
      `Error: ${message}`,
    );
  }
}

function loadTasks(datasetPath: string): TerminalBenchTask[] {
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Terminal-Bench dataset not found at "${datasetPath}".`);
  }

  const tasks: TerminalBenchTask[] = [];
  const content = fs.readFileSync(datasetPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      tasks.push(JSON.parse(trimmed) as TerminalBenchTask);
    } catch {
      // skip malformed lines
    }
  }

  return tasks;
}

async function execCommand(
  cwd: string,
  command: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bash', '-c', command], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = proc.exitCode ?? 1;

  return { stdout, stderr, exitCode };
}

function extractBashBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const block = match[1].trim();
    if (block) blocks.push(block);
  }

  // Fallback: look for command-like lines if no code blocks found
  if (blocks.length === 0) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => {
        if (l.length === 0) return false;
        if (l.startsWith('#')) return false;
        if (l.startsWith('-')) return false;
        if (l.startsWith('*')) return false;
        if (l.startsWith('>')) return false;
        if (l.toLowerCase().startsWith('task:')) return false;
        if (l.toLowerCase().startsWith('workspace')) return false;
        if (l.toLowerCase().startsWith('provide')) return false;
        return true;
      });
    const commands = lines.map((l) => l.replace(/^\$\s*/, '')).filter((l) => l.length > 0);
    if (commands.length > 0) {
      blocks.push(commands.join('\n'));
    }
  }

  return blocks;
}

export const terminalBenchAdapter: PackAdapter = {
  id: 'terminal-bench',
  description: 'Terminal-Bench evaluates AI agents on real command-line tasks from the official benchmark.',
  checkInstalled() {
    return true;
  },
  async run(
    context: RunContext,
    memory: MemoryBackend,
    agent?: AgentRunner,
  ): Promise<NormalizedRunResult> {
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    await memory.reset();
    await memory.add(context.run.memoryDocuments ?? []);

    const packConfig = context.run.packConfig as TerminalBenchPackConfig | undefined;
    let datasetPath = packConfig?.datasetPath;
    const maxTasks = packConfig?.maxTasks ?? Number.MAX_SAFE_INTEGER;
    const difficultyFilter = packConfig?.difficulty;
    const smoke = packConfig?.smoke === true;

    if (!datasetPath) {
      datasetPath = await downloadOfficialDataset();
    }

    let tasks = loadTasks(datasetPath);

    if (difficultyFilter) {
      tasks = tasks.filter((t) => t.difficulty === difficultyFilter);
    }

    if (smoke) {
      tasks = tasks.slice(0, 5);
    }

    tasks = tasks.slice(0, maxTasks);

    const taskResults: Array<{
      taskId: string;
      passed: boolean;
      commands: string[];
      stdout: string;
      stderr: string;
      exitCode: number;
      durationMs: number;
    }> = [];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalAgentLatency = 0;
    let totalCommands = 0;
    let passedCount = 0;

    for (const task of tasks) {
      const taskStart = Date.now();
      const workspaceDir = path.resolve(context.outputDir, 'tasks', task.id);
      fs.mkdirSync(workspaceDir, { recursive: true });

      // Run setup commands
      if (task.setup && Array.isArray(task.setup)) {
        for (const cmd of task.setup) {
          await execCommand(workspaceDir, cmd);
        }
      }

      // Build prompt
      const prompt = [
        'You are a helpful terminal assistant.',
        `Task: ${task.description}`,
        `Workspace directory: ${workspaceDir}`,
        'Provide the bash commands needed to complete this task.',
        'Use ```bash code blocks for commands.',
      ].join('\n');

      let agentResponse = '';
      let agentUsage: { input: number; output: number; total: number } | undefined;
      let agentLatency = 0;

      if (agent) {
        const result = await agent.run({ prompt });
        agentResponse = result.text;
        agentUsage = result.usage;
        agentLatency = result.latencyMs;
        totalPromptTokens += agentUsage?.input ?? 0;
        totalCompletionTokens += agentUsage?.output ?? 0;
        totalTokens += agentUsage?.total ?? 0;
        totalAgentLatency += agentLatency;
      } else {
        agentResponse = context.run.answer?.actual ?? '';
      }

      // Extract and execute commands
      const commandBlocks = extractBashBlocks(agentResponse);
      totalCommands += commandBlocks.length;

      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      for (const block of commandBlocks) {
        const result = await execCommand(workspaceDir, block);
        stdout += result.stdout;
        stderr += result.stderr;
        if (result.exitCode !== 0) {
          exitCode = result.exitCode;
        }
      }

      // Verify outcome
      let passed = false;
      if (task.verifier) {
        const vResult = await execCommand(workspaceDir, task.verifier);
        passed = vResult.exitCode === 0;
      } else if (task.expected !== undefined) {
        const combined = (stdout + stderr).trim();
        passed = combined === task.expected.trim() || combined.includes(task.expected.trim());
      } else {
        passed = exitCode === 0;
      }

      if (passed) passedCount++;

      taskResults.push({
        taskId: task.id,
        passed,
        commands: commandBlocks,
        stdout,
        stderr,
        exitCode,
        durationMs: Date.now() - taskStart,
      });
    }

    const successRate = tasks.length > 0 ? passedCount / tasks.length : 0;
    const allStdout = taskResults.map((r) => r.stdout + r.stderr).join('\n');
    const allExpected = tasks.map((t) => t.expected ?? '').join('\n');

    const retrievalQuery = context.run.retrieval?.query ?? `${context.run.pack} ${context.run.variant}`;
    const topK = context.run.retrieval?.topK ?? 3;
    const searchResults = await memory.search({ text: retrievalQuery, topK });
    const retrieval = scoreRetrieval(context.run.retrieval?.relevantIds ?? [], searchResults, topK);
    const answer = scoreAnswer(allExpected, allStdout);
    const judge = judgeAnswer(allExpected, allStdout);
    answer.judgedPass = judge.passed ? 1 : 0;

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));

    const fallbackTokenUsage = computeTokenUsage({
      prompt: retrievalQuery,
      completion: allStdout,
    });

    const warnings: string[] = [];
    if (tasks.length === 0) {
      warnings.push(`No tasks loaded from dataset path: ${datasetPath}`);
    }

    const result: NormalizedRunResult = {
      schemaVersion: '1.0',
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status:
        tasks.length === 0
          ? 'warning'
          : passedCount === tasks.length
            ? 'passed'
            : passedCount > 0
              ? 'warning'
              : 'failed',
      startedAt,
      finishedAt,
      durationMs,
      warnings,
      notes: [
        `Terminal-Bench executed ${tasks.length} task(s) from official dataset.`,
        `Passed: ${passedCount}/${tasks.length}`,
        `Total commands executed: ${totalCommands}`,
        `Agent runner: ${agent ? 'available' : 'none'}`,
      ],
      metrics: {
        retrieval,
        answer,
        aggregate: {
          score: Number(successRate.toFixed(6)),
          retrievalWeight: 0.25,
          answerWeight: 0.75,
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
          `tasks=${tasks.length}`,
          `passed=${passedCount}`,
          `commands=${totalCommands}`,
        ]),
      },
      artifacts: {
        resultPath: '',
        summaryPath: '',
        rawOutputPath: '',
      },
      metadata: {
        ...context.run.metadata,
        taskCount: tasks.length,
        passedCount,
        totalCommands,
        successRate: Number(successRate.toFixed(4)),
      },
    };

    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
      pack: 'terminal-bench',
      memory: memory.id,
      tasks: taskResults,
      searchResults,
      judge,
    });
    result.artifacts.resultPath = store.writeJson('result.json', result);
    result.artifacts.summaryPath = store.writeText('summary.md', markdownReportForResult(result));

    return result;
  },
};
