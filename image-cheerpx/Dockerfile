# syntax=docker/dockerfile:1
#
# Builds the student's Linux disk image for CheerpX. CheerpX only runs 32-bit
# x86, so the root filesystem is i386 Debian. The second stage turns it into an
# ext2 image (built as root so file ownership and setuid bits survive).
# Build context is the repo root.

FROM --platform=linux/386 i386/debian:bookworm AS rootfs
ARG DEBIAN_FRONTEND=noninteractive
ARG UV_VERSION=0.13.6

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv python3-pip python3-numpy \
        bash-completion ca-certificates curl git less nano vim-tiny \
        procps file tree sudo locales \
    && rm -rf /var/lib/apt/lists/*

# uv: astral publishes i686 builds. Use musl: under CheerpX the glibc build
# aborts with "The futex facility returned an unexpected error code".
RUN mkdir -p /opt/uv && curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-i686-unknown-linux-musl.tar.gz" \
        | tar -xz --strip-components=1 -C /opt/uv \
    && ln -s /opt/uv/uvx /usr/local/bin/uvx
COPY --chmod=755 image-cheerpx/uv-wrapper.sh /usr/local/bin/uv

# The VM has no network by default, so pre-download a few wheels that
# `uv add` / `uv pip install` can resolve from offline.
RUN mkdir -p /opt/wheels && pip download \
        --dest /opt/wheels --only-binary=:all: \
        rich requests pytest tabulate

COPY image/profile.sh /etc/profile.d/ngoding.sh

RUN useradd -m -u 1000 -s /bin/bash user \
    && echo 'user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/user \
    && mkdir -p /home/user/challenge /home/user/output \
    && echo 'PS1='"'"'\[\e[32m\]\u@ngoding\[\e[0m\]:\[\e[34m\]\w\[\e[0m\]\$ '"'" >> /home/user/.bashrc \
    && chown -R user:user /home/user \
    # mount points used by the web app
    && mkdir -p /files /data

# Pre-populate uv's cache with the unpacked wheels. uv's wheel extraction
# silently produces empty directories under CheerpX, but installing from an
# already-unpacked cache entry (plain file copies) works.
USER user
RUN bash -lc 'uv venv -q /tmp/warm && uv pip install -q --python /tmp/warm/bin/python rich requests pytest tabulate \
        && rm -rf /tmp/warm && du -sh ~/.cache/uv'
USER root

FROM debian:bookworm AS ext2
RUN apt-get update && apt-get install -y --no-install-recommends e2fsprogs \
    && rm -rf /var/lib/apt/lists/*
COPY --from=rootfs / /rootfs
# Size the image to the content plus headroom for the student's work
# (writes go to the browser's IndexedDB, but ext2 still needs free blocks).
RUN rm -rf /rootfs/proc/* /rootfs/sys/* /rootfs/dev/* \
    && SIZE_MB=$(( $(du -sm /rootfs | cut -f1) + 512 )) \
    && mkdir /out \
    && mkfs.ext2 -b 4096 -d /rootfs /out/ngoding.ext2 "${SIZE_MB}M"

FROM scratch
COPY --from=ext2 /out/ngoding.ext2 /
