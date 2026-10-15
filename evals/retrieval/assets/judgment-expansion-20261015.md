# Retrieval judgment expansion — 2026-10-15 (UTC)

Pool: union of the first ten asset refs returned by keyword search, keyword
curate, semantic search and semantic curate in the saved full Docker retrieval
run and both 12-query-per-collection build-validation runs. Include every
previously unjudged task-query pair in that union, not only promising matches.
Non-task inputs still have no relevance judgments. Queries, assets and existing
grades are frozen. Result ranks and aggregate scores do not determine grades.

Reviewer: Codex in the interactive maintenance session (`codex-review`), not a
human annotator or a separately invoked judge endpoint. Inspect the query and
candidate's title, description, headings and task-relevant body, opening the
body for ambiguous or potentially relevant matches. Use the existing rubric:

- 3: directly answers or performs the request; exactly an asset to load.
- 2: relevant and clearly useful support, though not the best complete answer.
- 1: same general topic without help completing this specific request.
- 0: unrelated.

For a saved ref whose classification changed from command to knowledge, reuse
an existing grade of the same query/file only when its stored asset digest
matches today's file under the older ref. Record that source ref in the reason,
retain the original judge/prompt, and hash the file under the newly returned
ref. Otherwise review normally. Never turn an unjudged pair into a banned
pair. Preserve every original E6 trap and all historical judgments.

New review rows record `judge: codex-review`, UTC date, SHA-256 of this protocol
in `prompt_sha256`, and the existing `assetSha256` (front matter plus the first
16,000 body characters) in `asset_sha256`. This distinguishes the review from
the earlier Qwen endpoint and E6 goldens. Frozen mixed-judge labels improve
coverage, but do not establish human agreement or exhaustive relevance.

Five verified same-file ref variants declare `alias_of` on their 33 new rows.
Grades, ideal ranking and recall count each physical asset once; returned
refs stay verbatim in raw results. The mapping is explicit, not inferred from
ref spelling. Rewrites carry the target through the same text mapping.
