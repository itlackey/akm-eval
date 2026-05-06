import type { AnswerMetrics } from '../../memory/types.ts';
import type { ParsedLoCoMoEvaluatorOutput } from './parse.ts';

export function scoreLocomoAdapter(parsed: ParsedLoCoMoEvaluatorOutput): AnswerMetrics {
  const scoreKey = `${parsed.model_key}_f1`;
  const scores = parsed.scored_samples.flatMap((sample) =>
    sample.qa.map((question) =>
      typeof question[scoreKey] === 'number' ? (question[scoreKey] as number) : 0,
    ),
  );

  const average = scores.length === 0 ? 0 : scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const exactMatch = scores.length === 0 ? 0 : scores.filter((value) => value >= 1).length / scores.length;
  const containsExpected = scores.length === 0 ? 0 : scores.filter((value) => value > 0).length / scores.length;

  return {
    exactMatch: Number(exactMatch.toFixed(6)),
    tokenF1: Number(average.toFixed(6)),
    containsExpected: Number(containsExpected.toFixed(6)),
    judgedPass: Number(parsed.overall_accuracy.toFixed(6)),
  };
}
