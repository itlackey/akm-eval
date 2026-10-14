# syntax=docker/dockerfile:1
FROM node:22.23.1-bookworm-slim AS node
FROM oven/bun:1.4.2 AS bun
FROM ghcr.io/astral-sh/uv:0.12.5 AS uv
FROM docker:29.1.3-cli AS docker
FROM python:3.12.12-slim-bookworm AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git libatomic1 libgomp1 openssh-client \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s bun /usr/local/bin/bunx
COPY --from=uv /uv /uvx /usr/local/bin/
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/

ENV UV_CACHE_DIR=/opt/uv-cache UV_PYTHON_DOWNLOADS=never PYTHONDONTWRITEBYTECODE=1
WORKDIR /opt/akm-eval
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY scripts/ledger/src/package.json scripts/ledger/src/bun.lock ./scripts/ledger/src/
RUN cd scripts/ledger/src && bun install --frozen-lockfile --ignore-scripts
# The same committed dependency lock as the default Harbor AKM arm.
COPY lib/harbor/locks/akm-cli-0.10.261003-beta/ /opt/akm-cli/
RUN npm ci --prefix /opt/akm-cli --omit=dev \
    && ln -s /opt/akm-cli/node_modules/.bin/akm /usr/local/bin/akm
COPY lib/ ./lib/
# Warm the exact uv invocations used by runHarbor, scripts/check and asset generation.
RUN harbor_version="$(sed -n 's/^export const PINS = .*harbor: "\([0-9][0-9.]*\)".*/\1/p' lib/harbor/harbor.ts)" \
    && test -n "$harbor_version" \
    && uv run --no-project --python 3.12 --with "harbor==$harbor_version" harbor --version \
    && uv run --no-project --python 3.12 --with "harbor==$harbor_version" --with pytest python -c 'import harbor, pytest' \
    && uv run --no-project --python 3.12 --with pytest --with pyyaml python -c 'import pytest, yaml' \
    && chmod -R a+rwX /opt/uv-cache
COPY docker/warm-model.ts ./docker/warm-model.ts
# Local embeddings only: this makes no reader, judge or benchmark calls.
RUN bun docker/warm-model.ts && mv .cache/models /opt/akm-models && rmdir .cache
COPY . .
ARG VCS_REF=unknown
RUN printf '%s\n' "$VCS_REF" > .akm-eval-revision
LABEL org.opencontainers.image.source="https://github.com/itlackey/akm-eval" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.licenses="MPL-2.0"
ENV UV_OFFLINE=true
RUN useradd --uid 1000 --create-home eval && mkdir /work && chown eval:eval /work
COPY --chmod=755 docker/entrypoint /usr/local/bin/akm-eval
USER eval
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/akm-eval"]
CMD ["--help"]
