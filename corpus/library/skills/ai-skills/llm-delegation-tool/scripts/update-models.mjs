#!/usr/bin/env node
// Refresh available_models lists in .claude/openai-config.json by querying
// /v1/models on the configured endpoints.
//
// Usage:
//   node scripts/update-models.mjs [options]
//
// Options:
//   --config <path>     Path to openai-config.json (default: .claude/openai-config.json)
//   --endpoint <id>     Only refresh this endpoint (default: all that have api_key/api_key_env)
//   --dry-run           Show changes without writing
//   --api-key <key>     Override API key (otherwise use config's api_key_env or endpoint api_key)
//   --base-url <url>    Override base_url (defaults to each endpoint's base_url_env value, then base_url)

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const EMBEDDING_PATTERNS = ["embedding", "embed"];
const MODERATION_PATTERNS = ["moderation"];
const CHAT_PATTERNS = ["gpt", "o1", "o3", "o4", "chatgpt", "claude", "gemini", "qwen", "llama", "mistral", "phi", "deepseek"];

class UpdateError extends Error {}

function joinUrl(baseUrl, path) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const suffix = String(path).startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function parseArgs(argv) {
  const args = { configPath: ".claude/openai-config.json", endpoint: null, dryRun: false, apiKey: null, baseUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") args.configPath = argv[++i];
    else if (a === "--endpoint") args.endpoint = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--api-key") args.apiKey = argv[++i];
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else throw new UpdateError(`Unknown argument: ${a}`);
  }
  return args;
}

function printHelp() {
  process.stderr.write(
`Usage: node scripts/update-models.mjs [options]

Options:
  --config <path>    Path to openai-config.json (default: .claude/openai-config.json)
  --endpoint <id>    Only refresh this endpoint
  --dry-run          Show changes without writing
  --api-key <key>    Override API key
  --base-url <url>   Override base_url
`);
}

function categorize(modelId) {
  const low = modelId.toLowerCase();
  if (EMBEDDING_PATTERNS.some((p) => low.includes(p))) return "embeddings";
  if (MODERATION_PATTERNS.some((p) => low.includes(p))) return "moderation";
  if (CHAT_PATTERNS.some((p) => low.includes(p))) return "chat";
  return "chat";
}

function resolveApiKey(args, fullConfig, endpoint) {
  if (args.apiKey) return args.apiKey;
  if (endpoint.api_key_env) return process.env[endpoint.api_key_env] ?? null;
  if (endpoint.api_key) return endpoint.api_key;
  if (fullConfig.api_key_env) return process.env[fullConfig.api_key_env] ?? null;
  return null;
}

async function fetchModels(baseUrl, apiKey, { skipSslVerify }) {
  const url = joinUrl(baseUrl, "/v1/models");
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let dispatcher;
  if (skipSslVerify) {
    const { Agent } = await import("undici");
    dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  }

  const res = await fetch(url, { headers, dispatcher });
  if (!res.ok) {
    throw new UpdateError(`Failed to fetch ${url}: ${res.status} ${res.statusText}\n${await res.text()}`);
  }
  const json = await res.json();
  return (json.data ?? []).map((m) => m.id).filter(Boolean);
}

function diffArrays(oldList = [], newList = []) {
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);
  return {
    added: newList.filter((x) => !oldSet.has(x)),
    removed: oldList.filter((x) => !newSet.has(x)),
  };
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2); }

  const configPath = resolve(args.configPath);
  let fullConfig;
  try {
    fullConfig = JSON.parse(await readFile(configPath, "utf-8"));
  } catch (e) {
    process.stderr.write(`Error loading ${configPath}: ${e.message}\n`);
    process.exit(1);
  }

  const endpoints = fullConfig.endpoints ?? {};
  const targets = args.endpoint
    ? (endpoints[args.endpoint] ? [[args.endpoint, endpoints[args.endpoint]]] : [])
    : Object.entries(endpoints);

  if (!targets.length) {
    process.stderr.write(`No endpoints to update.\n`);
    process.exit(1);
  }

  const allChanges = [];

  for (const [endpointId, endpoint] of targets) {
    const baseUrl = args.baseUrl ?? ((endpoint.base_url_env && process.env[endpoint.base_url_env]) || (endpoint.base_url ?? "https://api.openai.com"));
    const apiKey = resolveApiKey(args, fullConfig, endpoint);

    process.stderr.write(`▶ ${endpointId} (${baseUrl})\n`);
    let modelIds;
    try {
      modelIds = await fetchModels(baseUrl, apiKey, { skipSslVerify: endpoint.skip_ssl_verify === true });
    } catch (e) {
      process.stderr.write(`  skipped: ${e.message.split("\n")[0]}\n`);
      continue;
    }

    // If the endpoint already declares a category (chat / embeddings / moderation by path),
    // bucket models accordingly; otherwise let categorize() decide.
    const path = endpoint.path ?? "/v1/chat/completions";
    let bucket = null;
    if (path.includes("/embeddings")) bucket = "embeddings";
    else if (path.includes("/moderations")) bucket = "moderation";
    else if (path.includes("/chat")) bucket = "chat";

    const relevant = bucket
      ? modelIds.filter((id) => categorize(id) === bucket)
      : modelIds;

    const newModels = [...new Set(relevant)].sort();
    const { added, removed } = diffArrays(endpoint.available_models, newModels);

    if (added.length || removed.length) {
      endpoint.available_models = newModels;
      allChanges.push({ endpointId, total: newModels.length, added, removed });
    } else {
      process.stderr.write(`  no changes (${newModels.length} models)\n`);
    }
  }

  if (!allChanges.length) {
    process.stderr.write(`\n✓ All endpoint model lists up to date.\n`);
    return;
  }

  process.stderr.write(`\nChanges:\n`);
  for (const c of allChanges) {
    process.stderr.write(`\n[${c.endpointId}] now ${c.total} models\n`);
    for (const m of c.added) process.stderr.write(`  + ${m}\n`);
    for (const m of c.removed) process.stderr.write(`  - ${m}\n`);
  }

  if (args.dryRun) {
    process.stderr.write(`\nDry run — no changes written.\n`);
    return;
  }

  await writeFile(configPath, JSON.stringify(fullConfig, null, 2) + "\n");
  process.stderr.write(`\n✓ Wrote ${configPath}\n`);
}

await main().catch((e) => {
  process.stderr.write(`Error: ${e.message}\n`);
  process.exit(1);
});
