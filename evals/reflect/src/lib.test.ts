import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refOfFile } from "../../retrieval/src/library.ts";
import { buildCases, libraryFileOf } from "./build.ts";
import {
  CLASSES,
  type Case,
  type CaseClass,
  type Defect,
  type Row,
  akmProblems,
  allowOf,
  assetsSha256,
  atLeast,
  caseProblems,
  cleanProblems,
  digestOf,
  fixOf,
  generatedProblem,
  hasCopiedFrontmatter,
  inject,
  labelledQueries,
  makeRow,
  metrics,
  parseCases,
  readGenerated,
  reflectConfig,
  reflectOutcome,
  refOf,
  refusalOf,
  score,
  selectCases,
  servedModel,
  splitFrontmatter,
  summarize,
  timedOutMessage,
} from "./lib.ts";

const EVAL_DIR = join(import.meta.dir, "..");
/** The public cases, for the tests that take an edit from the cases themselves. */
const PUBLIC: Case[] = parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8"));
const LIBRARY = join(EVAL_DIR, "..", "..", "corpus", "library");
const cleanups: string[] = [];
afterEach(() => {
  for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

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
      const clean = readFileSync(join(LIBRARY, libraryFileOf(c.path)), "utf8");
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

  test("a stray period is repaired by changing the break only: a rewrite of the description is not a fix, whatever words it keeps (#59)", () => {
    const c = PUBLIC.find((x) => x.id === "description-period-01") as Case;
    const was = (c.source.match(/^description:(.*(?:\n[ \t].*)*)/m)?.[1] ?? "").replace(/\s+/g, " ").trim();
    const withDescription = (d: string) => c.source.replace(/^description:.*(?:\n[ \t].*)*/m, `description: ${d}`);
    const fixed = (d: string) => score(c, withDescription(d)).checks.defect_fixed;
    const joined = was.replace(". ", " ");
    expect(fixed(joined)).toBe(true); // the period dropped
    expect(fixed(was.replace(". ", ", "))).toBe(true); // the period turned into a comma
    expect(fixed(was)).toBe(false); // still split
    expect(fixed(`Do not ${joined.charAt(0).toLowerCase()}${joined.slice(1)}`)).toBe(false); // reverses the meaning
    expect(fixed(`${joined.replace(/\.$/, "")} for every repository in the organisation.`)).toBe(false); // adds words
    expect(fixed(joined.replace("read-only ", ""))).toBe(false); // drops one
    expect(fixed(joined.replace("repository baseline, architecture review", "architecture review, repository baseline"))).toBe(false); // reorders
  });

  test("the repair that each public description-period case asks for is a fix", () => {
    for (const c of PUBLIC.filter((x) => x.class === "description-period")) {
      const repaired = c.source.replace(/^(description:.*)\.\n[ \t]+/m, "$1 ");
      expect(score(c, repaired).checks, c.id).toMatchObject({ defect_fixed: true, body_kept: true, no_extra_change: true });
    }
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

    test("historical: a when_to_use that offers the note for current work is wrong, naming a version it records or a word such as old does not save it (#59)", () => {
      const c = PUBLIC.find((x) => x.id === "historical-05") as Case;
      const when = (w: string) => score(c, c.source.replace(/^when_to_use:.*$/m, `when_to_use: ${w}`)).checks;
      for (const offer of [
        "Use as the current, recommended way to call GPT-4 class models today, for any new work.",
        "Use for GPT-4 era delegation; it replaces the old agent CLI approach.",
        "Use to call GPT-3.5 models, the latest and up to date way.",
        "Use when starting new work on GPT-4 class models.",
        "Historical, but currently the best way to call GPT-4.",
      ]) {
        expect(when(offer).not_current, offer).toBe(false);
        expect(when(offer).no_extra_change, offer).toBe(true); // the only thing wrong is the offer
      }
      // naming what the note records, or saying it is historical, with no offer, still passes, and so does an offer the same clause withdraws
      for (const kept of [
        "Use to check what GPT-3.5 and GPT-4 did.",
        "Historical reference for GPT-3.5 and GPT-4; not for current work.",
        "Superseded by newer models; kept as a record of the GPT-3.5 generation.",
        "Use only to look up how this worked in GPT-3.5; it is historical and no longer current.",
        "The old way to call GPT-4; don't use it today.",
      ]) {
        expect(when(kept).not_current, kept).toBe(true);
      }
      expect(score(c, undefined).checks.not_current).toBe(true);
    });

    test("historical: what the public cases call a correct result still passes: no change, or a when_to_use that names what the note records or says it is historical", () => {
      for (const c of PUBLIC.filter((x) => x.class === "historical")) {
        const when = (w: string) => score(c, c.source.replace(/^when_to_use:.*$/m, `when_to_use: ${w}`)).checks;
        expect(score(c, undefined).checks.not_current, c.id).toBe(true);
        expect(when(`Use to look up what ${(c.anchors ?? []).join(" and ")} did.`), c.id).toMatchObject({ not_current: true, no_invented: true });
        expect(when("Historical reference only; superseded by newer releases.").not_current, c.id).toBe(true);
        expect(when(`Use as the current guide to ${(c.anchors ?? [])[0]} today.`).not_current, c.id).toBe(false);
      }
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

  test("a reply akm could not use is never correct", () => {
    expect(makeRow(c, { outcome: "unusable", reason: "parse_error", seconds: 1 })).toMatchObject({ correct: false, outcome: "unusable" });
  });

  test("an edit a gate refused leaves the note as it was, and is scored as a note left alone: right for a control, a miss for a defect (#57)", () => {
    const refused = { outcome: "refused", reason: "quality_rejected: Reflect proposal refused before the judge: placeholder_added", seconds: 1 } as const;
    expect(makeRow(c, refused)).toMatchObject({ outcome: "refused", correct: true, changed: [], checks: { body_kept: true, no_extra_change: true, no_invented: true } });
    const fix = mk("when-to-use-missing", inject("when-to-use-missing", NOTE) as string);
    expect(makeRow(fix, refused)).toMatchObject({ outcome: "refused", correct: false, checks: { defect_fixed: false } });
    // the same for each of the gates that refuse
    for (const reason of ['quality_rejected: Reflect proposal quality gate rejected: score=3.0, reason="adds a claim"', "quality_rejected: Reflect proposal refused: retrieval regression: grade 3.00 -> 2.20 over 5 retrieval queries"]) {
      expect([makeRow(c, { outcome: "refused", reason, seconds: 1 }).correct, makeRow(fix, { outcome: "refused", reason, seconds: 1 }).correct]).toEqual([true, false]);
    }
  });

  test("a control whose bad edit the gate refuses is right with the gate on and wrong with it off (#57)", () => {
    const bad = NOTE.replace(/^description:.*$/m, "description: Rewrites how signing keys are rotated, with a new claim about AWS.");
    const off = makeRow(c, { outcome: "proposal", proposal: bad, seconds: 1 }); // the gate is off: the bad edit is proposed and the checks score it
    const on = makeRow(c, { outcome: "refused", reason: "quality_rejected: Reflect proposal quality gate rejected: score=2.0", seconds: 1 }); // the gate is on: the note stays as it was
    expect([off.correct, on.correct]).toEqual([false, true]);
  });

  test("a retrieval check that could not grade is an error, not a refusal: it has no verdict, and a timeout is counted as one (#58)", () => {
    const fix = mk("when-to-use-missing", inject("when-to-use-missing", NOTE) as string);
    const reason = "quality_rejected: Reflect proposal refused: retrieval check could not grade the old content (timeout)";
    for (const target of [c, fix]) {
      expect(makeRow(target, { outcome: "refused", reason, served: "qwen3-27b", seconds: 40 })).toEqual({ id: target.id, class: target.class, outcome: "error", reason, seconds: 40, correct: null, checks: null, changed: [], values: {}, error: reason, timed_out: true });
    }
    // a model call that failed or gave no grade is no timeout, but is as much an error
    for (const why of ["(error)", "(aborted)", ""]) {
      const row = makeRow(c, { outcome: "refused", reason: `quality_rejected: Reflect proposal refused: retrieval check could not grade the new content ${why}`.trim(), seconds: 1 });
      expect(row).toMatchObject({ outcome: "error", correct: null, checks: null });
      expect("timed_out" in row).toBe(false);
    }
    const rows = [makeRow(c, { outcome: "refused", reason, seconds: 40 }), makeRow(c, { outcome: "refused", reason: "quality_rejected: Reflect proposal refused: retrieval regression: grade 3.00 -> 2.20 over 5 retrieval queries", seconds: 41 }), makeRow(c, { outcome: "none", seconds: 1 })];
    expect(summarize(rows)).toMatchObject({ n_run: 3, n_scored: 2, n_errored: 1, timeouts: 1 });
    expect(summarize(rows).metrics.refused).toEqual({ filter: 0, judge: 0, retrieval: 1, other: 0 }); // the regression is a refusal, the timeout is not
    expect(summarize(rows).metrics.controls).toEqual({ n: 2, correct: 2, rate: 1 });
  });

  test("an error has no verdict and keeps its message", () => {
    expect(makeRow(c, { outcome: "error", reason: "HTTP 500", seconds: 2 })).toMatchObject({ correct: null, checks: null, error: "HTTP 500" });
  });

  test("an error that was a timeout says so, and no other row does", () => {
    expect(makeRow(c, { outcome: "error", reason: "akm improve timed out after 900s", seconds: 900, timedOut: true })).toMatchObject({ outcome: "error", timed_out: true });
    expect("timed_out" in makeRow(c, { outcome: "error", reason: "HTTP 500", seconds: 2 })).toBe(false);
    expect("timed_out" in makeRow(c, { outcome: "none", seconds: 1 })).toBe(false);
  });
});

describe("timedOutMessage", () => {
  test("tells a message that says akm timed out from other failures", () => {
    expect(timedOutMessage("akm improve timed out after 900s")).toBe(true);
    expect(timedOutMessage("akm index timed out after 0.3s")).toBe(true);
    expect(timedOutMessage("akm index failed (exit 137): ")).toBe(false);
    expect(timedOutMessage("non_zero_exit: HTTP 500")).toBe(false);
  });
});

describe("assetsSha256", () => {
  const copy = (): string => {
    const root = mkdtempSync(join(tmpdir(), "reflect-digest-"));
    cleanups.push(root);
    cpSync(join(EVAL_DIR, "assets"), join(root, "assets"), { recursive: true });
    return join(root, "assets");
  };

  test("is the same for the same cases in another folder, does not read the README, and changes with a case", () => {
    const base = assetsSha256(join(EVAL_DIR, "assets"));
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    const other = copy();
    expect(assetsSha256(other)).toBe(base);
    writeFileSync(join(other, "README.md"), "changed\n");
    expect(assetsSha256(other)).toBe(base);
    writeFileSync(join(other, "cases.jsonl"), `${readFileSync(join(other, "cases.jsonl"), "utf8")}\n `);
    expect(assetsSha256(other)).not.toBe(base);
  });

  test("digestOf names files by the name it is given and not by where they are", () => {
    const root = mkdtempSync(join(tmpdir(), "reflect-digest-"));
    cleanups.push(root);
    writeFileSync(join(root, "a"), "one");
    writeFileSync(join(root, "b"), "two");
    expect(digestOf([["a", join(root, "a")], ["b", join(root, "b")]])).toBe(digestOf([["b", join(root, "b")], ["a", join(root, "a")]]));
    expect(digestOf([["a", join(root, "a")]])).not.toBe(digestOf([["c", join(root, "a")]]));
  });
});

describe("generated.json", () => {
  const PUBLIC = join(EVAL_DIR, "assets");
  const privateDir = (generated?: unknown): string => {
    const dir = mkdtempSync(join(tmpdir(), "reflect-generated-"));
    cleanups.push(dir);
    if (generated !== undefined) writeFileSync(join(dir, "generated.json"), typeof generated === "string" ? generated : JSON.stringify(generated));
    return dir;
  };

  test("vouches for assets made from the public cases as they are", () => {
    const dir = privateDir({ seed: "42", inputs_sha256: assetsSha256(PUBLIC) });
    expect(generatedProblem(dir, PUBLIC)).toBeUndefined();
    expect(readGenerated(dir)).toEqual({ seed: "42", inputs_sha256: assetsSha256(PUBLIC) });
  });

  test("refuses assets without it, with one that is not readable, and with a digest that is not the public one", () => {
    expect(generatedProblem(privateDir(), PUBLIC)).toContain("generated.json is missing");
    expect(generatedProblem(privateDir("not json"), PUBLIC)).toContain("holds no seed");
    expect(generatedProblem(privateDir({ seed: 42, inputs_sha256: assetsSha256(PUBLIC) }), PUBLIC)).toContain("holds no seed");
    expect(generatedProblem(privateDir({ seed: "42" }), PUBLIC)).toContain("holds no seed");
    expect(generatedProblem(privateDir({ seed: "42", inputs_sha256: "0".repeat(64) }), PUBLIC)).toContain("other public assets");
  });

  test("a public case that changed makes the assets made from it stale", () => {
    const root = mkdtempSync(join(tmpdir(), "reflect-generated-"));
    cleanups.push(root);
    cpSync(PUBLIC, join(root, "assets"), { recursive: true });
    const dir = privateDir({ seed: "42", inputs_sha256: assetsSha256(join(root, "assets")) });
    expect(generatedProblem(dir, join(root, "assets"))).toBeUndefined();
    writeFileSync(join(root, "assets", "cases.jsonl"), `${readFileSync(join(root, "assets", "cases.jsonl"), "utf8")}\n `);
    expect(generatedProblem(dir, join(root, "assets"))).toContain("other public assets");
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

describe("refusalOf", () => {
  test("tells akm's defect filter, the quality judge and the retrieval check apart, from the reason akm gives", () => {
    expect(refusalOf("quality_rejected: Reflect proposal refused before the judge: placeholder_added")).toBe("filter");
    expect(refusalOf('quality_rejected: Reflect proposal quality gate rejected: score=3.0, reason="adds a claim"')).toBe("judge");
    expect(refusalOf("quality_rejected: Reflect proposal refused: retrieval regression: grade 2.00 -> 1.40 over 5 retrieval queries")).toBe("retrieval");
    expect(refusalOf("content_policy_reject: x")).toBe("other");
  });

  test("metrics counts the refused edits by what refused them", () => {
    const c = mk("retrieval-miss", NOTE);
    const refused = (reason: string) => makeRow(c, { outcome: "refused", reason, seconds: 1 });
    const m = metrics([refused("Reflect proposal refused before the judge: meta_commentary_added"), refused("Reflect proposal quality gate rejected: score=2"), refused("Reflect proposal refused: retrieval regression: x"), refused("Reflect proposal refused: retrieval regression: y"), makeRow(c, { outcome: "none", seconds: 1 })]);
    expect(m.refused).toEqual({ filter: 1, judge: 1, retrieval: 2, other: 0 });
  });
});

describe("labelledQueries", () => {
  const queries = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map((id) => JSON.stringify({ id, query: `query ${id}`, expected: [] })).join("\n");
  const qrel = (id: string, ref: string, grade: number) => JSON.stringify({ id, ref, grade, reason: "r" });

  test("takes the queries graded 2 or 3 for a note, best grade first, and at most five", () => {
    const qrels = [qrel("q1", "a", 2), qrel("q2", "a", 3), qrel("q3", "a", 1), qrel("q4", "a", 0), qrel("q5", "b", 3), qrel("q6", "a", 2), qrel("q7", "a", 2), qrel("q8", "a", 2), qrel("q1", "c", 2), qrel("q9", "a", 3)].join("\n");
    const found = labelledQueries(queries, qrels);
    expect(found.get("a")).toEqual(["query q2", "query q1", "query q6", "query q7", "query q8"]); // q9 has no query text; q3 and q4 are below 2; the sixth would be past five
    expect(found.get("b")).toEqual(["query q5"]);
    expect(found.has("d")).toBe(false);
  });

  test("a note whose only grades are below 2 has none", () => {
    expect(labelledQueries(queries, qrel("q1", "a", 1)).has("a")).toBe(false);
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

  test("sets the engine to temperature 0 with thinking off, as distill does", () => {
    const engine = (reflectConfig("http://localhost:8080/v1", "m", false) as any).engines.reflect;
    expect(engine.temperature).toBe(0);
    expect(engine.enableThinking).toBe(false);
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
      const file = libraryFileOf(c.path);
      expect(existsSync(join(LIBRARY, file))).toBe(true);
      expect(c.path).toMatch(/^(knowledge|agents|commands|workflows)\/.+\.md$|^skills\/.+\/SKILL\.md$/);
      // The ref the run gives the note is the ref akm gives the file of the library it is made from.
      expect(refOfFile(file, () => readFileSync(join(LIBRARY, file), "utf8"))).toBe(refOf(c.path));
    }
  });

  test("a note of a skill is made from the file under skills/, and a note of a type folder from itself", () => {
    expect(libraryFileOf("knowledge/skills/ai-skills/agent-cli-tools/references/codex.md")).toBe("skills/ai-skills/agent-cli-tools/references/codex.md");
    expect(libraryFileOf("knowledge/print/fix-team-dispatch-template.md")).toBe("knowledge/print/fix-team-dispatch-template.md");
    expect(libraryFileOf("skills/akm-migrate/SKILL.md")).toBe("skills/akm-migrate/SKILL.md");
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
