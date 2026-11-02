#!/usr/bin/env bash
# Build the v86 Debian filesystem into ../public/v86/{fs.json,flat/}, then
# boot it once in Node and save a memory snapshot (public/v86/state.bin.zst)
# so browsers start instantly instead of booting Linux.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../public/v86"
mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
DOCKER_BUILDKIT=1 docker build --output "type=local,dest=$tmp" "$here"
extract="$tmp/extract"
mkdir -p "$extract"
tar -C "$extract" -xf "$tmp/v86-fs.tar"
# Refresh fs.json for the new image; merge flat hashes so older snapshots keep working.
cp "$extract/fs.json" "$out/fs.json"
mkdir -p "$out/flat"
cp -a "$extract/flat/." "$out/flat/"
echo "files: $(ls "$out/flat" | wc -l), $(du -sh "$out/flat" | cut -f1)"
[ -n "${SKIP_STATE:-}" ] || node "$here/build-state.mjs"
