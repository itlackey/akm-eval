# Docker runner

Use the [root setup](../README.md#set-up-with-docker) to choose `AKM_EVAL_IMAGE`
and create `AKM_EVAL_WORK`. Docker is the only host runtime required. The image
contains the eval source, Bun, Node/npm, Python, uv, pinned Harbor, locked AKM
and TypeScript dependencies, and the native bge-small embedding model. Before a full
run, read the README's [Before an expensive run](../README.md#before-an-expensive-run):
the banner to check, concurrency to pick, and how to stop a run.

Run any eval by appending its command and flags:

```sh
docker run --rm --init --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$AKM_EVAL_WORK,dst=$AKM_EVAL_WORK" \
  --workdir "$AKM_EVAL_WORK" "$AKM_EVAL_IMAGE" \
  benchmarks/longmemeval/run --model luna --judge-model your-judge --semantic --limit 5
```

Use a dedicated working folder, not a source checkout. The entrypoint copies
shipped code/dependencies there on first use and when the image revision
changes, and preserves `.env`, `models.json`, results, custom corpora and
caches. Results retain their usual `evals/<name>/results/`,
`benchmarks/<name>/results/` and `private/` paths inside this folder. The host
UID/GID keeps saved files editable. Removing the container keeps these files,
and edits made inside the work folder survive until the next image change.

The other guides' short commands go after the image name. `--help` starts no
eval. Use the same image digest and settings when resuming. Public image tags
are `:main` and `:sha-<full commit SHA>`; `@sha256:<digest>` pins an exact image.
The published image is Linux AMD64; Apple Silicon can add
`--platform linux/amd64` to use Docker Desktop's emulation.

## Mounted settings and cases

You can edit `.env` and `models.json` in the working folder or mount them
read-only. Create the source files and cases folder first:

```sh
docker run --rm --init --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$AKM_EVAL_WORK,dst=$AKM_EVAL_WORK" \
  --mount "type=bind,src=$PWD/settings/.env,dst=$AKM_EVAL_WORK/.env,readonly" \
  --mount "type=bind,src=$PWD/settings/models.json,dst=$AKM_EVAL_WORK/models.json,readonly" \
  --mount "type=bind,src=$PWD/my-cases,dst=/input,readonly" \
  --workdir "$AKM_EVAL_WORK" "$AKM_EVAL_IMAGE" \
  evals/reflect/run --cases /input --semantic --limit 5
```

Model services run separately. Use an endpoint reachable from the container;
`localhost` means the container itself. Benchmark datasets download on first
use and remain in the working folder. No credentials or private runs are baked
into the image. A custom AKM checkout also needs an explicit mount for `--akm`.

## Compare AKM source builds

For a checkout whose runtime dependencies match the pinned AKM package, mount it
read-only over that package and run its source with the image's Bun and packages:

```sh
AKM_CHECKOUT=/absolute/path/to/akm
# Use a separate empty working folder for each build when comparing cold indexes.
docker run --rm --init --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=$AKM_EVAL_WORK,dst=$AKM_EVAL_WORK" \
  --mount "type=bind,src=$AKM_CHECKOUT,dst=/opt/akm-cli/node_modules/akm-cli,readonly" \
  --workdir "$AKM_EVAL_WORK" "$AKM_EVAL_IMAGE" \
  evals/retrieval/run --semantic --limit 12 --label build-a \
  --akm "bun /opt/akm-cli/node_modules/akm-cli/src/cli.ts"
```

Repeat with the other checkout and `--label build-b`, then use
`scripts/compare/run` on each pair of collection folders (mount both saved folders
in the comparison container). Remove `--limit` for full measurement. The source
mount retains Git metadata, so commits that print the same package version still
have different `akm_build` identities. Standalone Git clones work directly;
worktrees also need their referenced Git directory mounted at its original path.
A checkout with different runtime dependencies needs an image containing those
matching dependencies; this recipe does not install them at startup.
The Harbor evals (Agent A/B and Terminal-Bench) take `--akm akm-cli@x.y.z` or a
checkout folder instead and cannot use this recipe.

For a build-only comparison, keep the runner image digest, cases, labels, model
and engine settings, semantic mode, machine and cache condition fixed. Check the
reported settings differences before attributing a delta. Compare cold indexing
with cold indexing, or warm with warm. Small changes in model-backed scores or
latency warrant repeats under similar server load. Retrieval labels can be
incomplete: inspect `judged_10`, and explicitly rescore both saved runs after
adding grades. Comparison itself makes no model calls and changes no labels.

## Agent A/B and Terminal-Bench

Harbor starts sibling task containers through the host Docker daemon. Add its
socket and group; keep the working folder at the same absolute path on both
sides so [bind mounts resolve on the daemon host](https://docs.docker.com/engine/storage/bind-mounts/):

```sh
socket=/var/run/docker.sock
socket_group="$(ls -ln "$socket" | awk '{print $4}')"
docker run --rm --init --name akm-eval-terminal \
  --user "$(id -u):$(id -g)" --group-add "$socket_group" \
  --mount "type=bind,src=$AKM_EVAL_WORK,dst=$AKM_EVAL_WORK" \
  --mount "type=bind,src=$socket,dst=/var/run/docker.sock" \
  --workdir "$AKM_EVAL_WORK" "$AKM_EVAL_IMAGE" \
  benchmarks/terminal-bench/run --model luna --semantic --limit 2 --concurrency 2
```

For Agent A/B, replace the final command with `evals/agent-ab/run --semantic`
and its model/limit. Rootless Docker may use another socket path. The socket
gives the runner access to the host Docker daemon. Ordinary evals need no
socket. Remote daemons also need the working files on their own host.

Harbor still pulls/builds benchmark task images and performs their pinned
agent setup; the runner does not change those task environments. Their existing
network and disk requirements still apply. A model endpoint must be reachable
from both the runner and its task containers.

Stop gracefully to preserve a checkpoint:

```sh
docker stop --timeout 120 akm-eval-terminal
```

Repeat the same Docker command with `--resume benchmarks/terminal-bench/results/<run>`
to continue. LongMemEval has its own matching `--resume` folder too.

## Build and publish

```sh
docker build --build-arg VCS_REF="$(git describe --always --dirty)" -t akm-eval:local .
docker run --rm akm-eval:local --help
```

The Dockerfile installs packages and warms the native embedding model during
build; startup installs nothing. `.github/workflows/container.yml` builds,
checks command help/dependencies without model calls, and publishes to GHCR
on main. It can also be dispatched manually. After the first publication,
[make the GHCR package public](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#pushing-container-images)
so users can pull without signing in.
