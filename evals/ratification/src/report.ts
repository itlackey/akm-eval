// The report of a run: per arm and per task and arm, from the trials. Pure. There is no composite score and no significance test: nine tasks and
// three attempts give counts and means, and the transcripts say why. Rates are over scored trials (the verifier gave a reward); a trial that
// errored (setup, plugin not live, no verdict) is counted apart and never dropped.

import type { RatTrial } from "./collect.ts";

export interface ArmFigures {
  trials: number;
  scored: number;
  errored: number;
  passed: number;
  completion_rate: number | null;
  mean_akm_calls: number | null;
  mean_other_calls: number | null;
  mean_unnecessary: number | null;
  mean_help_calls: number | null;
  /** Trials with at least one failed akm call, and how many of those still passed. */
  error_trials: number;
  recovered: number;
  recovery_rate: number | null;
  /** Trials that used a deprecated or removed form (a notice, or the task's `old` pattern), and of those, how many moved on to the replacement. */
  old_form_trials: number;
  old_form_moved_on: number;
  deprecated_notices: number;
  mean_tokens: number | null;
}

const round = (x: number, places = 2): number => Number(x.toFixed(places));
const mean = (xs: number[]): number | null => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export function figures(trials: RatTrial[]): ArmFigures {
  const scored = trials.filter((t) => t.reward !== null);
  const passed = scored.filter((t) => t.reward === 1);
  const m = trials.flatMap((t) => (t.metrics ? [t.metrics] : []));
  const errorTrials = m.filter((x) => x.errors > 0);
  const old = m.filter((x) => x.old_used);
  const tokens = trials.flatMap((t) => (t.tokens ? [t.tokens.input + t.tokens.output] : []));
  return {
    trials: trials.length,
    scored: scored.length,
    errored: trials.length - scored.length,
    passed: passed.length,
    completion_rate: scored.length ? round(passed.length / scored.length, 3) : null,
    mean_akm_calls: mean(m.map((x) => x.akm_calls)),
    mean_other_calls: mean(m.map((x) => x.other_calls)),
    mean_unnecessary: mean(m.map((x) => x.unnecessary)),
    mean_help_calls: mean(m.map((x) => x.help_calls)),
    error_trials: errorTrials.length,
    recovered: errorTrials.filter((x) => x.recovered).length,
    recovery_rate: errorTrials.length ? round(errorTrials.filter((x) => x.recovered).length / errorTrials.length, 3) : null,
    old_form_trials: old.length,
    old_form_moved_on: old.filter((x) => x.moved_on).length,
    deprecated_notices: m.reduce((n, x) => n + x.deprecated_notices, 0),
    mean_tokens: mean(tokens),
  };
}

export interface Report {
  per_arm: Record<string, ArmFigures>;
  per_task: Record<string, Record<string, ArmFigures>>;
}

export function reportOf(trials: RatTrial[], arms: string[], tasks: string[]): Report {
  const by = (arm: string, task?: string) => trials.filter((t) => t.ratification_arm === arm && (task === undefined || t.task === task));
  return {
    per_arm: Object.fromEntries(arms.map((a) => [a, figures(by(a))])),
    per_task: Object.fromEntries(tasks.map((task) => [task, Object.fromEntries(arms.map((a) => [a, figures(by(a, task))]))])),
  };
}

const pct = (x: number | null): string => (x === null ? "-" : `${Math.round(x * 100)}%`);
const num = (x: number | null): string => (x === null ? "-" : String(x));

export function formatReport(r: Report): string[] {
  const arms = Object.keys(r.per_arm);
  const lines = ["", `${"arm".padEnd(10)} pass      akm calls  extra  errors(trials)  recovered  old form(moved on)  help  notices`];
  for (const a of arms) {
    const f = r.per_arm[a];
    lines.push(
      `${a.padEnd(10)} ${`${f.passed}/${f.scored} ${pct(f.completion_rate)}`.padEnd(9)} ${num(f.mean_akm_calls).padEnd(10)} ${num(f.mean_unnecessary).padEnd(6)} ${String(f.error_trials).padEnd(15)} ${`${f.recovered}/${f.error_trials}`.padEnd(10)} ${`${f.old_form_trials} (${f.old_form_moved_on})`.padEnd(19)} ${num(f.mean_help_calls).padEnd(5)} ${f.deprecated_notices}`,
    );
  }
  lines.push("", `${"task".padEnd(24)} ${arms.map((a) => a.padEnd(26)).join(" ")}   (pass, mean akm calls, mean extra, error trials)`);
  for (const [task, row] of Object.entries(r.per_task)) {
    lines.push(`${task.padEnd(24)} ${arms.map((a) => `${row[a].passed}/${row[a].scored}  ${num(row[a].mean_akm_calls)} +${num(row[a].mean_unnecessary)} e${row[a].error_trials}`.padEnd(26)).join(" ")}`);
  }
  return lines;
}
