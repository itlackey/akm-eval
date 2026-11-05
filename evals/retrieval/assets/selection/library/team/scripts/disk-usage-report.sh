#!/usr/bin/env bash
# Report the disk usage of the build hosts: prints the disk usage of every build host, largest first.
df -h | sort -rh -k5 | head -n 20
