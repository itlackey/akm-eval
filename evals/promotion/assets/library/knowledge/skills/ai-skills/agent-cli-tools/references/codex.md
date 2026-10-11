---
description: Current OpenAI Codex CLI reference for installation, authentication, safe non-interactive execution, output, and troubleshooting
when_to_use: When you need accurate Codex CLI setup or scripting patterns without relying on version-specific flags
updated: 2026-09-15
---

# OpenAI Codex CLI Reference

Codex changes quickly. Treat `codex --help` and `codex exec --help` as the source of truth for
the installed version, and use the official links at the end of this page for current guidance.
Do not copy flags from older examples without checking that they still exist.

## Install and verify

The standalone installer is the simplest option on macOS and Linux:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex --version
```

The npm package is also supported:

```bash
npm install -g @openai/codex
codex --version
```

## Authenticate

Prefer ChatGPT sign-in for interactive use:

```bash
codex login
codex login status
```

For a terminal without a local browser, use `codex login --device-auth`.

For API-key authentication, keep the key out of command history. With an AKM environment,
create `env/openai`, add `OPENAI_API_KEY` to it yourself, and pipe the value directly into the
login command:

```bash
akm env create openai
akm env run env/openai -- sh -c 'printenv OPENAI_API_KEY | codex login --with-api-key'
codex login status
```

Use `codex logout` to remove the saved login. Never paste a key into a command argument, commit
it to a repository, or print it in logs.

## Run non-interactively

Use `codex exec` in scripts, CI, and agent delegation:

```bash
codex exec --sandbox workspace-write -- "Add tests for the parser"
```

For machine-readable progress plus a clean copy of the final response:

```bash
codex exec \
  --sandbox workspace-write \
  --json \
  --output-last-message codex-last-message.txt \
  -- "Review the changes and report any defects"
```

`--json` writes a JSONL event stream to stdout; it is not a single JSON document. Use
`--output-last-message` (short form `-o`) when another program needs only the final response.
Use `--output-schema schema.json` when the final response must follow a JSON Schema.

If the prompt is supplied by a script, stdin avoids quoting problems:

```bash
printf '%s\n' "${TASK}" | codex exec --sandbox workspace-write -
```

## Common `codex exec` options

| Option | Purpose |
|---|---|
| `-s, --sandbox read-only\|workspace-write\|danger-full-access` | Select the command sandbox |
| `-m, --model <MODEL>` | Select a model for this run |
| `-C, --cd <DIR>` | Set the working root |
| `--add-dir <DIR>` | Make an additional directory writable |
| `-i, --image <FILE>...` | Attach one or more images |
| `--json` | Emit execution events as JSONL |
| `-o, --output-last-message <FILE>` | Save the final agent message |
| `--output-schema <FILE>` | Constrain the final response with JSON Schema |
| `--ephemeral` | Do not persist session files |
| `--skip-git-repo-check` | Intentionally run outside a Git repository |
| `-c, --config key=value` | Override one `config.toml` value for this run |
| `--strict-config` | Fail on config fields the installed CLI does not recognize |

Run `codex exec --help` for the complete list supported by the installed version.

## Sandbox selection

Choose the narrowest mode that can complete the task:

- `read-only` for analysis and review that must not edit files.
- `workspace-write` for normal implementation work inside the repository.
- `--add-dir <DIR>` when one specific directory outside the working root must also be writable.
- `danger-full-access` only inside a trusted, dedicated environment where removing the
  filesystem sandbox is intentional.

`--dangerously-bypass-approvals-and-sandbox` removes both protections. The CLI describes it as
appropriate only when an external sandbox already contains the process. Do not use it as a
convenience flag in ordinary automation.

Avoid broad environment inheritance overrides when credentials are present. Give the process
only the secrets and directories the task actually needs.

## Models and local providers

Do not bake a model ID into reusable scripts. Accept it from the caller or rely on the user's
configured default:

```bash
codex exec --sandbox workspace-write --model "${CODEX_MODEL}" -- "Refactor the parser"
```

For a supported local provider:

```bash
codex exec --oss --local-provider ollama -- "Explain this repository"
```

The allowed local-provider values are version-dependent; check `codex exec --help`.

## Images

Attach images with `--image`. Reading the prompt from stdin works reliably in scripts:

```bash
printf '%s\n' "Describe the accessibility problems in this screenshot" \
  | codex exec --sandbox read-only --image screenshot.png -
```

## Project instructions and configuration

Codex discovers `AGENTS.md` project instructions automatically. Current `codex exec` does not
have a `--no-project-doc` flag. Its `--ignore-rules` option refers to exec-policy `.rules` files,
not `AGENTS.md`.

User configuration lives at `~/.codex/config.toml`. Prefer documented settings, and use
`--strict-config` after upgrades to catch stale or misspelled fields. A one-run override uses
TOML syntax:

```bash
codex exec -c 'model_reasoning_effort="high"' --sandbox read-only -- "Review this change"
```

## Troubleshooting

**Authentication fails**

Run `codex login status`. Sign in again with `codex login`, or repeat the API-key login command
without printing the key.

**A documented option is rejected**

Run `codex --version` and `codex exec --help`. Remove any option that is not present in the
installed CLI; several older third-party examples use flags that no longer exist.

**The task needs one directory outside the repository**

Use `--add-dir <DIR>` instead of disabling the sandbox.

**A script needs only the answer, not progress events**

Use `--output-last-message <FILE>`. Do not parse `--json` as a single JSON object.

## Official documentation

- [Codex CLI](https://developers.openai.com/codex/cli/)
- [CLI command reference](https://developers.openai.com/codex/cli/reference/)
- [Authentication](https://developers.openai.com/codex/auth/)
- [Configuration reference](https://developers.openai.com/codex/config-reference/)
