# AKM 0.10.261003-beta results

- [Semantic 35B process results and Agent/Terminal pilots](semantic-2026-10-14/README.md).
- [Full Luna semantic LongMemEval](longmemeval/luna-semantic-fresh-20261014-full/README.md).
- [Corrected Reflect and expanded-label retrieval results](../validation-2026-10-14/README.md).
- [Published result index](../README.md).

## Retrieval controls

The three keyword-only retrieval repeats are intentional controls. Library search
and curate recorded nDCG@10 0.8030 and recall@10 0.8307 over 101 judged task
queries. Books keyword nDCG@10 was 0.8768 and recall@10 0.9542 over 51 queries.
These use the original relevance judgments; use the expanded-label Docker
rescores for current quality reporting.

The [retrieval-only LongMemEval run](longmemeval/akm-0.10-public/summary.json)
completed all 500 questions without errors. On 470 questions with answer evidence,
top-five retrieval hit rate was 97.45%, recall 93.05%, and MRR 0.9202. Thirty
abstention questions are separate. No answer model or judge was called.

[SkillRet](skillret/akm-0.10-public/summary.json) completed all 4,392 queries over
6,006 skills without errors. Keyword nDCG@10 was 0.5047 and recall@10 0.5838;
semantic search reached 0.5800 and 0.6618. Both modes used the pinned local
bge-small-en-v1.5 embedder and AKM ranking, with no chat-model service.

Use the [Docker run guide](../../docker/README.md) for new collections.
