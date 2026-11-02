// The connections form writeConfig writes gives the akm under test the same effective config as the engines form it converts in memory.
// Runs only with AKM_EVAL_REAL_AKM=1 and AKM_BIN naming an akm from 0.10.261014-beta on (see the real tests of bakeoff).
import { afterEach, describe, expect, test } from "bun:test";
import { createSandbox, engineConfig, removeSandbox, runAkm, useConfigForm, writeConfig } from "./akm.ts";
import { deepMerge } from "./overrides.ts";

afterEach(() => useConfigForm("0.9.0"));

const stock = () => {
  const c = engineConfig("http://127.0.0.1:9/v1", "m", true, "judge", "groq");
  c.engines.judge.temperature = 0;
  c.engines.judge.enableThinking = false;
  c.defaults.improveStrategy = "s";
  c.improve = { strategies: { s: { engine: "judge", processes: { reflect: { qualityGate: { engine: "judge" } }, extract: { enabled: true, triage: { enabled: false } } } } } };
  return c;
};
const fields = { extraParams: { top_p: 0.9, top_k: 20, max_completion_tokens: 512 }, maxTokens: 256, reasoningEffort: "low", contextLength: 32768, concurrency: 2 };
const cases: Record<string, Record<string, any>> = {
  "the stock config": stock(),
  "an engine with extraParams, maxTokens, reasoningEffort, contextLength and concurrency": deepMerge(stock(), { engines: { judge: fields } }),
  "an engine whose extraParams name max_tokens, temperature and reasoning_effort": deepMerge(stock(), { engines: { judge: { temperature: undefined, extraParams: { max_tokens: 64, temperature: 0.3, reasoning_effort: "high" } } } }),
  "a patch that writes a connection field": deepMerge(stock(), { connections: { default: { max_tokens: 2048, temperature: 0.5 } } }),
  "a patch that writes the gate": deepMerge(stock(), { improve: { qualityGate: { llm: { enableThinking: true } } } }),
};

describe.skipIf(process.env.AKM_EVAL_REAL_AKM !== "1")("the engines and connections forms against the akm in AKM_BIN", () => {
  for (const [name, config] of Object.entries(cases)) {
    test(`${name} give the same effective config`, async () => {
      const effective = async (version: string) => {
        useConfigForm(version);
        const sb = createSandbox("config-form");
        try {
          writeConfig(sb, config);
          const r = await runAkm(sb, ["config", "list", "--format", "json"]);
          expect(r.code).toBe(0);
          return JSON.parse(r.stdout);
        } finally {
          removeSandbox(sb);
        }
      };
      const engines = await effective("0.9.0");
      expect(engines.connections.default.models).toBeDefined();
      expect(await effective("0.10.261022")).toEqual(engines);
    });
  }
});
