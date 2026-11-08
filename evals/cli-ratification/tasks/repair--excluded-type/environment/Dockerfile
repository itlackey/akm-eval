FROM ubuntu:24.04

LABEL org.akm-eval.card="repair--excluded-type"

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /work/quill
COPY workspace/ /work/quill/
