# Keep every executable version explicit.  The checkout is mounted elsewhere
# at runtime, so its node_modules can never hide the dependency tree installed
# in this image.
FROM oven/bun:1.3.13 AS bun-runtime
FROM node:22.18.0-bookworm-slim AS core

ARG AKM_CLI_VERSION

COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  ca-certificates \
  git \
  jq \
  python3 \
  python3-pip \
  python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -c 'import sys; assert sys.version_info[:2] == (3, 11), sys.version'

ENV AKM_EVAL_APP_ROOT=/opt/akm-eval \
  AKM_EVAL_CORE_VENV=/opt/akm-eval/venvs/core \
  AKM_EVAL_IMAGE_AKM_VERSION=${AKM_CLI_VERSION}
ENV PATH="${AKM_EVAL_CORE_VENV}/bin:${AKM_EVAL_APP_ROOT}/node_modules/.bin:${PATH}"

WORKDIR ${AKM_EVAL_APP_ROOT}

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY requirements-smoke.txt requirements-beam.txt ./
RUN python3 -m venv "${AKM_EVAL_CORE_VENV}" \
  && "${AKM_EVAL_CORE_VENV}/bin/pip" install --no-cache-dir --requirement requirements-smoke.txt

# The CLI being evaluated is intentionally a build argument.  Version-specific
# image tags in bin/_akm_eval_cli_image.sh prevent one target from being reused
# for another, while AKM_EVAL_AKM_CMD can still point at a mounted source build.
RUN if [ -n "${AKM_CLI_VERSION}" ]; then \
      npm install --global --no-audit --no-fund "akm-cli@${AKM_CLI_VERSION}" \
      && test "$(akm --version)" = "${AKM_CLI_VERSION}"; \
    else \
      printf '%s\n' 'Building evaluator runtime without an implicit akm-cli target.'; \
    fi

COPY bin ./bin
COPY config ./config
COPY docker ./docker
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
RUN chmod +x docker/akm-eval-entrypoint.sh bin/* scripts/setup-beam-runtime.sh

ENTRYPOINT ["/opt/akm-eval/docker/akm-eval-entrypoint.sh"]
CMD ["bun", "/opt/akm-eval/src/cli.ts"]

# BEAM's frozen upstream snapshot is intentionally optional: its Python stack
# is several GB.  `bin/build-image --flavor beam` builds this target, while
# memory/LoCoMo/LongMemEval users keep the much smaller core image.
FROM core AS beam

ENV AKM_EVAL_BEAM_VENV=/opt/akm-eval/venvs/beam
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  gfortran \
  python3-dev \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv "${AKM_EVAL_BEAM_VENV}" \
  && "${AKM_EVAL_BEAM_VENV}/bin/pip" install --no-cache-dir --requirement requirements-beam.txt

ENV BEAM_PYTHON_BIN=/opt/akm-eval/venvs/beam/bin/python
