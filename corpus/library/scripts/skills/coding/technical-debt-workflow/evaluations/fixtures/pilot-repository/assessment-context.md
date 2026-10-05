# Assessment Context

This directory is the complete boundary for evaluation prompts; it has no
external consumers or production data.

- Public API: `normalize_label(value, trim=True) -> str`
- Architecture: the normalizer is one pure module with no allowed runtime
  dependency on packaging or evaluation tooling.
- Dependency candidate: `typing-extensions` is declared in `pyproject.toml` but
  no fixture source imports it.
- Dead-code candidate: `assessment/dead_candidate.py::legacy_title` has no
  declared consumer inside this complete fixture boundary. An evaluator must
  still inspect every direct and indirect usage channel before deletion.
- Generated files: none.
- Verification oracle: `contract-cases.json`.
- Slice evidence: `evidence/approval.md`, `evidence/baseline.json`,
  `evidence/verification.json`, and `evidence/pilot.patch`.

The `before/` and `after/` directories are immutable evidence snapshots. The
pilot runner copies only the baseline source and contract into a disposable Git
repository before applying the bounded change.
