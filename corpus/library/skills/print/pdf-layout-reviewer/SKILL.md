---
name: pdf-layout-reviewer
description: Automated PDF layout review pipeline (heuristics + optional vision
  + selective deep review) for print/POD preflight.
when_to_use: >-
  Use for batch/automated review of rendered PDFs. This is the right skill when
  you need programmatic, repeatable analysis of a PDF file using heuristics,
  vision models, and AI-powered deep review. It produces structured JSON +
  markdown reports.


  Invoke this skill when the user:


  - Asks to 'review' or 'check' a PDF file for print quality


  - Mentions 'print production', 'pre-flight', 'layout issues', or 'margin
  problems'


  - Wants to validate a PDF before sending to a printer


  - Needs print compliance verification


  - Wants automated, repeatable quality metrics


  - Examples:
    - 'Review my-book.pdf for print quality issues'
    - 'Check layout on document.pdf before printing'
    - 'Quick margin check on chapter-3.pdf'
    - 'Full pre-flight review of game-manual.pdf'

  Not this skill? For final human-style visual sign-off before POD submission
  (GO/FIX/NO-GO verdict with page-numbered callouts), use `pdf-review` instead.
updated: 2026-06-19
lint_skip:
  - stale-path
---

# PDF Layout Reviewer

You are a PDF layout review specialist that performs comprehensive print production quality checks on PDF files.

## When to Use This Skill

**Use for batch/automated review of rendered PDFs.** This is the right skill when you need programmatic, repeatable analysis of a PDF file using heuristics, vision models, and AI-powered deep review. It produces structured JSON + markdown reports.

Invoke this skill when the user:
- Asks to "review" or "check" a PDF file for print quality
- Mentions "print production", "pre-flight", "layout issues", or "margin problems"
- Wants to validate a PDF before sending to a printer
- Needs print compliance verification
- Wants automated, repeatable quality metrics
- Examples:
  - "Review my-book.pdf for print quality issues"
  - "Check layout on document.pdf before printing"
  - "Quick margin check on chapter-3.pdf"
  - "Full pre-flight review of game-manual.pdf"

**Not this skill?** For final human-style visual sign-off before POD submission (GO/FIX/NO-GO verdict with page-numbered callouts), use `pdf-review` instead.

## What This Skill Does

Analyzes PDF documents for print production issues using a 6-stage workflow with complementary analysis:

1. **PDF Preprocessing**: Extract pages as images and detailed metrics
2. **Heuristic Validation**: Precise technical measurements (margins, fonts, spacing)
3. **VLM Artistic Design Review**: Expert art director critique (visual hierarchy, typography artistry, professional polish) - Optional
4. **Intelligent Page Selection**: Prioritize pages for expensive Claude review
5. **Claude Deep Review**: Expert AI combining technical validation + design critique
6. **Report Generation**: Comprehensive actionable report merging all findings

**Division of Labor**:
- **Heuristics**: Technical measurements and rule-based validation
- **VLM**: Artistic design critique from award-winning art director perspective
- **Claude**: Deep expert review combining both technical and aesthetic analysis

## Setup and Dependencies

### First-Time Setup

When this skill is invoked for the first time, perform these setup steps:

1. **Check Python Environment**
   ```bash
   python3 --version  # Should be 3.8+
   ```

2. **Create Virtual Environment** (if not exists)
   ```bash
   cd pdf-layout-reviewer
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install Python Dependencies**
   ```bash
   pip install pymupdf pdfplumber pdf2image Pillow pyyaml requests anthropic
   # Note: 'ollama' SDK not required - we use REST API via 'requests'
   ```

4. **Check Dependencies**
   - **Vision Language Model Server** (optional, for Stage 3 analysis)
     - Choose one provider:
       - **Ollama** (recommended for local): https://ollama.com/download
       - **LM Studio** (GUI, easy setup): https://lmstudio.ai
       - **OpenAI-compatible API** (Together.AI, Groq, etc.)

     - Example: Ollama setup
       ```bash
       ollama pull gemma3:12b-it-qat  # Recommended model
       ollama serve  # Start server on http://localhost:11434
       ```

     - No detailed provider setup needed - just ensure server is running

   - **poppler-utils** (for pdf2image on Linux):
     ```bash
     sudo apt-get install poppler-utils  # Ubuntu/Debian
     ```

5. **Verify API Access**
   - Check for ANTHROPIC_API_KEY in environment
   - Or use Claude Code's existing credentials

### Configuration

Load configuration from `config/review-config.yaml`. Key settings:
- `review.thoroughness`: fast | standard | thorough
- `vision.enabled`: Enable/disable Stage 3 VLM analysis
- `vision.provider`: Which server type — `ollama`, `lmstudio`, or `openai-compatible`
- `vision.model`: Model name for the selected provider
- `vision.host`: Base URL for the vision server
- `claude.enabled`: Enable/disable Claude API
- `claude.max_pages_per_review`: Limit Claude pages (cost control)
- `output.format`: json | markdown | both

## Workflow Execution

### Step 1: Gather Information and Select Profile

Ask the user:
1. **PDF file path** (required)
2. **Review profile** (optional, default: standard)

   **Detect from user request**:
   - Keywords: "quick", "fast", "rapid" → Use **quick** profile
   - Keywords: "standard", "normal", "regular" → Use **standard** profile
   - Keywords: "thorough", "comprehensive", "complete", "full", "pre-flight" → Use **thorough** profile
   - No keywords → Use **standard** profile (default)

   **Profile Descriptions**:
   - **quick**: Heuristics only, $0, 5-10 min
   - **standard**: Heuristics + Ollama + selective Claude, ~$0.10-0.30, 15-30 min
   - **thorough**: Full pipeline + comprehensive Claude, ~$0.25-0.80, 30-60 min

3. **Output directory** (optional, default: `/tmp/pdf-review-{timestamp}`)

### Step 2: Load Profile Configuration

```bash
cd pdf-layout-reviewer

# Load the selected profile (quick, standard, or thorough)
PROFILE="standard"  # or quick, thorough based on user request

# Copy profile to temp config for this run
CONFIG_PATH="config/profiles/${PROFILE}.yaml"

# Inform user
echo "Using ${PROFILE} profile:"
echo "  $(python3 scripts/load_profile.py ${PROFILE} | grep -A 2 'Use when')"
```

### Step 3: Create Temporary Directory

```bash
TEMP_DIR="/tmp/pdf-review-$(date +%s)"
mkdir -p "$TEMP_DIR"
```

### Step 4: Stage 1 - PDF Preprocessing

```bash
# Activate virtual environment
source venv/bin/activate

# Extract pages as images
python scripts/extract_pages.py \
  /path/to/input.pdf \
  "$TEMP_DIR" \
  --dpi 300 \
  --color-space RGB

# Analyze layout metrics
python scripts/analyze_metrics.py \
  /path/to/input.pdf \
  "$TEMP_DIR"
```

**Output**: `$TEMP_DIR/extraction-metadata.json`, `$TEMP_DIR/metrics.json`, `$TEMP_DIR/pages/*.png`

### Step 5: Stage 2 - Heuristic Validation

```bash
python scripts/heuristic_checker.py \
  "$TEMP_DIR/metrics.json" \
  references/heuristic-rules.json \
  "$TEMP_DIR"
```

**Output**: `$TEMP_DIR/flagged-pages.json`

**Decision Point**: If `thoroughness = "fast"`, skip to Stage 6.

### Step 6: Stage 3 - VLM Analysis (Optional)

```bash
# Only if config.vision.enabled = true
# Read provider, model, and host from config — do not hardcode a provider here.

VLM_PROVIDER=$(python3 -c "import yaml; c=yaml.safe_load(open('$CONFIG_PATH')); print(c['vision']['provider'])")
VLM_MODEL=$(python3 -c "import yaml; c=yaml.safe_load(open('$CONFIG_PATH')); print(c['vision']['model'])")
VLM_HOST=$(python3 -c "import yaml; c=yaml.safe_load(open('$CONFIG_PATH')); print(c['vision']['host'])")

python3 scripts/vlm_batch.py \
  "$TEMP_DIR/flagged-pages.json" \
  "$TEMP_DIR/pages" \
  --provider "$VLM_PROVIDER" \
  --model "$VLM_MODEL" \
  --host "$VLM_HOST" \
  --output-dir "$TEMP_DIR" \
  --batch-size 3 \
  --timeout 90
```

**Output**: `$TEMP_DIR/vlm-findings.json` (if successful)

**Provider options** (set `vision.provider` in `review-config.yaml`):
```bash
# Ollama (local)        — provider: ollama,             host: http://localhost:11434
# LM Studio (local)    — provider: lmstudio,            host: http://localhost:1234
# Together.AI (remote) — provider: openai-compatible,   host: https://api.together.xyz
```

**Error Handling**:
- If server not available, skip and warn user
- No provider-specific setup required in skill
- Works with any OpenAI-compatible vision endpoint

### Step 7: Stages 4-6 - Page Selection, Claude Review, Report Generation

```bash
# Build command
CMD="python scripts/generate_report.py \
  $TEMP_DIR/metrics.json \
  $TEMP_DIR/flagged-pages.json \
  $TEMP_DIR/pages \
  --standards-file references/print-standards.md \
  --output-dir $TEMP_DIR \
  --output-format both \
  --claude-model claude-sonnet-4.5-20250929 \
  --max-pages 20 \
  --use-caching"

# Add VLM findings if available (supports both new and legacy names)
if [ -f "$TEMP_DIR/vlm-findings.json" ]; then
  CMD="$CMD --vlm-findings $TEMP_DIR/vlm-findings.json"
elif [ -f "$TEMP_DIR/ollama-findings.json" ]; then
  CMD="$CMD --ollama-findings $TEMP_DIR/ollama-findings.json"
fi

# Skip Claude if fast mode or no API key
if [ "$THOROUGHNESS" = "fast" ] || [ -z "$ANTHROPIC_API_KEY" ]; then
  CMD="$CMD --no-claude"
fi

# Execute
$CMD
```

**Output**:
- `$TEMP_DIR/pdf-review-report.json`
- `$TEMP_DIR/pdf-review-summary.md`

### Step 8: Present Results

Display the markdown summary to the user:

```bash
cat "$TEMP_DIR/pdf-review-summary.md"
```

**Also mention**:
- Full JSON report location
- Processing time and costs (if applicable)
- Top 3 critical issues (if any)
- Recommended action plan

## Cost Optimization

- **Fast mode**: $0 (all local)
- **Standard mode**: ~$0.10-0.30 (selective Claude)
- **Thorough mode**: ~$0.25-0.80 (comprehensive Claude)

**Cost reduction features**:
1. Heuristics eliminate 70-80% of pages from deeper review
2. Local VLM provides free intermediate validation
3. Intelligent page selection limits Claude API calls
4. Prompt caching reduces token costs by 90%
5. Only send pages that truly need expert judgment to Claude

## Error Handling

### Common Issues

1. **PDF file not found**
   - Verify path and ask user to provide correct location

2. **Python dependencies missing**
   - Run installation command: `pip install pymupdf pdfplumber pdf2image Pillow pyyaml requests anthropic`

3. **VLM server not available**
   - Warn user, skip Stage 3, continue without VLM analysis
   - Suggest: "VLM server not available. Continuing with heuristics only."
   - User can start any compatible server (Ollama, LM Studio, etc.)

4. **Model not available**
   - Check server is running: `curl http://localhost:11434/` (or appropriate port)
   - Verify model exists (provider-specific command)
   - Try alternative model with `--model` flag

5. **No Anthropic API key**
   - Check environment: `echo $ANTHROPIC_API_KEY`
   - If not found: "No API key found. Running without Claude analysis. Set ANTHROPIC_API_KEY to enable expert review."

6. **anthropic library not installed**
   - Install: `pip install anthropic`

7. **Large PDF (>500 pages)**
   - Warn about processing time
   - Suggest splitting or reviewing sections

## Output Interpretation

### Critical Issues (🔴)
Issues that will cause print failures. **Must fix before printing**.
- Content in trim zone (will be cut off)
- Gutter too narrow (text hidden in binding)
- Font too small (unreadable)
- Low resolution images (pixelated)

### Major Issues (🟡)
Quality problems that should be fixed for professional appearance.
- Inconsistent margins
- Widows/orphans
- Tight line spacing
- Column width problems

### Minor Issues (🔵)
Best practice recommendations, nice-to-have improvements.
- Excessive whitespace
- Unbalanced columns
- Typography rivers

### Patterns
Systemic issues affecting multiple pages. Fixing the pattern resolves many issues at once.
- Example: "Right margin varies 0.65\"-0.85\" 
... [truncated — focus on the visible portion]
