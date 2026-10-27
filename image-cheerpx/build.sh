#!/usr/bin/env bash
# Build the CheerpX disk image into ../public/disk/ngoding.ext2
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../public/disk"
mkdir -p "$out"
DOCKER_BUILDKIT=1 docker build -f "$here/Dockerfile" --output "type=local,dest=$out" "$here/.."
ls -lh "$out/ngoding.ext2"
