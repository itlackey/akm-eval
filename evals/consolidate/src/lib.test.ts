import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble, explode } from "./generate.ts";
import { type Case, RELATIONS, type Relation, type Row, claimProblems, consolidateConfig, errorRow, metrics, noteAges, parseCases, rowFromRun, selectCases } from "./lib.ts";

const note = (name: string, text = `---\ndescription: ${name}\n---\n# ${name}\n\nA claim.\n`) => ({ name, text });

const make = (id: string, relation: Relation, extra: Partial<Case> = {}): Case => ({
  id,
  relation,
  older: "a",
  safe: relation === "duplicate" ? ["a", "b"] : [],
  claims: [],
  why: "because",
  a: note(`${id}-one`),
  b: note(`${id}-two`),
  ...extra,
});

const publicCases = () => parseCases(readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl"), "utf8"));

describe("parseCases", () => {
  test("reads JSONL and rejects what a case cannot be", () => {
    const line = JSON.stringify(make("x", "duplicate"));
    expect(parseCases(`${line}\n\n`)).toHaveLength(1);
    expect(() => parseCases(JSON.stringify({ ...make("x", "duplicate"), relation: "similar" }))).toThrow('relation "similar"');
    expect(() => parseCases(JSON.stringify({ ...make("x", "duplicate"), older: "c" }))).toThrow('older "c"');
    expect(() => parseCases(JSON.stringify({ ...make("x", "duplicate"), safe: ["c"] }))).toThrow('"safe"');
    expect(() => parseCases(JSON.stringify({ ...make("x", "duplicate"), a: note("Not A Name") }))).toThrow("note a");
    expect(() => parseCases(JSON.stringify({ ...make("x", "duplicate"), b: note("x-one") }))).toThrow("both notes the name");
    expect(() => parseCases("not json")).toThrow("not valid JSON");
    expect(() => parseCases("\n")).toThrow("no cases");
  });

  test("rejects a claim that is not where it says", () => {
    const c = make("x", "overlap", { a: note("x-one", "has red"), b: note("x-two", "has blue") });
    const claim = (side: "a" | "b" | "both", text: string) => JSON.stringify({ ...c, claims: [{ side, text }] });
    expect(parseCases(claim("a", "red"))).toHaveLength(1);
    expect(() => parseCases(claim("b", "red"))).toThrow("meant for note b only but is in note a only");
    expect(() => parseCases(claim("both", "red"))).toThrow("meant for both notes but is in note a only");
    expect(() => parseCases(claim("a", "green"))).toThrow("is in neither note");
  });
});

describe("the public cases", () => {
  const cases = publicCases();

  test("are 10 for each relation, with a unique id and unique note names", () => {
    expect(cases).toHaveLength(60);
    for (const r of RELATIONS) expect(cases.filter((c) => c.relation === r)).toHaveLength(10);
    expect(new Set(cases.map((c) => c.id)).size).toBe(60);
    expect(new Set(cases.flatMap((c) => [c.a.name, c.b.name])).size).toBe(120);
  });

  test("have the safe sides their relation gives, and a deciding claim on the side it belongs to", () => {
    for (const c of cases) {
      const older = c.older === "b" ? "b" : "a";
      const newer = older === "a" ? "b" : "a";
      if (c.relation === "duplicate") expect(c.safe).toEqual(["a", "b"]);
      else if (c.relation === "subsumed") expect(c.safe).toHaveLength(1);
      else if (c.relation === "supersedes") expect(c.safe).toEqual([older]);
      else expect(c.safe).toEqual([]);
      // a note with a deciding claim all its own is not safe to retire
      if (c.relation === "subsumed") expect(c.claims).toEqual([{ side: c.safe[0] === "a" ? "b" : "a", text: c.claims[0].text }]);
      if (c.relation === "supersedes") expect(c.claims.map((k) => k.side)).toEqual([older, newer]);
      if (["contradicts", "overlap"].includes(c.relation)) expect(c.claims.map((k) => k.side)).toEqual(["a", "b"]);
      expect(c.claims.length).toBeGreaterThan(0);
      expect(claimProblems(c)).toEqual([]);
      // only a pair from the same day has no older note, and only a contradiction is one
      expect(c.older === null).toBe(c.relation === "contradicts");
    }
  });

  test("have both older and newer sides, so akm cannot get the right side from the order", () => {
    for (const r of ["duplicate", "subsumed", "supersedes"] as const) {
      const older = cases.filter((c) => c.relation === r).map((c) => c.older);
      expect(older.filter((s) => s === "a").length).toBeGreaterThanOrEqual(4);
      expect(older.filter((s) => s === "b").length).toBeGreaterThanOrEqual(4);
    }
    const subsumed = cases.filter((c) => c.relation === "subsumed");
    const safeIsOlder = subsumed.filter((c) => c.safe[0] === c.older).length;
    expect(safeIsOlder).toBe(5);
  });

  test("hold nothing private: no lab host, address or path, and no real domain", () => {
    const text = cases.map((c) => JSON.stringify(c)).join("\n");
    for (const bad of ["fwdslsh", "krang", "splinter", "rocksteady", "/home/", "founder", "itlackey", "192.168."]) expect(text).not.toContain(bad);
    expect(text).not.toMatch(/\b[a-z0-9-]+\.(com|net|org|io|dev|app|ai|co)\b/);
  });
});

// akm's deterministic embedder (src/llm/embedders/deterministic.ts) and the text it embeds for a memory (buildSearchText): the
// name, the description, the tags, the name and tags again as aliases, the observed_at hint from the file date, and the body.
function hashCosine(a: string, b: string): number {
  const embed = (text: string) => {
    const v = new Array<number>(384).fill(0);
    for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      let h = 0x811c9dc5;
      for (const ch of tok) h = (Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0) >>> 0;
      v[h % 384] += (h >>> 16) & 1 ? 1 : -1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    return v.map((x) => x / norm);
  };
  const [x, y] = [embed(a), embed(b)];
  return x.reduce((s, xi, i) => s + xi * y[i], 0);
}

function embedText(n: { name: string; text: string }, observed: string): string {
  const [, front, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(n.text) as RegExpExecArray;
  const description = /^description: (.*)$/m.exec(front)?.[1] ?? "";
  const tags = (/^tags: \[(.*)\]$/m.exec(front)?.[1] ?? "").replaceAll(",", " ");
  const spaced = n.name.replace(/[-_]/g, " ");
  return `${spaced} ${description} ${tags} ${spaced} ${tags} observed_at:${observed} ${body.replace(/```[\s\S]*?```/g, " ")}`;
}

/** The cosine akm would see for a case's two notes, with the dates the run gives them. */
const cosine = (c: Case) => {
  const [oa, ob] = c.older === "a" ? ["2026-10-03", "2026-10-05"] : c.older === "b" ? ["2026-10-05", "2026-10-03"] : ["2026-10-04", "2026-10-04"];
  return hashCosine(embedText(c.a, oa), embedText(c.b, ob));
};

describe("the public cases and akm's embedder", () => {
  // The pair pass judges a pair only when the cosine of the two notes' embeddings is 0.93 or more. With the deterministic embedder
  // this can be computed here, so a case that akm would not pair cannot be added by mistake.
  test("pairs every case that is about one thing, with room to spare", () => {
    for (const c of publicCases().filter((x) => x.relation !== "unrelated")) expect(cosine(c)).toBeGreaterThan(0.945);
  });

  test("pairs some unrelated cases, which have a shared layout, and not those that share no subject", () => {
    const cosines = publicCases().filter((c) => c.relation === "unrelated").map(cosine);
    expect(cosines.filter((x) => x > 0.94)).toHaveLength(5);
    expect(cosines.filter((x) => x < 0.6)).toHaveLength(5);
  });
});

describe("selectCases", () => {
  const cases = RELATIONS.flatMap((r) => [1, 2, 3].map((n) => make(`${r}-${n}`, r)));

  test("takes the first case of each relation in turn, and gives them back in file order", () => {
    expect(selectCases(cases, 3).map((c) => c.id)).toEqual(["duplicate-1", "subsumed-1", "supersedes-1"]);
    expect(selectCases(cases, 7).map((c) => c.id)).toEqual(["duplicate-1", "duplicate-2", "subsumed-1", "supersedes-1", "contradicts-1", "overlap-1", "unrelated-1"]);
  });

  test("a limit at or above the size runs everything", () => {
    expect(selectCases(cases, 18)).toHaveLength(18);
    expect(selectCases(cases)).toHaveLength(18);
  });
});

describe("noteAges", () => {
  test("puts the older note at 3 days and the newer at 1, and a pair from one day at 2 each, all within akm's week of new material", () => {
    expect(noteAges("a")).toEqual({ a: 3, b: 1 });
    expect(noteAges("b")).toEqual({ a: 1, b: 3 });
    expect(noteAges(null)).toEqual({ a: 2, b: 2 });
  });
});

describe("consolidateConfig", () => {
  test("gives akm one engine, the model, as the default, and turns semantic search on", () => {
    const c = consolidateConfig("http://localhost:8080/v1/", "m", false);
    expect(c.engines.consolidate).toMatchObject({ kind: "llm", endpoint: "http://localhost:8080/v1/chat/completions", model: "m" });
    expect(c.engines.consolidate.apiKey).toBeUndefined();
    expect(c.defaults.llmEngine).toBe("consolidate");
    expect(c.semanticSearchMode).toBe("auto");
  });

  test("names the key by variable and never holds it", () => {
    expect(consolidateConfig("https://api.example.com/v1", "m", true).engines.consolidate.apiKey).toBe("$MODEL_API_KEY");
  });
});

describe("rowFromRun", () => {
  const pass = (over: Record<string, unknown> = {}) => ({
    consolidation: { pairPass: { initiators: 2, pairsConsidered: 1, pairsJudged: 1, failedJudgments: 0, labelCounts: { duplicate: 1 }, retired: [], ...over } },
    usageReport: {
      byProcessEngineModel: [
        { process: "consolidate", engine: "consolidate", model: "served-a", calls: 2, failures: 0 },
        { process: "consolidate", engine: "consolidate", model: "served-b", calls: 2, failures: 1 },
        { process: "consolidate", engine: "consolidate", model: "asked-for", calls: 1, failures: 1 },
      ],
    },
  });
  const proposal = (retiredRef: string, over: Record<string, unknown> = {}) => ({
    id: "p1",
    ref: `bundle//${retiredRef}`,
    status: "pending",
    source: "consolidate-pair",
    retirement: { retiredRef, successorRef: "memories/other", judgeLabel: "duplicate", judgeReason: "same claims" },
    ...over,
  });
  const listing = (...proposals: unknown[]) => ({ totalCount: proposals.length, proposals });
  const dup = make("d", "duplicate", { older: "a" });
  const overlap = make("o", "overlap");

  test("a retirement is the proposal's ref, and is safe when the case says that side is", () => {
    const row = rowFromRun(dup, pass(), listing(proposal("memories/d-two", { gateDecision: { outcome: "staged", reason: "duplicate" } })), 4.2);
    expect(row).toMatchObject({ id: "d", relation: "duplicate", safe_sides: ["a", "b"], outcome: "retire", paired: true, judged_as: "duplicate", retired: "b", safe: true, staged: true, reason: "same claims", seconds: 4.2 });
  });

  test("keeps the model names the endpoint reported, with the calls they answered, on every row it makes from a run", () => {
    expect(rowFromRun(dup, pass(), listing(), 1).served).toEqual({ "served-a": 2, "served-b": 1 });
    expect(rowFromRun(dup, pass({ failedJudgments: 1 }), listing(), 1).served).toEqual({ "served-a": 2, "served-b": 1 });
    expect(rowFromRun(dup, pass(), listing(proposal("memories/elsewhere")), 1).served).toEqual({ "served-a": 2, "served-b": 1 });
    expect(rowFromRun(dup, { consolidation: { pairPass: { pairsConsidered: 0 } } }, listing(), 1).served).toEqual({});
  });

  test("a retirement of a side that was not safe is unsafe, and not staged unless akm staged it", () => {
    const row = rowFromRun(overlap, pass({ labelCounts: { subsumed: 1 } }), listing(proposal("memories/o-one")), 1);
    expect(row).toMatchObject({ outcome: "retire", retired: "a", safe: false, staged: false, judged_as: "subsumed" });
  });

  test("a pair akm judged and kept is a keep, with the label the judge gave it", () => {
    expect(rowFromRun(overlap, pass({ labelCounts: { overlap: 1 } }), listing(), 1)).toMatchObject({ outcome: "keep", paired: true, judged_as: "overlap", retired: null, safe: null });
  });

  test("a pair akm never paired is a keep too", () => {
    const row = rowFromRun(overlap, pass({ pairsConsidered: 0, pairsJudged: 0, labelCounts: {} }), listing(), 1);
    expect(row).toMatchObject({ outcome: "keep", paired: false, judged_as: null });
  });

  test("leaves out the promotions the promote pass proposes", () => {
    const promotion = { id: "p2", ref: "bundle//knowledge/x", status: "pending", source: "consolidate" };
    expect(rowFromRun(overlap, pass(), listing(promotion), 1).outcome).toBe("keep");
  });

  test("a pair with no verdict is an error, as is anything that does not add up", () => {
    expect(rowFromRun(dup, pass({ pairsJudged: 0 }), listing(), 1)).toMatchObject({ outcome: "error", paired: true, error: "akm paired the notes but its judge gave no verdict" });
    expect(rowFromRun(dup, pass({ failedJudgments: 1 }), listing(), 1).outcome).toBe("error");
    expect(rowFromRun(dup, { consolidation: {} }, listing(), 1).error).toContain("no pair pass result");
    expect(rowFromRun(dup, null, listing(), 1).outcome).toBe("error");
    expect(rowFromRun(dup, pass(), listing(proposal("memories/elsewhere")), 1).error).toContain("not one of the two notes");
    expect(rowFromRun(dup, pass(), listing(proposal("memories/d-one"), proposal("memories/d-two")), 1).error).toContain("2 retire proposals");
  });
});

describe("metrics", () => {
  const row = (relation: Relation, outcome: Row["outcome"], safe: boolean | null, over: Partial<Row> = {}): Row => ({
    ...errorRow(make(`${relation}-${outcome}`, relation), "", 0),
    outcome,
    paired: outcome !== "error",
    retired: outcome === "retire" ? "a" : null,
    safe,
    error: undefined,
    ...over,
  });

  test("counts unsafe retirements, how many were staged, precision and recall, and leaves out the errors", () => {
    const m = metrics([
      row("duplicate", "retire", true, { staged: true }),
      row("subsumed", "retire", true),
      row("supersedes", "retire", false, { staged: true, safe_sides: ["b"] }),
      row("supersedes", "keep", null, { safe_sides: ["b"] }),
      row("overlap", "retire", false),
      row("overlap", "keep", null),
      row("contradicts", "keep", null),
      row("unrelated", "error", null),
    ].map((r) => ({ ...r, safe_sides: r.relation === "duplicate" ? ["a", "b"] : r.relation === "subsumed" ? ["a"] : r.safe_sides })));
    expect(m.unsafe).toEqual({ n: 2, of: 7, staged: 1 });
    expect(m.precision).toEqual({ value: 0.5, safe: 2, retired: 4 });
    expect(m.recall).toEqual({ value: 0.5, retired_safe: 2, of: 4 });
    expect(m.classes.supersedes).toMatchObject({ n: 2, retired_unsafe: 1, kept: 1, retired_safe: 0 });
    expect(m.classes.unrelated).toMatchObject({ n: 1, error: 1, paired: 0 });
    expect(m.classes.overlap).toMatchObject({ retired_unsafe: 1, kept: 1 });
  });

  test("counts the labels the judge gave, per relation", () => {
    const m = metrics([row("subsumed", "keep", null, { judged_as: "duplicate" }), row("subsumed", "keep", null, { judged_as: "subsumed" }), row("subsumed", "keep", null, { paired: false })]);
    expect(m.classes.subsumed.judged_as).toMatchObject({ duplicate: 1, subsumed: 1, overlap: 0 });
    expect(m.classes.subsumed.paired).toBe(2);
  });

  test("has no precision or recall when there is nothing to divide by", () => {
    const m = metrics([]);
    expect(m.precision.value).toBeNull();
    expect(m.recall.value).toBeNull();
    expect(m.unsafe).toEqual({ n: 0, of: 0, staged: 0 });
  });
});

describe("explode and assemble", () => {
  test("give back the same cases when the rewrite changes nothing, names and claims included", () => {
    const cases = [
      make("one", "overlap", { a: note("tarn-cache-notes", "---\ndescription: a\n---\n# T\n\nRed.\n"), b: note("tarn-cache", "---\ndescription: a\n---\n# T\n\nBlue.\n"), claims: [{ side: "a", text: "Red." }, { side: "b", text: "Blue." }] }),
      make("two", "duplicate", { why: "same\nclaims", claims: [{ side: "both", text: "# T" }], a: note("two-a", "# T\n"), b: note("two-b", "# T\n") }),
    ];
    const dir = mkdtempSync(join(tmpdir(), "consolidate-test-"));
    try {
      explode(cases, join(dir, "corpus"), join(dir, "labels"));
      cpSync(join(dir, "corpus"), join(dir, "corpus-out"), { recursive: true });
      cpSync(join(dir, "labels"), join(dir, "labels-out"), { recursive: true });
      expect(assemble(cases, join(dir, "corpus-out"), join(dir, "labels-out"))).toEqual(cases);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("generate", () => {
  test("rewrites the made-up names, keeps every deciding claim in its note, and the pairs still pair", () => {
    const dir = mkdtempSync(join(tmpdir(), "consolidate-generate-"));
    try {
      const p = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts"), "--seed", "42", "--out", dir], { stdout: "pipe", stderr: "pipe" });
      expect(p.stderr.toString()).toBe("");
      expect(p.exitCode).toBe(0);
      const text = readFileSync(join(dir, "assets", "cases.jsonl"), "utf8");
      const made = parseCases(text);
      const original = publicCases();
      expect(made).toHaveLength(60);
      // the same relations, sides and dates, in a different text
      expect(made.map((c) => [c.id, c.relation, c.older, c.safe, c.canary])).toEqual(original.map((c) => [c.id, c.relation, c.older, c.safe, c.canary]));
      expect(text).not.toMatch(/tarnwick|ostler|pellam|brackwater|sedgemoor|larkspur|quillon/i);
      expect(made.map((c) => c.a.text)).not.toEqual(original.map((c) => c.a.text));
      expect(made.flatMap(claimProblems)).toEqual([]);
      expect(Object.keys(JSON.parse(readFileSync(join(dir, "map.json"), "utf8")).words)).toContain("tarnwick");
      // a rewritten name is the same in a case's notes and in its note names
      const word = made[0].a.name.split("-")[0];
      expect(word).not.toBe("ostler");
      expect(made[0].a.text).toContain(word[0].toUpperCase() + word.slice(1));
      expect(made[0].b.name.split("-")[0]).toBe(word);
      // and the pairs still pair, and the pairs on different subjects still do not
      for (const c of made.filter((x) => x.relation !== "unrelated")) expect(cosine(c)).toBeGreaterThan(0.94);
      const unrelated = made.filter((c) => c.relation === "unrelated").map(cosine);
      expect(unrelated.filter((x) => x > 0.94)).toHaveLength(5);
      expect(unrelated.filter((x) => x < 0.6)).toHaveLength(5);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
