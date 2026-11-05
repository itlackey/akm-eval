// The sentinel guard of the retrieval eval: tells a build that applies a query's search flags from one that does not.
//
// A filter query (a query with `searchArgs` such as `--since`) carries a sentinel: an asset outside the filter's window that matches the query
// best, so an unfiltered search always returns it. Two answers show that the build does not apply the flags:
//   - the sentinel comes back, because the build ignores a flag it does not declare (akm before 0.9.0 did), or
//   - the call fails with akm's unknown-flag error, because the build refuses it (0.10.261022 does: UNKNOWN_FLAG, exit 2).
// Either way the numbers of the filter queries would mean nothing, so the column is `unsupported` and its filter queries stay out of the
// metrics. The guard reads rows only, so scripts/rescore applies it to a stored run. It does not guess from a version number.

import type { Row, System } from "./score.ts";

// A query with a selection (see score.ts, `Case.selection`) is guarded differently: its flag reaches both commands, so curate is scored for it too, and
// the only evidence that a column cannot apply it is akm refusing the flag. A selection has no sentinel: a build that ignores a flag it does not
// declare (before 0.9.0) is not a build the selection suite supports, and the version is on the summary.

/** akm's refusal of a flag it does not declare: `{"code": "UNKNOWN_FLAG", "error": "Unknown flag \"--since\"."}`. */
export const isUnknownFlag = (error: string): boolean => /UNKNOWN_FLAG|Unknown flag/.test(error);

/** The columns that `searchArgs` reach: curate keeps its usual invocation, so a filter query is not scored there. */
export const takesSearchArgs = (sys: System): boolean => sys === "search" || sys === "semantic_search";

/** A guarded row is a query with sentinels. */
export const isGuarded = (row: Pick<Row, "sentinels">): boolean => (row.sentinels?.length ?? 0) > 0;

/** A selected row is a query with a selection. */
export const isSelected = (row: Pick<Row, "selection">): boolean => Object.keys(row.selection ?? {}).length > 0;

/** Whether the special flags of a row (its searchArgs or its selection) reach the column: searchArgs reach search only, a selection reaches both commands. */
export const reaches = (row: Pick<Row, "sentinels" | "selection">, sys: System): boolean => isSelected(row) || (isGuarded(row) && takesSearchArgs(sys));

/** Why one guarded row shows that its column does not apply the flags, or null when it does not show it. */
export function evidenceOf(row: Row, sys: System): string | null {
  const answer = row[sys];
  if ((!isGuarded(row) && !isSelected(row)) || !reaches(row, sys) || answer === undefined) return null;
  if (answer.unsupported) return `${row.id}: akm refused the flag (${isSelected(row) ? "the selection" : (row.searchArgs?.join(" ") ?? "no searchArgs")})`;
  if (!isGuarded(row)) return null;
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

/** The kind of a query that holds a metadata value found in no asset's text (a project codename). */
export const LEAK_KIND = "leak";

/**
 * How many leak queries returned anything in a column, or null where the check does not hold or the set has no leak query. Metadata that reaches the ranked text makes a
 * query for a metadata value find the assets that carry it, with the selection and without. A keyword column returns nothing for a word that is in
 * no text, so any result is a leak; a semantic column returns its nearest neighbours whatever the query is, so it is not checked.
 */
export function leaked(rows: Row[], sys: System): number | null {
  const leaks = rows.filter((r) => r.kind === LEAK_KIND);
  if (sys.startsWith("semantic_") || leaks.length === 0) return null;
  return leaks.filter((r) => (r[sys]?.refs.length ?? 0) > 0).length;
}
