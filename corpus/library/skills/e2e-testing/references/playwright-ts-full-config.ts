/**
 * playwright.config.ts — Production-grade Playwright configuration
 *
 * Reference file for enterprise web application E2E testing.
 * Copy to your project root and adjust values to match your stack.
 *
 * Key decisions documented inline with WHY comments.
 */

import { defineConfig, devices } from "@playwright/test";
import * as path from "path";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

/**
 * WHY: Never hardcode the base URL. CI pipelines, staging environments, and
 * local dev all run on different ports/hostnames. Read from env so a single
 * config file works everywhere without modification.
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * WHY: Standard CI detection used by GitHub Actions, GitLab CI, CircleCI,
 * Jenkins etc. Drives retry count, reporter selection, and worker concurrency.
 */
const IS_CI = !!process.env.CI;

// ---------------------------------------------------------------------------
// Auth storage paths
// ---------------------------------------------------------------------------

/**
 * WHY: Store auth state as JSON files alongside tests so they are easy to
 * gitignore and regenerate. One file per role keeps multi-role tests isolated.
 * These paths are consumed both by the setup project and by test projects.
 */
export const STORAGE_STATE = {
  admin: path.join(__dirname, ".auth", "admin.json"),
  member: path.join(__dirname, ".auth", "member.json"),
  guest: path.join(__dirname, ".auth", "guest.json"),
};

// ---------------------------------------------------------------------------
// Main config
// ---------------------------------------------------------------------------

export default defineConfig({
  /**
   * WHY: Root directory for test discovery. Keep tests co-located with source
   * or in a dedicated /e2e folder — both work; just be consistent.
   */
  testDir: "./e2e",

  /**
   * WHY: Match both .spec.ts and .test.ts naming conventions so the project
   * can adopt either without renaming files or changing this glob.
   */
  testMatch: "**/*.{spec,test}.ts",

  /**
   * WHY: Explicitly ignore node_modules (Playwright does this by default but
   * being explicit prevents accidental inclusion after monorepo refactors).
   */
  testIgnore: ["**/node_modules/**", "**/.auth/**"],

  // -------------------------------------------------------------------------
  // Parallelism
  // -------------------------------------------------------------------------

  /**
   * WHY: Run test files in parallel by default. Individual tests within a file
   * run sequentially unless you opt into parallelism at the file level with
   * test.describe.configure({ mode: 'parallel' }).
   * Disable for tests that share mutable server state (e.g. DB seed tests).
   */
  fullyParallel: true,

  /**
   * WHY: Fail fast in CI when a flaky test is detected. This prevents a broken
   * commit from burning the entire CI slot. Set to false locally so developers
   * can see all failures in one run.
   */
  forbidOnly: IS_CI,

  // -------------------------------------------------------------------------
  // Retries
  // -------------------------------------------------------------------------

  /**
   * WHY: Zero retries locally surfaces flakiness immediately — developers
   * should not need to re-run to get a green result. Two retries in CI
   * absorbs genuine infrastructure flakiness (network blips, slow containers)
   * without masking real failures.
   */
  retries: IS_CI ? 2 : 0,

  // -------------------------------------------------------------------------
  // Workers
  // -------------------------------------------------------------------------

  /**
   * WHY: In CI, limit workers to avoid overloading the container. Locally,
   * undefined lets Playwright auto-detect (typically half the CPU cores).
   * Override with PLAYWRIGHT_WORKERS env var for ad-hoc tuning.
   */
  workers: IS_CI ? 2 : process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : undefined,

  // -------------------------------------------------------------------------
  // Reporters
  // -------------------------------------------------------------------------

  /**
   * WHY: Use a reporter array to emit multiple formats simultaneously.
   * - list:  human-readable terminal output (always)
   * - html:  browsable report with traces/screenshots (always; open with
   *          `npx playwright show-report`)
   * - junit: consumed by CI platforms (GitHub Actions, Jenkins) for test
   *          summary widgets; only generated in CI to avoid local noise
   * - json:  machine-readable for dashboards / trend tracking; CI only
   */
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ...(IS_CI
      ? ([
          ["junit", { outputFile: "test-results/junit.xml" }],
          ["json", { outputFile: "test-results/results.json" }],
        ] as const)
      : []),
  ],

  // -------------------------------------------------------------------------
  // Artifacts output
  // -------------------------------------------------------------------------

  /**
   * WHY: Keep artifacts in a dedicated directory that is gitignored.
   * Separate from the reporter output so cleanup scripts can target it.
   */
  outputDir: "test-results",

  // -------------------------------------------------------------------------
  // Shared test options (used by all projects unless overridden)
  // -------------------------------------------------------------------------

  use: {
    /**
     * WHY: Centralising baseURL means tests write `await page.goto('/')` instead
     * of hardcoding full URLs. Changing environments requires only the env var.
     */
    baseURL: BASE_URL,

    // -----------------------------------------------------------------------
    // Timeouts
    // -----------------------------------------------------------------------

    /**
     * WHY: 15 s action timeout (click, fill, etc.) catches slow renders without
     * making tests feel sluggish. Most interactions should complete in < 2 s;
     * 15 s provides headroom for CI container cold starts and lazy-loaded UI.
     */
    actionTimeout: 15_000,

    /**
     * WHY: 30 s navigation timeout matches the default browser navigation timeout
     * and covers slow SSR pages on under-powered CI runners.
     */
    navigationTimeout: 30_000,

    /**
     * WHY: 10 s for `expect` assertions gives async state updates time to settle
     * while still catching genuinely broken states within a reasonable window.
     */
    // Note: expect timeout lives at the top-level expect block below.

    // -----------------------------------------------------------------------
    // Capture on failure
    // -----------------------------------------------------------------------

    /**
     * WHY: Screenshots on failure are the single most valuable debugging artefact.
     * "only-on-failure" keeps the test-results directory clean on green runs.
     */
    screenshot: "only-on-failure",

    /**
     * WHY: Video on failure is expensive (large files, ffmpeg overhead) but
     * invaluable for timing-sensitive bugs that screenshots miss. "retain-on-failure"
     * means passing tests don't accumulate gigabytes of video.
     */
    video: "retain-on-failure",

    /**
     * WHY: Traces capture DOM snapshots, network logs, and action timeline.
     * "on-first-retry" gives you a trace for the first re-run of a flaky test
     * without recording every passing test (which would be very slow).
     */
    trace: "on-first-retry",

    // -----------------------------------------------------------------------
    // Misc
    // -----------------------------------------------------------------------

    /**
     * WHY: Ignore HTTPS cert errors in local/staging environments where
     * self-signed certs are common. Never do this in production smoke tests.
     */
    ignoreHTTPSErrors: !IS_CI,

    /**
     * WHY: Locale and timezone make date/currency assertions deterministic
     * regardless of where CI runs.
     */
    locale: "en-US",
    timezoneId: "America/New_York",
  },

  // -------------------------------------------------------------------------
  // Top-level timeouts
  // -------------------------------------------------------------------------

  /**
   * WHY: 30 s per test keeps the suite fast and surfaces runaway tests early.
   * Individual slow tests can override with test.slow() (3×) or test.setTimeout().
   */
  timeout: 30_000,

  /**
   * WHY: Global expect timeout applies to all expect(...).toHaveXxx() calls.
   * Keeping it shorter than the action timeout ensures assertion failures are
   * reported quickly once the action has completed.
   */
  expect: {
    timeout: 10_000,
  },

  // -------------------------------------------------------------------------
  // Global setup / teardown
  // -------------------------------------------------------------------------

  /**
   * WHY: Global setup runs once before all tests in the suite — ideal for:
   *   - Seeding the test database
   *   - Generating auth tokens stored as .auth/*.json (see projects below)
   *   - Starting external mock servers
   * Global teardown runs once after all tests — ideal for cleanup.
   */
  globalSetup: require.resolve("./e2e/global-setup.ts"),
  globalTeardown: require.resolve("./e2e/global-teardown.ts"),

  // -------------------------------------------------------------------------
  // Web server
  // -------------------------------------------------------------------------

  /**
   * WHY: Playwright can start (and stop) your dev server automatically.
   * This eliminates the manual "npm run dev & npx playwright test" dance and
   * ensures every CI run starts from a clean server state.
   * Set reuseExistingServer: true locally so fast re-runs skip the startup.
   */
  webServer: {
    command: process.env.WEB_SERVER_CMD ?? "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !IS_CI,
    /**
     * WHY: 120 s startup timeout accommodates slow TypeScript compilation or
     * database migration on first boot.
     */
    timeout: 120_000,
    /**
     * WHY: Pipe server stdout/stderr to Playwright's output so build errors
     * appear inline in the test log rather than silently swallowing them.
     */
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NODE_ENV: "test",
    },
  },

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  /**
   * WHY: Projects separate concerns:
   *   1. "setup" acquires auth state and saves it to disk — runs once before
   *      any browser project.
   *   2. Browser projects declare a dependency on setup so they receive fresh
   *      cookies/localStorage without repeating the login flow in every test.
   *   3. Mobile projects verify responsive layouts using real device emulation
   *      rather than CSS media-query overrides.
   */
  projects: [
    // -----------------------------------------------------------------------
    // Auth setup project
    // -----------------------------------------------------------------------

    {
      name: "setup",
      /**
       * WHY: Only run files that match the setup glob so that normal test files
       * are never accidentally executed during the setup phase.
       */
      testMatch: "**/auth.setup.ts",
      /**
       * WHY: Setup runs in a plain Chromium context — no need for cross-browser
       * coverage here since we only care about obtaining auth tokens.
       */
      use: { ...devices["Desktop Chrome"] },
    },

    // -----------------------------------------------------------------------
    // Desktop browsers
    // -----------------------------------------------------------------------

    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        /**
         * WHY: Re-use the saved admin session so tests start already logged in.
         * The storageState is a JSON file with cookies + localStorage; Playwright
         * injects it into a new browser context before each test.
         */
        storageState: STORAGE_STATE.admin,
      },
      /**
       * WHY: Depend on setup so that Playwright runs the auth project first.
       * Without this dependency the .auth/*.json files may not exist when tests
       * try to read them.
       */
      dependencies: ["setup"],
      /**
       * WHY: Exclude the setup file from browser projects to avoid running it
       * twice.
       */
      testIgnore: "**/auth.setup.ts",
    },

    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        storageState: STORAGE_STATE.admin,
      },
      dependencies: ["setup"],
      testIgnore: "**/auth.setup.ts",
    },

    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: STORAGE_STATE.admin,
      },
      dependencies: ["setup"],
      testIgnore: "**/auth.setup.ts",
    },

    // -----------------------------------------------------------------------
    // Mobile browsers
    // -----------------------------------------------------------------------

    /**
     * WHY: Mobile projects use real device descriptors from Playwright's device
     * registry (screen size, user-agent, touch emulation, device pixel ratio).
     * This catches responsive-layout regressions that pure CSS media-query tests
     * miss.
     */
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        storageState: STORAGE_STATE.admin,
      },
      dependencies: ["setup"],
      testIgnore: "**/auth.setup.ts",
    },

    {
      name: "mobile-safari",
      use: {
        ...devices["iPhone 14"],
        storageState: STORAGE_STATE.admin,
      },
      dependencies: ["setup"],
      testIgnore: "**/auth.setup.ts",
    },

    // -----------------------------------------------------------------------
    // Optional: member-role project
    // -----------------------------------------------------------------------

    /**
     * WHY: If your application has multiple user roles with distinct permissions,
     * run a subset of tests under a member (non-admin) session to verify that
     * role-based access controls work correctly without logging in per-test.
     */
    {
      name: "chromium-member",
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE.member,
      },
      dependencies: ["setup"],
      /**
       * WHY: Only run tests that explicitly test member-role behaviour to keep
       * the suite fast. Tag them with @member in the test title and use this
       * grep to include them.
       */
      grep: /@member/,
      testIgnore: "**/auth.setup.ts",
    },
  ],
});
