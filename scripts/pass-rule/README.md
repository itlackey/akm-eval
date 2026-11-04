# Try a pass rule on saved runs

```sh
scripts/pass-rule/run RESULTS_DIR...                                  # akm's own rule: it must give back every stored route
scripts/pass-rule/run --review-at 3 RESULTS_DIR...                    # a lower review floor
scripts/pass-rule/run --count reusable,nonRedundancy,grounding evals/lesson-judge/results/*-r[123]
```

`RESULTS_DIR` are results folders of `judge-gate` or `lesson-judge` (`--repeat` makes one per run; all of them must be one eval). The rows of
both keep the judge's criterion scores (`need`, `preservation`, `quality`; `reusable`, `nonRedundancy`, `grounding`), and the route akm took is a
function of them: the lowest counted criterion at `--pass-at` or more passes; otherwise a mean of the counted criteria at `--review-at` or more
is review; a criterion at `--reject-at` or less refuses whatever the mean is. The defaults are the rule akm ships for the judge (`SHIPPED_RULES`
in `lib/judge.ts`, a copy of `judgeQuality` in akm's `stage.ts`). A new lesson routes as pass, review or reject; a lesson update on `pass` alone.

It prints JSON: the routes by label and by group under the shipped rule and the one you gave (counts over all the folders; divide by `runs.length`
for a per-run mean), and `differ`, the rows that move. No model is called and nothing is written.

`reproduced.mismatch` lists the rows whose route under the shipped rule is not the stored one, and the command exits 1 when there is one: it
checks that `lib/judge.ts` still says what akm does. On the committed baseline (`reports/judge-baseline-2026-11-04`) it finds none in the 564 judge-gate
and 534 lesson-judge rows. A row with no criterion scores (the judge gave no verdict) is left out and counted in `without_criteria`.

`evals/distill/pass-bar` does the same for distill runs, whose lessons are judged good or bad by the distill eval's checks.
Run the tests with `bun test scripts/pass-rule`.
