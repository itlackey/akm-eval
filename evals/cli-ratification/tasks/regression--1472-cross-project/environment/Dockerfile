FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /work/orchid
COPY workspace-regression--1472-cross-project/ /work/orchid/
