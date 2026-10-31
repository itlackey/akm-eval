import { expect, test } from "bun:test";
import { join } from "node:path";
import { resultsLabel } from "./run.ts";

const run = (...args: string[]) => {
  const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "run.ts"), ...args], {
    stdout: "pipe", stderr: "pipe",
    env: { ...process.env, AKM_BIN: "/nonexistent/akm-memory-utility-corpus-test", MODEL_NAME: "corpus-test", MODEL_BASE_URL: "https://reader.example.invalid/v1", MODEL_API_KEY: "", MODEL_PROVIDER: "openai" },
  });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};

test("shared corpus errors happen before AKM or model setup", () => {
  const cases: [string[], string][] = [
    [["--corpus", "private"], '--corpus must be public, custom or all, not "private"'],
    [["--corpus", "public", "--cases", "anything"], "--cases is a custom corpus: use it alone, or with --corpus custom"],
    [["--cases", " "], "--cases needs a folder"],
    [["--corpus", "custom"], "memory-utility has no rewrite: its custom corpus is a folder of your own cases. Use --cases DIR"],
    [["--corpus", "all"], "memory-utility has no rewrite: its custom corpus is a folder of your own cases. Use --cases DIR"],
  ];
  for (const [args, error] of cases) {
    const result = run(...args);
    expect(result.code).toBe(2);
    expect(result.err).toContain(error);
    expect(result.err).not.toContain("ENOENT");
    expect(result.out).toBe("");
  }
});

test("custom/all destination is announced with shared text before the failing AKM probe", () => {
  const folder = join(import.meta.dir, "../assets");
  for (const corpus of ["custom", "all"]) {
    const result = run("--corpus", corpus, "--cases", folder, "--limit", "1");
    expect(result.code).toBe(2);
    expect(result.out).toContain(`The cases in ${folder} will be sent to:`);
    expect(result.out).toContain("  model  corpus-test at https://reader.example.invalid/v1");
    expect(result.err).toContain("ENOENT");
    expect(result.out).not.toContain("Results:");
  }
});

test("--label is kept as given, as in every other eval, and checked before AKM or model setup", () => {
  expect(resultsLabel("0.10.261022-full", "fast/qwen3.6-35b-a3b")).toBe("0.10.261022-full");
  expect(resultsLabel("Run_A.1-b", "m")).toBe("Run_A.1-b");
  expect(resultsLabel(undefined, "fast/Qwen3.6-35B")).toBe("fast-qwen3-6-35b");
  const result = run("--label", "bad label");
  expect(result.code).toBe(2);
  expect(result.err).toContain("--label may use letters, digits, dot, dash and underscore");
  expect(result.err).not.toContain("ENOENT");
  expect(result.out).toBe("");
});

test("LongMemEval flags are checked before AKM or model setup: --split selects the cases, held-out is never a default", () => {
  const cases: [string[], string][] = [
    [["--haystack", "3"], "--haystack is for the LongMemEval cases: add --split dev"],
    [["--budgets", "256,1024"], "--budgets is for the LongMemEval cases: add --split dev"],
    [["--judge-model", "j"], "--judge-model is for the LongMemEval cases: add --split dev"],
    [["--split", "dev"], "--split needs --judge-model"],
    [["--split", "all", "--judge-model", "j"], '--split must be dev or heldout, not "all"'],
    [["--split", "heldout", "--judge-model", "j"], "held-out questions run on the rewrite, not the public data"],
    [["--split", "heldout", "--judge-model", "j", "--corpus", "all"], "held-out questions run on the rewrite, not the public data"],
    [["--split", "dev", "--judge-model", "j", "--budgets", "2048,8192"], "--budgets must include 4096, the primary comparison"],
    [["--split", "dev", "--judge-model", "j", "--budgets", "4096,4096"], "--budgets must be distinct positive integers"],
    [["--split", "dev", "--judge-model", "j", "--context-tokens", "512"], "--context-tokens is for the 24 public cases"],
    [["--split", "dev", "--judge-model", "j", "--haystack", "0"], "--haystack must be a positive integer"],
    [["--split", "heldout", "--judge-model", "j", "--cases", "/nonexistent-memory-utility-dir"], "needs longmemeval_s_cleaned.json in its folder"],
    [["--resume", "somewhere", "--repeat", "2"], "--resume carries on one run, so it does not go with --repeat"],
  ];
  for (const [args, error] of cases) {
    const result = run(...args);
    expect(result.code).toBe(2);
    expect(result.err).toContain(error);
    expect(result.err).not.toContain("ENOENT");
    expect(result.out).toBe("");
  }
});
