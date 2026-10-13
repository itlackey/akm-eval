import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { presentRun } from "./data";

interface Element {
  value: string;
  checked: boolean;
  innerHTML: string;
  textContent: string;
  listeners: Record<string, () => void>;
  onclick?: () => void;
  add: (option: unknown) => void;
  addEventListener: (type: string, fn: () => void) => void;
}
interface Click {
  target: { closest: (type: string) => { dataset: Record<string, string> } | null };
}

test("public ledger filters, sorts, escapes external labels and exports only the selection", async () => {
  const html = readFileSync(new URL("../../../site/index.html", import.meta.url), "utf8");
  const script = readFileSync(new URL("../../../site/assets/ledger.js", import.meta.url), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]!);
  expect(new Set(ids).size).toBe(ids.length);
  const elements = new Map<string, Element>(ids.map(id => [id, {
    value: "", checked: false, innerHTML: "", textContent: "", listeners: {} as Record<string, () => void>, add() {},
    addEventListener(type: string, fn: () => void) { this.listeners[type] = fn; },
  }]));
  const el = (id: string) => elements.get(id)!;
  const rows = [false, true].map((errored, index) => presentRun({
    summary: { eval: "reflect", corpus: "public", status: "complete", label: index ? '<img src=x onerror="alert(1)">' : "base",
      date: `2026-10-13T0${index}:00:00Z`, akm_version: "version", n_scored: errored ? 1 : 2, n_errored: errored ? 1 : 0,
      metrics: { defects: { n: 1, correct: 1, rate: 1 }, controls: { n: 1, correct: 1 } } },
    samples: [{ id: "a", correct: true }, { id: "b", correct: true }], path: `version/reflect/run-${index}`, sourceRevision: "revision",
  })!);
  const dataset = { runs: rows, latest_groups: [{ ids: rows.map(row => row.id), variation: { flip_rate: 0, kind: "correctness", n: 1, unstable: 0 } }],
    latest_collection_date: "2026-10-13T01:00:00Z", source_revision: "revision" };
  let onClick: (event: Click) => void = () => {};
  const downloads: Blob[] = [];
  const context = vm.createContext({
    fetch: async (url: string) => { expect(url).toBe("./data.json"); return { ok: true, json: async () => dataset }; },
    document: {
      getElementById: (id: string) => { expect(elements.has(id)).toBe(true); return el(id); },
      addEventListener: (_type: string, fn: (event: Click) => void) => { onClick = fn; },
      createElement: () => ({ click() {} }),
    },
    Option: class { constructor(_text: string, _value: string) {} }, Blob,
    URL: { createObjectURL: (blob: Blob) => { downloads.push(blob); return "blob:fixture"; }, revokeObjectURL() {} },
    setTimeout: (fn: () => void) => fn(),
  });
  await vm.runInContext(script, context);
  expect(el("count").textContent).toContain("2 of 2 runs");
  expect(el("samples").textContent).toBe("4");
  expect(el("body").innerHTML).toContain("&lt;img");
  expect(el("body").innerHTML).not.toContain("<img");
  expect(el("latestBody").innerHTML).toContain("1 / 2 · 1 errors");
  el("errorsOnly").checked = true; el("errorsOnly").listeners.change!();
  expect(el("count").textContent).toContain("1 of 2 runs");
  el("json").onclick!();
  const exported = JSON.parse(await downloads.at(-1)!.text());
  expect(exported.runs).toHaveLength(1); expect(exported.runs[0].errors).toBe(1);
  expect(exported.latest_groups).toEqual([]);
  el("csv").onclick!(); expect((await downloads.at(-1)!.text()).split("\r\n")).toHaveLength(2);
  el("reset").onclick!();
  el("search").value = "no-match"; el("search").listeners.input!();
  expect(el("body").innerHTML).toContain("No matching runs");
  el("reset").onclick!();
  onClick({ target: { closest: type => type === "[data-sort]" ? { dataset: { sort: "errors" } } : null } });
  el("json").onclick!(); const sorted = JSON.parse(await downloads.at(-1)!.text());
  expect(sorted.runs.map((row: { errors: number }) => row.errors)).toEqual([0, 1]);
  onClick({ target: { closest: type => type === "[data-id]" ? { dataset: { id: rows[1]!.id } } : null } });
  expect(el("body").innerHTML).toContain("Original summary JSON");
  expect(el("body").innerHTML).not.toContain("<img");
});
