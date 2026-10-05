---
description: Quick reference guide for troubleshooting Opencode CLI issues
  including startup failures, authentication errors, and MCP server connection
  problems.
when_to_use: Consult this map when experiencing immediate application crashes,
  login failures, model loading errors, or tool unavailability to identify root
  causes and apply quick fixes.
updated: 2026-05-15
---
# Symptom Map: Quick Triage Reference

Fast lookup from what the user sees to the most likely cause and fix.

## Startup Failures

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| "OpenCode won't start" | Corrupted config, bad plugin, port conflict | Run `opencode --print-logs`, check logs in `~/.local/share/opencode/log/` |
| Hangs on splash screen | Plugin blocking init, MCP server timeout | Disable plugins: set `"plugin": []` in config |
| Blank window (Desktop) | WebView2 missing (Windows), Wayland issue (Linux) | Windows: install WebView2. Linux: try `OC_ALLOW_WAYLAND=1` or X11 |
| "Connection Failed" dialog | Custom server URL misconfigured, port conflict | Clear desktop default server URL; unset `OPENCODE_PORT` |
| Crashes immediately | Corrupted cache, incompatible plugin version | Clear cache: `rm -rf ~/.cache/opencode` |

## Authentication & Provider Errors

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| `ProviderInitError` | Invalid/corrupted auth config | `opencode auth list`; if broken: `rm -rf ~/.local/share/opencode` then re-auth |
| `AI_APICallError` | Outdated provider packages | Clear cache: `rm -rf ~/.cache/opencode` and restart |
| `ProviderModelNotFoundError` | Wrong model name format | Must be `provider/model` format; run `opencode models` to see valid names |
| "Model not available" | Missing auth for provider, wrong subscription | `opencode auth login`; check API key validity |
| API rate limiting | Too many requests to provider | Wait, or switch to alternative provider/model |
| "Authentication issues" | Expired or invalid API key/OAuth token | Re-auth with `/connect` in TUI or `opencode auth login` |

## MCP Server Issues

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| MCP tools unavailable | Server not connected, crashed on start | `opencode mcp list` to check status |
| MCP connection failed | Bad command path, missing env vars, timeout | `opencode mcp debug <server>`; test command manually |
| OAuth MCP auth expired | Token expired | `opencode mcp logout <server>` then `opencode mcp auth <server>` |
| MCP tools not triggering hooks | Known limitation (#2319) | MCP tools bypass `tool.execute.before/after` hooks; use event handlers instead |
| MCP server startup slow | Cold boot latency | Use `opencode serve` + `opencode run --attach` to keep servers warm |

## Plugin Issues

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| Plugin not loading | Wrong directory, bad export, syntax error | Check `.opencode/plugins/` or `~/.config/opencode/plugins/`; verify default/named export |
| Plugin hooks not firing | Wrong hook name, MCP tool (bypasses hooks) | Verify hook name matches exactly; check if it's an MCP tool |
| Stale plugin behavior | Cached old version | Clear: `rm -rf ~/.cache/opencode/node_modules/` |
| Plugin crashes OpenCode | Unhandled exception in plugin | Disable all plugins, re-enable one at a time |
| Plugin dependencies missing | Missing `package.json` in `.opencode/` | Create `.opencode/package.json` with required deps |

## Session & Context Issues

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| Responses cut off | Context overflow, aggressive compaction | Enable auto-compaction; split tasks; use subagents |
| Frequent compaction | Large context, many file reads | Use `opencode-dynamic-context-pruning` plugin; be specific with file refs |
| Session unresponsive | Stuck API call, deadlocked plugin | `Ctrl+C` to abort; or SDK: `client.session.abort()` |
| Lost session data | Data pruning, manual deletion | Check `~/.local/share/opencode/project/` for storage dirs |
| Can't continue session | Session ID invalid, project mismatch | `opencode session list` to find valid IDs |

## Tool & Permission Issues

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| "Tool X not found" | Tool disabled in config, missing file | Check `tools` config; verify file in `.opencode/tools/` |
| Operations blocked | Permission config too restrictive | Check `permission` config; use `"ask"` instead of `"deny"` for debugging |
| Agent can't use tools | Agent-level tool restrictions | Check agent frontmatter `tools:` config |
| Custom tool schema error | Invalid Zod schema | Verify schema syntax; test with `bun test` |

## Performance Issues

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| Slow responses | Large context, expensive model, network latency | Check `opencode stats`; consider smaller model for simple tasks |
| High token usage | No pruning, broad file patterns | Enable `opencode-tokenscope` plugin; use specific file refs |
| File watcher issues | Too many watched files, rapid changes | Add ignore patterns to `watcher.ignore` config |
| High memory usage | Many sessions, large project | `ps aux | grep opencode`; clear old sessions |

## Desktop App Issues

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| UI frozen | WebView crash, plugin issue | macOS: OpenCode menu → Reload Webview |
| Notifications missing | OS settings, window focused | Check OS notification settings; notifications only show when unfocused |
| Desktop won't start after crash | Corrupted app state | Delete `opencode.settings.dat`, `opencode.global.dat`, `opencode.workspace.*.dat` |
| Clipboard not working (Linux) | Missing clipboard utility | Install `xclip`, `xsel` (X11) or `wl-clipboard` (Wayland) |

## Network Issues

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| Can't reach provider API | Firewall, proxy, DNS | Test: `curl -I https://api.anthropic.com`; check proxy env vars |
| WebSocket errors | SSL/TLS issue, proxy stripping upgrade headers | Verify WSS connectivity; check reverse proxy config |
| Slow model list | Stale models.dev cache | `opencode models --refresh` |
