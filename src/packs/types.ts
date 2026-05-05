import fs from 'node:fs';
import path from 'node:path';
import { ArtifactStore } from '../core/artifact-store.ts';
import type { RunContext } from '../core/run-context.ts';
import type { NormalizedRunResult } from '../core/types.ts';
import { scoreAnswer } from '../memory/answer-metrics.ts';
import { judgeAnswer } from '../memory/judge.ts';
import { scoreRetrieval } from '../memory/retrieval-metrics.ts';
import type { MemoryBackend } from '../memory/types.ts';
import { markdownReportForResult } from '../reporting/markdown.ts';
import { estimateCostUsd } from '../telemetry/cost.ts';
import { summarizeLatencyMs } from '../telemetry/latency.ts';
import { createLogBuffer } from '../telemetry/logs.ts';
import { computeTokenUsage } from '../telemetry/tokens.ts';

export interface PackAdapter {
  id: string;
  description: string;
  optionalDependency?: string;
  checkInstalled(): boolean;
  run(context: RunContext, memory: MemoryBackend): Promise<NormalizedRunResult>;
}

export function createStubPackAdapter(definition: {
  id: string;
  description: string;
  optionalDependency?: string;
}): PackAdapter {
  return {
    ...definition,
    checkInstalled() {
      if (!definition.optionalDependency) {
        return true;
      }

      return [
        path.resolve(process.cwd(), 'node_modules', definition.optionalDependency),
        path.resolve(process.cwd(), 'packages', definition.optionalDependency),
      ].some((candidate) => fs.existsSync(candidate));
    },
    async run(context: RunContext, memory: MemoryBackend): Promise<NormalizedRunResult> {
      const store = new ArtifactStore(context.outputDir);
      store.ensureDir();

      await memory.reset();
      await memory.add(context.run.memoryDocuments ?? []);

      const retrievalQuery = context.run.retrieval?.query ?? `${context.run.pack} ${context.run.variant}`;
      const topK = context.run.retrieval?.topK ?? 3;
      const searchResults = await memory.search({ text: retrievalQuery, topK });
      const retrieval = scoreRetrieval(context.run.retrieval?.relevantIds ?? [], searchResults, topK);
      const answer = scoreAnswer(context.run.answer?.expected, context.run.answer?.actual);
      const judge = judgeAnswer(context.run.answer?.expected, context.run.answer?.actual);
      answer.judgedPass = judge.passed ? 1 : 0;

      const startedAt = context.startedAt.toISOString();
      const finishedAt = new Date().toISOString();
      const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));
      const tokenUsage = computeTokenUsage({
        prompt: retrievalQuery,
        completion: context.run.answer?.actual ?? '',
      });
      const installed = definition.optionalDependency ? this.checkInstalled() : true;
      const warnings =
        definition.optionalDependency && !installed
          ? [`Optional dependency ${definition.optionalDependency} not installed; ran stub adapter.`]
          : [];

      const result: NormalizedRunResult = {
        schemaVersion: '1.0',
        runId: context.runId,
        pack: context.run.pack,
        variant: context.run.variant,
        memoryBackend: memory.id,
        status: warnings.length > 0 ? 'warning' : judge.passed ? 'passed' : 'failed',
        startedAt,
        finishedAt,
        durationMs,
        warnings,
        notes: [`Pack adapter executed in skeleton mode for ${definition.id}.`],
        metrics: {
          retrieval,
          answer,
          aggregate: {
            score: Number(((retrieval.ndcgAtK + answer.tokenF1 + answer.exactMatch + answer.judgedPass) / 4).toFixed(6)),
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
            `judge=${judge.rationale}`,
          ]),
        },
        artifacts: {
          resultPath: '',
          summaryPath: '',
          rawOutputPath: '',
        },
        metadata: context.run.metadata,
      };

      result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
        pack: definition.id,
        memory: memory.id,
        searchResults,
        judge,
      });
      result.artifacts.resultPath = path.resolve(store.baseDir, 'result.json');
      result.artifacts.summaryPath = path.resolve(store.baseDir, 'summary.md');
      store.writeJson('result.json', result);
      store.writeText('summary.md', markdownReportForResult(result));
      return result;
    },
  };
}
