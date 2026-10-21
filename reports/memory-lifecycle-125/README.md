# Memory lifecycle coverage — issue #125

Status: **needs iteration / waiting for combined product build**. This change
adds opt-in integration checks; it does not deploy AKM fixes or close
[akm-eval #125](https://github.com/itlackey/akm-eval/issues/125).

The user job is preserving defined memory claims, evidence and scopes from
session capture through extraction, acceptance, improvement and supported recall.
The hypothesis is that a small public-CLI test beside nightly, using existing
helpers, can expose boundary failures hidden by proposal-only scores. Primary
acceptance is every defined lifecycle path passing on **one combined build**.
Blocking integrity checks are lost evidence, cross-scope retirement, missed
eligible results and duplicated/lost application. Runtime and maintenance cost
come after those constraints; model reasoning quality is outside these checks.

## Preparation and protocol

- Harness base: `1002fa22d783d010a901af82496cac234920875c`, fetched from
  `akm-eval/origin/main`; isolated branch `test/125-memory-lifecycle`, PR base main.
- Clean `akm-stash/main` clone followed by `git pull --ff-only origin main`:
  `fd61fd1980f5785937b4a4ed81ffd4af976d2538`. The installed AKM registry-cache
  checkout was clean and fast-forwarded to the same commit. Read the current
  measured-improvement skill, process guidance (evaluation infrastructure and
  memory processes), evaluation guide and definition of done, local repository
  AGENTS instructions, compatibility notes, AKM architecture, persisted-data
  compatibility and stability documentation.
- Selected release: `release/0.10.0` at
  `d0fe1d0000d0ed0b268ee2d5c153fdf578daa7cf`, version `0.10.261008`.
  It contains #1195 via #1202. A second fetch confirmed this release head.
- During final validation the release advanced to
  **`946c4b5acd4516a194d8c02f670b215e546bb4fc`**, also `0.10.261008`, adding
  #1197 via #1203. A separate clean checkout/build and unchanged tests/contract
  smoke verified that combined #1195+#1197 build. Its changed persisted-data
  compatibility note was read too. This is the final tested release commit;
  #1196/#1198/#1199 are still absent.
- Earlier build: `6d586905ed5777b69b141b72b246edc2f4d48456`, version
  `0.10.261007`, before the complete-evidence fix. Both used `bun run build`
  and their own `dist/cli.js`, Bun 1.4.1, matching installed dependencies.
- No existing collector, case labels, scoring or published settings changed.
  No measurement-version bump or rescoring is applicable. The scripted test
  understands each build's actual judge schema; malformed reply incompatibility
  is not counted as evidence of the old truncation defect.

Budget set before evaluation: at most three implementation designs, at most
30 minutes of validation execution (including calibration), no paid model calls;
reserve baseline/release comparisons, normal checks and affected contract smoke.
The six lifecycle scenarios are independently authored synthetic examples. They
are finite integrity checks, not a held-out model-quality benchmark.

| Design | Result | Decision |
|---|---|---|
| 1: direct CLI cases using lib/akm and smoke stub | Exposes missing serialized evidence, cross-scope pairing, missing curate flags and candidate starvation; complete-note and recovery controls work | Keep; repair fixture invocation/output assumptions with AKM build/settings fixed |
| 2: interrupt at Git pre-commit | Hook never fires: AKM uses commit-tree/update-ref | Remove this hook design; do not report an interruption pass |
| 3: interrupt at Git reference-transaction prepared phase | Actual AKM child exits before acknowledgment; existing acceptance resumes without another archive, then revert restores content | Keep; no further designs |

Calibration failures included restricted loopback binding, JSON flags on
`--version`, missing remember tags, nested archive layout, default-bundle short
refs, removed drain `--policy`, and old/new judge schemas. These were harness
repairs on the same AKM builds, not product improvements. Log comparisons across
those repairs must not be presented as old-versus-fixed AKM quality gains.

Effective test settings: one writable fixture filesystem bundle, no registries,
isolated HOME/CODEX_HOME/XDG/AKM paths, explicit native session location, existing
word-hash embeddings (`AKM_EMBED_DETERMINISTIC=1`), semantic mode auto except the
explicit keyword starvation case. Local scripted OpenAI endpoint only; JSON
schema enabled, temperature 0, thinking off, 5s engine timeout, 30s per CLI call,
20s improve budget. Extract uses the existing extract-only configuration
(session-summary indexing and heuristic triage disabled); improvement uses the
release's consolidate strategy. Config files and complete requests are saved.
Cold isolated indexes are built per case; no model download or warm private
cache is used. Scripted token counts are placeholders, not measured model cost.

## Commands and observations

```sh
# Preparation (clean checkouts; installation used Bun)
git clone https://github.com/itlackey/akm-stash.git /tmp/akm-125-stash
git -C /tmp/akm-125-stash pull --ff-only origin main
git fetch origin release/0.10.0
git worktree add --detach /tmp/akm-125-release origin/release/0.10.0
# In AKM release checkout: bun install && bun run build
# In isolated eval clone: git fetch origin
git worktree add -b test/125-memory-lifecycle /tmp/akm-125-eval origin/main

# Same finalized assertions/settings; only the product command changes
AKM_EVAL_REAL_AKM=1 AKM_BIN='bun /tmp/akm-125-before/dist/cli.js' \
  bun test evals/nightly/src/memory-lifecycle.test.ts
AKM_EVAL_REAL_AKM=1 AKM_BIN='bun /tmp/akm-125-release/dist/cli.js' \
  bun test evals/nightly/src/memory-lifecycle.test.ts
AKM_EVAL_REAL_AKM=1 AKM_BIN='bun /tmp/akm-125-current/dist/cli.js' \
  bun test evals/nightly/src/memory-lifecycle.test.ts

scripts/check typecheck
scripts/check python
scripts/check test
scripts/smoke/run --contract --only retrieval,extract,consolidate,nightly \
  --akm 'bun /tmp/akm-125-current/dist/cli.js' --timeout 120 --keep
```

The finalized checks use identical fixtures, scripted decisions and explicit
settings on both product builds. Changing the required response fields to fit
each build's request is syntax adaptation, not a different judgment treatment.

| Check | Earlier `6d586905e` | Release `d0fe1d000` | Final release `946c4b5ac` |
|---|---|---|---|
| Missing/corrupted evidence assertion self-test | pass | pass | pass |
| Session → accepted/indexed Markdown → real judged/accepted improvement → recall | FAIL: evidence/source identity absent from serialized content | same failure (#1196) | same failure |
| Complete long duplicate, accepted archive, repeat accept, revert/show | FAIL: tail absent from both model requests | pass | pass |
| Distinct long tail, wrong first judgment, second check, drain/show | FAIL: tail absent from both model requests | pass; unstaged, drain accepts none, tail remains | pass |
| Different-user scopes remain separate | FAIL: cross-user pair judged/proposed | same failure (#1197) | **pass** |
| Same-user/agent consolidation control | pass | pass | pass |
| Search current correction / historical source | pass | pass | pass |
| Curate with the same scope/belief controls | FAIL: unknown `--filter` | same failure (#1199) | same failure |
| 121 ineligible neighbors, keyword | FAIL: no eligible hit | same failure (#1198) | same failure |
| 121 ineligible neighbors, deterministic hybrid | FAIL: no eligible hit | same failure (#1198) | same failure |
| Failed judgment plus stale-acceptance content preservation | pass | pass | pass |
| Interrupted pending acceptance, resume twice, single archive, revert | pass | pass | pass |
| Total / elapsed | **5 pass, 7 fail; 32.76s** | **7 pass, 5 fail; 36.34s** | **8 pass, 4 fail; 32.48s** |

See [earlier-build output](baseline.log), [release output](release.log), and
[affected contract smoke](contract-smoke.log). No case was skipped in the opted-in
runs. The newer scope fix is verified by [final release output](current-release.log)
and [final release contract smoke](current-contract-smoke.log), with unchanged
harness code/settings. All 12 controlled sandboxes per build produced completion/error records;
there were zero CLI timeouts. The deliberate stale refusal and process kill are
successful negative-path observations, not missing completion silently excluded.

Failure-detection evidence is independent of success replies:

- Both model stages receive scripted success judgments for the long duplicate,
  yet the old-build assertions fail because the actual requests omit the tail.
  For the duplicate, pair/check prompts contain **0/0** tail occurrences on the
  earlier build versus **2/2** on the release. For the distinct-tail pair the
  counts are **0/0** versus **1/1**. Checks inspect complete requests, not the
  smoke helper's truncated prompt preview. Both assessment stages are observed.
- Extraction records one candidate and one pending proposal with the receipt in
  `payload.frontmatter.evidence`; acceptance returns `ok:true`. The serialized
  payload and actual Markdown omit that evidence/source identity. The test still
  completes indexing, show, search, a real duplicate judgment/retirement/acceptance
  and curate before checking each content boundary. It does not count a
  successful singleton/no-op improve as improvement coverage.
- The assertion test independently replaces each expected claim, receipt and
  session identity with `CORRUPTED` while keeping `ok:true` and intact surrounding
  metadata, and also removes content entirely. Each appropriate assertion throws;
  empty or superseded retrieval selections throw too (27 assertions).
- Interrupted acceptance uses the disposable Git ref-transaction hook after
  archival and intent persistence. The CLI exits without acknowledgment; the
  pending proposal and one audit/archive exist. The hook is removed; two public
  accepts finalize one proposal without another archive, and public revert
  restores the defined content. This is one crash point, not exhaustive races.

Full local artifacts are retained in the isolated eval worktree:
`evals/nightly/results/memory-lifecycle-2026-10-21T03-27-20.146Z/` (earlier) and
`evals/nightly/results/memory-lifecycle-2026-10-21T03-27-16.400Z/` (release).
Each case has `commands.jsonl`, `requests.json`, `completion.json`, actual
bundle/config/session files, `index.db` and `state.db`. These are synthetic data;
the large snapshots stay in the existing ignored results folder. The committed
logs above retain commands' assertion failures and stage coverage for review.
The final #1195+#1197 build's equivalent artifacts are under
`evals/nightly/results/memory-lifecycle-2026-10-21T03-32-24.898Z/`.
Committed display logs have trailing whitespace removed; original raw command
outputs and requests remain untouched in those local artifacts.

Repository verification:

- `scripts/check typecheck`: pass across all configured source folders.
- `scripts/check python`: **50 passed**, 2.61s pytest time.
- Focused documentation/assertion checks: **58 passed, 11 opt-in skips**, 0.203s.
- First `scripts/check test`: **2917 passed, 24 opt-in skips, 1 failure + 1
  follow-on error**, 342.08s. The existing repeated-collection retrieval test
  exceeded Bun's default 5s bound; cleanup then removed its still-used output
  directory. This failure is retained, not called a product regression or ignored.
- `bun test --timeout 30000`: **2918 passed, 24 opt-in skips, 0 failures**,
  265.36s. Same 2,942 tests, no assertions removed. The timed-out retrieval
  multi-collection case completed with the larger execution bound.
- Real-AKM affected contract smoke, both tested release builds: **2/4 pass** (retrieval, extraction),
  consolidation/nightly fail the older canned-schema match. Positive and
  malformed-reply legs completed; see the existing compatibility dependency.
  This is runner compatibility evidence, not a quality score.

No model quality improvement or runtime speedup is claimed. Calibration and
final execution stayed within the recorded budget; all model calls used loopback
scripted replies. Real-model collection is still an unmet final-acceptance item.

## Dependencies, limits and rollout

- [AKM #1196](https://github.com/itlackey/akm/issues/1196): evidence exists in
  proposal metadata, but not serialized payload/accepted Markdown. Acceptance
  says `ok:true`. This blocks the complete capture-to-recall path.
- [AKM #1197](https://github.com/itlackey/akm/issues/1197): identical Alice/Bob
  memories reached the pair judge and a retirement proposal on `d0fe1d000`.
  **Addressed in final tested `946c4b5ac`: cross-scope and same-scope controls
  both pass.** Only user/agent examples are covered, not every
  scope-key combination or promotion variant.
- [AKM #1198](https://github.com/itlackey/akm/issues/1198): 121 ineligible Bob
  notes precede Alice; scoped keyword/hybrid searches return `hits:[]`. This
  checks lexical and fused deterministic-vector paths, not exhaustive isolated
  vector eligibility or real embedding quality.
- [AKM #1199](https://github.com/itlackey/akm/issues/1199): explicit search
  current/historical controls work, but curate rejects `--filter`. Defaults,
  linked support enrichment and packing remain subject to that workstream's
  acceptance; no chosen-default quality claim is made here.
- Existing smoke compatibility work: branch
  `fix/1195-consolidate-smoke-compat`, commit
  `a9f30b113735454dd37f27b32ccff9989fc5b214` (itlackey), updates canned replies
  for the claim-only judge schema. Current main's consolidation/nightly smoke
  fails on that mismatch. This change does not duplicate that fix.

The remaining product issues were unassigned when inspected; AKM maintainer itlackey owns the
release integration decision. No component runs on separate builds are combined
into final acceptance. Real-model extract/consolidate/nightly pilots and any
required full collections remain deferred until the combined build exists;
existing runners and scoring are unchanged. Scripted smoke is not a substitute
for those quality measurements. Exhaustive races, malformed-state variants,
rename preservation and stable document identity stay outside this harness.

Iteration stops at the three-design limit with trustworthy passing controls
and explicit product failures. Next action: land the linked fixes and smoke
compatibility, select/build one combined release commit, rerun these commands,
inspect raw outputs, then complete affected real-model measurements. Do not
weaken assertions, silently skip cases or implement AKM fixes in the harness.

Applicable rollout is harness merge/publication plus remote and installed-path
verification. A branch push preserves the work; it is not accepted publication.
Opening the requested PR remains conditional on the user's required combined
acceptance evidence. No production data migration applies. Rollback is reverting
the harness commit; test recovery uses the existing `proposal accept`/`revert`
commands in disposable libraries. Publishing this harness does not deploy any
AKM product fixes.
