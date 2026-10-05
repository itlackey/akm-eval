/**
 * fixtures/auth.fixture.ts — Reusable auth fixtures for Playwright tests
 *
 * Reference file demonstrating:
 *  - Worker-scoped fixtures for expensive browser contexts (one auth per worker)
 *  - storageState reuse pattern so tests skip the login UI entirely
 *  - Typed fixture interface with TypeScript generics
 *  - Proper teardown to release resources
 *
 * Usage:
 *   import { test, expect } from '../fixtures/auth.fixture';
 *   // No login needed — the page fixture arrives pre-authenticated.
 */

import { test as base, expect, type Page, type BrowserContext } from "@playwright/test";
import { LoginPage } from "./playwright-pom-example";
import { STORAGE_STATE } from "../playwright.config";

// ---------------------------------------------------------------------------
// Fixture type definitions
// ---------------------------------------------------------------------------

/**
 * WHY: Declaring fixture types explicitly gives TypeScript autocomplete and
 * catches mismatches between fixture definitions and test usage at compile
 * time rather than at runtime.
 */
export interface MyFixtures {
  /** A Page that is already authenticated as admin via storageState. */
  adminPage: Page;

  /** A Page that is already authenticated as a member-role user. */
  memberPage: Page;

  /**
   * WHY: Worker-scoped contexts are created once per worker process and
   * shared across all tests in that worker. Use for expensive setup like
   * OAuth flows that require real browser interaction (not just cookie injection).
   */
  adminContext: BrowserContext;
}

// ---------------------------------------------------------------------------
// Extended test object
// ---------------------------------------------------------------------------

/**
 * WHY: Extending `base` (from @playwright/test) rather than creating a new
 * Test instance means all built-in fixtures (page, browser, context, etc.)
 * remain available. Tests import `test` from this file instead of from
 * @playwright/test and gain the custom fixtures transparently.
 */
export const test = base.extend<MyFixtures>({
  // -------------------------------------------------------------------------
  // Worker-scoped admin context
  // -------------------------------------------------------------------------

  /**
   * WHY: Worker scope means one authenticated BrowserContext is created per
   * worker process, not per test. This amortises the login cost when a worker
   * runs many tests sequentially.
   *
   * The context is initialised from the storageState JSON file written by the
   * auth.setup.ts project so no real login happens here — just cookie injection.
   *
   * Teardown: the fixture closes the context after the last test in the worker
   * finishes, preventing resource leaks.
   */
  adminContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext({
        storageState: STORAGE_STATE.admin,
      });

      await use(context);

      // WHY: Always close explicitly — relying on process exit to free browser
      // contexts can leave zombie processes in CI.
      await context.close();
    },
    { scope: "worker" },
  ],

  // -------------------------------------------------------------------------
  // Test-scoped admin page
  // -------------------------------------------------------------------------

  /**
   * WHY: Test scope (default) means a fresh page is created for every test
   * from the shared worker context. This gives test isolation (no DOM state
   * leaks) while still sharing the expensive authentication.
   */
  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();

    await use(page);

    // WHY: Close the page so its network connections and JS timers are torn
    // down before the next test starts, avoiding interference.
    await page.close();
  },

  // -------------------------------------------------------------------------
  // Test-scoped member page (performs a fresh login)
  // -------------------------------------------------------------------------

  /**
   * WHY: If storageState is not pre-generated for the member role, fall back
   * to a full login flow here. This pattern is useful during initial project
   * setup before you have a CI step that regenerates auth fixtures.
   *
   * Once the member storageState file exists, swap this for the same pattern
   * as adminContext above for better performance.
   */
  memberPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: STORAGE_STATE.member,
    });

    const page = await context.newPage();

    await use(page);

    await page.close();
    await context.close();
  },
});

// Re-export expect so test files only need one import.
export { expect };

// ---------------------------------------------------------------------------
// Auth setup file (auth.setup.ts)
// ---------------------------------------------------------------------------

/**
 * This section documents the companion auth.setup.ts file that GENERATES the
 * storageState files consumed above. It lives in e2e/auth.setup.ts and is run
 * by the "setup" project in playwright.config.ts before any browser project.
 *
 * WHY: Centralising auth acquisition here means:
 *   - Login credentials are never scattered across individual test files.
 *   - A single failure in this file surfaces immediately before wasting time
 *     running 300 tests that would all fail on login.
 *   - Rotating credentials requires editing one file.
 */

/**
 * Example auth.setup.ts content (shown as a comment to keep this file
 * importable as a module):
 *
 * ```typescript
 * import { test as setup, expect } from '@playwright/test';
 * import { STORAGE_STATE } from '../playwright.config';
 * import { LoginPage } from './pom/login.page';
 * import * as fs from 'fs';
 * import * as path from 'path';
 *
 * // WHY: Ensure the .auth directory exists before writing JSON files.
 * // Using mkdirSync with recursive: true is idempotent — safe to call every run.
 * setup.beforeAll(async () => {
 *   fs.mkdirSync(path.dirname(STORAGE_STATE.admin), { recursive: true });
 * });
 *
 * setup('acquire admin auth state', async ({ page }) => {
 *   const loginPage = new LoginPage(page);
 *   await loginPage.goto();
 *   await loginPage.fillCredentials(
 *     process.env.ADMIN_EMAIL!,
 *     process.env.ADMIN_PASSWORD!
 *   );
 *   await loginPage.submit();
 *
 *   // WHY: Wait for a landmark that only exists for authenticated users so we
 *   // know the session is fully established before saving storageState.
 *   await expect(page.getByRole('navigation', { name: 'main' })).toBeVisible();
 *
 *   await page.context().storageState({ path: STORAGE_STATE.admin });
 * });
 *
 * setup('acquire member auth state', async ({ page }) => {
 *   const loginPage = new LoginPage(page);
 *   await loginPage.goto();
 *   await loginPage.fillCredentials(
 *     process.env.MEMBER_EMAIL!,
 *     process.env.MEMBER_PASSWORD!
 *   );
 *   await loginPage.submit();
 *
 *   await expect(page.getByRole('navigation', { name: 'main' })).toBeVisible();
 *
 *   await page.context().storageState({ path: STORAGE_STATE.member });
 * });
 * ```
 */

// ---------------------------------------------------------------------------
// Usage example in a test file
// ---------------------------------------------------------------------------

/**
 * Example test that uses the adminPage fixture:
 *
 * ```typescript
 * import { test, expect } from '../fixtures/auth.fixture';
 *
 * test('admin can see user management page', async ({ adminPage }) => {
 *   await adminPage.goto('/admin/users');
 *   await expect(adminPage.getByRole('heading', { name: 'User Management' }))
 *     .toBeVisible();
 * });
 *
 * test('member cannot access admin pages', async ({ memberPage }) => {
 *   await memberPage.goto('/admin/users');
 *   // Should redirect to 403 or dashboard
 *   await expect(memberPage).toHaveURL(/\/(403|dashboard)/);
 * });
 * ```
 */
