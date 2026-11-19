#!/usr/bin/env bash
# Build the Debian trixie riscv64 disk for the unkernel app (/新) into
# ../public/unkernel-image/debian-<hash>.ext4 and version.json.
# Needs docker with riscv64 emulation (qemu binfmt) and Node 24.
# KEEP_OLD=1 keeps earlier disks, so existing saves keep their base image.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../public/unkernel-image"
mkdir -p "$out" "$here/build"
[ -f "$here/build/kwtty" ] || node --experimental-wasm-jspi "$here/extract-kwtty.mjs" "$here/build/kwtty"
tmp="$(mktemp -d "$here/build/tmp.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
DOCKER_BUILDKIT=1 docker build ${MINIMAL:+--build-arg MINIMAL=1} --output "type=local,dest=$tmp" "$here"
# Most of the disk is free space: keep it sparse on the server.
fallocate --dig-holes "$tmp/rootfs.ext4" 2>/dev/null || true
hash="$(sha256sum "$tmp/rootfs.ext4" | cut -c1-16)"
name="debian-$hash.ext4"
[ -n "${KEEP_OLD:-}" ] || find "$out" -maxdepth 1 -name 'debian-*.ext4' ! -name "$name" -delete
mv "$tmp/rootfs.ext4" "$out/$name"
printf '{"disk":"%s"}\n' "$name" > "$out/version.json"
echo "disk: $out/$name ($(du -h --apparent-size "$out/$name" | cut -f1))"
