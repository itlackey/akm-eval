# Controlled source-build validation — 2026-10-14

These four bounded Docker runs validate saved comparisons between two clean
AKM builds that both print package version **0.9.31**. Each build ran 12 library
and 12 books queries once, with native BGE semantic retrieval, identical inputs,
configuration and harness. There were no chat-model calls; Docker networking
was disabled. This is a tooling pilot, not a full quality/performance benchmark.

| Build | Git commit | Library wall seconds | Books wall seconds |
| --- | --- | ---: | ---: |
| baseline | `85ad76b29d3c903baa407dfe2e17973cfbb85980` | 43.010 | 29.661 |
| candidate | `ab456961a476f5d70429a0e8f2d0f736235614d1` | 40.880 | 27.664 |

Both builds embedded all 251 library and 93 books assets with cold indexes.
Saved database checks verified 52 semantic search events including four setup
probes, with no fallback, unknown modes, query errors or timeouts. Both Git
builds are clean. Only the AKM build changes.

The four `-rescored` folders use the expanded judgments and retain raw rankings,
timings and collector 0.2, with scorer 0.3. All four search/curate methods have
100% judged top-ten coverage for ranked tasks. Superseded original scoring
folders and comparisons were deleted.

- Expanded-label comparisons: [library](comparison/library-rescored.md), [books](comparison/books-rescored.md).
- Every comparison also has a JSON file beside it.

Both comparisons have zero comparable quality deltas and no compatibility
warnings. Timing deltas are candidate minus baseline. One observation per
build cannot establish a performance improvement. See the [publication
report](../validation-2026-10-14/README.md) for the full runs, judgment protocol,
Reflect rescore and Docker image provenance.
