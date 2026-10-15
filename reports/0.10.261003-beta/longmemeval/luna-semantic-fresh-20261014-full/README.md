# LongMemEval Luna semantic search results

On October 14, 2026, a fresh public LongMemEval S run attempted all 500 questions with Luna in both answer arms and AKM semantic search. Full history scored 424/500 correct (84.80%); the AKM arm scored 401/499 (80.36%). The paired accuracy difference over 499 shared scored questions was -4.41 percentage points, with a recorded 95% interval of -7.77 to -1.05 points.

The original [summary](summary.json) and [samples](samples.jsonl) are copied unchanged. This run started from the first question and reused no answers from earlier stopped runs. All six question types are covered.

## Models and semantic retrieval

The requested reader route was `eval-luna/gpt-6-luna`, observed as `gpt-6-luna`. Both arms used temperature 0 and a 512-token answer budget. The independent judge route was `chat/qwen3.8-27b`, observed as `qwen3.8-27b`, with a 10-token budget. This differs from the benchmark's prescribed `gpt-4o-2024-08-06` judge, so these scores are not directly comparable to published LongMemEval scores.

AKM CLI `0.10.261003-beta` used the native `Xenova/bge-small-en-v1.5` embedder with `semanticSearchMode: auto`. For each question, the harness required complete embedding coverage and an actual search response declaring `searchMode: semantic`; keyword fallback would have been recorded as a retrieval error. All 500 questions passed these checks. There were no retrieval errors or timeouts.

The full-history arm received all sessions. The AKM arm received the five sessions returned by one semantic query, in their original history order. This measures raw-session retrieval with a fixed five-session cap, without distillation or repeated evidence gathering. Across 470 questions with answer evidence, top-five hit rate was 97.45%, recall 93.51%, precision 34.89%, MRR 0.9066, and nDCG 0.8962. The 30 abstention questions are reported separately.

## Timing and token usage

The measured full-run wall time was 6,077.851 seconds (1 hour 41 minutes 18 seconds), including collection overhead. Recorded answer-call timings exclude indexing, search and judging.

| Arm | Correct / scored | Accuracy | Reader input tokens | Reader output tokens |
|---|---:|---:|---:|---:|
| Full history | 424 / 500 | 84.80% | 51,886,801 | 56,228 |
| AKM semantic search | 401 / 499 | 80.36% | 6,825,517 | 46,539 |

On the 499 shared scored questions, AKM used 86.82% fewer reader input tokens. The table sums available reader usage records; the failed request has no token record, and judge usage is not included. Actual billing and cache discounts are not recorded, so these totals do not establish a dollar cost.

## Recorded failures and grading limitations

One AKM answer request, `gpt4_a1b77f9c`, returned HTTP 400 because the model reached its output limit. It remains an error, excluded from AKM accuracy and the paired denominator; its full-history answer is scored normally. No selective retry was used.

Eleven responses exhausted the 512-token budget and contained no answer text after reasoning removal: eight in full history and three with AKM. Empty answers are scored wrong. The judge also returned one undecidable response, on the AKM answer for `95228167`; the stored scorer counts it as incorrect.

For `3b6f954b`, both arms answered exactly “You attended the University of Melbourne.” against the expected “University of Melbourne in Australia.” The judge returned `yes` for full history and `no` for AKM. This grading inconsistency is retained in the original artifacts, without changing labels or scores.

## Provenance and reproduction

The collection used repository commit `5c2c448` and harness SHA-256 `65cff2c079b6b9ff1f7ea826779e5929c74dd3d006e3639358d9020a43a1c906`. Dataset revision, content hashes, per-question hashes, model settings and the complete selection are in the original summary manifest. Publishing these files does not rerun collection or rescore answers.

The following command records the collected settings. Running it again would start another paid collection.

```sh
source lib/env.sh
export HF_HOME="$PWD/.cache/models"
benchmarks/longmemeval/run --corpus public --semantic \
  --model eval-luna/gpt-6-luna --judge-model chat/qwen3.8-27b \
  --akm 'bunx --package akm-cli@0.10.261003-beta akm' \
  --label luna-semantic-fresh-20261014-full
```
