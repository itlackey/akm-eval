FROM oven/bun:1.3.13

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  build-essential \
  ca-certificates \
  curl \
  git \
  gfortran \
  pkg-config \
  python3 \
  python3-dev \
  python3-pip \
  python3-venv \
  && rm -rf /var/lib/apt/lists/*

# Node + a PINNED akm-cli, so `AKM_EVAL_AKM_CMD` (default `["akm"]`) resolves
# INSIDE this container. Without it every `memory.backend: akm` run fails loudly
# with MemoryBackendUnavailableError -- `bin/doctor` reports it as
# `WARN memory:akm: akm CLI not reachable`. Node 22+ is required: akm-cli's
# preinstall refuses to install below it. The version is pinned to match the
# rest of the benchmark stack (harbor/akm_opencode.py AKM_CLI_VERSION).
ARG AKM_CLI_VERSION=0.9.10
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && npm i -g "akm-cli@${AKM_CLI_VERSION}" \
  && akm --version

WORKDIR /workspace/akm-eval

COPY package.json bun.lock* ./
COPY requirements-smoke.txt ./
RUN bun install --frozen-lockfile || bun install

RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements-smoke.txt

COPY . .
RUN chmod +x docker/akm-eval-entrypoint.sh bin/*

ENTRYPOINT ["/workspace/akm-eval/docker/akm-eval-entrypoint.sh"]
CMD ["bun", "src/cli.ts"]
