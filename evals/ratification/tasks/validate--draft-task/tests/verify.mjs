// The verifier of every ratification task. The generator copies this file, unchanged, into each task's tests/ next to its expected.json; Harbor
// uploads tests/ into the container only after the agent has exited, so the agent never sees what is checked.
//
//   node verify.mjs EXPECTED_JSON
//
// It judges the state the agent left behind and nothing it said, with no model. It writes $ROOT/logs/verifier/reward.json ({"reward": 0|1}, 1 only when
// every check passes) and checks.json (every check, its verdict and what it saw).
//
// Settings: VERIFY_ROOT (default "") is prepended to /work, /opt/akm and /logs, so a test can build a fake container; AKM_CMD (default "akm") is the akm
// the checks that run one use, as a new process with the directories the arm gave the agent.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

export const settings = (root = process.env.VERIFY_ROOT ?? "", cmd = process.env.AKM_CMD ?? "akm") => {
  const akmRoot = `${root}/opt/akm`;
  return {
    root,
    cmd,
    akmRoot,
    bundle: `${akmRoot}/bundle`,
    logs: `${root}/logs/verifier`,
    env: { AKM_BUNDLE_DIR: `${akmRoot}/bundle`, AKM_CONFIG_DIR: `${akmRoot}/config`, AKM_CONFIG_FILE: `${akmRoot}/config/akm.json`, AKM_DATA_DIR: `${akmRoot}/data`, AKM_CACHE_DIR: `${akmRoot}/cache`, AKM_STATE_DIR: `${akmRoot}/state`, AKM_AUTO_FEEDBACK: "0", AKM_AUTO_LEARNING: "0", AKM_AUTO_MEMORY: "0", AKM_INDEX_ON_SESSION_END: "0" },
  };
};

const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** Every file under `dir` (relative paths with /). */
function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else if (e.isFile()) out.push(p.slice(base.length + 1));
  }
  return out;
}

/** A frontmatter value: `key: value`, `key: [a, b]`, or a key followed by `- item` lines. */
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const out = {};
  if (!m) return out;
  let key = null;
  for (const line of m[1].split("\n")) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && key && Array.isArray(out[key])) {
      out[key].push(item[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    out[key] = v === "" ? [] : v.startsWith("[") ? v.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean) : v.replace(/^["']|["']$/g, "");
  }
  return out;
}

/** The rows of a query on akm's state.db, read-only; null when it cannot be read. */
function query(ctx, sql, ...args) {
  try {
    const Database = createRequire(import.meta.url)(`${ctx.akmRoot}/cli/node_modules/better-sqlite3`);
    const db = new Database(`${ctx.akmRoot}/data/state.db`, { readonly: true });
    try {
      return db.prepare(sql).all(...args);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** akm as a new process: its stdout as JSON, or null. */
function akm(ctx, args) {
  const r = spawnSync(ctx.cmd, args, { cwd: existsSync(`${ctx.root}/work`) ? `${ctx.root}/work` : undefined, env: { ...process.env, ...ctx.env }, encoding: "utf8", timeout: 120000 });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {}
  return { status: r.status, json, text: r.stdout ?? "" };
}

const path = (ctx, p) => p.replace("$BUNDLE", ctx.bundle).replace(/^\/work/, `${ctx.root}/work`);

/** One check: { ok, saw }. */
const CHECKS = {
  file_equals: (ctx, c) => {
    const text = read(path(ctx, c.path));
    return { ok: text !== null && text.trim() === c.text, saw: text === null ? "no such file" : text.trim().slice(0, 200) };
  },
  file_exists: (ctx, c) => ({ ok: existsSync(path(ctx, c.path)), saw: "" }),
  file_contains: (ctx, c) => {
    const text = read(path(ctx, c.path));
    return { ok: text !== null && text.includes(c.text), saw: text === null ? "no such file" : "" };
  },
  file_absent_text: (ctx, c) => {
    const text = read(path(ctx, c.path));
    return { ok: text !== null && !text.includes(c.text), saw: text === null ? "no such file" : "" };
  },
  // A memory in the bundle that holds the fact, with the description and the tags.
  memory: (ctx, c) => {
    const found = walk(`${ctx.bundle}/memories`).map((f) => read(`${ctx.bundle}/memories/${f}`)).filter((t) => t?.includes(c.contains));
    const fm = found.map(frontmatter);
    const hit = fm.find((f) => f.description === c.description && (c.tags ?? []).every((t) => (Array.isArray(f.tags) ? f.tags : String(f.tags ?? "").split(",")).map((x) => x.trim().toLowerCase()).includes(t)));
    return { ok: hit !== undefined, saw: found.length ? JSON.stringify(fm) : "no memory holds the fact" };
  },
  // A knowledge document in the bundle that holds the text, which a search finds.
  knowledge: (ctx, c) => {
    const files = walk(`${ctx.bundle}/knowledge`).filter((f) => read(`${ctx.bundle}/knowledge/${f}`)?.includes(c.contains));
    if (!files.length) return { ok: false, saw: "no knowledge document holds the text" };
    if (!c.search) return { ok: true, saw: files.join(",") };
    const r = akm(ctx, ["search", c.search]);
    const hit = (r.json?.hits ?? []).some((h) => files.some((f) => `knowledge/${f}`.replace(/\.md$/, "") === h.ref));
    return { ok: hit, saw: `${files.join(",")}; search hits: ${(r.json?.hits ?? []).map((h) => h.ref).join(",")}` };
  },
  feedback: (ctx, c) => {
    const rows = query(ctx, "SELECT ref, metadata_json FROM events WHERE event_type = 'feedback'");
    if (rows === null) return { ok: false, saw: "state.db could not be read" };
    const mine = rows.filter((r) => r.ref.endsWith(c.ref)).map((r) => JSON.parse(r.metadata_json));
    const hit = mine.some((m) => m.signal === c.signal && new RegExp(c.reason, "i").test(m.reason ?? ""));
    return { ok: hit, saw: JSON.stringify(mine).slice(0, 300) };
  },
  // The task ran through akm: a completed row of its history.
  task_ran: (ctx, c) => {
    const rows = query(ctx, "SELECT status FROM task_history WHERE task_id = ?", c.id);
    return { ok: (rows ?? []).some((r) => r.status === "completed"), saw: JSON.stringify(rows) };
  },
  proposal: (ctx, c) => {
    const rows = query(ctx, "SELECT ref, status FROM proposals WHERE ref LIKE ?", `%${c.ref}`);
    return { ok: (rows ?? []).length > 0 && rows.every((r) => r.status === c.status), saw: JSON.stringify(rows) };
  },
  akm_show: (ctx, c) => {
    const r = akm(ctx, ["show", c.ref]);
    return { ok: r.status === 0 && r.text.includes(c.text), saw: r.text.slice(0, 120) };
  },
  bundle_lacks: (ctx, c) => {
    const [dir, pattern] = c.glob.split("/");
    const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    const found = walk(`${ctx.bundle}/${dir}`).filter((f) => re.test(f));
    return { ok: found.length === 0, saw: found.join(",") };
  },
};

export function verify(expected, ctx = settings()) {
  const checks = {};
  expected.checks.forEach((c, i) => {
    let r;
    try {
      r = CHECKS[c.type](ctx, c);
    } catch (e) {
      r = { ok: false, saw: `check threw: ${e.message}` };
    }
    checks[`${i + 1}-${c.type}`] = r;
  });
  const reward = Object.values(checks).every((c) => c.ok) ? 1 : 0;
  return { reward, checks };
}

if (import.meta.main ?? process.argv[1]?.endsWith("verify.mjs")) {
  const ctx = settings();
  const result = verify(JSON.parse(readFileSync(process.argv[2], "utf8")), ctx);
  mkdirSync(ctx.logs, { recursive: true });
  writeFileSync(`${ctx.logs}/reward.json`, JSON.stringify({ reward: result.reward }));
  writeFileSync(`${ctx.logs}/checks.json`, JSON.stringify({ checks: result.checks }, null, 2));
  console.log(JSON.stringify(result));
}
