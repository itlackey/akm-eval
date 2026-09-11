import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evaluator = path.resolve(rootDir, "scripts/longmemeval-evaluator.py");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-judge-resume-"));
  dirs.push(dir);
  return dir;
}

describe("LongMemEval judge checkpoint", () => {
  test("resumes only the exact prompt, request, endpoint, and judge-code contract", () => {
    const dir = tempDir();
    const predictions = path.join(dir, "predictions.jsonl");
    const dataset = path.join(dir, "dataset.json");
    const calls = path.join(dir, "calls.txt");
    fs.writeFileSync(predictions, '{"question_id":"q1","hypothesis":"blue"}\n');
    const writeDataset = (answer: string) =>
      fs.writeFileSync(
        dataset,
        `${JSON.stringify([
          {
            question_id: "q1",
            question_type: "single-session-user",
            question: "What color?",
            answer,
          },
        ])}\n`,
      );
    writeDataset("blue");
    fs.writeFileSync(
      path.join(dir, "openai.py"),
      [
        "import os",
        "class Box:",
        "  def __init__(self, **kw): self.__dict__.update(kw)",
        "class Completions:",
        "  def create(self, **kw):",
        "    with open(os.environ['FAKE_JUDGE_CALLS'], 'a', encoding='utf-8') as h: h.write('call\\n')",
        "    return Box(model='gpt-4o-2024-08-06', choices=[Box(message=Box(content='yes'))])",
        "class OpenAI:",
        "  def __init__(self, **kw): self.chat=Box(completions=Completions())",
        "",
      ].join("\n"),
    );
    const run = (
      options: {
        script?: string;
        baseURL?: string;
        maxTokens?: string;
        runtimeFingerprint?: string;
      } = {},
    ) =>
      Bun.spawnSync(["python3", options.script ?? evaluator, "gpt-4o", predictions, dataset], {
        cwd: rootDir,
        env: {
          ...process.env,
          PYTHONPATH: dir,
          FAKE_JUDGE_CALLS: calls,
          AKM_EVAL_JUDGE_API_KEY: "fake",
          AKM_EVAL_JUDGE_BASE_URL: options.baseURL ?? "https://judge.example.invalid/v1",
          ...(options.maxTokens ? { AKM_EVAL_JUDGE_MAX_TOKENS: options.maxTokens } : {}),
          ...(options.runtimeFingerprint
            ? { AKM_EVAL_JUDGE_RUNTIME_FINGERPRINT: options.runtimeFingerprint }
            : {}),
        },
        stdout: "pipe",
        stderr: "pipe",
      });

    expect(run().exitCode).toBe(0);
    expect(fs.readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(1);
    const resumed = run();
    expect(resumed.exitCode).toBe(0);
    expect(resumed.stderr.toString()).toContain("resumed 1/1");
    expect(fs.readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(1);

    const changedEndpoint = run({ baseURL: "https://other-judge.example.invalid/v1" });
    expect(changedEndpoint.exitCode).toBe(0);
    expect(changedEndpoint.stderr.toString()).toContain("resumed 0/1");
    expect(fs.readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(2);

    const changedRequest = run({
      baseURL: "https://other-judge.example.invalid/v1",
      maxTokens: "96",
    });
    expect(changedRequest.exitCode).toBe(0);
    expect(changedRequest.stderr.toString()).toContain("resumed 0/1");
    expect(fs.readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(3);

    const changedRuntime = run({
      baseURL: "https://other-judge.example.invalid/v1",
      maxTokens: "96",
      runtimeFingerprint: "judge-runtime-b",
    });
    expect(changedRuntime.exitCode).toBe(0);
    expect(changedRuntime.stderr.toString()).toContain("resumed 0/1");
    expect(fs.readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(4);

    const modifiedEvaluator = path.join(dir, "modified-longmemeval-evaluator.py");
    fs.copyFileSync(evaluator, modifiedEvaluator);
    fs.appendFileSync(modifiedEvaluator, "\n# altered judge implementation\n");
    const changedJudgeCode = run({
      script: modifiedEvaluator,
      baseURL: "https://other-judge.example.invalid/v1",
      maxTokens: "96",
      runtimeFingerprint: "judge-runtime-b",
    });
    expect(changedJudgeCode.exitCode).toBe(0);
    expect(changedJudgeCode.stderr.toString()).toContain("resumed 0/1");
    expect(fs.readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(5);

    writeDataset("azure");
    const invalidated = run({
      script: modifiedEvaluator,
      baseURL: "https://other-judge.example.invalid/v1",
      maxTokens: "96",
      runtimeFingerprint: "judge-runtime-b",
    });
    expect(invalidated.exitCode).toBe(0);
    expect(invalidated.stderr.toString()).toContain("resumed 0/1");
    expect(fs.readFileSync(calls, "utf8").trim().split("\n")).toHaveLength(6);
  });
});
