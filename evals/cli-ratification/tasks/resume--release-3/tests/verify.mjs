// The verifier of every cli-ratification task. The generator copies this file, unchanged, into each task's tests/ next to its
// expected.json; Harbor uploads tests/ into the container only after the agent has exited, so the agent never sees the expected values.
//
//   node verify.mjs EXPECTED_JSON
//
// It judges the state the agent left behind and nothing it said: REPORT.md is recorded as a diagnostic and is never read for a verdict.
// It writes $ROOT/logs/verifier/reward.json ({"reward": 0|1}, 1 only when every check passes) and checks.json (every check, its verdict
// and what it saw, which the collector keeps for classifying a failure).
//
// Settings: VERIFY_ROOT (default "") is prepended to the container paths /work, /opt/akm and /logs, so a test can build a fake container;
// AKM_CMD (default "akm") is the akm to run for the retrieval checks. akm runs with the directories the arm gave the agent, in the task's
// working directory, as a new process: the agent's shell, its caches and its environment are gone.
//
// A change here is a new version of the eval: change `version` in ../src/measurement.ts by hand.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Where things are, from VERIFY_ROOT (default "") and AKM_CMD (default "akm"). */
export const settings = (root = process.env.VERIFY_ROOT ?? "", cmd = process.env.AKM_CMD ?? "akm") => {
  const akmRoot = `${root}/opt/akm`;
  return {
    root,
    cmd,
    akmRoot,
    logs: `${root}/logs/verifier`,
    env: { AKM_BUNDLE_DIR: `${akmRoot}/bundle`, AKM_CONFIG_DIR: `${akmRoot}/config`, AKM_DATA_DIR: `${akmRoot}/data`, AKM_CACHE_DIR: `${akmRoot}/cache`, AKM_STATE_DIR: `${akmRoot}/state`, AKM_AUTO_FEEDBACK: "0", AKM_AUTO_LEARNING: "0", AKM_AUTO_MEMORY: "0", AKM_INDEX_ON_SESSION_END: "0" },
  };
};

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const sha256Text = (text) => createHash("sha256").update(text).digest("hex");
const read = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);
const word = (token) => new RegExp(`(?<![\\w-])${String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i");

/** Every file under `dir` (relative paths with /), hidden folders such as .git left out. */
function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".git")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else if (e.isFile()) out.push(p.slice(base.length + 1));
  }
  return out;
}

/** akm as a new process; its stdout as JSON, or null. */
function akm(ctx, args) {
  const r = spawnSync(ctx.cmd, args, { cwd: existsSync(ctx.workdir) ? ctx.workdir : undefined, env: { ...process.env, ...ctx.env }, encoding: "utf8", timeout: 120000 });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {}
  return { status: r.status, json, text: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** The frontmatter akm writes and reads: `key: value`, `key: [a, b]`, and a key whose value is a block list of `- item` lines. */
const frontmatter = (text) => {
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
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ok = (detail = "") => ({ ok: true, detail });
const bad = (detail) => ({ ok: false, detail });

// ---- the checks ------------------------------------------------------------------------------------------------------------

const CHECKS = {
  /** A JSON file with exactly these keys and these values of exactly these types. Extra keys, a second answer or a wrong type fail. */
  "json-file"(c, ctx) {
    const text = read(join(ctx.workdir, c.file));
    if (text === null) return bad(`${c.file} is missing`);
    let value;
    try {
      value = JSON.parse(text);
    } catch (e) {
      return bad(`${c.file} is not JSON: ${e.message}`);
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return bad(`${c.file} is not a JSON object`);
    const want = Object.keys(c.exact).sort();
    const got = Object.keys(value).sort();
    if (!same(want, got)) return bad(`${c.file} has keys ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    for (const k of want) if (!same(value[k], c.exact[k])) return bad(`${c.file}: ${k} is ${JSON.stringify(value[k])}, wanted ${JSON.stringify(c.exact[k])}`);
    return ok();
  },

  /** A text file whose non-blank lines are exactly these lines. */
  "lines-file"(c, ctx) {
    const text = read(join(ctx.workdir, c.file));
    if (text === null) return bad(`${c.file} is missing`);
    const got = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const want = c.lines;
    const missing = want.filter((l) => !got.includes(l));
    const extra = got.filter((l) => !want.includes(l));
    return missing.length || extra.length || got.length !== want.length ? bad(`${c.file}: missing ${JSON.stringify(missing)}, unexpected ${JSON.stringify(extra)}`) : ok();
  },

  /** A text file that is exactly this text, trimmed. */
  "text-file"(c, ctx) {
    const text = read(join(ctx.workdir, c.file));
    if (text === null) return bad(`${c.file} is missing`);
    return text.trim() === c.text ? ok() : bad(`${c.file} holds ${JSON.stringify(text.trim().slice(0, 80))}, wanted ${JSON.stringify(c.text)}`);
  },

  /** A file that holds none of these tokens: the other project's values and the stale ones. A missing file holds none, and fails its own check. */
  absent(c, ctx) {
    const text = read(join(ctx.workdir, c.file)) ?? "";
    const found = c.tokens.filter((t) => word(t).test(text));
    return found.length ? bad(`${c.file} holds ${JSON.stringify(found)}`) : ok();
  },

  /** The files the task gave, still as they were: the workspace's and the bundle's. `bodies` are notes whose text must stay but whose metadata may change (a correction demotes the note it supersedes). */
  preserved(c, ctx) {
    const problems = [];
    for (const [rel, sum] of Object.entries(c.workspace ?? {})) {
      const f = join(ctx.workdir, rel);
      if (!existsSync(f)) problems.push(`${rel} is gone`);
      else if (sha256(f) !== sum) problems.push(`${rel} changed (sha256 ${sha256(f).slice(0, 12)}, ${statSync(f).size} bytes, wanted ${sum.slice(0, 12)})`);
    }
    for (const [rel, sum] of Object.entries(c.bundle ?? {})) {
      const f = join(ctx.bundle, rel);
      if (!existsSync(f)) problems.push(`bundle ${rel} is gone`);
      else if (sha256(f) !== sum) problems.push(`bundle ${rel} changed (sha256 ${sha256(f).slice(0, 12)}, wanted ${sum.slice(0, 12)})`);
    }
    for (const [rel, sum] of Object.entries(c.bodies ?? {})) {
      const f = join(ctx.bundle, rel);
      if (!existsSync(f)) problems.push(`bundle ${rel} is gone`);
      else if (sha256Text(readFileSync(f, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "")) !== sum) problems.push(`bundle ${rel}: the text changed`);
    }
    return problems.length ? bad(problems.join("; ")) : ok();
  },

  /**
   * A decision was written down: exactly one asset the task did not give holds the value, it carries the project (and the tags the task
   * asked for), and a new akm process finds it by a plain search from the project's directory and shows the value.
   */
  persisted(c, ctx) {
    const given = new Set(Object.keys(c.known));
    const fresh = walk(ctx.bundle).filter((rel) => rel.endsWith(".md") && !given.has(rel) && c.types.some((t) => rel.startsWith(`${t}/`)));
    const holding = fresh.filter((rel) => word(c.value).test(read(join(ctx.bundle, rel)) ?? ""));
    if (holding.length === 0) return bad(`no new asset holds ${JSON.stringify(c.value)} (new assets: ${JSON.stringify(fresh)})`);
    if (holding.length > 1) return bad(`${holding.length} new assets hold ${JSON.stringify(c.value)}: ${JSON.stringify(holding)}`);
    const rel = holding[0];
    const meta = frontmatter(read(join(ctx.bundle, rel)));
    if (meta.project !== c.project) return bad(`${rel} has project ${JSON.stringify(meta.project)}, wanted ${JSON.stringify(c.project)}`);
    const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [];
    const missing = (c.tags ?? []).filter((t) => !tags.includes(t));
    if (missing.length) return bad(`${rel} lacks the tags ${JSON.stringify(missing)}`);
    const ref = rel.replace(/\.md$/, "");
    const found = akm(ctx, ["search", c.query, "--limit", "20", "--format", "json"]);
    const refs = (found.json?.hits ?? found.json?.results ?? []).map((h) => h.ref);
    if (!refs.includes(ref)) return bad(`a new search for ${JSON.stringify(c.query)} does not find ${ref} (it finds ${JSON.stringify(refs.slice(0, 5))})`);
    const shown = akm(ctx, ["show", ref, "--format", "json"]);
    if (!word(c.value).test(String(shown.json?.content ?? ""))) return bad(`akm show ${ref} does not show ${JSON.stringify(c.value)}`);
    return ok(ref);
  },

  /** A plain search from the project's directory, in a new process, finds this asset. */
  lookup(c, ctx) {
    const found = akm(ctx, ["search", c.query, "--limit", "20", "--format", "json"]);
    const refs = (found.json?.hits ?? found.json?.results ?? []).map((h) => h.ref);
    return refs.includes(c.ref) ? ok() : bad(`a new search for ${JSON.stringify(c.query)} does not find ${c.ref} (exit ${found.status}; it finds ${JSON.stringify(refs.slice(0, 5))})`);
  },

  /** The project is still registered for its directory, and nothing else of the project config was dropped. */
  "project-config"(c, ctx) {
    const got = akm(ctx, ["config", "get", "projects", "--format", "json"]).json;
    const problems = [];
    for (const [name, paths] of Object.entries(c.paths)) if (!same(got?.[name]?.paths, paths)) problems.push(`projects.${name}.paths is ${JSON.stringify(got?.[name]?.paths)}, wanted ${JSON.stringify(paths)}`);
    return problems.length ? bad(problems.join("; ")) : ok();
  },

  /** The side effects of the workflow's steps, written by the steps themselves, each exactly once and in order. */
  receipts(c, ctx) {
    const text = read(join(ctx.root, c.file));
    if (text === null) return bad(`${c.file} is missing`);
    const got = text.split("\n").map((l) => l.trim()).filter(Boolean);
    return same(got, c.lines) ? ok() : bad(`${c.file} holds ${JSON.stringify(got)}, wanted ${JSON.stringify(c.lines)}`);
  },

  /** The workflow has one run, and akm says it completed. */
  "workflow-completed"(c, ctx) {
    const list = akm(ctx, ["workflow", "list", "--format", "json"]);
    const runs = (list.json?.runs ?? list.json?.results ?? []).filter((r) => String(r.workflowRef ?? "").endsWith(c.ref));
    if (runs.length !== 1) return bad(`${runs.length} runs of ${c.ref}: ${JSON.stringify(runs.map((r) => r.status))}`);
    return runs[0].status === "completed" ? ok(runs[0].id) : bad(`the run of ${c.ref} is ${runs[0].status}`);
  },

  /** JSON Lines: every non-blank line is one JSON object with a string `ref` and a non-empty string `content`, and these refs are among them. */
  "jsonl-file"(c, ctx) {
    const text = read(join(ctx.workdir, c.file));
    if (text === null) return bad(`${c.file} is missing`);
    const refs = [];
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) return bad(`${c.file} is empty`);
    for (const [i, line] of lines.entries()) {
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        return bad(`${c.file} line ${i + 1} is not a JSON value on its own`);
      }
      if (typeof rec !== "object" || rec === null || Array.isArray(rec)) return bad(`${c.file} line ${i + 1} is not a JSON object`);
      if (typeof rec.ref !== "string" || typeof rec.content !== "string" || rec.content === "") return bad(`${c.file} line ${i + 1} lacks a ref or content`);
      refs.push(rec.ref);
    }
    const missing = c.refs.filter((r) => !refs.includes(r));
    if (missing.length) return bad(`${c.file} lacks ${JSON.stringify(missing)}`);
    if (c.max_chars && text.length > c.max_chars) return bad(`${c.file} is ${text.length} characters, over ${c.max_chars}`);
    return ok();
  },
};

// ---- the run ---------------------------------------------------------------------------------------------------------------

export function verify(expectedFile, config = settings()) {
  const expected = JSON.parse(readFileSync(expectedFile, "utf8"));
  const ctx = { ...config, workdir: `${config.root}${expected.workdir}`, bundle: `${config.akmRoot}/bundle` };
  const checks = {};
  expected.checks.forEach((c, i) => {
    const name = `${i + 1}-${c.type}${c.file ? `:${c.file}` : ""}`;
    try {
      checks[name] = CHECKS[c.type] ? CHECKS[c.type](c, ctx) : bad(`unknown check type ${c.type}`);
    } catch (e) {
      checks[name] = bad(`the check crashed: ${e.message}`);
    }
  });
  const report = read(join(ctx.workdir, "REPORT.md"));
  const reward = Object.values(checks).every((c) => c.ok) ? 1 : 0;
  return { reward, checks, report: { present: report !== null, bytes: report === null ? 0 : Buffer.byteLength(report) } };
}

if (process.argv[1]?.endsWith("verify.mjs")) {
  const config = settings();
  const result = verify(process.argv[2], config);
  mkdirSync(config.logs, { recursive: true });
  writeFileSync(join(config.logs, "checks.json"), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(config.logs, "reward.json"), `${JSON.stringify({ reward: result.reward })}\n`);
  for (const [name, c] of Object.entries(result.checks)) console.log(`${c.ok ? "ok  " : "FAIL"} ${name} ${c.detail}`);
  console.log(`reward ${result.reward}`);
}
