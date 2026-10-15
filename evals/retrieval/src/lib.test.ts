import { describe, expect, test } from "bun:test";
import { sha256Text } from "../../../lib/provenance.ts";
import {
  JUDGE_SYSTEM_PROMPT,
  MAX_DOC_CHARS,
  PROMPT_SHA256,
  PROMPT_VERSION,
  type Query,
  abstention,
  assetSha256,
  bannedByQuery,
  casesOf,
  makeRow,
  foldRefs,
  gradesByQuery,
  isTask,
  judgeMessages,
  mixedJudgesWarning,
  parseGrade,
  parseQrels,
  parseQueries,
  pool,
  qrelProvenance,
  scoreQuery,
  selectQueries,
  stripFrontmatter,
  summarize,
} from "./lib.ts";

const lines = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n");

describe("parseQueries", () => {
  test("reads one query per line and rejects what is not usable", () => {
    const text = lines([
      { id: "q1", query: "a", kind: "direct" },
      { id: "n1", query: "thanks", kind: "chitchat" },
    ]);
    expect(parseQueries(`${text}\n`)).toHaveLength(2);
    expect(() => parseQueries("{oops")).toThrow("queries:1 is not valid JSON");
    expect(() => parseQueries(lines([{ id: "q1", query: "a" }]))).toThrow('has no string "kind"');
    expect(() => parseQueries(lines([{ id: "q1", query: "", kind: "direct" }]))).toThrow('has no string "query"');
    expect(() => parseQueries(lines([{ id: "q1", query: "a", kind: "direct" }, { id: "q1", query: "b", kind: "direct" }]))).toThrow("q1 twice");
    expect(() => parseQueries("\n")).toThrow("has no lines");
    expect(() => parseQueries(lines([{ id: "q1", query: "a", kind: "direct", expected: "a/x" }]))).toThrow('"expected" that is not a list of refs');
    expect(() => parseQueries(lines([{ id: "q1", query: "a", kind: "direct", expected: ["a/x", ""] }]))).toThrow('"expected" that is not a list of refs');
    expect(parseQueries(lines([{ id: "q1", query: "a", kind: "direct", expected: ["a/x"] }, { id: "q2", query: "b", kind: "no-answer", expected: [] }]))[0].expected).toEqual(["a/x"]);
  });

  test("a task is anything that is not chit-chat, a notification, a log line, a status update or marked nontask", () => {
    const kinds = ["name", "direct", "paraphrase", "multi", "no-answer", "lesson", "multihop-declared"].map((kind) => isTask({ id: "x", query: "q", kind }));
    expect(kinds).toEqual([true, true, true, true, true, true, true]);
    expect(["chitchat", "notification", "log", "status", "nontask"].map((kind) => isTask({ id: "x", query: "q", kind }))).toEqual([false, false, false, false, false]);
  });
});

describe("parseQrels and gradesByQuery", () => {
  test("reads the grades by query and ref, the last one winning", () => {
    const qrels = parseQrels(
      lines([
        { id: "q1", ref: "a/x", grade: 3, reason: "r" },
        { id: "q1", ref: "a/y", grade: 0, reason: "r" },
        { id: "q2", ref: "a/x", grade: 2, reason: "r" },
        { id: "q1", ref: "a/y", grade: 1, reason: "again" },
      ]),
    );
    expect(gradesByQuery(qrels).get("q1")).toEqual({ "a/x": 3, "a/y": 1 });
    expect(gradesByQuery(qrels).get("q2")).toEqual({ "a/x": 2 });
    expect(gradesByQuery(qrels).get("q3")).toBeUndefined();
  });

  test("refuses a grade outside 0 to 3", () => {
    expect(() => parseQrels(lines([{ id: "q1", ref: "a", grade: 4, reason: "" }]))).toThrow("expected 0 to 3");
    expect(() => parseQrels(lines([{ id: "q1", ref: "a", grade: 1.5, reason: "" }]))).toThrow("expected 0 to 3");
    expect(() => parseQrels(lines([{ id: "q1", grade: 1, reason: "" }]))).toThrow('"id" and "ref"');
  });

  test("reads the provenance of a grade when a row has it, and a row without it as before", () => {
    const made = { judge: "chat/some-judge", prompt_sha256: "p".repeat(64), date: "2026-10-11", asset_sha256: "a".repeat(64) };
    const qrels = parseQrels(lines([{ id: "q1", ref: "a/x", grade: 3, reason: "r", ...made }, { id: "q1", ref: "a/y", grade: 1, reason: "r" }]));
    expect(qrels[0]).toMatchObject(made);
    expect(qrels[1].judge).toBeUndefined();
    for (const key of Object.keys(made)) {
      for (const bad of [3, "", null]) expect(() => parseQrels(lines([{ id: "q1", ref: "a", grade: 1, reason: "", [key]: bad }]))).toThrow(`"${key}" that is not a string`);
    }
  });

  test("reads the assets a query bans, which have grade 0", () => {
    const qrels = parseQrels(
      lines([
        { id: "q1", ref: "a/x", grade: 3, reason: "r" },
        { id: "q1", ref: "a/old", grade: 0, reason: "r", banned: true },
        { id: "q1", ref: "a/off", grade: 0, reason: "r", banned: true },
        { id: "q2", ref: "a/old", grade: 0, reason: "r" },
      ]),
    );
    expect(bannedByQuery(qrels)).toEqual(new Map([["q1", ["a/old", "a/off"]]]));
    expect(gradesByQuery(qrels).get("q1")).toEqual({ "a/x": 3, "a/old": 0, "a/off": 0 });
    for (const banned of [false, "yes"]) expect(() => parseQrels(lines([{ id: "q1", ref: "a", grade: 0, reason: "", banned }]))).toThrow('"banned" that is not true on a grade 0 pair');
    expect(() => parseQrels(lines([{ id: "q1", ref: "a", grade: 2, reason: "", banned: true }]))).toThrow('"banned" that is not true on a grade 0 pair');
  });
});

describe("selectQueries", () => {
  const queries: Query[] = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, query: "q", kind: "direct" })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `n${i}`, query: "n", kind: "log" })),
  ];

  test("takes everything without a limit, or with a limit that covers it", () => {
    expect(selectQueries(queries)).toBe(queries);
    expect(selectQueries(queries, 10)).toBe(queries);
    expect(selectQueries(queries, 50)).toBe(queries);
  });

  test("keeps the task and non-task proportion, in file order", () => {
    expect(selectQueries(queries, 5).map((q) => q.id)).toEqual(["q0", "q1", "q2", "q3", "n0"]);
    expect(selectQueries(queries, 10 - 2).map((q) => q.id)).toEqual(["q0", "q1", "q2", "q3", "q4", "q5", "n0", "n1"]);
  });

  test("a small limit still holds the kinds it can", () => {
    expect(selectQueries(queries, 1).map((q) => q.id)).toEqual(["q0"]);
    expect(selectQueries(queries, 2).map((q) => q.id)).toEqual(["q0", "q1"]);
    expect(selectQueries(queries, 3).map((q) => q.id)).toEqual(["q0", "q1", "n0"]);
  });
});

describe("foldRefs and pool", () => {
  test("folds the sections of an asset into it, at the first place", () => {
    expect(foldRefs(["a/x#intro", "b/y", "a/x#usage", "a/x", "c/z#s"])).toEqual(["a/x", "b/y", "c/z"]);
    expect(foldRefs([])).toEqual([]);
  });

  test("pools the top of each list, each ref once, in the order first seen", () => {
    const search = ["a", "b", "c", "d"];
    const curate = ["b", "e", "a", "f"];
    const bm25 = ["g", "a", "h"];
    expect(pool([search, curate, bm25], 3)).toEqual(["a", "b", "c", "e", "g", "h"]);
    expect(pool([search, curate, bm25], 1)).toEqual(["a", "b", "g"]);
    expect(pool([search, curate, bm25], 10)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(pool([[], []], 10)).toEqual([]);
  });
});

describe("the judge's input", () => {
  const asset = { ref: "knowledge/x/y", type: "knowledge", name: "x/y", description: "About y.", path: "knowledge/x/y.md" };

  test("drops the front matter", () => {
    expect(stripFrontmatter("---\nname: y\ndescription: d\n---\n\n# Title\nBody\n")).toBe("# Title\nBody");
    expect(stripFrontmatter("# No front matter\n")).toBe("# No front matter");
    expect(stripFrontmatter("---\nnot closed\n# Title")).toBe("---\nnot closed\n# Title");
    expect(stripFrontmatter("")).toBe("");
  });

  test("is the umbrela-akm-v1 prompt, the query, the asset's fields and the first 16,000 characters", () => {
    const [system, user] = judgeMessages("how do I y", asset, `---\nname: y\n---\n${"z".repeat(20_000)}`);
    expect(system.role).toBe("system");
    expect(system.content).toStartWith("You are grading search-and-retrieval results for an AI coding agent's knowledge base (the akm tool).");
    expect(system.content).toEndWith('Reply with ONLY a JSON object: {"grade": <integer 0-3>, "reason": "<=25 words"}.');
    expect(user.role).toBe("user");
    expect(user.content).toStartWith("Query: how do I y\n\nCandidate asset:\nType: knowledge\nRef: knowledge/x/y\nName: x/y\nDescription: About y.\n\nContent:\n");
    expect(user.content.split("Content:\n")[1]).toBe("z".repeat(16_000));
    expect(judgeMessages("q", asset, "short body")[1].content).toEndWith("Content:\nshort body");
  });
});

describe("who graded the qrels", () => {
  let n = 0;
  /** A row of a pair of its own, so that rows of one judge do not replace each other. */
  const row = (judge?: string, prompt?: string, ref = `a/x${n++}`) => ({ id: "q1", ref, grade: 1, reason: "r", ...(judge ? { judge } : {}), ...(prompt ? { prompt_sha256: prompt } : {}) });

  test("lists the judges and prompts the rows record, and counts the rows that record no judge", () => {
    expect(qrelProvenance([row(), row("b"), row("a", "p1"), row("a", "p1")])).toEqual({ judges: ["a", "b"], prompts: ["p1"], unrecorded: 1 });
    expect(qrelProvenance([])).toEqual({ judges: [], prompts: [], unrecorded: 0 });
  });

  test("counts the last row of each pair, so a row that a later one replaced does not count", () => {
    const old = [row(undefined, undefined, "a/y"), row("a", "p1", "a/z")];
    expect(qrelProvenance(old)).toEqual({ judges: ["a"], prompts: ["p1"], unrecorded: 1 });
    // the pair a/y is graded again by b, and a/z by b with another prompt
    const again = [...old, row("b", "p1", "a/y"), row("b", "p2", "a/z")];
    expect(qrelProvenance(again)).toEqual({ judges: ["b"], prompts: ["p1", "p2"], unrecorded: 0 });
    expect(qrelProvenance([row("a", "p1", "a/y"), row(undefined, undefined, "a/y")])).toEqual({ judges: [], prompts: [], unrecorded: 1 }); // the later row is the one in force
  });

  test("warns when the rows hold more than one judge, or more than one prompt, and says nothing for one judge", () => {
    expect(mixedJudgesWarning([row(), row()])).toBeNull(); // a set graded before label wrote a judge is not a mix
    expect(mixedJudgesWarning([row("a"), row("a")])).toBeNull();
    expect(mixedJudgesWarning([row("a", "p1"), row("a", "p1")])).toBeNull();
    const two = mixedJudgesWarning([row("a"), row("b"), row()], "assets/qrels.jsonl") as string;
    expect(two).toStartWith("assets/qrels.jsonl holds grades from 2 judges (a, b), and 1 rows that record no judge.");
    expect(two).toContain("do not mix cleanly");
    expect(mixedJudgesWarning([row("a", "p1"), row("a", "p2")])).toStartWith("qrels.jsonl holds grades from 2 prompts.");
  });

  test("warns when one judge's grades sit beside rows that record no judge, which is what the library's grades are once label adds one", () => {
    const legacy = Array.from({ length: 3 }, () => row());
    const warning = mixedJudgesWarning([...legacy, row("new-judge", "p1")], "assets/qrels.jsonl") as string;
    expect(warning).toStartWith("assets/qrels.jsonl holds grades from 1 judge (new-judge), and 3 rows that record no judge.");
    expect(warning).toContain("do not mix cleanly");
  });

  test("does not warn once the pairs of the rows that record no judge are graded again by the one judge", () => {
    const legacy = [row(undefined, undefined, "a/y"), row(undefined, undefined, "a/z")];
    expect(mixedJudgesWarning([...legacy, row("j", "p1", "a/y")])).not.toBeNull();
    expect(mixedJudgesWarning([...legacy, row("j", "p1", "a/y"), row("j", "p1", "a/z")])).toBeNull();
    // and a grade of another judge that was graded again by this one does not count either
    expect(mixedJudgesWarning([row("old", "p1", "a/y"), row("j", "p1", "a/y")])).toBeNull();
  });
});

describe("the digests of a grade", () => {
  test("the prompt digest covers the version, the system text, the layout of the user message and the window", () => {
    const user = "Query: {query}\n\nCandidate asset:\nType: {type}\nRef: {ref}\nName: {name}\nDescription: {description}\n\nContent:\n{content}";
    expect(PROMPT_SHA256).toBe(sha256Text(JSON.stringify({ version: PROMPT_VERSION, system: JUDGE_SYSTEM_PROMPT, user, max_doc_chars: 16_000 })));
    // A change to the prompt makes this fail on purpose: grades made with another prompt carry another digest, and run warns about a mix.
    expect(PROMPT_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the asset digest is of the ref, the front matter and the text up to the judge's window", () => {
    const text = "---\nname: y\ndescription: d\n---\n# Title\nBody\n";
    const base = assetSha256("knowledge/y", text);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(assetSha256("knowledge/y", text)).toBe(base);
    expect(assetSha256("knowledge/other", text)).not.toBe(base); // another ref
    expect(assetSha256("knowledge/y", text.replace("Body", "Other body"))).not.toBe(base); // another text
    expect(assetSha256("knowledge/y", text.replace("description: d", "description: e"))).not.toBe(base); // the description the judge is shown
    const long = (tail: string) => `---\nname: y\n---\n${"z".repeat(MAX_DOC_CHARS)}${tail}`;
    expect(assetSha256("knowledge/y", long(" past the window"))).toBe(assetSha256("knowledge/y", long(" and another tail"))); // the judge does not read it
    expect(assetSha256("knowledge/y", `---\nname: y\n---\n${"z".repeat(MAX_DOC_CHARS - 1)}y`)).not.toBe(assetSha256("knowledge/y", long("")));
  });
});

describe("parseGrade", () => {
  test("reads the JSON the judge was asked for", () => {
    expect(parseGrade('{"grade": 2, "reason": "Useful."}')).toEqual({ grade: 2, reason: "Useful." });
    expect(parseGrade('{"grade": "3", "reason": "x"}')).toEqual({ grade: 3, reason: "x" });
    expect(parseGrade('{"grade": 1.6, "reason": "x"}')).toEqual({ grade: 2, reason: "x" });
    expect(parseGrade('{"grade": 0}')).toEqual({ grade: 0, reason: "" });
  });

  test("reads it from a fence, a thinking block or text around it", () => {
    expect(parseGrade('```json\n{"grade": 1, "reason": "r"}\n```')).toEqual({ grade: 1, reason: "r" });
    expect(parseGrade('<think>hmm {"grade": 3}</think>{"grade": 0, "reason": "r"}')).toEqual({ grade: 0, reason: "r" });
    expect(parseGrade('Here you go: {"grade": 2, "reason": "r"} Done.')).toEqual({ grade: 2, reason: "r" });
  });

  test("takes the last object that holds a grade when a reasoning model leaves its thinking in the reply", () => {
    expect(parseGrade('We must reply {"grade": <integer 0-3>, "reason": "..."}. The asset matches. Final: {"grade": 3, "reason": "exact match"}')).toEqual({ grade: 3, reason: "exact match" });
    expect(parseGrade('{"grade": 1, "reason": "a"} and then {"grade": 2, "reason": "b"}')).toEqual({ grade: 2, reason: "b" });
    expect(parseGrade('{"grade": 2, "reason": "a"} then {"grade": 9}')).toEqual({ grade: 2, reason: "a" });
    expect(parseGrade('{"grade": 3, "reason": "has {braces} inside"}')).toEqual({ grade: 3, reason: "has {braces} inside" });
    expect(parseGrade('{"grade": 1, "reason": "two\\nlines"}')).toEqual({ grade: 1, reason: "two lines" });
  });

  test("gives nothing for a reply without a grade from 0 to 3", () => {
    for (const reply of ["", "no json", '{"grade": 4, "reason": "x"}', '{"grade": -1}', '{"grade": null}', '{"reason": "x"}', '{"grade": "high"}', "[1]", '["grade"]']) expect(parseGrade(reply)).toBeNull();
  });
});

describe("scoreQuery", () => {
  const grades = { "a/x": 3, "a/y": 2, "a/z": 1, "a/w": 0 };

  test("scores the first ten results with grade 2 as the line", () => {
    const s = scoreQuery(grades, ["a/z", "a/x", "a/q", "a/y"]);
    expect(s).toMatchObject({ p_5: 0.4, success_5: true, mrr: 0.5, recall_10: 1, judged_10: 0.75 });
    const dcg = 1 + 7 / Math.log2(3) + 3 / Math.log2(5);
    const ideal = 7 + 3 / Math.log2(3) + 1 / Math.log2(4);
    expect(s.ndcg_10).toBeCloseTo(dcg / ideal, 4);
  });

  test("Success@5 and P@5 look at five places, MRR and Recall@10 at ten", () => {
    const refs = ["a/z", "a/w", "a/q1", "a/q2", "a/q3", "a/x", "a/y"];
    expect(scoreQuery(grades, refs)).toMatchObject({ p_5: 0, success_5: false, mrr: 0.1667, recall_10: 1 });
    expect(scoreQuery(grades, [...refs.slice(0, 5), "a/q4", "a/q5", "a/q6", "a/q7", "a/q8", "a/x"])).toMatchObject({ mrr: 0, recall_10: 0, success_5: false });
  });

  test("scores nothing returned as nothing found", () => {
    expect(scoreQuery(grades, [])).toEqual({ ndcg_10: 0, ndcg_10_condensed: 0, p_5: 0, success_5: false, mrr: 0, recall_10: 0, judged_10: null, banned_above: null, banned_above_first: null });
  });

  test("judged_10 is empty, not 1, when nothing was returned, and a mean leaves such a query out", () => {
    expect(scoreQuery(grades, []).judged_10).toBeNull();
    expect(scoreQuery(grades, ["a/q"]).judged_10).toBe(0);
    expect(summarize([scoreQuery(grades, []), scoreQuery(grades, ["a/q"]), scoreQuery(grades, ["a/x", "a/q"])]).judged_10).toBe(0.25);
    expect(summarize([scoreQuery(grades, [])]).judged_10).toBeNull();
  });

  describe("the nDCG of the judged results alone", () => {
    const g = { "a/x": 3, "a/y": 2, "a/z": 1 };
    const ideal = 7 + 3 / Math.log2(3) + 1 / Math.log2(4);

    test("takes the results nobody graded out of the list, so the judged ones move up", () => {
      const s = scoreQuery(g, ["a/q1", "a/q2", "a/x", "a/q3", "a/y"]);
      expect(s.ndcg_10).toBeCloseTo((7 / Math.log2(4) + 3 / Math.log2(6)) / ideal, 4);
      expect(s.ndcg_10_condensed).toBeCloseTo((7 + 3 / Math.log2(3)) / ideal, 4);
      expect(s.judged_10).toBeCloseTo(0.4, 4);
    });

    test("is never lower than nDCG@10, and equals it when every result is judged", () => {
      for (const refs of [["a/x", "a/y", "a/z"], ["a/z", "a/y", "a/x"], ["a/q", "a/z", "a/x"], ["a/q1", "a/q2"], []]) {
        const s = scoreQuery(g, refs);
        expect(s.ndcg_10_condensed).toBeGreaterThanOrEqual(s.ndcg_10);
        if (s.judged_10 === 1 || s.judged_10 === null) expect(s.ndcg_10_condensed).toBe(s.ndcg_10);
      }
    });

    test("is 0 when no result was judged, and is averaged with the others", () => {
      expect(scoreQuery(g, ["a/q1", "a/q2"]).ndcg_10_condensed).toBe(0);
      const rows = [scoreQuery(g, ["a/x", "a/y", "a/z"]), scoreQuery(g, ["a/q1", "a/q2"])];
      expect(summarize(rows).ndcg_10_condensed).toBe(0.5);
    });
  });

  describe("banned assets", () => {
    const g = { "a/x": 3, "a/y": 2, "a/old": 0, "a/off": 0 };
    const above = (refs: string[], banned = ["a/old", "a/off"]) => scoreQuery(g, refs, banned).banned_above;

    test("are above a relevant asset when one of them ranks before any relevant one", () => {
      expect(above(["a/old", "a/x", "a/y"])).toBe(true);
      expect(above(["a/x", "a/old", "a/y"])).toBe(true); // it outranks the second relevant asset, not only the first
      expect(above(["a/x", "a/y", "a/old"])).toBe(false);
      expect(above(["a/q", "a/x", "a/y", "a/q2", "a/off"])).toBe(false);
    });

    test("outrank a relevant asset that is not among the first 10, which ranks below every result", () => {
      expect(above(["a/x", "a/q", "a/off"])).toBe(true);
      expect(above(["a/x", "a/q", "a/q2"])).toBe(false);
      expect(above([...Array.from({ length: 10 }, (_, i) => `a/q${i}`), "a/x", "a/y", "a/old"])).toBe(false);
      expect(above(["a/q", "a/x", "a/y"].concat(Array.from({ length: 7 }, (_, i) => `a/p${i}`), "a/old"))).toBe(false); // the banned asset is at place 11
    });

    test("count only when the query bans some", () => {
      expect(scoreQuery(g, ["a/old", "a/x"]).banned_above).toBeNull();
      expect(scoreQuery(g, ["a/old", "a/x"]).banned_above_first).toBeNull();
      expect(above(["a/x", "a/y"], [])).toBeNull();
    });

    describe("above the first relevant asset", () => {
      const aboveFirst = (refs: string[], banned = ["a/old", "a/off"]) => scoreQuery(g, refs, banned).banned_above_first;

      test("is true only when a banned asset ranks before the first relevant one", () => {
        expect(aboveFirst(["a/old", "a/x", "a/y"])).toBe(true);
        expect(aboveFirst(["a/x", "a/old", "a/y"])).toBe(false); // it outranks the second relevant asset only
        expect(aboveFirst(["a/q", "a/x", "a/y", "a/off"])).toBe(false);
      });

      test("does not call a missing relevant asset a banned-above, as banned_above does", () => {
        const refs = ["a/x", "a/q", "a/off"]; // a/y is not among the results, so it ranks below the banned asset
        expect(above(refs)).toBe(true);
        expect(aboveFirst(refs)).toBe(false);
      });

      test("is true when no relevant asset is returned and a banned one is", () => {
        expect(aboveFirst(["a/q", "a/off"])).toBe(true);
        expect(aboveFirst(["a/q", "a/q2"])).toBe(false);
      });

      test("is averaged over the queries that ban an asset", () => {
        const rows = [scoreQuery(g, ["a/old", "a/x"], ["a/old"]), scoreQuery(g, ["a/x", "a/q", "a/old"], ["a/old"]), scoreQuery(g, ["a/x"])];
        expect(summarize(rows)).toMatchObject({ banned_above: 1, banned_above_first: 0.5 });
      });
    });
  });
});

describe("summarize and abstention", () => {
  test("averages over queries", () => {
    const a = scoreQuery({ "a/x": 3 }, ["a/x"]);
    const b = scoreQuery({ "a/x": 3 }, ["a/q"]);
    expect(summarize([a, b])).toEqual({ n: 2, ndcg_10: 0.5, ndcg_10_condensed: 0.5, p_5: 0.1, success_5: 0.5, mrr: 0.5, recall_10: 0.5, judged_10: 0.5, banned_above: null, banned_above_first: null });
    expect(summarize([])).toEqual({ n: 0, ndcg_10: null, ndcg_10_condensed: null, p_5: null, success_5: null, mrr: null, recall_10: null, judged_10: null, banned_above: null, banned_above_first: null });
  });

  test("averages the banned check over the queries that ban an asset only", () => {
    const g = { "a/x": 3, "a/old": 0 };
    const rows = [scoreQuery(g, ["a/old", "a/x"], ["a/old"]), scoreQuery(g, ["a/x", "a/old"], ["a/old"]), scoreQuery(g, ["a/x"]), scoreQuery(g, ["a/x", "a/q"], ["a/old"])];
    expect(summarize(rows).banned_above).toBeCloseTo(1 / 3, 4);
  });

  test("counts the inputs that got no result", () => {
    expect(abstention([0, 3, 10, 0])).toEqual({ n: 4, abstained: 2, rate: 0.5 });
    expect(abstention([])).toEqual({ n: 0, abstained: 0, rate: null });
  });
});


test("same-file ref classifications share relevance credit while raw refs remain intact", () => {
  const queries = [{ id: "q", query: "configure the tool", kind: "direct" }];
  const qrels = parseQrels([
    { id: "q", ref: "commands/guide", grade: 3, reason: "direct" },
    { id: "q", ref: "knowledge/guide", alias_of: "commands/guide", grade: 3, reason: "same file" },
  ].map(row => JSON.stringify(row)).join("\n"));
  const separate = casesOf(queries, qrels.map(({ alias_of: _alias, ...row }) => row))[0]!;
  expect(Object.keys(separate.grades)).toHaveLength(2); // spelling alone never merges assets
  const c = casesOf(queries, qrels)[0]!;
  const refs = ["knowledge/guide", "commands/guide"];
  const answer = { refs, seconds: 0.1 };
  const row = makeRow(c, { search: answer, curate: answer });
  expect(row.n_relevant).toBe(1);
  expect(row.search.refs).toEqual(refs);
  expect(row.search.grades).toEqual([3, 3]);
  expect(row.search.scores).toMatchObject({ ndcg_10: 1, recall_10: 1, judged_10: 1, p_5: 0.2 });
  expect(gradesByQuery([...qrels, { id: "q", ref: "knowledge/guide", grade: 1, reason: "later review" }]).get("q"))
    .toEqual({ "commands/guide": 1 });
});
