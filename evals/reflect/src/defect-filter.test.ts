import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetsSha256 } from "./lib.ts";
import { type Edit, type Find, judgeGateEdits, loadFilter, reflectEdits, replay } from "./defect-filter.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "defect-filter-"));
  dirs.push(d);
  return d;
};

describe("replay", () => {
  // a stand-in for akm's filter: refuses a candidate that says "this revision", by the rule named for it
  const find: Find = (_source, candidate) => (candidate.includes("this revision") ? "meta_commentary_added" : candidate.includes("please confirm") ? "placeholder_added" : undefined);
  const edit = (id: string, label: Edit["label"], candidate: string): Edit => ({ id, label, source: "s", candidate });

  test("counts the edits the filter refuses, by label and by rule, and lists them", () => {
    const r = replay([edit("a", "bad", "this revision adds"), edit("b", "bad", "please confirm"), edit("c", "bad", "this revision too"), edit("d", "bad", "fine"), edit("e", "good", "fine"), edit("f", "good", "please confirm")], find);
    expect(r.bad).toEqual({ n: 4, refused: 3, rules: { meta_commentary_added: 2, placeholder_added: 1 } });
    expect(r.good).toEqual({ n: 2, refused: 1, rules: { placeholder_added: 1 } });
    expect(r.hits).toEqual([
      { id: "a", label: "bad", rule: "meta_commentary_added" },
      { id: "b", label: "bad", rule: "placeholder_added" },
      { id: "c", label: "bad", rule: "meta_commentary_added" },
      { id: "f", label: "good", rule: "placeholder_added" },
    ]);
  });

  test("an empty set has nothing", () => {
    expect(replay([], find)).toEqual({ good: { n: 0, refused: 0, rules: {} }, bad: { n: 0, refused: 0, rules: {} }, hits: [] });
  });
});

describe("reflectEdits", () => {
  const note = (d: string) => `---\ndescription: ${d}\n---\n`;
  const c = (id: string, source = note(id)) => ({ id, class: "when-to-use-missing", path: `knowledge/${id}.md`, source, feedback: "f", defect: "d", correct: "c", allow: ["when_to_use"] });
  const rows = [
    { id: "a", outcome: "proposal", correct: true, proposal: note("a fixed") },
    { id: "b", outcome: "proposal", correct: false, proposal: note("b changed") },
    { id: "c", outcome: "none", correct: false },
  ];
  /** A repository root with a public corpus of these cases, and a run of it whose summary names the digest of the cases, or none. */
  function fixture(cases = ["a", "b", "c"].map((id) => c(id)), summary: (digest: string) => Record<string, unknown> = (d) => ({ corpus: "public", assets_sha256: d }), samples: unknown[] = rows): { root: string; run: string; assets: string } {
    const root = temp();
    const assets = join(root, "evals", "reflect", "assets");
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, "cases.jsonl"), `${cases.map((x) => JSON.stringify(x)).join("\n")}\n`);
    const run = join(root, "run");
    mkdirSync(run);
    writeFileSync(join(run, "summary.json"), JSON.stringify(summary(assetsSha256(assets))));
    writeFileSync(join(run, "samples.jsonl"), `${samples.map((r) => JSON.stringify(r)).join("\n")}\n`);
    return { root, run, assets };
  }

  test("takes the proposals of a run, good when the case was correct, with the note the case holds", () => {
    const { root, run } = fixture();
    expect(reflectEdits(run, root)).toEqual([
      { id: "a", label: "good", source: note("a"), candidate: note("a fixed") },
      { id: "b", label: "bad", source: note("b"), candidate: note("b changed") },
    ]);
  });

  test("refuses to replay when the cases were changed since the run: the source it would judge against is not the one the run saw (R08)", () => {
    const { root, run, assets } = fixture();
    writeFileSync(join(assets, "cases.jsonl"), `${["a", "b", "c"].map((id) => JSON.stringify(c(id, note(`${id} revised`)))).join("\n")}\n`);
    expect(() => reflectEdits(run, root)).toThrow("other public cases");
  });

  test("refuses a summary that does not name the cases it read", () => {
    const { root, run } = fixture(undefined, () => ({ corpus: "public" }));
    expect(() => reflectEdits(run, root)).toThrow("no assets_sha256");
  });

  test("names a proposal whose case is not in the corpus instead of passing it an undefined source", () => {
    const { root, run } = fixture(undefined, undefined, [...rows, { id: "gone", outcome: "proposal", correct: false, proposal: note("x") }]);
    expect(() => reflectEdits(run, root)).toThrow('case "gone" is not in');
  });

  test("replays the same after a regeneration that leaves these cases as they were", () => {
    const { root, run, assets } = fixture();
    const before = reflectEdits(run, root);
    writeFileSync(join(assets, "other.txt"), "an unrelated file of the corpus folder\n");
    expect(reflectEdits(run, root)).toEqual(before);
  });
});

describe("judgeGateEdits", () => {
  test("is the 106 labelled proposals of the public judge-gate set", () => {
    const edits = judgeGateEdits("public");
    expect(edits.length).toBe(106);
    expect(edits.filter((e) => e.label === "good").length).toBe(11); // rubric version 2 (evals/judge-gate/assets/ADJUDICATION.md)
    expect(edits.every((e) => e.source.length > 0 && e.candidate.length > 0)).toBe(true);
  });
});

describe("loadFilter", () => {
  test("says what is wrong when the folder is not an akm checkout", async () => {
    await expect(loadFilter(temp())).rejects.toThrow("must be a checkout of akm");
  });

  test("loads findReflectDefect from the checkout's source", async () => {
    const akm = temp();
    mkdirSync(join(akm, "src", "commands", "improve"), { recursive: true });
    writeFileSync(join(akm, "src", "commands", "improve", "reflect-noise.ts"), 'export const findReflectDefect = (s: string, c: string) => (c.includes("x") ? "placeholder_added" : undefined);\n');
    const find = await loadFilter(akm);
    expect(find("a", "xx")).toBe("placeholder_added");
    expect(find("a", "b")).toBeUndefined();
  });
});
