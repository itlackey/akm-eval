---
type: skill
name: akm-migrate
description: Use when upgrading to akm-cli 0.9.7 through 0.9.14, covering
  removed improve strategies, packed curation, lint repair, scheduler
  reconciliation, and the critical 0.9.14 index-v23 compatibility boundary.
updated: 2026-08-31
when_to_use: Use when upgrading akm-cli to versions 0.9.7 through 0.9.14 and
  needing to handle migration tasks, index schema changes, or strategy
  deprecations.
generated:
  by: akm/0.9.12
  at: 2026-09-07T07:15:22.405Z
verified:
  - by: akm/0.9.12
    at: 2026-09-07T07:15:22.405Z
---

# AKM Migration Guide (0.9.7 – 0.9.14)

Use this guide after upgrading the executable to a version between 0.9.7 and 0.9.14. From 0.9.6 there is no required source rewrite, database migration, or index rebuild for the base 0.9.7 release. The reviewable work involves checking removed improve strategy names, newly visible lint findings, and any old scheduler rows that previous releases could not reconcile. If the previous install predates 0.9.6, complete the conditional legacy actions in section 6 as well. If upgrading to 0.9.14 or later, you must also address the index-v23 compatibility boundary described in section 9. `akm migrate` remains task-source specific — it is not a general config or database migrator.

## 1. Confirm the release and protect active work

```bash
akm --version
akm info
akm workflow list --active
```

If the previous install predates 0.9.2, also read `akm help migrate 0.9.2`. That is the built-in durable-plan/task-source cutover note; no separate `akm help migrate 0.9.7` page is shipped.

Workflow plans remain at `irVersion: 5` and `hashVersion: 7` in 0.9.7. A plan frozen before the 0.9.2 cutover is readable but cannot resume or advance. Inspect and restart it from current authored source:

```bash
akm workflow status <run-id>
akm workflow abandon <run-id>
akm workflow run <workflow-ref>
```

Do not downgrade below 0.9.2 after the state database has received current task-history rows. The 0.9.7 upgrade adds no new task-history vocabulary.

## 2. Review newly enforced reference integrity

Run a report-only lint first:

```bash
akm lint
```

0.9.7 now validates legacy `type:slug` xrefs and resolves `<name>.derived.md` memories. A belief edge to a memory archived by AKM's prune flow resolves through its tombstone and is not an error. A `supersededBy` or `contradictedBy` target with neither a live file nor a tombstone is genuinely dangling. Repair those only after reviewing the plain lint report:

```bash
akm lint --prune-dangling-edges
```

This flag is deliberately separate from `--fix`: dropping an edge removes a belief-graph assertion. It does not prune ordinary `xrefs`. If the last edge on a channel is removed, review any `beliefState` that still names that channel.

A corrupt derived `index.db` now deletes and rebuilds itself on open, including its WAL/SHM sidecars. Do not apply that recovery logic to `state.db`, which is durable and is never automatically removed.

## 3. Migrate task sources and reconcile scheduler state

Task source v4 remains the authored grammar. AKM 0.9.7 auto-reads a deterministically convertible v2/v3 source as v4 in memory, emits a one-line deprecation warning, and does not rewrite it. Use the migrator to make the upgrade durable and silence that warning:

```bash
akm migrate status
akm migrate apply --dry-run
akm migrate apply
```

Each source is reported as `changed`, `skipped`, or `blocked`. A blocked file does not stop convertible siblings from migrating; repair it instead of inventing a force flag. The command has no `--config`, `--diff`, storage, or restore interface.

Preview scheduler reconciliation before applying it. 0.9.7 recognizes pre-0.9.2 crontab rows that lack `--scheduler-context`, so the first sync may finally update rows that had been stuck behind an install collision. It also accepts a truly immutable package-local AKM launcher; writable project or `npx` installs remain ineligible:

```bash
akm task sync --dry-run
akm task sync
akm task doctor
```

Then inspect unreachable scheduler entries. `prune` defaults to a zero-write preview and never targets an entry that still resolves to a live bundle:

```bash
akm task prune
akm task prune --id <binding-id>     # optional narrowed preview
akm task prune --yes                 # remove the printed orphan candidates
```

If a v2/v3 source cannot convert, `TASK_SCHEMA_VERSION_UNSUPPORTED` now names the blocking reason. A human decision is required; rerunning `migrate apply` without changing the source does not bypass it.

## 4. Replace removed improve strategies

The built-in strategy set is now `default`, `quick`, `thorough`, `graph-refresh`, `consolidate`, `catchup`, `reflect-distill`, and `proactive-maintenance`. `frequent` and `memory-focus` were removed. Find them in config, task sources, and automation:

```bash
rg -n 'frequent|memory-focus' ~/.config/akm "$(akm info --format json | jq -r .bundleDir)"
```

Use `reflect-distill` for the shipped hourly learning-pass behavior. For memory-only work, define an explicit custom strategy instead of relying on the removed `memory-focus` preset. A user strategy still named `frequent` or `memory-focus` now merges over `default`, not the former built-in, so make every relied-on process and sync value explicit.

`thorough` and `catchup` now use judged promotion with caps (25 and 100 accepts respectively, `maxDiffLines: 200`). The autonomy gate demotes promotion back to queue mode unless `experimental.improveAutonomy` is enabled, so the default remains review-only.

## 5. Adopt the new read and source features

Use `curate --pack <tokens>` when the caller needs the selected local assets' content immediately:

```bash
akm curate "<task>" --limit 5 --pack 8000 --format json
```

The budget applies to the combined result. AKM drops lower-ranked whole assets first and truncates only when the highest-ranked asset alone exceeds the budget. Registry hits are never packed. A `ref#fragment` packs only that section through the same resolution path as `akm show`.

When `akm bundle add` receives an origin-root website URL, 0.9.7 probes `/llms.txt` and uses its same-origin links as the crawl frontier when available. Specific-page URLs and sites without `llms.txt` keep the existing crawl behavior; off-origin manifest entries are ignored.

## 6. Complete conditional pre-0.9.6 work

If the previous install predates 0.9.5, rebuild the index once because old search impressions inflated stored utility scores:

```bash
akm index --full
```

That rebuild also repopulates embeddings with token-budgeted batches. If the install already ran the 0.9.6 migration, no full rebuild is required for 0.9.7.

Known older `configVersion` documents are upgraded in memory with a warning; the next `akm config set` or other config write persists the current version. The 0.9.1-era `extraParams.reasoning_effort`, `temperature`, `maxTokens`, and `enableThinking` workarounds are likewise lifted to their first-class engine fields when unambiguous. Conflicting old/new values still fail closed — choose one value explicitly rather than relying on precedence.

Search consumers may now see additive `matchStage: "exact" | "prefix" | "relaxed"` on normal/full and agent-shaped local hits. It is absent for pure-semantic contributions and registry hits. A `searchMode` of `fts-fallback` means semantic search was attempted live and lexical results were returned with a sanitized warning.

Task-history `target.kind` is unchanged from 0.9.2: `command`, `shell`, `script`, `workflow`, or `unknown`. Consumers must not branch on the retired `prompt` value.

## 7. Verify authored workflows and tasks

Every task lives at `tasks/<id>.yml`, begins with `version: 4`, selects exactly one target (`uses:` or `run:`), and may omit `schedule:` for manual-only use. `with:` is valid only for `uses: akm/command`; `enabled` belongs to each schedule binding. Validate resolution without executing:

```bash
akm task explain tasks/<id>
akm workflow plan workflows/<name>
akm lint --type workflows
```

The workflow source contract and durable plan versions did not change between 0.9.2 and 0.9.7.

## 8. Scan and complete the upgrade

```bash
BUNDLE_DIR="$(akm info --format json | jq -r .bundleDir)"

rg -n --glob '*.md' --glob '*.yml' \
  'akm (vault|reflect|distill|extract|tasks|add|list|remove|update|save|events|wiki|propose|proposals|accept|reject|diff|revert)\b|--auto-accept|--profile |--strategy (frequent|memory-focus)\b|\b(?:skill|knowledge|memory|workflow|command|agent|script|env|secret|lesson|task|vault|wiki):[A-Za-z0-9_/-]+' \
  "$BUNDLE_DIR"

find "$BUNDLE_DIR/tasks" -name '*.md' -print
rg -L '^version: 4$' "$BUNDLE_DIR/tasks" -g '*.yml'

akm lint
akm task sync --dry-run
akm task doctor
akm health --format json
```

Treat a `plugin-version` advisory as actionable: update a stale Claude plugin, or install one whose declared range admits 0.9.7 if `admitted` is false.

## 9. Handle the 0.9.14 index-v23 compatibility boundary

If you are upgrading to 0.9.14 or later, the search index schema changes to v23. This is a breaking change for the local index file. Unlike the 0.9.7 changes which were additive or in-memory, index-v23 requires a physical rebuild of the index database to ensure compatibility with the new query engine and embedding storage format.

1.  **Check current index version:**
    ```bash
    akm index status
    ```
    If the reported version is less than 23, a rebuild is mandatory before search functionality will work correctly.

2.  **Rebuild the index:**
    ```bash
    akm index --full
    ```
    This command will discard the old index structure and rebuild it from the current asset store. This process may take longer than a standard incremental update, especially for large bundles with many embedded assets.

3.  **Verify search integrity:**
    After the rebuild, run a sample search to ensure results are returned and that `matchStage` and `searchMode` fields are populated as expected in the JSON output.
    ```bash
    akm search "test query" --format json
    ```

    If the index was not rebuilt, searches may return empty results or throw schema mismatch errors. Do not attempt to manually edit the `index.db` file; always use the `akm index` command to manage schema transitions.

## Completion checklist

- Removed improve strategy names are absent or backed by explicit custom strategy definitions.
- A full index rebuild completed if (and only if) the prior migration required the pre-0.9.5 score reset OR if upgrading to 0.9.14+ (index-v23).
- `akm migrate apply --dry-run` reports no unexplained legacy task sources.
- Every executable task passes `akm task explain`; scheduler reconciliation and prune previews contain only understood changes.
- Each workflow passes `akm workflow plan` and `akm lint --type workflows`.
- `akm lint` and `akm health --format json` have no unexplained failures or plugin compatibility warnings.
- Packed-curate CLI consumers expect a bare JSON array of `{ ref, tokens, content }` items (or concatenated `## <ref>` sections in text mode); ordinary curate/search and task-history consumers retain their existing contracts.
- If on 0.9.14+, `akm index status` reports version 23 and search queries return valid results.

See `references/breaking-changes.md` for a compact release delta plus the historical 0.9.2 and 0.9.0 translation tables.
