FROM oven/bun:1.3.13

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  build-essential \
  ca-certificates \
  curl \
  git \
  gfortran \
  docker.io \
  pkg-config \
  python3 \
  python3-dev \
  python3-pip \
  python3-venv \
  && rm -rf /var/lib/apt/lists/*

RUN touch /usr/local/bin/docker && chmod +x /usr/local/bin/docker

WORKDIR /workspace/akm-eval

COPY package.json bun.lock* ./
COPY requirements-smoke.txt ./
RUN bun install --frozen-lockfile || bun install

RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements-smoke.txt
RUN python3 -m pip install --break-system-packages --no-cache-dir swebench opencode-ai

COPY . .
RUN chmod +x docker/akm-eval-entrypoint.sh bin/*

ENTRYPOINT ["/workspace/akm-eval/docker/akm-eval-entrypoint.sh"]
CMD ["bun", "src/cli.ts"]
