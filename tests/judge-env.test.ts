import { describe, expect, test } from "bun:test";

import { resolveJudgeEnv } from "../src/packs/longmemeval/adapter.ts";

const AGENT = { baseURL: "https://opencode.ai/zen/v1", apiKey: "zen-key" };

describe("resolveJudgeEnv", () => {
  test("with no judge vars, the judge follows the agent provider", () => {
    // Historical behaviour, still correct when one endpoint serves both.
    const env = resolveJudgeEnv({}, AGENT);
    expect(env.OPENAI_BASE_URL).toBe("https://opencode.ai/zen/v1");
    expect(env.OPENAI_API_KEY).toBe("zen-key");
  });

  test("a judge key alone routes the judge to cloud OpenAI, not the agent's endpoint", () => {
    // The case that motivated the split: agent on Zen (which serves no gpt-4
    // family), judge on real OpenAI. If the agent's baseURL survived here, the
    // OpenAI key would be sent to Zen -- a credential delivered to the wrong
    // service, which is worse than a failed run.
    const env = resolveJudgeEnv({ AKM_EVAL_JUDGE_API_KEY: "sk-openai" }, AGENT);
    expect(env.OPENAI_API_KEY).toBe("sk-openai");
    expect(env.OPENAI_BASE_URL).toBeUndefined();
  });

  test("an explicit judge base URL is honoured alongside the judge key", () => {
    const env = resolveJudgeEnv(
      { AKM_EVAL_JUDGE_API_KEY: "sk-judge", AKM_EVAL_JUDGE_BASE_URL: "https://judge.example/v1" },
      AGENT,
    );
    expect(env.OPENAI_API_KEY).toBe("sk-judge");
    expect(env.OPENAI_BASE_URL).toBe("https://judge.example/v1");
  });

  test("a judge base URL without a key keeps the agent's key", () => {
    // A self-hosted judge behind the same credential.
    const env = resolveJudgeEnv({ AKM_EVAL_JUDGE_BASE_URL: "http://localhost:8000/v1" }, AGENT);
    expect(env.OPENAI_BASE_URL).toBe("http://localhost:8000/v1");
    expect(env.OPENAI_API_KEY).toBe("zen-key");
  });

  test("judge vars win over ambient OPENAI_* and over the agent provider", () => {
    const env = resolveJudgeEnv(
      {
        OPENAI_API_KEY: "ambient",
        OPENAI_BASE_URL: "https://ambient.example/v1",
        AKM_EVAL_JUDGE_API_KEY: "sk-judge",
        AKM_EVAL_JUDGE_BASE_URL: "https://judge.example/v1",
      },
      AGENT,
    );
    expect(env.OPENAI_API_KEY).toBe("sk-judge");
    expect(env.OPENAI_BASE_URL).toBe("https://judge.example/v1");
  });

  test("with no agent provider and no judge vars, ambient OPENAI_* is left alone", () => {
    const env = resolveJudgeEnv({ OPENAI_API_KEY: "ambient" }, undefined);
    expect(env.OPENAI_API_KEY).toBe("ambient");
  });
});
