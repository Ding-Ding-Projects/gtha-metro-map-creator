#!/bin/bash
# Boots a built qcow2 image under QEMU and proves the web app answers.
# Usage: appliance/boot-test.sh <image.qcow2> <version> [timeout-seconds]
set -euo pipefail
img="$1"; version="$2"; timeout="${3:-600}"
port=18080
log="$(mktemp -d)/serial.log"
accel=tcg
if [ -w /dev/kvm ]; then accel=kvm; fi
echo "Booting $img with acceleration: $accel (timeout ${timeout}s)"

# snapshot=on keeps the image under test untouched.
qemu-system-x86_64 -machine "accel=$accel" -m 1024 -smp 2 -display none \
	-serial "file:$log" -no-reboot \
	-drive "file=$img,format=qcow2,if=virtio,snapshot=on" \
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

# The banner is printed on the consoles shortly after the network address is known.
for _ in $(seq 1 30); do
	grep -Eq "ready at: http://[0-9.]+:8080/" "$log" && break
	sleep 2
done
grep -Eq "ready at: http://[0-9.]+:8080/" "$log" || fail "the console never showed the address banner"
grep -q "GTHA Metro Map Creator $version" "$log" || fail "the console banner does not show version $version"
grep -E "ready at:" "$log" | tail -n 1
echo "BOOT TEST PASSED"
