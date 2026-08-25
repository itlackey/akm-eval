# Memory backends

The repository defines `none`, `raw-vector`, `akm`, `mem0`, `openviking`, and `zep` backend IDs,
implementing the 4-method `MemoryBackend` interface in `src/memory/types.ts`
(`add`/`search`/`reset`/`healthCheck`).

Current runnable/truthful status:

- `none`: runnable — disabled baseline, no retrieval.
- `raw-vector`: runnable — deterministic in-memory cosine-similarity baseline.
- `akm`: runnable — a real, evaluated integration against the akm CLI (subprocess form). See
  below for what "real" means here and where its ceiling comes from.
- `mem0`, `openviking`, `zep`: blocked external placeholders. `akm-eval matrix` and `akm-eval run`
  reject runs that select them before execution; see `docs/operator-blockers.md` item 4.

`akm-eval doctor` prints one `memory:<id>` line per backend; `Truthful evaluated memory backends:`
lists every backend whose adapter is a real, non-stub integration (currently `akm`, `none`,
`raw-vector`) regardless of whether the backend is actually reachable right now — reachability is a
runtime concern (`status: ok|warn`, checked by `healthCheck()`), not a gate on whether the code path
is real.

## The `akm` backend

Implemented in `src/memory/backends/akm.ts`. Every operation shells out to a real akm CLI process —
`add`/`search`/`reset` are genuine `akm remember` / `akm search` / `akm bundle create` + `akm index
--full` invocations, verified live against akm 0.9.1. Nothing about this backend is simulated or
mocked in production use; the only mocked variant lives in this repo's own unit tests, against a
small fake CLI fixture (`tests/fixtures/fake-akm.ts`), with a separate, real, no-mocking integration
test (`tests/memory-backend-akm.integration.test.ts`) that spawns the actual CLI.

### Invocation resolution

Set `AKM_EVAL_AKM_CMD` to a JSON array of strings naming the command to run:

```sh
# A globally installed akm binary (default if AKM_EVAL_AKM_CMD is unset)
export AKM_EVAL_AKM_CMD='["akm"]'

# A source checkout, run through bun (what this repo's own integration test uses)
export AKM_EVAL_AKM_CMD='["bun","/home/user/akm/src/cli.ts"]'
```

When the resolved command's last argument is an existing file on disk (the `bun /path/to/cli.ts`
form), the subprocess is spawned with **that file's own directory** as its working directory, not
this repo's root. This is load-bearing, not cosmetic: bun's module resolution for a source checkout
walks up from cwd to find `node_modules`/`bun.lock`, and spawning it with an unrelated project's
cwd fails with `ENOENT while resolving package 'zod'` (or whichever dependency) even though the akm
CLI file itself is perfectly reachable — verified empirically while building this adapter. A bare
installed-binary command (`["akm"]`) keeps this repo's root as its cwd, since it has no such
dependency-resolution concern.

An unset or malformed `AKM_EVAL_AKM_CMD` never throws at construction time (so `akm-eval doctor`
can report every backend's status without crashing on one bad env var); it surfaces as a `warn`
`healthCheck()` and as a `MemoryBackendUnavailableError` from `add`/`search`/`reset`.

### Hermetic per-instance root

Every `MemoryBackend` instance is given a `workDir` (or invents a unique, not-yet-created path
under the OS temp dir — deliberately *not* `fs.mkdtempSync`, which would leave an abandoned empty
directory behind on every `doctor` invocation, where the backend is constructed only to read its
status; creation is deferred to `reset()` and the health probe, both of which already `mkdir -p`),
and pins all five akm directory env vars underneath it:

```
<workDir>/bundle  -> AKM_BUNDLE_DIR
<workDir>/config  -> AKM_CONFIG_DIR
<workDir>/data    -> AKM_DATA_DIR
<workDir>/cache   -> AKM_CACHE_DIR
<workDir>/state   -> AKM_STATE_DIR
```

`<workDir>/config/config.json` is written by this backend, not by akm, before any command runs:

```json
{ "configVersion": "0.9.0", "semanticSearchMode": "off", "registries": [] }
```

`configVersion` is pinned to the schema version this adapter was built and verified against
(independent of the akm-cli package's own semver — `0.9.1` at verification time).
`semanticSearchMode: "off"` keeps retrieval to keyword FTS only (no embedding provider, no
non-determinism). `registries: []` matters more than it looks: akm's own `DEFAULT_CONFIG` ships two
live registry URLs (a GitHub-raw index and `skills.sh`); leaving `config.json` unwritten would leave
a "hermetic" install still configured to point at the network, even though no command this backend
issues uses `--from registry`.

`AKM_FORCE_INIT_TMP_STASH=1` is always set on the child process env. `bun test` sets `BUN_TEST=1` on
the whole process tree, and that sentinel leaks into the spawned akm subprocess through env
inheritance; akm's own `bundle create --dir <tmp>` refuses to persist a stash dir under a temp path
while a test-runner sentinel is present (see akm's `src/commands/sources/init.ts`). Harmless outside
test runs.

**How the per-run workDir is chosen:** `src/cli.ts`'s `run` command passes
`path.join(context.outputDir, '.akm-memory')` as the workDir, so it is unique per run and cleaned up
alongside that run's artifacts. `MemoryBackend` factories were widened from `(rootDir?) =>
MemoryBackend` to `(rootDir?, workDir?) => MemoryBackend` to carry this through — every other
backend (`none`, `raw-vector`, `mem0`, `zep`, `openviking`) ignores the extra argument, so this was
the only interface change needed.

### The declared frontmatter synthesis rule — and the retrieval ceiling it sets

**Verified empirically: akm's FTS and embedding index covers only name, frontmatter `description`,
tags, aliases, hints, and in-body markdown headings — never body prose.** A term that appears only in
a document's body text is unretrievable, full stop; this is akm's real, documented behavior, not a
bug in this adapter. `tests/memory-backend-akm.integration.test.ts` proves this against the real CLI:
a document whose distinctive term lives only in a later sentence of its body returns zero hits for
that term, while the same document's earlier, description-captured sentence remains searchable.

Because of this, `add()` cannot just dump `MemoryDocument.text` into a file — it must synthesize the
frontmatter/heading surface akm actually indexes. The rule (deterministic, **no LLM**, in
`synthesizeFrontmatter()`):

- **`description`** = the first non-empty sentence(s) of the document body, accumulated one whole
  sentence at a time until the next sentence would push the total past **250 characters** (then
  stopped there), or hard-truncated with a trailing `…` if the very first sentence alone exceeds the
  cap. Sentence splitting treats `.`/`!`/`?` as terminators and keeps any immediately-trailing
  closing quotes/brackets attached to the same sentence, so `Alice said, "hi there."`-shaped text
  (the exact shape of LoCoMo's `speaker said, "text."` turns) splits correctly.
- **`tags`** = one `key:value` tag per non-empty entry in `MemoryDocument.metadata`, plus a
  `sourceId:<MemoryDocument.id>` tag (see id semantics below).
- **`heading`** = an H1 built from `MemoryDocument.id` (`# <id>`), prepended to the body.

This is the declared synthesis rule, and **it sets the ceiling of every retrieval metric measured
against this backend.** Any published number against `memory.backend: akm` should cite it: a
document whose only distinctive content lives past the first sentence-or-so of its body, and outside
its metadata, will not be retrievable by that content.

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
  assertions proving the retrieval ceiling (a body-only term is unretrievable; a
  description/tag/heading term is). The other covers the single-document `remember` path, including
  the index-on-write behavior that lets it skip a second index pass. The CLI under test comes from
  `AKM_EVAL_AKM_CMD`, falling back to a sibling akm source checkout when that is unset.
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
