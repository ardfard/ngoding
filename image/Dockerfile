# syntax=docker/dockerfile:1
#
# Debian for v86: a real i386 kernel that boots with its root filesystem on
# 9p (served file by file over HTTP by v86).
#
# Output: /v86-fs.tar with fs.json (file tree) and flat/ (contents, named by hash).

FROM --platform=linux/386 i386/debian:bookworm AS rootfs
ARG DEBIAN_FRONTEND=noninteractive
ARG UV_VERSION=0.13.6

# Keep the image small: no docs, man pages (there's no man), or translations.
# Copyright files stay, since the image redistributes GPL software.
RUN printf '%s\n' \
        'path-exclude /usr/share/doc/*' \
        'path-include /usr/share/doc/*/copyright' \
        'path-exclude /usr/share/man/*' \
        'path-exclude /usr/share/info/*' \
        'path-exclude /usr/share/locale/*' \
        'path-exclude /usr/share/lintian/*' \
        > /etc/dpkg/dpkg.cfg.d/01-ngoding-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        linux-image-686 initramfs-tools tini \
        python3 python3-venv python3-pip python3-numpy \
        gcc g++ libc6-dev \
        golang-go \
        rustc \
        ghc \
        bash-completion ca-certificates curl git less nano neovim \
        procps file tree sudo \
    && update-alternatives --set editor /usr/bin/nvim \
    && rm -rf /var/lib/apt/lists/*

# Boot with the root filesystem on 9p (adapted from v86's tools/docker/debian).
# The initramfs only needs the modules listed here, not the default "most".
RUN printf '%s\n' 9p 9pnet 9pnet_virtio virtio virtio_ring virtio_pci >> /etc/initramfs-tools/modules \
    && sed -i 's/^MODULES=.*/MODULES=list/' /etc/initramfs-tools/initramfs.conf \
    && printf '%s\n' \
        '#!/bin/sh' \
        'case $1 in prereqs) exit 0;; esac' \
        '. /scripts/functions' \
        'mkdir -p ${rootmnt}' \
        'mount -n -t 9p -o trans=virtio,version=9p2000.L,cache=loose,rw host9p ${rootmnt}' \
        > /etc/initramfs-tools/scripts/boot-9p \
    && chmod +x /etc/initramfs-tools/scripts/boot-9p \
    && echo 'BOOT=boot-9p' >> /etc/initramfs-tools/initramfs.conf \
    && update-initramfs -u

# Drop drivers for hardware v86 doesn't emulate, keeping ne2k (8390) for the
# optional network relay. udev never runs after boot, so its hardware database
# is unused too (the initramfs has its own copy).
RUN cd /usr/lib/modules/*/kernel \
    && rm -rf sound \
        drivers/gpu drivers/media drivers/usb drivers/scsi drivers/infiniband drivers/staging \
        drivers/iio drivers/comedi drivers/hwmon drivers/bluetooth drivers/isdn drivers/mmc \
        drivers/net/wireless drivers/net/usb drivers/net/can \
        net/wireless net/mac80211 net/bluetooth \
    && find drivers/net/ethernet -mindepth 1 -maxdepth 1 ! -name 8390 -exec rm -rf {} + \
    && depmod "$(basename "$(dirname "$PWD")")" \
    && rm -rf /usr/lib/udev/hwdb.bin /usr/lib/udev/hwdb.d

# uv: astral publishes an i686 build
RUN curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-i686-unknown-linux-gnu.tar.gz" \
        | tar -xz --strip-components=1 -C /usr/local/bin

# No network by default: offline wheelhouse for uv / pip
RUN mkdir -p /opt/wheels && pip download --dest /opt/wheels --only-binary=:all: \
        rich requests pytest tabulate

COPY profile.sh /etc/profile.d/ngoding.sh
COPY --chmod=755 init.sh /sbin/ngoding-init
COPY --chmod=755 agent.sh /usr/local/sbin/ngoding-agent

RUN useradd -m -u 1000 -s /bin/bash user \
    && echo 'user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/user \
    && mkdir -p /home/user/challenge /home/user/output \
    && echo 'PS1='"'"'\[\e[32m\]\u@ngoding\[\e[0m\]:\[\e[34m\]\w\[\e[0m\]\$ '"'" >> /home/user/.bashrc \
    && chown -R user:user /home/user \
    && echo ngoding > /etc/hostname

FROM python:3.14-slim AS convert
COPY --from=rootfs / /rootfs
COPY tools /tools
# zstd level 19 takes very long on a whole distro; 9 is close in size
RUN sed -i 's/level=19/level=9/' /tools/copy-to-sha256.py \
    && rm -rf /rootfs/proc/* /rootfs/sys/* /rootfs/dev/* \
    && mkdir -p /out/flat \
    && python3 /tools/fs2json.py --zstd --out /out/fs.json /rootfs \
    && python3 /tools/copy-to-sha256.py --zstd /rootfs /out/flat > /dev/null \
    # one tar: docker's local exporter is very slow (and has hung) on ~50k files
    && tar -C /out -cf /v86-fs.tar fs.json flat

FROM scratch
COPY --from=convert /v86-fs.tar /
