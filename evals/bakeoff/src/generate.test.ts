import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate, install, rewriteProblems } from "./generate.ts";
import { CASES_FILE, GENERATED, assetsSha256, loadCases } from "./inputs.ts";

const PUBLIC = join(import.meta.dir, "..", "assets");
const dirs: string[] = [];
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "bakeoff-gen-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A rewrite of the public assets, made once for the file: generate runs lib/rewrite in a subprocess. */
let made: string | undefined;
function rewrite(): string {
  if (made === undefined) {
    made = mkdtempSync(join(tmpdir(), "bakeoff-gen-shared-"));
    generate("42", made);
  }
  return made;
}
afterAll(() => {
  if (made !== undefined) rmSync(made, { recursive: true, force: true });
});
const copyOf = (): string => {
  const out = temp();
  cpSync(rewrite(), out, { recursive: true });
  return out;
};

describe("generate", () => {
  test("rewrites the files and the cases with one map, and every case still holds what it expects", () => {
    const out = rewrite();
    expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json"]);
    const here = loadCases(join(out, "assets"));
    const there = loadCases(PUBLIC);
    expect(here.map((c) => [c.id, c.process, c.files])).toEqual(there.map((c) => [c.id, c.process, c.files]));
    expect(rewriteProblems(join(out, "assets"), PUBLIC)).toEqual([]);
    // it is a rewrite: the dates of the memories are not the public ones
    expect(readFileSync(join(out, "assets", "memories", "operator-preference.md"), "utf8")).not.toBe(readFileSync(join(PUBLIC, "memories", "operator-preference.md"), "utf8"));
    // the session is still one JSON object to a line, with the id its file is named by
    for (const line of readFileSync(join(out, "assets", "sessions", "-home-dev-relay", "summary-release-session.jsonl"), "utf8").trim().split("\n")) expect((JSON.parse(line) as { sessionId: string }).sessionId).toBe("summary-release-session");
  });

  test("the same seed gives the same assets, and another seed gives other ones", () => {
    const again = temp();
    generate("42", again);
    expect(assetsSha256(join(again, "assets"))).toBe(assetsSha256(join(rewrite(), "assets")));
    const other = temp();
    generate("43", other);
    expect(assetsSha256(join(other, "assets"))).not.toBe(assetsSha256(join(rewrite(), "assets")));
  });

  test("generated.json holds the seed", () => {
    expect(JSON.parse(readFileSync(join(rewrite(), GENERATED), "utf8"))).toEqual({ seed: "42" });
  });

  test("stops and writes nothing when a rewritten case no longer holds, and leaves the earlier assets, map and generated.json as they were", () => {
    const out = copyOf();
    const earlier = [assetsSha256(join(out, "assets")), readFileSync(join(out, GENERATED), "utf8"), readFileSync(join(out, "map.json"), "utf8")];
    // a public corpus whose case names a file that is not there: the rewritten case cannot hold what it expects
    const from = temp();
    cpSync(PUBLIC, from, { recursive: true });
    rmSync(join(from, "lessons", "missing-metadata.md"));
    expect(() => generate("7", out, from)).toThrow(/Nothing was written\. Try another seed\.[\s\S]*repair-lesson-metadata: lessons\/missing-metadata\.md is missing or empty/);
    expect([assetsSha256(join(out, "assets")), readFileSync(join(out, GENERATED), "utf8"), readFileSync(join(out, "map.json"), "utf8")]).toEqual(earlier);
    expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json"]); // no work folder is left behind
  });

  test("install puts the marker in last, so assets cut short have none", () => {
    const out = temp();
    const staged = temp();
    mkdirSync(join(staged, "assets"));
    writeFileSync(join(staged, "assets", CASES_FILE), "[]");
    writeFileSync(join(staged, "map.json"), "{}");
    writeFileSync(join(staged, GENERATED), "{}");
    mkdirSync(join(out, "assets"));
    writeFileSync(join(out, GENERATED), "old");
    install(staged, out);
    expect(readFileSync(join(out, GENERATED), "utf8")).toBe("{}");
    expect(existsSync(join(staged, "assets"))).toBe(false);
  });
});
