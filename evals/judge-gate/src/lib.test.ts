import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble, explode } from "./generate.ts";
import { type Case, type Row, atLeast, engineConfig, errorRow, failureMessage, metrics, orderFeedback, parseCases, rowFromVerdict, selectCases } from "./lib.ts";

const make = (n: number, label: "good" | "bad", extra: Partial<Case> = {}): Case => ({
  id: `id-${label}-${n}`,
  kind: "reflect",
  set: "accepted-jul",
  label,
  labelReason: `reason ${n}`,
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

  test("reads the public cases", () => {
    const cases = parseCases(readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl"), "utf8"));
    expect(cases).toHaveLength(106);
    expect(cases.filter((c) => c.label === "good")).toHaveLength(28);
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

describe("engineConfig", () => {
  test("points the reflect quality gate at one LLM engine", () => {
    const c = engineConfig("http://localhost:8080/v1/", "m", false) as any;
    expect(c.engines.judge.endpoint).toBe("http://localhost:8080/v1/chat/completions");
    expect(c.engines.judge.apiKey).toBeUndefined();
    expect(c.improve.strategies.default.processes.reflect.qualityGate.engine).toBe("judge");
  });

  test("names the key by environment variable and never holds it", () => {
    const c = engineConfig("https://api.example.com/v1/chat/completions", "m", true) as any;
    expect(c.engines.judge.endpoint).toBe("https://api.example.com/v1/chat/completions");
    expect(c.engines.judge.apiKey).toBe("$MODEL_API_KEY");
  });
});

describe("rowFromVerdict", () => {
  const c = make(1, "good");
  test("maps akm's verdict to an outcome", () => {
    expect(rowFromVerdict(c, { pass: true, score: 4.5, reason: "ok", criteria: { need: 5 }, engine: "judge" }, 1).outcome).toBe("pass");
    expect(rowFromVerdict(c, { pass: false, reviewNeeded: true, score: 3 }, 1).outcome).toBe("review");
    expect(rowFromVerdict(c, { pass: false, score: 1.5 }, 1).outcome).toBe("reject");
  });

  test("a timeout or an unreadable verdict is an error, not a rejection", () => {
    expect(rowFromVerdict(c, { pass: false, score: -1, reviewNeeded: true, reason: "judge timeout/error — routed to review" }, 1)).toMatchObject({ outcome: "error", error: "judge timeout/error — routed to review" });
    expect(rowFromVerdict(c, { pass: false, score: -1, reason: "no engine configured — cannot judge, failing closed" }, 1).outcome).toBe("error");
    expect(rowFromVerdict(c, { nope: true }, 1).outcome).toBe("error");
    expect(rowFromVerdict(c, null, 1).outcome).toBe("error");
  });

  test("a reply akm could not read is the model's failure: it goes to review and is counted", () => {
    const row = rowFromVerdict(c, { pass: false, score: -1, reviewNeeded: true, reason: "judge parse failed — routed to review" }, 1);
    expect(row).toMatchObject({ outcome: "review", score: null });
    expect(row.error).toBeUndefined();
    expect(metrics([row]).good).toEqual({ n: 1, passed: 0, rate: 0 });
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
  const row = (label: "good" | "bad", outcome: Row["outcome"]): Row => ({ ...errorRow(make(1, label), "", 0), outcome });
  test("counts passes per label, precision and errors", () => {
    const m = metrics([row("good", "pass"), row("good", "review"), row("good", "error"), row("bad", "pass"), row("bad", "reject"), row("bad", "reject"), row("bad", "review")]);
    expect(m.good).toEqual({ n: 2, passed: 1, rate: 0.5 });
    expect(m.bad).toEqual({ n: 4, passed: 1, rate: 0.25 });
    expect(m.precision).toEqual({ value: 0.5, passed_good: 1, passed: 2 });
    expect(m.outcomes.good.error).toBe(1);
  });

  test("has no precision when nothing passed", () => {
    expect(metrics([row("good", "review")]).precision.value).toBeNull();
    expect(metrics([]).good.rate).toBeNull();
  });
});

describe("explode and assemble", () => {
  test("give back the same cases when the rewrite changes nothing", () => {
    const cases = [
      make(1, "good", { feedback: "[negative] stale\n[positive] ok", source: "---\ndescription: a\n---\n# T\n\n- x  \n\ttabbed\n" }),
      make(2, "bad", { source: "no trailing newline", candidate: "", labelReason: "" }),
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
