export const PAIRED_SCORE_TOLERANCE = 0.005;

export interface ProbeMetrics {
  zeroHitRate: number;
  evidenceRecallAt5: number | null;
  retrieval: {
    precisionAtK: number;
    recallAtK: number;
    mrr: number;
    ndcgAtK: number;
  };
}

export interface ProbeArtifact extends ProbeMetrics {
  pack: string;
  questions: number;
  evidenceScored: number;
  guardTripped: number;
  identityPermutation?: { rankingOrMetricDependent: boolean };
  probeContext?: Record<string, string | number>;
}

export interface PairedMetricVerdict {
  metric: string;
  control: number | null;
  candidate: number | null;
  delta: number | null;
  verdict: "match" | "improved" | "regressed" | "not-comparable";
}

export interface PairedPackVerdict {
  pack: string;
  metrics: PairedMetricVerdict[];
  guardTripped: { control: number; candidate: number };
  candidateIdentityDependent: boolean;
}

export interface PairedProbeVerdict {
  mode: "paired-release";
  tolerance: number;
  comparable: boolean;
  contextMismatches: string[];
  packs: PairedPackVerdict[];
  passed: boolean;
}

const metricEntries = (
  artifact: ProbeArtifact,
): Array<[string, number | null, "higher" | "lower"]> => [
  ["zeroHitRate", artifact.zeroHitRate, "lower"],
  ["evidenceRecallAt5", artifact.evidenceRecallAt5, "higher"],
  ["precisionAtK", artifact.retrieval.precisionAtK, "higher"],
  ["recallAtK", artifact.retrieval.recallAtK, "higher"],
  ["mrr", artifact.retrieval.mrr, "higher"],
  ["ndcgAtK", artifact.retrieval.ndcgAtK, "higher"],
];

function gradeMetric(
  metric: string,
  control: number | null,
  candidate: number | null,
  direction: "higher" | "lower",
  tolerance: number,
): PairedMetricVerdict {
  if (control === null || candidate === null) {
    return { metric, control, candidate, delta: null, verdict: "not-comparable" };
  }
  const delta = candidate - control;
  // A zero-hit increase is never harmless: each point represents a refused or
  // empty retrieval in this deterministic fixed corpus. Scores get ±0.005 for
  // documented ranking jitter; zero-hit gets no allowance.
  const allowed = metric === "zeroHitRate" ? 0 : tolerance;
  const signed = direction === "lower" ? -delta : delta;
  return {
    metric,
    control,
    candidate,
    delta,
    verdict: Math.abs(delta) <= allowed ? "match" : signed > 0 ? "improved" : "regressed",
  };
}

function contextMismatches(control: ProbeArtifact, candidate: ProbeArtifact): string[] {
  const mismatches: string[] = [];
  for (const key of ["evaluatorCommit", "bunVersion", "datasetSha256", "topK", "maxQuestions"]) {
    if (control.probeContext?.[key] !== candidate.probeContext?.[key]) {
      mismatches.push(
        `${key}: control=${String(control.probeContext?.[key])} candidate=${String(candidate.probeContext?.[key])}`,
      );
    }
  }
  if (control.questions !== candidate.questions) mismatches.push("questions differ");
  if (control.evidenceScored !== candidate.evidenceScored)
    mismatches.push("evidenceScored differs");
  return mismatches;
}

export function gradePairedProbe(
  controlByPack: Record<string, ProbeArtifact>,
  candidateByPack: Record<string, ProbeArtifact>,
  tolerance = PAIRED_SCORE_TOLERANCE,
): PairedProbeVerdict {
  const packs: PairedPackVerdict[] = [];
  const mismatches: string[] = [];
  for (const pack of ["locomo", "longmemeval"]) {
    const control = controlByPack[pack];
    const candidate = candidateByPack[pack];
    if (!control || !candidate) {
      mismatches.push(`missing ${pack} artifact`);
      continue;
    }
    mismatches.push(
      ...contextMismatches(control, candidate).map((mismatch) => `${pack}: ${mismatch}`),
    );
    const candidateMetrics = new Map(
      metricEntries(candidate).map(([name, value]) => [name, value]),
    );
    const metrics = metricEntries(control).map(([metric, value, direction]) =>
      gradeMetric(metric, value, candidateMetrics.get(metric) ?? null, direction, tolerance),
    );
    packs.push({
      pack,
      metrics,
      guardTripped: { control: control.guardTripped, candidate: candidate.guardTripped },
      candidateIdentityDependent: candidate.identityPermutation?.rankingOrMetricDependent !== false,
    });
  }
  const comparable = mismatches.length === 0 && packs.length === 2;
  return {
    mode: "paired-release",
    tolerance,
    comparable,
    contextMismatches: mismatches,
    packs,
    passed:
      comparable &&
      packs.every(
        (pack) =>
          pack.guardTripped.control === 0 &&
          pack.guardTripped.candidate === 0 &&
          !pack.candidateIdentityDependent &&
          pack.metrics.every(
            (metric) => metric.verdict !== "regressed" && metric.verdict !== "not-comparable",
          ),
      ),
  };
}
