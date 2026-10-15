/** Public presentation of published reports; never imports the eval collector or rescores samples. */
import { type Score, scores, testInfo } from "./presentation";
import { type Cell, comparisonFields } from "./comparison";
type ObjectValue = Record<string, unknown>;
export interface LedgerRun {
  id: string;
  suite: string;
  collection: string;
  mode: string;
  label: string;
  date: string;
  model: string;
  role: "Full suite" | "Pilot" | "Diagnostic";
  akm_version: string;
  measurement: string;
  recorded: number | null;
  scored: number | null;
  errors: number | null;
  notes: string;
  source_commit: string;
  harness_sha256: string;
  metrics: ObjectValue;
  summary_url: string;
  samples_url: string;
  test_name: string;
  test_description: string;
  test_url: string;
  scores: Score[];
  comparison: Record<string, Cell>;
}
export interface RunInput {
  summary: unknown;
  samples: unknown[] | null;
  path: string;
  sourceRevision: string;
}

export function object(value: unknown): ObjectValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : {};
}
function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => object(current)[key], value);
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function n(value: unknown, path: string): number | null {
  return number(at(value, path));
}
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
export function publicText(value: string): string {
  return value
    .replace(/(https?:\/\/)[^\s/@]+@/g, "$1")
    .replace(
      /https?:\/\/(?:localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[^\s/:]+\.(?:lab\.[^\s/:]+|local))[^\s<>"']*/g,
      "[private endpoint]",
    )
    .replace(/\/(?:home|Users)\/[^\s/]+/g, "~");
}
function publicValue(value: unknown): unknown {
  if (typeof value === "string") return publicText(value);
  if (Array.isArray(value)) return value.map(publicValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [publicText(key), publicValue(child)]));
  }
  return value;
}
export function presentRun(input: RunInput): LedgerRun | null {
  const s = object(input.summary);
  if (s.corpus !== "public") return null;
  const suite = text(s.eval);
  const label = text(s.label);
  const m = object(s.metrics);
  const recorded = input.samples?.length ?? n(s, "n_queries") ?? n(s, "n_tasks") ?? n(s, "n_items") ?? n(s, "sample.n");
  const errorModes = Object.values(object(s.errored)).map(number);
  const modeErrors = errorModes.length && errorModes.every((value): value is number => value !== null)
    ? errorModes.reduce((sum, value) => sum + value, 0) : null;
  const errors = n(s, "n_errored") ?? modeErrors;
  let scored = n(s, "n_scored");
  if (scored === null) {
    if (suite === "nightly") scored = n(m, "items.n");
    else if (suite === "promotion") scored = n(m, "proposals.n");
    else if (suite === "skillret") scored = n(s, "n_queries");
    else if (suite === "agent-ab" || suite === "terminal-bench") {
      const control = n(m, "control.scored"),
        akm = n(m, "akm.scored");
      if (control !== null && akm !== null) scored = Math.min(control, akm);
    }
  }
  const sample = object(s.sample);
  const sampleN = number(sample.n),
    total = number(sample.total);
  let role: LedgerRun["role"] =
    s.limit || sample.limit || (sampleN !== null && total !== null && sampleN < total) ? "Pilot" : "Full suite";
  const notes: string[] = [];
  if (s.status !== undefined && s.status !== "complete") {
    role = "Diagnostic";
    notes.push(`Status: ${publicText(String(s.status))}. Saved results cover only the recorded work.${typeof s.aborted_reason === "string" ? ` ${publicText(s.aborted_reason)}` : ""}`);
  } else if (s.status === undefined) notes.push("Legacy result: completion status was not recorded.");
  if (Array.isArray(s.notes))
    notes.push(...s.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0).map(publicText));
  if (s.resumed === true) notes.push("Resumed from saved cases; full run wall time is unknown.");
  if (suite === "agent-ab" && label === "bifrost-gpt120-pilot") {
    role = "Diagnostic";
    notes.push(
      "This trial used a plugin that could not run with AKM CLI 0.10. Use it to inspect the compatibility failure, not to estimate task performance.",
    );
  }
  if (role === "Pilot") notes.push("Only part of this test was run. The score does not estimate full-test performance.");
  const rows = input.samples?.map(object) ?? [];
  if (suite === "longmemeval") {
    const undecidable = n(s, "judge_undecidable");
    if (undecidable !== null && undecidable > 0)
      notes.push(`${undecidable} judge response${undecidable === 1 ? " was" : "s were"} undecidable.`);
    const inconsistent = rows.filter((row) => {
      const without = object(row.without_akm), withAkm = object(row.with_akm);
      const answer = text(without.hypothesis).trim();
      return without.ok === true && withAkm.ok === true && answer !== "" && answer === text(withAkm.hypothesis).trim()
        && typeof without.correct === "boolean" && typeof withAkm.correct === "boolean" && without.correct !== withAkm.correct;
    }).length;
    if (inconsistent)
      notes.push(`${inconsistent} identical answer${inconsistent === 1 ? "" : "s"} received different grades across arms.`);
  }
  const layout = rows.filter((row) => /Reflect refused: the file for/.test(text(row.error))).length;
  const missing = rows.filter((row) => /ASSET_NOT_FOUND/.test(text(row.error))).length;
  if (layout)
    notes.push(
      `${layout} AKM file-layout refusals: the proposed repair destination did not match the indexed file. These cases could not be scored.`,
    );
  if (missing)
    notes.push(`${missing} cases failed because the test runner sent feedback to an asset reference AKM could not find. The lookup was fixed in akm-eval v0.4.`);
  if (suite === "retrieval")
    notes.push(
      "Search scores cover task queries with relevance judgments. Notification queries are counted in recorded cases but do not enter these scores.",
    );
  if (suite === "longmemeval" && role === "Pilot" && label === "bifrost-gpt120-pilot")
    notes.push(
      "This trial used a Qwen answer judge. The benchmark normally uses GPT-4o. One AKM answer call failed with HTTP 429 and three control answers reached the token limit.",
    );
  if (suite === "skillret")
    notes.push(
      "Keyword and semantic search use the same query set. These scores measure skill ranking, without generating answers.",
    );
  if (input.samples === null)
    notes.push("The case-by-case file is missing. Case counts come from the summary where available.");
  let model = text(s.model);
  if (!model) {
    const mode =
      typeof s.search_mode === "string"
        ? s.search_mode
        : Object.values(object(s.search_mode))
            .filter((value) => typeof value === "string")
            .join(" + ");
    model = `No LLM · ${mode || text(s.mode) || "retrieval"}`;
  }
  if (model.includes("qwen3.8-27b"))
    notes.push("The model was served from a pool. The reports do not identify a fixed quantization or GPU allocation for each run.");
  const measurement = text(at(s, "manifest.collector.version")) || "Unspecified";
  const reportPath = input.path.split("/").map(encodeURIComponent).join("/");
  const base = `https://github.com/itlackey/akm-eval/blob/${encodeURIComponent(input.sourceRevision)}/reports/${reportPath}`;
  return {
    id: input.path,
    suite: publicText(suite),
    collection: publicText(text(s.collection)),
    mode: publicText(text(s.mode)),
    label: publicText(label),
    date: text(s.date),
    model: publicText(model),
    role,
    akm_version: text(s.akm_version) || "Unspecified",
    measurement,
    recorded,
    scored,
    errors,
    notes: notes.join(" "),
    source_commit: text(s.git_commit),
    harness_sha256: text(s.harness_sha256),
    metrics: object(publicValue(m)),
    summary_url: `${base}/summary.json`,
    samples_url: `${base}/samples.jsonl`,
    test_name: testInfo(suite).name,
    test_description: testInfo(suite).description,
    test_url: testInfo(suite).documentation.replace("/tree/main/", `/tree/${encodeURIComponent(input.sourceRevision)}/`),
    scores: scores(s),
    comparison: object(publicValue(comparisonFields(s, input.samples, scores(s)))) as Record<string, Cell>,
  };
}
