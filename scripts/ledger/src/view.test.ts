import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { presentRun } from "./data";

interface Element {
  value: string;
  innerHTML: string;
  textContent: string;
  hidden: boolean;
  attributes: Record<string, string>;
  listeners: Record<string, () => void>;
  onclick?: () => void;
  add: (option: unknown) => void;
  setAttribute: (key: string, value: string) => void;
  addEventListener: (type: string, fn: () => void) => void;
}

test("one results table filters groups, exposes repeats, switches views and exports numeric scores", async () => {
  const html = readFileSync(new URL("../../../site/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../../../site/assets/ledger.js", import.meta.url), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]!);
  expect(new Set(ids).size).toBe(ids.length);
  expect(html.match(/<table>/g)).toHaveLength(1);
  const elements = new Map<string, Element>(ids.map(id => [id, {
    value: "", hidden: false, innerHTML: "", textContent: "", attributes: {} as Record<string, string>,
    listeners: {} as Record<string, () => void>, add() {},
    setAttribute(key: string, value: string) { this.attributes[key] = value; },
    addEventListener(type: string, fn: () => void) { this.listeners[type] = fn; },
  }]));
  const el = (id: string) => elements.get(id)!;
  const rows = [0, 1, 2].map(index => presentRun({
    summary: { eval: "reflect", corpus: "public", status: "complete",
      label: index === 1 ? '<img src=x onerror="alert(1)">' : `run-${index}`,
      limit: index === 2 ? 1 : null, model: "chat/qwen3.8-27b",
      date: `2026-10-13T0${index}:00:00Z`, akm_version: "version", n_scored: 1, n_errored: index === 1 ? 1 : 0,
      metrics: { defects: { n: 1, correct: 1, rate: 1 }, controls: { n: 1, correct: 1 } } },
    samples: [{ id: "a", correct: true }, { id: "b", correct: true }],
    path: `version/reflect/run-${index}`, sourceRevision: "revision",
  })!);
  const dataset = { runs: rows,
    latest_groups: [{ ids: [rows[1]!.id], all_ids: [rows[0]!.id, rows[1]!.id], variation: null }],
    latest_collection_date: rows[2]!.date, source_revision: "revision" };
  let click: (event: unknown) => void = () => {};
  const downloads: Blob[] = [];
  const context = vm.createContext({
    fetch: async (url: string) => { expect(url).toBe("./data.json"); return { ok: true, json: async () => dataset }; },
    document: {
      getElementById: (id: string) => { expect(elements.has(id)).toBe(true); return el(id); },
      addEventListener: (_type: string, fn: (event: unknown) => void) => { click = fn; },
      querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ click() {} }),
    },
    Option: class { constructor(_text: string, _value: string) {} }, Blob,
    URL: { createObjectURL: (blob: Blob) => { downloads.push(blob); return "blob:fixture"; }, revokeObjectURL() {} },
    setTimeout: (fn: () => void) => fn(),
  });
  const press = (dataset: Record<string, string>) => click({ target: { closest: () => ({ dataset }) } });
  await vm.runInContext(script, context);
  expect(el("count").textContent).toBe("1 result · 2 published runs in this selection");
  expect(el("snapshot").textContent).toContain("2 full runs");
  expect(el("body").innerHTML).toContain("Correct fixes");
  expect(el("body").innerHTML).toContain("1 of 2 scored");
  expect(el("body").innerHTML).toContain("+ 1 earlier");
  expect(el("body").innerHTML).not.toContain("<img");
  press({ id: rows[1]!.id });
  expect(el("body").innerHTML).toContain("Original scores");
  expect(el("body").innerHTML).toContain("earlier test code or settings");
  expect(el("body").innerHTML).toContain("&lt;img");
  expect(el("body").innerHTML).not.toContain("<img");
  // Search finds an earlier repeat, even though its group shows the latest score.
  el("search").value = "run-0"; el("search").listeners.input!();
  expect(el("count").textContent).toContain("1 result");
  el("csv").onclick!();
  const csv = await downloads.at(-1)!.text();
  expect(csv).toContain('"Correct fixes","1","percent","1","1"');
  expect(csv).toContain('"run-0"');
  expect(csv).not.toContain('"run-2"');
  el("reset").onclick!();
  press({ view: "pilots" });
  expect(el("count").textContent).toBe("1 run · 1 published run in this selection");
  expect(el("view-pilots").attributes["aria-pressed"]).toBe("true");
  expect(el("body").innerHTML).toContain("Small trial");
  press({ view: "all" });
  expect(el("count").textContent).toContain("3 runs");
  el("suite").value = "reflect"; el("suite").listeners.change!();
  expect(el("test-guide").hidden).toBe(false);
  expect(el("test-guide").innerHTML).toContain("broken asset metadata");
  el("model").value = "Unknown"; el("model").listeners.change!();
  expect(el("body").innerHTML).toContain("No results match");
  el("reset").onclick!();
  press({ sort: "model" });
  expect(el("head").innerHTML).toContain('aria-sort="ascending"');
});
