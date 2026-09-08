#!/usr/bin/env bun
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { longMemEvalPromptProtocolSha256 } from "../src/packs/longmemeval/adapter.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = path.resolve(rootDir, "results/official-results.json");
const defaultRoundId = "longmemeval-qwen35-9b-q4km-131k-v1";

// biome-ignore lint/suspicious/noExplicitAny: the tool validates external JSON field-by-field at runtime.
type JsonObject = Record<string, any>;

function readJson(filePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function jsonLines(filePath: string): JsonObject[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonObject);
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function repoPath(relativePath: string): string {
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error(`path escapes repository: ${relativePath}`);
  }
  return resolved;
}

function getRound(roundId: string): JsonObject {
  const ledger = readJson(ledgerPath);
  const round = ledger.rounds?.find((entry: JsonObject) => entry.id === roundId);
  if (!round) throw new Error(`official results ledger has no round ${roundId}`);
  return round;
}

function census(
  rows: JsonObject[],
  selector: (row: JsonObject) => unknown,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const model = selector(row);
    if (typeof model === "string" && model.length > 0) result[model] = (result[model] ?? 0) + 1;
  }
  return result;
}

function expectEqual(errors: string[], label: string, actual: unknown, expected: unknown): void {
  if (canonical(actual) !== canonical(expected)) {
    errors.push(`${label}: expected ${canonical(expected)}, got ${canonical(actual)}`);
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

function tableForArms(arms: JsonObject[]): string {
  const rows = [
    "| Arm | Score | Correct | Answer-model tokens | Wall time |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];
  for (const arm of arms) {
    rows.push(
      `| ${arm.label} | ${(arm.score * 100).toFixed(1)}% | ${arm.correct}/${arm.questionCount} | ${Number(arm.tokens.total).toLocaleString("en-US")} | ${formatDuration(arm.timing.wallMs)}${arm.timing.wallPrecision === "approximate" ? " (approx.)" : ""} |`,
    );
  }
  return rows.join("\n");
}

function verifyManifest(protocol: JsonObject, errors: string[]): void {
  const manifestPath = repoPath(protocol.artifactManifest);
  if (!fs.existsSync(manifestPath)) {
    errors.push(`missing artifact manifest: ${path.relative(rootDir, manifestPath)}`);
    return;
  }
  const bundleRoot = path.dirname(manifestPath);
  const declared = new Set<string>();
  for (const line of fs.readFileSync(manifestPath, "utf8").trim().split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64}) {2}([^\n]+)$/);
    if (!match) {
      errors.push(`invalid SHA256SUMS line: ${line}`);
      continue;
    }
    const [, expected, relative] = match;
    if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) {
      errors.push(`unsafe SHA256SUMS path: ${relative ?? ""}`);
      continue;
    }
    declared.add(relative);
    const artifactPath = path.resolve(bundleRoot, relative);
    if (!fs.existsSync(artifactPath)) errors.push(`missing reference artifact: ${relative}`);
    else if (sha256File(artifactPath) !== expected) errors.push(`checksum mismatch: ${relative}`);
  }
  const actual = fs
    .readdirSync(bundleRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== "SHA256SUMS")
    .map((entry) => path.relative(bundleRoot, path.join(entry.parentPath, entry.name)))
    .sort();
  for (const file of actual)
    if (!declared.has(file)) errors.push(`artifact is not checksummed: ${file}`);
  for (const file of declared)
    if (!actual.includes(file)) errors.push(`manifest names absent artifact: ${file}`);
}

function verifyArm(round: JsonObject, arm: JsonObject, errors: string[]): void {
  const armRoot = repoPath(`${round.protocol.artifactRoot}/${arm.id}`);
  const result = readJson(path.join(armRoot, "result.json"));
  const checkpoint = jsonLines(path.join(armRoot, "answer-checkpoint.jsonl"));
  const checkpointManifest = readJson(path.join(armRoot, "answer-checkpoint.manifest.json"));
  const predictions = jsonLines(path.join(armRoot, "predictions.jsonl"));
  const judges = jsonLines(path.join(armRoot, "judge-results.jsonl"));
  const expectedCount = round.benchmark.questionCount;

  expectEqual(errors, `${arm.id} result variant`, result.variant, arm.id);
  expectEqual(errors, `${arm.id} result backend`, result.memoryBackend, arm.memoryBackend);
  expectEqual(
    errors,
    `${arm.id} result question count`,
    result.metadata?.questionCount,
    expectedCount,
  );
  expectEqual(errors, `${arm.id} checkpoint rows`, checkpoint.length, expectedCount);
  expectEqual(errors, `${arm.id} prediction rows`, predictions.length, expectedCount);
  expectEqual(errors, `${arm.id} judge rows`, judges.length, expectedCount);
  expectEqual(
    errors,
    `${arm.id} checkpoint manifest count`,
    checkpointManifest.questionCount,
    expectedCount,
  );
  expectEqual(
    errors,
    `${arm.id} question IDs`,
    checkpointManifest.questionIdsSha256,
    round.benchmark.questionIdsSha256,
  );
  expectEqual(
    errors,
    `${arm.id} checkpoint signature`,
    checkpointManifest.signature,
    arm.checkpointSignature,
  );
  expectEqual(
    errors,
    `${arm.id} result signature`,
    result.metadata?.checkpointSignature,
    arm.checkpointSignature,
  );
  expectEqual(errors, `${arm.id} topK`, checkpointManifest.topK, round.protocol.topK);
  expectEqual(
    errors,
    `${arm.id} requested model`,
    checkpointManifest.requestedAgentModel,
    round.answerModel.requestedModel,
  );
  expectEqual(
    errors,
    `${arm.id} model options`,
    checkpointManifest.agentProviderOptions,
    round.answerModel.options,
  );
  expectEqual(
    errors,
    `${arm.id} prompt contract`,
    checkpointManifest.promptContract,
    round.benchmark.promptContract,
  );
  expectEqual(
    errors,
    `${arm.id} checkpoint row order`,
    sha256Text(JSON.stringify(checkpoint.map((row) => row.question_id))),
    round.benchmark.questionIdsSha256,
  );
  expectEqual(
    errors,
    `${arm.id} prediction row order`,
    predictions.map((row) => row.question_id),
    checkpoint.map((row) => row.question_id),
  );
  expectEqual(
    errors,
    `${arm.id} judge row order`,
    judges.map((row) => row.question_id),
    checkpoint.map((row) => row.question_id),
  );
  expectEqual(errors, `${arm.id} score`, result.metrics?.answer?.judgedPass, arm.score);
  expectEqual(errors, `${arm.id} prompt tokens`, result.telemetry?.promptTokens, arm.tokens.prompt);
  expectEqual(
    errors,
    `${arm.id} completion tokens`,
    result.telemetry?.completionTokens,
    arm.tokens.completion,
  );
  expectEqual(errors, `${arm.id} total tokens`, result.telemetry?.totalTokens, arm.tokens.total);

  const checkpointTokens = checkpoint.reduce(
    (sum, row) => ({
      prompt: sum.prompt + Number(row.agent?.usage?.input ?? 0),
      completion: sum.completion + Number(row.agent?.usage?.output ?? 0),
      total: sum.total + Number(row.agent?.usage?.total ?? 0),
      retries: sum.retries + Number(row.agent?.retries ?? 0),
    }),
    { prompt: 0, completion: 0, total: 0, retries: 0 },
  );
  expectEqual(errors, `${arm.id} checkpoint token totals`, checkpointTokens, {
    prompt: arm.tokens.prompt,
    completion: arm.tokens.completion,
    total: arm.tokens.total,
    retries: arm.retries,
  });
  expectEqual(
    errors,
    `${arm.id} answer-model census`,
    census(checkpoint, (row) => row.agent?.resolvedModel),
    arm.resolvedAnswerModels,
  );
  expectEqual(
    errors,
    `${arm.id} judge-model census`,
    census(judges, (row) => row.autoeval_label?.resolved_model),
    arm.resolvedJudgeModels,
  );
  expectEqual(
    errors,
    `${arm.id} correct verdicts`,
    judges.filter((row) => row.autoeval_label?.label === true).length,
    arm.correct,
  );

  for (const [kind, artifactPath, expectedSha] of [
    ["result", arm.artifacts.resultPath, arm.artifacts.resultSha256],
    ["predictions", arm.artifacts.predictionsPath, arm.artifacts.predictionsSha256],
    ["judge", arm.artifacts.judgeLogPath, arm.artifacts.judgeLogSha256],
  ] as const) {
    const resolved = repoPath(artifactPath);
    if (!fs.existsSync(resolved))
      errors.push(`${arm.id} missing ${kind} artifact: ${artifactPath}`);
    else if (sha256File(resolved) !== expectedSha)
      errors.push(`${arm.id} ${kind} artifact checksum mismatch`);
  }
}

export function verifyReference(roundId = defaultRoundId): JsonObject {
  const round = getRound(roundId);
  const protocolPath = repoPath(round.protocol.referenceProtocolPath);
  const protocol = readJson(protocolPath);
  const errors: string[] = [];

  expectEqual(errors, "protocol id", protocol.id, round.id);
  expectEqual(
    errors,
    "reference protocol SHA",
    sha256File(protocolPath),
    round.protocol.referenceProtocolSha256,
  );
  expectEqual(
    errors,
    "artifact manifest SHA",
    sha256File(repoPath(round.protocol.artifactManifestPath)),
    round.protocol.artifactManifestSha256,
  );
  expectEqual(
    errors,
    "dataset SHA",
    protocol.benchmark.datasetSha256,
    round.benchmark.datasetSha256,
  );
  expectEqual(
    errors,
    "question ID SHA",
    protocol.benchmark.questionIdsSha256,
    round.benchmark.questionIdsSha256,
  );
  expectEqual(
    errors,
    "answer artifact SHA",
    protocol.answerModel.artifactSha256,
    round.answerModel.artifactSha256,
  );
  expectEqual(
    errors,
    "recorded config SHA",
    sha256File(repoPath(protocol.configuration.recordedPath)),
    protocol.configuration.recordedSha256,
  );
  expectEqual(
    errors,
    "reproduction config SHA",
    sha256File(repoPath(protocol.configuration.reproductionPath)),
    protocol.configuration.reproductionSha256,
  );
  expectEqual(
    errors,
    "current prompt protocol",
    longMemEvalPromptProtocolSha256(),
    protocol.benchmark.promptProtocolSha256,
  );
  expectEqual(
    errors,
    "current judge script",
    sha256File(repoPath("scripts/longmemeval-evaluator.py")),
    protocol.judge.scriptSha256,
  );
  verifyManifest(protocol, errors);
  for (const arm of round.arms) verifyArm(round, arm, errors);

  const datasetPath = repoPath("datasets/longmemeval/dataset.json");
  const datasetPresent = fs.existsSync(datasetPath);
  if (datasetPresent)
    expectEqual(
      errors,
      "local dataset SHA",
      sha256File(datasetPath),
      protocol.benchmark.datasetSha256,
    );
  if (errors.length > 0)
    throw new Error(`reference verification failed:\n- ${errors.join("\n- ")}`);
  return { round, protocol, datasetPresent };
}

function locateCandidateManifest(candidatePath: string, result: JsonObject): string {
  const candidateDir = path.dirname(candidatePath);
  const standardized = path.join(candidateDir, "answer-checkpoint.manifest.json");
  if (fs.existsSync(standardized)) return standardized;
  const signature = String(result.metadata?.checkpointSignature ?? "");
  const checkpointsDir = path.join(candidateDir, ".checkpoints");
  if (fs.existsSync(checkpointsDir)) {
    const match = fs
      .readdirSync(checkpointsDir)
      .find((name) => name.endsWith(".manifest.json") && (!signature || name.includes(signature)));
    if (match) return path.join(checkpointsDir, match);
  }
  const recorded = result.metadata?.checkpointPath;
  if (typeof recorded === "string" && fs.existsSync(`${recorded}.manifest.json`))
    return `${recorded}.manifest.json`;
  throw new Error(`cannot find answer checkpoint manifest next to ${candidatePath}`);
}

function candidateEvidence(
  candidatePath: string,
  result: JsonObject,
  manifest: JsonObject,
): JsonObject {
  const candidateDir = path.dirname(candidatePath);
  const checkpointPath = path.join(
    candidateDir,
    ".checkpoints",
    `longmemeval-${manifest.signature}.jsonl`,
  );
  const fallbackCheckpoint = path.join(candidateDir, "answer-checkpoint.jsonl");
  const predictionsPath = path.join(candidateDir, "predictions.jsonl");
  const judgesPath = path.join(candidateDir, "predictions.jsonl.eval-results-gpt-4o");
  const fallbackJudges = path.join(candidateDir, "judge-results.jsonl");
  return {
    checkpoint: jsonLines(fs.existsSync(checkpointPath) ? checkpointPath : fallbackCheckpoint),
    predictions: jsonLines(predictionsPath),
    judges: jsonLines(fs.existsSync(judgesPath) ? judgesPath : fallbackJudges),
  };
}

export function compareCandidate(candidateInput: string, roundId = defaultRoundId): JsonObject {
  const verified = verifyReference(roundId);
  const round = verified.round;
  const protocol = verified.protocol;
  const candidatePath = path.resolve(rootDir, candidateInput);
  const resolvedCandidatePath = fs.statSync(candidatePath).isDirectory()
    ? path.join(candidatePath, "result.json")
    : candidatePath;
  const result = readJson(resolvedCandidatePath);
  const manifest = readJson(locateCandidateManifest(resolvedCandidatePath, result));
  const evidence = candidateEvidence(resolvedCandidatePath, result, manifest);
  const errors: string[] = [];
  const count = protocol.benchmark.questionCount;

  expectEqual(errors, "candidate pack", result.pack, "longmemeval");
  expectEqual(errors, "candidate variant", result.variant, protocol.akm.variant);
  expectEqual(errors, "candidate backend", result.memoryBackend, "akm");
  expectEqual(errors, "candidate question count", result.metadata?.questionCount, count);
  expectEqual(
    errors,
    "candidate dataset SHA",
    result.metadata?.datasetSha256,
    protocol.benchmark.datasetSha256,
  );
  expectEqual(
    errors,
    "candidate question IDs",
    result.metadata?.questionIdsSha256,
    protocol.benchmark.questionIdsSha256,
  );
  expectEqual(
    errors,
    "candidate prompt contract",
    result.metadata?.promptContract,
    protocol.benchmark.promptContract,
  );
  expectEqual(
    errors,
    "candidate prompt protocol",
    result.metadata?.promptProtocolSha256,
    protocol.benchmark.promptProtocolSha256,
  );
  expectEqual(
    errors,
    "candidate judge script",
    result.metadata?.judgeScriptSha256,
    protocol.judge.scriptSha256,
  );
  expectEqual(
    errors,
    "candidate judge max tokens",
    result.metadata?.judgeMaxTokens,
    protocol.judge.maxTokens,
  );
  expectEqual(
    errors,
    "candidate judge max-unparseable rate",
    result.metadata?.judgeMaxUnparseableRate,
    protocol.judge.maxUnparseableRate,
  );
  expectEqual(
    errors,
    "candidate model artifact",
    result.metadata?.answerModelArtifactSha256,
    protocol.answerModel.artifactSha256,
  );
  expectEqual(
    errors,
    "candidate model runtime",
    result.metadata?.answerModelRuntimeImage,
    protocol.answerModel.runtimeImage,
  );
  expectEqual(errors, "candidate topK", result.metadata?.topK, protocol.benchmark.topK);
  expectEqual(
    errors,
    "candidate fragment mode",
    result.metadata?.akmFragmentContextMode,
    protocol.akm.fragmentContext.mode,
  );
  expectEqual(
    errors,
    "candidate fragment maxChars",
    result.metadata?.akmFragmentContextMaxChars,
    protocol.akm.fragmentContext.maxChars,
  );
  expectEqual(errors, "candidate answer census", result.telemetry?.resolvedModels, {
    [protocol.answerModel.resolvedModel]: count,
  });
  expectEqual(
    errors,
    "candidate judge census",
    result.metadata?.judgeResolvedModels,
    `${protocol.judge.resolvedModel}=${count}`,
  );
  expectEqual(
    errors,
    "manifest signature",
    manifest.signature,
    result.metadata?.checkpointSignature,
  );
  expectEqual(errors, "manifest questions", manifest.questionCount, count);
  expectEqual(
    errors,
    "manifest question IDs",
    manifest.questionIdsSha256,
    protocol.benchmark.questionIdsSha256,
  );
  expectEqual(errors, "manifest backend", manifest.memoryBackend, "akm");
  expectEqual(errors, "manifest backend config", manifest.memoryBackendConfig, {
    fragmentContext: protocol.akm.fragmentContext,
  });
  expectEqual(errors, "manifest topK", manifest.topK, protocol.benchmark.topK);
  expectEqual(errors, "manifest provider type", manifest.agentProviderType, "openai-compatible");
  expectEqual(
    errors,
    "manifest requested model",
    manifest.requestedAgentModel,
    protocol.answerModel.requestedModel,
  );
  expectEqual(
    errors,
    "manifest model options",
    manifest.agentProviderOptions,
    protocol.answerModel.options,
  );
  expectEqual(
    errors,
    "manifest prompt contract",
    manifest.promptContract,
    protocol.benchmark.promptContract,
  );
  expectEqual(errors, "candidate checkpoint rows", evidence.checkpoint.length, count);
  expectEqual(errors, "candidate predictions", evidence.predictions.length, count);
  expectEqual(errors, "candidate judge rows", evidence.judges.length, count);
  if (result.metadata?.backendSourceDirty === true)
    errors.push("candidate AKM source tree is dirty");
  if (result.metadata?.backendSourceFingerprint && result.metadata?.backendSourceDirty !== false) {
    errors.push("source-built candidate does not attest to a clean AKM source tree");
  }
  expectEqual(
    errors,
    "candidate checkpoint row order",
    sha256Text(JSON.stringify(evidence.checkpoint.map((row: JsonObject) => row.question_id))),
    protocol.benchmark.questionIdsSha256,
  );
  expectEqual(
    errors,
    "candidate prediction row order",
    evidence.predictions.map((row: JsonObject) => row.question_id),
    evidence.checkpoint.map((row: JsonObject) => row.question_id),
  );
  expectEqual(
    errors,
    "candidate judge row order",
    evidence.judges.map((row: JsonObject) => row.question_id),
    evidence.checkpoint.map((row: JsonObject) => row.question_id),
  );
  if (
    evidence.checkpoint.some(
      (row: JsonObject) => row.signature !== manifest.signature || !row.agent?.usage,
    )
  ) {
    errors.push("candidate checkpoint contains an invalid signature or missing token usage");
  }
  if (
    evidence.judges.some(
      (row: JsonObject) =>
        typeof row.autoeval_label?.label !== "boolean" ||
        typeof row.autoeval_label?.raw_verdict !== "string" ||
        row.autoeval_label.raw_verdict.trim().length === 0,
    )
  ) {
    errors.push("candidate judge log contains an invalid verdict");
  }

  const checkpointTotals = evidence.checkpoint.reduce(
    (sum: JsonObject, row: JsonObject) => ({
      prompt: sum.prompt + Number(row.agent?.usage?.input ?? 0),
      completion: sum.completion + Number(row.agent?.usage?.output ?? 0),
      total: sum.total + Number(row.agent?.usage?.total ?? 0),
      retries: sum.retries + Number(row.agent?.retries ?? 0),
    }),
    { prompt: 0, completion: 0, total: 0, retries: 0 },
  );
  expectEqual(
    errors,
    "candidate checkpoint prompt tokens",
    checkpointTotals.prompt,
    result.telemetry?.promptTokens,
  );
  expectEqual(
    errors,
    "candidate checkpoint completion tokens",
    checkpointTotals.completion,
    result.telemetry?.completionTokens,
  );
  expectEqual(
    errors,
    "candidate checkpoint total tokens",
    checkpointTotals.total,
    result.telemetry?.totalTokens,
  );
  expectEqual(
    errors,
    "candidate retry count",
    checkpointTotals.retries,
    result.metadata?.agentRetryCount,
  );
  expectEqual(
    errors,
    "candidate checkpoint model census",
    census(evidence.checkpoint, (row) => row.agent?.resolvedModel),
    { [protocol.answerModel.resolvedModel]: count },
  );
  expectEqual(
    errors,
    "candidate judge model census",
    census(evidence.judges, (row) => row.autoeval_label?.resolved_model),
    { [protocol.judge.resolvedModel]: count },
  );
  const correct = evidence.judges.filter(
    (row: JsonObject) => row.autoeval_label?.label === true,
  ).length;
  expectEqual(
    errors,
    "candidate judged score",
    result.metrics?.answer?.judgedPass,
    correct / count,
  );
  if (errors.length > 0)
    throw new Error(`candidate is not reference-compatible:\n- ${errors.join("\n- ")}`);

  const candidateArm = {
    id: result.variant,
    label: `AKM ${result.metadata?.backendVersion ?? "candidate"}`,
    score: result.metrics.answer.judgedPass,
    correct,
    questionCount: count,
    tokens: { total: result.telemetry.totalTokens },
    timing: { wallMs: result.durationMs, wallPrecision: "exact" },
  };
  const baseline = round.arms.find((arm: JsonObject) => arm.id === "baseline");
  const vector = round.arms.find((arm: JsonObject) => arm.id === "raw-vector");
  return {
    schemaVersion: "akm.eval.reference-comparison.v1",
    createdAt: new Date().toISOString(),
    referenceRound: round.id,
    compatibility: "verified",
    candidate: {
      ...candidateArm,
      resultPath: path.relative(rootDir, resolvedCandidatePath),
      resultSha256: sha256File(resolvedCandidatePath),
      checkpointSignature: manifest.signature,
      sourceGitSha: result.metadata?.backendSourceGitSha ?? null,
      sourceTreeFingerprint: result.metadata?.backendSourceFingerprint ?? null,
      sourceDirty: result.metadata?.backendSourceDirty ?? null,
      retries: checkpointTotals.retries,
    },
    controls: [baseline, vector].map((arm: JsonObject) => ({
      id: arm.id,
      label: arm.label,
      score: arm.score,
      correct: arm.correct,
      questionCount: arm.questionCount,
      tokens: arm.tokens,
      timing: arm.timing,
    })),
    comparisons: [baseline, vector].map((control: JsonObject) => ({
      candidate: result.variant,
      control: control.id,
      scoreDelta: candidateArm.score - control.score,
      correctDelta: candidateArm.correct - control.correct,
      tokenReduction: 1 - candidateArm.tokens.total / control.tokens.total,
    })),
  };
}

async function preflightEndpoints(endpoints: string[]): Promise<void> {
  if (endpoints.length === 0) throw new Error("preflight requires at least one --endpoint URL");
  for (const endpoint of endpoints) {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/models`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`model endpoint ${endpoint} returned HTTP ${response.status}`);
    const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const models = (body.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string");
    if (!models.includes("qwen3.5-9b")) {
      throw new Error(
        `model endpoint ${endpoint} does not advertise qwen3.5-9b (got ${models.join(", ") || "none"})`,
      );
    }
    console.log(`Verified model endpoint ${endpoint}: qwen3.5-9b`);
  }
}

function parseArgs(args: string[]): {
  command: string;
  roundId: string;
  candidate?: string;
  out?: string;
  endpoints: string[];
} {
  const command = args.shift() ?? "verify";
  let roundId = defaultRoundId;
  let candidate: string | undefined;
  let out: string | undefined;
  const endpoints: string[] = [];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--round") roundId = args.shift() ?? "";
    else if (flag === "--candidate") candidate = args.shift();
    else if (flag === "--out") out = args.shift();
    else if (flag === "--endpoint") endpoints.push(args.shift() ?? "");
    else throw new Error(`unexpected argument: ${flag}`);
  }
  return { command, roundId, candidate, out, endpoints };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "verify") {
    const { round, datasetPresent } = verifyReference(parsed.roundId);
    console.log(`Verified reference round ${round.id}.`);
    console.log(tableForArms(round.arms));
    if (!datasetPresent)
      console.log(
        "\nDataset not present (expected in a fresh clone). Run `bin/downloads LongMemEval` before an eval.",
      );
    return;
  }
  if (parsed.command === "compare") {
    if (!parsed.candidate) throw new Error("compare requires --candidate PATH");
    const comparison = compareCandidate(parsed.candidate, parsed.roundId);
    const displayArms = [...comparison.controls, comparison.candidate];
    console.log(`Candidate is compatible with frozen reference round ${parsed.roundId}.`);
    console.log(tableForArms(displayArms));
    if (parsed.out) {
      const outPath = path.resolve(rootDir, parsed.out);
      const runsRoot = path.resolve(rootDir, "runs");
      if (!outPath.startsWith(`${runsRoot}${path.sep}`)) {
        throw new Error("comparison --out must be beneath runs/");
      }
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, `${JSON.stringify(comparison, null, 2)}\n`);
      console.log(`\nWrote ${path.relative(rootDir, outPath)}.`);
    }
    return;
  }
  if (parsed.command === "preflight") {
    await preflightEndpoints(parsed.endpoints);
    return;
  }
  throw new Error(
    "usage: scripts/reference-results.ts <verify|compare|preflight> [--round ID] [--candidate PATH] [--out PATH] [--endpoint URL]",
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
