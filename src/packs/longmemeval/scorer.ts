import type { AnswerMetrics, RetrievalMetrics } from '../../memory/types.ts';
import { scoreAnswer } from '../../memory/answer-metrics.ts';
import { judgeAnswer, type JudgeResult } from '../../memory/judge.ts';
import { scoreRetrieval } from '../../memory/retrieval-metrics.ts';
import type { MemorySearchResult } from '../../memory/types.ts';
import type { LongMemEvalQuestion } from './dataset.ts';

export interface QuestionResult {
  questionId: string;
  category: string;
  expectedAnswer: string;
  actualAnswer: string;
  answerMetrics: AnswerMetrics;
  judgeResult: JudgeResult;
  retrievalMetrics: RetrievalMetrics;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
}

export function scoreQuestion(
  question: LongMemEvalQuestion,
  actualAnswer: string,
  retrievedResults: MemorySearchResult[],
  relevantIds: string[],
  topK: number,
  latencyMs: number,
  promptTokens: number,
  completionTokens: number,
): QuestionResult {
  const answerMetrics = scoreAnswer(question.expectedAnswer, actualAnswer);
  const judgeResult = judgeAnswer(question.expectedAnswer, actualAnswer);
  answerMetrics.judgedPass = judgeResult.passed ? 1 : 0;

  const retrievalMetrics = scoreRetrieval(relevantIds, retrievedResults, topK);

  return {
    questionId: question.id,
    category: question.category,
    expectedAnswer: question.expectedAnswer,
    actualAnswer,
    answerMetrics,
    judgeResult,
    retrievalMetrics,
    latencyMs,
    promptTokens,
    completionTokens,
  };
}

export function aggregateResults(results: QuestionResult[]): {
  overallAccuracy: number;
  perCategoryAccuracy: Record<string, number>;
  avgAnswerMetrics: AnswerMetrics;
  avgRetrievalMetrics: RetrievalMetrics;
  totalLatencyMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
} {
  const total = results.length;
  const overallAccuracy = total === 0 ? 0 : results.reduce((sum, r) => sum + r.answerMetrics.judgedPass, 0) / total;

  const categoryMap = new Map<string, { sum: number; count: number }>();
  for (const result of results) {
    const entry = categoryMap.get(result.category) ?? { sum: 0, count: 0 };
    entry.sum += result.answerMetrics.judgedPass;
    entry.count += 1;
    categoryMap.set(result.category, entry);
  }

  const perCategoryAccuracy: Record<string, number> = {};
  for (const [category, { sum, count }] of categoryMap.entries()) {
    perCategoryAccuracy[category] = count === 0 ? 0 : sum / count;
  }

  const avgAnswerMetrics: AnswerMetrics = {
    exactMatch: total === 0 ? 0 : results.reduce((sum, r) => sum + r.answerMetrics.exactMatch, 0) / total,
    tokenF1: total === 0 ? 0 : results.reduce((sum, r) => sum + r.answerMetrics.tokenF1, 0) / total,
    containsExpected: total === 0 ? 0 : results.reduce((sum, r) => sum + r.answerMetrics.containsExpected, 0) / total,
    judgedPass: overallAccuracy,
  };

  const avgRetrievalMetrics: RetrievalMetrics = {
    queryCount: total,
    precisionAtK: total === 0 ? 0 : results.reduce((sum, r) => sum + r.retrievalMetrics.precisionAtK, 0) / total,
    recallAtK: total === 0 ? 0 : results.reduce((sum, r) => sum + r.retrievalMetrics.recallAtK, 0) / total,
    mrr: total === 0 ? 0 : results.reduce((sum, r) => sum + r.retrievalMetrics.mrr, 0) / total,
    ndcgAtK: total === 0 ? 0 : results.reduce((sum, r) => sum + r.retrievalMetrics.ndcgAtK, 0) / total,
  };

  return {
    overallAccuracy,
    perCategoryAccuracy,
    avgAnswerMetrics,
    avgRetrievalMetrics,
    totalLatencyMs: results.reduce((sum, r) => sum + r.latencyMs, 0),
    totalPromptTokens: results.reduce((sum, r) => sum + r.promptTokens, 0),
    totalCompletionTokens: results.reduce((sum, r) => sum + r.completionTokens, 0),
  };
}
