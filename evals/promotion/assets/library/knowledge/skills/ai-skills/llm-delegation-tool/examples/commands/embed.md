---
openai_delegation: semantic_search
updated: 2026-03-15
description: Generates vector embeddings from text inputs using configurable
  models like text-embedding-3-small to enable semantic search, similarity
  analysis, and duplicate detection. Supports single queries or batch processing
  with options for normalization, dimension override, and multiple output
  formats including JSON, CSV, and NumPy arrays.
when_to_use: Use when preparing data for vector databases, implementing
  Retrieval-Augmented Generation (RAG) pipelines, analyzing document similarity,
  clustering related content, or preprocessing text before feeding into semantic
  search engines and nearest-neighbor query systems.
---

# Generate Embeddings Command

Generate embeddings for text content to enable semantic search and similarity comparison.

## Usage

```bash
claude-code embed "text to embed..."
claude-code embed --file content.txt
claude-code embed --batch files/*.md
```

## What This Does

1. Generates vector embeddings using text-embedding-3-small
2. Returns embeddings as JSON or saves to file
3. Can process single texts or batch multiple files

## Output Options

**JSON output (default):**
```json
{
  "text": "input text",
  "embedding": [0.123, -0.456, ...],
  "dimensions": 512,
  "model": "text-embedding-3-small",
  "tokens_used": 12
}
```

**Save to file:**
```bash
claude-code embed --file input.txt --output embeddings.json
```

**Batch processing:**
```bash
claude-code embed --batch lore/*.md --output-dir embeddings/
```

## Use Cases

**Build a semantic search index:**
```bash
claude-code embed --batch content/**/*.md --output-dir .embeddings/
```

**Compare similarity:**
```bash
# Generate embeddings for two texts and compare
claude-code embed "text 1" > embed1.json
claude-code embed "text 2" > embed2.json
claude-code similarity embed1.json embed2.json
```

**Find duplicates:**
```bash
claude-code embed --batch posts/*.md --find-duplicates --threshold 0.95
```

## Configuration

Uses the `semantic_search` delegation config:
- 512-dimension embeddings (good balance of speed and quality)
- text-embedding-3-small model
- Batch support enabled

## Options

- `--dimensions N`: Override embedding dimensions (256, 512, 1536, 3072)
- `--model MODEL`: Use different model (text-embedding-3-large)
- `--normalize`: L2 normalize the vectors
- `--format FORMAT`: Output format (json, csv, numpy)

## Advanced Usage

**Use larger model for better quality:**
```bash
claude-code embed --model text-embedding-3-large --dimensions 3072 "complex text..."
```

**Process with custom config:**
```bash
claude-code embed "@delegate:deep_search" --file important-doc.md
```
