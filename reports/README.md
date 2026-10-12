# reports

Published public results of the evals, and notes. Raw benchmark datasets and Harbor job directories are kept out of this tree.

- [`retired-evals.md`](retired-evals.md): what the retired evals asked, found and why they ended.
- [`0.10.261003-beta/README.md`](0.10.261003-beta/README.md): Bifrost runs, limitations, and reproduction commands.

Each public run contains its original `summary.json` and `samples.jsonl`. Compare rescoring reads the current repository's public cases; it does not rewrite the published artifacts. Custom cases and private outputs are never included.

```sh
scripts/compare/run --repeats reports/0.10.261003-beta/judge-gate/bifrost-qwen-akm-0.10
```

| akm | eval | label | corpus | model | what it is |
|---|---|---|---|---|---|
| 0.10.261003-beta | agent-ab | [bifrost-gpt120-compatible-pilot](0.10.261003-beta/agent-ab/bifrost-gpt120-compatible-pilot) | public | openai/freellm/gpt-oss:120b | 1 selected cases; demonstration |
| 0.10.261003-beta | agent-ab | [bifrost-gpt120-pilot](0.10.261003-beta/agent-ab/bifrost-gpt120-pilot) | public | openai/freellm/gpt-oss:120b | 1 selected cases; demonstration; 1 errored |
| 0.10.261003-beta | judge-gate | [bifrost-qwen-akm-0.10-r1](0.10.261003-beta/judge-gate/bifrost-qwen-akm-0.10-r1) | public | chat/qwen3.8-27b | full public run |
| 0.10.261003-beta | judge-gate | [bifrost-qwen-akm-0.10-r2](0.10.261003-beta/judge-gate/bifrost-qwen-akm-0.10-r2) | public | chat/qwen3.8-27b | full public run |
| 0.10.261003-beta | longmemeval | [bifrost-gpt120-pilot](0.10.261003-beta/longmemeval/bifrost-gpt120-pilot) | public | freellm/gpt-oss:120b | full public run; 1 errored |
| 0.10.261003-beta | reflect | [bifrost-reflect-example-base-c-r1](0.10.261003-beta/reflect/bifrost-reflect-example-base-c-r1) | public | chat/qwen3.8-27b | 3 selected cases; demonstration |
| 0.10.261003-beta | reflect | [bifrost-reflect-example-base-c-r2](0.10.261003-beta/reflect/bifrost-reflect-example-base-c-r2) | public | chat/qwen3.8-27b | 3 selected cases; demonstration |
| 0.10.261003-beta | reflect | [bifrost-reflect-example-base-c-r3](0.10.261003-beta/reflect/bifrost-reflect-example-base-c-r3) | public | chat/qwen3.8-27b | 3 selected cases; demonstration |
| 0.10.261003-beta | reflect | [bifrost-reflect-example-base-s](0.10.261003-beta/reflect/bifrost-reflect-example-base-s) | public | chat/qwen3.8-27b | 3 selected cases; demonstration |
| 0.10.261003-beta | reflect | [bifrost-reflect-example-filter-off-c-r1](0.10.261003-beta/reflect/bifrost-reflect-example-filter-off-c-r1) | public | chat/qwen3.8-27b | 3 selected cases; demonstration |
| 0.10.261003-beta | reflect | [bifrost-reflect-example-filter-off-c-r2](0.10.261003-beta/reflect/bifrost-reflect-example-filter-off-c-r2) | public | chat/qwen3.8-27b | 3 selected cases; demonstration |
| 0.10.261003-beta | reflect | [bifrost-reflect-example-filter-off-c-r3](0.10.261003-beta/reflect/bifrost-reflect-example-filter-off-c-r3) | public | chat/qwen3.8-27b | 3 selected cases; demonstration |
| 0.10.261003-beta | reflect | [bifrost-reflect-example-filter-off-s](0.10.261003-beta/reflect/bifrost-reflect-example-filter-off-s) | public | chat/qwen3.8-27b | 3 selected cases; demonstration |
| 0.10.261003-beta | terminal-bench | [bifrost-gpt120-pilot](0.10.261003-beta/terminal-bench/bifrost-gpt120-pilot) | public | openai/freellm/gpt-oss:120b | 1 selected cases; demonstration |
