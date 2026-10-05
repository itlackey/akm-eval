---
type: workflow
description: Research a question, extract and assess claims, and create or update verified AKM knowledge assets.
updated: 2026-08-01
tags:
  - research
  - knowledge
  - curation
  - claims
  - ingestion
when_to_use: Use for research that should become durable, searchable AKM knowledge rather than a one-off answer.
params:
  question: { type: string, description: The research question or decision to inform }
  source_urls: { type: array, description: Optional HTTP(S) URLs to investigate }
  knowledge_path: { type: string, description: Relative subdirectory under knowledge/, defaulting to research }
  research_tmp_dir: { type: string, description: Absolute empty shared directory for delegated research findings and index.md }
  discord_channel_id: { type: string, description: Optional Discord channel ID from which to collect shared URLs }
  discord_env_ref: { type: string, description: Optional AKM env ref for Discord credentials }
  dry_run: { type: boolean, description: When true, analyze and verify without writing knowledge assets, defaulting to false }
steps:
  - id: define-question
    output:
      type: object
      properties:
        question: { type: string }
        scope: { type: string }
        acceptance_criteria: { type: array }
      required: [question, scope, acceptance_criteria]
  - id: collect-sources
    inputs: [steps.define-question.output]
    output:
      type: object
      properties:
        sources: { type: array }
        source_count: { type: integer }
        research_tmp_dir: { type: string }
        index_path: { type: string }
        agent_outputs: { type: array }
      required: [sources, source_count, research_tmp_dir, index_path, agent_outputs]
  - id: extract-claims
    inputs: [steps.define-question.output, steps.collect-sources.output]
    output:
      type: object
      properties:
        claims: { type: array }
        claim_count: { type: integer }
      required: [claims, claim_count]
  - id: dedupe-assess
    inputs: [steps.extract-claims.output]
    output:
      type: object
      properties:
        assessed_claims: { type: array }
        conflict_count: { type: integer }
      required: [assessed_claims, conflict_count]
  - id: write-knowledge
    inputs: [steps.define-question.output, steps.collect-sources.output, steps.dedupe-assess.output]
    output:
      type: object
      properties:
        refs: { type: array }
        written_count: { type: integer }
        skipped_count: { type: integer }
      required: [refs, written_count, skipped_count]
  - id: verify-knowledge
    inputs: [steps.write-knowledge.output]
    output:
      type: object
      properties:
        index_ok: { type: boolean }
        lint_ok: { type: boolean }
        refs_ok: { type: boolean }
        search_ok: { type: boolean }
      required: [index_ok, lint_ok, refs_ok, search_ok]
---

# Research to Knowledge

This workflow turns a bounded research question into durable knowledge. It
keeps source evidence separate from synthesis, makes uncertainty explicit, and
never treats a plausible claim as established merely because it is repeated.

## define-question

Turn the supplied research question into a bounded brief. State the question,
scope, exclusions, and acceptance criteria in the structured result. The
question parameter is non-secret input; do not put credentials in it.

### gate

- The scope is narrow enough to complete in one run.
- Acceptance criteria say what evidence would answer the question.
- Any missing context or ambiguity is recorded rather than guessed.

## collect-sources

Collect evidence through delegated agents in the shared `research_tmp_dir`.

1. Require an absolute, empty-or-run-specific `research_tmp_dir`. Create it if
   absent; never delete files outside this run's directory. Keep all delegated
   outputs and `index.md` there. Record the resolved path in the result.
2. Dispatch the external-source researcher and capture its output in the shared
   directory:

   ```sh
   akm agent agents/report-researcher \
     --prompt "Build an evidence packet for the attached question brief. Inspect every supplied source URL, prefer primary sources, record provenance and contradictions, and write only research findings. Return the packet in the required evidence format." \
     --cwd <research_tmp_dir> \
     --output <research_tmp_dir>/external-sources.md
   ```

   Construct the prompt from the workflow's attached params and question brief
   before dispatching. `akm agent` does not automatically receive workflow
   context. Do not put credentials in the prompt.
3. Dispatch a separate bundle-search agent and capture its output:

   ```sh
   akm agent \
      --prompt "Research the attached question using registered AKM bundles. Run akm search for related knowledge, skills, workflows, commands, memories, and facts. Inspect the most relevant refs with akm show. Write an auditable list of AKM assets to include, with ref, title, relevance, and confidence. Do not modify bundle assets." \
      --cwd <research_tmp_dir> \
      --output <research_tmp_dir>/akm-bundle-sources.md
   ```

   This is intentionally a distinct agent and must search the registered
   bundles rather than relying on the external researcher.
4. If a Discord channel ID is supplied, use the configured Discord message
   exporter and env binding to collect shared URLs without printing credentials.
   Append its findings to the shared directory. Otherwise skip that source.
5. Read both agent outputs and every supplied `source_urls` value. Record each
   source's URL or AKM ref, title, publication date when available, source type,
   relevance, and whether it is external or an AKM asset. Do not include a
   source that was not inspected.
6. Write `<research_tmp_dir>/index.md`. It is the handoff manifest and must
   contain two explicit sections, `## External Sources` and `## AKM Assets`,
   with one entry per candidate, canonical URL/ref, title, inclusion rationale,
   confidence, and the delegated output file that supports it. Include a
   `## Excluded` section for duplicates, inaccessible sources, and rejected
   assets. The index must be useful to the next workflow step without reopening
   the agents' full transcripts.

### gate

- Every source has provenance and a relevance reason.
- `research_tmp_dir/index.md` exists and is readable.
- `index.md` includes both external sources and AKM assets, with canonical
  URL/ref, rationale, confidence, and supporting delegated output.
- Both delegated agent output files exist and are non-empty.
- The source set contains enough independent evidence to answer the question,
  or the result explicitly reports that evidence is insufficient.
- Duplicated URLs and obvious navigation, login, or binary resources are
  excluded.

## extract-claims

For each attached source, extract only claims relevant to the question. Each
claim must include a concise statement, source ref or URL, supporting passage
or location, claim type (`fact`, `interpretation`, or `recommendation`), and
initial confidence. Separate what the source says from your own inference.

Do not merge claims yet. Preserve contradictory claims as separate records and
record missing or inaccessible evidence.

### gate

- Every claim has traceable evidence.
- Facts, interpretations, and recommendations are labeled distinctly.
- Unsupported conclusions are excluded or marked as unresolved.

## dedupe-assess

Using the attached claim list, canonicalize source URLs, merge claims that make
the same assertion, and retain all materially different wording or evidence.
Assess confidence using evidence quality, source independence, recency, and
agreement. Use `high`, `medium`, `low`, or `unresolved`; confidence is not a
substitute for citation. Record conflicts, stale evidence, and important gaps.

### gate

- No duplicate claim survives solely because it came from a different URL alias.
- Every surviving claim has a confidence level and evidence list.
- Conflicts and unresolved questions remain visible.

## write-knowledge

Create or update knowledge from the attached assessed claims and sources.

If `dry_run` is true, do not write files; return the proposed refs and counts.
Otherwise, use `akm import` for inspected URL snapshots under the requested
relative knowledge path, without `--force` unless an existing source document
is intentionally being refreshed. Create one synthesized markdown knowledge
asset for the question with citations, claim confidence, conflicts, gaps, and
an `updated` date. Use `akm import <file> --name <name> --path <path>` to write
it. When updating an existing synthesis, preserve useful frontmatter and use
`--force` only when the new evidence materially improves or corrects it. Add
resolvable `xrefs` to source assets where appropriate. Never put secrets in a
knowledge document.

Record every written, updated, already-present, and skipped ref. A partial
write must be reported; do not claim success for an asset that was not
successfully imported.

### gate

- Every written claim has a citation or is explicitly labeled as synthesis.
- Existing assets were not overwritten accidentally.
- The result accounts for every proposed source and synthesis asset.

## verify-knowledge

Verify the attached refs and the destination subtree.

1. Run `akm index --format json` and require it to succeed.
2. Resolve every written or updated ref with `akm show <ref> --format json`.
3. Run `akm lint --type knowledge --format json`; inspect findings under the
   requested `knowledge_path` and distinguish new findings from unrelated
   pre-existing findings.
4. Search the original question with `akm search` and confirm the new synthesis
   or source snapshot is discoverable.
5. Report unresolved xrefs, missing citations, lint findings, and search misses
   as failures or warnings rather than silently correcting them.

When `dry_run` is true, no new ref is expected: verify that the inspected source
is searchable and report `writes_expected=false` instead of treating the absent
synthesis as a verification failure.

### gate

- Indexing succeeds.
- Every written or updated ref resolves.
- The destination assets have no new lint or broken-reference findings.
- The research question retrieves the resulting knowledge, or the inspected
  source is searchable and the run explicitly records that dry-run writes were
  not expected.
