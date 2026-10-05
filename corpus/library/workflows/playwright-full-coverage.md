---
type: workflow
description: Multi-agent workflow that achieves systematic Playwright TypeScript test coverage of a web application. Phase 1 explores and inventories; Phase 2 fans out agents to implement tests in parallel (dev→review loop per test); Phase 3 runs the coverage judge and gates acceptance. Designed for enterprise-grade completeness.
params:
  app_dir: { type: string, description: "Absolute path to the application source code root. Required." }
  base_url: { type: string, description: "URL where the app is running (e.g. http://localhost:3000). Required." }
  out_dir: { type: string, description: "Output directory for test files, inventory, and reports. Defaults to <app_dir>/e2e." }
  max_concurrent_writers: { type: integer, minimum: 1, description: "Maximum number of test-writer agents running in parallel.", default: 5 }
  min_coverage_pct: { type: number, minimum: 0, maximum: 100, description: "Minimum scenario coverage percentage required to pass the final gate.", default: 80 }
steps:
  - id: validate-environment
  - id: explore-application
  - id: setup-infrastructure
  - id: implement-tests-parallel
  - id: integration-run
  - id: coverage-audit
  - id: multi-browser-run
  - id: final-report
tags:
  - playwright
  - testing
  - e2e
  - workflow
  - multi-agent
  - coverage
updated: 2026-06-06
---

# Workflow: Playwright Full Coverage

### Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `app_dir` | Yes | — | Absolute path to the application source code root |
| `base_url` | Yes | — | URL where the app is running (e.g. `http://localhost:3000`) |
| `out_dir` | No | `<app_dir>/e2e` | Output directory for test files, inventory, and reports |
| `max_concurrent_writers` | No | `5` | Maximum number of test-writer agents running in parallel |
| `min_coverage_pct` | No | `80` | Minimum scenario coverage percentage required to PASS the final gate |

---

### The Workflow Philosophy

This workflow is built on three foundational principles that distinguish it from naive test generation.

**Exploration before implementation.** Writing tests against a codebase you have not mapped is guesswork. Phase 1 sends a dedicated explorer agent to walk the application — routes, components, auth surfaces, critical user journeys — and produce a machine-readable inventory of every testable scenario. Implementation agents never guess; they execute against a known spec.

**Dev→review loop per test prevents accumulating tech debt.** A test that is written and immediately committed, without review, accumulates hidden debt: flaky selectors, missing assertions, brittle state assumptions. This workflow pairs every test-writer with a test-reviewer in a closed loop. No test is considered done until a reviewer has approved it. Rework cycles happen at the individual-test level, in parallel, rather than as a batch cleanup at the end. The result is a test suite that is consistently high quality from the first commit.

**Parallel implementation, sequential per-test gate.** The swarm phase fans out across all scenario groups simultaneously. But within each scenario, the writer→reviewer→rework cycle is strictly sequential — a reviewer's findings must be addressed before the next cycle begins. This delivers the speed of parallelism without the chaos of unreviewed bulk commits.

**The coverage judge is the final binary gate and cannot be bypassed.** After all individual tests are approved and the integration run is green, a dedicated coverage-judge agent audits the entire test suite against the original inventory. If coverage is below `min_coverage_pct` or any CRITICAL/HIGH scenario is untested, the workflow does not pass. Gap-filling agents are dispatched automatically for identified gaps. A human escalation path exists for gaps that cannot be automated, but the gate cannot be silently skipped.

---

## validate-environment

### Instructions

You are the orchestrator agent for this run. Before any exploration or implementation begins, confirm that the environment is coherent and complete. A broken environment discovered mid-swarm is far more costly than one caught here.

#### 1.1 Resolve and validate `out_dir`

```
out_dir = params.out_dir ?? path.join(params.app_dir, "e2e")
```

Create `out_dir` if it does not exist:

```bash
mkdir -p {{ out_dir }}
mkdir -p {{ out_dir }}/tests
mkdir -p {{ out_dir }}/pages
mkdir -p {{ out_dir }}/fixtures
mkdir -p {{ out_dir }}/reports
```

#### 1.2 Verify `@playwright/test` is installed

```bash
cd {{ app_dir }}
node -e "require('@playwright/test')" 2>&1
```

If this fails, attempt installation:

```bash
cd {{ app_dir }} && npm install --save-dev @playwright/test
```

If installation fails, block the run with the npm error output. Do not proceed.

#### 1.3 Verify Chromium binary

```bash
ls ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null \
  || npx playwright install chromium 2>&1
```

If `playwright install chromium` fails (network issue, disk space, permissions), block the run with the error. Record the Chromium version found.

#### 1.4 Verify `playwright.config.ts` exists or is generatable

```bash
ls {{ app_dir }}/playwright.config.ts 2>/dev/null \
  || ls {{ app_dir }}/playwright.config.js 2>/dev/null
```

If neither exists, set a flag `CONFIG_MISSING=true`. Step 3 will generate it. Do not generate it here — wait until after inventory so the config can be tuned to the actual route structure.

#### 1.5 Verify app is reachable at `base_url`

```bash
curl -sf --max-time 10 {{ base_url }} -o /dev/null && echo "REACHABLE" || echo "UNREACHABLE"
```

If UNREACHABLE:
- Check if a dev server start command exists in `package.json` (`scripts.dev`, `scripts.start`, `scripts.preview`).
- If found, surface the command to the user and block with instructions: "App is not reachable at {{ base_url }}. Start it with: `<command>`, then re-run this workflow."
- Do not attempt to start the server automatically — a server with side effects (DB migrations, seed data) must be started with human awareness.

#### 1.6 Persist environment snapshot

Write `{{ out_dir }}/env-snapshot.json`:

```json
{
  "app_dir": "{{ app_dir }}",
  "base_url": "{{ base_url }}",
  "out_dir": "{{ out_dir }}",
  "max_concurrent_writers": {{ max_concurrent_writers }},
  "min_coverage_pct": {{ min_coverage_pct }},
  "playwright_version": "<resolved>",
  "chromium_version": "<resolved>",
  "config_missing": <true|false>,
  "validated_at": "<ISO timestamp>"
}
```

### Completion Criteria

- `out_dir` and all subdirectories exist.
- `@playwright/test` resolves without error.
- Chromium binary is present.
- App responds at `base_url` with a 2xx or 3xx status.
- `env-snapshot.json` written to `out_dir`.
- `CONFIG_MISSING` flag recorded for Step 3.

---

## explore-application

### Instructions

Dispatch `agents/playwright/playwright-explorer` to walk the application and produce a structured test-scenario inventory. This step is strictly blocking — nothing in Phase 2 can begin until the inventory is complete and validated.

#### 2.1 Dispatch the explorer agent

Provide the following context to `agents/playwright/playwright-explorer`:

```yaml
app_dir: {{ app_dir }}
base_url: {{ base_url }}
out_dir: {{ out_dir }}
task: >
  Explore the application at base_url. Identify all routes, significant UI states,
  authentication surfaces, form flows, critical user journeys, error states,
  and permission-gated views. Produce a structured test-scenario inventory at
  out_dir/test-scenarios.json.
```

The explorer agent should:

1. Start from the root URL and spider navigable links up to 3 levels deep.
2. Identify authentication pages and flows (login, logout, register, password reset, OAuth).
3. Identify all unique routes and their URL patterns (static and dynamic, e.g. `/users/:id`).
4. For each route, identify: page title/heading, primary actions, form fields, data tables, modals, navigation elements.
5. Classify each scenario by risk: CRITICAL (auth, payments, data mutation), HIGH (core user flows), MEDIUM (secondary flows), LOW (cosmetic, informational).
6. Note any routes that require specific roles or permissions.
7. Note any flows that involve multi-step state (e.g. multi-page checkout, wizard forms).

#### 2.2 Expected output schema: `test-scenarios.json`

```json
{
  "app_name": "string",
  "base_url": "string",
  "explored_at": "ISO timestamp",
  "routes": [
    {
      "path": "/example",
      "title": "Example Page",
      "auth_required": false,
      "roles_required": [],
      "scenarios": [
        {
          "id": "example-page-renders",
          "title": "Example page renders with expected content",
          "risk": "MEDIUM",
          "type": "render",
          "preconditions": [],
          "steps": ["Navigate to /example", "Verify heading is visible"],
          "assertions": ["h1 text matches expected value"],
          "pom_needed": false
        }
      ]
    }
  ],
  "auth_flows": [],
  "summary": {
    "total_routes": 0,
    "total_scenarios": 0,
    "by_risk": { "CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0 }
  }
}
```

#### 2.3 Validate inventory

After the explorer completes:

```
scenarios = test-scenarios.json.routes[*].scenarios[*]
total = scenarios.length
```

- If `total == 0`: abort the run with error: "Explorer returned 0 scenarios. Check that base_url is correct and the app is returning real content, not a blank page or error."
- If `total < 5`: warn in run notes "Very low scenario count ({{ total }}). Verify app is fully accessible and not behind an auth wall the explorer could not traverse."
- Log to run notes: total routes, total scenarios, breakdown by risk tier.

#### 2.4 Persist exploration log

Write the explorer agent's reasoning trace to `{{ out_dir }}/exploration-log.txt` for audit purposes.

### Completion Criteria

- `test-scenarios.json` exists at `out_dir` with valid structure.
- At least 1 scenario present (non-zero, or run is aborted).
- Summary counts logged to run notes.
- Exploration log persisted.

---

## setup-infrastructure

### Instructions

Using the inventory from Step 2, generate the foundational Playwright infrastructure files. These are shared across all test files and must be consistent.

#### 3.1 Generate `playwright.config.ts` (if CONFIG_MISSING=true)

Generate at `{{ app_dir }}/playwright.config.ts` using `knowledge/playwright/best-practices` as reference:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: './e2e/reports/html', open: 'never' }],
    ['json', { outputFile: './e2e/reports/results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? '{{ base_url }}',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Setup project for auth state (generated if auth flows detected)
    ...(HAS_AUTH ? [{
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    }] : []),
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      ...(HAS_AUTH ? { dependencies: ['setup'] } : {}),
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      ...(HAS_AUTH ? { dependencies: ['setup'] } : {}),
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      ...(HAS_AUTH ? { dependencies: ['setup'] } : {}),
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
```

Replace `HAS_AUTH` with `true` if `test-scenarios.json.auth_flows` is non-empty, otherwise `false`.

If `playwright.config.ts` already exists, read it and check:
- `testDir` points to `out_dir/tests` (or equivalent). If not, surface a warning but do not overwrite.
- `reporter` includes `json` or `html`. If missing, append them.

#### 3.2 Generate `auth.setup.ts` (if auth flows detected)

If `test-scenarios.json.auth_flows` is non-empty, generate `{{ out_dir }}/tests/auth.setup.ts`:

```typescript
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../../.auth/user.json');

setup('authenticate as default user', async ({ page }) => {
  // TODO: Replace with actual login flow discovered by explorer
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.TEST_EMAIL ?? 'test@example.com');
  await page.getByLabel('Password').fill(process.env.TEST_PASSWORD ?? 'testpassword');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.context().storageState({ path: authFile });
});
```

Also create `.auth/` directory and add it to `.gitignore` if not already present.

#### 3.3 Generate `fixtures/index.ts`

Generate `{{ out_dir }}/fixtures/index.ts`:

```typescript
import { test as base, expect } from '@playwright/test';
import path from 'path';

// Extend base test with authenticated context
export const test = base.extend({
  // Authenticated page fixture
  authedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(__dirname, '../../.auth/user.json'),
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
```

#### 3.4 Verify directory structure

Confirm this layout exists under `out_dir`:

```
e2e/
  tests/
    auth.setup.ts          (if auth detected)
    <route-slug>/
      <scenario-id>.spec.ts  (created in Step 4)
  pages/
    BasePage.ts            (base POM — generated below)
  fixtures/
    index.ts
  reports/
    (empty — populated by test runs)
  test-scenarios.json      (from Step 2)
  env-snapshot.json        (from Step 1)
```

Generate `{{ out_dir }}/pages/BasePage.ts` as the POM base class:

```typescript
import { type Page, type Locator } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  readonly baseURL: string;

  constructor(page: Page, baseURL: string = '') {
    this.page = page;
    this.baseURL = baseURL;
  }

  async navigate(path: string = '') {
    await this.page.goto(this.baseURL + path);
  }

  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `e2e/reports/${name}.png`, fullPage: true });
  }
}
```

### Completion Criteria

- `playwright.config.ts` exists at `app_dir` root (generated or verified).
- `auth.setup.ts` generated if and only if auth flows were detected in inventory.
- `fixtures/index.ts` generated.
- `pages/BasePage.ts` generated.
- All `out_dir` subdirectories exist.
- Infrastructure files committed or noted as pending commit.

---

## implement-tests-parallel

### Instructions

This is the core parallelization phase. Scenario groups fan out to writer agents simultaneously. Each writer operates a closed dev→review loop before any test is considered done.

#### 4.1 Group scenarios into route batches

Read `test-scenarios.json`. Group all scenarios by `route.path`. Each group becomes one batch. Batches are independent — different routes do not share state.

```
batches = group_by(test-scenarios.json.routes, "path")
# Each batch: { route_path, route_slug, scenarios[] }
```

Derive `route_slug` from `route_path`:
- Replace `/` with `-`, strip leading `-`, lowercase, max 40 chars.
- Example: `/users/:id/settings` → `users-id-settings`

Create test subdirectory per batch: `{{ out_dir }}/tests/<route-slug>/`

#### 4.2 Dispatch writer agents (concurrency-controlled)

For each batch, for each scenario in the batch, dispatch `agents/playwright/playwright-test-writer` with:

```yaml
scenario: <scenario object from test-scenarios.json>
route: <route object>
out_dir: {{ out_dir }}
app_dir: {{ app_dir }}
base_url: {{ base_url }}
output_file: "{{ out_dir }}/tests/<route-slug>/<scenario-id>.spec.ts"
pom_dir: "{{ out_dir }}/pages"
fixtures_path: "{{ out_dir }}/fixtures/index.ts"
playwright_config: "{{ app_dir }}/playwright.config.ts"
```

**Concurrency rule:** No more than `max_concurrent_writers` writer agents may be active simultaneously across all batches. Maintain a semaphore counter. When a writer completes (APPROVED or ESCALATED), decrement the counter before dispatching the next.

Writer agent instructions:

1. Read the scenario spec and the route context.
2. Generate a Page Object Model class at `{{ out_dir }}/pages/<RouteSlug>Page.ts` if `pom_needed: true` in the scenario, or if the route does not yet have a POM. Reuse existing POM files — do not create duplicates.
3. Implement the test at `output_file` following `skills/e2e-testing/test-implementation`.
4. Run the single test to verify it passes green:
   ```bash
   cd {{ app_dir }} && npx playwright test {{ output_file }} --project=chromium
   ```
5. If the test fails on first run, diagnose and fix (max 3 self-repair attempts) before requesting review.
6. When green, signal completion to the orchestrator.

#### 4.3 Dev→review loop per test

After each writer signals green, immediately dispatch `agents/playwright/playwright-test-reviewer` for that test. Do not wait for other tests.

Reviewer inputs:

```yaml
test_file: "{{ out_dir }}/tests/<route-slug>/<scenario-id>.spec.ts"
pom_files: ["{{ out_dir }}/pages/<RouteSlug>Page.ts"]
scenario_spec: <scenario object>
playwright_config: "{{ app_dir }}/playwright.config.ts"
fixtures_path: "{{ out_dir }}/fixtures/index.ts"
rework_cycle: <1|2|3>
prior_findings: <list of prior reviewer findings, if rework cycle > 1>
```

Reviewer checklist (must evaluate all):

- Selectors use accessible roles, labels, or test-ids — not brittle CSS or XPath.
- Assertions are on observable user-facing outcomes, not internal implementation details.
- Test is deterministic: no `page.waitForTimeout()` or arbitrary `sleep()` calls.
- Auth state uses the shared fixture, not inline login steps (unless this IS the auth test).
- Test is isolated: does not depend on execution order or shared mutable state.
- POM methods are meaningful abstractions, not thin wrappers over single locator calls.
- Test title matches the scenario spec title exactly.
- All assertions include a meaningful failure message parameter.

Reviewer verdict: `APPROVED` | `REWORK` | `ESCALATE`

**If REWORK:** Attach reviewer findings and dispatch writer again. Increment `rework_cycle`.

**If rework_cycle reaches 3 and reviewer still returns REWORK:** Mark test as `ESCALATED`. Record findings in `{{ out_dir }}/reports/escalations.json`. Continue workflow — do not block the swarm on one test.

**If APPROVED:** Record in `{{ out_dir }}/reports/test-log.json`:

```json
{
  "scenario_id": "example-page-renders",
  "file": "e2e/tests/example/example-page-renders.spec.ts",
  "status": "APPROVED",
  "rework_cycles": 0,
  "approved_at": "ISO timestamp"
}
```

#### 4.4 Iteration loop pseudocode

```
for each route_batch in batches:
  for each scenario in route_batch.scenarios:
    wait_for_semaphore(max_concurrent_writers)
    dispatch writer_agent(scenario) → on_complete:
      rework_cycle = 1
      loop:
        dispatch reviewer_agent(test_file, rework_cycle)
        verdict = await reviewer
        if verdict == APPROVED:
          record_approved(scenario)
          release_semaphore()
          break
        elif verdict == REWORK and rework_cycle < 3:
          dispatch writer_agent(scenario, findings=reviewer.findings)
          await writer
          rework_cycle++
        else:
          record_escalated(scenario, reviewer.findings)
          release_semaphore()
          break
```

### Completion Criteria

- Every scenario in `test-scenarios.json` has an entry in `test-log.json` with status `APPROVED` or `ESCALATED`.
- No scenario is silently skipped or left without a log entry.
- All APPROVED test files exist on disk and are valid TypeScript.
- `escalations.json` lists all ESCALATED scenarios with full reviewer findings.
- Semaphore released for every dispatched writer (no leaked capacity).

---

## integration-run

### Instructions

Individual tests pass in isolation, but interactions between tests can reveal shared state leaks (global stores, database mutations, browser storage bleed). The integration run surfaces these before the coverage audit.

#### 5.1 Run full suite on Chromium

```bash
cd {{ app_dir }} && npx playwright test --project=chromium --reporter=list
```

Capture full output to `{{ out_dir }}/reports/integration-run.log`.

Parse the output for:
- Total tests: passed, failed, skipped, flaky.
- Any tests that pass in isolation (confirmed green in Step 4) but fail in this run — these are **interaction failures**.

#### 5.2 Diagnose and fix interaction failures

For each interaction failure, dispatch a focused `agents/playwright/playwright-test-writer` with:

```yaml
mode: fix-interaction-failure
failing_test: <file path>
error_output: <captured stderr>
full_suite_log: "{{ out_dir }}/reports/integration-run.log"
instruction: >
  This test passed in isolation but fails when run with the full suite.
  Diagnose the state leak (browser storage, global state, shared fixture, test order
  dependency) and fix it. Common fixes: use beforeEach to reset state, use
  isolated browser contexts, avoid sharing Page Object instances across tests.
```

After each fix, re-run only the affected test plus the tests that ran immediately before it in the failing sequence:

```bash
cd {{ app_dir }} && npx playwright test <file1> <file2> --project=chromium
```

Repeat until the interaction failure is resolved. If unresolvable after 3 fix cycles, escalate (add to `escalations.json`).

#### 5.3 Re-run if fixes were applied

If any interaction failures were found and fixed, re-run the full Chromium suite again to confirm clean:

```bash
cd {{ app_dir }} && npx playwright test --project=chromium --reporter=list
```

#### 5.4 Log integration results

Append to `{{ out_dir }}/reports/test-log.json`:

```json
{
  "integration_run": {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "skipped": 0,
    "interaction_failures_found": 0,
    "interaction_failures_fixed": 0,
    "interaction_failures_escalated": 0,
    "run_at": "ISO timestamp"
  }
}
```

### Completion Criteria

- Full Chromium suite runs to completion (passed + skipped only, zero failures).
- All interaction failures either fixed or escalated with findings.
- Integration run results logged.

---

## coverage-audit

### Instructions

The coverage judge is the final quality gate. It audits the implemented test suite against the original scenario inventory to determine if coverage meets the `min_coverage_pct` threshold.

#### 6.1 Dispatch coverage judge

Dispatch `agents/playwright/test-coverage-judge` with:

```yaml
scenarios_inventory: "{{ out_dir }}/test-scenarios.json"
test_log: "{{ out_dir }}/reports/test-log.json"
test_dir: "{{ out_dir }}/tests"
min_coverage_pct: {{ min_coverage_pct }}
```

Coverage judge evaluation:

1. For each scenario in `test-scenarios.json`, check `test-log.json` for a corresponding entry with status `APPROVED`.
2. Compute: `coverage_pct = (approved_scenarios / total_scenarios) * 100`
3. Classify gaps:
   - CRITICAL/HIGH scenarios with no APPROVED test: **blocking gaps**
   - MEDIUM scenarios with no APPROVED test: **tracked gaps** (for backlog)
   - LOW scenarios with no APPROVED test: **noted gaps** (informational)
4. Produce verdict: `PASS` if `coverage_pct >= min_coverage_pct` AND no blocking gaps. Otherwise `FAIL`.

Expected output schema from judge:

```json
{
  "coverage_pct": 87.5,
  "total_scenarios": 40,
  "covered_scenarios": 35,
  "blocking_gaps": [],
  "tracked_gaps": [{ "scenario_id": "...", "risk": "MEDIUM", "route": "/..." }],
  "noted_gaps": [],
  "verdict": "PASS",
  "evaluated_at": "ISO timestamp"
}
```

Write judge output to `{{ out_dir }}/reports/coverage-verdict.json`.

#### 6.2 Handle FAIL verdict

If verdict is `FAIL`:

1. Log each blocking gap with route, scenario title, and risk tier.
2. For each blocking gap, dispatch `agents/playwright/playwright-test-writer` (same configuration as Step 4 writer) to implement the missing test.
3. After each gap-fill writer completes, run the dev→review loop (same as Step 4.3, max 3 rework cycles).
4. After all gap-fill tests are APPROVED (or ESCALATED), re-dispatch the coverage judge.
5. Maximum 2 coverage audit cycles. If coverage still fails after 2 gap-fill rounds, escalate to human with the coverage-verdict.json and the list of remaining gaps.

#### 6.3 Human escalation path

If escalating to human after 2 failed audit cycles:
- Write `{{ out_dir }}/reports/COVERAGE-FAIL.md` with:
  - Current coverage percentage
  - List of all blocking gaps with routes and scenario descriptions
  - Suggestions for manual test cases
  - Instructions for re-running just the audit: `akm workflow resume playwright-full-coverage --step coverage-audit`
- Block the workflow run with status `escalated`.

### Completion Criteria

- `coverage-verdict.json` exists with a final verdict.
- Verdict is `PASS` (coverage_pct >= min_coverage_pct, no blocking gaps), OR
- Workflow is blocked with `COVERAGE-FAIL.md` and escalation notice.

---

## multi-browser-run

### Instructions

With coverage confirmed, validate the test suite across all configured Playwright projects. Browser-specific failures are documented but do not re-trigger the coverage audit — this step is for compatibility awareness, not coverage gating.

#### 7.1 Run full suite across all projects

```bash
cd {{ app_dir }} && npx playwright test --reporter=html
```

This runs all projects defined in `playwright.config.ts` (chromium, firefox, webkit, mobile-chrome).

Capture output to `{{ out_dir }}/reports/multi-browser-run.log`.

The HTML report will be generated at `{{ out_dir }}/reports/html/index.html`.

#### 7.2 Parse browser-specific failures

Parse results from `{{ out_dir }}/reports/results.json` (the JSON reporter output). Identify:

- Tests that pass on chromium but fail on firefox or webkit.
- Tests that pass on desktop but fail on mobile-chrome.

For each browser-specific failure:
- Classify: rendering issue (visual), timing issue (async), API issue (browser API differences).
- If it is a timing issue: dispatch a focused fix (increase timeout, add explicit wait).
- If it is an API issue: wrap in `test.skip(browserName === 'webkit', 'reason')` and note in the report.
- Rendering differences: note in report, do not auto-fix.

#### 7.3 Re-run after fixes

If any browser-specific fixes were applied:

```bash
cd {{ app_dir }} && npx playwright test --reporter=json
```

Log final per-browser pass/fail counts.

### Completion Criteria

- Multi-browser run completed.
- Browser-specific failures classified and either fixed, skipped with annotation, or noted.
- HTML report generated at `{{ out_dir }}/reports/html/index.html`.
- Per-browser pass/fail counts logged.

---

## final-report

### Instructions

Generate a human-readable coverage report and make the final PASS/FAIL determination for the workflow run.

#### 8.1 Aggregate data

Collect from:
- `{{ out_dir }}/test-scenarios.json` — inventory totals
- `{{ out_dir }}/reports/test-log.json` — approved/escalated counts, rework stats
- `{{ out_dir }}/reports/coverage-verdict.json` — coverage percentage, gap lists
- `{{ out_dir }}/reports/results.json` — browser breakdown
- `{{ out_dir }}/reports/escalations.json` — tests needing human review

#### 8.2 Generate `coverage-report.md`

Write to `{{ out_dir }}/coverage-report.md`:

```markdown
# Playwright Coverage Report

**App:** {{ app_dir }}
**Base URL:** {{ base_url }}
**Generated:** <ISO timestamp>
**Workflow Run ID:** <run_id>

## Summary

| Metric | Value |
|---|---|
| Total scenarios inventoried | N |
| Total tests implemented | N |
| Tests approved | N |
| Tests escalated (need human review) | N |
| **Coverage percentage** | **N%** |
| Minimum required | {{ min_coverage_pct }}% |
| **Gate decision** | **PASS / FAIL** |

## Browser Breakdown

| Browser | Passed | Failed | Skipped |
|---|---|---|---|
| Chromium | N | N | N |
| Firefox | N | N | N |
| WebKit | N | N | N |
| Mobile Chrome | N | N | N |

## Escalated Tests (Need Human Review)

Tests that could not be automated after 3 rework cycles. These require manual
implementation or triage.

<list each escalated test with scenario title, route, risk tier, and last reviewer finding>

## Coverage Gaps

### Blocking Gaps (CRITICAL / HIGH — unacceptable for production)
<None if PASS>

### Tracked Gaps (MEDIUM — add to backlog)
<list>

### Noted Gaps (LOW — informational)
<list>

## Rework Statistics

| Tests with 0 rework cycles | N |
| Tests with 1 rework cycle  | N |
| Tests with 2 rework cycles | N |
| Tests with 3 rework cycles | N |

## Artifacts

- Inventory: `{{ out_dir }}/test-scenarios.json`
- Test log: `{{ out_dir }}/reports/test-log.json`
- Coverage verdict: `{{ out_dir }}/reports/coverage-verdict.json`
- HTML report: `{{ out_dir }}/reports/html/index.html`
- Integration run log: `{{ out_dir }}/reports/integration-run.log`
```

#### 8.3 Gate decision

```
gate_pass = (coverage_pct >= min_coverage_pct) AND (blocking_gaps.length == 0)
```

If `gate_pass == true`:
- Log: "PASS: coverage {{ coverage_pct }}% >= {{ min_coverage_pct }}%, no blocking gaps."
- Mark workflow run as `completed`.

If `gate_pass == false`:
- This should not be reachable here (Step 6 blocks on this condition). If reached anyway, mark `escalated` and write COVERAGE-FAIL.md.

#### 8.4 Notify

If a notification channel is available (`skills/notify`), send:

```
Playwright Full Coverage: PASS/FAIL
App: {{ base_url }}
Coverage: {{ coverage_pct }}% (min: {{ min_coverage_pct }}%)
Tests: {{ approved_count }} approved, {{ escalated_count }} escalated
Report: {{ out_dir }}/coverage-report.md
```

### Completion Criteria

- `coverage-report.md` written to `out_dir`.
- Gate decision (`PASS` or escalation) is recorded in run notes.
- Workflow run status is `completed` (PASS) or `escalated` (FAIL/escalation).
