import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { loadCases, type Case } from "./inputs.ts";
import { PROMPT } from "./protocol.ts";
import { type Raw, type Row, errored, unfinished, makeRow, rawOf, summarize } from "./score.ts";

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: "memory-utility", version: "0.1",
  loadCases(root, summary) {
    if (summary.corpus === "public") return loadCases(join(root, "evals/memory-utility/assets"));
    if (summary.corpus !== "custom" || typeof summary.corpus_folder !== "string") throw new Error("custom memory-utility corpus needs --cases DIR");
    return loadCases(resolve(root, summary.corpus_folder));
  },
  caseId: c => c.id,
  input: c => ({ notes: c.notes, common: c.common, question: c.question, fields: Object.keys(c.fields).sort(), prompt: PROMPT }),
  labels: c => ({ category: c.category, fields: c.fields }),
  rawOf, score: makeRow, errored, unfinished, summarize,
};
