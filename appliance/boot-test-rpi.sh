#!/bin/bash
# Boots the "virt" twin of the Raspberry Pi root file system under QEMU (aarch64, machine "virt") and
# proves the web app answers. Real Raspberry Pi hardware is not emulated: this checks the root file
# system, Docker, the first-boot image load and the address banner, not the Pi firmware, kernel or
# device tree. Boot the .img.xz on a real Pi 4 or Pi 5 to check those.
# Usage: appliance/boot-test-rpi.sh <output-dir-of-build-rpi.sh> <version> [timeout-seconds] [--config-disk boot --image <container-ref>]
#   --config-disk boot attaches a small FAT disk labelled GMMCBOOT holding gmmc-password-hash, standing in for the
#   Raspberry Pi boot partition. The app must then ask for the password that was hashed. Reading the file from
#   the real /boot mount of a Pi is covered by appliance/test-signin.sh only, not by booting.
set -euo pipefail
dir="$1"; version="$2"; shift 2
timeout=1200
case "${1:-}" in '' | --*) ;; *) timeout="$1"; shift ;; esac
mode=none; imageref=""
while [ $# -gt 0 ]; do
	case "$1" in
	--config-disk) mode="$2"; shift 2 ;;
	--image) imageref="$2"; shift 2 ;;
	*) echo "unknown option $1" >&2; exit 2 ;;
	esac
done
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=appliance/boot-test-lib.sh
. "$here/boot-test-lib.sh"
base="gtha-metro-map-creator-appliance-$version-arm64-rpi"
port=18081
tmp="$(mktemp -d)"
log="$tmp/serial.log"
kernel="$dir/vmlinuz-virt"
# QEMU loads an arm64 Image directly; some builds ship it gzip-compressed.
if [ "$(head -c 2 "$kernel" | od -An -tx1 | tr -d ' ')" = "1f8b" ]; then gunzip -c "$kernel" > "$dir/vmlinuz-virt.img"; kernel="$dir/vmlinuz-virt.img"; fi
accel=tcg
if [ -w /dev/kvm ] && [ "$(uname -m)" = "aarch64" ]; then accel=kvm; fi
cpu=max; [ "$accel" = kvm ] && cpu=host
echo "Booting $base with acceleration: $accel, config disk: $mode (timeout ${timeout}s)"

extra=()
password="test-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
case "$mode" in
none) ;;
boot)
	[ -n "$imageref" ] || { echo "--image <container-ref> is needed to make a hash" >&2; exit 2; }
	gmmc_make_hash "$imageref" "$password" "$tmp/gmmc-password-hash"
	gmmc_vfat_disk "$tmp/boot.img" GMMCBOOT gmmc-password-hash "$tmp/gmmc-password-hash"
	extra=(-drive "file=$tmp/boot.img,format=raw,if=virtio,readonly=on") ;;
*) echo "unknown config disk mode $mode" >&2; exit 2 ;;
esac

qemu-system-aarch64 -machine "virt,accel=$accel" -cpu "$cpu" -m 2048 -smp 2 -display none \
	-serial "file:$log" -no-reboot \
	-kernel "$kernel" -initrd "$dir/initramfs-virt" \
	-append "root=/dev/vda rootfstype=ext4 rw console=ttyAMA0" \
	-drive "file=$dir/$base-virt-root.ext4,format=raw,if=virtio,snapshot=on" "${extra[@]}" \
	-netdev "user,id=n0,hostfwd=tcp:127.0.0.1:$port-:8080" -device virtio-net-pci,netdev=n0,romfile= &
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
		if [ "$mode" = none ]; then
			[ "$app" = "200" ] && break
		else
			[ -n "$app" ] && [ "$app" != "000" ] && break
		fi
	fi
	sleep 5
done
[ "$health" = "ok" ] || fail "/healthz never answered ok within ${timeout}s"
if [ "$mode" = none ]; then
	[ "$app" = "200" ] || fail "/app/ never returned 200 (last status: $app)"
	echo "App answered: /healthz ok, /app/ 200 after $((SECONDS))s of script time"
else
	echo "App answered after $((SECONDS))s of script time; checking sign-in"
	gmmc_check_signin "$port" "$password" "$log" || fail "the sign-in check failed ($mode config disk)"
fi

for _ in $(seq 1 30); do
	grep -Eq "ready at: http://[0-9.]+:8080/" "$log" && break
	sleep 2
done
grep -Eq "ready at: http://[0-9.]+:8080/" "$log" || fail "the console never showed the address banner"
grep -q "GTHA Metro Map Creator $version" "$log" || fail "the console banner does not show version $version"
grep -E "ready at:" "$log" | tail -n 1
if [ "$mode" = none ] && grep -q "Password required" "$log"; then fail "the banner says Password required although no password was set"; fi
echo "BOOT TEST PASSED (config disk: $mode; virt twin of the Raspberry Pi root file system; real Pi hardware is not tested)"
