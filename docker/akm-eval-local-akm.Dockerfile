ARG BASE_IMAGE=akm-eval-core:latest
FROM ${BASE_IMAGE}

ARG AKM_SOURCE_GIT_SHA
ARG AKM_SOURCE_FINGERPRINT
ARG AKM_SOURCE_DIRTY
ARG AKM_EVAL_RUNTIME_FINGERPRINT

# The build context is the selected AKM checkout. Docker reads it; the host
# checkout is never installed into or mutated. Dependencies and dist are
# produced only in this derivative image.
COPY . /opt/akm-source
WORKDIR /opt/akm-source
RUN bun install --frozen-lockfile \
  && bun run build \
  && chmod +x /opt/akm-source/dist/akm \
  && ln -sf /opt/akm-source/dist/akm /usr/local/bin/akm \
  && akm --version

ENV AKM_EVAL_AKM_CMD='["akm"]' \
  AKM_EVAL_AKM_SOURCE_SHA=${AKM_SOURCE_GIT_SHA} \
  AKM_EVAL_AKM_SOURCE_FINGERPRINT=${AKM_SOURCE_FINGERPRINT} \
  AKM_EVAL_AKM_SOURCE_DIRTY=${AKM_SOURCE_DIRTY} \
  AKM_EVAL_AKM_RUNTIME_FINGERPRINT=${AKM_EVAL_RUNTIME_FINGERPRINT}

WORKDIR /opt/akm-eval
