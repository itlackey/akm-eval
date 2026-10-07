// Pure helpers for the promotion eval: the cases, the proposals planted in akm's queue, the akm config, what the drain
// did with each one, and the metrics. run.ts uses them to run the eval and build.ts to make the public cases.

import { createHash } from "node:crypto";
import { engineConfig, semanticConfig } from "../../../lib/akm/akm.ts";

export const BAD = ["duplicate", "stale", "ephemeral"] as const;
export type Bad = (typeof BAD)[number];

export interface Case {
  id: string;
  label: "good" | "bad";
  /** `good`, or what is wrong with a bad proposal. */
  category: "good" | Bad;
  /** Where the note would be written: `knowledge/<name>`. */
  ref: string;
  /** The proposed note, frontmatter and body: what the drain's judge reads. */
  content: string;
  labelReason?: string;
}

/** What the drain's judgment tier did with a proposal. `defer` leaves it for a person. */
export type Outcome = "accept" | "reject" | "defer" | "error";

export interface Row {
  id: string;
  label: Case["label"];
  category: Case["category"];
  ref: string;
  outcome: Outcome;
  /** The judge's reason. akm keeps it only for a rejection. */
  reason: string;
  error?: string;
}

export function parseCases(text: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${where}:${i + 1} is not valid JSON`);
    }
    for (const key of ["id", "ref", "content"] as const) {
      if (typeof c[key] !== "string" || c[key] === "") throw new Error(`${where}:${i + 1} has no string "${key}"`);
    }
    if (c.label !== "good" && c.label !== "bad") throw new Error(`${where}:${i + 1} has label "${c.label}", expected good or bad`);
    const category = c.label === "good" ? ["good"] : BAD;
    if (!(category as readonly string[]).includes(c.category)) throw new Error(`${where}:${i + 1} has category "${c.category}" for a ${c.label} case`);
    if (!/^knowledge\/\S+$/.test(c.ref)) throw new Error(`${where}:${i + 1} has ref "${c.ref}", expected knowledge/<name>`);
    for (const key of [c.id, c.ref]) {
      if (seen.has(key)) throw new Error(`${where}:${i + 1} repeats "${key}"`);
      seen.add(key);
    }
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/** The order `--limit` takes cases in: one of each category in turn, so a small run holds every kind. */
const ORDER: Case["category"][] = ["good", "duplicate", "stale", "ephemeral"];

export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const queues = ORDER.map((category) => cases.filter((c) => c.category === category));
  const picked = new Set<Case>();
  for (let round = 0; picked.size < limit; round++) {
    for (const queue of queues) if (queue[round] && picked.size < limit) picked.add(queue[round]);
  }
  return cases.filter((c) => picked.has(c));
}

/** A UUID made from the case id, so a planted proposal has the id shape akm gives its own, and the same id on every run. */
export function uuidOf(id: string): string {
  const h = createHash("sha1").update(`promotion-eval:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The name akm gives the sandbox's one bundle, which its refs carry: `bundle//knowledge/<name>`. */
export const BUNDLE = "bundle";
export const STRATEGY = "promotion";

/**
 * The akm config of a run: the model under test as the one engine, and a strategy whose triage block is the one the lab runs,
 * judgment on, except that it stages what the judge accepts and does not write it. The drain decides the same either way: the
 * judgment tier only judges, and promotion lint does not block (akm 0.9.26 prints its findings as non-blocking).
 * The bundle is indexed with akm's built-in embedder, as retrieval and skillret do, because a judge that is shown the nearest
 * notes of a promotion's source memory finds them by their stored vectors.
 */
export function promotionConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "judge");
  const { semanticSearchMode, embedding } = semanticConfig();
  config.semanticSearchMode = semanticSearchMode;
  config.embedding = embedding;
  config.improve = { strategies: { [STRATEGY]: { engine: "judge", processes: { triage: { enabled: true, applyMode: "queue", judgment: { enabled: true } } } } } };
  return config;
}

/** The memory a case's promotion names as its source, `memories/<name>.md` in the bundle. */
export const memoryOf = (c: Case): string => `memories/${c.ref.split("/").pop()}.md`;

/** The values of one row of akm's `proposals` table, for a pending promotion of consolidate, as akm itself writes it. */
export function proposalRow(c: Case, bundleDir: string, now: string): (string | null)[] {
  const meta = {
    changes: [{ path: `${c.ref}.md`, op: "create" }],
    proposedTarget: { source: BUNDLE, root: bundleDir },
    sourceRun: "promotion-eval",
    confidence: 0.95,
    promotionSource: memoryOf(c).replace(/\.md$/, ""),
  };
  return [uuidOf(c.id), bundleDir, `${BUNDLE}//${c.ref}`, "pending", "consolidate", now, now, c.content, null, JSON.stringify(meta)];
}

/** What `akm proposal drain --format json` printed. A staged id is a proposal the judge accepted. */
export interface Drained {
  staged?: string[];
  promoted?: string[];
  rejected?: string[];
  deferred?: { id: string }[];
  failed?: { id: string; reason?: string; detail?: string }[];
}

/** The line akm warns with on stderr when a judgment call fails. The proposal stays undecided, like a defer. */
const DISPATCH_FAILED = /\[triage\] judgment dispatch failed for (\S+): (.*)/g;

export function dispatchFailures(stderr: string): Map<string, string> {
  return new Map([...stderr.matchAll(DISPATCH_FAILED)].map((m) => [m[1], m[2].trim()]));
}

/** One row per case: what the drain did with its proposal. `reasons` holds the judge's reason for each rejection, accept and defer, by proposal id. */
export function rowsFromDrain(cases: Case[], drained: Drained, reasons: Map<string, string>, failures: Map<string, string>): Row[] {
  const accepted = new Set([...(drained.staged ?? []), ...(drained.promoted ?? [])]);
  const rejected = new Set(drained.rejected ?? []);
  const deferred = new Set((drained.deferred ?? []).map((d) => d.id));
  const failed = new Map((drained.failed ?? []).map((f) => [f.id, f.detail || f.reason || "failed"]));
  return cases.map((c): Row => {
    const id = uuidOf(c.id);
    const base = { id: c.id, label: c.label, category: c.category, ref: c.ref, reason: "" };
    const failure = failures.get(id) ?? failed.get(id);
    if (failure !== undefined) return { ...base, outcome: "error", error: failure };
    if (accepted.has(id)) return { ...base, outcome: "accept", reason: reasons.get(id) ?? "" };
    if (rejected.has(id)) return { ...base, outcome: "reject", reason: reasons.get(id) ?? "" };
    if (deferred.has(id)) return { ...base, outcome: "defer", reason: reasons.get(id) ?? "" };
    return { ...base, outcome: "error", error: "the drain did not list the proposal" };
  });
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

export interface Metrics {
  /** The proposals that ran without an error, and how many of them are good. */
  proposals: { n: number; good: number; share_good: number | null };
  /** What the judge accepted, and how many of those were good. */
  accepted: { n: number; good: number };
  /** Of the good proposals, the share accepted. */
  recall: { value: number | null; accepted: number; of: number };
  /** Of the accepted proposals, the share that were good. */
  precision: { value: number | null; good: number; of: number };
  /** Of the bad proposals, the share accepted, in all and by category. */
  bad_accepted: { value: number | null; accepted: number; of: number };
  by_category: Record<Bad, { n: number; accepted: number; rate: number | null }>;
  outcomes: Record<"good" | "bad", Record<Outcome, number>>;
}

/** The numbers the eval reports, over the cases that ran without an error. */
export function metrics(rows: Row[]): Metrics {
  const outcomes = { good: { accept: 0, reject: 0, defer: 0, error: 0 }, bad: { accept: 0, reject: 0, defer: 0, error: 0 } };
  for (const r of rows) outcomes[r.label][r.outcome]++;
  const scored = rows.filter((r) => r.outcome !== "error");
  const accepted = scored.filter((r) => r.outcome === "accept");
  const good = scored.filter((r) => r.label === "good");
  const bad = scored.filter((r) => r.label === "bad");
  const acceptedGood = accepted.filter((r) => r.label === "good").length;
  const acceptedBad = accepted.length - acceptedGood;
  const by_category = Object.fromEntries(
    BAD.map((category) => {
      const of = bad.filter((r) => r.category === category);
      const n = of.filter((r) => r.outcome === "accept").length;
      return [category, { n: of.length, accepted: n, rate: ratio(n, of.length) }];
    }),
  ) as Metrics["by_category"];
  return {
    proposals: { n: scored.length, good: good.length, share_good: ratio(good.length, scored.length) },
    accepted: { n: accepted.length, good: acceptedGood },
    recall: { value: ratio(acceptedGood, good.length), accepted: acceptedGood, of: good.length },
    precision: { value: ratio(acceptedGood, accepted.length), good: acceptedGood, of: accepted.length },
    bad_accepted: { value: ratio(acceptedBad, bad.length), accepted: acceptedBad, of: bad.length },
    by_category,
    outcomes,
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** akm's errors name the URL it called, and results get shared, so the endpoint is written as <MODEL_BASE_URL>. */
export function hideEndpoint(text: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base ? text.split(base).join("<MODEL_BASE_URL>") : text;
}
