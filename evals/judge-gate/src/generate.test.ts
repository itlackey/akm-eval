import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRewrite, changedLines, generate, quotedFacts } from "./generate.ts";
import { CASES, GENERATED, casesSha256 } from "./inputs.ts";
import { type Case, parseCases } from "./lib.ts";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "judge-gate-generate-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const make = (n: number, over: Partial<Case> = {}): Case => ({
  id: `id-${n}`,
  kind: "reflect",
  set: "accepted-jul",
  label: "bad",
  labelReason: `reason ${n}`,
  severity: "harmful",
  feedback: "[negative] stale\n[positive] fine",
  source: "---\ndescription: a\n---\n\nline one\nline two\nline three\n",
  candidate: "---\ndescription: b\n---\n\nline one\nline 2\nline three\n",
  canary: "canary",
  ...over,
});

describe("changedLines", () => {
  test("counts the lines of each text that the other does not have", () => {
    expect(changedLines("a\nb\nc", "a\nb\nc")).toBe(0);
    expect(changedLines("a\nb\nc", "a\nB\nc")).toBe(2);
    expect(changedLines("a\nb\nc", "a\nb\nc\nd\ne")).toBe(2);
    expect(changedLines("a\nb\nc", "a\nc")).toBe(1);
    expect(changedLines("", "a")).toBe(2);
  });
});

describe("quotedFacts", () => {
  test("reads single, double and backtick quotes in order, and skips an apostrophe inside a word", () => {
    expect(quotedFacts(`Drops 'during accept' and "Always" from the source's \`state.db\` line; the issue's 'a' stays.`)).toEqual(["during accept", "Always", "state.db"]);
    expect(quotedFacts("only 'the issue's' softened to 'a'.")).toEqual(["the issue's"]);
    expect(quotedFacts("no quotes here, it doesn't have any")).toEqual([]);
  });
});

describe("checkRewrite", () => {
  const same = (cases: Case[]) => cases.map((c) => ({ ...c, id: `new-${c.id}` }));

  test("accepts a rewrite that renames and keeps the shape", () => {
    const before = [make(1, { labelReason: "Drops 'line two' and keeps src/core/paths.ts, 30000 ms.", source: "x src/core/paths.ts\nline two 30000 ms\n", candidate: "x src/core/paths.ts\nline 2 30000 ms\n" })];
    const after = [{ ...before[0], id: "q", labelReason: "Drops 'zine two' and keeps src/core/zaths.ts, 47123 ms.", source: "x src/core/zaths.ts\nzine two 47123 ms\n", candidate: "x src/core/zaths.ts\nzine 2 47123 ms\n" }];
    expect(checkRewrite(before, after)).toEqual([]);
  });

  test("finds a case that came back with another label, severity, set, kind or canary", () => {
    const before = [make(1)];
    for (const [key, value] of [["label", "good"], ["severity", "churn"], ["set", "orphans"], ["kind", "x"], ["canary", "other"]] as const) {
      expect(checkRewrite(before, same([{ ...before[0], [key]: value }])).join("\n")).toContain(`its ${key} came back as "${value}"`);
    }
  });

  test("finds a missing case and an id that is empty or taken", () => {
    expect(checkRewrite([make(1), make(2)], [make(1)])).toEqual(["1 cases were written, and there are 2"]);
    expect(checkRewrite([make(1), make(2)], [make(1), { ...make(2), id: "id-1" }]).join("\n")).toContain('its id "id-1" is empty or taken');
    expect(checkRewrite([make(1)], [{ ...make(1), id: " " }]).join("\n")).toContain("is empty or taken");
  });

  test("finds a text that gained or lost a line, and a feedback that lost its negative line", () => {
    const before = [make(1)];
    const problems = checkRewrite(before, same([{ ...before[0], source: `${before[0].source}extra\n`, candidate: "", feedback: "[positive] fine\n[positive] stale" }])).join("\n");
    expect(problems).toContain("its source has 9 lines, and the public one has 8");
    expect(problems).toContain("its candidate has 1 lines, and the public one has 8");
    expect(problems).toContain("its feedback has 0 negative lines, and the public one has 1");
  });

  test("finds a diff that changed size even when the line counts did not", () => {
    const before = [make(1)];
    const same3 = { ...before[0], candidate: before[0].source };
    const problems = checkRewrite(before, same([same3]));
    expect(problems.join("\n")).toContain("its source and candidate differ in 0 lines, and the public ones in 4");
    const bigger = { ...before[0], candidate: "---\ndescription: c\n---\n\nline 1\nline 2\nline 3\n" };
    expect(checkRewrite(before, same([bigger])).join("\n")).toContain("differ in 8 lines, and the public ones in 4");
  });

  test("finds a quoted fact that the revision no longer holds", () => {
    const before = [make(1, { labelReason: "Drops 'during accept' from the description.", source: "x during accept y\n", candidate: "x y\n" })];
    const lost = [{ ...before[0], id: "q", labelReason: "Drops 'during accept' from the description.", source: "x during allow y\n", candidate: "x y\n" }];
    expect(checkRewrite(before, lost).join("\n")).toContain('the fact "during accept" that its reason names (it was "during accept") is no longer in its texts');
    const renamedTogether = [{ ...before[0], id: "q", labelReason: "Drops 'during allow' from the description.", source: "x during allow y\n", candidate: "x y\n" }];
    expect(checkRewrite(before, renamedTogether)).toEqual([]);
  });

  test("finds a number, a path or an identifier that the reason names and the texts lost", () => {
    const before = [make(1, { labelReason: "Keeps src/core/paths.ts, TEST_ISOLATION_MISSING and 30000 ms.", source: "src/core/paths.ts TEST_ISOLATION_MISSING 30000 ms\n", candidate: "src/core/paths.ts TEST_ISOLATION_MISSING 30000 ms\nmore\n" })];
    const after = [{ ...before[0], id: "q", labelReason: "Keeps src/core/paths.ts, TEST_ISOLATION_MISSING and 47123 ms.", source: "src/core/paths.ts TEST_ISOLATION_MISSING 30000 ms\n", candidate: "src/core/paths.ts TEST_ISOLATION_MISSING 30000 ms\nmore\n" }];
    expect(checkRewrite(before, after).join("\n")).toContain('the fact "47123" that its reason names (it was "30000") is no longer in its texts');
  });

  test("asks nothing of a fact that the texts never held", () => {
    const before = [make(1, { labelReason: "Quotes 'a gloss' and 30000 ms that are not in the texts." })];
    const after = [{ ...before[0], id: "q", labelReason: "Quotes 'a glorp' and 47123 ms that are not in the texts." }];
    expect(checkRewrite(before, after)).toEqual([]);
  });

  test("finds a reason that quotes a different number of facts or has a different number of words", () => {
    const before = [make(1, { labelReason: "Drops 'a b' and 'c d' here." })];
    expect(checkRewrite(before, [{ ...before[0], id: "q", labelReason: "Drops 'a b' and c d here." }]).join("\n")).toContain("its reason quotes 1 facts, and the public one's quotes 2");
    expect(checkRewrite(before, [{ ...before[0], id: "q", labelReason: "Drops 'a b' and 'c d'." }]).join("\n")).toContain("its reason has 6 words, and the public one's has 7");
  });
});

describe("generate", () => {
  /** Public cases in a folder of their own. */
  const publicAssets = (cases: Case[]): string => {
    const dir = join(tmp(), "assets");
    mkdirSync(dir);
    writeFileSync(join(dir, CASES), `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`);
    return dir;
  };

  /** A rewrite that changes nothing, and writes the map it is given. `edit` may then change a case's file. */
  const copying = (calls: string[][] = [], edit?: (out: string) => void) => (args: string[]): string => {
    calls.push(args);
    const [from, to] = args.slice(-2);
    cpSync(from, to, { recursive: true });
    const map = args[args.indexOf("--map") + 1];
    if (!existsSync(map)) writeFileSync(map, "{}");
    edit?.(to);
    return "summary line one\nsummary line two";
  };

  const cases = [make(1), make(2, { label: "good", severity: undefined, labelReason: "Fixes the description." }), make(3, { severity: "churn" })];

  test("writes the private cases, the map and generated.json, and nothing else", () => {
    const out = tmp();
    const pub = publicAssets(cases);
    const made = generate({ seed: "7", out, publicAssets: pub, rewrite: copying() });
    expect(made).toEqual({ count: 3, problems: [], summary: "summary line two" });
    expect(readdirSync(out).sort()).toEqual(["assets", "map.json"]);
    expect(readdirSync(join(out, "assets")).sort()).toEqual([GENERATED, CASES].sort());
    expect(parseCases(readFileSync(join(out, "assets", CASES), "utf8")).map((c) => c.severity)).toEqual(["harmful", undefined, "churn"]);
    expect(JSON.parse(readFileSync(join(out, "assets", GENERATED), "utf8"))).toEqual({ seed: "7", inputs_sha256: casesSha256(pub), rewrite: "lib/rewrite" });
  });

  test("rewrites the corpus with the seed, then the labels with the same map and --min-count 1000000", () => {
    const calls: string[][] = [];
    generate({ seed: "7", out: tmp(), publicAssets: publicAssets(cases), rewrite: copying(calls) });
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 3)).toEqual(["--seed", "7", "--map"]);
    expect(calls[0]).not.toContain("--min-count");
    expect(calls[1][0]).toBe("--map");
    expect(calls[1].slice(2, 4)).toEqual(["--min-count", "1000000"]);
    expect(calls[1][1]).toBe(calls[0][3]);
  });

  test("a rewrite that breaks a check writes nothing, and leaves the cases and the map of the run before", () => {
    const out = tmp();
    mkdirSync(join(out, "assets"));
    writeFileSync(join(out, "assets", CASES), "old cases\n");
    writeFileSync(join(out, "map.json"), "old map");
    const dropsALine = copying([], (to) => {
      if (to.endsWith("corpus-out")) writeFileSync(join(to, "0001", "candidate.md"), "gone\n");
    });
    const made = generate({ seed: "7", out, publicAssets: publicAssets(cases), rewrite: dropsALine });
    expect(made.count).toBe(0);
    expect(made.problems.join("\n")).toContain("id-1: its candidate has 2 lines, and the public one has 8");
    expect(readFileSync(join(out, "assets", CASES), "utf8")).toBe("old cases\n");
    expect(readFileSync(join(out, "map.json"), "utf8")).toBe("old map");
    expect(readdirSync(out).sort()).toEqual(["assets", "map.json"]);
  });

  test("a rewrite that fails throws, and leaves the cases and the map of the run before", () => {
    const out = tmp();
    mkdirSync(join(out, "assets"));
    writeFileSync(join(out, "assets", CASES), "old cases\n");
    writeFileSync(join(out, "map.json"), "old map");
    const dies = () => {
      throw new Error("lib/rewrite failed: boom");
    };
    expect(() => generate({ seed: "7", out, publicAssets: publicAssets(cases), rewrite: dies })).toThrow("lib/rewrite failed: boom");
    expect(readFileSync(join(out, "assets", CASES), "utf8")).toBe("old cases\n");
    expect(readFileSync(join(out, "map.json"), "utf8")).toBe("old map");
    expect(readdirSync(out).sort()).toEqual(["assets", "map.json"]);
  });

  test("a success replaces the cases and the map of the run before", () => {
    const out = tmp();
    mkdirSync(join(out, "assets"));
    writeFileSync(join(out, "assets", "stale.txt"), "stale");
    writeFileSync(join(out, "map.json"), "old map");
    generate({ seed: "7", out, publicAssets: publicAssets(cases), rewrite: copying() });
    expect(existsSync(join(out, "assets", "stale.txt"))).toBe(false);
    expect(readFileSync(join(out, "map.json"), "utf8")).toBe("{}");
  });

  test("makes the same cases from the same seed, with the real rewrite", () => {
    const pub = publicAssets([
      make(1, { source: "---\ndescription: Citty resolves 30000 subcommands\n---\n\nCitty tags 8080 pages.\n", candidate: "---\ndescription: Citty resolves 30000 subcommands.\n---\n\nCitty tags 8080 pages.\n\nSee Citty.\n", labelReason: "Adds a line about 'Citty' and keeps 30000." }),
      make(2, { label: "good", severity: undefined, labelReason: "Fixes the description." }),
    ]);
    const [a, b] = [tmp(), tmp()];
    const first = generate({ seed: "7", out: a, publicAssets: pub });
    const second = generate({ seed: "7", out: b, publicAssets: pub });
    expect(first.problems).toEqual([]);
    expect(first.count).toBe(2);
    expect(readFileSync(join(a, "assets", CASES), "utf8")).toBe(readFileSync(join(b, "assets", CASES), "utf8"));
    expect(second.count).toBe(2);
    expect(parseCases(readFileSync(join(a, "assets", CASES), "utf8")).map((c) => c.label)).toEqual(["bad", "good"]);
    expect(JSON.parse(readFileSync(join(a, "assets", GENERATED), "utf8")).seed).toBe("7");
  });

  test("the real rewrite on the real public cases keeps every check", () => {
    const out = tmp();
    const made = generate({ seed: "20261011", out });
    expect(made.problems).toEqual([]);
    expect(made.count).toBe(106);
    const rewritten = parseCases(readFileSync(join(out, "assets", CASES), "utf8"));
    expect(rewritten.filter((c) => c.label === "good")).toHaveLength(11);
    expect(rewritten.filter((c) => c.severity === "churn")).toHaveLength(28);
    expect(rewritten.filter((c) => c.severity === "harmful")).toHaveLength(67);
  });
});
