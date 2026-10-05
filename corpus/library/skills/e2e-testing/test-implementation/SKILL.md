---
description: Implements runnable, verified `.spec.ts` files for specific
  Playwright test scenarios from the app-exploration inventory.
when_to_use: Use when implementing a specific Playwright test scenario from the
  inventory produced by `skills/e2e-testing/app-exploration`.
updated: 2026-06-18
---

# Playwright Test Implementation

## When to use this skill
Use this skill when implementing a specific Playwright test scenario from the inventory produced by `skills/e2e-testing/app-exploration`. Each invocation targets one scenario spec and produces a runnable, verified `.spec.ts` file.

Do NOT use this skill to discover test scenarios — use `skills/e2e-testing/app-exploration` first to generate the inventory JSON, then invoke this skill once per scenario.

---

## Prerequisites

Before beginning, confirm all of the following:

- `playwright.config.ts` exists in the project root
- A scenario spec object (from the inventory JSON) has been provided — it must include `route`, `scenarioType`, `steps`, and `assertions`
- The app is running locally OR `playwright.config.ts` includes a `webServer` config block that starts it
- You have read `knowledge/playwright/best-practices` — follow every pattern there; this skill references it but does not repeat it

---

## Step 1: Set Up Auth (if needed)

### Check for existing auth setup

```bash
find . -name "auth.setup.ts" -not -path "*/node_modules/*"
```

If found, skip to Step 2. If not found, and the scenario requires authentication, create it now.

### Create auth.setup.ts

Location: `tests/auth.setup.ts`

```typescript
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.playwright/auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.TEST_USER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.TEST_USER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/dashboard');
  await page.context().storageState({ path: authFile });
});
```

Replace selectors with those discovered during app exploration. Never hardcode credentials — use `process.env`.

### Update playwright.config.ts

Add the setup project and wire it as a dependency for authenticated tests:

```typescript
projects: [
  {
    name: 'setup',
    testMatch: /auth\.setup\.ts/,
  },
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      storageState: '.playwright/auth/user.json',
    },
    dependencies: ['setup'],
  },
],
```

Add `.playwright/` to `.gitignore` — it holds session state, not source.

---

## Step 2: Create or Extend a Page Object Model (POM)

### Decision tree

| Condition | Action |
|---|---|
| A POM already exists for this route | Extend it — add missing locators and actions |
| 3 or more tests will use this page | Create a new POM class |
| Single-use interaction | Inline locators in the test — still use semantic selectors |

### POM location convention

`tests/pages/<RouteSlug>Page.ts`

Examples: `DashboardPage.ts`, `CheckoutPage.ts`, `ArticleDetailPage.ts`

### POM template

```typescript
import { type Page, type Locator } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly totalAmount: Locator;
  readonly placeOrderButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Checkout' });
    this.totalAmount = page.getByTestId('order-total');
    this.placeOrderButton = page.getByRole('button', { name: 'Place order' });
  }

  async goto() {
    await this.page.goto('/checkout');
    await this.heading.waitFor();
  }

  async placeOrder() {
    await this.placeOrderButton.click();
  }
}
```

### Selector priority (highest to lowest)

1. `getByRole` — most resilient, accessibility-aligned
2. `getByLabel` — for form fields
3. `getByText` — for unique visible text
4. `getByTestId` — for elements without semantic role (add `data-testid` to the app when needed)
5. CSS selectors — only as a last resort; never use positional or dynamic class selectors

---

## Step 3: Write the Test File

### Naming convention

```
tests/<route-slug>.<scenario-type>.spec.ts
```

Examples:
- `tests/checkout.happy-path.spec.ts`
- `tests/login.error-states.spec.ts`
- `tests/article-detail.accessibility.spec.ts`

### File structure

```typescript
import { test, expect } from '@playwright/test';
import { CheckoutPage } from './pages/CheckoutPage';

test.describe('Checkout — happy path', () => {
  let checkoutPage: CheckoutPage;

  test.beforeEach(async ({ page }) => {
    checkoutPage = new CheckoutPage(page);
    await checkoutPage.goto();
  });

  test('shows order total before submission', async ({ page }) => {
    await expect(checkoutPage.totalAmount).toBeVisible();
    await expect(checkoutPage.totalAmount).not.toBeEmpty();
  });

  test('places order successfully', async ({ page }) => {
    await checkoutPage.placeOrder();
    await expect(page).toHaveURL(/\/order-confirmation/);
    await expect(page.getByRole('heading', { name: /order confirmed/i })).toBeVisible();
  });
});
```

### Mocking with page.route() for error scenarios

Use `page.route()` to intercept network calls and simulate API errors. Always place route handlers before the action that triggers the request.

```typescript
test('shows error banner when API is unavailable', async ({ page }) => {
  await page.route('**/api/orders', (route) =>
    route.fulfill({ status: 503, body: JSON.stringify({ error: 'Service unavailable' }) })
  );

  await checkoutPage.placeOrder();

  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/try again/i);
});
```

### Web-first assertion patterns

Always use Playwright's built-in async assertions — they auto-retry until the condition is met or the timeout expires. Never use `expect(await element.textContent()).toBe(...)`.

```typescript
// Correct — web-first
await expect(page.getByRole('status')).toHaveText('Saved');

// Wrong — point-in-time snapshot, not retried
expect(await page.getByRole('status').textContent()).toBe('Saved');
```

### Auth fixture usage

Tests in the `chromium` project automatically receive the stored auth state from `auth.setup.ts`. For tests that must run unauthenticated, override at the test level:

```typescript
test.use({ storageState: { cookies: [], origins: [] } });

test('redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/login');
});
```

### Responsive test with page.setViewportSize()

```typescript
test('mobile nav collapses to hamburger menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  await expect(page.getByRole('navigation')).not.toBeVisible();
});
```

### Accessibility assertion with @axe-core/playwright

```typescript
import AxeBuilder from '@axe-core/playwright';

test('has no detectable accessibility violations', async ({ page }) => {
  await page.goto('/checkout');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
```

Install if not present: `npm install -D @axe-core/playwright`

---

## Step 4: Run and Verify

### Run the new test file in isolation

```bash
npx playwright test tests/<your-file>.spec.ts --project=chromium
```

### Capture trace on failure for debugging

```bash
npx playwright test tests/<your-file>.spec.ts --trace on
npx playwright show-trace test-results/<run-dir>/trace.zip
```

### Run headed for live debugging

```bash
npx playwright test tests/<your-file>.spec.ts --headed --project=chromium
```

### Open Playwright Inspector

```bash
npx playwright test tests/<your-file>.spec.ts --debug
```

Use Inspector to step through actions, inspect locators, and verify selectors before committing them.

### Verify no regressions in the suite

```bash
npx playwright test --project=chromium
```

All pre-existing tests must still pass before considering this task complete.

---

## Step 5: Self-Review Checklist

Run through every item before marking the test as done.

- [ ] All selectors use `getByRole`, `getByLabel`, `getByText`, or `getByTestId` — no raw CSS or XPath
- [ ] All assertions are web-first (`await expect(...)`) — no `await element.textContent()` in assertions
- [ ] No `waitForTimeout` or `page.waitForTimeout` anywhere in the file
- [ ] Auth state is handled via fixture or explicit `test.use` override — no manual login steps in test body
- [ ] Error scenarios use `page.route()` mocks — no dependency on a broken backend
- [ ] `beforeEach` navigates to the page; individual tests assert behavior only
- [ ] POM locators are defined once in the constructor — not repeated inline
- [ ] Test file name follows `<route-slug>.<scenario-type>.spec.ts` convention
- [ ] `.playwright/` is in `.gitignore`
- [ ] All tests in the file pass with `--project=chromium`
- [ ] Full suite still passes — no regressions introduced

---

## Common Failure Patterns

| Symptom | Root cause | Fix |
|---|---|---|
| Test timeout on element | Element never appeared in DOM | Check selector with Inspector; use `toBeVisible()` not `isVisible()` |
| `storageState` auth rejected | Saved session expired | Delete `.playwright/auth/user.json` and re-run `npx playwright test --project=setup` |
| Flaky test (passes/fails randomly) | Race condition or timing assumption | Remove `waitForTimeout`; replace with a web-first assertion on the element that signals readiness |
| Element not found | Selector matches nothing | Open headed mode or Inspector; verify selector against actual DOM structure |
| `page.route` not intercepting | URL pattern mismatch | Log `request.url()` in a `page.on('request', ...)` handler to see the actual URL, then fix the glob |
| Accessibility violations unexpected | New element added without ARIA role | Fix in the app (add `role`, `aria-label`, or semantic element); do not suppress axe violations in the test |
| POM method throws on missing locator | Route changed; old locator stale | Update POM locator; run `npx playwright codegen <url>` to regenerate locators |
| CI fails but local passes | Missing env vars or different base URL | Check `process.env.BASE_URL` and `process.env.TEST_USER_*` in CI environment config |

---

## References

- `knowledge/playwright/best-practices` — canonical patterns for this project; this skill supplements, not replaces
- `skills/e2e-testing/app-exploration` — produces the scenario inventory consumed by this skill
- Playwright docs: https://playwright.dev/docs/writing-tests
- axe-core/playwright: https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright
