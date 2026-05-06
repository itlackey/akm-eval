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
import type { PackAdapter } from '../types.ts';

function checkAkmBenchInstalled(): boolean {
  try {
    const proc = Bun.spawnSync(['which', 'akm-bench']);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

interface AkmBenchPackConfig {
  configPath?: string;
  smoke?: boolean;
}

export const akmBenchAdapter: PackAdapter = {
  id: 'akm-bench',
  description: 'AKM-Bench adapter that shells out to the akm-bench CLI tool.',
  checkInstalled() {
    return checkAkmBenchInstalled();
  },
  async run(context, memory, agent): Promise<NormalizedRunResult> {
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    const warnings: string[] = [];

    if (!checkAkmBenchInstalled()) {
      warnings.push(
        'akm-bench CLI is not installed or not in PATH. ' +
        'Install it and ensure "akm-bench" is available.',
      );
    }

    const packConfig = context.run.packConfig as AkmBenchPackConfig | undefined;
    const configPath = packConfig?.configPath;
    const smoke = packConfig?.smoke === true;

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    if (checkAkmBenchInstalled()) {
      const args = ['run'];
      if (configPath) {
        args.push('--config', configPath);
      }
      if (smoke) {
        args.push('--smoke');
      }

      const proc = Bun.spawn(['akm-bench', ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await proc.exited;
      stdout = await new Response(proc.stdout).text();
      stderr = await new Response(proc.stderr).text();
      exitCode = proc.exitCode ?? 1;

      if (exitCode !== 0) {
        warnings.push(`akm-bench exited with code ${exitCode}. stderr: ${stderr.slice(0, 500)}`);
      }
    }

    await memory.reset();
    await memory.add(context.run.memoryDocuments ?? []);

    const retrievalQuery = context.run.retrieval?.query ?? `${context.run.pack} ${context.run.variant}`;
    const topK = context.run.retrieval?.topK ?? 3;
    const searchResults = await memory.search({ text: retrievalQuery, topK });
    const retrieval = scoreRetrieval(context.run.retrieval?.relevantIds ?? [], searchResults, topK);

    const expected = context.run.answer?.expected ?? '';
    const actual = agent ? (await agent.run({ prompt: retrievalQuery })).text : stdout;
    const answer = scoreAnswer(expected, actual);
    const judge = judgeAnswer(expected, actual);
    answer.judgedPass = judge.passed ? 1 : 0;

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));

    const tokenUsage = computeTokenUsage({ prompt: retrievalQuery, completion: actual });

    // Try to parse akm-bench result artifacts if they exist
    let akmBenchResult: Record<string, unknown> | undefined;
    const possibleResultPath = configPath
      ? path.resolve(path.dirname(configPath), 'results', 'result.json')
      : undefined;
    if (possibleResultPath && fs.existsSync(possibleResultPath)) {
      try {
        akmBenchResult = JSON.parse(fs.readFileSync(possibleResultPath, 'utf8')) as Record<string, unknown>;
      } catch {
        // ignore parse errors
      }
    }

    const result: NormalizedRunResult = {
      schemaVersion: '1.0',
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status: warnings.length > 0 ? 'warning' : exitCode === 0 ? 'passed' : 'failed',
      startedAt,
      finishedAt,
      durationMs,
      warnings,
      notes: [
        `AKM-Bench executed via CLI.`,
        `akm-bench installed: ${checkAkmBenchInstalled() ? 'yes' : 'no'}`,
        `exitCode: ${exitCode}`,
      ],
      metrics: {
        retrieval,
        answer,
        aggregate: {
          score: Number(
            ((retrieval.ndcgAtK + answer.tokenF1 + answer.exactMatch + answer.judgedPass) / 4).toFixed(6),
          ),
          retrievalWeight: 0.5,
          answerWeight: 0.5,
        },
      },
      telemetry: {
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        estimatedCostUsd: estimateCostUsd(tokenUsage.totalTokens),
        latencyMs: summarizeLatencyMs(durationMs),
        logs: createLogBuffer([
          `pack=${context.run.pack}`,
          `variant=${context.run.variant}`,
          `memory=${memory.id}`,
          `exitCode=${exitCode}`,
        ]),
      },
      artifacts: {
        resultPath: '',
        summaryPath: '',
        rawOutputPath: '',
      },
      metadata: {
        ...context.run.metadata,
        akmBenchInstalled: checkAkmBenchInstalled(),
        exitCode,
        ...(akmBenchResult ?? {}),
      },
    };

    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
      pack: 'akm-bench',
      memory: memory.id,
      stdout,
      stderr,
      exitCode,
      akmBenchResult,
      searchResults,
      judge,
    });
    result.artifacts.resultPath = store.writeJson('result.json', result);
    result.artifacts.summaryPath = store.writeText('summary.md', markdownReportForResult(result));

    return result;
  },
};
