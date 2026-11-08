FROM ubuntu:24.04

LABEL org.akm-eval.card="resume--release-3"

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /work/orchid
COPY workspace/ /work/orchid/
