import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// These workflows include several exports and page reloads; retain the normal short assertion timeout.
test.setTimeout(60_000);

// Generate synthetic display data through the real server-side presenter. Never add test measurements to reports/.
const fixture = JSON.parse(execFileSync('bun', [fileURLToPath(new URL('../fixtures/memory.ts', import.meta.url))], { encoding: 'utf8' }));
const header = (page, field) => page.locator(`.tabulator-header [tabulator-field="${field}"]`);
const cells = (page, field) => page.locator(`.tabulator-row .tabulator-cell[tabulator-field="${field}"]`);
async function exported(page, type = 'json') {
  const event = page.waitForEvent('download'); await page.locator('#' + type).click();
  const stream = await (await event).createReadStream();
  let text = ''; for await (const chunk of stream) text += chunk.toString();
  return type === 'json' ? JSON.parse(text).runs : text;
}
async function open(page) {
  const existing = await page.request.get('./data.json').then(r => r.json());
  const columns = [...new Map([...existing.columns, ...fixture.columns].map(c => [c.key, c])).values()];
  const dataset = { ...existing, columns, runs: [...existing.runs, ...fixture.runs] };
  await page.route('**/data.json*', route => route.fulfill({ json: dataset }));
  await page.goto('./');
  await expect(page.locator('#count')).toHaveText(`${dataset.runs.length} of ${dataset.runs.length} runs`);
  return existing;
}
test('memory quality exposes three controls, two contrasts, uncertainty and coverage without changing AKM impact', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const existing = await open(page);
  await page.locator('#view').selectOption('memory');
  await expect(page.locator('#count')).toHaveText(`2 of ${existing.runs.length + 2} runs`);
  for (const [arm, value] of [['none', 25], ['source', 50], ['inferred', 75]])
    await expect(cells(page, `memory_${arm}_accuracy`).first()).toContainText(`${value}.00`);
  for (const pair of ['persistent_memory', 'memory_inference']) {
    await expect(cells(page, `memory_${pair}_failure_inclusive_gain`).first()).toHaveText('25.00');
    await expect(cells(page, `memory_${pair}_failure_inclusive_ci_low`).first()).toHaveText('-80.00');
    await expect(cells(page, `memory_${pair}_failure_inclusive_complete_pairs`).first()).toHaveText('3');
    await expect(cells(page, `memory_${pair}_failure_inclusive_incomplete_pairs`).first()).toHaveText('1');
  }
  await expect(page.locator('#view-context')).toContainText('errors/unrun = zero');
  const rows = await exported(page);
  expect(rows[0].memory_memory_inference_complete_pairs_gain).toBeCloseTo(33.33);
  expect(rows[0].memory_memory_inference_failure_inclusive_gain).toBe(25);
  expect(rows[0].akm_delta_pp).toBeNull(); // Do not squeeze a three-arm experiment into the old two-arm gain.
  await header(page, 'memory_memory_inference_failure_inclusive_gain').click();
  expect((await exported(page))[0].memory_memory_inference_failure_inclusive_gain).toBe(-25);
  await page.screenshot({ path: info.outputPath('memory-quality-desktop.png'), fullPage: true });
  await page.locator('#view').selectOption('impact');
  expect((await exported(page)).every(row => row.suite !== 'memory-utility')).toBe(true);
  await page.locator('#view').selectOption('compare');
  expect((await exported(page)).length).toBe(existing.runs.length + 2);
  expect(errors).toEqual([]);
});
test('memory budgets show each standard budget with its accuracy, packed tokens and exact p-value, and leave an unrecorded budget empty', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await page.locator('#view').selectOption('memory-budgets');
  for (const [arm, value] of [['none', 25], ['source', 50], ['inferred', 75]])
    await expect(cells(page, `memory_b1024_${arm}_accuracy`).first()).toContainText(`${value}.00`);
  await expect(cells(page, 'memory_b256_inferred_accuracy').first()).toContainText('25.00');
  await expect(cells(page, 'memory_b1024_source_tokens').first()).toHaveText('900.0');
  await expect(cells(page, 'memory_b1024_memory_inference_p_value').first()).toHaveText('0.2500');
  await expect(cells(page, 'memory_b1024_memory_inference_gain').first()).toHaveText('25.00');
  await expect(cells(page, 'memory_b2048_inferred_accuracy').first()).toHaveText('—');
  await expect(page.locator('#view-context')).toContainText('primary comparison is Inferred − notes at 1024');
  const rows = await exported(page);
  expect(rows[0].memory_b1024_memory_inference_p_value).toBe(0.25);
  expect(rows[0].memory_b2048_inferred_accuracy).toBeNull();
  expect(errors).toEqual([]);
});
test('memory usage and diagnostics preserve unknown/zero, partial reporting, filters, exports and URL restoration', async ({ page }, info) => {
  await open(page);
  await page.locator('#view').selectOption('memory-performance');
  let rows = await exported(page);
  expect(rows[0].memory_inferred_answer_s).toBe(6);
  expect(rows[0].memory_inferred_prompt_tokens).toBe(300);
  expect(rows[0].memory_inferred_prompt_tokens_reported).toBe(2);
  expect(rows[0].memory_inferred_prompt_tokens_attempted).toBe(4);
  expect(rows[0].memory_inferred_cost_usd).toBeNull();
  expect(rows[1].memory_inferred_cost_usd).toBe(0);
  await expect(cells(page, 'memory_inferred_cost_usd').first()).toHaveText('—');
  await expect(cells(page, 'memory_inferred_cost_usd').nth(1)).toHaveText('0.0000');
  await expect(page.locator('#view-context')).toContainText('exclude inference and embeddings');
  await page.locator('#advanced-toggle').click();
  await page.locator('#filter-column').selectOption('memory_inferred_cost_usd');
  await page.locator('#filter-operator').selectOption('missing');
  await page.locator('#add-filter button').click();
  expect((await exported(page)).map(r => r.id)).toEqual([fixture.runs[0].id]);
  const url = page.url(); await page.reload();
  await expect(page.locator('#view')).toHaveValue('memory-performance');
  expect(page.url()).toBe(url);
  expect((await exported(page)).length).toBe(1);
  const csv = await exported(page, 'csv');
  expect(csv).toContain('Inferred − notes · all selected (pp)');
  expect(csv).toContain('Inferred memory · input tokens reporting calls');
  await page.locator('#reset').click();
  await page.locator('#view').selectOption('memory-diagnostics');
  await expect(cells(page, 'memory_inferred_protocol_correct').first()).toContainText('50.00');
  await expect(cells(page, 'memory_inferred_malformed_answers').first()).toHaveText('1');
  await expect(cells(page, 'memory_inference_errors').first()).toHaveText('1');
  await expect(page.locator('#view-context')).toContainText('Exact quotes do not prove entailment');
  await page.locator('#columns-toggle').click();
  await page.locator('#column-search').fill('Memory input digest');
  await page.locator('[data-column="memory_input_digest"]').check();
  await page.locator('#columns-close').click();
  expect((await exported(page))[0].memory_input_digest).toBe('input-fixture');
  await page.reload();
  await expect(page.locator('#view')).toHaveValue('custom');
  await expect(header(page, 'memory_input_digest')).toBeVisible();
  await page.screenshot({ path: info.outputPath('memory-diagnostics-desktop.png'), fullPage: true });
});
test('memory views remain reachable and readable on touch screens', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await open(page); await page.locator('#view').selectOption('memory');
    await expect(page.locator('#touch-results')).toBeVisible();
    await expect(page.locator('.run-card')).toHaveCount(2);
    await expect(page.locator('.run-card').first()).toContainText('Notes − none');
    await expect(page.locator('.run-card').first()).toContainText('Inferred − notes');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    // Full-page capture can temporarily resize Chromium's mobile emulation and change media queries.
    await page.locator('.run-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('memory-quality-mobile.png') });
    await page.locator('#view').selectOption('memory-performance');
    await expect(page.locator('.run-card').first()).toContainText('input tokens reporting calls');
    await page.locator('#view').selectOption('memory-diagnostics');
    await expect(page.locator('.run-card').first()).toContainText('malformed format');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  } finally { await context.close(); }
});
