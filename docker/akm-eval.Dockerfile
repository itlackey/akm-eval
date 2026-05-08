FROM oven/bun:1.3.13

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  build-essential \
  ca-certificates \
  git \
  gfortran \
  pkg-config \
  python3 \
  python3-dev \
  python3-pip \
  python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace/akm-eval

COPY package.json bun.lock* ./
COPY requirements-smoke.txt ./
RUN bun install --frozen-lockfile || bun install

RUN python3 -m pip install --break-system-packages --no-cache-dir -r requirements-smoke.txt

COPY . .
RUN chmod +x docker/akm-eval-entrypoint.sh bin/*

ENTRYPOINT ["/workspace/akm-eval/docker/akm-eval-entrypoint.sh"]
CMD ["bun", "src/cli.ts"]
