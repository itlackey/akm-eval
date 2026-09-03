# Memory backends

The repository defines `none`, `raw-vector`, and `akm` backend IDs,
implementing the 4-method `MemoryBackend` interface in `src/memory/types.ts`
(`add`/`search`/`reset`/`healthCheck`).

Current runnable/truthful status:

- `none`: runnable — disabled baseline, no retrieval.
- `raw-vector`: runnable — deterministic in-memory cosine-similarity baseline.
- `akm`: runnable — a real, evaluated integration against the akm CLI (subprocess form). See
  below for what "real" means here and where its ceiling comes from.
- Competitor backends (`mem0`, `openviking`, `zep`) were REMOVED. They were
  never more than stubs, and a competitor arm this repo configures itself is a
  strawman risk under `docs/comparability.md` A8 — an under-configured rival is
  not a baseline. Cross-tool comparison is done by running the vendor's own
  published tool, or by citing their published benchmark figures, and only
  once our own numbers are Tier-A compliant. Re-adding one means owning its
  configuration to the standard of its own published methodology.
- **`description`** = the first non-empty sentence(s) of the document body, accumulated one whole
  sentence at a time until the next sentence would push the total past **250 characters** (then
  stopped there), or hard-truncated with a trailing `…` if the very first sentence alone exceeds the
  cap. Sentence splitting treats `.`/`!`/`?` as terminators and keeps any immediately-trailing
  closing quotes/brackets attached to the same sentence, so `Alice said, "hi there."`-shaped text
  (the exact shape of LoCoMo's `speaker said, "text."` turns) splits correctly.
- **`tags`** = one `key:value` tag per non-empty entry in `MemoryDocument.metadata`, plus a
  `sourceId:<MemoryDocument.id>` tag (see id semantics below).
- **`heading`** = an H1 built from `MemoryDocument.id` (`# <id>`), prepended to the body.

### `MemorySearchResult.id` is the original document id, not the akm ref — a deliberate deviation

akm's own `ref` (the `--shape agent` hit field literally named `ref`) is a stable identity like
`memories/<name>` that has no relation to the caller's `MemoryDocument.id` (e.g. LoCoMo's `dia_id`).
Every other backend in this repo returns `MemorySearchResult.id === MemoryDocument.id` (see
`raw-vector.ts`), and `src/memory/retrieval-metrics.ts#scoreRetrieval` keys precision/recall/MRR on
exact equality between `result.id` and a corpus's relevant-id list (e.g. LoCoMo's
`question.evidence`). Mapping `id: ref` would silently zero out every retrieval metric for this
backend — not because retrieval failed, but because of an id-namespace mismatch, which is exactly
the kind of misleading number this repo's trust policy rules out.

So `search()` recovers the original document id per hit from this backend instance's own in-memory
`ref -> sourceId` bookkeeping (populated during `add()`), and carries the akm `ref` forward at
`metadata.ref` instead. A hit for content this instance did not itself `add()` (e.g. pre-existing
bundle content) falls back to using the akm `ref` as `id`, since there is nothing else to recover.

### `reset()` cost

`reset()` tears down the entire `workDir` (`rm -rf`) and recreates it: `akm bundle create --dir
<bundleDir> --set-default` followed by `akm index --full` — **two akm subprocesses, every call.**
This is the documented per-instance/per-call cost; there is no cheaper "clear" primitive in akm 0.9.
Packs that call `reset()` once per corpus sample (e.g. `locomo`) pay this cost once per sample by
design, not by accident.

### `add()`: single-doc vs. bulk dispatch

- **One document:** `akm remember "<content>" --name <slug> --description <d> --tag <t>... --force`,
  where `content` is `# <heading>\n\n<body>`. One subprocess call, and **no** follow-up
  `akm index --full`: `akm remember` indexes on write, verified live against 0.9.1 — `akm info`'s
  `indexStats.entryCount` has already incremented when `remember` returns, and the new asset is
  immediately searchable. `tests/memory-backend-akm.integration.test.ts` asserts that against the
  real CLI, so this stops being an assumption the moment it stops being true.
- **More than one document:** every document is written directly as a `.md` file (frontmatter block
  + H1 heading + body) under `<bundleDir>/memories/`, then **one** `akm index --full` call indexes
  all of them. Files written straight into the bundle bypass the CLI, so they are not indexed on
  write the way `remember` is — and this is one reindex instead of N `akm remember` calls, each of
  which would reindex on write.

Every document name is a deterministic, collision-resistant, flat slug (`slugifyDocId`): a
lowercased/hyphenated prefix of the id plus an 8-hex-char SHA-1 suffix, always free of `/` (akm's
`--name` rejects non-flat names).

After every `add()`, this backend re-reads `akm info --format json`'s `indexStats.entryCount` and
compares it against the pre-add count plus the number of documents just added. **A mismatch throws**
(`BenchmarkRuntimeError`) rather than proceeding as if ingestion had fully succeeded — the fail-loud
check the repo's trust policy requires.

### `search()`

`akm search "<query>" --limit <min(topK,200)> --shape agent --format json`. **Never** passed with
`--detail normal` — akm's `--detail normal` shape silently drops `ref` from every hit (a documented
akm bug), so this adapter never uses it; `--shape agent` is the only detail/shape flag used, and unit
tests assert `--detail` never appears in the invocation at all. Hit content (`MemorySearchResult.text`)
is read directly from the hit's absolute `path` (cheaper than a second `akm show` call) rather than
from akm's own `description` field, with the frontmatter block and injected H1 heading stripped back
out and the result capped at 20,000 characters.

### Config knobs

| Knob | Effect |
| --- | --- |
| `AKM_EVAL_AKM_CMD` | JSON array naming the akm invocation. Default `["akm"]`. |
| per-run `workDir` | `path.join(context.outputDir, '.akm-memory')`, set automatically by `src/cli.ts run`; not separately configurable today. |

### Runnable configs

- `config/common/locomo-akm-ab.json` — three variants (`baseline` backend `none`, `raw-vector`,
  `akm-memory` backend `akm`) over the same provider/model/judging. `memory.backend` is the only
  variant-level delta, but **`baseline` also differs in prompt construction**: it receives the full
  conversation truncated to `maxContextTokens` (a long-context reference arm), while the two
  retrieval arms receive only their top-`topK` retrieved snippets — read `baseline` as that, not as
  a "no memory" null arm. The akm arm's `result.json.metadata` records a
  `zeroHitQueries`/`retrievalQueryCount` counter; check it before publishing a number, since a low
  score can mean akm's retrieval structurally could not answer a query (see the akm backend's own
  header comment in `src/memory/backends/akm.ts`) rather than that retrieval quality is bad.
- `config/common/longmemeval-akm-ab.json` — the same three-arm shape for `longmemeval`, over the
  `openai-compatible` runner path (see `src/packs/longmemeval/README.md`). The `longmemeval` pack
  adapter routes every non-disabled-backend arm through `memory.add()`/`memory.search()` per
  question: each question is its own instance (LongMemEval, unlike locomo, gives every question its
  own haystack), so per question the adapter `reset()`s the backend, `add()`s one `MemoryDocument`
  per haystack session (id = the session id, text = that session's turns), then `search()`es with
  the question text and the pack's configured `topK`. **The `baseline` arm (`memory.backend: none`)
  is a deliberate exception, not a bug**: it keeps the pre-retrieval-wiring full-haystack prompt
  unchanged — every question answered from its entire haystack, flattened, with no backend involved
  at all — so the three-arm comparison is baseline-full-context vs. two real retrieval arms, the same
  asymmetry `locomo`'s `baseline` already has (see above). Retrieval metrics (`precisionAtK`,
  `recallAtK`, `mrr`, `ndcgAtK`) are scored against the official dataset's `answer_session_ids` as
  ground truth. `result.json.metadata` records the same `zeroHitQueries`/`retrievalQueryCount`
  counters as `locomo`; check them before publishing a number, for the same reason. It additionally
  records `questionsWithoutEvidenceLabels`/`retrievalMetricsScoreable`, because a dataset row with no
  `answer_session_ids` scores 0 on every retrieval metric by construction — even for a backend that
  retrieved the right session every time — and that has to be distinguishable from measured failure.

### Tests

- `tests/memory-backend-akm.test.ts` — unit tests against `tests/fixtures/fake-akm.ts`, a small fake
  CLI fixture (a real subprocess, not an in-process mock) covering the synthesis rule, single-vs-bulk
  dispatch, the ingestion-count fail-loud check, search-result mapping, the never-`--detail normal`
  rule, and reset isolation.
- `tests/memory-backend-akm.integration.test.ts` — real round trips against a live akm CLI (no
  fakes, no docker). One covers the bulk path: `reset` → `add` 5 documents → `search`, with exact
  assertions proving the current (akm ≥ 0.9.2) retrieval contract: a body-only term **is**
  retrievable, alongside a description/tag/heading term (itlackey/akm#819 lifted the pre-0.9.2 ceiling
  described above; this suite guards the fix, not the ceiling — see itlackey/akm-eval#9). The other
  covers the single-document `remember` path, including the index-on-write behavior that lets it skip
  a second index pass. The CLI under test comes from `AKM_EVAL_AKM_CMD`, falling back to a sibling
  akm source checkout when that is unset.
  **The suite is skipped on exactly one compound condition: running in CI AND `AKM_EVAL_AKM_CMD`
  unset** (`describe.skipIf`). CI (`.github/workflows/ci-pr.yml`) has no docker daemon, no akm CLI,
  and no sibling akm checkout, so it deliberately never sets this var and the suite is skipped
  there; a CI job that provisions a real akm opts back in just by setting the var.

  The CI half of that condition is load-bearing. Gating on the env var alone would silently skip
  local `bun test` runs as well — on the very machines where a real akm CLI is present — turning the
  repo's only live-akm coverage into a green no-op, which is exactly the silent fallback the trust
  policy forbids. So **locally the suite always runs, and fails rather than skips** when no akm CLI
  is reachable (no `AKM_EVAL_AKM_CMD`, no sibling checkout), as does any malformed
  `AKM_EVAL_AKM_CMD`, unreachable binary, or real assertion failure. `AKM_EVAL_SIBLING_CLI`
  overrides the sibling fallback path. Run it against a specific CLI with:
  `AKM_EVAL_AKM_CMD='["bun","/home/user/akm/src/cli.ts"]' bun test tests/memory-backend-akm.integration.test.ts`.
