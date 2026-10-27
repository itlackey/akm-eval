FROM ubuntu:24.04

# The repository at a pinned commit, without its git history.
ADD https://github.com/itlackey/akm/archive/f8f97704672ae657e9590d1240150df3a88b18ee.tar.gz /tmp/repo.tar.gz
RUN mkdir -p /app/repo && tar -xzf /tmp/repo.tar.gz -C /app/repo --strip-components=1 && rm /tmp/repo.tar.gz
WORKDIR /app
