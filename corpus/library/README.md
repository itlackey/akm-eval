# akm-eval library

A public akm library: the shareable assets of the shared bundle our lab's
agents read, kept here as a snapshot. The evals in
[akm-eval](https://github.com/itlackey/akm-eval) use it as their public library,
and anyone can read it as an akm bundle.

## Where it came from

A snapshot of the lab's shared bundle (the private repository
`fwdslsh-shared-bundle`) at commit
`d7479b0a0d2698fe238de41dfabc7613aaea7a61` (2026-09-16). The lab's bundle stays
the live copy; a new snapshot replaces this one when the evals need newer
assets. The git history was not copied. Apart from this README, the files left
out (see "Not in this copy") and the changes below, every file is unchanged.

### Changes since the snapshot

- **No file is here twice.** akm gives a note of a skill a ref from its whole path
  (`skills/<x>/references/a.md` is `knowledge/skills/<x>/references/a`). The library held 24
  copies of such notes under `agents/skills/`, `commands/skills/` and `knowledge/skills/`, 23 of
  them with another text than the original. 17 claimed the ref of the original, and akm
  indexes one of the two files (akm#1050). The other 7 were read as agents or commands, and
  the same text was indexed under a second ref. The copies are removed, with a stray copy of
  `litellm-skill`'s `yaml-manager.ts` under `scripts/skills/`. The files that remain are the
  ones under `skills/`. `evals/retrieval/src/library.test.ts` fails when two files resolve to
  one ref, and when a file of a type folder copies a file of `skills/`.
- **The references are in their skills.** The eight files of `pdf-review` and
  `pdf-layout-reviewer` that sat under `knowledge/skills/print/` are back in the folders of
  those skills, where their `SKILL.md` names them. Their refs are the same.
- **Dangling paths.** `pdf-layout-reviewer` no longer names a `heuristic-rules.json` that is
  not here, `llm-delegation-tool` names `references/QUICKSTART.md` as the file is spelled,
  and `akm-migrate` no longer points to a `references/breaking-changes.md` that is not here.
- **The bundle's old name** is gone from five files, and two `name:` fields that held a path
  (`print/publish-pipeline`, `print/qa-coordinator`) are now the bare name, as in every other
  command and agent.

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
- **Refresh it** on a schedule with `akm bundle update akm-eval-library`. Exit
  code 75 means another akm process holds the index; treat it as "retry next
  time".
- **Changes** go to the lab's shared bundle first and reach this library with
  the next snapshot. akm cannot write through a git bundle.

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

The tree, by folder. Each of the 35 skills is a folder with a `SKILL.md`, and it carries
its own notes, templates and scripts in `references/`, `assets/`, `scripts/` and `examples/`.
akm gives those files refs of their own types.

- **`skills/`**
  - Technical debt and coding, `coding/`: `technical-debt-workflow` and the steps it
    orchestrates (`repository-assessment`, `debt-inventory`, `architecture-review`,
    `dead-code-removal`, `dependency-simplification`, `documentation-sync`,
    `test-gap-analysis`, `refactoring-plan`, `refactoring-executor`, `refactoring-review`,
    `regression-verification`), and `cli-workflow-creator`, `fta-code-quality` and `git-release`.
  - End-to-end testing, `e2e-testing`, with `app-exploration` and `test-implementation`.
  - Agent tooling, `ai-skills/`: `agent-cli-tools`, `opencode-extensions`,
    `opencode-troubleshoot`, `litellm-skill`, `llm-delegation-tool` and `openviking`; and
    `akm-migrate`, for moving between akm releases.
  - Work tracking, `administrative/tracker`: GitHub, Gitea and Azure DevOps.
  - Print and publishing, `print/`: `pagedjs`, `pdfx-print-pipeline`, `pdf-layout-reviewer`,
    `pdf-review`, `print-utilities` and the namespace skill `print`; and `cmyk-image-converter`.
  - Integrations: `gws-setup` for the Google Workspace CLI, and `notify` for Apprise.
- **`agents/`** (19): the technical-debt orchestrator, a web design expert, four Playwright
  agents (explorer, test writer, test reviewer, coverage judge), five print agents, three
  writing agents, and the five `report-*` agents (see "Not in this copy").
- **`commands/`** (18): two technical-debt commands, 13 print commands, and
  `add-package-script`, `complete-github-issue` and `implement-tasks`.
- **`workflows/`** (6): `technical-debt-lifecycle`, `create-github-issues-from-spec`,
  `github-issues-parallel-implementer`, `playwright-full-coverage`, `print-spread-qa-loop` and
  `research-to-knowledge`.
- **`knowledge/`** (5): the Playwright best practices and coverage rubric, and the print fix-team
  dispatch template, measurable design and CSS rubric and designer-eye method. The notes that
  belong to a skill are in that skill's folder.
- **`scripts/skills/coding/technical-debt-workflow/`**: the Python tooling of the technical-debt
  skills (the check runner that writes evidence artifacts, the pack validator, the skill
  evaluation and the pilot replay), with its tests, evaluation cases and the pilot repository
  they run on.

## Not in this copy

Three skills in the lab's shared bundle are marked `license: Proprietary`. They were not
copied, with the agents, commands and knowledge files that belong to them:

- `skills/coding/application-security-review`
- `skills/web-ux/ux-dom-audit`
- `skills/administrative/agent-team-reporting`

The assets built around them stay out as well: for `ux-dom-audit`, the web-ux
parent skill, its three judges, the measurable UX rubric and the two
web-ux-validation-gate workflows; for `agent-team-reporting`, the six `report-*`
commands.

The five `agents/report-*.md` (analyst, orchestrator, researcher, reviewer and writer) belong to
`agent-team-reporting`, which is not here, and they are kept. Each reads as a role prompt that
stands alone, but nothing in this copy says how a run hands work from one to the next or
which commands start it: that is in the skill and its commands.

## Licence

Everything here is MPL-2.0, like the rest of this repository. See `../../LICENSE`.
The items under another licence are listed in `../../NOTICE`: the OpenCode
documentation pages (MIT) and one ICC colour profile.

## Conventions for contributors

- **No private details:** no credentials, hostnames, LAN addresses, personal names
  or project specifics. Put project specifics in that project's own stash, for
  example as `knowledge/print/project-guardrails`.
- **No full filesystem paths:** link to other assets with slash refs such as
  `skills/print/pagedjs`, or with paths relative to the asset. Colon refs such as
  `skill:x` no longer resolve.
- **Credentials through env refs:** read credentials from per-service env files in
  the consumer's stash, as listed above.
