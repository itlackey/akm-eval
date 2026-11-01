// The sentinel guard of the retrieval eval: tells a build that applies a query's search flags from one that does not.
//
// A filter query (a query with `searchArgs` such as `--since`) carries a sentinel: an asset outside the filter's window that matches the query
// best, so an unfiltered search always returns it. Two answers show that the build does not apply the flags:
//   - the sentinel comes back, because the build ignores a flag it does not declare (older builds did), or
//   - the call fails with akm's unknown-flag error, because the build refuses it (0.10.261022 does: UNKNOWN_FLAG, exit 2).
// Either way the numbers of the filter queries would mean nothing, so the column is `unsupported` and its filter queries stay out of the
// metrics. The guard reads rows only, so scripts/rescore applies it to a stored run. It does not guess from a version number.

import type { Row, System } from "./score.ts";

/** akm's refusal of a flag it does not declare: `{"code": "UNKNOWN_FLAG", "error": "Unknown flag \"--since\"."}`. */
export const isUnknownFlag = (error: string): boolean => /UNKNOWN_FLAG|Unknown flag/.test(error);

/** The columns that `searchArgs` reach: curate keeps its usual invocation, so a filter query is not scored there. */
export const takesSearchArgs = (sys: System): boolean => sys === "search" || sys === "semantic_search";

/** A guarded row is a query with sentinels. */
export const isGuarded = (row: Pick<Row, "sentinels">): boolean => (row.sentinels?.length ?? 0) > 0;

/** Why one guarded row shows that its column does not apply the flags, or null when it does not show it. */
export function evidenceOf(row: Row, sys: System): string | null {
  const answer = row[sys];
  if (!isGuarded(row) || !takesSearchArgs(sys) || answer === undefined) return null;
  if (answer.unsupported) return `${row.id}: akm refused the flag (${row.searchArgs?.join(" ") ?? "no searchArgs"})`;
  const returned = (row.sentinels ?? []).find((ref) => answer.refs.includes(ref));
  return returned === undefined ? null : `${row.id}: the out-of-window sentinel ${returned} came back`;
}

/** The columns whose filter queries are unsupported, each with the first evidence of it. */
export function unsupportedColumns(rows: Row[], systems: readonly System[]): Partial<Record<System, string>> {
  const out: Partial<Record<System, string>> = {};
  for (const sys of systems) {
    const evidence = rows.map((row) => evidenceOf(row, sys)).find((e) => e !== null);
    if (evidence) out[sys] = evidence;
  }
  return out;
}
