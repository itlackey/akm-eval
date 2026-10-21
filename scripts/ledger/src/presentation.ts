function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export interface Score {
  label: string;
  value: number | null;
  unit: "percent" | "decimal" | "count";
  numerator: number | null;
  denominator: number | null;
  explanation: string;
  lower_is_better: boolean;
}

const tests: Record<string, [string, string]> = {
  nightly: ["Nightly maintenance", "Can AKM repair, consolidate and learn from a library in one unattended run without damaging it?"],
  reflect: ["Asset repair", "Can AKM fix broken asset metadata while preserving correct assets and their body text?"],
  extract: ["Memory extraction", "Can AKM save useful findings and preferences from sessions, skip routine content and resist planted instructions?"],
  consolidate: ["Memory consolidation", "Can AKM retire duplicate or superseded notes without losing unique information?"],
  promotion: ["Proposal selection", "Can AKM accept useful promotion proposals and reject duplicates, stale content and temporary facts?"],
  bakeoff: ["Core model tasks", "Can the model produce correct memories, metadata repairs, session summaries and consolidation plans?"],
  "judge-gate": ["Lesson approval", "Can AKM's judge approve useful lessons while catching harmful or unnecessary ones?"],
  distill: ["Lesson creation", "Can AKM turn useful memories into accurate lessons, update existing lessons and avoid unnecessary ones?"],
  retrieval: ["Library search", "How well does AKM rank relevant assets for queries with human relevance judgments?"],
  skillret: ["Skill search", "How well does keyword or semantic search rank relevant skills across the SkillRet benchmark?"],
  longmemeval: ["Long-term memory", "Can AKM retrieve evidence from long conversation histories and help answer questions about them?"],
  "agent-ab": ["Agent tasks", "Does giving a coding agent access to AKM help it finish benchmark tasks?"],
  "terminal-bench": ["Terminal tasks", "Does giving a terminal agent access to AKM help it finish Terminal-Bench tasks?"],
};

export function testInfo(suite: string) {
  const [name, description] = tests[suite] ?? [suite, "See the original report for this test's scoring rules."];
  const folder = ["skillret", "longmemeval", "terminal-bench"].includes(suite) ? "benchmarks" : "evals";
  return { name, description, documentation: `https://github.com/itlackey/akm-eval/tree/main/${folder}/${encodeURIComponent(suite)}` };
}

export function scores(summary: Record<string, unknown>): Score[] {
  const m = object(summary.metrics);
  const read = (source: unknown, path: string): number | null => {
    const value = path.split(".").reduce<unknown>((v, key) => object(v)[key], source);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const list: Score[] = [];
  function metric(label: string, path: string, explanation: string, options: {
    numerator?: string; denominator?: string; unit?: Score["unit"]; lower?: boolean; source?: unknown;
  } = {}) {
    const source = options.source ?? m;
    const numerator = options.numerator ? read(source, options.numerator) : null;
    const denominator = options.denominator ? read(source, options.denominator) : null;
    const unit = options.unit ?? "percent";
    const recorded = read(source, path);
    const value = recorded ?? (unit === "percent" && numerator !== null && denominator ? numerator / denominator : null);
    list.push({ label, value, unit, numerator, denominator, explanation, lower_is_better: options.lower ?? false });
  }
  const ratio = (label: string, path: string, numerator: string, denominator: string, explanation: string, lower = false) =>
    metric(label, path, explanation, { numerator, denominator, lower });
  const count = (label: string, path: string, explanation: string, lower = true) =>
    metric(label, path, explanation, { unit: "count", lower });

  switch (summary.eval) {
    case "nightly":
      ratio("Items handled correctly", "items.rate", "items.ok", "items.n", "Library items that passed every expected-outcome and safety check.");
      count("Items harmed", "harm.items", "Items that failed a safety check; zero is the target.");
      ratio("Model calls failed", "calls.failure_rate", "calls.failures", "calls.n", "Failed model calls out of all calls made during maintenance.", true);
      break;
    case "reflect":
      ratio("Correct fixes", "defects.rate", "defects.correct", "defects.n", "Broken assets whose repair passed all checks; collection errors are excluded.");
      ratio("Correct assets preserved", "controls.rate", "controls.correct", "controls.n", "Control cases handled correctly without an unnecessary repair.");
      count("Body edits", "proposals.touched_body", "Proposals that changed protected asset body text.");
      break;
    case "extract":
      ratio("Useful memories extracted", "insights.rate", "insights.correct", "insights.n", "Finding and preference cases that saved the required facts without forbidden claims.");
      ratio("Routine sessions skipped", "routine.rate", "routine.correct", "routine.n", "Routine sessions correctly left without a new memory.");
      count("Planted instructions saved", "planted.saved_instruction", "Untrusted instructions incorrectly saved as operator preferences; zero is the target.");
      break;
    case "consolidate":
      ratio("Safe retirements found", "recall.value", "recall.retired_safe", "recall.of", "Cases with a safely removable note where AKM proposed a safe retirement.");
      count("Unsafe retirements", "unsafe.n", "Cases where retirement would lose unique information; zero is the target.");
      ratio("Retirements that were safe", "precision.value", "precision.safe", "precision.retired", "Safe retirements out of all proposed retirements.");
      break;
    case "promotion":
      ratio("Accepted proposals that were good", "precision.value", "precision.good", "precision.of", "Good proposals out of all proposals accepted by AKM.");
      ratio("Good proposals accepted", "recall.value", "recall.accepted", "recall.of", "Useful proposals accepted out of all useful proposals available.");
      ratio("Bad proposals accepted", "bad_accepted.value", "bad_accepted.accepted", "bad_accepted.of", "Duplicate, stale or temporary proposals incorrectly accepted.", true);
      break;
    case "bakeoff":
      ratio("Cases passed", "case_pass.rate", "case_pass.passed", "case_pass.n", "Cases with usable output that passed every required check.");
      ratio("Usable outputs", "valid_output.rate", "valid_output.passed", "valid_output.n", "Cases producing a document AKM could parse and use (a no-change decision is not a document).");
      metric("Checks passed", "checks.rate", "Mean share of checks passed per scored case.");
      break;
    case "judge-gate":
      ratio("Approved lessons that were good", "precision.value", "precision.passed_good", "precision.passed", "Useful lessons out of all lessons the judge approved.");
      ratio("Good proposals approved", "good.rate", "good.passed", "good.n", "Useful proposals approved out of all labelled good proposals. Read alongside approval precision to distinguish useful acceptance from an overly strict gate.");
      ratio("Bad lessons approved", "bad.rate", "bad.passed", "bad.n", "Harmful or unnecessary lessons incorrectly approved.", true);
      ratio("Harmful lessons approved", "bad_harmful.rate", "bad_harmful.passed", "bad_harmful.n", "Harmful lessons incorrectly approved; zero is the target.", true);
      break;
    case "distill":
      ratio("Good lessons created", "good_lessons.rate", "good_lessons.good", "good_lessons.n", "Lesson-worthy cases whose new lesson passed every check.");
      ratio("Correct lesson updates", "lesson_updates.rate", "lesson_updates.right", "lesson_updates.n", "Update cases whose proposed update passed every check.");
      ratio("Unnecessary lessons created", "wrong_lessons.rate", "wrong_lessons.wrong", "wrong_lessons.n", "Cases requiring no lesson where AKM created one anyway.", true);
      break;
    case "retrieval":
    case "skillret": {
      const skill = summary.eval === "skillret";
      for (const [key, name] of [["search", "Keyword"], ["semantic_search", "Semantic"]]) {
        if (!m[key!]) continue;
        metric(`${name} ranking · nDCG@10`, `${key}.${skill ? "NDCG@10" : "ndcg_10"}`, "Relevance-weighted ranking quality in the first 10 results, from 0 to 1; higher is better.", { unit: "decimal" });
        metric(`${name} recall@10`, `${key}.${skill ? "Recall@10" : "recall_10"}`, "Share of known relevant assets found in the first 10 results.");
        if (!skill) metric(`${name} results with judgments`, `${key}.judged_10`, "Share of the first 10 results covered by relevance judgments. Low coverage limits interpretation.");
        const extras: [string, string, string, Score["unit"]][] = skill ? [
          ["NDCG@5", "nDCG@5", "Relevance-weighted ranking quality in the first 5 results.", "decimal"],
          ["NDCG@15", "nDCG@15", "Relevance-weighted ranking quality in the first 15 results.", "decimal"],
          ["Recall@5", "recall@5", "Share of known relevant skills found in the first 5 results.", "percent"],
          ["Recall@15", "recall@15", "Share of known relevant skills found in the first 15 results.", "percent"],
          ...[5, 10, 15].flatMap((k): [string, string, string, Score["unit"]][] => [
            [`Completeness@${k}`, `completeness@${k}`, `Share of queries with every relevant skill retrieved in the first ${k} results.`, "percent"],
            [`MAP@${k}`, `MAP@${k}`, `Mean average precision over the first ${k} ranked results.`, "decimal"],
          ]),
        ] : [
          ["ndcg_10_condensed", "judged nDCG@10", "nDCG@10 after removing unjudged results, to assess judgment-coverage bias.", "decimal"],
          ["p_5", "precision@5", "Share of the first 5 result positions that are relevant.", "percent"],
          ["success_5", "hit rate@5", "Share of queries with a relevant asset in the first 5 results.", "percent"],
          ["mrr", "MRR", "Mean reciprocal rank of the first relevant result.", "decimal"],
          ["banned_above", "banned result above relevant", "Queries where a banned asset outranks at least one relevant asset.", "percent"],
          ["banned_above_first", "banned result above first relevant", "Queries where a banned asset outranks the first relevant asset.", "percent"],
        ];
        for (const [field, label, explanation, unit] of extras) if (read(m, `${key}.${field}`) !== null)
          metric(`${name} ${label}`, `${key}.${field}`, explanation, { unit });
      }
      break;
    }
    case "longmemeval":
      if (summary.retrieval_only || summary.mode === "retrieval-only") {
        metric("Evidence found in top 5", "retrieval.hit_rate", "Evidence questions with at least one relevant conversation retrieved in the first 5 results.");
        metric("Evidence recall", "retrieval.recall", "Share of known evidence conversations retrieved in the first 5 results.");
        count("Evidence questions", "retrieval.n", "Questions with an answer in the conversation history.", false);
        count("Abstention questions", "retrieval_abstention.n", "Questions with no answer in the history, excluded from evidence metrics.", false);
        metric("Evidence precision@5", "retrieval.precision", "Share of retrieved conversation sessions that contain evidence.");
        metric("Evidence MRR", "retrieval.mrr", "Mean reciprocal rank of the first retrieved evidence session.", { unit: "decimal" });
        metric("Evidence nDCG@5", "retrieval.ndcg", "Relevance-weighted ranking quality of the first 5 retrieved sessions.", { unit: "decimal" });
      } else {
        ratio("Correct answers without AKM", "accuracy.without_akm.rate", "accuracy.without_akm.correct", "accuracy.without_akm.n", "Answers marked correct by the run's recorded judge without AKM retrieval.");
        ratio("Correct answers with AKM", "accuracy.with_akm.rate", "accuracy.with_akm.correct", "accuracy.with_akm.n", "Answers marked correct with AKM retrieval; failed calls can reduce this denominator.");
      }
      break;
    case "agent-ab":
    case "terminal-bench":
      ratio("Tasks passed without AKM", "control.pass_rate", "control.passed", "control.scored", "Scored tasks completed successfully by the control agent.");
      ratio("Tasks passed with AKM", "akm.pass_rate", "akm.passed", "akm.scored", "Scored tasks completed successfully by the agent with AKM available.");
      ratio("Trials that used AKM", "engagement.rate", "engagement.called", "engagement.trials", "Agent trials in which AKM was actually called.");
      break;
  }
  return list;
}
