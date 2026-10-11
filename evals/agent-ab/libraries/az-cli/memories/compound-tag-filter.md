---
description: How to select az resources on several tags at once, project columns, and when a JMESPath filter is needed instead
tags: [az-cli, jmespath, tags, query, filtering]
observed_at: "2026-05-01"
---

To select resources on several tags at once, repeat `--tag`, one `<key>=<value>` for each tag. Add a `--query` projection for the columns you want and `-o tsv` for tab-separated output.

Correct example (resources tagged env=stage and team=ops, name and group as tab-separated columns):
`az resource list --tag env=stage --tag team=ops --query "[].{name:name,group:resourceGroup}" -o tsv`

az CLI `--query` uses JMESPath. A filter inside `[?...]` is for what `--tag` cannot say, such as either of two values, written with `||`:
`az resource list --query "[?tags.env=='prod' || tags.env=='staging']"`

Common trap — using Python-style `and`/`or` keywords: `[?tags.env=='prod' and tags.team=='ops']` is invalid JMESPath and returns an empty result silently. JMESPath spells them `&&` and `||`.

Quoting: single quotes wrap string literals inside the JMESPath expression; the outer double quotes wrap the whole `--query` argument. Swapping them causes a shell parse error.
