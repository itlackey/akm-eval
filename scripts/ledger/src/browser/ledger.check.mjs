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
  await page.goto('/');
  await expect(page.locator('#count')).toHaveText(/\d+ of \d+ runs/);
  return await page.request.get('/data.json').then(response => response.json());
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
  const runLabels = await cells(page, 'label').allTextContents();
  expect(new Set(runLabels.slice(0, 3)).size).toBe(3);
  await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });
  await header(page, 'model').click();
  const expectedNames=data.runs.map(row=>row.model.startsWith('No LLM')?row.model:row.model.split('/').at(-1).replace(/^qwen/i,'Qwen').replace(/^gpt-oss:/i,'GPT-OSS ')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  await expect(cells(page,'model').first()).toHaveText(expectedNames[0]);
  await header(page, 'quality_percent').click();
  let rows = await exportRows(page);
  expect(rows.filter(row => row.quality_percent != null).map(row => row.quality_percent)).toEqual(rows.filter(row => row.quality_percent != null).map(row => row.quality_percent).sort((a,b) => a-b));
  expect(rows.at(-1).quality_percent).toBeNull();
  await header(page, 'quality_percent').click(); rows = await exportRows(page);
  expect(rows.filter(row => row.quality_percent != null).map(row => row.quality_percent)).toEqual(rows.filter(row => row.quality_percent != null).map(row => row.quality_percent).sort((a,b) => b-a));
  expect(rows.at(-1).quality_percent).toBeNull();
  await header(page, 'latency_p50_s').click({modifiers:['Shift']});
  await expect(page.locator('#sort-status')).toContainText('Quality %');
  await expect(page.locator('#sort-status')).toContainText('Latency p50');
  const before = await header(page, 'label').boundingBox();
  const handle = page.locator('.tabulator-header [tabulator-field="label"] + .tabulator-col-resize-handle');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2,{steps:8}); await page.mouse.up();
  expect((await header(page, 'label').boundingBox()).width).toBeGreaterThan(before.width+30);
  await page.locator('#columns-toggle').click(); await page.locator('#column-search').fill('temperature');
  await page.locator('[data-column="temperature"]').check();
  await expect(header(page,'temperature')).toBeVisible(); await page.locator('#columns-close').click();
  await page.locator('#view').selectOption('all');
  expect(await page.locator('.tabulator-header [tabulator-field]').evaluateAll(elements => elements.filter(element => element.offsetWidth).length)).toBeGreaterThan(data.columns.length);
  await page.locator('#view').selectOption('compare');
  await page.locator('.tabulator-page[data-page="next"]').click();
  await expect(page.locator('.tabulator-page-counter')).toContainText('26-50');
  expect(issues).toEqual([]);
});

test('quality question ranks one benchmark and exposes the lack of a head-to-head model comparison', async ({ page }) => {
  const data = await open(page);
  await page.locator('#suite').selectOption('reflect'); await page.locator('#role').selectOption('Full suite');
  await page.locator('#view').selectOption('quality');
  const rows = await exportRows(page);
  const expected = data.runs.filter(row => row.suite === 'reflect' && row.role === 'Full suite');
  expect(rows.length).toBe(expected.length);
  expect(rows[0].quality_percent).toBe(Math.max(...expected.map(row=>row.comparison.quality_percent)));
  await expect(cells(page,'quality_percent').first()).toContainText(rows[0].quality_percent.toFixed(2));
  if (new Set(expected.map(row=>row.model.split('/').at(-1))).size === 1) await expect(page.locator('#view-context')).toContainText('there is no model winner');
  await page.locator('#advanced-toggle').click();
  await page.locator('#filter-column').selectOption('quality_percent'); await page.locator('#filter-operator').selectOption('gte');
  await page.locator('#filter-value').fill('92.59'); await page.locator('#add-filter button').click();
  const filtered = await exportRows(page);
  expect(filtered.length).toBeGreaterThan(0); expect(filtered.every(row=>Number(row.quality_percent.toFixed(2))>=92.59)).toBe(true);
  await page.locator('#active-filters button').filter({hasText:'Quality %'}).click();
  expect((await exportRows(page)).length).toBe(expected.length);
  await page.locator('#header-filters').check();
  await header(page,'quality_percent').locator('input').fill('92.59..92.59');
  await expect(page.locator('#count')).not.toHaveText(`${expected.length} of ${data.runs.length} runs`);
  expect((await exportRows(page)).every(row=>Number(row.quality_percent.toFixed(2))===92.59)).toBe(true);
  await page.locator('#view').selectOption('performance');
  expect((await exportRows(page)).every(row=>Number(row.quality_percent.toFixed(2))===92.59)).toBe(true);
  await expect(page.locator('#active-filters button').filter({hasText:'92.59..92.59'})).toBeVisible();
  await page.locator('#active-filters button').filter({hasText:'92.59..92.59'}).click();
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
  const memory = rows.find(row=>row.suite==='longmemeval' && row.label==='bifrost-gpt120-pilot');
  expect(memory.control_quality_percent).toBe(60); expect(memory.akm_quality_percent).toBe(75);
  expect(memory.akm_delta_pp).toBe(25); expect(memory.median_time_change_percent).toBeCloseTo(-69.61,2);
  const agent = rows.find(row=>row.suite==='agent-ab' && row.label==='bifrost-gpt120-compatible-pilot');
  expect(agent.akm_delta_pp).toBe(100); expect(agent.median_time_change_percent).toBeGreaterThan(0);
  const terminal = rows.find(row=>row.suite==='terminal-bench' && row.label==='bifrost-gpt120-pilot'); expect(terminal.akm_delta_pp).toBe(0);
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
  await page.locator('#model').selectOption('Qwen3.8-27b');
  expect((await exportRows(page)).every(row=>row.model==='chat/qwen3.8-27b')).toBe(true);
  await page.locator('#suite').selectOption('reflect'); await page.locator('#advanced-toggle').click();
  const candidates=data.runs.filter(row=>row.suite==='reflect');
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
  expect(csv).toContain('"Summary URL"'); expect(csv).toContain('"Median time change (%)"'); expect(csv).toContain('"-69.6078431372549');
  // Drag a metric ahead of quality to exercise the native movable-column behavior.
  const from=await header(page,'quality_metric').boundingBox(), to=await header(page,'quality_percent').boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+15); await page.mouse.down();
  await page.mouse.move(to.x+8,to.y+15,{steps:15}); await page.mouse.up();
  await expect.poll(()=>header(page,'quality_metric').evaluate(element=>element.getBoundingClientRect().x)).toBeLessThan(to.x+10);
});

test('quality ranking chooses the stronger model when comparable models are supplied', async ({ page, request }) => {
  // A two-model fixture tests functionality the current one-model-per-test publication cannot demonstrate.
  const data=await request.get('/data.json').then(response=>response.json());
  const source=data.runs.find(row=>row.suite==='reflect' && row.role==='Full suite');
  const other=structuredClone(source);other.id+='-model-b';other.model='chat/test-model-b';other.label='model-b-run';
  other.comparison.quality_percent=26/27*100;other.comparison.quality_passed=26;other.comparison.quality_cases=27;
  other.comparison['score:'+other.comparison.quality_metric]=26/27*100;
  other.scores=other.scores.map(score=>score.label===other.comparison.quality_metric?{...score,value:26/27,numerator:26,denominator:27}:score);
  await page.route('**/data.json*',route=>route.fulfill({json:{...data,runs:[source,other]}}));
  await page.goto('/');await expect(page.locator('#count')).toHaveText('2 of 2 runs');
  await page.locator('#suite').selectOption('reflect');await page.locator('#view').selectOption('quality');
  await expect(cells(page,'model').first()).toHaveText('test-model-b');
  expect((await exportRows(page))[0].id).toBe(other.id);
  await expect(page.locator('#view-context')).toContainText('2 models');
});
