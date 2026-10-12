// What the longmemeval benchmark declares about its own measurement: which files collect, which files score, and how a stored question is
// scored again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { DATA_FILE, loadQuestions } from "./dataset.ts";
import { isAbstentionQuestion } from "./prompts.ts";
import { type Case, type Raw, type Row, errored, isAbstention, makeRow, rawOf, summarize } from "./score.ts";

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // What decides what akm, the model and the judge are asked and what is kept of their answers: the sandbox and the akm config, the commands,
  // the reader and judge prompts, the chat request, and the lib/ files that run akm.
  collector: ["benchmarks/longmemeval/src/collect.ts", "lib/akm/akm.ts"],
  // What turns the raw output of a question into a row and the rows into metrics. The labels are the questions (the dataset), digested per case.
  scorer: ["benchmarks/longmemeval/src/score.ts"],
  loadCases: (root, summary) => {
    // The public questions are fetched into the benchmark's assets. A custom corpus is in corpus_folder (scripts/rescore sets it from --cases when the
    // run could not record it), and a run from before the corpora were renamed (`private`) has the rewrite where generate-assets puts it.
    const folder =
      summary.corpus === "public"
        ? join(root, "benchmarks", NAME, "assets")
        : summary.corpus === "private"
          ? join(root, "private", NAME, "assets")
          : summary.corpus === "custom" && typeof summary.corpus_folder === "string"
            ? resolve(root, summary.corpus_folder)
            : null;
    if (folder === null) throw new Error("the summary does not say which folder holds its questions (a custom corpus outside the repository is not recorded), so there are no labels to score against");
    const file = join(folder, DATA_FILE);
    if (!existsSync(file)) throw new Error(`${relative(root, file)} is missing. A public corpus is fetched by a run of benchmarks/${NAME}/run; a custom one is made by ./generate-assets --only ${NAME}`);
    return loadQuestions(file);
  },
  legacyProblem: () => "its rows name the question as `question_id` and do not keep the raw output in the fields the scorer reads, so they cannot be paired with the questions here",
  caseId: (q) => q.question_id,
  // Everything the collector shows the model, the judge and akm: the question and its date, the sessions (as the reader reads them), and the
  // key the judge compares the answer with. The judge prompt depends on the type, and on the id (an abstention question).
  input: (q) => ({
    question_type: q.question_type,
    abstention: isAbstentionQuestion(q.question_id),
    question: q.question,
    question_date: q.question_date,
    answer: String(q.answer),
    haystack: q.haystack_sessions.map((turns, i) => ({ id: q.haystack_session_ids[i], date: q.haystack_dates[i], turns: turns.map((t) => [t.role, t.content]) })),
  }),
  // Everything score() reads of the question: its type, the sessions that hold the answer, and the text it copies into the row.
  labels: (q) => ({ question_type: q.question_type, abstention: isAbstention(q.question_id), question: q.question, expected: String(q.answer), answer_session_ids: q.answer_session_ids }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
