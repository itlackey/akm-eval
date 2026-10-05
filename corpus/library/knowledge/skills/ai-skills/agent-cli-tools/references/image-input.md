---
description: Reference for attaching image inputs to agent CLIs, including exact
  flags, tested invocations, and performance gotchas for multimodal tasks.
when_to_use: When you need to send an image to an agent CLI for description,
  OCR, UI review, diagram interpretation, or any vision task
updated: 2026-09-15
---

# Image / Multimodal Input

This reference covers how to pass image input to each of the ten agent CLIs in this skill, the exact flag or syntax to use, and gotchas verified by direct testing.

## Quick reference

| Tool | Attach syntax | Notes |
|---|---|---|
| Claude Code | `Read` tool / `--file <id>:<path>` | No `--image` flag; vision via tool use |
| Qwen Code | `--image <path>` (vision model only) | Provider-dependent |
| OpenCode | `--file <path>` after the prompt | Short `-f` before prompt mis-parses |
| Codex | `-i <FILE>` / `--image <FILE>` | Prompt must come via stdin when `-i` is set |
| Gemini CLI | `@<path>` inline in the prompt | Native multimodal; free tier supports vision |
| Amazon Q | `@<path>` inline in the prompt | Claude Sonnet under the hood |
| Goose | provider-dependent | Anthropic/OpenAI providers OK; most Ollama models text-only |
| Pi | `--image <path>` when supported | Provider-dependent |
| Copilot CLI | `--attachment <path>` | Routed through Read tool — token-heavy |
| Aider | `aider <image> --message "..."` | Needs vision-capable model |

## Pre-flight checklist

1. **Confirm the model is multimodal.** Vision is a model capability, not a CLI capability. `gpt-4o`, `gpt-5.x`, `claude-3.5+`, `gemini-1.5+/2.x`, `qwen2-vl`/`qwen3-vl` are vision-capable. Most code-specialised models (devstral, qwen3-coder) and small/local text models are not.
2. **Downscale large images.** Aim for ≤1024px on the long edge. Vision token cost scales with image tile count; gpt-4o-mini in particular tokenises image tiles aggressively (~14k prompt tokens for an 800px image in one test).
3. **Use OAuth where available** — credentials stay in the tool's secure store and never enter the prompt body.

## Tested invocations (2026-05-23)

All commands below were run against the same 800px PNG with the prompt
`"Describe this image in 2 sentences."`

### Claude Code

```bash
# Path A — let the agent call Read on the image path
claude -p "Read test-image.png and describe it in 2 sentences."

# Path B — pre-stage the file as a named resource
claude --file img1:test-image.png -p "Describe img1 in 2 sentences."
```

Claude Code's `Read` tool natively handles `.png`/`.jpg`/`.jpeg`/`.gif`/`.webp` and renders them visually to the model. There is no dedicated `--image` flag. If `claude /login` is OAuth'd, no env var is needed.

### Qwen Code

```bash
# Cloud (DashScope) with a vision-capable Qwen model
qwen-code -p "Describe this image in 2 sentences." --image test-image.png --model "${QWEN_VL_MODEL}"

# Local Ollama with a vision model (e.g. qwen2-vl)
OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_API_KEY=ollama \
  qwen-code -p "describe" --image test-image.png --model qwen2-vl
```

Image input only works if `--model` is a Qwen-VL variant. Coder variants will error or hallucinate.

### OpenCode

```bash
# ✅ correct ordering — prompt first
opencode run "Describe this image in 2 sentences." --file test-image.png

# ❌ this misparses: -f consumes the next positional as a path
opencode run -f test-image.png "Describe this image in 2 sentences."
# Error: File not found: Describe this image in 2 sentences.
```

Use `--file` (long form) after the prompt to avoid the short-flag positional trap.

### Codex

```bash
# ✅ working form — prompt via stdin, image via -i
echo "Describe this image in 2 sentences." | \
  codex exec --skip-git-repo-check -s read-only -i test-image.png

# ❌ broken — when -i is set, codex ignores the positional and waits on stdin
codex exec --skip-git-repo-check -s read-only -i test-image.png \
  "Describe this image in 2 sentences."
# > Reading prompt from stdin...
# > No prompt provided via stdin.
```

`-i` is repeatable: `-i img1.png -i img2.png` attaches multiple images.

### Gemini CLI

```bash
# @path inlines the file as multimodal input
gemini -p "Describe this image in 2 sentences: @test-image.png" --yolo

# Multiple images
gemini -p "Compare @before.png and @after.png" --yolo
```

`@path` is Gemini's universal file-include syntax; works for images, PDFs, audio, and text alike. Free tier supports vision.

### Amazon Q CLI

```bash
# @path inline in the prompt
q chat --no-interactive --trust-all-tools "Describe this image in 2 sentences: @test-image.png"
```

Uses Claude Sonnet as the underlying model — vision works for PNG/JPG.

### Goose

```bash
# Anthropic provider — vision works
goose run --text "Describe @test-image.png in 2 sentences." \
  --provider anthropic --model "${ANTHROPIC_VISION_MODEL}"

# OpenAI provider — vision works
goose run --text "Describe @test-image.png in 2 sentences." \
  --provider openai --model gpt-4o

# Ollama — only works with a vision model
goose run --text "Describe @test-image.png" --provider ollama --model llava
```

Goose passes images through to the selected provider's vision API. Verify the model is multimodal first.

### Pi

```bash
# Provider-dependent; only works when --model is vision-capable
pi -p "Describe this image" \
  --provider anthropic --model "${ANTHROPIC_VISION_MODEL}" \
  --image test-image.png
```

Pi's image flag is provider-passthrough. Check the provider plugin docs for accepted formats.

### Copilot CLI

```bash
# --attachment + --allow-all-tools for headless runs
copilot -p "Describe this image in 2 sentences." \
  --attachment test-image.png --allow-all-tools
```

**Cost warning:** Copilot routes attachments through its `Read` tool rather than embedding them directly. A single 800px image cost 31.5k input tokens in testing. For high-volume vision work prefer Gemini CLI or Codex.

### Aider

```bash
# Pass the image file as a positional path; needs a vision model
aider test-image.png \
  --message "Describe this image in 2 sentences." \
  --model "${AIDER_VISION_MODEL}" --yes
```

Aider adds image paths to the chat context automatically when the model supports vision. With a text-only model the image is silently dropped.

## Output quality (sample comparison)

Same image (a sample logo: an emblem beside a wordmark), same prompt. Outputs are paraphrased
with the wordmark text removed:

| Tool | Output (paraphrased) | Tokens |
|---|---|---|
| Gemini CLI | Read the wordmark correctly; described a stylized icon of two interlocking 'D' letters in yellow and gray, followed by the wordmark in a sleek, gray sans-serif typeface. | n/a (free tier) |
| Codex (gpt-5.4) | Read the wordmark correctly; black-background logo with the wordmark in large gray uppercase letters, and to the left a stylized emblem combining a yellow curved shape and a gray 'D'-like outline. | 6,075 |
| OpenCode (gpt-5.4) | Read the wordmark correctly; wordmark in gray uppercase letters, with a stylized yellow and gray 'D' mark on the left in a bold, modern design, on a white background. | n/a |
| Copilot CLI | Read the wordmark correctly; logo on a black background with the wordmark in large gray uppercase letters, and to the left a stylized yellow-and-gray emblem shaped like a curved 'D'. | ↑31.5k ↓178 |

Gemini caught the interlocking-D detail that other tools missed; Codex and Copilot were most precise about colors and composition.

## Recommendations

- **One-shot image description, lowest cost:** Gemini CLI (free tier, native multimodal, `@path` is concise).
- **Inside an agent loop with other tool use:** Codex `-i` (compact, low token use, supports multiple images).
- **Need OpenAI-only stack:** OpenCode with `--file` and a gpt-4o/gpt-5 model.
- **Avoid for high-volume vision:** Copilot CLI (tool-call overhead inflates tokens ~5×).
- **Avoid entirely:** any tool with a non-multimodal model selected — the image will be silently ignored or trigger a model-side error.

## See also

- `references/claude-code.md`, `references/codex.md`, etc. for full per-tool flag docs
- `skills/ai-skills/llm-delegation-tool` — sibling skill for raw OpenAI-compatible vision calls via `delegate.mjs --context-file <image>`
