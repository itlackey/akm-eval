# Skill Evaluations

The evaluation pack separates deterministic contract checks from nondeterministic
agent trials.

## Deterministic Checks

Run:

```sh
python3 scripts/skills/coding/technical-debt-workflow/evaluate_skills.py
```

This validates every skill's representative cases, checks the declared routing
terms against its portable description, runs a deterministic routing proxy, and
verifies that safety, evidence, stop, and reporting expectations are complete.
Results are written to ignored `.refactoring/skill-evaluations.json`.

Passing these checks proves the pack and cases are internally consistent. It
does not prove that a particular model or client will activate or follow a skill.

## Agent Trials

Run each case in a fresh session and fixed fixture on every supported client.
Record the observed trace using
`scripts/skills/coding/technical-debt-workflow/evaluations/observations.schema.json`,
then aggregate it:

```sh
python3 scripts/skills/coding/technical-debt-workflow/evaluate_skills.py --observations path/to/observations.json
```

Record client, model, harness version, permissions, the canonical policy hash,
and the fixture tree hash. A submitted observation batch must cover all 48 cases
and include structured command traces, locally resolvable artifact paths and
hashes, rubric scores, and critical-failure fields. A partial or hash-mismatched
batch is rejected rather than reported as evaluated. Valid batches are labeled
`recorded` and still require independent review; the schema cannot prove that a
named external client produced the evidence.

## Tracked Metrics

- False activations
- Missed activations
- Unsafe actions
- Failed required stops
- Incomplete verification
- Regressions
- Unnecessary code churn

Add every real failure as a regression case. Do not overwrite prior trial data;
store timestamped observation files outside generated `.refactoring/` output
when longitudinal history is required.
