import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";
import { Akm } from "./akm.ts";
import { DATA_FILE, type Question } from "./dataset.ts";
import { assembleQuestion, commonWords, evidenceChecked, evidenceCoverage, evidenceKept, explodeQuestion, shiftTextDates, shiftYears } from "./generate.ts";
import { fakeAkmScript, sandboxRunning } from "./fakes.ts";
import { isAbstention, readSeed, resolveEndpoints, runCorpus } from "./run.ts";

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

  test("moves the dates written in a chat by whole calendar years, as a session's date moves", () => {
    const text = "Booked 2024-03-05 and 2024/03/05, then March 5th, 2024, 5 Mar 2024, Sept. 09 2024 and 29 February 2024.";
    expect(shiftTextDates(text, 1)).toBe("Booked 2023-03-05 and 2023/03/05, then March 5th, 2023, 5 Mar 2023, Sept. 09 2023 and 28 February 2023.");
    expect(shiftTextDates("2024-03-05 and 2020/02/29", 2)).toBe("2022-03-05 and 2018/02/28");
    // a count of 365 days would land on 2023-03-06
    expect(shiftTextDates("2024-03-05", 1)).toBe("2023-03-05");
    expect(shiftYears("2024/03/05 (Tue) 10:00", 1)).toStartWith("2023/03/05");
    // a bare year, a month and a year, a day that does not exist and a year outside lib/rewrite's range are not dates
    const kept = "In 2024, since March 2024, on Feb 30, 2024 or 2024-13-01 or 1850-01-01.";
    expect(shiftTextDates(kept, 1)).toBe(kept);
  });

  test("says which questions the evidence check covers: the ones whose answer is in the evidence word for word", () => {
    const q = (answer: string, text: string): Question => ({ ...original, answer, answer_session_ids: ["answer_1"], haystack_sessions: [[{ role: "user", content: text }], []] });
    const verbatim = q("Lisbon", "Priya flew to Lisbon");
    const counted = q("3", "I own Tom, Mia and Zed");
    const paraphrased = q("The capital of Portugal", "Priya flew to Lisbon");
    expect([verbatim, counted, paraphrased].map(evidenceChecked)).toEqual([true, false, false]);
    expect(evidenceCoverage([verbatim, counted, paraphrased])).toEqual({ questions: 3, checked: 1 });
    // the others pass the check whatever the rewrite did to them
    expect(evidenceKept(counted, { ...counted, answer: "4" })).toBe(true);
    expect(evidenceKept(verbatim, { ...verbatim, answer: "Kupa" })).toBe(false);
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

/** A model that reads the history it is given and a judge that compares the answer to the key. `bodies` keeps every request. */
function fakeEndpoint(counter = { requests: 0 }, reportedModel = "fake-model", bodies: { max_tokens?: number; temperature?: number; messages: { content: string }[] }[] = []) {
  return Bun.serve({
    port: 0,
    async fetch(req) {
      counter.requests++;
      const body = (await req.json()) as (typeof bodies)[number];
      bodies.push(body);
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

const digestIn = (folder: string, names: string[]): string => {
  const cwd = process.cwd();
  process.chdir(folder);
  try {
    return sha256Files(names);
  } finally {
    process.chdir(cwd);
  }
};

describe("runCorpus", () => {
  function setup(questions: Question[] = tinyDataset()) {
    const root = tmp();
    const assets = join(root, "assets");
    mkdirSync(assets);
    const data = JSON.stringify(questions);
    writeFileSync(join(assets, DATA_FILE), data);
    writeFileSync(join(assets, "ASSETS.lock"), JSON.stringify({ dataset: "tiny", source: "none", licence: "MIT", revision: "r".repeat(40), files: { [DATA_FILE]: { url: "http://unused", bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") } } }));
    const akm = new Akm(sandboxRunning(fakeAkmScript(root), dirs));
    return { root, akm, folders: { assets, results: join(root, "results") } };
  }

  test("answers each question without akm and with it, judges both, and reports both and the difference", async () => {
    const { akm, folders } = setup();
    const bodies: Parameters<typeof fakeEndpoint>[2] = [];
    server = fakeEndpoint({ requests: 0 }, "fake-model", bodies);
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
    // the abstention question has no session to find, so it is left out of the means and only counted
    expect(summary.metrics.retrieval).toMatchObject({ k: 5, n: 2, hit_rate: 0.5, zero_hit_rate: 0.5 });
    expect(summary.metrics.retrieval_abstention).toEqual({ n: 1 });
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
    expect(rows.map((r) => r.timed_out)).toEqual([false, false, false]);
    expect(rows.map((r) => [r.n_sessions, r.sessions_over_projection_limit])).toEqual([[4, 0], [4, 0], [3, 0]]);

    // what the run sent, and where: the temperature and the token limits, as the benchmark's evaluate_qa.py has them for the judge
    const host = `127.0.0.1:${server.port}`;
    expect(summary).toMatchObject({ model_endpoint: host, judge_endpoint: host, temperature: 0, max_tokens: { model: 512, judge: 10 }, search_mode: "keyword", reader_order: "haystack", seed: null, timeouts: 0, sessions_loaded: 11, sessions_over_projection_limit: 0 });
    expect(stored).toMatchObject({ model_endpoint: host, judge_endpoint: host, temperature: 0, max_tokens: { model: 512, judge: 10 }, search_mode: "keyword", seed: null });
    const graded = bodies.filter((b) => b.messages[0].content.includes("Model Response:"));
    expect(graded).toHaveLength(6);
    expect(graded.every((b) => b.max_tokens === 10 && b.temperature === 0)).toBe(true);
    expect(bodies.filter((b) => !graded.includes(b)).every((b) => b.max_tokens === 512 && b.temperature === 0)).toBe(true);
    // the files it read: the lock and the questions, by name, so the same files elsewhere give the same digest
    expect(summary.assets_sha256).toBe(digestIn(folders.assets, ["ASSETS.lock", DATA_FILE]));
    expect(stored.assets_sha256).toBe(summary.assets_sha256);
  });

  test("the summary names the files it read and, for a private run, the seed in private/seed", async () => {
    const { root, akm, folders } = setup();
    const retrieval = { akm, model: null, judge: null, version: "v" };
    const same = await quiet(() => runCorpus("public", { label: "a", sampleSeed: 1 }, retrieval, folders));
    // the same files in another folder, the same digest. Other data, another digest
    const moved = join(root, "elsewhere");
    cpSync(folders.assets, moved, { recursive: true });
    expect(digestIn(moved, ["ASSETS.lock", DATA_FILE])).toBe(same.assets_sha256);
    writeFileSync(join(moved, DATA_FILE), JSON.stringify(tinyDataset().slice(0, 2)));
    expect(digestIn(moved, ["ASSETS.lock", DATA_FILE])).not.toBe(same.assets_sha256);
    expect(same.seed).toBeNull();

    // private: rewrite.json and the questions, and the seed from private/seed, as the string it holds
    const assets = join(root, "private-assets");
    mkdirSync(assets);
    writeFileSync(join(assets, DATA_FILE), readFileSync(join(folders.assets, DATA_FILE)));
    writeFileSync(join(assets, "rewrite.json"), JSON.stringify({ derived_from: { revision: "r" }, tool: "lib/rewrite", years_back: 1, sha256: "declared" }));
    const seed = join(root, "seed");
    writeFileSync(seed, "18446744073709551615\n");
    const mine = { assets, results: join(root, "private-results"), seed };
    const priv = await quiet(() => runCorpus("private", { label: "p", sampleSeed: 1 }, retrieval, mine));
    expect(priv.seed).toBe("18446744073709551615");
    expect(priv.assets_sha256).toBe(digestIn(assets, ["rewrite.json", DATA_FILE]));
    expect(priv.assets_sha256).not.toBe(same.assets_sha256);
    expect(priv.dataset).toMatchObject({ tool: "lib/rewrite", file: DATA_FILE });
    // no seed file, or no integer in it: no seed
    expect((await quiet(() => runCorpus("private", { label: "q", sampleSeed: 1 }, retrieval, { ...mine, seed: join(root, "no-such-seed") }))).seed).toBeNull();
    expect(readSeed(undefined)).toBeNull();
    writeFileSync(seed, "not a seed\n");
    expect(readSeed(seed)).toBeNull();
    writeFileSync(seed, "42\nmore\n");
    expect(readSeed(seed)).toBe("42");
  });

  test("the reader gets the sessions akm returns in the order of the haystack, and not by rank", async () => {
    const sessions = [evidence("s0", "ALPHA gardening notes"), evidence("s1", "BETA something unrelated about tea"), evidence("s2", "OMEGA gardening with tomatoes planted")];
    const question: Question = {
      question_id: "q-order",
      question_type: "knowledge-update",
      question: "Which gardening tomatoes did I plant?",
      question_date: "2023/05/30 (Tue) 23:40",
      answer: "none",
      answer_session_ids: ["s2"],
      haystack_dates: sessions.map((s) => s.date),
      haystack_session_ids: sessions.map((s) => s.id),
      haystack_sessions: sessions.map((s) => s.turns),
    };
    const { akm, folders } = setup([question]);
    const bodies: Parameters<typeof fakeEndpoint>[2] = [];
    server = fakeEndpoint({ requests: 0 }, "fake-model", bodies);
    const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "m" };
    const summary = await quiet(() => runCorpus("public", { label: "o", sampleSeed: 1 }, { akm, model: endpoint, judge: endpoint, version: "v" }, folders));
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const row = JSON.parse(readFileSync(join(dir, "samples.jsonl"), "utf8").trim());
    // akm ranks s2 (three of the question's words) above s0 (one), and that rank order is what the metrics and the row keep
    expect(row.retrieved_session_ids).toEqual(["s2", "s0"]);
    expect(summary.metrics.retrieval).toMatchObject({ n: 1, hit_rate: 1, mrr: 1 });
    const prompts = bodies.map((b) => b.messages[0].content).filter((p) => p.includes("History Chats:"));
    const [withoutAkm, withAkm] = prompts;
    // the baseline reads the haystack, s0 before s2. So does the arm with akm, with only the sessions akm returned
    expect(withoutAkm.indexOf("ALPHA")).toBeLessThan(withoutAkm.indexOf("OMEGA"));
    expect(withAkm).toContain("### Session 1\nSession Date: 2023/05/20 (Sat) 02:21\nuser: ALPHA gardening notes");
    expect(withAkm).toContain("### Session 2\nSession Date: 2023/05/20 (Sat) 02:21\nuser: OMEGA gardening with tomatoes planted");
    expect(withAkm).not.toContain("BETA");
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
      expect(summary.metrics.retrieval).toMatchObject({ n: 2, hit_rate: 0.5 });
      expect(summary.metrics.retrieval_abstention).toEqual({ n: 1 });
      expect(summary).toMatchObject({ model_endpoint: null, judge_endpoint: null, temperature: null, max_tokens: null });
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
    expect(stored.metrics.retrieval).toMatchObject({ n: 2, hit_rate: 0.5 });
    expect(stored.metrics.accuracy.without_akm).toMatchObject({ n: 0, n_errored: 3 });
  });

  test("a broken akm stops the run too, with or without a model", async () => {
    const { root, folders } = setup();
    const broken = join(root, "broken-akm.ts");
    writeFileSync(broken, 'if (process.argv[2] === "--version") console.log("0.9.99"); else { console.error("index is broken"); process.exit(1); }');
    const akm = new Akm(sandboxRunning(broken, dirs));
    await expect(quiet(() => runCorpus("public", { label: "b", sampleSeed: 1 }, { akm, model: null, judge: null, version: "v" }, folders))).rejects.toThrow("akm could not search the first 3 questions");
    const stored = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0], "summary.json"), "utf8"));
    expect(stored).toMatchObject({ complete: false, n_run: 3, n_scored: 0, timeouts: 0 });
    const rows = readFileSync(join(folders.results, readdirSync(folders.results)[0], "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.timed_out)).toEqual([false, false, false]);
  });

  test("an akm command that takes too long is a timeout, which the rows and the summary say", async () => {
    const { root, folders } = setup();
    const akm = new Akm(sandboxRunning(fakeAkmScript(root), dirs, { env: { FAKE_AKM_SLEEP: "5000" } }), "keyword", 300);
    await expect(quiet(() => runCorpus("public", { label: "slow", sampleSeed: 1 }, { akm, model: null, judge: null, version: "v" }, folders))).rejects.toThrow("akm could not search the first 3 questions");
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ complete: false, n_run: 3, n_errored: 3, timeouts: 3 });
    expect(stored.notes[0]).toContain("akm timed out on 3 of 3 questions");
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => [r.timed_out, r.retrieval_error])).toEqual(Array(3).fill([true, "akm index timed out after 0.3s"]));
  });

  test("--semantic: every search has to come back semantic, and the summary says which mode ran", async () => {
    const { root, folders } = setup();
    const script = fakeAkmScript(root);
    const semantic = new Akm(sandboxRunning(script, dirs, { semantic: true }), "semantic");
    const summary = await quiet(() => runCorpus("public", { label: "s", sampleSeed: 1 }, { akm: semantic, model: null, judge: null, version: "v" }, folders));
    expect(summary).toMatchObject({ search_mode: "semantic", n_run: 3, n_errored: 0 });
    expect(summary.metrics.retrieval).toMatchObject({ n: 2, hit_rate: 0.5 });
    // an answer that fell back to keywords is an errored call, and the run stops when akm cannot search at all
    const fallback = new Akm(sandboxRunning(script, dirs, { semantic: true, env: { FAKE_AKM_SEARCH_MODE: "fts-fallback" } }), "semantic");
    await expect(quiet(() => runCorpus("public", { label: "f", sampleSeed: 1 }, { akm: fallback, model: null, judge: null, version: "v" }, folders))).rejects.toThrow("akm could not search the first 3 questions");
    const dir = join(folders.results, readdirSync(folders.results).find((d) => d.endsWith("-f")) as string);
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.retrieval_error)).toEqual(Array(3).fill(expect.stringContaining("akm searched with fts-fallback, not semantic")));
    expect(rows.every((r) => r.timed_out === false && r.retrieval === null)).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"))).toMatchObject({ search_mode: "semantic", complete: false, timeouts: 0 });
  });

  test("resume checks the akm command and build, the search mode and the hosts, and marks the folder as running", async () => {
    const { akm, folders } = setup();
    server = fakeEndpoint();
    const endpoint = { baseUrl: `http://127.0.0.1:${server.port}/v1`, apiKey: "", model: "fake-model" };
    const build = { akm_bin: "bun ~/code/akm/src/cli.ts", akm_build: "v0.9.26-1-gabc123" as string | null };
    const context = { akm, model: endpoint, judge: { ...endpoint, model: "fake-judge" }, version: "v", build };
    await quiet(() => runCorpus("public", { label: "t", sampleSeed: 1 }, context, folders));
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    expect(JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"))).toMatchObject(build);
    const resume = (c: typeof context) => quiet(() => runCorpus("public", { label: "t", sampleSeed: 1, resume: dir }, c, folders));
    const marker = join(dir, ".running");
    rmSync(marker, { force: true }); // the first run marked the folder, and its process is this one

    // two builds of one version are two runs, and so are two commands, and a git build against an installed release
    await expect(resume({ ...context, build: { ...build, akm_build: "v0.9.26-2-gdef456" } })).rejects.toThrow("different akm build (v0.9.26-1-gabc123, now v0.9.26-2-gdef456)");
    await expect(resume({ ...context, build: { ...build, akm_bin: "akm" } })).rejects.toThrow("different akm command (bun ~/code/akm/src/cli.ts, now akm)");
    await expect(resume({ ...context, build: { ...build, akm_build: null } })).rejects.toThrow("different akm build (v0.9.26-1-gabc123, now none)");
    // keyword and semantic search are two runs
    const semantic = new Akm(sandboxRunning(fakeAkmScript(tmp()), dirs, { semantic: true }), "semantic");
    await expect(resume({ ...context, akm: semantic })).rejects.toThrow("different search mode (keyword, now semantic)");
    // the same model name at another host is another model, and so is the judge
    const other = fakeEndpoint();
    try {
      const elsewhere = `http://127.0.0.1:${other.port}/v1`;
      await expect(resume({ ...context, model: { ...endpoint, baseUrl: elsewhere } })).rejects.toThrow(`different model endpoint (127.0.0.1:${server.port}, now 127.0.0.1:${other.port})`);
      await expect(resume({ ...context, judge: { ...endpoint, model: "fake-judge", baseUrl: elsewhere } })).rejects.toThrow("different judge endpoint");
    } finally {
      other.stop(true);
    }
    expect(existsSync(marker)).toBe(false); // a resume that was refused marks nothing

    // the same settings carry on, and the folder is marked as running again, by this process, until it ends
    await resume(context);
    expect(readFileSync(marker, "utf8").trim()).toBe(String(process.pid));

    // a summary from before the summary held these settings is not resumed
    const { search_mode: _mode, ...older } = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    writeFileSync(join(dir, "summary.json"), JSON.stringify(older));
    await expect(resume(context)).rejects.toThrow("older version of this eval");
  });
});

describe("resolveEndpoints", () => {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const gateway = { MODEL_BASE_URL: "http://gateway.example/v1", MODEL_API_KEY: "gateway-key", MODEL_NAME: "gateway-model", JUDGE_MODEL: "judge-id" };
  const entries = { "my-local": { base_url: "http://local.example:8080/v1", api_key_env: "LOCAL_KEY" } };

  test("a judge with no endpoint of its own goes where the model goes, also when --model names a models.json line", () => {
    const env: Record<string, string | undefined> = { ...gateway, LOCAL_KEY: "local-key" };
    const { model, judge } = resolveEndpoints({ model: "my-local" }, fail, env, entries);
    expect(model).toEqual({ baseUrl: "http://local.example:8080/v1", apiKey: "local-key", model: "my-local" });
    expect(judge).toEqual({ baseUrl: "http://local.example:8080/v1", apiKey: "local-key", model: "judge-id" });
    // the model's settings are written to MODEL_*, as before
    expect(env.MODEL_BASE_URL).toBe("http://local.example:8080/v1");
  });

  test("a judge with its own JUDGE_BASE_URL, or its own models.json line, goes there", () => {
    const env: Record<string, string | undefined> = { ...gateway, LOCAL_KEY: "local-key", JUDGE_BASE_URL: "http://judge.example/v1", JUDGE_API_KEY: "judge-key" };
    expect(resolveEndpoints({ model: "my-local" }, fail, env, entries).judge).toEqual({ baseUrl: "http://judge.example/v1", apiKey: "judge-key", model: "judge-id" });
    const lines = { ...entries, "judge-id": { base_url: "http://line.example/v1" } };
    expect(resolveEndpoints({ model: "my-local" }, fail, { ...gateway, LOCAL_KEY: "k" }, lines).judge).toEqual({ baseUrl: "http://line.example/v1", apiKey: "", model: "judge-id" });
  });

  test("a model behind the gateway has the judge there too", () => {
    const { model, judge } = resolveEndpoints({ model: "some-gateway-model", "judge-model": "other-judge" }, fail, { ...gateway }, entries);
    expect(model).toEqual({ baseUrl: "http://gateway.example/v1", apiKey: "gateway-key", model: "some-gateway-model" });
    expect(judge).toEqual({ baseUrl: "http://gateway.example/v1", apiKey: "gateway-key", model: "other-judge" });
  });
});

describe("isAbstention", () => {
  test("is the benchmark's rule: _abs is somewhere in the question id", () => {
    expect(isAbstention("6d550036_abs")).toBe(true);
    expect(isAbstention("6d550036_abs_2")).toBe(true);
    expect(isAbstention("6d550036")).toBe(false);
    expect(isAbstention("absolute_value")).toBe(false);
  });
});
