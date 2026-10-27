# Repo-map assets and fenced code in search (work in progress, phases 1–2)

**Work in progress.** These runs were collected on October 27, 2026 UTC for [akm#1260](https://github.com/itlackey/akm/issues/1260). Every run is keyword-only, and the grades of the new sets are provisional. The semantic, real-judge and agent-ab runs that finish the spike are in [`finish-on-full-system.md`](finish-on-full-system.md). This report is not in the ledger table of [`../README.md`](../README.md).

## Findings

**Part B: fenced code in search. Recommendation: B1b, pending the full-system runs.**

1. **Fenced code is a real gap.** On the `code` set, keyword search on akm today scores nDCG@10 0.519 and MRR 0.495. One query in three has no relevant asset in the first five.
2. **B1b closes most of the gap.** B1b indexes identifier-like tokens from fences plus quoted keys, quoted paths and dotted code references, and drops every other literal. It raises `code` to nDCG 0.927 and MRR 0.961, and every query gets a relevant asset in the first five.
3. **There is no regression where there are no fences.** `books` has no fenced code and is identical on every prototype. The inline-code repo map is identical too. `library` (116 of 195 Markdown assets have fences) improves slightly: nDCG 0.757 → 0.775, `name` slice 0.836 → 0.881.
4. **B3 (full fenced lines) scores highest, at 0.949, but indexes literal values.** In a probe, it indexed `sk-live-…` token values and `export PRIVATE_TOKEN=abc123` verbatim, which breaks the "no secret bytes in the index" constraint. B1b gets within 0.022 of it without indexing a single literal value.
5. **B2 (B1 plus the fence's language) is identical to B1 on every set.** In keyword search the language word adds nothing. Drop B2 unless a language filter is wanted for its own sake.
6. **Cost.**
   - `index.db` for `corpus/library` grows from 2.79 MB to 3.15 MB with B1b (+12.9%). Indexing time is unchanged within noise (about 1.3–1.5 s).
   - Section (fragment) text, fragment ids and `show` are untouched. The prototypes change only the low-weight `content` projection, which is separate from the fragment projection.
7. **Tests that must change.** On B1, B1b and B3, akm's fence tests fail exactly 3 projection tests. They pin today's contract of "no fenced bytes at all, names included" (`tests/integration/fts/fts-progressive-retrieval.test.ts`). All fragment, `show --context lead` parity and type-exclusion tests pass (55 of 58 in `tests/integration/fts` plus `show-indexer-parity`). Adopting B1b means deliberately changing that contract to "no fenced literal values". That is a maintainer decision, recorded here and not made by the spike.

**Part A: repo-map asset. Retrieval is answered, the agent outcome is not.**

- A generated map is findable as an ordinary knowledge asset when symbols are list items with inline code: nDCG 0.849, and 0.895 on identifier queries.
- Inside fences, today's akm finds almost none of it: 0.485 overall, 0.167 on identifiers, and 7 of 9 identifier queries return nothing.
- B1b lifts the fenced map to 0.743, but the inline layout stays best. A generator should emit inline code either way.
- Whether a map helps an agent finish tasks needs the agent-ab repomap tasks, which could not run here (no Docker). Part A has no decision yet.

## What ran

| | |
|---|---|
| akm b0 | `release/0.10.0` at `f8f97704` (includes the `toc` of `akm show`), reports 0.10.261015 |
| akm prototypes | branches of `f8f97704` in itlackey/akm, each changing only `projectMarkdownContent` in `src/indexer/passes/metadata.ts`: [`spike/1260-b1`](https://github.com/itlackey/akm/tree/spike/1260-b1) `d57a3f79`, [`-b2`](https://github.com/itlackey/akm/tree/spike/1260-b2) `e4ed33b0`, [`-b3`](https://github.com/itlackey/akm/tree/spike/1260-b3) `b98738aa`, [`-b1b`](https://github.com/itlackey/akm/tree/spike/1260-b1b) `55ce53f6`. Throwaway, not for merge |
| Runner | `evals/retrieval/run --akm "bun <checkout>/src/cli.ts"`, natively with Bun 1.4.4, not in the Docker image |
| Search | **Keyword only.** huggingface.co was unreachable, so akm could not download its embedding model |
| Sets | `library` and `books` (public), plus [`code`](../../evals/retrieval/assets/code/README.md), [`repomap`](../../evals/retrieval/assets/repomap/README.md) and `repomap/fenced`, run with `--cases` |

The prototypes:

| | What fenced code adds to the search `content` field |
|---|---|
| B1 | Identifier-like tokens, with camelCase, snake_case and dotted names also split into words. Quoted strings, assignment values, numbers and tokens of 20+ characters that contain a digit are dropped |
| B2 | B1, plus each fence's info-string language |
| B3 | Every fenced line as written |
| B1b | B1, but a quoted key (`"reasoningEffort": …`), a quoted path value (`"/fields/Custom.BusinessValue"`) and a dotted code reference on an assignment's right side (`forbidOnly: !!process.env.CI`) are kept. Every other literal and URL is still dropped |

B1b came from reading B1's misses. Of the 6 `code` queries where B3 led B1 by more than 0.05, 4 were a JSON key, a JSON path value or a code reference that B1 dropped with the literals, and B1b recovers them: c12, c17, c19 and c22. The other 2 need a quoted flag value (c06, `"Microsoft.VSTS.Common.Priority=2"`) and a number (c29, `--max-pages 20`), which B1b still drops as literals by design.

**Grades.**
- `code` was graded again after the prototype runs. The 35 pairs the prototypes surfaced were added under the same provisional protocol (see the set's README), and every `code` run was rescored, b0 included. Every `code` column is 100% judged.
- The public `library` grades are frozen and were **not** extended. The prototypes' `library` columns are 95–96% judged, and an unjudged result counts as not relevant. Condensed nDCG, which reads graded results only, matches nDCG to within 0.001, so the gaps do not change the comparison.

## Results

`search` and `curate` returned the same ranking for every task query in every set, so one column is shown.

### `code` (30 queries, rescored on 419 graded pairs)

| akm | nDCG@10 | MRR | Recall@10 | Success@5 | identifier | config-key | flag | snippet | error | env-var |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| b0 | 0.519 | 0.495 | 0.650 | 63.3% | 0.460 | 0.581 | 0.449 | 0.598 | 0.650 | 0.315 |
| B1 | 0.880 | 0.908 | 0.956 | 100% | 0.938 | 0.659 | 0.904 | 0.981 | 0.949 | 1.000 |
| B2 | 0.880 | 0.908 | 0.956 | 100% | 0.938 | 0.659 | 0.904 | 0.981 | 0.949 | 1.000 |
| **B1b** | **0.927** | **0.961** | 0.972 | 100% | 0.943 | 0.852 | 0.913 | 0.981 | 0.946 | 1.000 |
| B3 | 0.949 | 0.983 | 0.972 | 100% | 0.943 | 0.891 | 0.970 | 0.987 | 0.968 | 1.000 |

The per-kind columns are nDCG@10. Runs: `retrieval/2026-10-27-<akm>-code-own-rescored`.

### Public collections (regression)

| akm | `library` nDCG@10 | MRR | Recall@10 | `name` slice nDCG | judged@10 | `books` nDCG@10 | MRR |
|---|---:|---:|---:|---:|---:|---:|---:|
| b0 | 0.757 | 0.911 | 0.745 | 0.836 | 100% | 0.836 | 0.905 |
| B1 | 0.773 | 0.922 | 0.773 | 0.881 | 95.1% | 0.836 | 0.905 |
| B2 | 0.773 | 0.922 | 0.773 | 0.882 | 95.1% | 0.836 | 0.905 |
| **B1b** | **0.775** | 0.922 | 0.777 | 0.881 | 95.5% | 0.836 | 0.905 |
| B3 | 0.776 | 0.922 | 0.772 | 0.875 | 95.0% | 0.836 | 0.905 |

By `library` query kind (nDCG@10), b0 → B1b: direct 0.812 → 0.813, multi 0.820 → 0.820, name 0.836 → 0.881, paraphrase 0.576 → 0.608. Only the b0 `library` and `books` runs are published here, in `retrieval/`. The prototype runs of the public collections are left out of `reports/` because the public ledger lists every public-corpus run there, and prototype builds are not akm releases. Keyword runs are deterministic for one build and library, and the runbook's commands reproduce them.

### `repomap` (20 queries over 15 map assets of akm `src/`)

| akm | inline: nDCG@10 | MRR | identifier nDCG | fenced: nDCG@10 | MRR | identifier nDCG |
|---|---:|---:|---:|---:|---:|---:|
| b0 | 0.849 | 0.858 | 0.895 | 0.485 | 0.433 | 0.167 |
| B1, B2, B1b | 0.849 | 0.858 | 0.895 | 0.743 | 0.683 | 0.766 |
| B3 | 0.849 | 0.858 | 0.895 | 0.755 | 0.662 | 0.769 |

With 15 assets, a random ranking already puts a relevant asset in most first tens, so read MRR and nDCG, not recall.

### Index cost (`corpus/library`, 251 assets, keyword index)

| akm | `index.db` | vs b0 | `akm index` |
|---|---:|---:|---:|
| b0 | 2,793,472 B | | 1.39 s |
| B1 | 3,117,056 B | +11.6% | 1.54 s |
| B2 | 3,125,248 B | +11.9% | 1.52 s |
| B1b | 3,153,920 B | +12.9% | 1.25 s |
| B3 | 3,162,112 B | +13.2% | 1.43 s |

These are single measurements in a shared container: the time differences are noise.

## Phase 1: why fenced code is excluded today

The history gives safety and the search–show contract as the reasons, not retrieval quality:
- `c08d8f476` (SPEC-8): fence interiors "are never prose (and may be secrets-adjacent command text)".
- `b326fbbf0` (akm#819): `projectMarkdownContent`.
- `6c420f522` (akm#937): fragments are built from a parallel safe projection.
- akm#1200: no body links inside code.

Pinned by:
- `tests/integration/fts/fts-progressive-retrieval.test.ts`
- `tests/integration/fts/markdown-fragment-retrieval.test.ts`
- `tests/integration/show-indexer-parity.test.ts`

The constraints any change keeps, and where B1b stands on each:

| Constraint | B1b |
|---|---|
| Fragment text, `show` (exact and `--context lead`) and fragment ids come from the one safe fragment projection | Kept. Only the `content` projection changes; every fragment and parity test passes |
| No secret or env bytes in the index | Literal values, URLs and long token-like strings are dropped. Names of variables (`PRIVATE_TOKEN`) are indexed, which is exactly what the 3 failing tests forbid today. Secret, env and session assets are still excluded by type |
| Exact fence parsing (closer length, tildes, comment state) | Kept. The prototype reuses `parseMarkdownFenceOpening` / `isMarkdownFenceClosing` |
| Size | `content` cap unchanged (1,000,000 chars); +12.9% index on this library |
| Fragments are not searched; `content` is the lowest-weight field | Unchanged. Note that `content` feeds the embedding input too (`buildSearchText`), so the semantic runs are needed |

## Limits

- **Keyword only.** `content` also feeds the semantic embedding, so B1b changes semantic vectors. Untested here.
- **Provisional grades.** The new sets were written and graded by one model, with no person or second judge. 20 to 30 queries per set, so one query moves a mean by 0.03 to 0.05.
- **Prototype numbers are ranking quality only.** The agent-level effect (agent-ab) of both parts is unmeasured.
- **Agent outcome for the map is unmeasured.** `repomap` measures finding the right directory's map, not the file or symbol inside it.
