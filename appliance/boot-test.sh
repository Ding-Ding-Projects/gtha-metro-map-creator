#!/bin/bash
# Boots a built qcow2 image under QEMU and proves the web app answers.
# Usage: appliance/boot-test.sh <image.qcow2> <version> [timeout-seconds] [--config-disk vfat|iso|invalid --image <container-ref>]
#   Without --config-disk the appliance has no password: /healthz and /app/ must answer 200.
#   --config-disk vfat     attaches a FAT disk labelled GMMCCONF holding a hash made by the container image
#                          (--image <ref>); the app must ask for the password and accept it
#   --config-disk iso      the same, as the ISO CD-ROM image the deploy app attaches to virtual machines
#   --config-disk invalid  a GMMCCONF disk holding a value that is not a hash: the app must NOT start
# The test password is random, used once and never printed or uploaded.
set -euo pipefail
img="$1"; version="$2"; shift 2
timeout=600
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
port=18080
tmp="$(mktemp -d)"
log="$tmp/serial.log"
accel=tcg
if [ -w /dev/kvm ]; then accel=kvm; fi
echo "Booting $img with acceleration: $accel, config disk: $mode (timeout ${timeout}s)"

extra=()
password="test-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
case "$mode" in
none) ;;
vfat | iso | invalid)
	if [ "$mode" = invalid ]; then
		echo "this is not a password hash" > "$tmp/password-hash"
	else
		[ -n "$imageref" ] || { echo "--image <container-ref> is needed to make a hash" >&2; exit 2; }
		gmmc_make_hash "$imageref" "$password" "$tmp/password-hash"
	fi
	if [ "$mode" = iso ]; then
		gmmc_iso_disk "$tmp/conf.iso" "$tmp/password-hash"
		extra=(-drive "file=$tmp/conf.iso,media=cdrom,readonly=on")
	else
		gmmc_vfat_disk "$tmp/conf.img" GMMCCONF password-hash "$tmp/password-hash"
		extra=(-drive "file=$tmp/conf.img,format=raw,if=virtio,readonly=on")
	fi ;;
*) echo "unknown config disk mode $mode" >&2; exit 2 ;;
esac

# snapshot=on keeps the image under test untouched.
qemu-system-x86_64 -machine "accel=$accel" -m 1024 -smp 2 -display none \
	-serial "file:$log" -no-reboot \
	-drive "file=$img,format=qcow2,if=virtio,snapshot=on" "${extra[@]}" \
	-netdev "user,id=n0,hostfwd=tcp:127.0.0.1:$port-:8080" -device virtio-net-pci,netdev=n0 &
qemu=$!
trap 'kill "$qemu" 2>/dev/null || true' EXIT

fail() { echo "BOOT TEST FAILED: $1"; echo "---- serial console (last 80 lines) ----"; tail -n 80 "$log" || true; exit 1; }

if [ "$mode" = invalid ]; then
	gmmc_check_refused "$port" "$log" "$timeout" || fail "an invalid password setting was not refused cleanly"
	echo "BOOT TEST PASSED (invalid password setting refused)"
	exit 0
fi

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

# The banner is printed on the consoles shortly after the network address is known.
for _ in $(seq 1 30); do
	grep -Eq "ready at: http://[0-9.]+:8080/" "$log" && break
	sleep 2
done
grep -Eq "ready at: http://[0-9.]+:8080/" "$log" || fail "the console never showed the address banner"
grep -q "GTHA Metro Map Creator $version" "$log" || fail "the console banner does not show version $version"
grep -E "ready at:" "$log" | tail -n 1
if [ "$mode" = none ] && grep -q "Password required" "$log"; then fail "the banner says Password required although no password was set"; fi
echo "BOOT TEST PASSED (config disk: $mode)"
