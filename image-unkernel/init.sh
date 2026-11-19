#!/bin/bash
# PID 1 for the unkernel VM (Debian trixie riscv64, no init system).
# Mounts what programs need, then keeps kwtty running: the page reaches the
# guest only through kwtty (vsock port 1022), which serves the student's pty
# session and vm.exec() calls. Nothing runs on the console (hvc0).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
if [ $$ != 1 ]; then echo "ngoding-init: not PID 1" >&2; exit 1; fi

mountpoint -q /proc || mount -t proc proc /proc
mountpoint -q /sys || mount -t sysfs sys /sys
mountpoint -q /dev || mount -t devtmpfs dev /dev
mkdir -p /dev/pts /dev/shm
mount -t devpts -o gid=5,mode=620,ptmxmode=666 devpts /dev/pts
mount -t tmpfs -o mode=1777 tmpfs /dev/shm
mount -t tmpfs -o mode=755 tmpfs /run
mount -t tmpfs -o mode=1777 tmpfs /tmp
mkdir -p /run/lock
hostname ngoding
printf '127.0.0.1 localhost\n127.0.1.1 ngoding\n' > /etc/hosts
ip link set lo up 2>/dev/null || python3 -c 'import fcntl, socket, struct
s = socket.socket()
flags = struct.unpack("16sH", fcntl.ioctl(s, 0x8913, struct.pack("16sH14x", b"lo", 0))[:18])[1]
fcntl.ioctl(s, 0x8914, struct.pack("16sH14x", b"lo", flags | 1))' 2>/dev/null

stop=
action=0x4321fedc                                  # LINUX_REBOOT_CMD_POWER_OFF
trap 'action=0x4321fedc; stop=1' USR1 TERM
trap 'action=0x01234567; stop=1' USR2              # LINUX_REBOOT_CMD_RESTART
echo "ngoding-init: ready"
# PID 1 reaps orphans: `wait -n` returns for any child, kwtty or not.
kwtty=
while [ -z "$stop" ]; do
    if [ -z "$kwtty" ] || ! kill -0 "$kwtty" 2>/dev/null; then
        /usr/bin/kwtty serve &
        kwtty=$!
    fi
    wait -n 2>/dev/null || sleep 1
done
kill -TERM -1; sleep 0.2; kill -KILL -1; wait
sync
mount -o remount,ro / && echo "ngoding-init: / is clean"
sync
# reboot(2) is syscall 142 on riscv64
exec python3 -c 'import ctypes,sys; ctypes.CDLL(None).syscall(142, 0xfee1dead, 0x28121969, int(sys.argv[1],16))' "$action"
