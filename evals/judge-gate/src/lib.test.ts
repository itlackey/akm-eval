import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultOverrides } from "../../../lib/akm/overrides.ts";
import { assemble, explode } from "./generate.ts";
import { type Case, type Row, STRATEGY, atLeast, configFor, errorRow, failureMessage, hasVerdict, hideEndpoint, hideEndpoints, hideInRow, judgeConfig, metrics, orderFeedback, parseCases, rowFromVerdict, selectCases } from "./lib.ts";

const make = (n: number, label: "good" | "bad", extra: Partial<Case> = {}): Case => ({
  id: `id-${label}-${n}`,
  kind: "reflect",
  set: "accepted-jul",
  label,
  labelReason: `reason ${n}`,
  ...(label === "bad" ? { severity: "harmful" as const } : {}),
  feedback: "",
  source: `source ${n}\n`,
  candidate: `candidate ${n}\n`,
  ...extra,
});

describe("parseCases", () => {
  test("reads JSONL and rejects a bad label", () => {
    const good = JSON.stringify(make(1, "good"));
    expect(parseCases(`${good}\n\n`)).toHaveLength(1);
    expect(() => parseCases(JSON.stringify({ ...make(1, "good"), label: "maybe" }))).toThrow('label "maybe"');
    expect(() => parseCases("not json")).toThrow("not valid JSON");
    expect(() => parseCases("\n")).toThrow("no cases");
  });

  test("a bad case needs a severity of churn or harmful, and a good case has none", () => {
    expect(parseCases(JSON.stringify(make(1, "bad", { severity: "churn" })))[0].severity).toBe("churn");
    expect(() => parseCases(JSON.stringify({ ...make(1, "bad"), severity: undefined }), "cases.jsonl")).toThrow('cases.jsonl:1 is a bad case with severity "undefined", expected churn or harmful');
    expect(() => parseCases(JSON.stringify({ ...make(1, "bad"), severity: "mild" }))).toThrow('severity "mild"');
    expect(() => parseCases(JSON.stringify(make(1, "good", { severity: "churn" })))).toThrow("only bad cases have one");
  });

  test("reads the public cases", () => {
    const cases = parseCases(readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl"), "utf8"));
    expect(cases).toHaveLength(106);
    expect(cases.filter((c) => c.label === "good")).toHaveLength(28);
  });
});

/** The words of a text without the provenance stamps akm adds (type, generated, verified), which are neither a fix nor churn. */
const wordsOf = (text: string): Set<string> => {
  const body = text.replace(/^generated:\n(  .*\n)+/m, "").replace(/^verified:\n(  .*\n?)+/m, "").replace(/^type: .*\n/m, "");
  return new Set(body.toLowerCase().match(/[a-z0-9][a-z0-9_.:/@~#<>=+-]*[a-z0-9]|[a-z0-9]/g) ?? []);
};

describe("the severity of the public bad cases", () => {
  const cases = parseCases(readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl"), "utf8"));
  const bad = cases.filter((c) => c.label === "bad");

  test("every bad case has one, and no good case does", () => {
    expect(bad).toHaveLength(78);
    for (const c of bad) expect(c.severity === "churn" || c.severity === "harmful").toBe(true);
    for (const c of cases.filter((x) => x.label === "good")) expect(c.severity).toBeUndefined();
  });

  test("11 are churn and 67 are harmful. Relabel a case and change these", () => {
    expect(bad.filter((c) => c.severity === "churn")).toHaveLength(11);
    expect(bad.filter((c) => c.severity === "harmful")).toHaveLength(67);
  });

  // A tripwire and no proof: a case moved to churn that adds a paragraph, or one moved to harmful that changes nothing, fails here.
  test("a churn case adds at most ten words the source lacks, and a harmful case changes at least one word", () => {
    for (const c of bad) {
      const [source, candidate] = [wordsOf(c.source), wordsOf(c.candidate)];
      const added = [...candidate].filter((w) => !source.has(w));
      const dropped = [...source].filter((w) => !candidate.has(w));
      if (c.severity === "churn") expect({ id: c.id, added: added.length <= 10 }).toEqual({ id: c.id, added: true });
      else expect({ id: c.id, changed: added.length + dropped.length > 0 }).toEqual({ id: c.id, changed: true });
    }
  });
});

describe("selectCases", () => {
  const cases = [...Array.from({ length: 28 }, (_, i) => make(i, "good")), ...Array.from({ length: 78 }, (_, i) => make(i, "bad"))];

  test("keeps the good/bad proportion and takes each kind in file order", () => {
    const picked = selectCases(cases, 3);
    expect(picked.map((c) => c.id)).toEqual(["id-good-0", "id-bad-0", "id-bad-1"]);
    expect(selectCases(cases, 10).filter((c) => c.label === "good")).toHaveLength(3);
  });

  test("a limit at or above the size runs everything", () => {
    expect(selectCases(cases, 106)).toHaveLength(106);
    expect(selectCases(cases)).toHaveLength(106);
  });
});

describe("orderFeedback", () => {
  test("puts negative lines first, so a mix is judged as negative feedback", () => {
    expect(orderFeedback("[positive] a\n[negative] b\n[positive] c")).toBe("[negative] b\n[positive] a\n[positive] c");
    expect(orderFeedback("[positive] a")).toBe("[positive] a");
    expect(orderFeedback("")).toBe("");
  });
});

describe("judgeConfig", () => {
  test("points the reflect quality gate at one LLM engine", () => {
    const c = judgeConfig("http://localhost:8080/v1/", "m", false) as any;
    expect(c.engines.judge.endpoint).toBe("http://localhost:8080/v1/chat/completions");
    expect(c.engines.judge.apiKey).toBeUndefined();
    expect(c.defaults.llmEngine).toBe("judge");
    expect(c.improve.strategies.default.processes.reflect.qualityGate.engine).toBe("judge");
  });

  test("names the key by environment variable and never holds it", () => {
    const c = judgeConfig("https://api.example.com/v1/chat/completions", "m", true) as any;
    expect(c.engines.judge.endpoint).toBe("https://api.example.com/v1/chat/completions");
    expect(c.engines.judge.apiKey).toBe("$MODEL_API_KEY");
  });

  test("asks for temperature 0 and no thinking, as distill and extract do", () => {
    const c = judgeConfig("http://localhost:8080/v1/", "m", false) as any;
    expect(c.engines.judge).toMatchObject({ temperature: 0, enableThinking: false });
  });

  test("is the config the eval writes, key order included", () => {
    const expected = {
      configVersion: "0.9.0",
      semanticSearchMode: "off",
      registries: [],
      engines: { judge: { kind: "llm", provider: "openai", endpoint: "http://localhost:8080/v1/chat/completions", model: "qwen3-27b", apiKey: "$MODEL_API_KEY", timeoutMs: 600_000, temperature: 0, enableThinking: false } },
      defaults: { llmEngine: "judge", improveStrategy: "default" },
      improve: { strategies: { default: { engine: "judge", processes: { reflect: { qualityGate: { engine: "judge" } } } } } },
    };
    expect(JSON.stringify(judgeConfig("http://localhost:8080/v1/", "qwen3-27b", true), null, 2)).toBe(JSON.stringify(expected, null, 2));
  });

  test("makes another strategy the default and keeps the gate's own", () => {
    const c = judgeConfig("http://localhost:8080/v1/", "m", false, "tight");
    expect(c.defaults.improveStrategy).toBe("tight");
    expect(Object.keys(c.improve.strategies)).toEqual([STRATEGY]);
  });
});

describe("configFor", () => {
  test("is judgeConfig when nothing is overridden", () => {
    expect(configFor("http://localhost:8080/v1/", "m", true, defaultOverrides(STRATEGY))).toEqual(judgeConfig("http://localhost:8080/v1/", "m", true));
  });

  test("--strategy makes that strategy the default of the config", () => {
    const c = configFor("http://localhost:8080/v1/", "m", true, { strategy: "tight", configPatch: null });
    expect(c.defaults.improveStrategy).toBe("tight");
  });

  test("--config-patch merges into the config after it, and can define the strategy that --strategy names", () => {
    const strategy = { engine: "judge", processes: { reflect: { qualityGate: { engine: "judge", minScore: 4 } } } };
    const patch = { path: "patches/p.json", sha256: "abc", patch: { engines: { judge: { temperature: 0.7 } }, improve: { strategies: { tight: strategy } } } };
    const c = configFor("http://localhost:8080/v1/", "m", true, { strategy: "tight", configPatch: patch });
    expect(c.engines.judge).toMatchObject({ temperature: 0.7, enableThinking: false, model: "m" });
    expect(c.improve.strategies.tight).toEqual(strategy);
    expect(c.improve.strategies.default.engine).toBe("judge");
    expect(c.defaults.improveStrategy).toBe("tight");
  });
});

describe("rowFromVerdict", () => {
  const c = make(1, "good");
  test("maps akm's verdict to an outcome", () => {
    expect(rowFromVerdict(c, { pass: true, score: 4.5, reason: "ok", criteria: { need: 5 }, engine: "judge" }, 1).outcome).toBe("pass");
    expect(rowFromVerdict(c, { pass: false, reviewNeeded: true, score: 3 }, 1).outcome).toBe("review");
    expect(rowFromVerdict(c, { pass: false, score: 1.5 }, 1).outcome).toBe("reject");
  });

  test("a bad row carries its case's severity, a good row has none", () => {
    expect(rowFromVerdict(make(1, "bad", { severity: "churn" }), { pass: true, score: 4 }, 1).severity).toBe("churn");
    expect(rowFromVerdict(c, { pass: true, score: 4 }, 1)).not.toHaveProperty("severity");
  });

  test("a score of -1 routed to review is a review that counts, whatever the reason says", () => {
    for (const reason of ["judge parse failed — routed to review", "judge timeout/error — routed to review", "judge could not read the model's reply", "judge unavailable", undefined]) {
      const row = rowFromVerdict(c, { pass: false, score: -1, reviewNeeded: true, reason }, 1);
      expect(row).toMatchObject({ outcome: "review", score: null, reason: reason ?? "" });
      expect(row.error).toBeUndefined();
      expect(hasVerdict(row)).toBe(false);
      expect(metrics([row]).good).toEqual({ n: 1, passed: 0, rate: 0 });
    }
  });

  test("a -1 that akm did not route to review, and a verdict with no pass and score, are errors", () => {
    expect(rowFromVerdict(c, { pass: false, score: -1, reason: "no engine configured — cannot judge, failing closed" }, 1)).toMatchObject({ outcome: "error", error: "no engine configured — cannot judge, failing closed" });
    expect(rowFromVerdict(c, { pass: false, score: -1 }, 1)).toMatchObject({ outcome: "error", error: "no verdict" });
    expect(rowFromVerdict(c, { nope: true }, 1).outcome).toBe("error");
    expect(rowFromVerdict(c, null, 1).outcome).toBe("error");
  });

  test("a judged review has a score, so it has a verdict", () => {
    expect(hasVerdict(rowFromVerdict(c, { pass: false, reviewNeeded: true, score: 3 }, 1))).toBe(true);
    expect(hasVerdict(errorRow(c, "x", 1))).toBe(false);
  });
});

describe("errorRow", () => {
  test("carries the severity, and says when akm was killed at its time limit", () => {
    const bad = make(1, "bad", { severity: "churn" });
    expect(errorRow(bad, "akm exited 70: boom", 2)).toMatchObject({ outcome: "error", severity: "churn", error: "akm exited 70: boom" });
    expect(errorRow(bad, "x", 2)).not.toHaveProperty("timed_out");
    expect(errorRow(bad, "akm exited 137: akm timed out after 900s", 900, true).timed_out).toBe(true);
  });
});

describe("hideEndpoint", () => {
  test("masks the model endpoint, with or without a trailing slash, wherever it is named", () => {
    expect(hideEndpoint("fetch http://host:8080/v1/chat/completions failed", "http://host:8080/v1")).toBe("fetch <MODEL_BASE_URL>/chat/completions failed");
    expect(hideEndpoint("a http://host:8080/v1 b http://host:8080/v1", "http://host:8080/v1/")).toBe("a <MODEL_BASE_URL> b <MODEL_BASE_URL>");
    expect(hideEndpoint("nothing to hide", "http://host:8080/v1")).toBe("nothing to hide");
  });

  test("leaves the text alone when there is no endpoint", () => {
    expect(hideEndpoint("abc", "")).toBe("abc");
    expect(hideEndpoint("abc", "///")).toBe("abc");
  });

  test("hideEndpoints writes every endpoint of a config as <MODEL_BASE_URL>, and changes nothing else or the config it was given", () => {
    const config = {
      defaults: { llmEngine: "judge" },
      engines: { judge: { kind: "llm", model: "m", endpoint: "https://user:pass@host.example/v1?key=SECRET/chat/completions", temperature: 0 }, other: { endpoint: "http://other:1/v1/chat/completions" } },
      embedding: { endpoint: "http://embed:2/v1" },
      list: [{ endpoint: "http://in-a-list/v1" }],
    };
    const before = JSON.stringify(config);
    const hidden = hideEndpoints(config);
    expect(hidden).toEqual({
      defaults: { llmEngine: "judge" },
      engines: { judge: { kind: "llm", model: "m", endpoint: "<MODEL_BASE_URL>", temperature: 0 }, other: { endpoint: "<MODEL_BASE_URL>" } },
      embedding: { endpoint: "<MODEL_BASE_URL>" },
      list: [{ endpoint: "<MODEL_BASE_URL>" }],
    });
    expect(JSON.stringify(hidden)).not.toContain("SECRET");
    expect(JSON.stringify(config)).toBe(before);
  });

  test("hideEndpoints leaves a config with no endpoint, and a value that is not a string, as it is", () => {
    expect(hideEndpoints({ engines: { a: { model: "m" } }, n: null, endpoint: 3 })).toEqual({ engines: { a: { model: "m" } }, n: null, endpoint: 3 });
    expect(hideEndpoints(null)).toBeNull();
  });

  test("hideInRow masks akm's reason and the error, and nothing else", () => {
    const row: Row = { ...errorRow(make(1, "good"), "akm exited 1: http://host/v1 down", 1), reason: "tried http://host/v1" };
    expect(hideInRow(row, "http://host/v1")).toMatchObject({ error: "akm exited 1: <MODEL_BASE_URL> down", reason: "tried <MODEL_BASE_URL>", id: "id-good-1" });
    const judged = rowFromVerdict(make(1, "good"), { pass: true, score: 4 }, 1);
    expect(hideInRow(judged, "http://host/v1")).toEqual(judged);
  });
});

describe("failureMessage", () => {
  test("reads the error akm prints as JSON on stderr", () => {
    expect(failureMessage(78, '{\n  "ok": false,\n  "error": "Required engine credential K is not set.",\n  "code": "INVALID_CONFIG_FILE"\n}\n', "")).toBe("akm exited 78: Required engine credential K is not set. (INVALID_CONFIG_FILE)");
    expect(failureMessage(70, '{"ok": false, "error": "JSON Parse error"}', "")).toBe("akm exited 70: JSON Parse error");
  });

  test("falls back to the last lines of what it printed", () => {
    expect(failureMessage(1, "a\nb\nc\nd", "")).toBe("akm exited 1: b | c | d");
    expect(failureMessage(1, "", "only stdout")).toBe("akm exited 1: only stdout");
  });

  test("says why a killed akm died", () => {
    expect(failureMessage(137, "akm timed out after 900s", "")).toBe("akm exited 137: akm timed out after 900s");
  });
});

describe("atLeast", () => {
  const min = "0.9.25-alpha.2";
  test("puts a prerelease below its release and orders prereleases by their tag", () => {
    for (const v of ["0.9.25-alpha.2", "0.9.25-alpha.3", "0.9.25-alpha.10", "0.9.25-beta.1", "0.9.25-rc.1", "0.9.25", "0.9.26", "0.10.0", "1.0.0-alpha.1"]) expect(atLeast(v, min)).toBe(true);
    for (const v of ["0.9.25-alpha.1", "0.9.25-alpha", "0.9.24", "0.9.24-rc.1", "0.8.99"]) expect(atLeast(v, min)).toBe(false);
    expect(atLeast("0.9.25-alpha.2", "0.9.25")).toBe(false);
    expect(atLeast("0.9.25", "0.9.25")).toBe(true);
  });

  test("refuses a string that is not a version", () => {
    expect(() => atLeast("latest", min)).toThrow("not a version");
  });
});

describe("metrics", () => {
  const row = (label: "good" | "bad", outcome: Row["outcome"], severity: "churn" | "harmful" = "harmful"): Row => ({ ...errorRow(make(1, label, label === "bad" ? { severity } : {}), "", 0), outcome });
  test("counts passes per label, precision and errors", () => {
    const m = metrics([row("good", "pass"), row("good", "review"), row("good", "error"), row("bad", "pass"), row("bad", "reject"), row("bad", "reject"), row("bad", "review")]);
    expect(m.good).toEqual({ n: 2, passed: 1, rate: 0.5 });
    expect(m.bad).toEqual({ n: 4, passed: 1, rate: 0.25 });
    expect(m.precision).toEqual({ value: 0.5, passed_good: 1, passed: 2 });
    expect(m.outcomes.good.error).toBe(1);
  });

  test("splits the bad revisions that churn from the ones that harm", () => {
    const m = metrics([
      row("bad", "pass", "churn"),
      row("bad", "pass", "churn"),
      row("bad", "reject", "churn"),
      row("bad", "review", "churn"),
      row("bad", "pass", "harmful"),
      row("bad", "reject", "harmful"),
      row("bad", "reject", "harmful"),
      row("bad", "error", "harmful"),
      row("good", "pass"),
    ]);
    expect(m.bad_churn).toEqual({ n: 4, passed: 2, rate: 0.5 });
    expect(m.bad_harmful).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    expect(m.bad).toEqual({ n: 7, passed: 3, rate: 0.4286 });
    expect(m.bad.passed).toBe(m.bad_churn.passed + m.bad_harmful.passed);
    expect(m.bad.n).toBe(m.bad_churn.n + m.bad_harmful.n);
  });

  test("a pass of a good case is in neither bad count", () => {
    const m = metrics([row("good", "pass")]);
    expect(m.bad_churn).toEqual({ n: 0, passed: 0, rate: null });
    expect(m.bad_harmful).toEqual({ n: 0, passed: 0, rate: null });
  });

  test("has no precision when nothing passed", () => {
    expect(metrics([row("good", "review")]).precision.value).toBeNull();
    expect(metrics([]).good.rate).toBeNull();
    expect(metrics([]).bad_harmful.rate).toBeNull();
  });
});

describe("explode and assemble", () => {
  test("give back the same cases when the rewrite changes nothing", () => {
    const cases = [
      make(1, "good", { feedback: "[negative] stale\n[positive] ok", source: "---\ndescription: a\n---\n# T\n\n- x  \n\ttabbed\n" }),
      make(2, "bad", { source: "no trailing newline", candidate: "", labelReason: "", severity: "churn" }),
    ];
    const dir = mkdtempSync(join(tmpdir(), "judge-gate-test-"));
    try {
      explode(cases, join(dir, "corpus"), join(dir, "labels"));
      cpSync(join(dir, "corpus"), join(dir, "corpus-out"), { recursive: true });
      cpSync(join(dir, "labels"), join(dir, "labels-out"), { recursive: true });
      expect(assemble(cases, join(dir, "corpus-out"), join(dir, "labels-out"))).toEqual(cases);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
