// Pure helpers for the consolidate eval: the cases, which ones a run takes, the akm config, how akm's result becomes
// a row, and the metrics. run.ts runs the eval with them and generate.ts makes the private cases.

import { engineConfig } from "../../../lib/akm/akm.ts";

export type Side = "a" | "b";

export const RELATIONS = ["duplicate", "subsumed", "supersedes", "contradicts", "overlap", "unrelated"] as const;
export type Relation = (typeof RELATIONS)[number];

export interface Note {
  name: string; // the memory's name: it is written to memories/<name>.md
  text: string; // the whole file: frontmatter and body
}

export interface Claim {
  side: Side | "both";
  text: string; // word for word in the note or notes of that side, and in no other
}

export interface Case {
  id: string;
  relation: Relation;
  older: Side | null; // which note is older, or null when they are from the same day
  safe: Side[]; // the sides that can be retired without losing a claim the other lacks
  claims: Claim[]; // the claims that decide it
  why: string;
  a: Note;
  b: Note;
  canary?: string;
}

export type Outcome = "retire" | "keep" | "error";

export interface Row {
  id: string;
  relation: Relation;
  safe_sides: Side[]; // the sides of the case that were safe to retire
  outcome: Outcome;
  paired: boolean; // akm took the two notes as a candidate pair and had its judge look at them
  judged_as: Relation | null; // the label akm's judge gave the pair
  retired: Side | null; // the side akm proposed to retire
  safe: boolean | null; // whether that side was safe to retire
  staged: boolean; // akm staged the retirement, so a triage run would accept it with no one looking
  reason: string; // the judge's reason for a retirement
  only_in_retired: string[] | null; // the claims the judge found only in the retired note, null when akm did not retire one or its build does not record them
  only_in_successor: string[] | null; // the claims the judge found only in the note akm kept, null likewise
  served: Record<string, number>; // the model names the endpoint reported, with the calls each answered
  seconds: number; // the last try
  retried?: number; // how many times the case was tried again because the endpoint rate limited it
  error?: string;
}

export const isSide = (x: unknown): x is Side => x === "a" || x === "b";

export function parseCases(text: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${where}:${i + 1}`;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${at} is not valid JSON`);
    }
    if (typeof c.id !== "string" || !c.id) throw new Error(`${at} has no string "id"`);
    if (!RELATIONS.includes(c.relation)) throw new Error(`${at} has relation "${c.relation}", expected one of ${RELATIONS.join(", ")}`);
    if (c.older !== null && !isSide(c.older)) throw new Error(`${at} has older "${c.older}", expected a, b or null`);
    if (!Array.isArray(c.safe) || !c.safe.every(isSide)) throw new Error(`${at} has a "safe" that is not a list of a and b`);
    if (!Array.isArray(c.claims) || !c.claims.every((k) => (isSide(k?.side) || k?.side === "both") && typeof k.text === "string" && k.text)) throw new Error(`${at} has a bad "claims" list`);
    for (const side of ["a", "b"] as const) {
      const note = c[side];
      if (typeof note?.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(note.name)) throw new Error(`${at} has no usable name for note ${side}`);
      if (typeof note.text !== "string" || !note.text) throw new Error(`${at} has no text for note ${side}`);
    }
    if (c.a.name === c.b.name) throw new Error(`${at} gives both notes the name ${c.a.name}`);
    const problems = claimProblems(c);
    if (problems.length > 0) throw new Error(`${at}: ${problems[0]}`);
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/** Where a case's claims are not where they say. Each must be in the text of its side and of no other. */
export function claimProblems(c: Case): string[] {
  const problems: string[] = [];
  for (const claim of c.claims) {
    const inA = c.a.text.includes(claim.text);
    const inB = c.b.text.includes(claim.text);
    const want = claim.side === "both" ? [true, true] : claim.side === "a" ? [true, false] : [false, true];
    if (inA !== want[0] || inB !== want[1]) {
      const found = inA && inB ? "both notes" : inA ? "note a only" : inB ? "note b only" : "neither note";
      problems.push(`the claim "${claim.text.slice(0, 60)}" is meant for ${claim.side === "both" ? "both notes" : `note ${claim.side} only`} but is in ${found}`);
    }
  }
  return problems;
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases taking the first of each relation in turn,
 * so a short run covers as many relations as it can, in the order of RELATIONS. They come back in file order.
 */
export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const queues = RELATIONS.map((r) => cases.filter((c) => c.relation === r));
  const picked = new Set<Case>();
  for (let round = 0; picked.size < limit; round++) {
    for (const q of queues) if (picked.size < limit && q[round]) picked.add(q[round]);
  }
  return cases.filter((c) => picked.has(c));
}

/**
 * How many days old each note is. The older one is 3 days old, the newer 1, and a pair from the same day is 2 each. akm dates a
 * note by its file time when the bundle is not a git repository. All of these are within a week, so akm treats both as new material
 * and pairs them at its ordinary cosine floor.
 */
export function noteAges(older: Side | null): Record<Side, number> {
  if (older === null) return { a: 2, b: 2 };
  return older === "a" ? { a: 3, b: 1 } : { a: 1, b: 3 };
}

/**
 * akm pairs notes by the cosine of their embeddings, and a pair below 0.93 is never judged. Its deterministic embedder hashes the
 * words, so the eval needs no embedding model and every run pairs the same notes. It is akm's own switch for reproducible benchmarks.
 */
export const EMBEDDER_ENV = { AKM_EMBED_DETERMINISTIC: "1" };

/**
 * The akm config consolidate runs under: one LLM engine, the model under test, as the default engine, and semantic search on,
 * because consolidate finds its candidate pairs among the notes' nearest neighbours by embedding.
 */
export function consolidateConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "consolidate");
  config.semanticSearchMode = "auto";
  return config;
}

export function errorRow(c: Case, message: string, seconds: number): Row {
  return { id: c.id, relation: c.relation, safe_sides: c.safe, outcome: "error", paired: false, judged_as: null, retired: null, safe: null, staged: false, reason: "", only_in_retired: null, only_in_successor: null, served: {}, seconds, error: message };
}

export interface RetireProposal {
  source: string;
  retirement: { retiredRef: string; successorRef?: string; judgeReason?: string; onlyInRetired?: unknown; onlyInSuccessor?: unknown };
  gateDecision?: { outcome?: string };
}

/** The retire proposals of consolidate's pair pass in `akm proposal list --detail full --format json`. Its other proposals are promotions. */
export function retireProposals(listing: unknown): RetireProposal[] {
  const all = (listing as { proposals?: unknown })?.proposals;
  if (!Array.isArray(all)) return [];
  return all.filter((p): p is RetireProposal => p?.source === "consolidate-pair" && typeof p?.retirement?.retiredRef === "string");
}

/**
 * The model names the endpoint reported for the run's calls, from akm's usage report, with the calls each answered. A gateway may
 * serve one name from several providers. A call that got no answer has no reported name, and akm files it under the name that was
 * asked for, so only the calls that were answered count.
 */
export function servedModels(improve: unknown): Record<string, number> {
  const rows = (improve as { usageReport?: { byProcessEngineModel?: unknown } })?.usageReport?.byProcessEngineModel;
  const served: Record<string, number> = {};
  if (Array.isArray(rows)) {
    for (const r of rows) {
      const answered = Number(r?.calls ?? 0) - Number(r?.failures ?? 0);
      if (typeof r?.model === "string" && answered > 0) served[r.model] = (served[r.model] ?? 0) + answered;
    }
  }
  return served;
}

/** A claim list from the retirement, or null when this akm build did not record one. */
const claimList = (x: unknown): string[] | null => (Array.isArray(x) && x.every((k) => typeof k === "string") ? x : null);

/** `bundle//memories/some-name` is the memory `some-name`. */
export const nameOfRef = (ref: string): string => ref.replace(/^.*\/\//, "").replace(/^memories\//, "");

/**
 * Turns what akm printed for one case into a row. `improve` is the run's JSON result, which reports the pair pass, and `proposals`
 * is the proposal list. akm retires a note by proposing it: the proposal's ref is the retired note and the other is kept.
 */
export function rowFromRun(c: Case, improve: unknown, proposals: unknown, seconds: number): Row {
  const pass = (improve as { consolidation?: { pairPass?: Record<string, any> } })?.consolidation?.pairPass;
  if (!pass || typeof pass !== "object") return errorRow(c, "improve printed no pair pass result. Does this akm have consolidate's pair pass?", seconds);
  const paired = Number(pass.pairsConsidered ?? 0) > 0;
  const judged_as = RELATIONS.find((r) => Number(pass.labelCounts?.[r] ?? 0) > 0) ?? null;
  const base = { id: c.id, relation: c.relation, safe_sides: c.safe, paired, judged_as, served: servedModels(improve), seconds };
  const failed = (error: string): Row => ({ ...base, outcome: "error", retired: null, safe: null, staged: false, reason: "", only_in_retired: null, only_in_successor: null, error });
  if (Number(pass.failedJudgments ?? 0) > 0 || (paired && Number(pass.pairsJudged ?? 0) === 0)) return failed("akm paired the notes but its judge gave no verdict");
  const retired = retireProposals(proposals);
  if (retired.length === 0) return { ...base, outcome: "keep", retired: null, safe: null, staged: false, reason: "", only_in_retired: null, only_in_successor: null };
  if (retired.length > 1) return failed(`akm made ${retired.length} retire proposals for one pair`);
  const [p] = retired;
  const name = nameOfRef(p.retirement.retiredRef);
  const side: Side | undefined = name === c.a.name ? "a" : name === c.b.name ? "b" : undefined;
  if (!side) return failed(`akm retired ${p.retirement.retiredRef}, which is not one of the two notes`);
  return { ...base, outcome: "retire", retired: side, safe: c.safe.includes(side), staged: p.gateDecision?.outcome === "staged", reason: p.retirement.judgeReason ?? "", only_in_retired: claimList(p.retirement.onlyInRetired), only_in_successor: claimList(p.retirement.onlyInSuccessor) };
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

export interface ClassCounts {
  n: number; // cases of this relation that ran
  error: number;
  paired: number; // cases where akm paired the notes and had its judge look at them
  judged_as: Record<Relation, number>; // the labels the judge gave the paired notes
  retired_safe: number;
  retired_unsafe: number;
  kept: number; // cases where akm kept both notes
}

export interface Metrics {
  unsafe: { n: number; of: number; staged: number }; // unsafe retirements, scored cases, and the unsafe ones akm staged
  precision: { value: number | null; safe: number; retired: number }; // of the retirements, the share that were safe
  recall: { value: number | null; retired_safe: number; of: number }; // of the cases with a safe side, the share where akm retired a safe one
  classes: Record<Relation, ClassCounts>;
}

/** The numbers the eval reports. Cases that errored are counted per relation and left out of the rest. */
export function metrics(rows: Row[]): Metrics {
  const labels = () => Object.fromEntries(RELATIONS.map((r) => [r, 0])) as Record<Relation, number>;
  const classes = Object.fromEntries(RELATIONS.map((r) => [r, { n: 0, error: 0, paired: 0, judged_as: labels(), retired_safe: 0, retired_unsafe: 0, kept: 0 }])) as Record<Relation, ClassCounts>;
  let unsafe = 0;
  let staged = 0;
  let safe = 0;
  let scored = 0;
  let withSafeSide = 0;
  let hits = 0;
  for (const r of rows) {
    const k = classes[r.relation];
    k.n++;
    if (r.outcome === "error") {
      k.error++;
      continue;
    }
    scored++;
    if (r.paired) k.paired++;
    if (r.judged_as) k.judged_as[r.judged_as]++;
    if (r.outcome === "keep") k.kept++;
    else if (r.safe) {
      k.retired_safe++;
      safe++;
    } else {
      k.retired_unsafe++;
      unsafe++;
      if (r.staged) staged++;
    }
    if (r.safe_sides.length > 0) {
      withSafeSide++;
      if (r.outcome === "retire" && r.safe) hits++;
    }
  }
  return {
    unsafe: { n: unsafe, of: scored, staged },
    precision: { value: ratio(safe, safe + unsafe), safe, retired: safe + unsafe },
    recall: { value: ratio(hits, withSafeSide), retired_safe: hits, of: withSafeSide },
    classes,
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
