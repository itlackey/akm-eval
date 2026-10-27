# Finishing akm#1260 on a full system

Phases 1–2 ([`README.md`](README.md)) ran in a sandbox with no Docker, no judge endpoint and no access to huggingface.co. So they are keyword-only, their new grades are provisional, and agent-ab did not run. This runbook finishes the spike on a machine that has all three, then records the decisions on [akm#1260](https://github.com/itlackey/akm/issues/1260).

The issue's ground rules still apply:
- New sets, tasks and additive eval extensions are pre-approved, as long as existing comparisons keep working.
- New machinery (a runner, a scoring framework, a new top-level folder or tool) needs approval on the issue first.
- Follow `MEASUREMENT_CHANGELOG.md` for version and label changes. `scripts/check` must pass.

## 0. Prerequisites

- **Docker**, with the [prebuilt runner](../../docker/README.md) (`ghcr.io/itlackey/akm-eval:main`), or a native checkout with Bun, uv and Docker for Harbor.
- **Network access** to huggingface.co (akm downloads bge-small-en-v1.5, 133 MB, into `.cache/`), npm, GitHub and the model endpoints.
- **A model** with tool calling behind the Responses API, for agent-ab. Set `MODEL_*` in `.env`.
- **A judge model** for `evals/retrieval/label`. Set `JUDGE_MODEL` and, if needed, `JUDGE_BASE_URL` and `JUDGE_API_KEY`.
- **Checkouts:**

```sh
git clone https://github.com/itlackey/akm-eval && cd akm-eval
git checkout spike/1260-repomap-codeblocks        # or main, once this PR is merged
git clone https://github.com/itlackey/akm ../akm
for b in b1 b1b b3; do git -C ../akm worktree add ../akm-$b origin/spike/1260-$b; done
git -C ../akm worktree add ../akm-b0 f8f977046   # release/0.10.0 at f8f97704, the b0 build
for d in ../akm-b0 ../akm-b1 ../akm-b1b ../akm-b3; do (cd $d && bun install); done
bun install
```

B2 is not carried forward: it matched B1 on every set. Run every command below from the akm-eval root. Under Docker, mount the akm checkouts inside `$AKM_EVAL_WORK` and use those paths in `--akm`.

## 1. Check the evals still read each build

```sh
for v in b0 b1 b1b b3; do scripts/smoke/run --contract --akm "bun ../akm-$v/src/cli.ts"; done
```

## 2. Semantic retrieval (part B, and the map's retrieval)

`content` also feeds the embedding text (`buildSearchText` in akm), so the B options change semantic vectors. This is the main open question for part B.

```sh
for v in b0 b1 b1b b3; do
  A="bun ../akm-$v/src/cli.ts"
  evals/retrieval/run --semantic --akm "$A" --label $v-sem                    # library + books
  evals/retrieval/run --semantic --akm "$A" --cases evals/retrieval/assets/code           --label $v-sem-code
  evals/retrieval/run --semantic --akm "$A" --cases evals/retrieval/assets/repomap        --label $v-sem-repomap
  evals/retrieval/run --semantic --akm "$A" --cases evals/retrieval/assets/repomap/fenced --label $v-sem-repomap-fenced
done
```

Each build embeds the library once; the semantic index is cached per build in `.cache/akm-index/`. Check each summary's `semantic_verification` and `semantic_index` before reading the scores.

## 3. Grade with a real judge, then rescore

**`code` and `repomap` (replace the provisional grades).** `label` keeps existing rows, so move each set's `qrels.jsonl` aside first, as the sets' READMEs explain.

```sh
for s in code repomap repomap/fenced; do
  mv evals/retrieval/assets/$s/qrels.jsonl evals/retrieval/assets/$s/qrels.claude-review.jsonl
  evals/retrieval/label --cases evals/retrieval/assets/$s
done
# then pool every run you will compare, keyword and semantic, b0 and prototypes:
for r in private/retrieval/results/*-code-own*; do evals/retrieval/label --cases evals/retrieval/assets/code --from $r; done
# (same for the repomap and repomap/fenced runs)
```

Keep the `claude-review` files next to the new grades and report the agreement between the two (the share of pairs whose relevant/not-relevant call matches).

**`library` (public).** The prototypes surface results nobody has graded (keyword `judged@10` is 95–96%). Grade them with `evals/retrieval/label --from <run>` for each prototype run, keyword and semantic. This appends to the public `assets/qrels.jsonl`, so record it as a label expansion the way [the 2026-10-15 expansion](../../evals/retrieval/assets/judgment-expansion-20261015.md) was, and follow `MEASUREMENT_CHANGELOG.md` for `scoringVersion`.

**Rescore both sides of every comparison** on the final grades, then compare:

```sh
scripts/rescore/run <run> [--cases <set>]          # for every run, b0 included
scripts/compare/run <b0-rescored> <b1b-rescored>
```

## 4. Agent outcome: the agent-ab repomap tasks (part A, and B end to end)

This is not built yet. Per the issue it is a pre-approved new task family, kept out of the public six-task set so that comparison does not change:

- **Location:** `evals/agent-ab/cases/repomap/{tasks,libraries}`, run with `--cases`.
- **Tasks:** 6 to 8, in agent-ab's existing Harbor format (`task.toml`, `instruction.md`, `environment/`, `solution/solve.sh`, `tests/`).
  - Each `environment/Dockerfile` clones itlackey/akm at `f8f97704` into the workspace.
  - Each instruction asks a localization question the map answers, and asks the agent to write the file path and symbol to `answer.txt`. Examples: "which file and function decide whether a show response carries `toc`", "where is the FTS column weighting set".
  - Each `tests/` checks that answer. `task.toml` names the library in `AKM_TASK_STASH`, lists `library_tokens` the map must hold, and sets `task_family = "repomap/localize"`.
- **Library:** `libraries/repomap/`, a copy of `evals/retrieval/assets/repomap/library` (the inline-code map) as an akm bundle.
- **Check the tasks with no model:** `-a oracle` should score 1 and `-a nop` should score 0. The command is in `evals/agent-ab/README.md`.
- **Runs:**

```sh
evals/agent-ab/run --cases evals/agent-ab/cases/repomap --akm ../akm-b0  --label repomap-b0  --semantic
evals/agent-ab/run --cases evals/agent-ab/cases/repomap --akm ../akm-b1b --label repomap-b1b --semantic
```

The control arm can grep the repository, so read efficiency next to pass rate. That means tokens, time and tool calls per arm from `samples.jsonl`, plus engagement (did the agent call akm). Adding per-arm token and tool-call means to the agent-ab summary is a pre-approved additive extension.

For B end to end, a second small family whose answers sit only in fenced code of the corpus works the same way. Optional: the retrieval result above may be enough.

## 5. Decide

Use the thresholds on the issue, and agree them before reading the results:

- **B, go:** B1b, or the best option that indexes no literal values, clearly improves `code` with real-judge grades in **both** keyword and semantic modes, with no meaningful regression on `library` or `books`. If semantic regresses, consider a separate, lower-weight FTS column for fence tokens that stays out of the embedding text, and measure that as B1c.
- **A, go:** the map improves agent-ab localization pass rate, or cuts tokens and tool calls by a clear margin (for example 10% or more), with no accuracy loss.

Write the results into this report (or a new dated one next to it), and the decisions on akm#1260.

## 6. If B is a go: what the akm change involves

From the phase 1–2 findings:

1. **Projection.** Move B1b's `fencedSearchText` / `fenceIdentifiers` (on `spike/1260-b1b`, `src/indexer/passes/metadata.ts`) into `projectMarkdownContent` properly. Change only the `content` projection; the fragment projection, fragment ids and `show` stay as they are.
2. **Contract.** Rewrite the 3 projection tests in `tests/integration/fts/fts-progressive-retrieval.test.ts`:
   - from "no fenced bytes, names included";
   - to "no fenced literal values": no quoted values except keys and paths, no assignment values except dotted code references, no URLs, no long token-like strings, and fence state still parsed exactly.

   Add tests for each dropped-literal rule (`PRIVATE_TOKEN=…` value, `sk-…` token, `"password": "…"`, a URL with credentials). This is a deliberate change to a documented safety contract; record it in the CHANGELOG and the projection's doc comment.
3. **Re-index.** Incremental indexing keeps old `content` for unchanged files, so users need a full rebuild. Bump the index layout or document `akm index --full` in the release notes.
4. **Docs.** Search behavior in `docs/reference/cli.md`, and the stale 16,384-character figure in `docs/reference/configuration.md` (the cap is 1,000,000), which phase 1 found in passing.
