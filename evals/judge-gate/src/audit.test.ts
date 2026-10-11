import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ADJUDICATION, audit, bodyChange, churnTerms, disagrees, feedbackKind, format, readAdjudication } from "./audit.ts";
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

describe("churnTerms", () => {
  test("finds the words the rubric names as churn in a label reason", () => {
    expect(churnTerms("Adds a title plus a short intro")).toEqual(["intro"]);
    expect(churnTerms("The intro, headings and type: are churn")).toEqual(["churn", "intro", "headings"]);
    expect(churnTerms("Leaves redundancy: the old description is restated as Context")).toEqual(["restates"]);
    expect(churnTerms("Body identical apart from line unwrapping, and a table of contents")).toEqual(["table of contents", "reflow"]);
    expect(churnTerms("Wraps paths in backticks and the title is recased")).toEqual(["backticks", "recased"]);
    expect(churnTerms("Rewords the reworded prose only restates it")).toEqual(["restates", "reworded prose"]);
  });

  test("leaves a reason that names none alone, even when it says reworded of a field and not of prose", () => {
    expect(churnTerms("Description-only: repairs the sentence broken by a stray period; body untouched.")).toEqual([]);
    expect(churnTerms("Adds the title; when_to_use only trivially reworded.")).toEqual([]);
    expect(churnTerms("")).toEqual([]);
  });
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

describe("audit", () => {
  const cases: Case[] = [
    make(1, "good"),
    make(2, "good", { feedback: "[positive] ok" }),
    make(3, "good", { labelReason: "Adds the title plus a short intro.", candidate: page("d: a", "\n# T\n\nIntro.\n\nBody.\n"), feedback: "[negative] x" }),
    make(4, "good", { labelReason: "Fixes it.", source: page("d: a", "\nBody.\n"), candidate: page("d: a", "\nBody, reworded.\n") }),
    make(5, "bad", { set: "queue-10-01", feedback: "[positive] a\n[negative] b" }),
    make(6, "bad", { severity: "churn" }),
    make(7, "bad", { severity: "churn", feedback: "[positive] a" }),
  ];
  const a = audit(cases, 2);

  test("counts each label, the feedback it carries, the severity of the bad cases and the sets", () => {
    expect(a).toMatchObject({ rubric_version: 2, n_cases: 7, severity: { harmful: 1, churn: 2 } });
    expect(a.labels.good).toEqual({ n: 4, feedback: { none: 2, positive_only: 1, negative: 1 } });
    expect(a.labels.bad).toEqual({ n: 3, feedback: { none: 1, positive_only: 1, negative: 1 } });
    expect(a.sets).toEqual({ "accepted-jul": { good: 4, bad: 2 }, "queue-10-01": { good: 0, bad: 1 } });
  });

  test("counts what a judge that read only the feedback would pass", () => {
    expect(a.feedback_shortcuts.refuse_any_feedback).toEqual({ good_passed: 2, bad_passed: 1 });
    expect(a.feedback_shortcuts.refuse_negative_feedback).toEqual({ good_passed: 3, bad_passed: 2 });
  });

  test("names the good cases whose reason uses a churn word, and those whose candidate edits the body", () => {
    expect(a.reason_disagreements).toEqual([{ id: "id-good-3", terms: ["intro"] }]);
    expect(a.body_disagreements).toEqual(["id-good-3", "id-good-4"]);
    expect(a.good_body).toEqual({ unchanged: 2, title: 0, edited: 2 });
    expect(disagrees(a)).toBe(true);
  });

  test("finds nothing to disagree with in good cases that are clean, and says so in the text it prints", () => {
    const clean = audit(cases.slice(0, 2).concat(cases.slice(4)), 2);
    expect(disagrees(clean)).toBe(false);
    const text = format(clean);
    expect(text).toContain("judge-gate audit | rubric_version 2 | 5 cases");
    expect(text).toContain("label reason uses a churn word: 0");
    expect(text).toContain("candidate edits the body beyond a title: 0");
    expect(text).toContain("No ADJUDICATION.md beside the cases.");
    expect(format(a)).toContain("id-good-3: intro");
    expect(format(a)).toContain("id-good-4: body edited");
  });
});

describe("readAdjudication", () => {
  const id = (n: number) => `${String(n).repeat(8)}-aaaa-bbbb-cccc-${String(n).repeat(12)}`;
  const record = [
    "# Adjudication log",
    "## Relabelled in version 2",
    "| Case | Set | Was | Now | Why |",
    "|---|---|---|---|---|",
    `| \`${id(1)}\` | accepted-aug | good | bad, churn | Adds an intro. |`,
    "## Borderline, left as good",
    "| Case | Set | Why |",
    "|---|---|---|",
    `| \`${id(2)}\` | accepted-sep | The description is narrowed. |`,
    "## Notes",
    `| \`${id(3)}\` | not | a row of the record |`,
  ].join("\n");

  test("reads the cases of each section of the record, and ignores other tables", () => {
    expect(readAdjudication(record)).toEqual({
      changed: [{ id: id(1), cells: ["accepted-aug", "good", "bad, churn", "Adds an intro."] }],
      borderline: [{ id: id(2), set: "accepted-sep", why: "The description is narrowed." }],
    });
    expect(readAdjudication("# nothing")).toEqual({ changed: [], borderline: [] });
  });
});

describe("the public cases", () => {
  const cases = publicCases();
  const a = audit(cases, rubricVersion(ASSETS), readFileSync(join(ASSETS, ADJUDICATION), "utf8"));

  test("are under rubric version 2, with 11 good and 95 bad, 67 of them harmful and 28 churn", () => {
    expect(a).toMatchObject({ rubric_version: 2, n_cases: 106, severity: { harmful: 67, churn: 28 } });
    expect(a.labels.good.n).toBe(11);
    expect(a.labels.bad.n).toBe(95);
  });

  test("have the feedback the README states: 2 of the good and 38 of the bad, none of the good with a [negative] line", () => {
    expect(a.labels.good.feedback).toEqual({ none: 9, positive_only: 2, negative: 0 });
    expect(a.labels.bad.feedback).toEqual({ none: 57, positive_only: 23, negative: 15 });
    expect(a.feedback_shortcuts.refuse_any_feedback).toEqual({ good_passed: 9, bad_passed: 57 });
    expect(a.feedback_shortcuts.refuse_negative_feedback).toEqual({ good_passed: 11, bad_passed: 80 });
  });

  test("cover the sets the README says: no good case from night-10-01, queue-10-01 or orphans", () => {
    expect(a.sets).toEqual({
      "accepted-aug": { good: 4, bad: 27 },
      "accepted-jul": { good: 3, bad: 27 },
      "accepted-sep": { good: 4, bad: 27 },
      "night-10-01": { good: 0, bad: 5 },
      "orphans": { good: 0, bad: 4 },
      "queue-10-01": { good: 0, bad: 5 },
    });
  });

  test("have no good case that disagrees with the rubric: none uses a churn word, none edits the body beyond a title", () => {
    expect(a.reason_disagreements).toEqual([]);
    expect(a.body_disagreements).toEqual([]);
    expect(a.good_body).toEqual({ unchanged: 10, title: 1, edited: 0 });
    expect(disagrees(a)).toBe(false);
  });

  test("had 17 good cases that disagreed under version 1, and they are the 17 that were relabelled", () => {
    const marker = " Rubric 2:";
    const relabelled = cases.filter((c) => c.labelReason.includes(marker));
    expect(relabelled).toHaveLength(17);
    const undone = cases.map((c): Case => {
      if (!c.labelReason.includes(marker)) return c;
      const { severity: _severity, ...rest } = c;
      return { ...rest, label: "good", labelReason: c.labelReason.slice(0, c.labelReason.indexOf(marker)) };
    });
    const before = audit(undone, 1);
    expect(before.labels.good.n).toBe(28);
    expect(before.severity).toEqual({ harmful: 67, churn: 11 });
    expect(before.reason_disagreements).toHaveLength(10);
    expect(before.body_disagreements).toHaveLength(16);
    const found = new Set([...before.reason_disagreements.map((d) => d.id), ...before.body_disagreements]);
    expect([...found].sort()).toEqual(relabelled.map((c) => c.id).sort());
  });

  test("agree with ADJUDICATION.md: each case it says was relabelled is bad churn, and each one it calls borderline is good", () => {
    const record = a.adjudication;
    if (record === null) throw new Error("no record");
    const byId = new Map(cases.map((c) => [c.id, c]));
    expect(record.changed).toHaveLength(17);
    for (const { id, cells } of record.changed) {
      const c = byId.get(id);
      expect({ id, label: c?.label, severity: c?.severity, marked: c?.labelReason.includes(" Rubric 2: bad (churn), first labelled good.") }).toEqual({ id, label: "bad", severity: "churn", marked: true });
      expect(cells.slice(0, 3)).toEqual([c?.set ?? "", "good", "bad, churn"]);
    }
    expect(cases.filter((c) => c.labelReason.includes("Rubric 2:")).map((c) => c.id).sort()).toEqual(record.changed.map((x) => x.id).sort());
    expect(record.borderline).toHaveLength(7);
    for (const { id, set, why } of record.borderline) {
      expect({ id, label: byId.get(id)?.label, set: byId.get(id)?.set }).toEqual({ id, label: "good", set });
      expect(why.length).toBeGreaterThan(20);
    }
    expect(record.borderline.some((b) => record.changed.some((c) => c.id === b.id))).toBe(false);
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
    expect(out).toContain("judge-gate audit | rubric_version 2 | 106 cases");
    expect(out).toContain("label reason uses a churn word: 0");
    expect(out).toContain("candidate edits the body beyond a title: 0");
    expect(out).toContain("17 labels changed, 7 borderline cases left as they were");
  });

  test("prints JSON with --json", () => {
    const { code, out } = run("--json");
    expect(code).toBe(0);
    expect(JSON.parse(out)).toMatchObject({ rubric_version: 2, n_cases: 106, labels: { good: { n: 11 }, bad: { n: 95 } }, reason_disagreements: [], body_disagreements: [] });
  });

  test("exits 1 and names the case when a good case disagrees with the rubric", () => {
    const dir = mkdtempSync(join(tmpdir(), "judge-gate-audit-"));
    dirs.push(dir);
    mkdirSync(join(dir, "assets"));
    const flagged = make(1, "good", { labelReason: "Adds the title plus headings." });
    writeFileSync(join(dir, "assets", "cases.jsonl"), `${[flagged, make(2, "bad")].map((c) => JSON.stringify(c)).join("\n")}\n`);
    const { code, out } = run("--assets", join(dir, "assets"));
    expect(code).toBe(1);
    expect(out).toContain("label reason uses a churn word: 1");
    expect(out).toContain("id-good-1: headings");
  });

  test("rejects an option it does not have", () => {
    const { code, err } = run("--no-such-option");
    expect(code).toBe(2);
    expect(err).toContain("Usage: bun evals/judge-gate/src/audit.ts");
  });
});
