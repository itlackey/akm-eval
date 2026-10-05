# Priority Rubric

Use bounded numeric values so rankings remain comparable:

## Impact: 1-5

- `1`: local readability only; no measured delivery or risk effect
- `2`: recurring friction in one low-risk area
- `3`: material maintainability, reliability, or delivery cost
- `4`: frequent defects, significant security/performance risk, or broad drag
- `5`: critical safety, reliability, security, or business exposure

## Confidence: 0.2-1.0

- `0.2`: weak signal; key usage or behavior unknown
- `0.4`: plausible with partial evidence
- `0.6`: multiple supporting observations
- `0.8`: reproducible and well understood
- `1.0`: deterministic proof with tests or measurements

## Effort: 1-5

- `1`: one focused edit and targeted tests
- `2`: several local files
- `3`: one module or package
- `4`: multiple packages, owners, or environments
- `5`: cross-system program or migration

## Regression Risk: 1-5

- `1`: internal, fully characterized, trivial rollback
- `2`: bounded behavior with strong tests
- `3`: moderate integration or compatibility surface
- `4`: public, persistent, concurrent, security, or deployment-sensitive
- `5`: irreversible, poorly understood, or production-critical

## Score

```text
priority = impact x confidence / (effort x regression risk)
```

Round only for display. Preserve raw inputs and explain any manual ordering.
Scores do not authorize work. Approval gates and stop conditions always win.
