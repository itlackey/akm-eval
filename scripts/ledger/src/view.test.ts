import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const script = readFileSync(new URL("../../../site/assets/ledger.js", import.meta.url), "utf8");
const helpers = script.slice(0, script.indexOf("async function startLedger"));
const run = (code: string) => vm.runInNewContext(helpers + code);

test("numeric filters include displayed rounding boundaries and distinguish missing from zero", () => {
  expect(run(`matchesHeader(92.58999999999999, '92.59..92.59', {kind:'number', decimals:2})`)).toBe(true);
  expect(run(`matchesHeader(92.58999999999999, '>=92.59', {kind:'number', decimals:2})`)).toBe(true);
  expect(run(`matchesHeader(null, '<=0', {kind:'number', decimals:2})`)).toBe(false);
  expect(run(`matchesHeader(0, '<=0', {kind:'number', decimals:2})`)).toBe(true);
  expect(run(`matchesCondition(null, {operator:'missing'}, {kind:'number'})`)).toBe(true);
  expect(run(`matchesCondition(0, {operator:'missing'}, {kind:'number'})`)).toBe(false);
});

test("search supports all words and alternative routes without treating HTML as markup", () => {
  expect(run(`matchesText('chat/qwen3.8-27b recovery r3', 'qwen r3 | gpt')`)).toBe(true);
  expect(run(`matchesText('chat/qwen3.8-27b recovery r3', 'qwen r2')`)).toBe(false);
  expect(run(`formatCell('<img src=x onerror=alert(1)>', {kind:'text'})`)).not.toContain('<img');
});

test("comparison preserves paired quality gain independently of marginal arm percentages", () => {
  const row = run(`comparisonRow({ scores:[{label:'Correct answers without AKM',value:.6},{label:'Correct answers with AKM',value:.75}],
    paired_cases:4, akm_delta_pp:25, akm_delta_lo_pp:-17.44, akm_delta_hi_pp:67.44,
    control_p50_s:5.1, akm_p50_s:1.55, akm_p95_s:3.855, akm_timed:4 })`);
  expect(row.control_quality_percent).toBe(60);
  expect(row.akm_quality_percent).toBe(75);
  expect(row.akm_delta_pp).toBe(25);
  expect(row.median_time_change_percent).toBeCloseTo(-69.61, 2);
  expect(row.latency_basis).toBe('With AKM agent / answer');
  expect(row.latency_timed).toBe(4);
});

test("unscored diagnostics do not produce a speed improvement claim", () => {
  expect(run(`comparisonRow({ scores:[], control_p50_s:96.8, akm_p50_s:137.9 }).median_time_change_percent`)).toBeNull();
});


test("latest results retain distinct versions, tests, models and collections with deterministic date ties", () => {
  const result = run(`latestRuns([
    {id:'old',akm_version:'0.9.32',suite:'reflect',model:'35b',date:'2026-10-01'},
    {id:'new',akm_version:'0.9.32',suite:'reflect',model:'35b',date:'2026-10-02'},
    {id:'beta',akm_version:'0.10-beta',suite:'reflect',model:'35b',date:'2026-10-01'},
    {id:'model',akm_version:'0.9.32',suite:'reflect',model:'luna',date:'2026-10-01'},
    {id:'test',akm_version:'0.9.32',suite:'extract',model:'35b',date:'2026-10-01'},
    {id:'books',akm_version:'0.9.32',suite:'reflect',model:'35b',collection:'books',date:'2026-10-01'},
    {id:'z-tie',akm_version:'0.9.32',suite:'reflect',model:'35b',date:'2026-10-02'}
  ]).map(row=>row.id).sort()`);
  expect(Array.from(result)).toEqual(['beta', 'books', 'model', 'new', 'test']);
});
