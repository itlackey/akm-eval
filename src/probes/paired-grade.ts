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
  scoreSaturatedTopKRate: number;
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
  scoreSaturatedTopKRate: { control: number; candidate: number };
}

export interface PairedProbeVerdict {
  mode: "paired-release";
  tolerance: number;
  comparable: boolean;
  contextMismatches: string[];
  controlContexts: Record<string, string | number>;
  candidateContexts: Record<string, string | number>;
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
  for (const key of [
    "evaluatorCommit",
    "bunVersion",
    "datasetSha256",
    "topK",
    "maxQuestions",
    "platform",
    "arch",
  ]) {
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

function validArtifact(artifact: ProbeArtifact, expectedPack: string): string[] {
  const failures: string[] = [];
  if (artifact.pack.toLowerCase().includes(expectedPack) === false)
    failures.push("pack identity differs");
  if (!Number.isInteger(artifact.questions) || artifact.questions < 1)
    failures.push("invalid questions");
  if (!Number.isInteger(artifact.evidenceScored) || artifact.evidenceScored < 0)
    failures.push("invalid evidenceScored");
  if (!Number.isInteger(artifact.guardTripped) || artifact.guardTripped < 0)
    failures.push("invalid guardTripped");
  for (const [, value] of metricEntries(artifact)) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1))
      failures.push("invalid metric shape");
  }
  if (
    !Number.isFinite(artifact.scoreSaturatedTopKRate) ||
    artifact.scoreSaturatedTopKRate < 0 ||
    artifact.scoreSaturatedTopKRate > 1
  )
    failures.push("invalid scoreSaturatedTopKRate");
  return failures;
}

const stringContextKeys = [
  "evaluatorCommit",
  "evaluatorDirty",
  "bunVersion",
  "datasetSha256",
  "platform",
  "arch",
  "targetCommit",
  "targetDirty",
  "akmCommand",
] as const;
const numericContextKeys = ["topK", "maxQuestions"] as const;
const invariantContextKeys = [
  "evaluatorCommit",
  "evaluatorDirty",
  "bunVersion",
  "platform",
  "arch",
  "targetCommit",
  "targetDirty",
  "akmCommand",
] as const;

function validContext(context: ProbeArtifact["probeContext"]): string[] {
  if (!context) return ["missing probeContext"];
  const failures: string[] = [];
  for (const key of stringContextKeys) {
    if (typeof context[key] !== "string" || context[key].trim().length === 0)
      failures.push(`invalid ${key}`);
  }
  for (const key of numericContextKeys) {
    if (typeof context[key] !== "number" || !Number.isFinite(context[key]))
      failures.push(`invalid ${key}`);
  }
  if (context.evaluatorCommit === "unknown") failures.push("unknown evaluator context");
  if (context.targetCommit === "unknown") failures.push("unknown akm target");
  if (context.evaluatorDirty !== "false") failures.push("dirty evaluator");
  if (context.targetDirty !== "false") failures.push("dirty akm target");
  return failures;
}

function sideContextMismatches(side: string, artifacts: Record<string, ProbeArtifact>): string[] {
  const locomo = artifacts.locomo?.probeContext;
  const longmem = artifacts.longmemeval?.probeContext;
  if (!locomo || !longmem) return [];
  return invariantContextKeys
    .filter((key) => locomo[key] !== longmem[key])
    .map((key) => `${side}: locomo/longmemeval ${key} differs`);
}

export function gradePairedProbe(
  controlByPack: Record<string, ProbeArtifact>,
  candidateByPack: Record<string, ProbeArtifact>,
  tolerance = PAIRED_SCORE_TOLERANCE,
): PairedProbeVerdict {
  const packs: PairedPackVerdict[] = [];
  const mismatches: string[] = [];
  const controlContexts = controlByPack.locomo?.probeContext ?? {};
  const candidateContexts = candidateByPack.locomo?.probeContext ?? {};
  mismatches.push(
    ...sideContextMismatches("control", controlByPack),
    ...sideContextMismatches("candidate", candidateByPack),
  );
  for (const pack of ["locomo", "longmemeval"]) {
    const control = controlByPack[pack];
    const candidate = candidateByPack[pack];
    if (!control || !candidate) {
      mismatches.push(`missing ${pack} artifact`);
      continue;
    }
    mismatches.push(
      ...validArtifact(control, pack).map((failure) => `${pack} control: ${failure}`),
    );
    mismatches.push(
      ...validArtifact(candidate, pack).map((failure) => `${pack} candidate: ${failure}`),
    );
    mismatches.push(
      ...contextMismatches(control, candidate).map((mismatch) => `${pack}: ${mismatch}`),
    );
    for (const [side, artifact] of [
      ["control", control],
      ["candidate", candidate],
    ] as const)
      mismatches.push(
        ...validContext(artifact.probeContext).map((failure) => `${pack} ${side}: ${failure}`),
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
      scoreSaturatedTopKRate: {
        control: control.scoreSaturatedTopKRate,
        candidate: candidate.scoreSaturatedTopKRate,
      },
    });
  }
  const comparable = mismatches.length === 0 && packs.length === 2;
  return {
    mode: "paired-release",
    tolerance,
    comparable,
    contextMismatches: mismatches,
    controlContexts,
    candidateContexts,
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
