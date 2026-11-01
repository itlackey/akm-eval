// The scorer of what `consolidate --pool` measures besides retirements: whether akm's search and curate rank the current note better, and still find the notes
// that are valid, before and after a retirement is accepted. It is pure and needs no akm, like pool-score.ts: it scores the answers retrieval.json holds with
// the retrieval eval's own scorer (`makeRow`, `summarizeRows`), unchanged. Nothing here may import the collector.

import { type Case, type RawAnswer, makeRow, summarizeRows } from "../../retrieval/src/score.ts";
import { type Cluster, type Kind, KINDS, type Pool, judgeRetirement } from "./pool-score.ts";
import { nameOfRef } from "./score.ts";

/** A query of assets/pool/queries.jsonl with the grades and banned notes of its qrels: the retrieval eval's case, and the cluster whose notes it is about. */
export interface PoolQuery extends Case {
  cluster: string;
}

/**
 * The four times the queries are asked. `before` and `noop` are two runs of the same queries in a copy of the pool that nothing was done to, so their difference
 * is the noise of the index. `after_accept` is the pool's own sandbox straight after `akm proposal drain --promote --yes`, with no reindex, which is what a user
 * sees. `after` is the same sandbox after `akm index --full`.
 */
export const PHASES = ["before", "noop", "after_accept", "after"] as const;
export type Phase = (typeof PHASES)[number];
export const COMMANDS = ["search", "curate"] as const;
export type Command = (typeof COMMANDS)[number];

/** What akm returned for one query in one phase, in both commands: the retrieval eval's raw answer. */
export type Answers = Record<Command, RawAnswer>;

/** One line of retrieval.json: the answers to a query in every phase. */
export interface QueryAnswers {
  id: string;
  cluster: string;
  phases: Record<Phase, Answers>;
}

/** An accepted retirement, as `akm proposal list --status accepted` names it. */
export interface Accepted {
  retiredRef: string;
  successorRef: string | null;
}

/** What retrieval.json holds: the retirements the drain accepted, and the answers. */
export interface RetrievalRaw {
  accepted: Accepted[];
  rows: QueryAnswers[];
  /** Wall seconds of each step: the baseline, the drain, and the two sets of queries after it. */
  seconds: Record<string, number>;
}

/** The numbers of one group of queries in one phase and command. `errored` calls are left out of the means. */
export interface GroupMetrics {
  n: number;
  errored: number;
  mrr: number | null;
  success_5: number | null;
  /**
   * Only for the control queries. For the retire queries it is left out: a duplicate or triple has every note graded 3, so the correct retirement of one reads as a loss, and on
   * the other retire queries one note is relevant and it says no more than `mrr`.
   */
  ndcg_10?: number | null;
  /** The share of the queries that ban a note where one ranks above the first relevant note. Lower is better. */
  banned_above_first: number | null;
}
const FIELDS = ["mrr", "success_5", "ndcg_10", "banned_above_first"] as const;
type Field = (typeof FIELDS)[number];

export interface CommandMetrics {
  /** Queries of clusters with a note that may be retired (duplicate, triple, subsumed, supersedes). */
  retire: GroupMetrics;
  /** Queries of the other clusters, whose notes must stay findable: a drop is lost recall. */
  control: GroupMetrics;
  kinds: Partial<Record<Kind, GroupMetrics>>;
}

export interface RetrievalSummary {
  n_queries: number;
  n_retire_queries: number;
  n_control_queries: number;
  /** The retirements the drain accepted, and how the pool's labels judge them. */
  accepted: { n: number; safe: number; unsafe: number; wrong_successor: number };
  phases: Record<Phase, Record<Command, CommandMetrics>>;
  /** Each phase's metrics less those of `before`, for the retire and the control queries. `noop` is the control: it should be about 0. */
  delta: Record<Exclude<Phase, "before">, Record<Command, Record<"retire" | "control", Partial<Record<Field, number | null>>>>>;
  /**
   * The share of the accepted retirements whose retired note a query of its cluster still returns. About 1 before, and 0 after the reindex. A retirement that no query returns
   * and one of whose queries failed is not in `of`.
   */
  retired_ref_returned: Record<Exclude<Phase, "noop">, Record<Command, { returned: number; of: number; rate: number | null }>>;
  seconds: Record<string, number>;
}

const hasRetire = (c: Pick<Cluster, "retire">): boolean => Object.keys(c.retire).length > 0;
const round = (x: number | null): number | null => (x === null ? null : Number(x.toFixed(4)));

function groupMetrics(queries: PoolQuery[], rows: QueryAnswers[], phase: Phase, command: Command, ndcg: boolean): GroupMetrics {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const scored = queries.flatMap((q) => {
    const a = byId.get(q.id)?.phases[phase];
    return a ? [makeRow(q, a)] : [];
  });
  const s = summarizeRows(scored); // each command's means leave out the queries whose call of that command failed, and no others
  const m = s.metrics[command];
  return { n: m.n, errored: s.errored[command], mrr: round(m.mrr), success_5: round(m.success_5), ...(ndcg ? { ndcg_10: round(m.ndcg_10) } : {}), banned_above_first: round(m.banned_above_first) };
}

/**
 * The summary of the retrieval measurement: the metrics of the retire and the control queries in every phase (and by the kind of cluster), the deltas against `before`, and the
 * share of accepted retirements whose retired note is still returned.
 */
export function retrievalSummary(pool: Pick<Pool, "clusters">, queries: PoolQuery[], raw: RetrievalRaw): RetrievalSummary {
  const cluster = new Map(pool.clusters.map((c) => [c.id, c]));
  const retire = queries.filter((q) => hasRetire(cluster.get(q.cluster) as Cluster));
  const control = queries.filter((q) => !hasRetire(cluster.get(q.cluster) as Cluster));
  const kindsOf = (kind: Kind) => queries.filter((q) => cluster.get(q.cluster)?.kind === kind);
  const phases = Object.fromEntries(
    PHASES.map((p) => [
      p,
      Object.fromEntries(
        COMMANDS.map((c) => [
          c,
          {
            retire: groupMetrics(retire, raw.rows, p, c, false),
            control: groupMetrics(control, raw.rows, p, c, true),
            kinds: Object.fromEntries(KINDS.filter((k) => kindsOf(k).length > 0).map((k) => [k, groupMetrics(kindsOf(k), raw.rows, p, c, !hasRetire(cluster.get(kindsOf(k)[0]!.cluster) as Cluster))])),
          },
        ]),
      ),
    ]),
  ) as RetrievalSummary["phases"];
  const diff = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : round(a - b));
  const delta = Object.fromEntries(
    PHASES.filter((p) => p !== "before").map((p) => [
      p,
      Object.fromEntries(
        COMMANDS.map((c) => [c, Object.fromEntries((["retire", "control"] as const).map((g) => [g, Object.fromEntries(FIELDS.filter((f) => f in phases.before[c][g]).map((f) => [f, diff(phases[p][c][g][f] ?? null, phases.before[c][g][f] ?? null)]))]))]),
      ),
    ]),
  ) as RetrievalSummary["delta"];

  const verdicts = raw.accepted.map((a) => judgeRetirement(pool, nameOfRef(a.retiredRef), a.successorRef ? nameOfRef(a.successorRef) : null)?.verdict);
  // Returned when a query of its cluster returns it; not known (null) when none does and one of those calls failed, as a failed call is left out of the means.
  const returnedIn = (phase: Phase, command: Command, a: Accepted): boolean | null => {
    const name = nameOfRef(a.retiredRef);
    const mine = new Set(queries.filter((q) => cluster.get(q.cluster)?.notes.includes(name)).map((q) => q.id));
    const answers = raw.rows.filter((r) => mine.has(r.id)).map((r) => r.phases[phase][command]);
    if (answers.some((x) => x.refs.some((ref) => nameOfRef(ref) === name))) return true;
    return answers.some((x) => x.error) ? null : false;
  };
  const returned = (phase: Phase, command: Command) => {
    const known = raw.accepted.map((a) => returnedIn(phase, command, a)).filter((x) => x !== null);
    const n = known.filter(Boolean).length;
    return { returned: n, of: known.length, rate: known.length === 0 ? null : round(n / known.length) };
  };
  const rates = Object.fromEntries((["before", "after_accept", "after"] as const).map((p) => [p, Object.fromEntries(COMMANDS.map((c) => [c, returned(p, c)]))])) as RetrievalSummary["retired_ref_returned"];

  return {
    n_queries: queries.length,
    n_retire_queries: retire.length,
    n_control_queries: control.length,
    accepted: { n: raw.accepted.length, safe: verdicts.filter((v) => v === "safe").length, unsafe: verdicts.filter((v) => v === "unsafe").length, wrong_successor: verdicts.filter((v) => v === "wrong_successor").length },
    phases,
    delta,
    retired_ref_returned: rates,
    seconds: raw.seconds,
  };
}
