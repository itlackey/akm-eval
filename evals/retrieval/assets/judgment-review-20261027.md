# Retrieval judgment review — 2026-10-27 (UTC), provisional

Sets: `code/` and `repomap/` (akm#1260, phase 1). Their queries were written and
committed before akm or this review saw them. No judge endpoint was reachable in
the session, so these grades are provisional: grade both sets again with
`evals/retrieval/label --cases <set>` and one real judge before trusting a
difference, and compare runs only on the same frozen qrels.

Pool, `code/`: for each task query, the first ten asset refs of keyword
`akm search` and keyword `akm curate` (akm `release/0.10.0` at `f8f97704`, the
b0 build), the first ten of the plain BM25 in `../src/bm25.ts` over each
asset's ref and file text, as `label` pools the public library, and the assets
the author expected. Pool, `repomap/`: the library has 15 assets, so every
query/asset pair is graded. Grade every pair in the pool, not only promising
matches. Result ranks and aggregate scores do not decide a grade.

The two repomap variants (`repomap/library/` and `repomap/fenced/library/`)
hold the same files and symbols for each asset, so a pair gets the same grade in
both; each variant's rows carry the digest of its own asset text.

Reviewer: Claude in the interactive maintenance session (`claude-review`), not a
human annotator and not a separately invoked judge endpoint. Inspect the query,
the candidate's ref, description, headings and the lines that hold the query's
identifiers, and open the body for ambiguous or potentially relevant matches.
Use the existing rubric:

- 3: directly answers or performs the request; exactly an asset to load.
- 2: relevant and clearly useful support, though not the best complete answer.
- 1: same general topic without help completing this specific request.
- 0: unrelated.

For a code-shaped query, the answer may sit only in fenced code: grade what the
file says, including fences, not what akm indexes of it. For a repomap query,
an asset answers when it names the file or symbol that implements what the
query asks, checked against the akm source at the pinned commit.

Rows record `judge: claude-review`, the UTC date, the SHA-256 of this file in
`prompt_sha256`, and `assetSha256` of `../src/lib.ts` (front matter plus the
first 16,000 body characters) in `asset_sha256`. No pair is banned. These rows
improve coverage of the observed pool only; they do not establish human
agreement or exhaustive relevance.
