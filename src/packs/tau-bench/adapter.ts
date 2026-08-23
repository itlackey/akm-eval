import fs from "node:fs";
import path from "node:path";
import { ArtifactStore } from "../../core/artifact-store.ts";
import { BenchmarkRuntimeError } from "../../core/errors.ts";
import { runProcess } from "../../core/process.ts";
import type { RunContext } from "../../core/run-context.ts";
import type { NormalizedRunResult } from "../../core/types.ts";
import type { MemoryBackend } from "../../memory/types.ts";
import { markdownReportForResult } from "../../reporting/markdown.ts";
import type { PackAdapter } from "../types.ts";
import { parseTauBenchRawOutput } from "./parse.ts";
import { scoreTauBenchAdapter } from "./scorer.ts";

interface TauBenchPackConfig {
  env?: "retail" | "airline";
  taskSplit?: "train" | "test" | "dev";
  taskIds?: number[];
  smoke?: boolean;
  numTrials?: number;
  maxConcurrency?: number;
  temperature?: number;
  seed?: number;
  shuffle?: boolean;
  userModel?: string;
  userModelProvider?: "openai";
  agentStrategy?: "tool-calling" | "act" | "react" | "few-shot";
  userStrategy?: "llm" | "react" | "verify" | "reflection";
  pythonCommand?: string;
}

interface TauBenchRuntime {
  pythonCommand: string | null;
  problems: string[];
}

function inspectTauBenchRuntime(rootDir: string, explicitPython?: string): TauBenchRuntime {
  const pythonCandidates = explicitPython ? [explicitPython] : ["python3", "python"];
  let pythonCommand: string | null = null;
  let lastError = "tau_bench import failed";

  for (const candidate of pythonCandidates) {
    const result = runProcess(candidate, ["-c", 'import tau_bench; print("ok")'], rootDir);
    if (result.success) {
      pythonCommand = candidate;
      break;
    }
    lastError =
      result.stderr.trim() || result.stdout.trim() || `${candidate} could not import tau_bench`;
  }

  return {
    pythonCommand,
    problems: pythonCommand ? [] : [`official tau-bench package unavailable: ${lastError}`],
  };
}

function isOpenAICompatibleConfig(config: unknown): config is {
  type: "openai-compatible";
  baseURL?: string;
  apiKey?: string;
  defaultModel?: string;
} {
  return (
    typeof config === "object" &&
    config !== null &&
    (config as { type?: string }).type === "openai-compatible"
  );
}

function defaultBaseURL(baseURL?: string): string {
  return baseURL?.trim() || "https://api.openai.com/v1";
}

function resolvePackConfig(
  context: RunContext,
): Required<
  Pick<
    TauBenchPackConfig,
    | "env"
    | "taskSplit"
    | "numTrials"
    | "maxConcurrency"
    | "temperature"
    | "seed"
    | "shuffle"
    | "agentStrategy"
    | "userStrategy"
  >
> &
  Pick<TauBenchPackConfig, "taskIds" | "userModel" | "userModelProvider" | "pythonCommand"> {
  const packConfig = (context.run.packConfig ?? {}) as TauBenchPackConfig;
  return {
    env: packConfig.env ?? "retail",
    taskSplit: packConfig.taskSplit ?? "test",
    taskIds: Array.isArray(packConfig.taskIds)
      ? packConfig.taskIds.filter(
          (value): value is number =>
            typeof value === "number" && Number.isInteger(value) && value >= 0,
        )
      : packConfig.smoke
        ? [0]
        : undefined,
    numTrials:
      typeof packConfig.numTrials === "number" && packConfig.numTrials > 0
        ? Math.floor(packConfig.numTrials)
        : 1,
    maxConcurrency:
      typeof packConfig.maxConcurrency === "number" && packConfig.maxConcurrency > 0
        ? Math.floor(packConfig.maxConcurrency)
        : 1,
    temperature: typeof packConfig.temperature === "number" ? packConfig.temperature : 0,
    seed: typeof packConfig.seed === "number" ? Math.floor(packConfig.seed) : 10,
    shuffle: packConfig.shuffle === true,
    userModel:
      typeof packConfig.userModel === "string" && packConfig.userModel.trim().length > 0
        ? packConfig.userModel.trim()
        : undefined,
    userModelProvider: packConfig.userModelProvider ?? "openai",
    agentStrategy: packConfig.agentStrategy ?? "tool-calling",
    userStrategy: packConfig.userStrategy ?? "llm",
    pythonCommand:
      typeof packConfig.pythonCommand === "string" && packConfig.pythonCommand.trim().length > 0
        ? packConfig.pythonCommand.trim()
        : undefined,
  };
}

export const tauBenchAdapter: PackAdapter = {
  id: "tau-bench",
  description: "Official tau-bench CLI wrapper using upstream JSON result artifacts.",
  checkInstalled(rootDir = process.cwd()) {
    return inspectTauBenchRuntime(rootDir).problems.length === 0;
  },
  getDoctorDetail(rootDir = process.cwd()) {
    const runtime = inspectTauBenchRuntime(rootDir);
    if (runtime.problems.length > 0) {
      return {
        status: "warn" as const,
        detail: runtime.problems.join(" "),
      };
    }
    return {
      status: "ok" as const,
      detail: `official tau-bench package available via ${runtime.pythonCommand}`,
    };
  },
  async run(context, memory): Promise<NormalizedRunResult> {
    const provider = context.run.agentProviderConfig;
    if (!provider || !isOpenAICompatibleConfig(provider)) {
      throw new BenchmarkRuntimeError(
        "tau-bench currently requires an openai-compatible provider configuration in this repo.",
      );
    }

    const baseURL = defaultBaseURL(provider.baseURL);
    const apiKey = provider.apiKey?.trim();
    const effectiveApiKey =
      apiKey || (baseURL !== "https://api.openai.com/v1" ? "dummy" : undefined);
    if (!effectiveApiKey) {
      throw new BenchmarkRuntimeError(
        "tau-bench requires an API key for the default OpenAI endpoint, or a local compatible baseURL that can run with a dummy key.",
      );
    }

    const model = context.run.agentModel ?? provider.defaultModel;
    if (!model) {
      throw new BenchmarkRuntimeError(
        "tau-bench requires a concrete model in the variant or provider config.",
      );
    }

    const packConfig = resolvePackConfig(context);
    const runtime = inspectTauBenchRuntime(context.rootDir, packConfig.pythonCommand);
    if (!runtime.pythonCommand || runtime.problems.length > 0) {
      throw new BenchmarkRuntimeError(
        `tau-bench runtime requirements not met. ${runtime.problems.join(" ")}`,
      );
    }

    await memory.reset();
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    const logDir = path.resolve(context.outputDir, "official-run");
    fs.mkdirSync(logDir, { recursive: true });
    const wrapperPath = path.resolve(context.rootDir, "scripts", "tau_bench_run.py");
    const args = [
      wrapperPath,
      "--env",
      packConfig.env,
      "--model",
      model,
      "--model-provider",
      "openai",
      "--user-model",
      packConfig.userModel ?? model,
      "--user-model-provider",
      packConfig.userModelProvider,
      "--agent-strategy",
      packConfig.agentStrategy,
      "--user-strategy",
      packConfig.userStrategy,
      "--task-split",
      packConfig.taskSplit,
      "--num-trials",
      String(packConfig.numTrials),
      "--max-concurrency",
      String(packConfig.maxConcurrency),
      "--temperature",
      String(packConfig.temperature),
      "--seed",
      String(packConfig.seed),
      "--shuffle",
      packConfig.shuffle ? "1" : "0",
      "--log-dir",
      logDir,
      ...(packConfig.taskIds
        ? packConfig.taskIds.flatMap((taskId) => ["--task-id", String(taskId)])
        : []),
    ];

    const proc = Bun.spawn([runtime.pythonCommand, ...args], {
      cwd: context.rootDir,
      env: {
        ...process.env,
        OPENAI_API_KEY: effectiveApiKey,
        ...(provider.baseURL ? { OPENAI_API_BASE: provider.baseURL } : {}),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new BenchmarkRuntimeError(
        `official tau-bench run failed with exit code ${exitCode}. stderr: ${stderr.trim() || "(empty)"}`,
      );
    }

    const resultsLine = stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith("AKM_EVAL_TAU_BENCH_RESULTS="));
    const resultsPath = resultsLine?.split("=", 2)[1];
    if (!resultsPath || !fs.existsSync(resultsPath)) {
      throw new BenchmarkRuntimeError(
        "tau-bench wrapper did not report a valid results JSON path.",
      );
    }

    const parsed = parseTauBenchRawOutput(
      JSON.parse(fs.readFileSync(resultsPath, "utf8")) as unknown,
    );
    const score = scoreTauBenchAdapter(parsed.averageReward);
    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));

    const result: NormalizedRunResult = {
      schemaVersion: "1.0",
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status:
        parsed.totalTasks === 0
          ? "warning"
          : parsed.errorCount > 0
            ? "warning"
            : score > 0
              ? "passed"
              : "failed",
      startedAt,
      finishedAt,
      durationMs,
      warnings:
        parsed.errorCount > 0
          ? [`${parsed.errorCount} tau-bench task(s) reported upstream execution errors.`]
          : [],
      notes: [
        `tau-bench evaluated ${parsed.totalTasks} task(s) in the ${packConfig.env} environment.`,
        `Average reward: ${(score * 100).toFixed(1)}%.`,
        `Passed ${parsed.passedTasks}/${parsed.totalTasks} task(s).`,
      ],
      metrics: {
        retrieval: {
          queryCount: 0,
          precisionAtK: 0,
          recallAtK: 0,
          mrr: 0,
          ndcgAtK: 0,
        },
        answer: {
          exactMatch: 0,
          tokenF1: 0,
          containsExpected: 0,
          judgedPass: score,
        },
        aggregate: {
          score,
          retrievalWeight: 0,
          answerWeight: 1,
        },
      },
      telemetry: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: durationMs,
        logs: [
          `pack=${context.run.pack}`,
          `variant=${context.run.variant}`,
          `memory=${memory.id}`,
          `env=${packConfig.env}`,
          `model=${model}`,
          `taskSplit=${packConfig.taskSplit}`,
          `numTrials=${packConfig.numTrials}`,
        ],
      },
      artifacts: {
        resultPath: "",
        summaryPath: "",
        rawOutputPath: "",
      },
      metadata: {
        ...context.run.metadata,
        benchmarkId: packConfig.env,
        environment: packConfig.env,
        taskSplit: packConfig.taskSplit,
        model,
        modelProvider: "openai",
        userModel: packConfig.userModel ?? model,
        userModelProvider: packConfig.userModelProvider,
        agentStrategy: packConfig.agentStrategy,
        userStrategy: packConfig.userStrategy,
        totalTasks: parsed.totalTasks,
        passedTasks: parsed.passedTasks,
        failedTasks: parsed.failedTasks,
        trials: parsed.trials,
        resultsPath,
      },
    };

    const stdoutPath = store.writeText("harness-stdout.log", stdout);
    const stderrPath = store.writeText("harness-stderr.log", stderr);
    result.artifacts.rawOutputPath = store.writeJson("raw-output.json", {
      pack: "tau-bench",
      resultsPath,
      environment: packConfig.env,
      taskSplit: packConfig.taskSplit,
      model,
      modelProvider: "openai",
      userModel: packConfig.userModel ?? model,
      userModelProvider: packConfig.userModelProvider,
      agentStrategy: packConfig.agentStrategy,
      userStrategy: packConfig.userStrategy,
      harnessStdoutPath: stdoutPath,
      harnessStderrPath: stderrPath,
      parsed,
    });
    result.artifacts.resultPath = path.resolve(store.baseDir, "result.json");
    result.artifacts.summaryPath = path.resolve(store.baseDir, "summary.md");
    store.writeJson("result.json", result);
    store.writeText("summary.md", markdownReportForResult(result));
    return result;
  },
};
