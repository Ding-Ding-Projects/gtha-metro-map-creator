#!/bin/bash
# Helpers shared by boot-test.sh and boot-test-rpi.sh for the sign-in runs. Source this file; do not run it.
# Needs: docker (to make a hash with the container image's own gmmc-auth), curl, mkfs.vfat and mcopy
# (dosfstools, mtools) and, for the ISO disk, node. Nothing made here leaves the machine.

gmmc_repo_root() { (cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd); }

# gmmc_make_hash <container-image-ref> <password> <out-file>: hashes the password with the image's gmmc-auth.
gmmc_make_hash() {
	printf '%s\n' "$2" | docker run --rm -i "$1" gmmc-auth hash > "$3" || return 1
	grep -Eq '^pbkdf2-sha256:[0-9]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$' "$3"
}

# gmmc_vfat_disk <out.img> <label> <file-name-on-disk> <source-file>: a small FAT disk holding one file.
gmmc_vfat_disk() {
	truncate -s 8M "$1"
	mkfs.vfat -n "$2" "$1" >/dev/null
	mcopy -i "$1" "$4" "::$3"
}

# gmmc_iso_disk <out.iso> <hash-file>: the same ISO the deploy app attaches to a virtual machine.
gmmc_iso_disk() { node "$(gmmc_repo_root)/desktop/deploy/lib/config-disk.js" "$2" "$1" >/dev/null; }

# gmmc_check_signin <port> <password> <serial-log>: the app must ask for a password and accept the right one.
gmmc_check_signin() {
	local port="$1" pw="$2" log="$3" base jar headers code
	base="http://127.0.0.1:$port"
	jar="$(mktemp)"
	[ "$(curl -s --max-time 5 "$base/healthz")" = "ok" ] || { echo "sign-in check: /healthz is not open"; return 1; }
	headers=$(curl -s -D - -o /dev/null --max-time 5 "$base/app/")
	case "$headers" in
	"HTTP/"*" 301"* | "HTTP/"*" 302"* | "HTTP/"*" 303"* | "HTTP/"*" 307"*) ;;
	*) echo "sign-in check: /app/ did not redirect without a session:"; echo "$headers" | head -n 3; return 1 ;;
	esac
	echo "$headers" | grep -iq '^location: .*/signin' || { echo "sign-in check: /app/ does not redirect to /signin"; return 1; }
	echo "sign-in check: /healthz open, /app/ redirects to /signin"
	headers=$(curl -s -D - -o /dev/null --max-time 10 --data-urlencode "password=definitely-not-the-password" "$base/signin/login")
	echo "$headers" | grep -iq '^location: .*error=1' || { echo "sign-in check: a wrong password was not refused"; return 1; }
	code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -c "$jar" --data-urlencode "password=$pw" --data-urlencode "next=/app/" "$base/signin/login")
	[ "$code" = "303" ] || { echo "sign-in check: the right password was not accepted (HTTP $code)"; return 1; }
	code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -b "$jar" "$base/app/")
	[ "$code" = "200" ] || { echo "sign-in check: /app/ is $code with a session, expected 200"; return 1; }
	echo "sign-in check: wrong password refused, right password accepted, /app/ is 200 with the session"
	rm -f "$jar"
	for _ in $(seq 1 30); do grep -q "Password required" "$log" && break; sleep 2; done
	grep -q "Password required" "$log" || { echo "sign-in check: the console banner never said Password required"; return 1; }
	grep -E "Password required" "$log" | tail -n 1
}

# gmmc_check_refused <port> <serial-log> <seconds>: the app must NOT answer and the banner must say why.
gmmc_check_refused() {
	local port="$1" log="$2" wait="$3" t=0
	while [ "$t" -lt "$wait" ]; do
		grep -q "the editor was not started" "$log" && break
		sleep 5; t=$((t + 5))
	done
	grep -q "the editor was not started" "$log" || { echo "refusal check: the console never said the editor was not started"; return 1; }
	sleep 20
	if curl -s --max-time 3 -o /dev/null "http://127.0.0.1:$port/healthz"; then echo "refusal check: the app answered although the password setting is invalid"; return 1; fi
	if grep -q "pbkdf2" "$log"; then echo "refusal check: the serial console shows a hash"; return 1; fi
	grep -E "the editor was not started" "$log" | tail -n 1
}
