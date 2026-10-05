---
title: Playwright Test Coverage Rubric
description: Binary PASS/FAIL gate for Playwright test suite completeness and quality. Three layers — deterministic floor (structure), coverage (scenarios), and quality (implementation). Mirrors the web-ux measurable rubric in structure and philosophy.
tags:
  - playwright
  - testing
  - rubric
  - quality-gate
  - coverage
  - typescript
priority: high
updated: 2026-09-15
when_to_use: Apply this rubric when reviewing a Playwright test suite for completeness. Use as the scoring criteria for agents/playwright/test-coverage-judge. Run after workflows/playwright-full-coverage completes to gate acceptance.
lint_skip:
  - missing-ref
---

## Philosophy

"We have tests" is not a coverage claim. It is a statement of existence, nothing more. A suite can have 200 tests and still leave every error path untested, every boundary case untested, and every auth edge case untested. When that suite goes green, it gives engineers confidence. When confidence is unearned, bugs reach production wearing a green checkmark.

This rubric exists to make "we have tests" mean something measurable. Coverage must be proven, not felt.

The rubric mirrors the web-ux measurable rubric in structure and philosophy: it applies objective, machine-or-agent-verifiable criteria at each layer before advancing to the next. No layer can be skipped. No layer can compensate for failure in another. A suite with brilliant implementation quality but missing error paths still fails. A suite with complete scenario coverage but raw codegen selectors still fails.

Three failure modes motivate the three layers:

1. **Structural failures** — The test suite is misconfigured or uses anti-patterns that make results unreliable regardless of what the tests say. A test suite that flakes 20% of the time is not a test suite; it is a noise generator. Structural failures are caught at Layer 1.

2. **Coverage gaps** — The suite runs reliably but does not exercise the scenarios users actually encounter: form validation, API errors, empty states, permission boundaries. Engineers believe they are covered; they are not. Coverage gaps are caught at Layer 2.

3. **Quality failures** — The suite covers the right scenarios but does so in ways that will break on irrelevant changes (brittle selectors), miss the actual failure (weak assertions), or become unmaintainable within weeks (no Page Object Models, duplicated setup). Quality failures are caught at Layer 3.

A rubric that only measures existence of test files catches none of these. This rubric catches all three.

---

## The Gate is Binary PASS/FAIL

There is no partial credit. There is no "mostly passing." A suite either satisfies every criterion in every layer, or it does not ship.

The three-layer system is an AND-gate:

```
Layer 1 (Structural Floor)  →  PASS required to proceed
         ↓
Layer 2 (Coverage)          →  PASS required to proceed
         ↓
Layer 3 (Quality)           →  PASS required to ship
```

Layer 1 is machine-checkable. An automated script inspects the config and test files and emits PASS or FAIL per criterion. If any F-criterion fails, the pipeline stops. Layer 2 does not run.

Layer 2 is agent-evaluated. `agents/playwright/test-coverage-judge` receives the application's feature inventory and the test file listing and verifies each required scenario exists. If any feature is missing a required scenario, the suite fails Layer 2. Layer 3 does not run.

Layer 3 is agent-reviewed. `agents/playwright/playwright-test-reviewer` reads the test implementations and scores each quality criterion. If any criterion fails, the suite fails Layer 3.

All three layers must pass. That is the gate.

---

## Layer 1 — Structural Floor (binary, machine-checkable)

Every criterion in this layer is deterministically true or false. No judgment is required. An automated check script can emit a PASS/FAIL table in under 10 seconds.

### F1 — Config Completeness

**File:** `playwright.config.ts` (or `.js`)

**Required fields and values:**

| Field | Requirement | Rationale |
|---|---|---|
| `retries` | `>= 1` in CI (`process.env.CI ? 2 : 0` is canonical) | Single-pass CI failures cause false rejections |
| `reporter` | At least `html` and one machine-readable reporter (`json`, `junit`, or `dot`) | Pipeline needs structured output; humans need readable output |
| `timeout` | Explicit value, `<= 30000` ms | Unset timeout defaults to 30s but documents intent; prevents silent hangs |
| `use.actionTimeout` | Explicit value, `<= 10000` ms | Bounds individual action waits |
| `projects` | At least 2 browser projects (`chromium` + one of `firefox`/`webkit`) | Browser monoculture misses rendering bugs |
| `use.baseURL` | Set (may use env var) | Hardcoded URLs in tests are a FAIL at Layer 3 |
| `webServer` | Configured OR a comment explaining external setup | Ensures tests run against a known server state |

**FAIL condition:** Any required field is missing or out of range.

---

### F2 — No Raw Codegen Output

Playwright's codegen produces test skeletons that pass as first drafts but fail in maintenance. Raw codegen output is identifiable by its selector patterns and wait style.

**FAIL if any test file contains:**

- `page.click('.some-class')` — CSS class selectors
- `page.click('#some-id')` — ID selectors unless the ID is a semantic landmark (rare)
- `page.locator('xpath=...')` — Raw XPath
- `await page.waitForTimeout(N)` where `N > 100` — hardcoded waits that paper over timing issues
- `await page.waitForTimeout(N)` anywhere without an explicit comment explaining the delay and a ticket to remove it
- `page.click('text=...')` — legacy text selector syntax (use `getByText(...)` instead)
- A navigation assertion that checks only the URL and never verifies the destination's user-visible content

**PASS condition:** Zero occurrences across all test files under `tests/` or the configured `testDir`.

---

### F3 — Auth Setup Project

Authentication is the most commonly duplicated test setup. If every test logs in, the suite is slow, brittle on auth changes, and unreadable.

**Required:**

- A Playwright project named `setup` (or `auth`) in `playwright.config.ts` with `testMatch: /auth.setup.ts/` (or equivalent)
- The setup project generates `storageState` to a `.auth/` directory (or equivalent)
- At least one non-setup project declares `dependencies: ['setup']` and `use: { storageState: '...' }`
- No test file outside the setup project calls `page.goto('/login')` and fills credentials

**FAIL condition:** Any authenticated test duplicates login rather than consuming stored state. Any project that should be auth-dependent lacks the `dependencies` declaration.

**Exception:** A project explicitly testing the login flow itself may contain login steps. That project must be named to make intent clear (e.g., `auth-flows`).

---

### F4 — Test Isolation

Tests that share state through globals, database writes, or module-level variables are time bombs. A passing order today is a flaky order tomorrow.

**FAIL if any of the following are found:**

- Module-level `let` variables mutated across tests (e.g., `let userId: string` set in one test, read in another)
- `test.describe.serial` used without an explicit comment explaining why serial execution is required and what shared resource necessitates it
- `test.beforeAll` that creates state consumed by individual tests without a corresponding `test.afterAll` teardown
- Database seeding in one test that a later test depends on implicitly (no explicit fixture providing the seeded data)
- Tests that `page.goto` to a URL created in a previous test's response (e.g., using a globally stored ID)

**PASS condition:** Each test can be run in isolation (`npx playwright test --grep "test name"`) and produces the same result regardless of what ran before it.

---

### F5 — No Flake Patterns

Flake is structural. It does not come from randomness; it comes from patterns that race against the application's async behavior.

**FAIL if any test file contains:**

- `page.waitForTimeout(...)` anywhere (zero tolerance; use web-first assertions or `page.waitForResponse`)
- `await new Promise(resolve => setTimeout(resolve, N))` — JS sleep equivalent
- `expect(await page.locator('...').count()).toBe(N)` — count assertion on a locator that has not been waited for
- `page.locator('...').first()` used as a disambiguation hack when the underlying selector matches more than one element (symptom: tests break when DOM order changes)
- Any assertion that does not use Playwright's built-in web-first assertion API (e.g., `expect(await locator.textContent()).toBe(...)` instead of `await expect(locator).toHaveText(...)`)

**Why web-first assertions matter:** `expect(locator).toHaveText(...)` retries internally until the assertion passes or the timeout expires. `expect(await locator.textContent()).toBe(...)` evaluates once and fails if the DOM hasn't updated yet. The first form is robust; the second form is a race condition.

**PASS condition:** Zero flake patterns across all test files.

---

## Layer 2 — Coverage Requirements (per-feature)

Layer 2 is evaluated against the application's feature inventory. Before running the coverage judge, a feature manifest must exist — either generated by `skills/e2e-testing/app-exploration` or written by hand. The manifest lists every user-facing route, modal, form, and action.

For each entry in the feature manifest, the following scenarios must have at least one test. "At least one test" means a test that specifically exercises that scenario and asserts on its outcome — not a test that incidentally passes through it.

---

### Required Scenarios Per Feature

#### Happy Path

A complete success flow from user action to visible outcome. The assertion must verify the outcome, not just the navigation. Example: submitting a form must assert the success message or the resulting data, not just that the submit button was clickable.

**FAIL condition:** Feature has no test that exercises the success flow end-to-end with an outcome assertion.

---

#### Error Path

Failures the user will encounter: form validation messages, API error states, empty states when no data exists, network error handling.

**Minimum per feature:**

- One test that triggers a validation error (if the feature has a form) and asserts the error message text
- One test that asserts empty state UI when the data source is empty (if the feature renders a list or table)
- One test that simulates an API/network error (via `page.route(...)`) and asserts the error UI

**FAIL condition:** Any of the above is absent for a feature that has the corresponding UI path.

---

#### Edge Cases

Boundary values and inputs that reveal off-by-one errors, truncation bugs, and overflow issues.

**Required where applicable:**

- Maximum length inputs (if a field has a max length, test at max and at max+1)
- Empty string input where the UI should prevent or handle it
- Special characters in text fields (`"`, `'`, `<script>`, unicode if the app is internationalized)
- Zero-value numeric inputs where the UI distinguishes zero from null

**FAIL condition:** A feature with known boundary constraints has no edge case test.

---

#### Responsive

UI regressions from viewport changes are among the most common unfiled bugs. Every UI-heavy feature (any feature with layout, tables, navigation, or modal dialogs) must be tested at two viewport sizes.

**Required viewports:**

- Desktop: `{ width: 1280, height: 720 }` (or the project's primary desktop breakpoint)
- Mobile: `{ width: 375, height: 812 }` (iPhone 13 reference)

**Minimum per UI-heavy feature:**

- The happy path test runs at both viewports, or a separate responsive test asserts that the feature renders correctly at the mobile viewport (no overflow, no hidden interactive elements, navigation accessible)

**FAIL condition:** A UI-heavy feature has been tested only at desktop viewport.

---

#### Accessibility

Accessibility regressions are silent. They do not throw errors; they exclude users. Each primary view must have an axe-core scan.

**Required:**

- `@axe-core/playwright` installed and configured
- Each primary view (distinct route or modal) has at least one test that runs `checkA11y(page)` or equivalent
- The test asserts zero violations at `critical` and `serious` impact levels
- `moderate` and `minor` violations may be tracked as warnings but must not silently pass — they must be logged or reported

**FAIL condition:** Any primary view has no axe scan. Any view suppresses all violations without per-violation justification comments.

---

#### Auth / Permissions

For any auth-gated feature, both sides of the gate must be tested.

**Required:**

- One test that accesses the feature with a user holding the correct role and asserts the expected UI is visible
- One test that accesses the feature with a user lacking the required role (or unauthenticated) and asserts the rejection: redirect to login, 403 page, or access-denied message — whichever the application implements

**FAIL condition:** An auth-gated feature has only the authorized-access test. Unauthorized rejection is untested.

---

## Layer 3 — Implementation Quality (judge-evaluated)

Layer 3 is evaluated by `agents/playwright/playwright-test-reviewer` reading the test implementations. Each criterion is scored PASS or FAIL across the suite. A single failing test file can fail the criterion for the suite.

---

### Selector Quality

Selectors are the most common source of test brittleness. The hierarchy is:

| Selector type | Verdict | Notes |
|---|---|---|
| `getByRole(...)` | PASS (preferred) | Semantic, resilient to DOM restructuring |
| `getByLabel(...)` | PASS (preferred) | Form fields; tests accessibility linkage |
| `getByText(...)` | PASS | Acceptable for user-visible text |
| `getByTestId(...)` | PASS | Acceptable when semantic selectors are not available; requires `data-testid` in markup |
| `getByPlaceholder(...)` | PASS | Acceptable fallback for inputs |
| `locator('css=...')` with semantic class | CONDITIONAL | Only if the class is explicitly test-stable and documented as such |
| `locator('.some-class')` | FAIL | CSS class selectors break on any styling refactor |
| `locator('#some-id')` (non-landmark) | FAIL | IDs used for styling are unstable |
| `locator('xpath=...')` | FAIL | XPath is fragile and unreadable |

**PASS condition:** All selectors in the suite use the PASS tier. Zero FAIL-tier selectors.

---

### Assertion Specificity

An assertion that only checks visibility confirms the element exists. It does not confirm correct behavior. Assertions must verify observable outcomes.

**FAIL patterns:**

- `await expect(locator).toBeVisible()` as the final assertion after a form submission — this confirms only that something appeared, not that it is the right thing
- `await expect(page).toHaveURL('/dashboard')` without asserting any page content — navigation alone is not a success signal
- `await expect(locator).toHaveCount(N)` without asserting what the N items are — count without content

**PASS patterns:**

- `await expect(locator).toHaveText('Order confirmed — #12345')` — specific text
- `await expect(locator).toHaveValue('user@example.com')` — specific form value
- `await expect(page).toHaveTitle(/Dashboard — Acme/)` — specific title
- `await expect(locator).toContainText('Welcome, Alice')` after login — personalized content confirms the right session

**PASS condition:** Every test's final assertion verifies a specific, user-visible outcome — not just existence or navigation.

---

### Page Object Model (POM) Usage

Tests that interact directly with selectors inline become maintenance burdens when the UI changes. Repeated selector strings across test files are the signal.

**Rule:**

- If 3 or more tests interact with the same page or component, a Page Object Model must exist for that page/component
- The POM must encapsulate selectors and actions; tests call POM methods, not raw locators
- POM files live in `tests/pages/` or `tests/fixtures/pages/` (consistent location required)
- POM classes must not assert — they provide actions and locators; assertions stay in tests

**FAIL condition:** Three or more tests duplicate the same selector string without a POM. POM class contains `expect(...)` calls.

---

### Fixture Usage

`beforeEach` blocks that are copy-pasted across `describe` blocks are the POM problem applied to setup. Fixtures solve this.

**Rule:**

- If the same setup block appears in 2 or more `describe` groups, it must be extracted to a Playwright fixture (`test.extend(...)`)
- Auth fixtures (user sessions by role) must use the `storageState` pattern, not inline login
- Database/API seeding fixtures must tear down after the test (or use transaction rollback)

**FAIL condition:** Duplicated `beforeEach` setup across describe blocks that could be a fixture. Fixture that does not clean up created state.

---

### Test Naming

Test names are documentation. They must describe what the test proves — the business invariant — not what the test does mechanically.

**FAIL patterns:**

- `test('clicks submit button')` — describes action, not outcome
- `test('form test')` — no information
- `test('test 1')` — placeholder
- `it('should work')` — tautology

**PASS patterns:**

- `test('new user sees onboarding prompt on first login')`
- `test('admin can delete any post; regular user cannot')`
- `test('submitting with duplicate email shows inline error')`
- `test('invoice table is empty when no orders exist')`

**Rule:** The test name must be a falsifiable claim about user-observable behavior.

**PASS condition:** All test names describe outcomes, not actions. Any reviewer can understand what invariant a failing test broke without reading the test body.

---

### No Test Interdependencies

Each test must be runnable in isolation. This is restated from Layer 1 (F4) at the implementation level because structural isolation (no shared module state) is necessary but not sufficient. Implementation-level interdependencies also include:

- A test that only passes if a previous test's side effect (created record, uploaded file, sent email) exists in the system
- A test that hardcodes a resource ID created by a previous test's run
- A test that navigates to a URL built from state accumulated across prior tests

**Detection method:** Run a single test in isolation with `--grep`. Run the same test after running all tests in reverse order. Both must produce the same result.

**PASS condition:** Every test passes when run as the only test in the suite. No test assumes prior state.

---

## Scoring & Gate Rule

### Who Runs Each Layer

| Layer | Runner | When |
|---|---|---|
| Layer 1 — Structural Floor | Automated check script (CI step) | On every PR; before any agent review |
| Layer 2 — Coverage | `agents/playwright/test-coverage-judge` | After Layer 1 passes; receives feature manifest + test file listing |
| Layer 3 — Quality | `agents/playwright/playwright-test-reviewer` | After Layer 2 passes; receives test file contents |

### The AND-Gate

```
IF Layer 1 FAIL → suite fails; stop
IF Layer 2 FAIL → suite fails; stop
IF Layer 3 FAIL → suite fails
IF all three PASS → suite passes gate
```

There is no escalation path for a partial pass. There is no override except an explicit human decision recorded in the PR with a time-bounded remediation ticket.

### Remediation Process

When a layer fails:

1. The failing agent or script emits a structured failure report listing each failed criterion with the file and line (where applicable).
2. `agents/playwright/playwright-test-writer` is dispatched to fix the failing criteria — not to add new tests, but to fix what failed the gate.
3. The full three-layer check reruns from Layer 1.
4. The suite does not ship until all three layers pass in the same run.

### Exception Protocol

On rare occasions a criterion may be legitimately inapplicable (e.g., a CLI-only project has no responsive requirement). Exceptions must be:

- Declared in a `coverage-exceptions.md` file at the root of the test directory
- Listed per-criterion with the reason the criterion does not apply
- Approved by a human reviewer before the gate run
- Reviewed at each release to confirm the exception still applies

An exception file with expired or unjustified entries is itself a Layer 1 failure.

---

## Related Assets

The following AKM stash assets work in concert with this rubric:

- `skills/e2e-testing/app-exploration` — Generates the feature manifest required for Layer 2 by navigating the application and cataloguing routes, forms, modals, and auth gates
- `skills/e2e-testing/test-implementation` — Writes Playwright tests to Layer 3 standards: correct selector hierarchy, web-first assertions, POM extraction, fixture usage, outcome-focused naming
- `workflows/playwright-full-coverage` — Orchestrates the full coverage pipeline: app-exploration → test-implementation → three-layer gate → remediation loop → acceptance
- `agents/playwright/playwright-test-writer` — Implements tests given a scenario list; follows Layer 3 quality criteria; dispatched by workflows/playwright-full-coverage
- `agents/playwright/playwright-test-reviewer` — Evaluates test implementations against Layer 3 criteria; emits structured PASS/FAIL report per criterion per file
- `agents/playwright/test-coverage-judge` — Evaluates the feature manifest against the test file listing for Layer 2; identifies missing scenarios and emits gap report
