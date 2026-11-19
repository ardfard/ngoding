# syntax=docker/dockerfile:1
#
# Debian trixie riscv64 for unkernel: an ext4 root disk the browser reads
# lazily over HTTP Range (openHttpDisk). Same tools as image/Dockerfile (v86).
#
# Output: /rootfs.ext4

FROM --platform=linux/riscv64 debian:trixie AS rootfs
ARG DEBIAN_FRONTEND=noninteractive
ARG UV_VERSION=0.13.6
ARG TYPES_NODE_VERSION=22.15.0
# MINIMAL=1: base system only (a quick boot check, no toolchains)
ARG MINIMAL=

RUN printf '%s\n' \
        'path-exclude /usr/share/doc/*' \
        'path-include /usr/share/doc/*/copyright' \
        'path-exclude /usr/share/man/*' \
        'path-exclude /usr/share/info/*' \
        'path-exclude /usr/share/locale/*' \
        'path-exclude /usr/share/lintian/*' \
        > /etc/dpkg/dpkg.cfg.d/01-ngoding-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 bash-completion ca-certificates curl less nano procps file tree sudo iproute2 \
    && if [ -z "$MINIMAL" ]; then apt-get install -y --no-install-recommends \
        python3-venv python3-pip python3-numpy \
        gcc g++ libc6-dev \
        golang-go \
        rustc \
        ghc \
        nodejs node-typescript \
        git neovim \
    && update-alternatives --set editor /usr/bin/nvim; fi \
    && rm -rf /var/lib/apt/lists/*

# uv: astral publishes a riscv64 build
RUN if [ -z "$MINIMAL" ]; then curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-riscv64gc-unknown-linux-gnu.tar.gz" \
        | tar -xz --no-same-owner --strip-components=1 -C /usr/local/bin; fi

# Debian has no @types/node; tsc needs it for require/fs/process
RUN if [ -z "$MINIMAL" ]; then mkdir -p /usr/local/lib/node_modules/@types/node \
    && curl -fsSL "https://registry.npmjs.org/@types/node/-/node-${TYPES_NODE_VERSION}.tgz" \
        | tar -xz --no-same-owner --strip-components=1 -C /usr/local/lib/node_modules/@types/node; fi

# No network by default: offline wheelhouse for uv / pip
RUN if [ -z "$MINIMAL" ]; then mkdir -p /opt/wheels && pip download --dest /opt/wheels --only-binary=:all: \
        rich requests pytest tabulate; fi

COPY profile.sh /etc/profile.d/ngoding.sh
COPY --chmod=755 init.sh /sbin/ngoding-init
COPY --chmod=755 build/kwtty /usr/bin/kwtty

RUN useradd -m -u 1000 -s /bin/bash user \
    && echo 'user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/user \
    && mkdir -p /home/user/challenge /home/user/output \
    && echo 'PS1='"'"'\[\e[32m\]\u@ngoding\[\e[0m\]:\[\e[34m\]\w\[\e[0m\]\$ '"'" >> /home/user/.bashrc \
    && chown -R user:user /home/user \
    && echo ngoding > /etc/hostname \
    && printf '/dev/wda / ext4 rw,relatime 0 1\n' > /etc/fstab

# mke2fs runs natively; COPY --from keeps owners, modes and setuid bits.
FROM debian:trixie AS disk
RUN apt-get update && apt-get install -y --no-install-recommends e2fsprogs && rm -rf /var/lib/apt/lists/*
COPY --from=rootfs / /rootfs
RUN rm -rf /rootfs/proc/* /rootfs/sys/* /rootfs/dev/* /rootfs/.dockerenv \
    && used=$(du -sm /rootfs | cut -f1) \
    && size=$(( used + used / 4 + 2048 )) \
    && mke2fs -q -t ext4 -L ngoding -m 0 -E root_owner=0:0 -d /rootfs /rootfs.ext4 "${size}M" \
    && e2fsck -fn /rootfs.ext4

FROM scratch
COPY --from=disk /rootfs.ext4 /
