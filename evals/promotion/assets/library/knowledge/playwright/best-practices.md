---
title: Playwright TypeScript Best Practices
description: Authoritative reference for writing enterprise-grade Playwright tests in TypeScript. Covers Page Object Model, fixtures, selectors, assertions, parallelism, auth state reuse, CI integration, and debugging patterns.
tags:
  - playwright
  - testing
  - typescript
  - e2e
  - best-practices
  - enterprise
priority: high
updated: 2026-09-15
when_to_use: Read this before writing any Playwright test, before reviewing a test PR, or when debugging flaky tests.
---

# Playwright TypeScript Best Practices

## 1. Selector Strategy

### Priority Order

Always prefer selectors that reflect user-visible semantics over structural DOM selectors. Playwright's built-in locator methods map to ARIA semantics and are more resilient to refactors.

**Recommended priority (highest to lowest):**

1. `getByRole()` — ARIA role + accessible name; the gold standard
2. `getByLabel()` — form fields by their `<label>` text
3. `getByPlaceholder()` — inputs by placeholder attribute
4. `getByText()` — elements by visible text content
5. `getByAltText()` — images by alt attribute
6. `getByTitle()` — elements by title attribute
7. `getByTestId()` — `data-testid` attributes; use when no semantic selector works
8. CSS selectors — last resort for structural queries
9. XPath / `:nth-child` — **never** use unless absolutely required and documented

```typescript
// BEST: role-based, tied to what users actually perceive
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
await page.getByLabel('Email address').fill('user@example.com');

// GOOD: data-testid for components without strong semantic identity
await page.getByTestId('product-card-123').click();

// AVOID: brittle, breaks on styling/layout changes
await page.locator('.btn.btn-primary:nth-child(2)').click();
await page.locator('//div[@class="container"]/button[2]').click();
```

### Why `getByRole` Is the Gold Standard

Playwright's `getByRole` uses ARIA role semantics and the computed accessible
name. This means:
- It tests what assistive technology users experience
- It is resilient to CSS class renames and many non-semantic DOM refactors
- Roles are defined by ARIA spec, making them stable across frameworks
- It catches accessibility regressions as a side effect

### Web-First Assertions With Locators

Always pass locators directly to `expect()`. Never resolve a locator to a handle before asserting.

```typescript
// CORRECT: Playwright polls until the condition is met or timeout expires
await expect(page.getByRole('status')).toHaveText('Saved');

// WRONG: isVisible() is a one-shot snapshot; races with async rendering
expect(await page.locator('.status').isVisible()).toBe(true);
```

---

## 2. Page Object Model

### When to Use a POM

Introduce a Page Object when:
- Three or more tests interact with the same page or component
- Interaction logic is complex (multi-step flows, conditional state)
- You need to share selectors across test files

For single-use smoke tests, inline locators are acceptable.

### Canonical POM Structure

```typescript
// tests/pages/LoginPage.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email address');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async loginExpectingError(email: string, password: string): Promise<string> {
    await this.login(email, password);
    await this.errorMessage.waitFor({ state: 'visible' });
    return this.errorMessage.innerText();
  }
}
```

### POM Rules

- **No assertions in POMs.** Return data or locators; assert in test files. This keeps POMs reusable across scenarios that expect different outcomes.
- **All interaction methods must be `async`.** Playwright actions are promises.
- **Expose locators as readonly properties** so tests can assert against them directly if needed.
- **One POM per logical page or major component**, not per test file.
- **Compose POMs** for shared components (e.g., `NavBar`, `Modal`) rather than duplicating locator definitions.

```typescript
// tests/pages/DashboardPage.ts
import { Page } from '@playwright/test';
import { NavBar } from './components/NavBar';

export class DashboardPage {
  readonly navBar: NavBar;

  constructor(page: Page) {
    this.navBar = new NavBar(page);
  }

  async goto() {
    await page.goto('/dashboard');
  }
}
```

---

## 3. Fixtures

### Extending the Base Test

Fixtures are the right mechanism for shared setup. Avoid global `beforeAll` hooks that create hidden coupling.

```typescript
// tests/fixtures.ts
import { test as base, Page } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

type AppFixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
};

export const test = base.extend<AppFixtures>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await use(loginPage);
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
});

export { expect } from '@playwright/test';
```

### Fixture Scope

| Scope | When to Use |
|-------|-------------|
| `'test'` (default) | Per-test isolation; most fixtures |
| `'worker'` | Expensive shared state that is read-only (e.g., fetched config, DB seed data) |

```typescript
// Worker-scoped fixture: runs once per parallel worker
type WorkerFixtures = {
  sharedConfig: Record<string, string>;
};

export const test = base.extend<{}, WorkerFixtures>({
  sharedConfig: [async ({}, use) => {
    const config = await fetchRemoteConfig();
    await use(config);
  }, { scope: 'worker' }],
});
```

### Auth Fixture Using `storageState`

```typescript
// tests/fixtures/auth.ts
import { test as base, BrowserContext } from '@playwright/test';

type AuthFixtures = {
  authenticatedContext: BrowserContext;
};

export const test = base.extend<AuthFixtures>({
  authenticatedContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user.json',
    });
    await use(context);
    await context.close();
  },
});
```

---

## 4. Assertions

### Always Use Web-First Assertions

Web-first assertions accept a `Locator` and retry until the condition is met or the timeout expires. They are the only safe way to assert on dynamic content.

```typescript
// Web-first (CORRECT)
await expect(locator).toBeVisible();
await expect(locator).toBeHidden();
await expect(locator).toHaveText('Expected text');
await expect(locator).toHaveValue('input value');
await expect(locator).toBeEnabled();
await expect(locator).toBeChecked();
await expect(locator).toHaveCount(3);
await expect(locator).toHaveAttribute('aria-expanded', 'true');
await expect(page).toHaveURL(/dashboard/);
await expect(page).toHaveTitle('My App');

// Snapshot (WRONG for dynamic content)
const isVisible = await locator.isVisible();
expect(isVisible).toBe(true);
```

### Soft Assertions

Use soft assertions to collect multiple failures in one test run without stopping at the first failure. Useful for form validation tests or page-state audits.

```typescript
test('form shows all validation errors', async ({ page }) => {
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect.soft(page.getByText('Email is required')).toBeVisible();
  await expect.soft(page.getByText('Password is required')).toBeVisible();
  await expect.soft(page.getByText('Name is required')).toBeVisible();

  // Hard failure at end — test still reports all soft failures above
  expect(test.info().errors).toHaveLength(0);
});
```

### Custom Error Messages

```typescript
await expect(
  page.getByRole('alert'),
  'Expected error banner to appear after invalid login'
).toBeVisible();
```

### Assertion Timeout Override

```typescript
// Override default 5s timeout for slow operations
await expect(page.getByTestId('report-table')).toBeVisible({ timeout: 30_000 });
```

---

## 5. Auth & State Reuse

### The `storageState` Pattern

Re-logging in before every test is the single biggest source of test suite slowness and flakiness. Use Playwright's `storageState` to capture authenticated browser state once and reuse it.

**Step 1: Global setup to acquire auth**

```typescript
// playwright/global-setup.ts
import { chromium, expect, type FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/login`);
  await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.context().storageState({ path: 'playwright/.auth/user.json' });
  await browser.close();
}

export default globalSetup;
```

**Step 2: Config wires it up**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './playwright/global-setup.ts',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    storageState: 'playwright/.auth/user.json',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
```

**Step 3: Tests that need no auth inherit it automatically; tests that need a fresh session opt out**

```typescript
// Unauthenticated test (login page, public routes)
test.use({ storageState: { cookies: [], origins: [] } });

test('login page renders for unauthenticated users', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
```

**Commit `playwright/.auth/` to `.gitignore`.** Never commit auth state files.

---

## 6. Parallelism & Sharding

### Default Parallel Config

```typescript
// playwright.config.ts
export default defineConfig({
  fullyParallel: true,       // run each test file in a separate worker
  workers: process.env.CI ? 4 : undefined,  // limit on CI; auto on local
  retries: process.env.CI ? 2 : 0,
});
```

### Per-Describe Parallelism

```typescript
// Force parallel within a describe block
test.describe.configure({ mode: 'parallel' });

test.describe('Product catalog', () => {
  test('lists products', async ({ page }) => { /* ... */ });
  test('filters by category', async ({ page }) => { /* ... */ });
});
```

### Serial Mode for Dependent Tests

Use `serial` only when tests have unavoidable shared side effects (e.g., testing a stateful wizard).

```typescript
test.describe.configure({ mode: 'serial' });

test.describe('Checkout wizard', () => {
  test('step 1: add to cart', async ({ page }) => { /* ... */ });
  test('step 2: enter shipping', async ({ page }) => { /* ... */ });
  test('step 3: confirm order', async ({ page }) => { /* ... */ });
});
```

### CI Sharding

Split tests across multiple CI runners to cut wall-clock time:

```yaml
# .github/workflows/e2e.yml (sharding strategy)
strategy:
  matrix:
    shard: [1, 2, 3, 4]

steps:
  - run: npx playwright test --shard=${{ matrix.shard }}/4
```

Merge shard reports:

```bash
npx playwright merge-reports --reporter html ./all-blob-reports
```

### Worker Isolation Rules

- Each worker gets its own browser context. Tests do not share DOM, cookies, or localStorage across workers.
- Fixtures with `scope: 'worker'` run once per worker. Ensure they are truly read-only or properly reset.
- Do not write to shared files or databases without coordination (`test.step` locks do not span workers).

---

## 7. Network Interception

### Mocking API Responses

```typescript
test('shows error when API fails', async ({ page }) => {
  await page.route('**/api/users', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' }),
    })
  );

  await page.goto('/users');
  await expect(page.getByRole('alert')).toHaveText(/failed to load/i);
});
```

### Modifying Real Responses

```typescript
await page.route('**/api/feature-flags', async (route) => {
  const response = await route.fetch();
  const json = await response.json();
  json.newFeature = true;
  await route.fulfill({ response, json });
});
```

### Aborting Requests (Analytics, Tracking)

```typescript
await page.route('**/*analytics*', (route) => route.abort());
await page.route('**/*sentry*', (route) => route.abort());
```

### When to Mock vs. Real Backend

| Scenario | Recommendation |
|----------|----------------|
| Unit-like component tests | Mock the API |
| Critical user journeys | Real backend (staging env) |
| Error states / edge cases | Mock (hard to reproduce reliably) |
| Rate-limited third-party APIs | Always mock |
| Auth flows | Real backend with test credentials |

### Waiting for Network Requests

```typescript
const [request] = await Promise.all([
  page.waitForRequest('**/api/submit'),
  page.getByRole('button', { name: 'Submit' }).click(),
]);

expect(request.method()).toBe('POST');
expect(request.postDataJSON()).toMatchObject({ name: 'Alice' });
```

---

## 8. Visual Regression

### Basic Screenshot Assertion

```typescript
test('dashboard matches snapshot', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveScreenshot('dashboard.png');
});
```

### Component-Level Screenshot

```typescript
await expect(page.getByTestId('chart-widget')).toHaveScreenshot('chart.png', {
  maxDiffPixelRatio: 0.01,  // allow 1% pixel difference
});
```

### Config Options

```typescript
// playwright.config.ts
export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,        // per-pixel color tolerance (0–1)
      animations: 'disabled', // freeze CSS animations
    },
  },
});
```

### Updating Snapshots

```bash
# Update all snapshots
npx playwright test --update-snapshots

# Update snapshots for a specific test
npx playwright test login.spec.ts --update-snapshots
```

### CI vs. Local Snapshots

Snapshots are OS/browser/font-rendering dependent. **Always generate reference snapshots on the same environment that CI uses** (typically Linux inside Docker). Commit CI-generated snapshots; never commit macOS or Windows snapshots as the source of truth.

```bash
# Generate snapshots in the same Docker image CI uses
docker run --rm -v $(pwd):/work -w /work mcr.microsoft.com/playwright:v1.49.0-jammy \
  npx playwright test --update-snapshots
```

---

## 9. Debugging

### PWDEBUG and Inspector

```bash
# Opens Playwright Inspector with step-by-step execution
PWDEBUG=1 npx playwright test login.spec.ts

# Run in headed mode (no Inspector)
npx playwright test --headed

# Debug a specific test
npx playwright test --debug login.spec.ts
```

### Pause in Test Code

```typescript
test('debug this', async ({ page }) => {
  await page.goto('/dashboard');
  await page.pause();  // Opens Inspector at this point; remove before committing
  await page.getByRole('button').click();
});
```

### Trace Viewer

Traces capture screenshots, network, console, and DOM snapshots for every action.

```typescript
// playwright.config.ts
use: {
  trace: 'on-first-retry',   // capture trace only when a test retries
  // Options: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry'
  video: 'retain-on-failure',
  screenshot: 'only-on-failure',
},
```

```bash
# View a trace file
npx playwright show-trace test-results/my-test/trace.zip
```

### Headed Mode on CI (for one-off debugging)

```bash
# On CI machines with a virtual display (Xvfb)
DISPLAY=:99 npx playwright test --headed --timeout=60000
```

### Console and Network Logging in Tests

```typescript
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('PAGE ERROR:', msg.text());
});

page.on('requestfailed', (req) => {
  console.error('FAILED REQUEST:', req.url(), req.failure()?.errorText);
});
```

---

## 10. Flakiness Prevention

### Root Causes of Flaky Tests

| Cause | Fix |
|-------|-----|
| Timing: asserting before render completes | Use web-first assertions; never `waitForTimeout` |
| Network: variable API response times | Mock slow endpoints or increase assertion timeout |
| State leak: test depends on prior test | Enforce full isolation in `beforeEach` |
| Animation: snapshot taken mid-transition | Disable animations in config |
| Race condition: two async ops not awaited | Always `await` every Playwright action |
| Port conflicts: multiple test servers | Use random ports; configure `webServer` properly |

### Auto-Waiting Is Your Friend

Playwright auto-waits for elements to be actionable before clicks, fills, and most interactions. Trust it.

```typescript
// Playwright waits for button to be: attached, visible, stable, enabled, not obscured
await page.getByRole('button', { name: 'Save' }).click();

// No need for:
await page.waitForSelector('button:has-text("Save")');  // redundant
await page.locator('button').waitFor({ state: 'visible' });  // usually redundant
```

### Retry Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,  // retry only in CI
  timeout: 30_000,                   // per-test timeout
  expect: { timeout: 10_000 },       // per-assertion timeout
});
```

### Test Isolation Pattern

```typescript
test.beforeEach(async ({ page }) => {
  // Reset to a known state before every test
  await page.goto('/');
  // If using a real DB: call a reset API endpoint
  await page.request.post('/api/test/reset');
});
```

### Never Use `waitForTimeout`

`waitForTimeout` is a fixed sleep. It either waits too long (slow CI) or not long enough (slow network). Replace with:

```typescript
// Instead of: await page.waitForTimeout(2000);
await expect(page.getByRole('status')).toHaveText('Ready');  // polls until true

// Instead of: await page.waitForTimeout(500); // let animation finish
// Configure: animations: 'disabled' in screenshot options
// Or: await page.waitForFunction(() => !document.querySelector('.loading'));
```

### Identify Flaky Tests Early

```bash
# Run a test 10 times to surface intermittent failures
npx playwright test login.spec.ts --repeat-each=10
```

---

## 11. CI Integration

### GitHub Actions Example

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run Playwright tests
        run: npx playwright test
        env:
          BASE_URL: ${{ vars.STAGING_URL }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}

      - name: Upload test artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            test-results/
          retention-days: 14
```

### Reporters

```typescript
// playwright.config.ts
export default defineConfig({
  reporter: process.env.CI
    ? [
        ['junit', { outputFile: 'test-results/results.xml' }],
        ['html', { open: 'never' }],
        ['blob'],  // for shard merge
      ]
    : [['html', { open: 'on-failure' }]],
});
```

### Sharded CI with Report Merge

```yaml
# Full sharded workflow
jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}/4 --reporter=blob
      - uses: actions/upload-artifact@v4
        with:
          name: blob-report-${{ matrix.shard }}
          path: blob-report/

  merge-reports:
    needs: [test]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: all-blob-reports
          pattern: blob-report-*
          merge-multiple: true
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

### JUnit Integration (for test result visibility in GitHub/GitLab)

```bash
# Parse junit output for PR annotations
npx playwright test --reporter=junit > test-results/junit.xml
```

### Caching Playwright Browsers

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    restore-keys: playwright-${{ runner.os }}-

- name: Install Playwright (skip download if cached)
  run: npx playwright install --with-deps chromium
```

---

## Quick Reference

| Task | Best Approach |
|------|--------------|
| Find a button | `getByRole('button', { name: '...' })` |
| Fill a form field | `getByLabel('...')` |
| Assert text on screen | `await expect(locator).toHaveText('...')` |
| Assert navigation | `await expect(page).toHaveURL(/\/route$/)` plus a destination-content assertion |
| Reuse login state | `storageState` in config |
| Share setup across tests | Playwright fixtures |
| Debug a failing test | `PWDEBUG=1 npx playwright test` |
| View failure trace | `npx playwright show-trace trace.zip` |
| Prevent flakiness | Web-first assertions + test isolation |
| Speed up CI | `fullyParallel: true` + sharding |
