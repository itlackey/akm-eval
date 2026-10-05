# Refactoring Review Rubric

## Blocking

- Observable behavior changed without explicit approval
- Public API, schema, persisted data, dependency, migration, or architecture
  gate bypassed
- Required test weakened, removed, skipped, unavailable, timed out, or failing
- Diff includes unrelated work or cannot be mapped to the approved slice
- Dead-code or dependency deletion lacks indirect-use evidence
- Security, reliability, or performance claim lacks applicable verification
- Report says passed when raw evidence does not

## Major

- Characterization does not cover the behavior at risk
- Replaced implementation remains and creates parallel paths
- New abstraction does not reduce demonstrated duplication or complexity
- Rollback is incomplete or would affect unrelated work
- Documentation now contradicts implementation

## Minor

- Evidence link or command provenance is incomplete
- Non-normative documentation needs a focused correction
- Meaningful metric could be clearer without changing the verdict

## Verdicts

- `approve`: no blocking or major findings and all required checks pass
- `request changes`: bounded corrections can make the slice acceptable
- `block`: approach, authorization, evidence, or scope must be reconsidered

If no findings exist, state that explicitly and list residual test or environment
coverage gaps.
