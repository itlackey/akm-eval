#!/usr/bin/env node
// LLM delegation: one-shot HTTP call to any OpenAI-compatible /v1/chat/completions,
// /v1/embeddings, or /v1/moderations endpoint, using named configs.
//
// Usage:
//   node scripts/delegate.mjs <config_name> "<prompt>" [options]
//
// Options:
//   --context-file <path>   File to include. Image extensions → vision message; other
//                           file types → system message. Repeatable for multiple images.
//   --project-dir <dir>     Project root containing .claude/openai-config.json (default: cwd)
//   --json                  Emit raw JSON response (no human formatting)
//   --max-image-bytes <n>   Warn when an attached image exceeds this size (default: 5_000_000)

import { readFile, access } from "node:fs/promises";
import { extname, resolve, join } from "node:path";
import process from "node:process";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif"]);
const MIME_BY_EXT = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".bmp": "image/bmp", ".webp": "image/webp",
  ".tiff": "image/tiff", ".tif": "image/tiff",
};
const MAGIC_BYTES = [
  { mime: "image/png",  bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif",  bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF...WEBP
];

class DelegationError extends Error {}

function joinUrl(baseUrl, path) {
  const base = String(baseUrl).replace(/\/+$/, "");
  const suffix = String(path).startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function parseArgs(argv) {
  const args = { config: null, prompt: null, contextFiles: [], projectDir: null, json: false, maxImageBytes: 5_000_000 };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--context-file") args.contextFiles.push(argv[++i]);
    else if (a === "--project-dir") args.projectDir = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--max-image-bytes") args.maxImageBytes = Number(argv[++i]);
    else if (a === "-h" || a === "--help") { printHelp(); process.exit(0); }
    else if (a.startsWith("--")) throw new DelegationError(`Unknown flag: ${a}`);
    else positionals.push(a);
  }
  if (positionals.length < 2) {
    printHelp();
    throw new DelegationError("Expected: <config_name> \"<prompt>\"");
  }
  args.config = positionals[0];
  args.prompt = positionals.slice(1).join(" ");
  return args;
}

function printHelp() {
  process.stderr.write(
`Usage: node scripts/delegate.mjs <config> "<prompt>" [options]

Options:
  --context-file <path>   File to include (image → vision; otherwise → system message).
                          Repeatable.
  --project-dir <dir>     Project root with .claude/openai-config.json (default: cwd)
  --json                  Emit raw JSON response
  --max-image-bytes <n>   Warn when image exceeds this size in bytes (default 5_000_000)
`);
}

async function loadConfig(projectDir) {
  const configPath = resolve(projectDir, ".claude", "openai-config.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    return { config: JSON.parse(raw), path: configPath };
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new DelegationError(`Configuration file not found: ${configPath}\nCreate .claude/openai-config.json in your project root.`);
    }
    if (e instanceof SyntaxError) {
      throw new DelegationError(`Invalid JSON in config file: ${e.message}`);
    }
    throw e;
  }
}

function findEndpointForModel(config, model) {
  for (const [id, ep] of Object.entries(config.endpoints ?? {})) {
    if ((ep.available_models ?? []).includes(model)) return id;
  }
  return null;
}

function getApiKey(config, endpointConfig) {
  // Endpoint-level overrides take priority over global api_key_env.
  if (endpointConfig?.api_key_env) {
    return process.env[endpointConfig.api_key_env] ?? null;
  }
  if (endpointConfig?.api_key) {
    return endpointConfig.api_key;
  }
  const envName = config.api_key_env;
  if (envName) return process.env[envName] ?? null;
  return null;
}

function sniffMime(buf) {
  for (const { mime, bytes } of MAGIC_BYTES) {
    if (bytes.every((b, i) => buf[i] === b)) return mime;
  }
  return null;
}

function isImageByExt(path) {
  return IMAGE_EXTS.has(extname(path).toLowerCase());
}

function mimeFor(path, buf) {
  const ext = extname(path).toLowerCase();
  return MIME_BY_EXT[ext] ?? sniffMime(buf) ?? "application/octet-stream";
}

async function buildMessages(prompt, contextFiles, maxImageBytes) {
  const messages = [];
  const textContexts = [];
  const imageParts = [];

  for (const file of contextFiles) {
    let buf;
    try {
      buf = await readFile(file);
    } catch (e) {
      throw new DelegationError(`Context file not readable: ${file} (${e.message})`);
    }

    const sniffed = sniffMime(buf);
    const looksLikeImage = isImageByExt(file) || (sniffed && sniffed.startsWith("image/"));

    if (looksLikeImage) {
      if (buf.length > maxImageBytes) {
        process.stderr.write(`⚠️  ${file} is ${(buf.length / 1024 / 1024).toFixed(2)}MB — vision token cost will be high. Downscale to ≤1024px.\n`);
      }
      const mime = mimeFor(file, buf);
      imageParts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${buf.toString("base64")}` },
      });
    } else {
      textContexts.push(buf.toString("utf-8"));
    }
  }

  if (textContexts.length) {
    messages.push({ role: "system", content: textContexts.join("\n\n---\n\n") });
  }

  if (imageParts.length) {
    messages.push({
      role: "user",
      content: [{ type: "text", text: prompt }, ...imageParts],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }
  return messages;
}

async function makeRequest(url, headers, payload, { skipSslVerify }) {
  // Node fetch honors NODE_TLS_REJECT_UNAUTHORIZED at process start; for per-call
  // bypass we use an Undici Agent so we don't poison other calls.
  let dispatcher;
  if (skipSslVerify) {
    const { Agent } = await import("undici");
    dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    dispatcher,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new DelegationError(`API request failed (${res.status} ${res.statusText})\nURL: ${url}\nResponse: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new DelegationError(`Non-JSON response from ${url}:\n${text}`);
  }
}

async function delegate({ config, prompt, contextFiles, maxImageBytes }, fullConfig) {
  const configs = fullConfig.configs ?? {};
  const cfg = configs[config];
  if (!cfg) {
    const names = Object.keys(configs).join(", ") || "(none)";
    throw new DelegationError(`Config '${config}' not found.\nAvailable configs: ${names}`);
  }

  const model = cfg.model;
  let endpointId = cfg.endpoint;
  if (!endpointId) {
    endpointId = findEndpointForModel(fullConfig, model);
    if (!endpointId) {
      throw new DelegationError(`Model '${model}' not in any endpoint's available_models.\nRun: node scripts/update-models.mjs`);
    }
  }

  const endpoint = (fullConfig.endpoints ?? {})[endpointId];
  if (!endpoint) {
    throw new DelegationError(`Endpoint '${endpointId}' not found in configuration`);
  }

  // base_url_env (name of an env var holding the URL) wins when that var is set.
  const baseUrl = (endpoint.base_url_env && process.env[endpoint.base_url_env]) || (endpoint.base_url ?? "https://api.openai.com");
  const path = endpoint.path ?? "/v1/chat/completions";
  const url = joinUrl(baseUrl, path);

  const messages = await buildMessages(prompt, contextFiles, maxImageBytes);

  const payload = {
    model,
    messages,
    ...(cfg.params ?? {}),
  };

  const headers = { "Content-Type": "application/json" };
  const apiKey = getApiKey(fullConfig, endpoint);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const result = await makeRequest(url, headers, payload, {
    skipSslVerify: endpoint.skip_ssl_verify === true,
  });

  return { result, model, endpointId, baseUrl };
}

function formatResponse(result, configName, model) {
  const lines = [];
  const bar = "=".repeat(80);
  lines.push(bar, `🔄 Delegation Response`, `   Config: ${configName}`, `   Model: ${model}`, bar, "");
  if (result.choices?.length) {
    const choice = result.choices[0];
    lines.push(choice.message?.content ?? choice.text ?? JSON.stringify(choice, null, 2));
  } else if (result.data) {
    lines.push(JSON.stringify(result.data, null, 2));
  } else {
    lines.push(JSON.stringify(result, null, 2));
  }
  lines.push("", bar);
  if (result.usage?.total_tokens) {
    lines.push(`✅ Tokens used: ${result.usage.total_tokens}`);
    lines.push(`   (prompt: ${result.usage.prompt_tokens ?? 0}, completion: ${result.usage.completion_tokens ?? 0})`);
  }
  lines.push(bar);
  return lines.join("\n");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }

  const projectDir = args.projectDir ? resolve(args.projectDir) : process.cwd();

  try {
    const { config: fullConfig } = await loadConfig(projectDir);
    const { result, model } = await delegate({ ...args }, fullConfig);

    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stdout.write(formatResponse(result, args.config, model) + "\n");
    }
  } catch (e) {
    if (e instanceof DelegationError) {
      process.stderr.write(`Error: ${e.message}\n`);
      process.exit(1);
    }
    throw e;
  }
}

await main();
