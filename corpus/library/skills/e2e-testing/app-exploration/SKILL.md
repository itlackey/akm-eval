---
description: Automatically map web application routes, forms, and interactions
  via static code analysis and Playwright browser exploration to generate a
  prioritized JSON inventory of e2e test scenarios.
when_to_use: Use when starting Playwright test creation for a web application
  from scratch, auditing coverage gaps, onboarding to an unfamiliar codebase, or
  after significant refactors.
updated: 2026-06-19
---

# App Exploration for Playwright Test Generation

## When to use this skill

Use this skill when:
- Starting Playwright test creation for a web application from scratch with no existing e2e suite
- Auditing an existing test suite to identify coverage gaps against actual app routes and interactions
- Onboarding to an unfamiliar codebase and needing a complete map of testable surfaces before writing tests
- After a significant refactor or feature addition that may have invalidated existing test coverage

Do NOT use this skill if:
- You already have a complete test-scenarios.json from a prior run and the app has not changed
- The task is to write tests for a single specific component or interaction already identified

---

## Prerequisites

Verify all of the following before proceeding:

1. **Playwright installed** — `npx playwright --version` must succeed. If missing, run `npm install -D @playwright/test`.
2. **Chromium binary** — Run `npx playwright install chromium` if the binary is absent.
3. **App running or startable** — Either the app is already running at a known base URL, or a start command exists (`npm run dev`, `npm start`, `pnpm dev`, etc.). Identify the base URL (default: `http://localhost:3000` or `http://localhost:5173` for Vite projects).
4. **Read access to source** — The agent must be able to read router config files, component files, and API client files in the project.
5. **Write access to output path** — Confirm the output directory exists or can be created before Step 4.

---

## Step 1: Static Code Analysis

Goal: build a complete list of routes and their associated data, forms, and API calls without launching a browser.

### 1a. Detect the frontend framework and locate the router config

Check for the following files in order. Use the first match.

| Framework | Indicator file(s) | Route source |
|---|---|---|
| Next.js App Router | `app/` directory with `page.tsx` or `page.jsx` files | Walk `app/**/page.tsx` — each `page.tsx` path segment is a route |
| Next.js Pages Router | `pages/` directory | Walk `pages/**/*.tsx` — filename maps to route, `[param]` = dynamic segment |
| React Router v6+ | `src/routes.tsx`, `src/router.tsx`, or `createBrowserRouter` call | Read the routes config; extract `path:` values |
| SvelteKit | `src/routes/` directory with `+page.svelte` files | Walk `src/routes/**/+page.svelte` — directory path = route |
| Vue Router | `src/router/index.ts` or `src/router.ts` | Read `routes` array; extract `path:` values |
| Remix | `app/routes/` directory | Walk `app/routes/*.tsx` — filename encodes route (`.` = `/`, `_` = layout) |

Read the router config file (or walk the directory) and produce a flat list:

```json
[
  { "route": "/", "label": "Home" },
  { "route": "/login", "label": "Login" },
  { "route": "/dashboard", "label": "Dashboard" },
  { "route": "/users/:id", "label": "User Detail" },
  ...
]
```

For dynamic segments (`:id`, `[id]`, `$id`), record the pattern and note that a real ID must be substituted during browser exploration.

### 1b. Read component files for each route

For each route, locate the corresponding component or page file. Read it and extract:

- **Form fields**: `<input>`, `<select>`, `<textarea>`, `<Form>`, `react-hook-form` `register()` calls, `zod` schema field names
- **Data displays**: table components, list renders, charts, cards — note what data entity they display
- **Auth guards**: `useAuth`, `ProtectedRoute`, `redirect('/login')`, `getServerSession`, middleware imports
- **Navigation links**: `<Link to=...>`, `<a href=...>`, `router.push(...)` — these reveal routes you may have missed
- **Key user actions**: button labels, submit handler names, mutation calls

Record per-route notes:

```json
route: /login
  forms: [{ "fields": ["email", "password"], "submitLabel": "Sign in", "validation": "zod" }]
  auth_guard: false
  navigation_links: ["/register", "/forgot-password"]
  data_displays: []
  api_calls: ["POST /api/auth/login"]
```

### 1c. Read API client and service files

Locate API client files: `src/lib/api.ts`, `src/services/`, `src/api/`, `src/hooks/use*.ts` with fetch/axios calls. For each, extract:

- HTTP method and endpoint path
- Which route component imports this function
- Whether the call requires auth headers (look for `Authorization`, `Bearer`, cookie checks)

This creates a map of route → API dependencies used later to seed test fixture needs.

---

## Step 2: Framework Detection

Goal: determine where tests live and avoid overwriting existing config.

### 2a. Detect existing test framework

Check in order:

1. `playwright.config.ts` or `playwright.config.js` — Playwright is already configured; read it (see 2b).
2. `vitest.config.ts` with `@playwright/experimental-ct-*` — component testing; separate from e2e.
3. `jest.config.*` — Jest is present; Playwright will coexist, but confirm no namespace collision.
4. No config found — fresh setup; proceed to create `playwright.config.ts` only if explicitly instructed.

### 2b. Read existing playwright.config.ts if present

Extract:
- `testDir` — where spec files go (e.g., `e2e/`, `tests/`, `__tests__/`)
- `baseURL` — the app's base URL for tests
- `projects` — which browsers are configured
- `webServer` command — how the app is started for tests

If `baseURL` is set, use it. Otherwise default to `http://localhost:3000`.

### 2c. Determine output directory for test files

Use this priority:
1. `testDir` from `playwright.config.ts`
2. `e2e/` if the directory exists
3. `tests/` if the directory exists
4. `__tests__/` if the directory exists
5. Create `e2e/` at project root

Record the resolved test directory. All generated files go here.

---

## Step 3: Playwright Browser Exploration

Goal: live-validate the static analysis, discover dynamic routes, and capture interactive element inventories.

### 3a. Script setup

Write a temporary exploration script at `e2e/_explore.ts` (or `.js`). The script is deleted after the inventory is complete. Template:

```typescript
import { chromium, Page } from '@playwright/test';
import * as fs from 'fs';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const OUTPUT_PATH = process.env.OUTPUT_PATH ?? 'e2e/test-scenarios.json';

async function explorePage(page: Page, route: string) {
  const url = `${BASE_URL}${route}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `e2e/_screenshots${route.replace(/\//g, '_') || '_home'}.png` });

  const interactiveElements = await page.$$eval(
    '[role="button"], button, a[href], input, select, textarea, [role="link"], [role="menuitem"]',
    els => els.map(el => ({
      tag: el.tagName.toLowerCase(),
      type: (el as HTMLInputElement).type ?? null,
      name: (el as HTMLInputElement).name ?? null,
      id: el.id ?? null,
      text: el.textContent?.trim().slice(0, 80) ?? null,
      href: (el as HTMLAnchorElement).href ?? null,
      role: el.getAttribute('role') ?? null,
      ariaLabel: el.getAttribute('aria-label') ?? null,
      placeholder: (el as HTMLInputElement).placeholder ?? null,
      required: (el as HTMLInputElement).required ?? false,
    }))
  );

  const forms = await page.$$eval('form', forms => forms.map(form => ({
    id: form.id ?? null,
    action: form.action ?? null,
    method: form.method ?? 'get',
    fields: Array.from(form.querySelectorAll('input, select, textarea')).map(f => ({
      tag: f.tagName.toLowerCase(),
      name: (f as HTMLInputElement).name,
      type: (f as HTMLInputElement).type ?? null,
      required: (f as HTMLInputElement).required,
      placeholder: (f as HTMLInputElement).placeholder ?? null,
    })),
  })));

  const pageTitle = await page.title();
  const h1 = await page.$eval('h1', el => el.textContent?.trim()).catch(() => null);

  return { route, url, pageTitle, h1, interactiveElements, forms };
}
```

### 3b. Navigate each route

For each route collected in Step 1a:
- Substitute real IDs for dynamic segments. Use IDs discovered from the app's seed data, fixtures, or visible list pages. If no real ID is available, use `1` as a placeholder and mark the scenario `needs_fixture: true`.
- Call `explorePage(page, route)`.
- If the page redirects to `/login` or another route, record `auth_required: true` for that route.
- After loading, check `page.url()` against the requested URL. A mismatch indicates a redirect.

### 3c. Discover nested and dynamic routes

After exploring the static route list:
1. On each explored page, collect all `<a href>` values from `interactiveElements` that start with `/` and are not already in the route list.
2. Add newly discovered routes to the exploration queue (depth-limited to 2 levels beyond the static list to avoid crawling infinitely).
3. For modal and drawer triggers: identify buttons whose click reveals a dialog. Use `page.click(selector)` then check for `[role="dialog"]`, `[role="alertdialog"]`, or `.modal` becoming visible. Record modal contents with the same element extraction.

### 3d. Trigger error and empty states

For each form found:
- Submit with all fields empty. Record validation messages via `page.$$eval('[role="alert"], .error, [aria-live]', ...)`.
- These become "validation" test scenarios.

For list/table pages:
- Record whether an empty state element exists (`[data-testid*="empty"]`, `.empty-state`, text matching "No results" or "Nothing here").

---

## Step 4: Generate Scenario Inventory

Goal: combine static analysis and live exploration into a structured JSON file.

### Scenario object schema

Each scenario in the output array has this shape:

```json
{
  "id": "login-happy-path",
  "title": "User can log in with valid credentials",
  "route": "/login",
  "priority": 1,
  "category": "auth",
  "type": "happy-path",
  "preconditions": ["user account exists in DB"],
  "steps": [
    "Navigate to /login",
    "Fill email field with valid user email",
    "Fill password field with valid password",
    "Click 'Sign in' button",
    "Assert redirect to /dashboard",
    "Assert user name visible in header"
  ],
  "assertions": [
    { "type": "url", "expected": "/dashboard" },
    { "type": "visible", "selector": "[data-testid='user-menu']" }
  ],
  "api_calls": ["POST /api/auth/login"],
  "fixtures_required": ["user:standard"],
  "needs_fixture": false,
  "auth_required": false,
  "screenshot_path": "e2e/_screenshots_login.png",
  "source": "static+browser"
}
```

Field definitions:
- `id` — kebab-case unique identifier; no spaces
- `priority` — integer 1 (highest) to 5 (lowest)
- `category` — one of: `auth`, `crud`, `navigation`, `validation`, `error`, `accessibility`, `performance`
- `type` — one of: `happy-path`, `sad-path`, `edge-case`, `smoke`
- `needs_fixture` — true if a real DB record ID is required but not confirmed
- `source` — `static` (from code only), `browser` (from live exploration only), `static+browser` (both)

### Generating scenario objects

For each route and interaction discovered:
1. Create one `happy-path` scenario for the primary success flow.
2. Create one `sad-path` scenario per form for the primary validation failure (empty submit or invalid input).
3. Create one `auth` scenario if `auth_required: true` was detected — testing that unauthenticated access redirects correctly.
4. Create navigation scenarios for any links that traverse major sections.

---

## Step 5: Prioritize and Output

### Sorting rules

Sort the final scenarios array by `priority` ascending, then by `category` using this order:

1. `auth` — login, logout, session expiry, protected route guards
2. `crud` — create, read, update, delete for primary data entities
3. `navigation` — routing, breadcrumbs, back/forward behavior
4. `validation` — form field validation, error messages
5. `error` — 404 pages, API error states, network failure handling
6. `accessibility` — keyboard nav, ARIA roles, focus management
7. `performance` — load time, lazy loading, pagination

Within each category, `happy-path` before `sad-path` before `edge-case`.

### Output file format

Write the final inventory to the path determined in Step 2c (e.g., `e2e/test-scenarios.json`).

The output must be a valid JSON array:

```json
[
  { "id": "login-happy-path", ... },
  { "id": "register-sad-path", ... },
  ...
]
```

### Post-processing cleanup

After generating the inventory:
1. Delete `e2e/_explore.ts` (or `.js`).
2. Remove temporary screenshot files from `e2e/_screenshots/` unless explicitly requested to keep them.
3. Log completion status and path to the generated scenarios file.

---

---

## Output Example

A successful run produces `e2e/test-scenarios.json`:

```json
[
  {
    "id": "login-happy-path",
    "title": "User can log in with valid credentials",
    "route": "/login",
    "priority": 1,
    "category": "auth",
    "type": "happy-path",
    "preconditions": ["user account exists in DB"],
    "steps": [
      "Navigate to /login",
      "Fill email field with valid user email",
      "Fill password field with valid password",
      "Click 'Sign in' button",
      "Assert redirect to /dashboard",
      "Assert user name visible in header"
    ],
    "assertions": [
      { "type": "url", "expected": "/dashboard" },
      { "type": "visible", "selector": "[data-testid='user-menu']" }
    ],
    "api_calls": ["POST /api/auth/login"],
    "fixtures_required": ["user:standard"],
    "needs_fixture": false,
    "auth_required": false,
    "screenshot_path": "e2e/_screenshots_login.png",
    "source": "static+browser"
  }
]
```

This file serves as the blueprint for the subsequent test generation skill to write actual `.spec.ts` files.
