import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Akm } from "./akm.ts";
import { DATA_FILE, type Question } from "./dataset.ts";
import { assembleQuestion, commonWords, evidenceKept, explodeQuestion, shiftYears } from "./generate.ts";
import { fakeAkmScript, sandboxRunning } from "./fakes.ts";
import { runCorpus } from "./run.ts";

const dirs: string[] = [];
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
  server?.stop(true);
  server = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "lme-pipeline-"));
  dirs.push(d);
  return d;
};

const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};

describe("generate", () => {
  test("moves a date back by whole years and fixes the weekday", () => {
    expect(shiftYears("2023/05/20 (Sat) 02:21", 2)).toBe("2021/05/20 (Thu) 02:21");
    expect(shiftYears("2024/02/20 (Tue) 23:40", 1)).toBe("2023/02/20 (Mon) 23:40");
    expect(() => shiftYears("May 20, 2023", 1)).toThrow("unexpected date format");
  });

  const original: Question = {
    question_id: "q1",
    question_type: "multi-session",
    question: "Where did Priya go?\n",
    question_date: "2023/05/30 (Tue) 23:40",
    answer: 7,
    answer_session_ids: ["answer_1"],
    haystack_dates: ["2023/05/20 (Sat) 02:21", "2023/05/21 (Sun) 10:00"],
    haystack_session_ids: ["answer_1", "filler_1"],
    haystack_sessions: [
      [
        { role: "user", content: "line one\n\n  indented\ttab\nlast line\n", has_answer: true } as never,
        { role: "assistant", content: "" },
      ],
      [],
    ],
  };

  test("explode and assemble give the question back, with only the dates moved", () => {
    const back = assembleQuestion(original, explodeQuestion(original), 1);
    expect(back).toEqual({ ...original, question_date: "2022/05/30 (Mon) 23:40", haystack_dates: ["2022/05/20 (Fri) 02:21", "2022/05/21 (Sat) 10:00"] });
    expect(back.haystack_sessions[0][0]).toMatchObject({ has_answer: true, content: "line one\n\n  indented\ttab\nlast line\n" });
  });

  test("a rewrite that changes a name changes it in the question, the answer and the sessions", () => {
    const q: Question = { ...original, answer: "Lisbon", haystack_sessions: [[{ role: "user", content: "Priya flew to Lisbon" }], []] };
    const text = explodeQuestion(q).replaceAll("Priya", "Zeno").replaceAll("Lisbon", "Kupa");
    const back = assembleQuestion(q, text, 1);
    expect(back.question).toBe("Where did Zeno go?\n");
    expect(back.answer).toBe("Kupa");
    expect(back.haystack_sessions[0][0].content).toBe("Zeno flew to Kupa");
  });

  test("knows when a rewrite took the answer out of the evidence", () => {
    const q: Question = { ...original, answer: "Lisbon", haystack_sessions: [[{ role: "user", content: "Priya flew to Lisbon" }], [{ role: "user", content: "elsewhere" }]] };
    const both = assembleQuestion(q, explodeQuestion(q).replaceAll("Lisbon", "Kupa"), 1);
    expect(both.answer).toBe("Kupa");
    expect(evidenceKept(q, both)).toBe(true);
    // the answer was renamed and the evidence was not
    expect(evidenceKept(q, { ...assembleQuestion(q, explodeQuestion(q), 1), answer: "Kupa" })).toBe(false);
    // an answer that was never in the evidence has nothing to keep
    expect(evidenceKept({ ...q, answer: "42" }, { ...both, answer: "43" })).toBe(true);
  });

  test("refuses text that looks like a marker, and a rewrite that changed the shape", () => {
    expect(() => explodeQuestion({ ...original, question: "a\n@@answer\nb" })).toThrow("looks like a marker");
    expect(() => assembleQuestion(original, explodeQuestion(original).replace("<<assistant>>", "<<user>>"), 1)).toThrow("expected <<assistant>>");
  });

  test("finds the ordinary words, and leaves out the words in web addresses", () => {
    const text = `${"I like food and the weather. ".repeat(30)}Visit www.restaurant.com or ${"restaurant.org ".repeat(30)}and mail priya@kupa.dev`;
    expect(commonWords([text])).toEqual(["and", "food", "like", "the", "weather"]);
    expect(commonWords([text], 32)).toEqual([]);
  });
});

const evidence = (id: string, text: string) => ({ id, date: "2023/05/20 (Sat) 02:21", turns: [{ role: "user", content: text }, { role: "assistant", content: "Noted." }] });

function tinyDataset(): Question[] {
  const fill = (n: number) => Array.from({ length: n }, (_, i) => evidence(`filler_${i}`, `Chat number ${i} about gardening and tea.`));
  const make = (id: string, type: string, question: string, answer: string, ev: ReturnType<typeof evidence>[], evidenceIds: string[]): Question => {
    const sessions = [...fill(2), ...ev, ...fill(1).map((s) => ({ ...s, id: `${s.id}_b` }))];
    return {
      question_id: id,
      question_type: type,
      question,
      question_date: "2023/05/30 (Tue) 23:40",
      answer,
      answer_session_ids: evidenceIds,
      haystack_dates: sessions.map((s) => s.date),
      haystack_session_ids: sessions.map((s) => s.id),
      haystack_sessions: sessions.map((s) => s.turns),
    };
  };
  return [
    make("q-secret", "multi-session", "What is the secret answer?", "BLUE42", [evidence("answer_1", "The secret answer is BLUE42.")], ["answer_1"]),
    make("q-cats", "temporal-reasoning", "How many companions do I own?", "3", [evidence("answer_2", "I own 3 cats named Tom, Mia and Zed.")], ["answer_2"]),
    make("q-passport_abs", "single-session-user", "What is my passport identifier?", "You never mentioned it.", [], []),
  ];
}

/** A model that reads the history it is given and a judge that compares the answer to the key. */
function fakeEndpoint(counter = { requests: 0 }, reportedModel = "fake-model") {
  return Bun.serve({
    port: 0,
    async fetch(req) {
      counter.requests++;
      const body = (await req.json()) as { messages: { content: string }[] };
      const prompt = body.messages[0].content;
      const text = (() => {
        if (prompt.includes("Model Response:")) {
          const key = /Correct Answer: (.*)/.exec(prompt)?.[1];
          const response = /Model Response: (.*)/.exec(prompt)?.[1] ?? "";
          return key === undefined ? (response.includes("do not know") ? "yes" : "no") : response.includes(key) ? "yes" : "no";
        }
        if (prompt.includes("BLUE42")) return "BLUE42";
        if (prompt.includes("3 cats")) return "3";
        return "I do not know";
      })();
      return Response.json({ model: reportedModel, choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    },
  });
}

describe("runCorpus", () => {
  function setup() {
    const root = tmp();
    const assets = join(root, "assets");
    mkdirSync(assets);
    const data = JSON.stringify(tinyDataset());
    writeFileSync(join(assets, DATA_FILE), data);
    writeFileSync(join(assets, "ASSETS.lock"), JSON.stringify({ dataset: "tiny", source: "none", licence: "MIT", revision: "r".repeat(40), files: { [DATA_FILE]: { url: "http://unused", bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") } } }));
    const akm = new Akm(sandboxRunning(fakeAkmScript(root), dirs));
    return { root, akm, folders: { assets, results: join(root, "results") } };
  }

  test("answers each question without akm and with it, judges both, and reports both and the difference", async () => {
    const { akm, folders } = setup();
    server = fakeEndpoint();
    const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "fake-model" };
    const quiet = console.log;
    console.log = () => {};
    let summary: Awaited<ReturnType<typeof runCorpus>>;
    try {
      summary = await runCorpus("public", { label: "t", sampleSeed: 1 }, { akm, model: endpoint, judge: { ...endpoint, model: "fake-judge" }, version: "0.9.99-test" }, folders);
    } finally {
      console.log = quiet;
    }
    const acc = summary.metrics.accuracy;
    expect(acc?.without_akm).toMatchObject({ n: 3, correct: 3, n_errored: 0 });
    expect(acc?.with_akm).toMatchObject({ n: 3, correct: 2, n_errored: 0 });
    expect(acc?.difference).toMatchObject({ n: 3, value: -0.3333, both_correct: 2, only_without_akm: 1, only_with_akm: 0, neither: 0 });
    expect(summary.metrics.retrieval).toMatchObject({ k: 5, n: 3, hit_rate: 0.3333, zero_hit_rate: 0.6667 });
    expect(summary).toMatchObject({ n_run: 3, n_scored: 3, n_errored: 0, complete: true, akm_version: "0.9.99-test", model: "fake-model", judge_model: "fake-judge", observed_models: ["fake-model"] });
    expect(summary.notes[0]).toContain("not gpt-4o-2024-08-06");
    expect(summary.notes[0]).toContain("it answered as fake-model");

    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored.results_dir).toBeUndefined();
    expect(stored.dataset).toMatchObject({ name: "tiny", revision: "r".repeat(40) });
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.question_id)).toEqual(["q-secret", "q-cats", "q-passport_abs"]);
    expect(rows[1].with_akm.hypothesis).toBe("I do not know");
    expect(rows[1].without_akm).toMatchObject({ hypothesis: "3", correct: true, verdict: "yes" });
    expect(rows[0].retrieved_session_ids).toEqual(["answer_1"]);
    expect(rows[2].abstention).toBe(true);
  });

  test("a judge that answers as the benchmark's judge leaves no note, and one that is only called gpt-4o does not", async () => {
    const { akm, folders } = setup();
    server = fakeEndpoint();
    const judgeServer = fakeEndpoint({ requests: 0 }, "gpt-4o-2024-08-06");
    try {
      const model = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "fake-model" };
      const judge = { baseUrl: `http://127.0.0.1:${judgeServer.port}/v1`, apiKey: "", model: "gpt-4o" };
      const summary = await quiet(() => runCorpus("public", { label: "j", sampleSeed: 1 }, { akm, model, judge, version: "v" }, folders));
      expect(summary.notes).toEqual([]);
      expect(summary.observed_judge_models).toEqual(["gpt-4o-2024-08-06"]);
      expect(summary.judge_model).toBe("gpt-4o");
      // the same name answering as another snapshot is not the benchmark's judge
      const other = fakeEndpoint({ requests: 0 }, "gpt-4o-mini-2024-07-18");
      try {
        const again = await quiet(() => runCorpus("public", { label: "k", sampleSeed: 1 }, { akm, model, judge: { ...judge, baseUrl: `http://127.0.0.1:${other.port}/v1` }, version: "v" }, folders));
        expect(again.notes[0]).toContain("it answered as gpt-4o-mini-2024-07-18");
      } finally {
        other.stop(true);
      }
    } finally {
      judgeServer.stop(true);
    }
  });

  test("resume carries on a stopped run and asks only what is left", async () => {
    const { akm, folders } = setup();
    const counter = { requests: 0 };
    server = fakeEndpoint(counter);
    const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "fake-model" };
    const context = { akm, model: endpoint, judge: { ...endpoint, model: "fake-judge" }, version: "v" };
    const quiet = console.log;
    console.log = () => {};
    try {
      await runCorpus("public", { label: "t", sampleSeed: 1 }, context, folders);
      expect(counter.requests).toBe(12); // three questions, two answers and two verdicts each
      const dir = join(folders.results, readdirSync(folders.results)[0]);
      const lines = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n");
      writeFileSync(join(dir, "samples.jsonl"), `${lines[0]}\n${lines[1].slice(0, 40)}`); // one done, one cut short
      counter.requests = 0;
      const summary = await runCorpus("public", { label: "t", sampleSeed: 1, resume: dir }, context, folders);
      expect(counter.requests).toBe(8);
      expect(summary).toMatchObject({ n_run: 3, n_scored: 3, complete: true });
      expect(summary.metrics.accuracy?.difference).toMatchObject({ n: 3, value: -0.3333 });
      const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(rows.map((r) => r.question_id)).toEqual(["q-secret", "q-cats", "q-passport_abs"]);
      expect(readdirSync(folders.results)).toHaveLength(1);
      // a different judge is a different run
      await expect(runCorpus("public", { label: "t", sampleSeed: 1, resume: dir }, { ...context, judge: { ...endpoint, model: "other-judge" } }, folders)).rejects.toThrow("different judge");
      await expect(runCorpus("public", { label: "t", sampleSeed: 1, resume: dir }, { ...context, version: "0.9.100" }, folders)).rejects.toThrow("different akm version");
    } finally {
      console.log = quiet;
    }
  });

  test("with no model it only measures what akm retrieves", async () => {
    const { akm, folders } = setup();
    const quiet = console.log;
    console.log = () => {};
    try {
      const summary = await runCorpus("public", { label: "r", sampleSeed: 1 }, { akm, model: null, judge: null, version: "v" }, folders);
      expect(summary.metrics.accuracy).toBeNull();
      expect(summary).toMatchObject({ retrieval_only: true, n_run: 3, n_scored: 3, model: null });
      expect(summary.metrics.retrieval.hit_rate).toBe(0.3333);
    } finally {
      console.log = quiet;
    }
  });

  test("an endpoint that cannot answer stops the run, and what akm retrieved is kept", async () => {
    const { akm, folders } = setup();
    server = Bun.serve({ port: 0, fetch: () => new Response("context length exceeded", { status: 400 }) });
    const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
    await expect(quiet(() => runCorpus("public", { label: "e", sampleSeed: 1 }, { akm, model: endpoint, judge: endpoint, version: "v" }, folders))).rejects.toThrow("could not be answered and graded");
    const stored = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0], "summary.json"), "utf8"));
    expect(stored).toMatchObject({ complete: false, n_run: 3, n_scored: 0, n_errored: 3 });
    expect(stored.metrics.retrieval).toMatchObject({ n: 3, hit_rate: 0.3333 });
    expect(stored.metrics.accuracy.without_akm).toMatchObject({ n: 0, n_errored: 3 });
  });

  test("a broken akm stops the run too, with or without a model", async () => {
    const { root, folders } = setup();
    const broken = join(root, "broken-akm.ts");
    writeFileSync(broken, 'if (process.argv[2] === "--version") console.log("0.9.99"); else { console.error("index is broken"); process.exit(1); }');
    const akm = new Akm(sandboxRunning(broken, dirs));
    await expect(quiet(() => runCorpus("public", { label: "b", sampleSeed: 1 }, { akm, model: null, judge: null, version: "v" }, folders))).rejects.toThrow("akm could not search the first 3 questions");
    const stored = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0], "summary.json"), "utf8"));
    expect(stored).toMatchObject({ complete: false, n_run: 3, n_scored: 0 });
  });
});
