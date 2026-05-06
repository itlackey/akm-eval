# akm-eval

Evaluate AI memory backends across benchmark packs. Run a pack against a backend, compare results
across runs, and generate reports — all from the CLI.

**Supported packs:** akm-bench, terminal-bench, swe-bench, longmemeval, beam, locomo  
**Supported backends:** none, akm, raw-vector, mem0, openviking, zep

## Install

```bash
bun install
bun src/cli.ts doctor   # verify your environment
```

## Run an eval

```bash
# single pack + variant
bun src/cli.ts run --pack <pack-id> --variant <variant-id> --config config/examples/memory-comparison.json

# full comparison matrix from config
bun src/cli.ts matrix --config config/examples/memory-comparison.json
```

## Compare and report

```bash
# compare two result folders
bun src/cli.ts compare --baseline runs/baseline --candidate runs/candidate

# report on a single result folder
bun src/cli.ts report --run runs/my-result
```

## Explore available packs and variants

```bash
bun src/cli.ts list packs
bun src/cli.ts list variants
```

## Development

```bash
bun test                 # run tests
bun run check:boundary   # verify import boundaries
bun run lint             # lint source
```

See [`docs/`](docs/) for architecture details, result schema, and interpreting results.
