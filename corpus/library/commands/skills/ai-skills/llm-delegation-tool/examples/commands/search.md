---
type: command
name: search
openai_delegation: semantic_search
updated: 2026-03-15
description: Executes semantic similarity searches using embeddings to locate
  relevant content by meaning, returning ranked results with relevance scores
  and snippets from indexed files or directories.
when_to_use: Use when you need to find related documentation, code patterns, or
  lore via natural language queries instead of exact keyword matching.
---

# Semantic Search Command

Find content by meaning using embeddings.

## Usage

```bash
claude-code search "your search query"
```

## Options

```bash
# Use deep search for comprehensive results
claude-code search --delegate=deep_search "query"

# Limit results
claude-code search --limit=10 "query"

# Search specific directory
claude-code search --path=docs/ "query"
```

## How It Works

1. Generates embeddings for your query
2. Compares against indexed content
3. Returns ranked results by semantic similarity
4. Includes relevance scores and snippets

## Output Format

```
🔍 Semantic Search Results

1. [0.89] path/to/file1.md
   Snippet: "...relevant content preview..."
   
2. [0.85] path/to/file2.md
   Snippet: "...relevant content preview..."
   
3. [0.78] path/to/file3.md
   Snippet: "...relevant content preview..."
```

## Examples

```bash
# Find similar mechanics
claude-code search "stealth and hiding mechanics"

# Find lore about a topic
claude-code search "history of the shadow realm"

# Find code with similar functionality
claude-code search "authentication middleware patterns"

# Comprehensive search
claude-code search --delegate=deep_search "complex query requiring thorough analysis"
```

## Tips

- Use natural language, not keywords
- Be descriptive for better results
- Higher scores = more relevant
- Try rephrasing if results aren't relevant
