import { test, expect } from '@playwright/test';

const header = (page, field) => page.locator(`.tabulator-header [tabulator-field="${field}"]`);
const cells = (page, field) => page.locator(`.tabulator-row .tabulator-cell[tabulator-field="${field}"]`);
async function exportRows(page) {
  const download = page.waitForEvent('download');
  await page.locator('#json').click();
  const stream = await (await download).createReadStream();
  let text = ''; for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text).runs;
}
async function open(page) {
  await page.goto('./');
  await expect(page.locator('#count')).toHaveText(/\d+ of \d+ runs/);
  return await page.request.get('./data.json').then(response => response.json());
}

test('desktop gives useful comparisons, distinct run labels, sorting, resizing and column controls', async ({ page }, info) => {
  const issues = []; page.on('pageerror', error => issues.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) issues.push(message.text()); });
  const data = await open(page);
  await expect(page.locator('#count')).toHaveText(`${data.runs.length} of ${data.runs.length} runs`);
  await expect(page.locator('#grid input[type=checkbox]')).toHaveCount(0);
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, top: document.querySelector('#grid').getBoundingClientRect().top,
    rowHeight: document.querySelector('.tabulator-row').getBoundingClientRect().height,
    p95Right: document.querySelector('.tabulator-header [tabulator-field="latency_p95_s"]').getBoundingClientRect().right,
  }));
  expect(layout.width).toBe(1440); expect(layout.top).toBeLessThan(430); expect(layout.rowHeight).toBeLessThan(45);
  expect(layout.p95Right).toBeLessThan(1420);
  const order = await page.locator('.tabulator-header [tabulator-field]').evaluateAll(elements => elements.filter(element => element.offsetWidth).map(element => element.getAttribute('tabulator-field')));
  expect(order.slice(0, 3)).toEqual(['model', 'suite', 'akm_version']);
  expect(order.indexOf('label')).toBe(18);
  const runLabels = await cells(page, 'label').allTextContents();
  expect(runLabels.every(label => label.trim())).toBe(true);
  const visibleRuns = await exportRows(page);
  expect(new Set(visibleRuns.slice(0, 3).map(row => row.id)).size).toBe(3);
  await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });
  await header(page, 'model').click();
  const expectedNames=data.runs.map(row=>row.model.startsWith('No LLM')?row.model:row.model.split('/').at(-1).replace(/^qwen/i,'Qwen').replace(/^gpt-oss:/i,'GPT-OSS ')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  await expect(cells(page,'model').first()).toHaveText(expectedNames[0]);
  await header(page, 'quality_percent').click();
  let rows = await exportRows(page);
  expect(rows.filter(row => row.quality_percent != null).map(row => row.quality_percent)).toEqual(rows.filter(row => row.quality_percent != null).map(row => row.quality_percent).sort((a,b) => a-b));
  expect(rows.slice(0,rows.filter(row=>row.quality_percent!=null).length).every(row=>row.quality_percent!=null)).toBe(true);
  await header(page, 'quality_percent').click(); rows = await exportRows(page);
  expect(rows.filter(row => row.quality_percent != null).map(row => row.quality_percent)).toEqual(rows.filter(row => row.quality_percent != null).map(row => row.quality_percent).sort((a,b) => b-a));
  expect(rows.slice(0,rows.filter(row=>row.quality_percent!=null).length).every(row=>row.quality_percent!=null)).toBe(true);
  await header(page, 'latency_p50_s').click({modifiers:['Shift']});
  await expect(page.locator('#sort-status')).toContainText('Quality %');
  await expect(page.locator('#sort-status')).toContainText('Latency p50');
  const before = await header(page, 'akm_version').boundingBox();
  const handle = page.locator('.tabulator-header [tabulator-field="akm_version"] + .tabulator-col-resize-handle');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2,{steps:8}); await page.mouse.up();
  expect((await header(page, 'akm_version').boundingBox()).width).toBeGreaterThan(before.width+30);
  await page.locator('#search').fill('reflect');
  expect((await header(page, 'akm_version').boundingBox()).width).toBeGreaterThan(before.width+30);
  await page.locator('#search').fill('');
  await page.locator('#columns-toggle').click(); await page.locator('#column-search').fill('temperature');
  await page.locator('[data-column="temperature"]').check();
  await expect(header(page,'temperature')).toBeVisible(); await page.locator('#columns-close').click();
  await page.locator('#view').selectOption('all');
  expect(await page.locator('.tabulator-header [tabulator-field]').evaluateAll(elements => elements.filter(element => element.offsetWidth).length)).toBeGreaterThan(data.columns.length);
  await page.locator('#view').selectOption('compare');
  await page.locator('.tabulator-page[data-page="next"]').click();
  await expect(page.locator('.tabulator-page-counter')).toContainText(`26-${Math.min(50, data.runs.length)}`);
  expect(issues).toEqual([]);
});

test('quality question ranks one benchmark and exposes the lack of a head-to-head model comparison', async ({ page }) => {
  const data = await open(page);
  await page.locator('#suite').selectOption('reflect'); await page.locator('#role').selectOption('Full suite');
  await page.locator('#view').selectOption('quality');
  const rows = await exportRows(page);
  const expected = data.runs.filter(row => row.suite === 'reflect' && row.role === 'Full suite');
  const threshold = rows[0].quality_percent.toFixed(2);
  expect(rows.length).toBe(expected.length);
  expect(rows[0].quality_percent).toBe(Math.max(...expected.map(row=>row.comparison.quality_percent)));
  await expect(cells(page,'quality_percent').first()).toContainText(rows[0].quality_percent.toFixed(2));
  if (new Set(expected.map(row=>row.model.split('/').at(-1))).size === 1) await expect(page.locator('#view-context')).toContainText('there is no model winner');
  await page.locator('#advanced-toggle').click();
  await page.locator('#filter-column').selectOption('quality_percent'); await page.locator('#filter-operator').selectOption('gte');
  await page.locator('#filter-value').fill(threshold); await page.locator('#add-filter button').click();
  const filtered = await exportRows(page);
  expect(filtered.length).toBeGreaterThan(0); expect(filtered.every(row=>Number(row.quality_percent.toFixed(2))>=Number(threshold))).toBe(true);
  await page.locator('#active-filters button').filter({hasText:'Quality %'}).click();
  expect((await exportRows(page)).length).toBe(expected.length);
  await page.locator('#header-filters').check();
  await header(page,'quality_percent').locator('input').fill(`${threshold}..${threshold}`);
  const exact = expected.filter(row=>row.comparison.quality_percent.toFixed(2)===threshold);
  await expect(page.locator('#count')).toHaveText(`${exact.length} of ${data.runs.length} runs`);
  expect((await exportRows(page)).every(row=>Number(row.quality_percent.toFixed(2))===Number(threshold))).toBe(true);
  await page.locator('#view').selectOption('performance');
  expect((await exportRows(page)).every(row=>Number(row.quality_percent.toFixed(2))===Number(threshold))).toBe(true);
  await expect(page.locator('#active-filters button').filter({hasText:`${threshold}..${threshold}`})).toBeVisible();
  await page.locator('#active-filters button').filter({hasText:`${threshold}..${threshold}`}).click();
  expect((await exportRows(page)).length).toBe(expected.length);
  await page.locator('#reset').click();
  await expect(page.locator('#count')).toHaveText(`${data.runs.length} of ${data.runs.length} runs`);
  await page.locator('#search').fill('no-such-published-run');
  await expect(page.locator('#count')).toHaveText(`0 of ${data.runs.length} runs`);
  await expect(page.locator('.tabulator-placeholder')).toContainText('No runs match');
});

test('speed question compares elapsed medians with a visible timing basis', async ({ page }, info) => {
  const data = await open(page);
  await page.locator('#suite').selectOption('reflect'); await page.locator('#view').selectOption('performance');
  const rows = await exportRows(page);
  const expected = data.runs.filter(row=>row.suite==='reflect' && row.comparison.case_p50_s != null);
  expect(rows[0].latency_p50_s).toBe(Math.min(...expected.map(row=>row.comparison.case_p50_s)));
  await expect(cells(page,'latency_p50_s').first()).toHaveText(rows[0].latency_p50_s.toFixed(2));
  await expect(cells(page,'latency_basis').first()).toHaveText('AKM command');
  await expect(header(page,'latency_basis')).toBeVisible();
  await page.screenshot({path:info.outputPath('speed.png'),fullPage:true});
});

test('AKM impact question preserves paired gains, timing direction and pilot scope', async ({ page }, info) => {
  await open(page); await page.locator('#view').selectOption('impact');
  const rows = await exportRows(page);
  expect(rows.every(row=>row.paired_cases>0 && row.control_quality_percent!=null && row.akm_quality_percent!=null)).toBe(true);
  const memory = rows.find(row=>row.suite==='longmemeval' && row.label==='luna-semantic-fresh-20261014-full');
  expect(memory.control_quality_percent).toBeCloseTo(84.8,2); expect(memory.akm_quality_percent).toBeCloseTo(80.36,2);
  expect(memory.paired_cases).toBe(499); expect(memory.akm_delta_pp).toBeCloseTo(-4.41,2);
  expect(memory.median_time_change_percent).toBeCloseTo((memory.akm_p50_s/memory.control_p50_s-1)*100,8);
  const agent = rows.find(row=>row.suite==='agent-ab' && row.label==='b35-semantic-20261014-pilot');
  expect(agent.akm_delta_pp).toBe(50); expect(agent.role).toBe("Pilot");
  const terminal = rows.find(row=>row.suite==='terminal-bench' && row.label==='luna-semantic-20261014-pilot'); expect(terminal.akm_delta_pp).toBe(0);
  if (rows.every(row=>row.role!=='Full suite')) await expect(page.locator('#view-context')).toContainText('pilots');
  await expect(cells(page,'role').first()).toHaveText(rows[0].role);
  await expect(cells(page,'akm_delta_pp').first()).toContainText(rows[0].akm_delta_pp.toFixed(2));
  await page.screenshot({path:info.outputPath('akm-impact.png'),fullPage:true});
});

test('mobile keeps filters and metrics reachable without page overflow or frozen wide columns', async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844}); await open(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.locator('#suite').selectOption('reflect'); await page.locator('#view').selectOption('performance');
  await page.locator('.tabulator-tableholder').evaluate(element=>{element.scrollLeft=500;});
  const x = await header(page,'latency_p50_s').evaluate(element=>element.getBoundingClientRect().x);
  expect(x).toBeLessThan(390);
  await page.locator('#columns-toggle').click();
  const menu = await page.locator('#columns-panel').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.x+menu.width).toBeLessThanOrEqual(390);
  await page.locator('#column-search').fill('latency basis');
  await expect(page.locator('[data-column="latency_basis"]')).toBeChecked();
  await page.locator('#columns-close').click();
  await page.screenshot({path:info.outputPath('mobile.png'),fullPage:true});
});

test('facets, date bounds, missing-value conditions, CSV and reordering work through the UI', async ({ page }) => {
  const data = await open(page);
  await page.locator('#model').selectOption('Qwen3.6-35b-a3b');
  expect((await exportRows(page)).every(row=>row.model.endsWith('qwen3.6-35b-a3b'))).toBe(true);
  await page.locator('#suite').selectOption('reflect'); await page.locator('#advanced-toggle').click();
  const candidates=data.runs.filter(row=>row.suite==='reflect' && row.model==='fast/qwen3.6-35b-a3b');
  const collection=candidates[0].collection; await page.locator('#collection').selectOption(collection);
  const date=candidates[0].date.slice(0,10);
  await page.locator('#dateFrom').fill(date); await page.locator('#dateFrom').dispatchEvent('change');
  await page.locator('#dateTo').fill(date); await page.locator('#dateTo').dispatchEvent('change');
  const rows=await exportRows(page);
  expect(rows.length).toBeGreaterThan(0); expect(rows.every(row=>row.collection===collection && row.date.slice(0,10)===date)).toBe(true);
  await page.locator('#reset').click();
  await page.locator('#filter-column').selectOption('cost_usd'); await page.locator('#filter-operator').selectOption('missing');
  await page.locator('#add-filter button').click(); expect((await exportRows(page)).every(row=>row.cost_usd==null)).toBe(true);
  await page.locator('#reset').click(); await page.locator('#advanced-toggle').click();
  const download=page.waitForEvent('download'); await page.locator('#csv').click();
  const stream=await (await download).createReadStream(); let csv='';for await(const chunk of stream)csv+=chunk.toString();
  expect(csv).toContain('"Summary URL"'); expect(csv).toContain('"Median time change (%)"');
  const paired=data.runs.find(row=>row.label==='luna-semantic-fresh-20261014-full').comparison;
  expect(csv).toContain(String((paired.akm_p50_s/paired.control_p50_s-1)*100));
  // Drag a metric ahead of quality to exercise the native movable-column behavior.
  const from=await header(page,'quality_metric').boundingBox(), to=await header(page,'quality_percent').boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+15); await page.mouse.down();
  await page.mouse.move(to.x+8,to.y+15,{steps:15}); await page.mouse.up();
  await expect.poll(()=>header(page,'quality_metric').evaluate(element=>element.getBoundingClientRect().x)).toBeLessThan(to.x+10);
});

test('quality ranking chooses the stronger model when comparable models are supplied', async ({ page, request }) => {
  // A two-model fixture tests functionality the current one-model-per-test publication cannot demonstrate.
  const data=await request.get('./data.json').then(response=>response.json());
  const source=structuredClone(data.runs.find(row=>row.suite==='reflect' && row.role==='Full suite'));
  source.comparison.quality_percent=75; source.comparison.quality_passed=3; source.comparison.quality_cases=4;
  source.comparison['score:'+source.comparison.quality_metric]=75;
  source.scores=source.scores.map(score=>score.label===source.comparison.quality_metric?{...score,value:.75,numerator:3,denominator:4}:score);
  const other=structuredClone(source);other.id+='-model-b';other.model='chat/test-model-b';other.label='model-b-run';
  other.comparison.quality_percent=100;other.comparison.quality_passed=4;other.comparison.quality_cases=4;
  other.comparison['score:'+other.comparison.quality_metric]=100;
  other.scores=other.scores.map(score=>score.label===other.comparison.quality_metric?{...score,value:1,numerator:4,denominator:4}:score);
  await page.route('**/data.json*',route=>route.fulfill({json:{...data,runs:[source,other]}}));
  await page.goto('./');await expect(page.locator('#count')).toHaveText('2 of 2 runs');
  await page.locator('#suite').selectOption('reflect');await page.locator('#view').selectOption('quality');
  await expect(cells(page,'model').first()).toHaveText('test-model-b');
  expect((await exportRows(page))[0].id).toBe(other.id);
  await expect(page.locator('#view-context')).toContainText('2 models');
});

test('model request telemetry is sortable, filterable and exported as per-call means', async ({ page, request }) => {
  const data = await request.get('./data.json').then(response => response.json());
  const source = structuredClone(data.runs.find(row => row.suite === 'reflect'));
  source.comparison.model_mean_input_tokens = 120.5;
  source.comparison.model_mean_output_tokens = 15.5;
  source.comparison.model_mean_request_s = 2.5;
  source.comparison.model_output_tokens_per_s = 6.2;
  source.comparison.run_wall_s = 24;
  const unknown = structuredClone(source); unknown.id += '-unknown';
  for (const key of ['model_mean_input_tokens', 'model_mean_output_tokens', 'model_mean_request_s', 'model_output_tokens_per_s', 'run_wall_s']) unknown.comparison[key] = null;
  await page.route('**/data.json*', route => route.fulfill({ json: { ...data, runs: [unknown, source] } }));
  await page.goto('./'); await expect(page.locator('#count')).toHaveText('2 of 2 runs');
  await page.locator('#view').selectOption('performance');
  await header(page, 'model_output_tokens_per_s').click();
  const rows = await exportRows(page);
  expect(rows[0].model_output_tokens_per_s).toBe(6.2);
  expect(rows[1].model_output_tokens_per_s).toBeNull();
  expect(rows[0].model_mean_input_tokens).toBe(120.5);
  expect(rows[0].input_tokens).toBeNull();
  await page.locator('#header-filters').check();
  await header(page, 'model_mean_request_s').locator('input').fill('>=2');
  await expect(page.locator('#count')).toHaveText('1 of 2 runs');
});


test('AKM versions support one or several selections, other filters, removal and reset on desktop and mobile', async ({ page }, info) => {
  const data = await open(page);
  const versions = ['0.9.32', '0.10.261005-beta'];
  const picker = page.locator('#version-filter');
  const option = version => picker.getByRole('checkbox', { name: version, exact: true });
  const expected = (selected, suite) => data.runs.filter(row => selected.includes(row.akm_version) && (!suite || row.suite === suite)).map(row => row.id).sort();
  const exported = async () => (await exportRows(page)).map(row => row.id).sort();
  await expect(page.locator('#version-summary')).toHaveText('All AKM versions');
  await page.locator('#version-summary').click();
  await expect(picker.getByRole('checkbox')).toHaveCount(new Set(data.runs.map(row => row.akm_version).filter(Boolean)).size);
  await option(versions[0]).check();
  await expect(page.locator('#version-summary')).toHaveText(`AKM ${versions[0]}`);
  expect(await exported()).toEqual(expected([versions[0]]));
  await page.locator('#version-summary').click();
  await option(versions[1]).check();
  await expect(page.locator('#version-summary')).toHaveText('AKM versions (2)');
  expect(await exported()).toEqual(expected(versions));
  await page.locator('#suite').selectOption('reflect');
  expect(await exported()).toEqual(expected(versions, 'reflect'));
  await page.locator('#active-filters button').filter({ hasText: `AKM version: ${versions[0]}` }).click();
  expect(await exported()).toEqual(expected([versions[1]], 'reflect'));
  await page.locator('#version-summary').click();
  await expect(option(versions[0])).not.toBeChecked();
  await expect(option(versions[1])).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(picker).not.toHaveAttribute('open');
  await expect(page.locator('#version-summary')).toBeFocused();
  await page.locator('#reset').click();
  await expect(page.locator('#version-summary')).toHaveText('All AKM versions');
  await expect(page.locator('#count')).toHaveText(`${data.runs.length} of ${data.runs.length} runs`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#version-summary').click();
  await expect(picker.locator('input:checked')).toHaveCount(0);
  await option(versions[0]).check(); await option(versions[1]).check();
  const menu = await page.locator('#version-options').boundingBox();
  expect(menu.x).toBeGreaterThanOrEqual(0); expect(menu.x + menu.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath('versions-mobile.png'), fullPage: true });
  expect(await exported()).toEqual(expected(versions));
  await page.locator('#version-summary').click();
  await option(versions[0]).uncheck(); await option(versions[1]).uncheck();
  await expect(page.locator('#version-summary')).toHaveText('All AKM versions');
  await expect(page.locator('#count')).toHaveText(`${data.runs.length} of ${data.runs.length} runs`);
});


test('small touch screens show complete run cards with native scrolling, sorting, filters and pagination', async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const issues = []; page.on('pageerror', error => issues.push(error.message));
  try {
    const data = await open(page);
    const cards = page.locator('.run-card');
    const cardIds = () => cards.evaluateAll(elements => elements.map(element => element.dataset.runId));
    await expect(page.locator('#touch-results')).toBeVisible();
    await expect(page.locator('.tabulator-header')).not.toBeVisible();
    await expect(cards).toHaveCount(25);
    expect(await cardIds()).toEqual((await exportRows(page)).slice(0, 25).map(row => row.id));
    await expect(cards.first()).toContainText('AKM 0.10.261005-beta');
    await expect(cards.first()).toContainText('Quality metric');
    await expect(cards.first()).toContainText((await exportRows(page))[0].label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 740 }] });
    for (let y = 700; y >= 300; y -= 50) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await page.locator('#suite').selectOption('reflect');
    await page.locator('#version-summary').tap();
    await page.getByRole('checkbox', { name: '0.9.32', exact: true }).tap();
    expect((await exportRows(page)).every(row => row.suite === 'reflect' && row.akm_version === '0.9.32')).toBe(true);
    await page.locator('#view').selectOption('performance');
    await expect(cards.first()).toContainText('Latency p50');
    await page.locator('#touch-sort').selectOption('quality_percent');
    const sorted = await exportRows(page);
    expect(await cardIds()).toEqual(sorted.map(row => row.id));
    await page.locator('#touch-direction').tap();
    expect(await cardIds()).toEqual((await exportRows(page)).map(row => row.id));
    await page.locator('#columns-toggle').tap();
    await page.locator('#column-search').fill('temperature');
    await page.locator('[data-column="temperature"]').tap();
    await page.locator('#columns-close').tap();
    await expect(cards.first()).toContainText('Temperature');
    await page.locator('#columns-toggle').tap();
    await page.locator('#reset-columns').tap();
    await page.locator('#columns-close').tap();
    await page.locator('#reset').tap();
    const exported = await exportRows(page);
    await page.locator('.tabulator-page[data-page="next"]').tap();
    expect(await cardIds()).toEqual(exported.slice(25, 50).map(row => row.id));
    await page.locator('.tabulator-page[data-page="first"]').tap();
    await page.locator('#touch-sort').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('touch-mobile.png') });
    await cards.first().screenshot({ path: info.outputPath('touch-run.png') });
    expect(await page.locator('#touch-direction').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.setViewportSize({ width: 820, height: 1180 });
    await expect(page.locator('#touch-results')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(820);
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    for (const button of await page.locator('.tabulator-page').all()) {
      const box = await button.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    await page.locator('.tabulator-page-size').selectOption('true');
    await expect(cards).toHaveCount(data.runs.length);
    await page.locator('#search').fill('no-such-published-run');
    await expect(cards).toHaveCount(0);
    await expect(page.locator('#touch-cards')).toContainText('No runs match');
    await page.locator('#search').fill('');
    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(page.locator('#touch-results')).not.toBeVisible();
    await expect(page.locator('.tabulator-header')).toBeVisible();
    expect(issues).toEqual([]);
  } finally { await context.close(); }
});
