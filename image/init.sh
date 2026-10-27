#!/bin/sh
# PID 1 for the v86 VM. systemd works but boots slowly under emulation; this
# only sets up what a student shell needs.
if [ "$$" = 1 ]; then
    exec /usr/bin/tini -s -- /sbin/ngoding-init
fi

mount -t proc proc /proc
mount -t sysfs sys /sys
mount -t devtmpfs dev /dev 2>/dev/null
mkdir -p /dev/pts /dev/shm
mount -t devpts devpts /dev/pts
mount -t tmpfs tmpfs /dev/shm
mount -t tmpfs tmpfs /run
mount -t tmpfs tmpfs /tmp
hostname ngoding
# (docker build bind-mounts /etc/hosts, so it is written here instead)
printf '127.0.0.1 localhost\n127.0.1.1 ngoding\n' > /etc/hosts
dmesg -n 1

# Control channel for the web page (second serial port)
/usr/local/sbin/ngoding-agent &

# Student shell on the first serial port, respawned if it exits. agetty must
# lead its own session to make ttyS0 the controlling terminal (job control, ^C).
while true; do
    setsid -w /sbin/agetty --autologin user --noclear --noissue -L 115200 ttyS0 xterm-256color
done
