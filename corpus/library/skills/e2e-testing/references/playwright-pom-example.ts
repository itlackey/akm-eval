/**
 * pom/login.page.ts + pom/dashboard.page.ts + tests/login.spec.ts
 *
 * Reference file demonstrating the Page Object Model (POM) pattern for
 * Playwright + TypeScript in a single annotated file.
 *
 * WHY use POM?
 *   - Selectors are defined once; a UI change requires one edit, not a grep.
 *   - Tests read like user stories (loginPage.fillCredentials / submit) rather
 *     than imperative selector chains.
 *   - Shared helper logic (waitForLoad, assertPageTitle) lives in the POM, not
 *     duplicated across tests.
 *
 * File layout in a real project:
 *   e2e/
 *     pom/
 *       login.page.ts       ← LoginPage class
 *       dashboard.page.ts   ← DashboardPage class
 *     tests/
 *       login.spec.ts       ← Tests that import both POMs
 */

import { type Page, type Locator, expect } from "@playwright/test";

// ===========================================================================
// LoginPage POM
// ===========================================================================

/**
 * LoginPage encapsulates all interactions with the /login route.
 *
 * WHY: Keeping selectors private prevents test files from bypassing the POM
 * and reaching into the DOM directly, which would defeat the purpose of the
 * abstraction.
 */
export class LoginPage {
  /** WHY: Hold a reference to the Playwright Page so every method can use it
   *  without needing it passed as a parameter. */
  readonly page: Page;

  // -------------------------------------------------------------------------
  // Locators
  // -------------------------------------------------------------------------

  /**
   * WHY: Declare locators as readonly Locator properties rather than calling
   * page.locator() inside each method. This means:
   *   - Playwright re-queries the DOM lazily on each interaction (no stale
   *     element references — unlike WebDriver).
   *   - The selector lives in one place; grep for the property name to find
   *     every usage.
   *   - TypeScript will warn if a method references a locator that was never
   *     declared.
   */
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;

    /**
     * WHY: Prefer role-based and label-based selectors over CSS/XPath.
     * - They mirror how screen readers and assistive technology see the page.
     * - They survive CSS refactors and class renames.
     * - They break when accessibility is accidentally removed (useful signal).
     */
    this.emailInput = page.getByRole("textbox", { name: /email/i });
    this.passwordInput = page.getByRole("textbox", { name: /password/i });
    this.submitButton = page.getByRole("button", { name: /sign in|log in/i });

    /**
     * WHY: data-testid is the escape hatch for elements that have no natural
     * ARIA role or label (e.g. custom error banners). Prefix with the component
     * name to avoid collisions across pages.
     */
    this.errorMessage = page.getByTestId("login-error-message");
    this.rememberMeCheckbox = page.getByRole("checkbox", { name: /remember me/i });
    this.forgotPasswordLink = page.getByRole("link", { name: /forgot.*password/i });
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  /**
   * goto() navigates to the login page and waits for it to be ready.
   *
   * WHY: Encapsulating the URL and load-wait here means tests don't need to
   * know the route structure. If /login moves to /auth/login, only this method
   * changes.
   *
   * WHY waitUntil: 'networkidle'? Login pages often load slowly due to
   * third-party auth SDKs. networkidle ensures those scripts have finished
   * before the test tries to interact with the form.
   * Note: For SPAs consider 'domcontentloaded' + a form-visible assertion
   * instead — networkidle can time out if analytics beacons fire continuously.
   */
  async goto(): Promise<void> {
    await this.page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(this.submitButton).toBeVisible();
  }

  // -------------------------------------------------------------------------
  // Interactions
  // -------------------------------------------------------------------------

  /**
   * fillCredentials() types email and password into their respective inputs.
   *
   * WHY: Separating fill from submit allows tests to inspect intermediate
   * state (e.g. "submit button is disabled until both fields are filled").
   */
  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  /**
   * submit() clicks the sign-in button and waits for navigation to complete.
   *
   * WHY: Promise.all with click + waitForURL ensures the test does not proceed
   * until the browser has actually navigated away. Clicking without awaiting
   * navigation is a common source of race-condition flakiness.
   */
  async submit(): Promise<void> {
    await Promise.all([
      this.page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15_000,
      }),
      this.submitButton.click(),
    ]);
  }

  /**
   * submitExpectingError() clicks sign-in when the form is expected to fail.
   *
   * WHY: Separate from submit() because on failure there is no navigation to
   * wait for. Waiting for navigation would time out and obscure the real
   * assertion failure.
   */
  async submitExpectingError(): Promise<void> {
    await this.submitButton.click();
    await expect(this.errorMessage).toBeVisible({ timeout: 5_000 });
  }

  // -------------------------------------------------------------------------
  // Assertions (optional helpers — keeps test files concise)
  // -------------------------------------------------------------------------

  /**
   * getErrorMessage() returns the visible error text for assertion in tests.
   *
   * WHY: Returning the string (not a Locator) keeps test assertions readable:
   *   expect(await loginPage.getErrorMessage()).toContain('Invalid credentials')
   * rather than:
   *   await expect(loginPage.errorMessage).toContainText('...')
   * Both are valid — pick one style and be consistent across the project.
   */
  async getErrorMessage(): Promise<string> {
    return this.errorMessage.innerText();
  }

  /**
   * login() is a high-level helper that combines fill + submit.
   *
   * WHY: Most tests that use LoginPage just want to arrive at a post-login
   * state. Providing a one-liner reduces boilerplate. Tests that need to verify
   * intermediate form state call fillCredentials() / submit() separately.
   */
  async login(email: string, password: string): Promise<void> {
    await this.fillCredentials(email, password);
    await this.submit();
  }
}

// ===========================================================================
// DashboardPage POM
// ===========================================================================

/**
 * DashboardPage encapsulates the main authenticated landing page.
 *
 * WHY: Even simple pages benefit from a POM — if the page is later replaced
 * by a different route or component, tests that used DashboardPage only need
 * the POM updated, not each individual test.
 */
export class DashboardPage {
  readonly page: Page;

  // Locators
  readonly heading: Locator;
  readonly userMenu: Locator;
  readonly logoutMenuItem: Locator;
  readonly notificationBell: Locator;
  readonly newProjectButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", { name: /dashboard/i, level: 1 });
    this.userMenu = page.getByRole("button", { name: /user menu|account/i });
    this.logoutMenuItem = page.getByRole("menuitem", { name: /log out|sign out/i });
    this.notificationBell = page.getByRole("button", { name: /notifications/i });
    this.newProjectButton = page.getByRole("button", { name: /new project/i });
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  async goto(): Promise<void> {
    await this.page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(this.heading).toBeVisible();
  }

  /**
   * waitForLoad() asserts that the dashboard has finished loading.
   *
   * WHY: Useful after login() redirects — the calling test should call this
   * before interacting with dashboard elements to avoid flakiness on slow CI.
   */
  async waitForLoad(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 10_000 });
    /**
     * WHY: Waiting for the loading spinner to disappear (rather than an element
     * to appear) is more reliable for pages that show skeleton screens.
     */
    await expect(this.page.getByTestId("page-loading-spinner")).toBeHidden({ timeout: 10_000 });
  }

  // -------------------------------------------------------------------------
  // Interactions
  // -------------------------------------------------------------------------

  async logout(): Promise<void> {
    await this.userMenu.click();
    await expect(this.logoutMenuItem).toBeVisible();
    await Promise.all([
      this.page.waitForURL(/\/(login|$)/),
      this.logoutMenuItem.click(),
    ]);
  }

  async clickNewProject(): Promise<void> {
    await this.newProjectButton.click();
  }

  // -------------------------------------------------------------------------
  // Assertions
  // -------------------------------------------------------------------------

  async assertWelcomeMessage(username: string): Promise<void> {
    /**
     * WHY: Using a regex allows the message to read "Welcome back, Alice!" or
     * "Hello, Alice" without breaking the assertion.
     */
    await expect(
      this.page.getByText(new RegExp(username, "i"))
    ).toBeVisible();
  }
}

// ===========================================================================
// Test file: login.spec.ts
// ===========================================================================

/**
 * WHY: Tests are written in terms of user intent ("admin can log in") not
 * implementation details ("fill #email-input and click .btn-primary").
 * This makes the suite resilient to UI redesigns and readable as documentation.
 */

import { test } from "@playwright/test";

/**
 * WHY: Group related tests with describe() so the HTML report and JUnit output
 * group failures meaningfully and retries target only the affected group.
 */
test.describe("Login page", () => {
  /**
   * WHY: beforeEach navigates to the login page so every test starts from a
   * clean state. Shared state between tests is the #1 source of test
   * interdependency bugs.
   */
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test("shows the login form", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test("valid credentials redirect to dashboard", async ({ page }) => {
    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    /**
     * WHY: Read credentials from environment variables — never hardcode them
     * in test files. The CI pipeline sets these secrets; locally developers
     * use a .env.test file (gitignored).
     */
    await loginPage.login(
      process.env.TEST_ADMIN_EMAIL ?? "admin@example.com",
      process.env.TEST_ADMIN_PASSWORD ?? "password"
    );

    /**
     * WHY: Assert on a DashboardPage locator rather than a raw URL check.
     * This verifies both routing AND that the page rendered correctly.
     */
    await dashboardPage.waitForLoad();
    await expect(dashboardPage.heading).toBeVisible();
  });

  test("invalid credentials show error message", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.fillCredentials("wrong@example.com", "badpassword");
    await loginPage.submitExpectingError();

    const errorText = await loginPage.getErrorMessage();
    /**
     * WHY: Assert on the semantic meaning, not exact copy. "Invalid credentials"
     * and "Email or password is incorrect" both satisfy this check, so the test
     * survives copy changes.
     */
    expect(errorText.toLowerCase()).toMatch(/invalid|incorrect|wrong/);
  });

  test("empty form submission shows validation errors", async ({ page }) => {
    const loginPage = new LoginPage(page);

    /**
     * WHY: Click without filling to trigger HTML5 required-field validation.
     * Use submitExpectingError() since no navigation occurs.
     */
    await loginPage.submitButton.click();

    /**
     * WHY: Browser native validation prevents form submission and focuses the
     * first invalid field. Assert on the input being focused as a proxy for
     * the validation triggering correctly.
     */
    await expect(loginPage.emailInput).toBeFocused();
  });

  test("forgot password link is present and navigates correctly", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.forgotPasswordLink.click();
    await expect(page).toHaveURL(/forgot-password|reset-password/);
  });
});

test.describe("Dashboard page (authenticated)", () => {
  /**
   * WHY: Use storageState to skip login for tests that are NOT testing the
   * login flow itself. This makes the suite ~5× faster and eliminates an
   * entire class of flakiness (login page slowness affecting unrelated tests).
   *
   * In a real project this is handled by the auth fixture in auth.fixture.ts;
   * shown inline here for clarity.
   */
  test.use({ storageState: ".auth/admin.json" });

  test("dashboard heading is visible after direct navigation", async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
    await expect(dashboardPage.heading).toBeVisible();
  });

  test("user can log out from dashboard", async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
    await dashboardPage.logout();

    /**
     * WHY: After logout the user should land on / or /login. Assert on both
     * with a regex to handle redirects that include a ?next= query param.
     */
    await expect(page).toHaveURL(/\/(login|$)/);
  });
});
