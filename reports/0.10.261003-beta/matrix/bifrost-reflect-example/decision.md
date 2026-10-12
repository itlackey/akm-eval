# Matrix decision: bifrost-reflect-example

Matrix `reflect-matrix.json`, generated 2026-10-12T20:31:20.976Z. A cell reads baseline → config, as mean (min–max over the repeats). ↑ higher is better, ↓ lower is better; harm must not rise. Verdicts apply one rule to every metric, harm included: the config's range lies wholly on one side of the baseline's, with a gap at least as wide as the wider range; n=1 is "screen only". The scored column is the cases that got a verdict of the cases given, per run, and how many errored. A config with more errored cases than its baseline is never "better" (it is "incomplete"), and a row is "exploratory", not a conclusion, when its summaries lack the evidence that only the treatment differs, a side has fewer than 3 repeats, the two sides scored different cases, or (retrieval) the share of judged results fell.

The version column shows the eval's version (in its src/measurement.ts) that the runs behind each side were made with, baseline → config. Two versions are not comparable unless `harness` is the row's treatment. Both sides are scored again with the current scorer and labels before they are compared.

The paired column is scripts/compare on all the repeats of the baseline and of the config, pooled by case: each case is scored by its mean over the repeats of a side, and the order of the repeats does not matter. It shows the cases whose mean went up (better) and down (worse), the cases that agree and the sign test on the flips, then each metric as config minus baseline with the 95% interval of a bootstrap over the cases. It does not change the verdict; a "no difference" whose interval excludes 0 says so in its note.

## reflect vs base

| config | runs | main metric | harm | scored | calls | seconds | akm build | model | version | paired | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| filter-off | 3 | defects.rate ↑ 1 → 1 | controls.rate ↑ 1 → 1<br>proposals.touched_body ↓ 0 → 0 | 3 of 3 → 3 of 3 | – → – | 17.3 → 27.5 | release 0.10.261003-beta | chat/qwen3.8-27b | v0.2 → v0.2 (scored again) | 0 better, 0 worse, 3 agree<br>defects.rate 0 (0 to 0)<br>controls.rate 0 (0 to 0)<br>proposals.touched_body 0 (0 to 0)<br>3 → 3 repeats pooled | **no difference** |

