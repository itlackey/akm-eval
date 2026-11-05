import { expect, test } from "bun:test";
import { oldSpelling } from "./akm.ts";

test("a ref of akm#1432 or later is brought to the spelling the qrels use", () => {
  expect(oldSpelling("skills/print/x/references/a", "knowledge")).toBe("knowledge/skills/print/x/references/a");
  expect(oldSpelling("reports/x", "knowledge")).toBe("knowledge/reports/x");
  expect(oldSpelling("skills/x/scripts/a.ts", "script")).toBe("scripts/skills/x/scripts/a.ts");
  expect(oldSpelling("tools/agents/foo", "agent")).toBe("agents/tools/agents/foo");
  expect(oldSpelling("skills/print/x/references/a#sec", "knowledge")).toBe("knowledge/skills/print/x/references/a#sec");
});

test("a ref that is already in the old spelling, or has a canonical one, is unchanged", () => {
  for (const [ref, type] of [["knowledge/skills/x/references/a", "knowledge"], ["skills/coding/x", "skill"], ["commands/print/review", "command"], ["scripts/a.ts", "script"], ["bundle//knowledge/a", "knowledge"], ["env/x", "env"]] as const) {
    expect(oldSpelling(ref, type)).toBe(ref);
  }
});

test("a kept file extension does not change the ref", () => {
  expect(oldSpelling("knowledge/a.md", "knowledge")).toBe("knowledge/a");
  expect(oldSpelling("skills/x/SKILL.md", "skill")).toBe("skills/x");
  expect(oldSpelling("skills/x/references/a.md", "knowledge")).toBe("knowledge/skills/x/references/a");
  expect(oldSpelling("scripts/a.ts", "script")).toBe("scripts/a.ts");
  expect(oldSpelling("b//reports/x.md", "knowledge")).toBe("b//knowledge/reports/x");
});
