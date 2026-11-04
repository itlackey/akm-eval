import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLE, capture } from "./capture.ts";
import { parseCases } from "./lib.ts";
import { unreachable, withoutStamp } from "./reachable.ts";
import type { Input } from "./score.ts";

const input = (content: string): Input => ({ proposal: { ref: "bundle//knowledge/x", source: "consolidate", content }, reason: "needs-judgment", siblings: [], neighbours: [] });
const note = "---\ndescription: d\nupdated: 2026-11-03\n---\nbody";

describe("unreachable", () => {
  test("an input is what akm builds when only the date akm stamps differs", () => {
    const stamped = (day: string) => ({ input: input(note.replace("2026-11-03", day)) });
    expect(unreachable(stamped("2026-11-03"), { bundle: "base", memory: "memories/x", input: input(note.replace("2026-11-03", "2027-01-01")) })).toBeNull();
    expect(withoutStamp(input(note)).proposal.content).toContain("updated: <date>");
  });

  test("says why a case is not: the memory is gone, akm sends it nowhere, or its input differs", () => {
    const c = { input: input(note) };
    expect(unreachable(c, undefined)).toBe("the memory is not in the bundle");
    expect(unreachable(c, { bundle: "base", memory: "memories/x", skipped: "dedup_covered_by_knowledge" })).toBe("akm does not send it to the judge: dedup_covered_by_knowledge");
    expect(unreachable(c, { bundle: "base", memory: "memories/x", input: input(note.replace("body", "other")) })).toBe("the input differs from what akm builds");
    expect(unreachable(c, { bundle: "base", memory: "memories/x", input: { ...input(note), neighbours: [{ ref: "knowledge/n", description: "d", excerpt: "e" }] } })).toBe("the input differs from what akm builds");
  });
});

// These tests run akm's own promote pass and drain, so they need a checkout of akm with its dependencies installed: AKM_CHECKOUT=DIR bun test.
const checkout = process.env.AKM_CHECKOUT;

describe.skipIf(!checkout)("the inputs are what akm's drain sends the judge", () => {
  const dir = join(import.meta.dir, "..", "assets");
  const cases = ["cases.jsonl", "heldout.jsonl"].flatMap((f) => parseCases(readFileSync(join(dir, f), "utf8")));

  test("every case's input is what the promote pass and the drain build today", async () => {
    const got = new Map<string, Awaited<ReturnType<typeof capture>>["captured"][number]>();
    for (const group of new Set(cases.map((c) => c.bundle))) for (const c of (await capture(checkout as string, join(BUNDLE, group))).captured) got.set(`${c.bundle}/${c.memory}`, c);
    expect(cases.filter((c) => unreachable(c, got.get(`${c.bundle}/${c.memory}`)) !== null).map((c) => c.id)).toEqual([]);
  }, 600_000);
});
