import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCases } from "./build.ts";
import {
  CLASSES,
  type Case,
  type CaseClass,
  type Defect,
  type Row,
  akmProblems,
  allowOf,
  atLeast,
  caseProblems,
  cleanProblems,
  fixOf,
  hasCopiedFrontmatter,
  inject,
  makeRow,
  metrics,
  parseCases,
  reflectConfig,
  reflectOutcome,
  refOf,
  score,
  selectCases,
  servedModel,
  splitFrontmatter,
} from "./lib.ts";

const EVAL_DIR = join(import.meta.dir, "..");
const LIBRARY = join(EVAL_DIR, "..", "..", "corpus", "library");

/** A clean note: akm names nothing in it, and each injection fits it. */
const NOTE = `---
name: key-rotation
type: knowledge
description: Explains how to rotate the signing keys of the example service without downtime and how to verify the new key.
when_to_use: Use when a signing key is about to expire or may have leaked.
updated: 2026-01-02
---

# Key rotation

Rotate the keys in staging first, then promote the change to production.

## Steps

1. Create the new key.
2. Deploy it next to the old one.
3. Remove the old key after a day.
`;

/** A case for a class, with the expectations the class gives it. */
function mk(cls: CaseClass, source: string, extra: Partial<Case> = {}): Case {
  const fix = fixOf(cls);
  return { id: `${cls}-01`, class: cls, path: "knowledge/key-rotation.md", source, feedback: "It is wrong.", defect: "d", correct: "c", ...(fix ? { fix } : {}), allow: allowOf(cls), ...extra };
}

const describeNote = (description: string) => NOTE.replace(/^description:.*$/m, `description: ${description}`);

describe("akmProblems", () => {
  test("names nothing in a clean note, or in a note with no frontmatter", () => {
    expect(akmProblems(NOTE)).toEqual([]);
    expect(akmProblems("# Just a body\n\nNo frontmatter.\n")).toEqual([]);
  });

  test("names a description split by a stray period, but not after e.g. or etc.", () => {
    expect(akmProblems(describeNote("Explains how to rotate the keys by running.\n  the rotation script and checking the result."))).toEqual(["description-period"]);
    expect(akmProblems(describeNote("Explains the checks, e.g. lint and tests, that run before a release is cut."))).toEqual([]);
    expect(akmProblems(describeNote("Explains the checks (lint, tests, etc. and more) that run before a release is cut."))).toEqual([]);
  });

  test("names a description with an escaped quote", () => {
    expect(akmProblems(describeNote('Explains how to rotate the \\"signing keys\\" of the example service safely.'))).toEqual(["description-quote"]);
  });

  test("names a cut-off description: a hanging word, a trailing mark or an ellipsis", () => {
    for (const end of ["and", "the", "to", "with", "keys,", "keys;", "keys:", "keys...", "keys…"]) {
      expect(akmProblems(describeNote(`Explains how to rotate the signing ${end}`))).toEqual(["description-truncated"]);
    }
    expect(akmProblems(describeNote("Explains how to rotate the signing keys."))).toEqual([]);
  });

  test("names a missing or empty description, and a missing when_to_use or title", () => {
    expect(akmProblems(NOTE.replace(/^description:.*\n/m, ""))).toEqual(["description-missing"]);
    expect(akmProblems(describeNote('""'))).toEqual(["description-missing"]);
    expect(akmProblems(NOTE.replace(/^when_to_use:.*\n/m, ""))).toEqual(["when-to-use-missing"]);
    expect(akmProblems(NOTE.replace("# Key rotation\n\n", ""))).toEqual(["title-missing"]);
  });

  test("a title key or a heading is a title", () => {
    expect(akmProblems(NOTE.replace("# Key rotation\n\n", "").replace("name: key-rotation", "title: Key rotation"))).toEqual([]);
  });

  test("a when_to_use that runs over several lines counts", () => {
    expect(akmProblems(NOTE.replace(/^when_to_use:.*$/m, "when_to_use: Use when a signing key is\n  about to expire or may have leaked."))).toEqual([]);
  });
});

describe("hasCopiedFrontmatter", () => {
  test("finds a second frontmatter block and a body line that restates a field", () => {
    expect(hasCopiedFrontmatter(NOTE)).toBe(false);
    const block = NOTE.slice(0, NOTE.indexOf("\n# Key rotation"));
    expect(hasCopiedFrontmatter(`${block}\n${block}\n# Key rotation\n`)).toBe(true);
    expect(hasCopiedFrontmatter(NOTE.replace("# Key rotation", "# Key rotation\n\n**description:** Rotates keys."))).toBe(true);
  });
});

describe("cleanProblems", () => {
  test("a clean note has none, and each fault is named", () => {
    expect(cleanProblems(NOTE)).toEqual([]);
    expect(cleanProblems(NOTE.replace(/^when_to_use:.*\n/m, ""))).toContain("when-to-use-missing");
    expect(cleanProblems(describeNote("Too short."))).toEqual(["description 10 characters, akm wants 20 to 400"]);
    expect(cleanProblems(NOTE.replace(/^when_to_use:.*$/m, "when_to_use: Use when a key is going to expire soon.\ntags: [a"))).toContain("frontmatter does not parse");
  });
});

describe("inject", () => {
  const classes: Defect[] = ["description-period", "description-quote", "description-truncated", "description-missing", "when-to-use-missing", "title-missing"];

  test.each(classes)("%s: akm names that defect and nothing else, and the clean note is the fix", (cls) => {
    const source = inject(cls, NOTE) as string;
    expect(source).toBeString();
    expect(source).not.toBe(NOTE);
    expect(akmProblems(source)).toEqual([cls]);
    // Only the frontmatter changes, and for a missing title, the heading.
    if (cls !== "title-missing") expect(splitFrontmatter(source).body).toBe(splitFrontmatter(NOTE).body);
  });

  test("a stray period lands at a line wrap and every word stays", () => {
    const fm = splitFrontmatter(inject("description-period", NOTE) as string).fm as string;
    expect(fm).toMatch(/^description: .*\w\.\n {2}[a-z]/m);
    const words = (s: string) => s.replace(/[.\n]/g, " ").split(/\s+/).filter(Boolean);
    expect(words(fm.match(/^description:(.*\n {2}.*)$/m)?.[1] ?? "")).toEqual(words(NOTE.match(/^description:(.*)$/m)?.[1] ?? ""));
  });

  test("a truncated description ends on a hanging word and keeps the start", () => {
    const description = (inject("description-truncated", NOTE) as string).match(/^description: (.*)$/m)?.[1] ?? "";
    expect(description.length).toBeLessThan((NOTE.match(/^description: (.*)$/m)?.[1] ?? "").length);
    expect(description).toMatch(/ (and|the|of|to|how|without)$/);
    expect(NOTE).toContain(description);
  });

  test("a missing title takes the heading and the title key away", () => {
    const source = inject("title-missing", NOTE.replace("name: key-rotation", "name: key-rotation\ntitle: Key rotation")) as string;
    expect(source).not.toContain("title:");
    expect(source).not.toContain("# Key rotation");
  });

  test("a copied frontmatter block sits at the top of the body and akm names no field problem", () => {
    const source = inject("body-defect", NOTE) as string;
    expect(hasCopiedFrontmatter(source)).toBe(true);
    expect(akmProblems(source)).toEqual([]);
    expect(source.endsWith(splitFrontmatter(NOTE).body)).toBe(true);
  });

  test("a class with no defect gives the clean note back", () => {
    for (const cls of ["retrieval-miss", "unsupported-ask", "historical"] as const) expect(inject(cls, NOTE)).toBe(NOTE);
  });

  test("a note that is not clean, or cannot take the defect, gives nothing", () => {
    expect(inject("description-period", NOTE.replace(/^when_to_use:.*\n/m, ""))).toBeUndefined();
    expect(inject("description-period", describeNote('"Explains how to rotate the signing keys of the example service without downtime."'))).toBeUndefined();
    expect(inject("description-missing", describeNote('"Explains how to rotate the signing keys of the example service without downtime."'))).toBeString();
    expect(inject("title-missing", NOTE.replace("2. Deploy", "# a shell comment\n2. Deploy"))).toBeUndefined();
    expect(inject("description-period", describeNote("Rotates keys safely."))).toBeUndefined();
  });
});

describe("the public cases", () => {
  const cases = parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8"));

  test("are the ones build.ts makes from corpus/library, so the file is not out of date", () => {
    expect(cases).toEqual(buildCases());
  });

  test("have fifty notes, and the mix of defects and controls", () => {
    expect(cases).toHaveLength(50);
    const count = (cls: CaseClass) => cases.filter((c) => c.class === cls).length;
    expect(Object.fromEntries(CLASSES.map((c) => [c, count(c)]))).toEqual({
      "description-period": 6,
      "description-quote": 5,
      "description-truncated": 5,
      "description-missing": 5,
      "when-to-use-missing": 6,
      "title-missing": 5,
      "retrieval-miss": 5,
      "unsupported-ask": 5,
      historical: 5,
      "body-defect": 3,
    });
  });

  test("each hold the defect it names, and akm names only that one", () => {
    for (const c of cases) expect(caseProblems(c)).toEqual([]);
  });

  test("each note is a library note with the defect injected, and no two cases use the same note", () => {
    expect(new Set(cases.map((c) => c.path)).size).toBe(cases.length);
    for (const c of cases) {
      const clean = readFileSync(join(LIBRARY, c.path), "utf8");
      expect(cleanProblems(clean)).toEqual([]);
      expect(inject(c.class, clean)).toBe(c.source);
    }
  });

  test("have unique ids, a feedback line that is no flag, and the canary", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(c.feedback).not.toStartWith("-");
      expect(c.feedback.trim()).not.toBe("");
      expect(c.canary).toStartWith("REFLECT CANARY: do not train on this data");
      expect(c.source).not.toContain("\r");
    }
  });

  test("come round by round: the first ten hold each class once, and the first five mix defects and controls", () => {
    for (const round of [0, 1, 2]) expect(new Set(cases.slice(round * 10, round * 10 + 10).map((c) => c.class)).size).toBe(10);
    expect(selectCases(cases, 5).map((c) => c.class)).toEqual(["description-period", "retrieval-miss", "when-to-use-missing", "historical", "title-missing"]);
  });

  test("hold no private detail", () => {
    const private_ = /\/home\/|192\.168\.|\.lan\b|\bsplinter\b|\brocksteady\b|\bkrang\b|itlackey|founder3|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/i;
    for (const c of cases) expect(`${c.source}\n${c.feedback}`.match(private_)?.[0]).toBeUndefined();
  });

  test("a case whose note is wrong for its class is a problem", () => {
    const [first] = cases as [Case];
    expect(caseProblems({ ...first, source: NOTE })).toEqual(["akm names nothing, not description-period"]);
    const ask = cases.find((c) => c.class === "unsupported-ask") as Case;
    const said = (ask.source.match(/^name: (\S+)/m) as RegExpMatchArray)[1] as string;
    expect(caseProblems({ ...ask, forbid: [said] })).toEqual([`the note already says "${said}"`]);
    const old = cases.find((c) => c.class === "historical") as Case;
    expect(caseProblems({ ...old, anchors: ["v99.9"] })).toEqual(['the note does not record "v99.9"']);
    expect(caseProblems({ ...first, allow: [] })).toEqual(["allow is [], expected [description]"]);
  });
});

describe("score", () => {
  const defect = (cls: CaseClass) => mk(cls, inject(cls, NOTE) as string);
  const all = (checks: object) => Object.values(checks).every(Boolean);

  test.each(["description-period", "description-quote", "description-truncated", "description-missing", "when-to-use-missing", "title-missing"] as const)("%s: the clean note is a correct fix", (cls) => {
    const scored = score(defect(cls), NOTE);
    expect(scored.checks).toMatchObject({ body_kept: true, defect_fixed: true, no_extra_change: true, no_invented: true });
    expect(all(scored.checks)).toBe(true);
    expect(scored.changed).toEqual([fixOf(cls) as string]);
  });

  test("no proposal leaves the defect, and nothing else changes", () => {
    const scored = score(defect("when-to-use-missing"), undefined);
    expect(scored.checks).toEqual({ body_kept: true, no_extra_change: true, no_invented: true, defect_fixed: false });
    expect(scored.changed).toEqual([]);
  });

  test("a repair that drops a word of the description does not fix it", () => {
    const c = defect("description-period");
    const dropped = (c.source as string).replace(".\n  ", " ").replace(" the example", "");
    expect(score(c, dropped).checks.defect_fixed).toBe(false);
    expect(score(c, c.source).checks.defect_fixed).toBe(false); // still split
  });

  test("a description with its escaped quotes still in it is not fixed", () => {
    const c = defect("description-quote");
    expect(score(c, c.source.replace(/\\"/g, "")).checks.defect_fixed).toBe(true);
    expect(score(c, c.source).checks.defect_fixed).toBe(false);
  });

  test("a cut-off description is fixed by trimming the hanging words or by finishing the sentence from the note", () => {
    const c = defect("description-truncated");
    const cut = c.source.match(/^description: (.*)$/m)?.[1] ?? "";
    const trimmed = c.source.replace(cut, `${cut.replace(/ (\w+)$/, "")}.`);
    expect(score(c, trimmed).checks.defect_fixed).toBe(true);
    expect(score(c, c.source.replace(cut, `${cut} the new key in staging.`)).checks).toMatchObject({ defect_fixed: true, no_invented: true });
    expect(score(c, c.source).checks.defect_fixed).toBe(false);
  });

  test("a cut-off description may be reworded, but it keeps the names and numbers it had", () => {
    const source = NOTE.replace(/^description:.*$/m, "description: Generates TTRPG lore for the v2.1 tool including locations, creatures and history in a");
    const c = mk("description-truncated", source);
    const fixed = (d: string) => score(c, source.replace(/^description:.*$/m, `description: ${d}`)).checks;
    expect(fixed("Generates TTRPG lore for the v2.1 tool, such as locations, creatures and history.").defect_fixed).toBe(true); // reworded
    expect(fixed("Writes lore for TTRPG settings and the v2.1 tool.").defect_fixed).toBe(true); // reworded more
    expect(fixed("Generates TTRPG lore for the tool, with locations, creatures and history.").defect_fixed).toBe(false); // lost v2.1
    expect(fixed("Generates lore for the v2.1 tool, with locations, creatures and history.").defect_fixed).toBe(false); // lost TTRPG
  });

  test("a name may be joined another way: GO/FIX/NO-GO as a list", () => {
    const source = NOTE.replace(/^description:.*$/m, "description: Run the pipeline with explicit GO/FIX/NO-GO gates and");
    const c = mk("description-truncated", source);
    const fixed = (d: string) => score(c, source.replace(/^description:.*$/m, `description: ${d}`)).checks.defect_fixed;
    expect(fixed("Run the pipeline with explicit GO, FIX, and NO\u2011GO gates and one report.")).toBe(true);
    expect(fixed("Run the pipeline with explicit pass and fail gates and one report.")).toBe(false);
  });

  test("a hyphen of any kind is a hyphen: a non-breaking one does not make a word the note lacks", () => {
    const note = NOTE.replace("Rotate the keys", "Gate each run on GO/FIX/NO-GO. Rotate the keys");
    const c = mk("when-to-use-missing", inject("when-to-use-missing", note) as string);
    const withWhen = (w: string) => c.source.replace("updated:", `when_to_use: ${w}\nupdated:`);
    expect(score(c, withWhen("Use when you need a GO/FIX/NO\u2011GO verdict on a key.")).checks.no_invented).toBe(true);
    expect(score(c, withWhen("Use when you need a GO/FIX/NO-GO verdict on a key.")).checks.no_invented).toBe(true);
    expect(score(c, withWhen("Use when you need a GO/FIX/NO\u2011STOP verdict on a key.")).checks.no_invented).toBe(false);
  });

  test("a missing description needs one the model wrote: akm's own fallback from the heading does not count", () => {
    const c = defect("description-missing");
    const withDescription = (d: string) => c.source.replace("name: key-rotation", `name: key-rotation\ndescription: ${d}`);
    expect(score(c, withDescription("Explains how to rotate signing keys without downtime.")).checks.defect_fixed).toBe(true);
    expect(score(c, withDescription("Reference notes on Key rotation.")).checks.defect_fixed).toBe(false);
    expect(score(c, withDescription("Rotate keys.")).checks.defect_fixed).toBe(false); // too short for akm
    expect(score(c, withDescription("Explains how to rotate the keys and")).checks.defect_fixed).toBe(false); // cut off
  });

  test("a missing when_to_use needs a real one, not the circular fallback or a copy of the description", () => {
    const c = defect("when-to-use-missing");
    const withWhen = (w: string) => c.source.replace("updated:", `when_to_use: ${w}\nupdated:`);
    expect(score(c, withWhen("Use when a key has to be replaced.")).checks.defect_fixed).toBe(true);
    expect(score(c, withWhen("When working with key-rotation")).checks.defect_fixed).toBe(false);
    expect(score(c, withWhen("Explains how to rotate the signing keys of the example service without downtime and how to verify the new key.")).checks.defect_fixed).toBe(false);
    expect(score(c, withWhen("Use it.")).checks.defect_fixed).toBe(false);
  });

  test("a missing title is fixed by the one heading akm adds, and by nothing that changes the body in another way", () => {
    const c = defect("title-missing");
    const heading = NOTE; // the clean note holds the heading akm adds
    expect(score(c, heading).checks).toMatchObject({ body_kept: true, defect_fixed: true });
    expect(score(c, heading.replace("Rotate the keys", "Rotate all keys")).checks.body_kept).toBe(false);
    expect(score(c, `${c.source}\n## Extra\n`).checks.body_kept).toBe(false);
    expect(score(c, c.source).checks.defect_fixed).toBe(false);
  });

  test("a field outside the fix that changes is churn, and a body edit is counted", () => {
    const c = defect("when-to-use-missing");
    const churn = c.source.replace("updated:", "when_to_use: Use when a key has to be replaced.\nupdated:").replace(/^description:.*$/m, "description: Rewrites how signing keys are rotated and when.");
    const scored = score(c, churn);
    expect(scored.checks).toMatchObject({ defect_fixed: true, no_extra_change: false, body_kept: true });
    expect(scored.changed.sort()).toEqual(["description", "when_to_use"]);
    expect(score(c, `${NOTE}\nAn added paragraph.\n`).checks.body_kept).toBe(false);
  });

  test("a type line akm adds is neither a fix nor churn", () => {
    const c = mk("retrieval-miss", NOTE.replace("type: knowledge\n", ""));
    expect(score(c, `${c.source.replace("updated:", "type: knowledge\nupdated:")}`)).toMatchObject({ changed: [], checks: { no_extra_change: true } });
  });

  test("an invented name or number in a new field is caught, a hyphenated word that is in the note is not", () => {
    const c = defect("when-to-use-missing");
    const withWhen = (w: string) => c.source.replace("updated:", `when_to_use: ${w}\nupdated:`);
    expect(score(c, withWhen("Use when you run key rotation on AWS.")).checks.no_invented).toBe(false);
    expect(score(c, withWhen("Use when you rotate keys every 90 days.")).checks.no_invented).toBe(false);
    expect(score(c, withWhen("Use when a signing-key expires or leaks.")).checks.no_invented).toBe(true);
  });

  test("a frontmatter that does not parse changes everything and fixes nothing", () => {
    const c = defect("when-to-use-missing");
    const broken = c.source.replace("updated: 2026-01-02", "updated: [2026\nwhen_to_use: x");
    expect(score(c, broken)).toMatchObject({ changed: ["frontmatter"], checks: { no_extra_change: false, defect_fixed: false } });
  });

  describe("controls", () => {
    test("retrieval-miss: nothing may change", () => {
      const c = mk("retrieval-miss", NOTE);
      expect(all(score(c, undefined).checks)).toBe(true);
      expect(score(c, NOTE.replace("Use when a signing key", "Use when any key")).checks.no_extra_change).toBe(false);
    });

    test("unsupported-ask: a changed field may not carry the term, and any change is churn", () => {
      const c = mk("unsupported-ask", NOTE, { forbid: ["windows"] });
      expect(all(score(c, undefined).checks)).toBe(true);
      const said = score(c, NOTE.replace("Use when a signing key is", "Use on Windows when a signing key is"));
      expect(said.checks).toMatchObject({ no_invented: false, no_extra_change: false });
      expect(score(c, NOTE.replace("Use when a signing key is", "Use when any signing key is")).checks).toMatchObject({ no_invented: true, no_extra_change: false });
    });

    test("historical: a when_to_use may stay, name the version or date, or say the note is historical, but not offer it for current work", () => {
      const note = NOTE.replace("Create the new key.", "Create the new key (valid for v2.1 of the service, as of 2025-11-08).");
      const c = mk("historical", note, { anchors: ["v2.1", "2025-11-08"] });
      const when = (w: string) => score(c, note.replace(/^when_to_use:.*$/m, `when_to_use: ${w}`)).checks;
      expect(score(c, undefined).checks.not_current).toBe(true);
      expect(when("Use when working with the v2.1 service and a signing key is about to expire.").not_current).toBe(true);
      expect(when("Use for the key rotation as of November 2025.").not_current).toBe(true);
      expect(when("Use for the key rotation as of 2025-11.").not_current).toBe(true);
      expect(when("Use as a historical reference when a signing key expired.").not_current).toBe(true);
      expect(when("Use when a signing key is about to expire in the current service.").not_current).toBe(false);
      expect(when("Use when a signing key is about to expire in the current service.").no_extra_change).toBe(true);
    });

    test("historical: no other field may change", () => {
      const c = mk("historical", NOTE, { anchors: ["2026-01-02"] });
      expect(score(c, NOTE.replace(/^description:.*$/m, "description: This is a historical note about rotating signing keys.")).checks.no_extra_change).toBe(false);
    });

    test("body-defect: no field changes, and a patch that adds one is churn", () => {
      const c = mk("body-defect", inject("body-defect", NOTE) as string);
      expect(all(score(c, undefined).checks)).toBe(true);
      expect(score(c, c.source.replace("updated:", "when_to_use: Use when keys change.\nupdated:")).checks.no_extra_change).toBe(false);
    });
  });
});

describe("makeRow", () => {
  const c = mk("retrieval-miss", NOTE);

  test("a note left alone, or a proposal that passes every check, is correct", () => {
    expect(makeRow(c, { outcome: "none", seconds: 1 })).toMatchObject({ outcome: "none", correct: true, changed: [] });
    const fix = mk("when-to-use-missing", inject("when-to-use-missing", NOTE) as string);
    expect(makeRow(fix, { outcome: "proposal", proposal: NOTE, seconds: 1 })).toMatchObject({ correct: true, changed: ["when_to_use"], values: { when_to_use: "Use when a signing key is about to expire or may have leaked." } });
  });

  test("keeps the proposal's text, so a result can be scored again, and nothing else", () => {
    const fix = mk("when-to-use-missing", inject("when-to-use-missing", NOTE) as string);
    expect(makeRow(fix, { outcome: "proposal", proposal: NOTE, seconds: 1 }).proposal).toBe(NOTE);
    expect(makeRow(c, { outcome: "none", seconds: 1 }).proposal).toBeUndefined();
    expect(makeRow(c, { outcome: "refused", seconds: 1 }).proposal).toBeUndefined();
  });

  test("a reply akm could not use, or an edit its own filter refused, is never correct", () => {
    expect(makeRow(c, { outcome: "unusable", reason: "parse_error", seconds: 1 })).toMatchObject({ correct: false, outcome: "unusable" });
    expect(makeRow(c, { outcome: "refused", reason: "quality_rejected", seconds: 1 })).toMatchObject({ correct: false });
  });

  test("an error has no verdict and keeps its message", () => {
    expect(makeRow(c, { outcome: "error", reason: "HTTP 500", seconds: 2 })).toMatchObject({ correct: null, checks: null, error: "HTTP 500" });
  });
});

describe("metrics", () => {
  const rows: Row[] = [
    makeRow(mk("when-to-use-missing", inject("when-to-use-missing", NOTE) as string), { outcome: "proposal", proposal: NOTE, seconds: 1 }),
    makeRow(mk("when-to-use-missing", inject("when-to-use-missing", NOTE) as string), { outcome: "none", seconds: 1 }),
    makeRow(mk("title-missing", inject("title-missing", NOTE) as string), { outcome: "proposal", proposal: NOTE, seconds: 1 }),
    makeRow(mk("retrieval-miss", NOTE), { outcome: "none", seconds: 1 }),
    makeRow(mk("retrieval-miss", NOTE), { outcome: "proposal", proposal: `${NOTE}\nMore.\n`, seconds: 1 }),
    makeRow(mk("unsupported-ask", NOTE, { forbid: ["x"] }), { outcome: "unusable", seconds: 1 }),
    makeRow(mk("historical", NOTE, { anchors: ["2026-01-02"] }), { outcome: "error", reason: "timeout", seconds: 1 }),
  ];
  const m = metrics(rows);

  test("counts the defects fixed and the controls kept, over the cases with an outcome", () => {
    expect(m.defects).toEqual({ n: 3, correct: 2, rate: 0.6667 });
    expect(m.controls).toEqual({ n: 3, correct: 1, rate: 0.3333 }); // the error is left out
  });

  test("breaks each class down by outcome and by the check that failed", () => {
    expect(m.classes["when-to-use-missing"]).toMatchObject({ n: 2, correct: 1, outcomes: { proposal: 1, none: 1 }, failed: { defect_fixed: 1 } });
    expect(m.classes["retrieval-miss"]).toMatchObject({ n: 2, correct: 1, failed: { body_kept: 1 } });
    expect(m.classes.historical).toMatchObject({ n: 0, correct: 0, rate: null, outcomes: { error: 1 } });
    expect(m.classes["unsupported-ask"]).toMatchObject({ n: 1, correct: 0, outcomes: { unusable: 1 } });
    expect(Object.keys(m.classes)).toEqual(["when-to-use-missing", "title-missing", "retrieval-miss", "unsupported-ask", "historical"]);
  });

  test("counts the proposals that touched the body, which a title heading does not", () => {
    expect(m.proposals).toEqual({ n: 3, touched_body: 1 });
  });
});

describe("reflectOutcome", () => {
  const improve = (mode: string, result: object) => ({ ok: true, actions: [{ ref: "x", mode, result }] });

  test("reads what reflect did from the result akm prints, as akm 0.9.26 prints it", () => {
    expect(reflectOutcome(improve("reflect", { ok: true, proposal: { id: "p" } }))).toEqual({ outcome: "proposal", reason: "" });
    expect(reflectOutcome(improve("reflect-skipped", { ok: false, reason: "no_change", error: "identical" }))).toEqual({ outcome: "none", reason: "no_change: identical" });
    expect(reflectOutcome(improve("reflect-failed", { ok: false, reason: "quality_rejected", error: "placeholder_added" })).outcome).toBe("refused");
    expect(reflectOutcome(improve("reflect-guard-rejected", { ok: false, reason: "content_policy_reject", error: "x" })).outcome).toBe("refused");
    expect(reflectOutcome(improve("reflect-failed", { ok: false, reason: "parse_error", error: "not JSON" })).outcome).toBe("unusable");
  });

  test("a provider failure, a timeout or no reflect action is an error", () => {
    expect(reflectOutcome(improve("reflect-failed", { ok: false, reason: "non_zero_exit", error: "HTTP 500" }))).toMatchObject({ outcome: "error", reason: "non_zero_exit: HTTP 500" });
    expect(reflectOutcome(improve("reflect-failed", { ok: false, reason: "timeout", error: "x" })).outcome).toBe("error");
    expect(reflectOutcome({ ok: true, actions: [] })).toEqual({ outcome: "error", reason: "reflect did not run on the asset" });
    expect(reflectOutcome(null).outcome).toBe("error");
  });
});

describe("servedModel", () => {
  test("is the model name the response gave for reflect, from the usage report", () => {
    const improve = { usageReport: { byProcessEngineModel: [{ process: "distill", model: "a" }, { process: "reflect", model: "gpt-oss:120b" }] } };
    expect(servedModel(improve)).toBe("gpt-oss:120b");
    expect(servedModel({ usageReport: { byProcessEngineModel: [] } })).toBeUndefined();
    expect(servedModel({})).toBeUndefined();
    expect(servedModel(null)).toBeUndefined();
  });
});

describe("reflectConfig", () => {
  test("makes the model the one engine and runs reflect alone, with its judge off", () => {
    const config = reflectConfig("http://localhost:8080/v1/", "m", true) as any;
    expect(config.engines.reflect).toMatchObject({ kind: "llm", model: "m", endpoint: "http://localhost:8080/v1/chat/completions", apiKey: "$MODEL_API_KEY" });
    expect(config.defaults).toEqual({ llmEngine: "reflect", improveStrategy: "reflect-only" });
    const strategy = config.improve.strategies["reflect-only"];
    expect(strategy.engine).toBe("reflect");
    expect(strategy.processes.reflect).toEqual({ enabled: true, qualityGate: { enabled: false } });
    for (const name of ["distill", "consolidate", "memoryInference", "extract", "validation", "triage", "proactiveMaintenance"]) expect(strategy.processes[name]).toEqual({ enabled: false });
    expect(strategy.sync).toEqual({ enabled: false, push: false });
  });

  test("names no key when there is none", () => {
    expect((reflectConfig("http://localhost:8080/v1", "m", false) as any).engines.reflect.apiKey).toBeUndefined();
  });
});

describe("selectCases", () => {
  test("takes the first N, or all", () => {
    const cases = parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8"));
    expect(selectCases(cases, 3).map((c) => c.id)).toEqual(cases.slice(0, 3).map((c) => c.id));
    expect(selectCases(cases)).toHaveLength(50);
    expect(selectCases(cases, 500)).toHaveLength(50);
  });
});

describe("parseCases", () => {
  test("rejects a line that is not a case", () => {
    expect(() => parseCases("not json")).toThrow("not valid JSON");
    expect(() => parseCases("\n")).toThrow("no cases");
    expect(() => parseCases(JSON.stringify({ id: "a", path: "p.md", source: "s", feedback: "f", class: "nope", allow: [] }))).toThrow('class "nope"');
    expect(() => parseCases(JSON.stringify({ id: "a", path: "p.md", source: "s", feedback: "", class: "historical", allow: [] }))).toThrow('no string "feedback"');
  });
});

describe("refOf", () => {
  test("is the path without .md, and without /SKILL for a skill", () => {
    expect(refOf("knowledge/print/guide.md")).toBe("knowledge/print/guide");
    expect(refOf("skills/print/pagedjs/SKILL.md")).toBe("skills/print/pagedjs");
    expect(refOf("agents/a.md")).toBe("agents/a");
  });

  test("every public note is where akm reads that type", () => {
    for (const c of parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8"))) {
      expect(existsSync(join(LIBRARY, c.path))).toBe(true);
      expect(c.path).toMatch(/^(knowledge|agents|commands|workflows)\/.+\.md$|^skills\/.+\/SKILL\.md$/);
    }
  });
});

describe("atLeast", () => {
  test("orders releases and prereleases", () => {
    expect(atLeast("0.9.26", "0.9.25-alpha.3")).toBe(true);
    expect(atLeast("0.9.25-alpha.3", "0.9.25-alpha.3")).toBe(true);
    expect(atLeast("0.9.25-alpha.2", "0.9.25-alpha.3")).toBe(false);
    expect(atLeast("0.9.25-alpha.4", "0.9.25-alpha.3")).toBe(true);
    expect(atLeast("0.9.24", "0.9.25-alpha.3")).toBe(false);
    expect(atLeast("0.10.0", "0.9.25-alpha.3")).toBe(true);
  });
});
