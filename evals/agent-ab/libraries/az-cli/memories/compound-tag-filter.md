---
description: How to select az resources on several tags at once, with AND/OR JMESPath filters for az CLI --query, and how to project columns as tsv
tags: [az-cli, jmespath, tags, query, filtering]
observed_at: "2026-05-01"
---

`az resource list --tag` selects on one tag. To select on several tags at once, filter in `--query`. az CLI `--query` uses JMESPath, and compound conditions use `&&` (AND) and `||` (OR) inside `[?...]`.

Correct example (resources tagged env=prod AND team=ops):
`az resource list --query "[?tags.env=='prod' && tags.team=='ops']"`

Correct example (the same, with name and group as tab-separated columns):
`az resource list --query "[?tags.env=='prod' && tags.team=='ops'].[name,resourceGroup]" -o tsv`

Correct example (either tag matches):
`az resource list --query "[?tags.env=='prod' || tags.env=='staging']"`

Common trap — using Python-style `and`/`or` keywords: `[?tags.env=='prod' and tags.team=='ops']` is invalid JMESPath and returns an empty result silently. JMESPath spells them `&&` and `||`.

Quoting: single quotes wrap string literals inside the JMESPath expression; the outer double quotes wrap the whole `--query` argument. Swapping them causes a shell parse error.
