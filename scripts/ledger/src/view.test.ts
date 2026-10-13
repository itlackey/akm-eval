import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { presentRun } from "./data";
import { coreColumns, scoreColumns } from "./comparison";

interface Element {
  value: string; checked: boolean; innerHTML: string; textContent: string;
  listeners: Record<string, () => void>; onclick?: () => void;
  add: (option: unknown) => void; addEventListener: (type: string, fn: () => void) => void;
}

test("full ledger exposes every run and column, combines filters, sorts numerically and compares selected rows", async () => {
  const html = readFileSync(new URL("../../../site/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../../../site/assets/ledger.js", import.meta.url), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]!);
  const elements = new Map<string, Element>(ids.map(id => [id, {
    value: "", checked: false, innerHTML: "", textContent: "", listeners: {} as Record<string, () => void>, add() {},
    addEventListener(type: string, fn: () => void) { this.listeners[type] = fn; },
  }]));
  const el = (id: string) => elements.get(id)!;
  const rows = [0, 1, 2].map(index => presentRun({
    summary: { eval: "reflect", corpus: "public", status: "complete", model: index ? "model-b" : "model-a",
      label: index === 1 ? '<img src=x onerror="alert(1)">' : `run-${index}`,
      limit: index === 2 ? 1 : null, date: `2026-10-13T0${index}:00:00Z`, n_scored: 1, n_errored: index === 1 ? 1 : 0,
      metrics: { defects: { n: 1, correct: 1, rate: 1 }, controls: { n: 1, correct: 1 } } },
    samples: index === 2 ? [] : [{ seconds: index ? 10 : 2 }], path: `v/reflect/r${index}`, sourceRevision: "revision",
  })!);
  const columns = [...coreColumns, ...scoreColumns(rows)];
  const dataset = { runs: rows, columns, source_revision: "revision" };
  const events: Record<string, (event: unknown) => void> = {};
  const downloads: Blob[] = [];
  const context = vm.createContext({
    fetch: async (url: string) => { expect(url).toBe("./data.json?v=revision"); return { ok: true, json: async () => dataset }; },
    document: {
      documentElement: { dataset: { revision: "revision" } },
      getElementById: (id: string) => { expect(elements.has(id)).toBe(true); return el(id); },
      addEventListener: (type: string, fn: (event: unknown) => void) => { events[type] = fn; },
      querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ click() {} }),
    }, Option: class {}, Blob,
    URL: { createObjectURL: (blob: Blob) => { downloads.push(blob); return "blob:fixture"; }, revokeObjectURL() {} },
    setTimeout: (fn: () => void) => fn(),
  });
  const pressSort = (key: string, shiftKey = false) => events.click!({ shiftKey, target: { closest: () => ({ dataset: { sort: String(columns.findIndex(column => column.key === key)) } }) } });
  const inputFilter = (key: string, bound: string, value: string) => events.input!({ target: {
    dataset: { filter: String(columns.findIndex(column => column.key === key)), bound }, value,
  } });
  const downloadRows = async () => { el("json").onclick!(); return JSON.parse(await downloads.at(-1)!.text()).runs; };
  await vm.runInContext(script, context);
  expect(el("count").textContent).toContain("3 of 3 runs");
  for (const column of columns) expect(el("head").innerHTML).toContain(column.label.replaceAll('&', '&amp;'));
  expect(el("body").innerHTML).toContain("&lt;img");
  expect(el("body").innerHTML).not.toContain("<img");
  expect(el("column-filters").innerHTML).toContain('aria-label="Minimum Case p50 (s)"');
  // Numeric sort: 2 precedes 10, while missing timing stays last in both directions.
  pressSort("case_p50_s");
  expect((await downloadRows()).map((row: { comparison: { case_p50_s: number } }) => row.comparison.case_p50_s)).toEqual([2, 10, null]);
  pressSort("case_p50_s");
  expect((await downloadRows()).map((row: { comparison: { case_p50_s: number } }) => row.comparison.case_p50_s)).toEqual([10, 2, null]);
  pressSort("model"); pressSort("case_p50_s", true);
  expect(el("sort-status").textContent).toContain("then Case p50 (s)");
  el("model").value = "model-b"; el("model").listeners.change!();
  expect(el("count").textContent).toContain("2 of 3 runs");
  inputFilter("case_p50_s", "min", "5");
  expect(el("count").textContent).toContain("1 of 3 runs");
  el("csv").onclick!();
  const csv = await downloads.at(-1)!.text();
  expect(csv.split('\r\n')).toHaveLength(2);
  expect(csv).toContain('"Case p50 (s)"');
  expect(csv).toContain('"Quality %"');
  el("reset").onclick!();
  inputFilter("case_p50_s", "presence", "missing");
  expect((await downloadRows())[0].label).toBe("run-2");
  el("reset").onclick!();
  // Compare selected preserves the source rows rather than replacing them with summaries.
  events.change!({ target: { dataset: { select: rows[0]!.id }, checked: true } });
  events.change!({ target: { dataset: { select: rows[2]!.id }, checked: true } });
  el("selectedOnly").checked = true; el("selectedOnly").listeners.change!();
  expect(el("count").textContent).toContain("2 of 3 runs");
  expect((await downloadRows()).map((row: { id: string }) => row.id).sort()).toEqual([rows[0]!.id, rows[2]!.id]);
  el("clearSelection").onclick!();
  expect(el("count").textContent).toContain("3 of 3 runs");
  el("errorsOnly").checked = true; el("errorsOnly").listeners.change!();
  expect(el("count").textContent).toContain("1 of 3 runs");
  el("dateFrom").value = '2026-10-14'; el("dateFrom").listeners.change!();
  expect(el("body").innerHTML).toContain("No runs match");
});
