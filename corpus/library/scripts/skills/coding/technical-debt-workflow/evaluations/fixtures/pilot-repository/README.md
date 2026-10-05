# Pilot Repository Fixture

This fixture provides a deterministic, low-risk refactoring example. The public
contract is `normalize_label(value, trim=True) -> str`:

- trim surrounding whitespace when `trim` is true;
- preserve whitespace when `trim` is false;
- return `"unknown"` for an empty normalized value;
- lower-case every other normalized value.

`before/normalizer.py` duplicates the empty-value and lower-case behavior across
two branches. `after/normalizer.py` computes the branch-specific value once and
shares the behavior. `contract-cases.json` is the behavior oracle used by the
pilot test.
