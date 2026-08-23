import type { AnswerMetrics } from '../../memory/types.ts';
import type { ParsedLoCoMoEvaluatorOutput } from './parse.ts';

export function scoreLocomoAdapter(parsed: ParsedLoCoMoEvaluatorOutput): AnswerMetrics {
  const scoreKey = `${parsed.model_key}_f1`;
  const scores = parsed.scored_samples.flatMap((sample) =>
    sample.qa.map((question) => {
      const value = question[scoreKey];
      if (typeof value !== 'number') {
        // The bundled official-evaluator wrapper (scripts/locomo-evaluator.py)
        // writes `<model>_f1` unconditionally for every question in every
        // scored sample. A missing key here means the evaluator's contract
        // changed or its output was truncated/corrupted — treat that as a
        // real failure rather than silently scoring the question 0, which
        // would deflate this arm's score without disclosing why.
        throw new Error(
          `LoCoMo evaluator output for sample "${sample.sample_id}" is missing the "${scoreKey}" score on question ` +
            `${JSON.stringify(question.question)}. Refusing to silently score it 0.`,
        );
      }
      return value;
    }),
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
