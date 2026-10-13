/** Public presentation of published reports; never imports the eval collector or rescores samples. */
type ObjectValue = Record<string, unknown>;
export type Verdict = boolean | string;
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
  result: string;
  guardrail: string;
  notes: string;
  source_commit: string;
  harness_sha256: string;
  metrics: ObjectValue;
  summary_url: string;
  samples_url: string;
  cohort_key: string;
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
function ratio(m: unknown, group: string, numerator: string, denominator = "n"): string {
  return `${n(m, `${group}.${numerator}`) ?? "—"}/${n(m, `${group}.${denominator}`) ?? "—"}`;
}
function percent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(2)}%`;
}
function decimal(value: number | null): string {
  return value === null ? "—" : value.toFixed(4);
}
function result(s: ObjectValue): [string, string] {
  const m = object(s.metrics);
  switch (s.eval) {
    case "nightly":
      return [
        `Items ${ratio(m, "items", "ok")} · ${percent(n(m, "items.rate"))}`,
        `Harm ${n(m, "harm.items") ?? "—"}; failed calls ${ratio(m, "calls", "failures")}`,
      ];
    case "reflect":
      return [
        `Defects ${ratio(m, "defects", "correct")} · ${percent(n(m, "defects.rate"))}`,
        `Controls ${ratio(m, "controls", "correct")}; body edits ${n(m, "proposals.touched_body") ?? "—"}`,
      ];
    case "extract":
      return [
        `Insights ${ratio(m, "insights", "correct")} · ${percent(n(m, "insights.rate"))}`,
        `Routine ${ratio(m, "routine", "correct")}; planted instructions saved ${ratio(m, "planted", "saved_instruction")}`,
      ];
    case "consolidate":
      return [
        `Recall ${ratio(m, "recall", "retired_safe", "of")} · ${percent(n(m, "recall.value"))}`,
        `Unsafe ${ratio(m, "unsafe", "n", "of")}; precision ${percent(n(m, "precision.value"))}`,
      ];
    case "promotion":
      return [
        `Precision ${ratio(m, "precision", "good", "of")} · ${percent(n(m, "precision.value"))}`,
        `Good accepted ${ratio(m, "recall", "accepted", "of")}; bad accepted ${ratio(m, "bad_accepted", "accepted", "of")}`,
      ];
    case "bakeoff":
      return [
        `Case pass ${ratio(m, "case_pass", "passed")} · ${percent(n(m, "case_pass.rate"))}`,
        `Valid output ${ratio(m, "valid_output", "passed")}; checks ${percent(n(m, "checks.rate"))}`,
      ];
    case "judge-gate":
      return [
        `Precision ${ratio(m, "precision", "passed_good", "passed")} · ${percent(n(m, "precision.value"))}`,
        `Bad passed ${ratio(m, "bad", "passed")}; harmful passed ${ratio(m, "bad_harmful", "passed")}`,
      ];
    case "distill":
      return [
        `Good lessons ${ratio(m, "good_lessons", "good")} · ${percent(n(m, "good_lessons.rate"))}`,
        `Updates ${ratio(m, "lesson_updates", "right")}; wrong lessons ${ratio(m, "wrong_lessons", "wrong")}`,
      ];
    case "retrieval":
      return [
        `Search nDCG@10 ${decimal(n(m, "search.ndcg_10"))}; recall@10 ${decimal(n(m, "search.recall_10"))}`,
        `Top 10 judged ${percent(n(m, "search.judged_10"))}; ${n(m, "search.n") ?? "—"} judged task queries`,
      ];
    case "skillret":
      return [
        `nDCG@10 keyword ${decimal(n(m, "search.NDCG@10"))}; semantic ${decimal(n(m, "semantic_search.NDCG@10"))}`,
        `Curate same: keyword ${ratio(s, "curate_check.keyword", "same", "compared")}; semantic ${ratio(s, "curate_check.semantic", "same", "compared")}`,
      ];
    case "longmemeval":
      if (s.retrieval_only || s.mode === "retrieval-only") {
        return [
          `Top 5 hit ${percent(n(m, "retrieval.hit_rate"))}; recall ${percent(n(m, "retrieval.recall"))}; MRR ${decimal(n(m, "retrieval.mrr"))}`,
          `Evidence questions ${n(m, "retrieval.n") ?? "—"}; abstention questions ${n(m, "retrieval_abstention.n") ?? "—"}`,
        ];
      }
      return [
        `Control ${ratio(m, "accuracy.without_akm", "correct")}; AKM ${ratio(m, "accuracy.with_akm", "correct")}`,
        `Paired questions ${n(m, "accuracy.difference.n") ?? "—"}; cut-offs control ${n(s, "answers_cut_off.without_akm") ?? "—"}, AKM ${n(s, "answers_cut_off.with_akm") ?? "—"}`,
      ];
    case "agent-ab":
    case "terminal-bench":
      return [
        `Control ${ratio(m, "control", "passed", "scored")}; AKM ${ratio(m, "akm", "passed", "scored")}`,
        `AKM engaged ${ratio(m, "engagement", "called", "trials")}`,
      ];
    default:
      return ["See recorded metrics", "Metric definitions are specific to this suite"];
  }
}

export function presentRun(input: RunInput): LedgerRun | null {
  const s = object(input.summary);
  if (s.corpus !== "public" || s.status !== "complete") return null;
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
  if (suite === "agent-ab" && label === "bifrost-gpt120-pilot") {
    role = "Diagnostic";
    notes.push(
      "Original plugin was incompatible with CLI 0.10. Diagnostic artifact, excluded from full-run comparisons.",
    );
  }
  if (role === "Pilot") notes.push("Small demonstration; insufficient coverage for a full-suite quality estimate.");
  const rows = input.samples?.map(object) ?? [];
  const layout = rows.filter((row) => /Reflect refused: the file for/.test(text(row.error))).length;
  const missing = rows.filter((row) => /ASSET_NOT_FOUND/.test(text(row.error))).length;
  if (layout)
    notes.push(
      `${layout} AKM file-layout refusals: proposal output differs from the indexed file. These errors are outside correctness.`,
    );
  if (missing)
    notes.push(`${missing} indexed-ref feedback errors in the earlier harness. Lookup repaired in akm-eval v0.4.`);
  if (suite === "retrieval")
    notes.push(
      "Metric denominators cover judged task queries; notification observations are separate. Inspect judgment coverage and condensed nDCG.",
    );
  if (suite === "longmemeval" && role === "Pilot")
    notes.push(
      "Published pilot used a Qwen judge rather than the benchmark GPT-4o judge. Inspect errored arms and answer cut-offs.",
    );
  if (suite === "skillret")
    notes.push(
      "Both ranking modes share one query artifact. Curate checks cover a subset. Embeddings run locally; no answer model.",
    );
  if (input.samples === null)
    notes.push("Sample file unavailable; recorded coverage uses summary fields where present.");
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
    notes.push("Pooled serving; fixed per-run quantization and GPU allocation are not established.");
  const measurement = text(at(s, "manifest.collector.version")) || "Unspecified";
  const [score, guardrail] = result(s);
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
    result: score,
    guardrail,
    notes: notes.join(" "),
    source_commit: text(s.git_commit),
    harness_sha256: text(s.harness_sha256),
    metrics: object(publicValue(m)),
    summary_url: `${base}/summary.json`,
    samples_url: `${base}/samples.jsonl`,
    cohort_key: JSON.stringify([
      suite,
      s.collection,
      s.mode,
      model,
      s.akm_version,
      measurement,
      s.harness_sha256,
      s.assets_sha256,
      at(s, "manifest.config.sha256"),
      at(s, "manifest.settings"),
      at(s, "manifest.cases"),
      s.search_mode,
    ]),
  };
}

export function sampleVerdicts(samples: unknown[] | null): { kind: string; values: Record<string, Verdict> } {
  const values: Record<string, Verdict> = Object.create(null);
  const kinds = new Set<string>();
  for (const value of samples ?? []) {
    const row = object(value),
      id = text(row.id);
    if (!id || row.error || row.outcome === "error") continue;
    if (typeof row.correct === "boolean") {
      values[id] = row.correct;
      kinds.add("correctness");
    } else if (typeof row.ok === "boolean") {
      values[id] = row.ok;
      kinds.add("correctness");
    } else if (typeof at(row, "verdict.pass") === "boolean") {
      values[id] = at(row, "verdict.pass") as boolean;
      kinds.add("pass decision");
    } else if (typeof row.outcome === "string") {
      values[id] = row.outcome;
      kinds.add("outcome");
    }
  }
  return { kind: [...kinds].join(" + "), values };
}

export function repeatVariation(
  verdicts: ReturnType<typeof sampleVerdicts>[],
): { kind: string; n: number; unstable: number; flip_rate: number } | null {
  if (verdicts.length < 2 || !verdicts[0]?.kind || verdicts.some((v) => v.kind !== verdicts[0]?.kind)) return null;
  const ids = Object.keys(verdicts[0].values).filter((id) => verdicts.every((v) => Object.hasOwn(v.values, id)));
  if (!ids.length) return null;
  let flips = 0,
    pairs = 0,
    unstable = 0;
  for (const id of ids) {
    if (new Set(verdicts.map((v) => v.values[id])).size > 1) unstable++;
    for (let i = 0; i < verdicts.length; i++)
      for (let j = i + 1; j < verdicts.length; j++) {
        pairs++;
        if (verdicts[i]?.values[id] !== verdicts[j]?.values[id]) flips++;
      }
  }
  return { kind: verdicts[0].kind, n: ids.length, unstable, flip_rate: flips / pairs };
}

export function latestGroups(runs: LedgerRun[], verdicts: Map<string, ReturnType<typeof sampleVerdicts>>) {
  const cohorts = new Map<string, LedgerRun[]>();
  for (const run of runs.filter((r) => r.role === "Full suite")) {
    const group = cohorts.get(run.cohort_key) ?? [];
    group.push(run);
    cohorts.set(run.cohort_key, group);
  }
  const latest = new Map<string, LedgerRun[]>();
  for (const cohort of cohorts.values()) {
    cohort.sort((a, b) => a.date.localeCompare(b.date));
    const last = cohort.at(-1)!;
    const key = JSON.stringify([last.suite, last.collection, last.mode, last.model]);
    if (!latest.has(key) || last.date > (latest.get(key)?.at(-1)?.date ?? "")) latest.set(key, cohort);
  }
  return [...latest.values()].map((group) => ({
    ids: group.map((r) => r.id),
    variation: repeatVariation(group.map((r) => verdicts.get(r.id) ?? { kind: "", values: {} })),
  }));
}
