#!/bin/bash
# Boots the "virt" twin of the Raspberry Pi root file system under QEMU (aarch64, machine "virt") and
# proves the web app answers. Real Raspberry Pi hardware is not emulated: this checks the root file
# system, Docker, the first-boot image load and the address banner, not the Pi firmware, kernel or
# device tree. Boot the .img.xz on a real Pi 4 or Pi 5 to check those.
# Usage: appliance/boot-test-rpi.sh <output-dir-of-build-rpi.sh> <version> [timeout-seconds]
set -euo pipefail
dir="$1"; version="$2"; timeout="${3:-1200}"
base="gtha-metro-map-creator-appliance-$version-arm64-rpi"
port=18081
log="$(mktemp -d)/serial.log"
kernel="$dir/vmlinuz-virt"
# QEMU loads an arm64 Image directly; some builds ship it gzip-compressed.
if [ "$(head -c 2 "$kernel" | od -An -tx1 | tr -d ' ')" = "1f8b" ]; then gunzip -c "$kernel" > "$dir/vmlinuz-virt.img"; kernel="$dir/vmlinuz-virt.img"; fi
accel=tcg
if [ -w /dev/kvm ] && [ "$(uname -m)" = "aarch64" ]; then accel=kvm; fi
cpu=max; [ "$accel" = kvm ] && cpu=host
echo "Booting $base with acceleration: $accel (timeout ${timeout}s)"

qemu-system-aarch64 -machine "virt,accel=$accel" -cpu "$cpu" -m 2048 -smp 2 -display none \
	-serial "file:$log" -no-reboot \
	-kernel "$kernel" -initrd "$dir/initramfs-virt" \
	-append "root=/dev/vda rootfstype=ext4 rw console=ttyAMA0" \
	-drive "file=$dir/$base-virt-root.ext4,format=raw,if=virtio,snapshot=on" \
	-netdev "user,id=n0,hostfwd=tcp:127.0.0.1:$port-:8080" -device virtio-net-pci,netdev=n0 &
qemu=$!
trap 'kill "$qemu" 2>/dev/null || true' EXIT

fail() { echo "BOOT TEST FAILED: $1"; echo "---- serial console (last 80 lines) ----"; tail -n 80 "$log" || true; exit 1; }

deadline=$((SECONDS + timeout))
health=""; app=""
while [ "$SECONDS" -lt "$deadline" ]; do
	kill -0 "$qemu" 2>/dev/null || fail "QEMU exited before the app answered"
	health=$(curl -s --max-time 3 "http://127.0.0.1:$port/healthz" || true)
	if [ "$health" = "ok" ]; then
		app=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$port/app/" || true)
		[ "$app" = "200" ] && break
	fi
	sleep 5
done
[ "$health" = "ok" ] || fail "/healthz never answered ok within ${timeout}s"
[ "$app" = "200" ] || fail "/app/ never returned 200 (last status: $app)"
echo "App answered: /healthz ok, /app/ 200 after $((SECONDS))s of script time"

for _ in $(seq 1 30); do
	grep -Eq "ready at: http://[0-9.]+:8080/" "$log" && break
	sleep 2
done
grep -Eq "ready at: http://[0-9.]+:8080/" "$log" || fail "the console never showed the address banner"
grep -q "GTHA Metro Map Creator $version" "$log" || fail "the console banner does not show version $version"
grep -E "ready at:" "$log" | tail -n 1
echo "BOOT TEST PASSED (virt twin of the Raspberry Pi root file system; real Pi hardware is not tested)"
