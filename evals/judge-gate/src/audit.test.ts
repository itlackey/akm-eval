import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ADJUDICATION, audit, bodyChange, disagrees, feedbackKind, format, otherFrontmatterChanges, readAdjudication } from "./audit.ts";
import { rubricVersion } from "./inputs.ts";
import { type Case, parseCases } from "./lib.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ASSETS = join(import.meta.dir, "..", "assets");
const publicCases = (): Case[] => parseCases(readFileSync(join(ASSETS, "cases.jsonl"), "utf8"));

const page = (frontmatter: string, body: string): string => `---\n${frontmatter}\n---\n${body}`;

const make = (n: number, label: "good" | "bad", over: Partial<Case> = {}): Case => ({
  id: `id-${label}-${n}`,
  kind: "reflect",
  set: "accepted-jul",
  label,
  labelReason: "Repairs the stray period in the description.",
  ...(label === "bad" ? { severity: "harmful" as const } : {}),
  feedback: "",
  source: page("description: a. b", "\nBody.\n"),
  candidate: page("description: a, b", "\nBody.\n"),
  ...over,
});

describe("feedbackKind", () => {
  test("is none, positive only, or negative as akm's judge reads it: any [negative] line", () => {
    expect(feedbackKind("")).toBe("none");
    expect(feedbackKind("\n  \n")).toBe("none");
    expect(feedbackKind("[positive] ok")).toBe("positive_only");
    expect(feedbackKind("[positive] ok\n[positive] fine")).toBe("positive_only");
    expect(feedbackKind("[negative] stale")).toBe("negative");
    expect(feedbackKind("[positive] ok\n[negative] stale")).toBe("negative");
  });
});

describe("bodyChange", () => {
  const body = "\n# Title\n\nOne sentence about `src/x.ts` and 30000 ms.\n\n## Steps\n\n1. Do it.\n";

  test("is unchanged when only the frontmatter changed, or the body only moved in whitespace", () => {
    expect(bodyChange(page("description: a. b", body), page("type: knowledge\ndescription: a, b\nwhen_to_use: now", body))).toBe("unchanged");
    expect(bodyChange(page("d: a", "\nOne long\nwrapped line.\n"), page("d: a", "\nOne long wrapped line.\n"))).toBe("unchanged");
  });

  test("is title when a first heading is all that was added", () => {
    expect(bodyChange(page("d: a", "\nOne sentence.\n"), page("d: a", "\n# A title\n\nOne sentence.\n"))).toBe("title");
  });

  test("is edited for an intro, a heading, a reworded sentence or a removed block", () => {
    const source = page("d: a", "\nOne sentence.\n\nSecond one.\n");
    expect(bodyChange(source, page("d: a", "\n# A title\n\nThis page restates it.\n\nOne sentence.\n\nSecond one.\n"))).toBe("edited");
    expect(bodyChange(source, page("d: a", "\nOne sentence.\n\n## More\n\nSecond one.\n"))).toBe("edited");
    expect(bodyChange(source, page("d: a", "\nOne sentence, e.g. this.\n\nSecond one.\n"))).toBe("edited");
    expect(bodyChange(source, page("d: a", "\nOne sentence.\n"))).toBe("edited");
  });
});

describe("otherFrontmatterChanges", () => {
  const source = page("type: skill\ndescription: a. b\nsources:\n  - one\nupdated: 2026-01-01", "\nBody.\n");
  test("is empty when only description, when_to_use and the title change", () => {
    expect(otherFrontmatterChanges(source, page("type: skill\ndescription: a, b\nsources:\n  - one\nupdated: 2026-01-01\nwhen_to_use: now", "\n# T\n\nBody.\n"))).toEqual([]);
  });
  test("names a stamp added, a field changed or a list item changed", () => {
    expect(otherFrontmatterChanges(source, page("type: skill\ndescription: a, b\nsources:\n  - one\nupdated: 2026-01-01\ngenerated:\n  by: akm", "\nBody.\n"))).toEqual(["generated"]);
    expect(otherFrontmatterChanges(source, page("type: skill\ndescription: a, b\nsources:\n  - two\nupdated: 2026-02-02", "\nBody.\n")).sort()).toEqual(["sources", "updated"]);
    expect(otherFrontmatterChanges(source, page("description: a, b\nsources:\n  - one\nupdated: 2026-01-01", "\nBody.\n"))).toEqual(["type"]);
  });
});

describe("audit", () => {
  const cases: Case[] = [
    make(1, "good"),
    make(2, "good", { feedback: "[positive] ok" }),
    make(3, "good", { feedback: "[negative] x" }),
    make(4, "bad", { set: "queue-10-01", feedback: "[positive] a\n[negative] b" }),
    make(5, "bad", { severity: "churn" }),
    make(6, "bad", { severity: "other", feedback: "[negative] y" }),
  ];
  const a = audit(cases, 3);

  test("counts each label, the feedback it carries, the severity and lane of the bad cases and the sets", () => {
    expect(a).toMatchObject({ rubric_version: 3, n_cases: 6, severity: { harmful: 1, churn: 1, other: 1 } });
    expect(a.labels.good).toEqual({ n: 3, feedback: { none: 1, positive_only: 1, negative: 1 } });
    expect(a.labels.bad).toEqual({ n: 3, feedback: { none: 1, positive_only: 0, negative: 2 } });
    expect(a.lanes).toEqual({ good: { negative: 1, maintenance: 2 }, harmful: { negative: 1, maintenance: 0 }, churn: { negative: 0, maintenance: 1 }, other: { negative: 1, maintenance: 0 } });
    expect(a.sets).toEqual({ "accepted-jul": { good: 3, bad: 2 }, "queue-10-01": { good: 0, bad: 1 } });
  });

  test("counts what a judge that read only the feedback would pass", () => {
    expect(a.feedback_shortcuts.refuse_any_feedback).toEqual({ good_passed: 1, bad_passed: 1 });
    expect(a.feedback_shortcuts.refuse_negative_feedback).toEqual({ good_passed: 2, bad_passed: 1 });
  });

  test("names the cases whose candidate edits the body, which reflect cannot do", () => {
    expect(disagrees(a)).toBe(false);
    const edited = audit([...cases, make(7, "good", { candidate: page("d: a", "\n# T\n\nIntro.\n\nBody.\n") })], 3);
    expect(edited.body_edits).toEqual(["id-good-7"]);
    expect(disagrees(edited)).toBe(true);
    expect(format(edited)).toContain("id-good-7: body edited");
    const stamped = audit([...cases, make(8, "good", { candidate: page("description: a, b\ngenerated:\n  by: akm", "\nBody.\n") })], 3);
    expect(stamped.frontmatter_edits).toEqual([{ id: "id-good-8", keys: ["generated"] }]);
    expect(disagrees(stamped)).toBe(true);
    expect(format(stamped)).toContain("id-good-8: generated");
  });

  test("says in the text it prints what it found", () => {
    const text = format(a);
    expect(text).toContain("judge-gate audit | rubric_version 3 | 6 cases");
    expect(text).toContain("bad by severity: 1 harmful, 1 churn, 1 other");
    expect(text).toContain("candidate edits the body beyond an added title: 0");
    expect(text).toContain("No ADJUDICATION.md beside the cases.");
  });
});

describe("readAdjudication", () => {
  const record = [
    "# Adjudication log",
    "## Relabelled in version 3",
    "| Case | Set | Was | Now | Why |",
    "|---|---|---|---|---|",
    "| `1ae76bf3-2a2c` | accepted-sep | good | bad, harmful | Drops a fact. |",
    "## Borderline calls",
    "| Case | Set | Why |",
    "|---|---|---|",
    "| `rf-x-1` | reflect-run | The description is narrowed. |",
    "## Notes",
    "| `hw-y-3` | not | a row of the record |",
  ].join("\n");

  test("reads the cases of each section of the record, and ignores other tables", () => {
    expect(readAdjudication(record)).toEqual({
      changed: [{ id: "1ae76bf3-2a2c", cells: ["accepted-sep", "good", "bad, harmful", "Drops a fact."] }],
      borderline: [{ id: "rf-x-1", set: "reflect-run", why: "The description is narrowed." }],
    });
    expect(readAdjudication("# nothing")).toEqual({ changed: [], borderline: [] });
  });
});

describe("the public cases", () => {
  const cases = publicCases();
  const negative = (rows: Case[]) => rows.filter((c) => c.feedback.split("\n").some((l) => l.startsWith("[negative]"))).length;
  const of = (f: (c: Case) => boolean) => cases.filter(f);

  test("are under rubric version 3, with 64 good and 89 bad: 64 harmful, 21 churn and 4 other", () => {
    expect(rubricVersion(ASSETS)).toBe(3);
    expect(cases).toHaveLength(153);
    expect(new Set(cases.map((c) => c.id)).size).toBe(153);
    expect(of((c) => c.label === "good")).toHaveLength(64);
    expect(of((c) => c.severity === "harmful")).toHaveLength(64);
    expect(of((c) => c.severity === "churn")).toHaveLength(21);
    expect(of((c) => c.severity === "other")).toHaveLength(4);
  });

  test("meet the targets of #179: 40 harmful, 20 churn and 40 good, and at least half of each label with a [negative] line", () => {
    for (const [rows, least] of [[of((c) => c.severity === "harmful"), 40], [of((c) => c.severity === "churn"), 20], [of((c) => c.label === "good"), 40]] as [Case[], number][]) {
      expect(rows.length).toBeGreaterThanOrEqual(least);
      expect(negative(rows) * 2).toBeGreaterThanOrEqual(rows.length);
    }
  });

  test("hold nothing reflect cannot write: no candidate edits the body beyond an added title, and every case has a ref and a reason", () => {
    expect(audit(cases, 3).body_edits).toEqual([]);
    expect(audit(cases, 3).frontmatter_edits).toEqual([]);
    for (const c of cases) {
      expect(c.ref).toMatch(/^[\w.-]+(\/[\w.-]+)+$/);
      expect(c.labelReason.length).toBeGreaterThan(20);
    }
  });

  test("agree with ADJUDICATION.md: each case it says was relabelled has the label it gives", () => {
    const record = readAdjudication(readFileSync(join(ASSETS, ADJUDICATION), "utf8"));
    expect(record.changed.length).toBe(7);
    for (const { id, cells } of record.changed) {
      const c = cases.find((x) => x.id.startsWith(id));
      expect(c, id).toBeDefined();
      expect(cells[2], id).toBe(c?.label === "good" ? "good" : `bad, ${c?.severity}`);
    }
    for (const { id } of record.borderline) expect(cases.some((x) => x.id.startsWith(id)), id).toBe(true);
  });

  test("do not hold the 101 retired cases, which are kept in retired.jsonl", () => {
    const retired = readFileSync(join(ASSETS, "retired.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id as string);
    expect(retired).toHaveLength(101);
    const ids = new Set(cases.map((c) => c.id));
    expect(retired.filter((id) => ids.has(id))).toEqual([]);
  });
});

describe("the command", () => {
  const run = (...args: string[]) => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "audit.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  test("prints the audit of the public cases and exits 0", () => {
    const { code, out } = run();
    expect(code).toBe(0);
    expect(out).toContain("judge-gate audit | rubric_version 3 | 153 cases");
    expect(out).toContain("candidate edits the body beyond an added title: 0");
    expect(out).toContain("7 labels changed");
  });

  test("prints JSON with --json", () => {
    const { code, out } = run("--json");
    expect(code).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ rubric_version: 3, n_cases: 153, labels: { good: { n: 64 }, bad: { n: 89 } }, body_edits: [], frontmatter_edits: [] });
  });

  test("exits 1 and names the case when a candidate edits the body", () => {
    const dir = mkdtempSync(join(tmpdir(), "judge-gate-audit-"));
    dirs.push(dir);
    mkdirSync(join(dir, "assets"));
    const flagged = make(1, "good", { candidate: page("d: a", "\n# T\n\nIntro.\n\nBody.\n") });
    writeFileSync(join(dir, "assets", "cases.jsonl"), `${[flagged, make(2, "bad")].map((c) => JSON.stringify(c)).join("\n")}\n`);
    const { code, out } = run("--assets", join(dir, "assets"));
    expect(code).toBe(1);
    expect(out).toContain("candidate edits the body beyond an added title: 1");
    expect(out).toContain("id-good-1: body edited");
  });

  test("rejects an option it does not have", () => {
    const { code, err } = run("--no-such-option");
    expect(code).toBe(2);
    expect(err).toContain("Usage: bun evals/judge-gate/src/audit.ts");
  });
});
