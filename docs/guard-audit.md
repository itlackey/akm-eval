# Blocking-check audit

Scope: shared libraries, eval/benchmark entrypoints, compare/rescore/replay tools,
public ledger, Docker entrypoint and CI. No benchmark collection or model calls
were started for this audit.

## Removed or narrowed

| Check | Result |
|---|---|
| Missing modern manifest blocks saved-run comparison | Legacy results load with explicit provenance warnings. Matching recorded public cases and clean collector commits support historical deltas. |
| Different versions, cases, inputs or labels abort the whole comparison | Both stored values remain visible; unsupported deltas stay blank. No automatic intersection or rescoring. |
| Stopped status or `.running` file blocks reading saved results | Comparison and offline rescoring read saved snapshots with explicit status/coverage warnings. |
| New comparison report forbidden anywhere inside an input folder | New sidecar reports are allowed; overwriting an existing source artifact remains an error. |
| Missing sample file blocks viewing summary metrics | Summary values remain readable; unverified deltas stay blank. |
| Missing manifest blocks offline rescoring and diagnostic replay | Saved raw output can be used; unknown original input identity stays explicitly unverified. No fabricated manifest and no source mutation. |
| Distill score spelling rejected according to release string | Read the recorded `novelty` or `reusable` field. Missing actual scores still produce a specific error. |
| Harmless model metadata rejects the entire configuration | Warn with key names, never values. Actual credential/private-policy validation and required field types remain unchanged. |
| Version string prevents trying a requested AKM build | Warn about the tested minimum. Actual command/output errors remain recorded errors. |
| Unambiguous retired corpus spelling rejects an existing command | `private` aliases the existing seeded `custom` corpus. `own`/`own-feedback` with explicit `--cases` use that folder; no private folder is guessed. |
| Public ledger hides old or stopped public artifacts | Already-public legacy results carry a status note; stopped results are Diagnostic. Private corpora remain excluded and redaction remains enabled. |

## Kept for a concrete reason

- Invalid JSON, duplicate case IDs, malformed cases and impossible model limits:
  these cannot be interpreted reliably.
- Original-result overwrite protection, atomic writes, path containment and index
  locks: prevent data loss, corruption and concurrent mutation.
- Actual semantic-mode/embedding checks: the operator explicitly requested semantic
  retrieval; a keyword fallback must not be reported as semantic success.
- Dataset hashes, resume input/settings identity and missing raw scorer fields:
  prevent combining different data or inventing unrecorded answers/measurements.
- Failure circuit breakers: repeated endpoint failures and HTTP 429s occurred in
  real runs; continuing would spend time and requests without collecting outcomes.
- Credential redaction, public-corpus publication restriction and credential-to-host
  routing: prevent disclosure to a different endpoint or the public ledger.
- Benchmark token limits, retrieval depth and grading thresholds: these are recorded
  measurement settings, not permission gates; changing them changes the experiment.

## Additional findings requiring explicit scope

- Custom `--cases` commands require a second confirmation and reject noninteractive
  use without `--yes`. A small replacement that only reports the selected destination
  is prepared separately. Automatic approval review rejected changing this private-data
  egress behavior without specific authorization; the current prompt remains pending.
- Harbor requires a nonempty API-key value even for a keyless compatible server.
  Its existing documented placeholder workaround remains; credential/authentication
  behavior was not changed as part of the narrower approved edits.
- Harbor rejects moving npm tags/ranges for `--akm`. Supporting them honestly requires
  resolving and recording the exact installed build once; this audit does not add a
  package-resolution workflow.

## Validation

Comparison and reader regressions exercise legacy metadata, stopped coverage,
missing samples, version/label/input differences, score spellings and source
preservation. The historical October 11 retrieval pair is also checked from its
saved artifacts: AKM 0.9.31 and 0.10.26101002 have 136 library and 51 books queries,
with identical recorded rankings/grades/scores. Library index timing is qualified
because its cache conditions differ. No rerun is required to view those results.
