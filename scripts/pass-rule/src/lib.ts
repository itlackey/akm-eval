// Routes the saved criterion scores of judge runs again under a pass rule. No model call, no akm: the rows of judge-gate and lesson-judge keep the
// judge's criterion scores, and the route akm took is a function of them (lib/judge.ts, applyRule). So a pass rule can be tried on a run that was made.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type PassRule, type Route, SHIPPED_RULES, applyRule, routeOf } from "../../../lib/judge.ts";
import { routeFor } from "../../../evals/lesson-judge/src/score.ts";

/** The judge each eval measures that returns criteria. */
const JUDGES: Record<string, string> = { "judge-gate": "reflect.quality", "lesson-judge": "distill.lesson" };

type Row = Record<string, any>;
export interface Counts { pass: number; review: number; reject: number }
const empty = (): Counts => ({ pass: 0, review: 0, reject: 0 });

/** The route a row takes under `rule`: judge-gate's is the verdict's own; a lesson update routes on `pass` alone, a new lesson as routeOf does. Null for a row with no criterion scores. */
export function routeUnder(evalName: string, row: Row, rule: PassRule): Route | null {
  if (row.criteria === null || typeof row.criteria !== "object") return null;
  const verdict = applyRule(row.criteria, rule);
  if (!verdict) return null;
  return evalName === "lesson-judge" ? routeFor(row.mode, verdict) : routeOf(verdict);
}

/** The group a row is counted in: judge-gate's `routes` keys (`good`, `harmful`, `churn`, `other`, each by lane) and lesson-judge's (`<mode>/good` or `<mode>/<kind>`). */
const groupOf = (evalName: string, row: Row): string =>
  evalName === "lesson-judge" ? `${row.mode}/${row.label === "good" ? "good" : (row.kind ?? "bad")}` : `${row.label === "good" ? "good" : (row.severity ?? "harmful")}/${row.lane}`;

/** `good` or `bad`, by mode for lessons. */
const labelOf = (evalName: string, row: Row): string => (evalName === "lesson-judge" ? `${row.mode}/${row.label}` : row.label);

export interface Report {
  eval: string;
  judge: string;
  /** The folders read, and the rows routed (those with criterion scores) and left out (an error, or a judge that gave no verdict). */
  runs: string[];
  rows: number;
  without_criteria: number;
  /** The rule akm ships for the judge, and the one tried. */
  shipped: PassRule;
  tried: PassRule;
  /** Rows whose route under the shipped rule differs from the route stored: 0 when the stored runs are what akm's rule gives. */
  reproduced: { rows: number; mismatch: { run: string; id: string; stored: string; shipped: string | null }[] };
  /** Counts over all the runs read (divide by `runs.length` for a per-run mean), by label and by group, under each rule. */
  by_label: Record<"shipped" | "tried", Record<string, Counts>>;
  routes: Record<"shipped" | "tried", Record<string, Counts>>;
  /** The rows that take another route under the tried rule. */
  differ: { run: string; id: string; group: string; criteria: Record<string, number>; shipped: Route; tried: Route }[];
}

/** Reads each results folder (summary.json and samples.jsonl) and routes its rows under the shipped rule and `tried`. All the folders must be runs of one eval. */
export function passRuleReport(dirs: string[], tried: PassRule | ((shipped: PassRule) => PassRule)): Report {
  let evalName: string | undefined;
  const out = { rows: 0, without_criteria: 0 };
  const by_label = { shipped: {} as Record<string, Counts>, tried: {} as Record<string, Counts> };
  const routes = { shipped: {} as Record<string, Counts>, tried: {} as Record<string, Counts> };
  const mismatch: Report["reproduced"]["mismatch"] = [];
  const differ: Report["differ"] = [];
  let shipped: PassRule | undefined;
  let rule: PassRule | undefined;
  for (const dir of dirs) {
    const missing = ["summary.json", "samples.jsonl"].filter(f => !existsSync(join(dir, f)));
    if (missing.length) throw new Error(`${dir} has no ${missing.join(" and no ")}`);
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    const name: unknown = summary.eval;
    if (typeof name !== "string" || !(name in JUDGES)) throw new Error(`${dir} is a run of ${JSON.stringify(name)}; this reads ${Object.keys(JUDGES).join(" and ")}`);
    if (evalName !== undefined && evalName !== name) throw new Error(`${dir} is a run of ${name} and the runs before it are of ${evalName}`);
    evalName = name;
    shipped = SHIPPED_RULES[JUDGES[name] as string] as PassRule;
    rule = typeof tried === "function" ? tried(shipped) : tried;
    const run = dir.replace(/\/+$/, "").split("/").pop() as string;
    for (const line of readFileSync(join(dir, "samples.jsonl"), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row: Row = JSON.parse(line);
      const under = routeUnder(name, row, shipped);
      const now = routeUnder(name, row, rule);
      if (under === null || now === null) {
        out.without_criteria++;
        continue;
      }
      out.rows++;
      if (under !== row.outcome) mismatch.push({ run, id: row.id, stored: row.outcome, shipped: under });
      for (const [side, route] of [["shipped", under], ["tried", now]] as const) {
        (by_label[side][labelOf(name, row)] ??= empty())[route]++;
        (routes[side][groupOf(name, row)] ??= empty())[route]++;
      }
      if (under !== now) differ.push({ run, id: row.id, group: groupOf(name, row), criteria: row.criteria, shipped: under, tried: now });
    }
  }
  if (evalName === undefined || !shipped || !rule) throw new Error("name at least one results folder");
  return { eval: evalName, judge: JUDGES[evalName] as string, runs: dirs.map((d) => d.replace(/\/+$/, "").split("/").pop() as string), ...out, shipped, tried: rule, reproduced: { rows: out.rows, mismatch }, by_label, routes, differ };
}
