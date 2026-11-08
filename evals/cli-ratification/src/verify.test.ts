// The verifier's self-tests: every card's verifier against a fake container, with no model, no Docker and no real akm. A reference state
// (what a correct solution leaves behind) must pass, the state the task starts in (the no-op) must fail, and each way of being wrong
// that the design lists must fail: the wrong project's values, both answers, a wrong type, a deleted input, a report that claims
// success, and an old answer copied. The fake akm answers only what the verifier asks (search, show, config get projects, workflow list)
// and models the faults the cards plant, so these tests judge the verifier's logic; the real akm is exercised by `run --check`.

import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { settings, verify } from "../verify/verify.mjs";
import { CARDS, type Card, expectedOf } from "./cards.ts";

const scratch = mkdtempSync(join(tmpdir(), "cli-rat-verify-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const FAKE_AKM = `#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.env.FAKE_ROOT;
const state = JSON.parse(readFileSync(join(root, "fake.json"), "utf8"));
const bundle = process.env.AKM_BUNDLE_DIR;
const [cmd, ...rest] = process.argv.slice(2);
const typeOf = (rel) => ({ memories: "memory", knowledge: "knowledge", workflows: "workflow" })[rel.split("/")[0]];
const meta = (text) => Object.fromEntries([...(/^---\\n([\\s\\S]*?)\\n---/.exec(text)?.[1] ?? "").matchAll(/^(\\w+):\\s*(.*)$/gm)].map((m) => [m[1], m[2]]));
const out = (x) => console.log(JSON.stringify(x));
if (cmd === "search") {
  const words = rest[0].toLowerCase().split(/\\W+/).filter((w) => w.length > 2);
  const here = Object.values(state.projects).find((p) => p.paths.some((x) => process.cwd().endsWith(x)));
  const allowed = here?.filters?.project;
  const hits = state.indexed.filter((rel) => !state.excludeTypes.includes(typeOf(rel))).map((rel) => {
    const text = readFileSync(join(bundle, rel), "utf8");
    return { rel, text, score: words.filter((w) => text.toLowerCase().includes(w)).length };
  }).filter((h) => h.score > 0 && (!allowed || allowed.includes(meta(h.text).project ?? ""))).sort((a, b) => b.score - a.score);
  out({ hits: hits.map((h) => ({ ref: h.rel.replace(/\\.md$/, "") })) });
} else if (cmd === "show") {
  const file = join(bundle, rest[0] + ".md");
  if (!existsSync(file)) { out({ ok: false }); process.exit(1); }
  out({ ref: rest[0], content: readFileSync(file, "utf8") });
} else if (cmd === "config") out(state.projects);
else if (cmd === "workflow") out({ runs: state.runs });
else { out({ ok: false }); process.exit(2); }
`;

interface Box {
  card: Card;
  root: string;
  work: string;
  bundle: string;
  state: { indexed: string[]; excludeTypes: string[]; projects: Record<string, any>; runs: any[] };
  save(): void;
  write(rel: string, text: string): void;
  run(): ReturnType<typeof verify>;
}

const PROJECTS = () => ({ orchid: { paths: ["/work/orchid"] }, quill: { paths: ["/work/quill"] } });
const hiddenPath = (p: string) => p.split("/").some((s) => s.startsWith("."));

/** A fake container in the state the task starts in, after the plant script: what the no-op leaves. */
function start(card: Card): Box {
  const root = mkdtempSync(join(scratch, "c-"));
  const work = join(root, "work", card.project);
  const bundle = join(root, "opt", "akm", "bundle");
  for (const [p, t] of Object.entries(card.workspace)) put(join(work, p), t);
  const library = Object.entries(card.library).filter(([p]) => !hiddenPath(p));
  for (const [p, t] of library) put(join(bundle, p), t);
  for (const [p, t] of Object.entries(card.planted)) put(join(bundle, p), t); // filed after the last index
  const state: Box["state"] = { indexed: library.map(([p]) => p), excludeTypes: [], projects: PROJECTS(), runs: [] };
  if (card.id === "repair--excluded-type") state.excludeTypes = ["memory"];
  if (card.id === "repair--project-filter") state.projects.orchid.filters = { project: ["orchd"] };
  if (card.family === "resume") {
    const name = (card.checks.find((c) => c.type === "workflow-completed")?.ref as string).replace("workflows/", "");
    const receipts = card.checks.find((c) => c.type === "receipts") as { file: string; lines: string[] };
    const done = receipts.lines.length - 1 - (card.id === "resume--release-last" ? 0 : 0);
    put(join(root, receipts.file), `${receipts.lines.slice(0, Math.max(1, done - (card.id === "resume--release-4" ? 1 : 0))).join("\n")}\n`);
    state.runs = [{ id: "run-1", workflowRef: `bundle//workflows/${name}`, status: "failed" }];
  }
  const fake = join(root, "bin", "akm");
  put(fake, FAKE_AKM);
  chmodSync(fake, 0o755);
  put(join(root, "expected.json"), `${JSON.stringify(expectedOf(card))}\n`);
  const box: Box = {
    card, root, work, bundle, state,
    save: () => put(join(root, "fake.json"), JSON.stringify(box.state)),
    write: (rel, text) => put(join(work, rel), text),
    run: () => {
      box.save();
      process.env.FAKE_ROOT = root;
      return verify(join(root, "expected.json"), settings(root, fake));
    },
  };
  box.save();
  return box;
}

function put(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** What a correct solution leaves, read from the card's own checks. */
function solve(box: Box): void {
  const { card } = box;
  for (const c of card.checks as any[]) {
    if (c.type === "json-file") box.write(c.file, `${JSON.stringify(c.exact)}\n`);
    if (c.type === "lines-file") box.write(c.file, `${c.lines.join("\n")}\n`);
    if (c.type === "text-file") box.write(c.file, `${c.text}\n`);
    if (c.type === "selection-file") box.write(c.file, JSON.stringify({ name: c.project, path: `/work/${c.project}`, prefer: { project: c.project } }));
    if (c.type === "jsonl-file") box.write(c.file, `${c.refs.map((ref: string) => JSON.stringify({ ref, content: "x" })).join("\n")}\n`);
    if (c.type === "persisted") {
      const rel = `memories/decision-${card.id.split("--")[1]}.md`;
      put(join(box.bundle, rel), `---\ndescription: ${c.query}\ntags: [${(c.tags as string[]).join(", ")}]\nproject: ${c.project}\n---\nDecision: ${c.value}\n`);
      box.state.indexed.push(rel);
    }
    if (c.type === "lookup") {
      const rel = `${c.ref}.md`;
      if (!box.state.indexed.includes(rel)) box.state.indexed.push(rel);
      box.state.excludeTypes = [];
      for (const p of Object.values(box.state.projects)) delete (p as any).filters;
    }
    if (c.type === "receipts") put(join(box.root, c.file), `${c.lines.join("\n")}\n`);
    if (c.type === "workflow-completed") box.state.runs = [{ id: "run-1", workflowRef: `bundle//${c.ref}`, status: "completed" }];
  }
}

const failed = (r: ReturnType<typeof verify>) => Object.entries(r.checks).filter(([, c]) => !c.ok).map(([n]) => n.replace(/^\d+-/, ""));

describe("every card's verifier", () => {
  for (const card of CARDS()) {
    test(`${card.id}: the reference passes and the no-op fails`, () => {
      const noop = start(card);
      expect(noop.run().reward).toBe(0);
      const ref = start(card);
      solve(ref);
      const r = ref.run();
      expect(failed(r)).toEqual([]);
      expect(r.reward).toBe(1);
    });
  }
});

describe("the worked task, apply--service-json: the failing cases of the design", () => {
  const card = CARDS().find((c) => c.id === "apply--service-json") as Card;
  const [good, absent] = card.checks as any[];
  const [wrongPort, wrongRegion, oldPort, oldRegion] = absent.tokens;
  const attempt = (edit: (box: Box) => void) => {
    const box = start(card);
    solve(box);
    edit(box);
    return box.run();
  };
  const service = (v: unknown) => (box: Box) => box.write("service.json", typeof v === "string" ? v : JSON.stringify(v));

  test("wrong project: the other project's port and region", () => {
    const r = attempt(service({ listen_port: Number(wrongPort), region: wrongRegion }));
    expect(r.reward).toBe(0);
    expect(failed(r)).toEqual(["json-file:service.json", "absent:service.json"]);
  });
  test("both answers: extra keys, or a second answer in one file", () => {
    expect(attempt(service({ ...good.exact, listen_port_quill: Number(wrongPort) })).reward).toBe(0);
    expect(attempt(service({ ...good.exact, region: [good.exact.region, wrongRegion] })).reward).toBe(0);
    expect(attempt(service(`${JSON.stringify(good.exact)}\n${JSON.stringify({ listen_port: Number(wrongPort), region: wrongRegion })}\n`)).reward).toBe(0);
  });
  test("wrong type: the port as a string", () => {
    const r = attempt(service({ listen_port: String(good.exact.listen_port), region: good.exact.region }));
    expect(r.reward).toBe(0);
    expect(r.checks["1-json-file:service.json"].detail).toContain("wanted");
  });
  test("deleted input: the right file, with an application file gone, or changed", () => {
    expect(attempt((box) => rmIf(join(box.work, `app/${Object.keys(card.workspace)[1].split("/")[1]}`))).reward).toBe(0);
    const r = attempt((box) => box.write("README.md", "# changed\n"));
    expect(r.reward).toBe(0);
    expect(failed(r)).toEqual(["preserved"]);
  });
  test("deleted input: a note of the shared knowledge removed from the bundle", () => {
    const r = attempt((box) => rmIf(join(box.bundle, Object.keys(card.library).find((p) => p.startsWith("knowledge/")) as string)));
    expect(failed(r)).toEqual(["preserved"]);
  });
  test("fabricated report: REPORT.md claims the values and service.json was never written", () => {
    const box = start(card);
    box.write("REPORT.md", `Done. service.json holds listen_port ${good.exact.listen_port} and region ${good.exact.region}. Source: the notes.\n`);
    const r = box.run();
    expect(r.reward).toBe(0);
    expect(r.report.present).toBe(true);
    expect(failed(r)).toContain("json-file:service.json");
  });
  test("a good file with no REPORT.md still passes: the report is evidence, not the verdict", () => {
    const r = attempt(() => {});
    expect(r.reward).toBe(1);
    expect(r.report.present).toBe(false);
  });
  test("copied old answer: the archived file from last quarter", () => {
    const archived = readFileSync(join(start(card).work, "archive/service-2025-q4.json"), "utf8");
    expect(archived).toContain(String(oldPort));
    const r = attempt(service(archived));
    expect(r.reward).toBe(0);
    expect(archived).toContain(oldRegion);
  });
});

describe("the other families' failing cases", () => {
  const card = (id: string) => CARDS().find((c) => c.id === id) as Card;
  const attempt = (id: string, edit: (box: Box) => void) => {
    const box = start(card(id));
    solve(box);
    edit(box);
    return box.run();
  };

  test("persist: not indexed, wrong project, duplicated, missing tag, only in the report", () => {
    const id = "persist--release-address";
    const note = (box: Box) => `memories/decision-${id.split("--")[1]}.md`;
    expect(failed(attempt(id, (b) => (b.state.indexed = b.state.indexed.filter((p) => p !== note(b)))))).toEqual(["persisted"]);
    const wrong = attempt(id, (b) => put(join(b.bundle, note(b)), readFileSync(join(b.bundle, note(b)), "utf8").replace(/project: \w+/, "project: quill")));
    expect(wrong.checks["1-persisted"].detail).toContain("has project");
    const twice = attempt(id, (b) => {
      put(join(b.bundle, "memories/again.md"), readFileSync(join(b.bundle, note(b)), "utf8"));
      b.state.indexed.push("memories/again.md");
    });
    expect(twice.checks["1-persisted"].detail).toContain("2 new assets");
    const untagged = attempt(id, (b) => put(join(b.bundle, note(b)), readFileSync(join(b.bundle, note(b)), "utf8").replace(/tags: \[.*\]/, "tags: [other]")));
    expect(untagged.checks["1-persisted"].detail).toContain("lacks the tags");
    const reported = start(card(id));
    reported.write("REPORT.md", "I recorded it in memories/decision.md\n");
    expect(reported.run().checks["1-persisted"].detail).toContain("no new asset");
  });

  test("repair: a search that still misses, or a project dropped to fix it", () => {
    expect(attempt("repair--stale-index", (b) => (b.state.indexed = b.state.indexed.filter((p) => !p.includes("key-rotation")))).reward).toBe(0);
    expect(attempt("repair--excluded-type", (b) => (b.state.excludeTypes = ["memory"])).reward).toBe(0);
    const dropped = attempt("repair--project-filter", (b) => delete b.state.projects.orchid);
    expect(dropped.reward).toBe(0);
    expect(failed(dropped)).toContain("project-config");
    expect(attempt("repair--project-filter", (b) => (b.state.projects.orchid.filters = { project: ["orchd"] })).reward).toBe(0);
  });

  test("resume: the work done twice by a fresh run, a run left failed, or two runs", () => {
    const id = "resume--release-3";
    const receipts = (b: Box) => (b.card.checks.find((c: any) => c.type === "receipts") as any).file as string;
    const fresh = attempt(id, (b) => {
      put(join(b.root, receipts(b)), `${(b.card.checks[0] as any).lines[0]}\n${(b.card.checks[0] as any).lines.join("\n")}\n`);
    });
    expect(failed(fresh)).toEqual(["receipts:" + receipts(start(card(id)))]);
    expect(attempt(id, (b) => (b.state.runs[0].status = "failed")).reward).toBe(0);
    expect(attempt(id, (b) => b.state.runs.push({ ...b.state.runs[0], id: "run-2" })).reward).toBe(0);
  });

  test("regression: the selection akm printed for the configured project, and a pretty-printed array for JSON Lines", () => {
    expect(attempt("regression--1472-selection", (b) => b.write("selection.json", JSON.stringify({ name: "orchid", prefer: { project: "orchid" } }))).reward).toBe(0);
    expect(attempt("regression--1472-selection", (b) => b.write("selection.json", JSON.stringify({ name: "orchid", filters: { project: ["quill"] } }))).reward).toBe(1);
    const array = attempt("regression--1473-pack", (b) => b.write("context.jsonl", JSON.stringify([{ ref: "memories/x", content: "x" }], null, 2)));
    expect(array.checks["1-jsonl-file:context.jsonl"].detail).toContain("not a JSON value on its own");
    expect(attempt("regression--1473-pack", (b) => b.write("context.jsonl", `${JSON.stringify({ ref: "memories/other", content: "x" })}\n`)).reward).toBe(0);
  });
});

function rmIf(file: string): void {
  if (existsSync(file)) rmSync(file);
}
