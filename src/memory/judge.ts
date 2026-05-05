import { scoreAnswer } from './answer-metrics.ts';

export interface JudgeResult {
  passed: boolean;
  rationale: string;
  score: number;
}

export function judgeAnswer(expected?: string, actual?: string): JudgeResult {
  const metrics = scoreAnswer(expected, actual);
  const score = Math.max(metrics.exactMatch, metrics.tokenF1, metrics.containsExpected);
  const passed = score >= 0.6;
  return {
    passed,
    rationale: passed ? 'Answer clears heuristic threshold.' : 'Answer misses heuristic threshold.',
    score,
  };
}
