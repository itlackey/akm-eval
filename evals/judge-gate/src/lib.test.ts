import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultOverrides } from "../../../lib/akm/overrides.ts";
import { assemble, explode } from "./generate.ts";
import { type Case, type Row, STRATEGY, configFor, errorRow, hasVerdict, judgeConfig, metrics, orderFeedback, parseCases, rowFromVerdict, selectCases, verdictOf } from "./lib.ts";

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
    expect(cases).toHaveLength(135);
    expect(cases.filter((c) => c.label === "good")).toHaveLength(40);
  });
});

/** A text without the provenance stamps akm adds (type, generated, verified), which are neither a fix nor churn, and without the when_to_use key that a fix may add. */
const withoutStamps = (text: string): string => text.replace(/^generated:\n(  .*\n)+/m, "").replace(/^verified:\n(  .*\n?)+/m, "").replace(/^type: .*\n/m, "").replace(/^when_to_use:/m, "");

const wordsOf = (text: string): Set<string> => new Set(withoutStamps(text).toLowerCase().match(/[a-z0-9][a-z0-9_.:/@~#<>=+-]*[a-z0-9]|[a-z0-9]/g) ?? []);

/** The facts of a text that are easy to check: its words with a digit, an underscore, an @, a ~ or a # in them, a leading --, camelCase, or a path (a slash with a dot or a leading ~ . /), trimmed of the markup around them. */
const factsOf = (text: string): Set<string> => {
  const found = new Set<string>();
  for (const word of withoutStamps(text).split(/\s+/)) {
    const fact = word.replace(/^[`*"'.,;:()[\]{}<>|\\]+|[`*"'.,;:()[\]{}<>|\\]+$/g, "");
    if (fact.length >= 3 && /[a-z0-9]/i.test(fact) && (/[0-9_@~#]/.test(fact) || fact.startsWith("--") || /[a-z][A-Z]/.test(fact) || (fact.includes("/") && (fact.includes(".") || /^[~./]/.test(fact))))) found.add(fact);
  }
  return found;
};

/** What a churn revision breaks: the facts of its source that its candidate lacks, and the numbers its candidate has that its source lacks. */
const churnProblems = (c: { source: string; candidate: string }): { lost: string[]; added: string[] } => {
  const [source, candidate] = [withoutStamps(c.source), withoutStamps(c.candidate)];
  return {
    lost: [...factsOf(source)].filter((fact) => !candidate.includes(fact)),
    added: [...factsOf(candidate)].filter((fact) => /[0-9]/.test(fact) && !source.includes(fact)),
  };
};

describe("the churn tripwire", () => {
  test("lets an intro and headings pass, and sees a dropped path or version and an added number", () => {
    const source = "---\ndescription: d\n---\nRun `scripts/run.sh --root` on v1.2.3 with maxRetries 5.\n";
    const intro = "---\ntype: knowledge\ndescription: d\nwhen_to_use: now\n---\n\n# Title\n\nThis restates the page.\n\n## Steps\n\nRun `scripts/run.sh --root` on v1.2.3 with maxRetries 5.\n";
    expect(churnProblems({ source, candidate: intro })).toEqual({ lost: [], added: [] });
    expect(churnProblems({ source, candidate: intro.replace("scripts/run.sh", "run.sh") }).lost).toEqual(["scripts/run.sh"]);
    expect(churnProblems({ source, candidate: intro.replace("v1.2.3", "v1.2") }).lost).toEqual(["v1.2.3"]);
    expect(churnProblems({ source, candidate: `${intro}Needs v2.0.0.\n` }).added).toEqual(["v2.0.0"]);
  });
});

describe("the severity of the public bad cases", () => {
  const cases = parseCases(readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl"), "utf8"));
  const bad = cases.filter((c) => c.label === "bad");

  test("every bad case has one, and no good case does", () => {
    expect(bad).toHaveLength(95);
    for (const c of bad) expect(c.severity === "churn" || c.severity === "harmful").toBe(true);
    for (const c of cases.filter((x) => x.label === "good")) expect(c.severity).toBeUndefined();
  });

  test("28 are churn and 67 are harmful. Relabel a case and change these", () => {
    expect(bad.filter((c) => c.severity === "churn")).toHaveLength(28);
    expect(bad.filter((c) => c.severity === "harmful")).toHaveLength(67);
  });

  // A tripwire and no proof. Churn is the form changing with every fact kept, and an intro or a heading may repeat a fact but not make one: a case
  // moved to churn that drops a path, a version or an identifier of its source, or brings a number it lacks, fails here.
  test("a churn case keeps every checkable fact of its source and adds no number to it", () => {
    for (const c of bad.filter((x) => x.severity === "churn")) expect({ id: c.id, ...churnProblems(c) }).toEqual({ id: c.id, lost: [], added: [] });
  });

  test("a harmful case changes at least one word", () => {
    for (const c of bad.filter((x) => x.severity === "harmful")) {
      const [source, candidate] = [wordsOf(c.source), wordsOf(c.candidate)];
      const changed = [...candidate].filter((w) => !source.has(w)).length + [...source].filter((w) => !candidate.has(w)).length;
      expect({ id: c.id, changed: changed > 0 }).toEqual({ id: c.id, changed: true });
    }
  });
});

describe("selectCases", () => {
  const cases = [...Array.from({ length: 11 }, (_, i) => make(i, "good")), ...Array.from({ length: 95 }, (_, i) => make(i, "bad"))];

  test("keeps the good/bad proportion and takes each kind in file order", () => {
    const picked = selectCases(cases, 3);
    expect(picked.map((c) => c.id)).toEqual(["id-good-0", "id-bad-0", "id-bad-1"]);
    expect(selectCases(cases, 10).filter((c) => c.label === "good")).toHaveLength(1);
    expect(selectCases(cases, 20).filter((c) => c.label === "good")).toHaveLength(2);
  });

  test("a small limit still holds a good case and a bad one, though good cases are a tenth of the set", () => {
    for (const limit of [2, 3, 4, 5]) {
      const picked = selectCases(cases, limit);
      expect(picked).toHaveLength(limit);
      expect(picked.some((c) => c.label === "good")).toBe(true);
      expect(picked.some((c) => c.label === "bad")).toBe(true);
    }
    expect(selectCases(cases, 1)).toHaveLength(1);
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

  test("gives the engine the provider kind it is asked for, and openai without one: the rest of the config does not change with it", () => {
    const plain = judgeConfig("http://localhost:8080/v1/", "m", true) as any;
    expect(plain.engines.judge.provider).toBe("openai");
    const other = judgeConfig("http://localhost:8080/v1/", "m", true, STRATEGY, "anthropic") as any;
    expect(other.engines.judge.provider).toBe("anthropic");
    expect({ ...other, engines: { judge: { ...other.engines.judge, provider: "openai" } } }).toEqual(plain);
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

  test("takes the provider kind of the engine last, and the config patch can still change it", () => {
    expect(configFor("http://localhost:8080/v1/", "m", true, defaultOverrides(STRATEGY), "groq").engines.judge.provider).toBe("groq");
    const patch = { path: "patches/p.json", sha256: "abc", patch: { engines: { judge: { provider: "ollama" } } } };
    expect(configFor("http://localhost:8080/v1/", "m", true, { strategy: STRATEGY, configPatch: patch }, "groq").engines.judge.provider).toBe("ollama");
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

describe("verdictOf", () => {
  test("keeps the fields the scorer reads, masks the endpoint in the reason, and leaves a reply that is not an object as it is", () => {
    const parsed = { ok: true, pass: false, score: 2, reviewNeeded: true, reason: "tried http://host/v1 and failed", criteria: { need: 2 }, engine: "judge", usage: { note: "http://host/v1" } };
    expect(verdictOf(parsed, "http://host/v1")).toEqual({ pass: false, score: 2, reviewNeeded: true, reason: "tried <MODEL_BASE_URL> and failed", criteria: { need: 2 }, engine: "judge" });
    expect(verdictOf({ pass: true, score: 4 }, "http://host/v1")).toEqual({ pass: true, score: 4, reviewNeeded: undefined, reason: undefined, criteria: undefined, engine: undefined });
    for (const reply of [null, 7, "text", [1, 2]]) expect(verdictOf(reply, "http://host/v1")).toBe(reply);
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
