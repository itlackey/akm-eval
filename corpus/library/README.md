# akm-eval library

General akm assets that every agent reads as a shared bundle, so no agent keeps
its own copy of common skills.

This library used to be the separate repository `akm-shared`. It now lives here,
in `corpus/library` of [akm-eval](https://github.com/itlackey/akm-eval). Some
assets still use the old name, for example `author: akm-shared contributors`.

## Where it came from

Copied from akm-shared at commit `d7479b0a0d2698fe238de41dfabc7613aaea7a61`
(2026-09-16). The git history was not copied. Apart from this README and the
files left out (see "Not in this copy"), every file is unchanged.

## Using it

- **Add it** as a read-only git bundle of https://github.com/itlackey/akm-eval
  with the component root set to `corpus/library` and the adapter set to `akm`.
  In your akm config (`~/.config/akm/config.json`):

  ```json
  {
    "bundles": {
      "akm-eval-library": {
        "git": "https://github.com/itlackey/akm-eval.git",
        "components": { "main": { "root": "corpus/library", "adapter": "akm" } }
      }
    }
  }
  ```

  You can also add a filesystem bundle whose path is `corpus/library` in a clone.
  akm resolves a plain ref such as `skills/print/pagedjs` from your own stash
  first, so delete your own copy of an asset when you want the shared one to win.
  If your agents already have a bundle named `akm-shared`, point that bundle at
  this repository and keep the name, so refs such as
  `akm-shared//skills/print/pagedjs` keep working.
- **Refresh it** on a schedule with `akm bundle update akm-eval-library`. Exit
  code 75 means another akm process holds the index; treat it as "retry next
  time".
- **Change it** by committing and pushing akm-eval with git. akm cannot write
  through a git bundle.

## What you provide in your own stash

Shared assets carry no credentials, hostnames, addresses or project details. Each
consumer keeps those in its own primary stash, and the assets reach them through
akm refs.

### Env files

Run a command with them through `akm env run env/<name> -- <command>`.

| Env ref | Used by | Variables |
|---|---|---|
| `env/tracker` | `skills/administrative/tracker` | Set only the platforms you use: `GH_TOKEN` or `GITHUB_TOKEN`; `GITEA_URL` and `GITEA_TOKEN`; `AZURE_DEVOPS_ORG` (the full `https://dev.azure.com/<org>` URL), `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT` |
| `env/anthropic` | `skills/ai-skills/agent-cli-tools` | `ANTHROPIC_API_KEY` |
| `env/openai` | `skills/ai-skills/agent-cli-tools`, `skills/ai-skills/llm-delegation-tool` | `OPENAI_API_KEY`; optional `OPENAI_BASE_URL` |
| `env/gemini` | `skills/ai-skills/agent-cli-tools` | `GEMINI_API_KEY`; optional `GOOGLE_API_KEY` |
| `env/dashscope` | `skills/ai-skills/agent-cli-tools` | `DASHSCOPE_API_KEY` |
| `env/github` | `skills/ai-skills/agent-cli-tools` | `GH_TOKEN` or `COPILOT_GITHUB_TOKEN` |
| `env/groq`, `env/openrouter`, `env/mistral`, `env/xai` | `skills/ai-skills/agent-cli-tools` | `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `XAI_API_KEY` |
| `env/aws` | `skills/ai-skills/agent-cli-tools` (Amazon Q) | Optional `AWS_PROFILE`, `AWS_REGION`, or short-lived access keys |
| `env/local-llm` | `skills/ai-skills/llm-delegation-tool` | Optional `LOCAL_LLM_BASE_URL`; `LOCAL_LLM_API_KEY` if your server needs one |

### Secrets and settings

- **gws-setup** keeps Google Workspace credentials in your stash's `secrets/.gws/`,
  and a service-account key in `secrets/gcloud-credentials.json`. Its scripts find
  your stash through `--bundle-dir`, then `AKM_BUNDLE_DIR`, then akm's default bundle.
- **notify** reads `APPRISE_NOTIFY_CONFIG` and `APPRISE_NOTIFY_TITLE` from the
  environment, or falls back to Apprise's default config locations.

### Knowledge for the print assets

The print agents, commands and workflows load these with `akm show <ref>`.

- **Required:**
  - `knowledge/print/design/brand-guide`: your project's brand guide and token roles.
  - `knowledge/print/pipelines/preview-qa-guide`
  - `knowledge/print/pagedjs-failure-modes`
  - `knowledge/print/pipelines/print-specs`
  - `knowledge/print/pipelines/gutterpress-commands`
  - `knowledge/print/design/css-architecture`
  - `knowledge/print/design/gutterpress-styling-guide`
- **Optional:**
  - `knowledge/print/project-guardrails`: expected page counts, token contrast
    rules, and other project-specific review rules.
  - `knowledge/print/design/print-design-guide`
  - `knowledge/print/INDEX`
  - `knowledge/print/pipelines/tac-limiting-guide`

Every print command uses the `gutterpress` CLI directly or a script in
`skills/print/print-utilities`; none depends on scripts from a consumer's own
project. Markdown linting runs through `gutterpress validate` and only reports
when the project supplies a `.markdownlint.*` config (or sets
`validate.source.markdownlint` in its manifest).

## Contents

- **Development:** coding and technical-debt skills, end-to-end and Playwright
  testing with their coverage rubric and best practices, web UX gate workflows and
  judges with their measurable rubric, report analysis commands and agents, and
  writing agents.
- **Agent tooling:** agent CLI delegation, OpenCode extensions and troubleshooting,
  LiteLLM and OpenAI-compatible delegation, OpenViking.
- **Work tracking:** tracker for GitHub, Gitea and Azure DevOps.
- **Print and publishing:** Paged.js, PDF layout and visual review, CMYK conversion,
  the print commands and agents, the spread QA loop, and the fix-team dispatch
  template and measurable design and CSS rubric.
- **Integrations:** gws-setup for the Google Workspace CLI, and notify for Apprise.

## Not in this copy

Three skills in akm-shared are marked `license: Proprietary`. They were not
copied, with the agents, commands and knowledge files that belong to them:

- `skills/coding/application-security-review`
- `skills/web-ux/ux-dom-audit`
- `skills/administrative/agent-team-reporting`

The assets built around them stay out as well: for `ux-dom-audit`, the web-ux
parent skill, its three judges, the measurable UX rubric and the two
web-ux-validation-gate workflows; for `agent-team-reporting`, the six `report-*`
commands.

## Licence

Everything here is CC BY 4.0. See `../LICENSE`. The items under another licence
are listed in `../NOTICE`: the OpenCode documentation pages (MIT), one ICC colour
profile, and the agent-cli-tools skill (MIT).

## Conventions for contributors

- **No private details:** no credentials, hostnames, LAN addresses, personal names
  or project specifics. Put project specifics in that project's own stash, for
  example as `knowledge/print/project-guardrails`.
- **No full filesystem paths:** link to other assets with slash refs such as
  `skills/print/pagedjs`, or with paths relative to the asset. Colon refs such as
  `skill:x` no longer resolve.
- **Credentials through env refs:** read credentials from per-service env files in
  the consumer's stash, as listed above.
