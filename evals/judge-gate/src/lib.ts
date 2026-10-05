// Pure helpers for the judge-gate eval: cases, selection, the akm engine config, metrics.
// run.ts uses them to run the eval and generate.ts to make the private cases.

export interface Case {
  id: string;
  kind: string;
  set: string;
  label: "good" | "bad";
  labelReason: string;
  feedback: string;
  source: string;
  candidate: string;
  canary?: string;
}

export type Outcome = "pass" | "review" | "reject" | "error";

export interface Row {
  id: string;
  set: string;
  label: "good" | "bad";
  outcome: Outcome;
  score: number | null;
  criteria: Record<string, number> | null;
  reason: string;
  engine: string | null;
  seconds: number;
  error?: string;
}

export function parseCases(text: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${where}:${i + 1} is not valid JSON`);
    }
    for (const key of ["id", "source", "candidate", "feedback"] as const) {
      if (typeof c[key] !== "string") throw new Error(`${where}:${i + 1} has no string "${key}"`);
    }
    if (c.label !== "good" && c.label !== "bad") throw new Error(`${where}:${i + 1} has label "${c.label}", expected good or bad`);
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases in the same good/bad
 * proportion as the whole set, each kind taken in file order, so a quick run still holds both.
 */
export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const good = cases.filter((c) => c.label === "good");
  const bad = cases.filter((c) => c.label === "bad");
  const goodQuota = Math.min(good.length, Math.round((limit * good.length) / cases.length));
  const badQuota = Math.min(bad.length, limit - goodQuota);
  const picked = new Set([...good.slice(0, goodQuota), ...bad.slice(0, badQuota)]);
  return cases.filter((c) => picked.has(c));
}

/**
 * `akm improve judge` reads the feedback as one string and judges it as negative feedback only when the
 * string starts with `[negative]`. Reflect passes one line per feedback event and asks whether any line is
 * negative. Putting the negative lines first makes the two agree.
 */
export function orderFeedback(feedback: string): string {
  const lines = feedback.split("\n").filter((l) => l.trim() !== "");
  const negative = lines.filter((l) => l.startsWith("[negative]"));
  const rest = lines.filter((l) => !l.startsWith("[negative]"));
  return [...negative, ...rest].join("\n");
}

/** The akm config the judge runs under: one LLM engine, named as reflect's quality gate engine. */
export function engineConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, unknown> {
  const base = baseUrl.replace(/\/+$/, "");
  const endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  return {
    configVersion: "0.9.0",
    semanticSearchMode: "off",
    registries: [],
    engines: {
      judge: {
        kind: "llm",
        provider: "openai",
        endpoint,
        model,
        ...(hasKey ? { apiKey: "$MODEL_API_KEY" } : {}),
        timeoutMs: 600_000,
      },
    },
    defaults: { llmEngine: "judge", improveStrategy: "default" },
    improve: { strategies: { default: { engine: "judge", processes: { reflect: { qualityGate: { engine: "judge" } } } } } },
  };
}

/** akm's `improve judge` verdict, as printed with --format json. */
export function rowFromVerdict(c: Case, verdict: unknown, seconds: number): Row {
  const v = (verdict ?? {}) as Record<string, unknown>;
  const base = { id: c.id, set: c.set, label: c.label, seconds };
  if (typeof v.pass !== "boolean" || typeof v.score !== "number") {
    return { ...base, outcome: "error", score: null, criteria: null, reason: "", engine: null, error: "the verdict has no pass and score" };
  }
  const reason = typeof v.reason === "string" ? v.reason : "";
  const criteria = v.criteria && typeof v.criteria === "object" ? (v.criteria as Record<string, number>) : null;
  const engine = typeof v.engine === "string" ? v.engine : null;
  if (v.score === -1) {
    // akm gives -1 when the judge gave no verdict. A reply it could not read, even after its one retry, is the
    // model's failure to follow the format, and akm routes it to review: it did not pass. A timeout or a
    // provider error says nothing about the model, so it is errored and left out of the counts.
    if (/parse failed/i.test(reason)) return { ...base, outcome: "review", score: null, criteria, reason, engine };
    return { ...base, outcome: "error", score: null, criteria, reason, engine, error: reason || "no verdict" };
  }
  const outcome: Outcome = v.pass ? "pass" : v.reviewNeeded ? "review" : "reject";
  return { ...base, outcome, score: v.score, criteria, reason, engine };
}

/** What akm said when it failed. It prints its error as a JSON object on stderr. */
export function failureMessage(code: number, stderr: string, stdout: string): string {
  const text = stderr.trim();
  try {
    const e = JSON.parse(text) as { error?: unknown; code?: unknown };
    if (typeof e.error === "string") return `akm exited ${code}: ${e.error}${typeof e.code === "string" ? ` (${e.code})` : ""}`.slice(0, 300);
  } catch {
    // not JSON: fall through to the last lines
  }
  return `akm exited ${code}: ${(text || stdout.trim()).split("\n").slice(-3).join(" | ")}`.slice(0, 300);
}

/** Is `version` at least `minimum`? Both are semver. A prerelease is below its release and ordered by its tag. */
export function atLeast(version: string, minimum: string): boolean {
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v);
    if (!m) throw new Error(`not a version: ${v}`);
    return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split(".") ?? [] };
  };
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === 0; // a release is above any of its prereleases
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const [x, y] = [a.pre[i], b.pre[i]];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) > Number(y);
    if (nx !== ny) return ny; // a number is below a word
    return x > y;
  }
  return true;
}

export function errorRow(c: Case, message: string, seconds: number): Row {
  return { id: c.id, set: c.set, label: c.label, outcome: "error", score: null, criteria: null, reason: "", engine: null, seconds, error: message };
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

export interface Metrics {
  good: { n: number; passed: number; rate: number | null };
  bad: { n: number; passed: number; rate: number | null };
  precision: { value: number | null; passed_good: number; passed: number };
  outcomes: Record<"good" | "bad", Record<Outcome, number>>;
}

/** The three numbers the eval reports, over the cases the judge gave a verdict on. */
export function metrics(rows: Row[]): Metrics {
  const outcomes = {
    good: { pass: 0, review: 0, reject: 0, error: 0 },
    bad: { pass: 0, review: 0, reject: 0, error: 0 },
  };
  for (const r of rows) outcomes[r.label][r.outcome]++;
  const scored = (label: "good" | "bad") => outcomes[label].pass + outcomes[label].review + outcomes[label].reject;
  const passedGood = outcomes.good.pass;
  const passedBad = outcomes.bad.pass;
  return {
    good: { n: scored("good"), passed: passedGood, rate: ratio(passedGood, scored("good")) },
    bad: { n: scored("bad"), passed: passedBad, rate: ratio(passedBad, scored("bad")) },
    precision: { value: ratio(passedGood, passedGood + passedBad), passed_good: passedGood, passed: passedGood + passedBad },
    outcomes,
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
