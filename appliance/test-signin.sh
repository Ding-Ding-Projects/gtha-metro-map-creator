#!/bin/bash
# Checks the appliance's sign-in lookup (appliance/skel/usr/local/sbin/gmmc-signin) against real loop
# devices: FAT and ISO 9660 configuration disks, the boot-partition file and every refusal path.
# It needs root, Linux, util-linux (losetup, blkid, mount) and either mkfs.vfat or mkfs.fat. No appliance
# and no Docker are needed, so it runs in a plain Alpine or Ubuntu container started with --privileged.
# Usage: sudo appliance/test-signin.sh <valid-hash> [config-disk.iso]
#   <valid-hash>      a hash for GMMC_PASSWORD_HASH, for example from `gmmc-auth hash`
#   config-disk.iso   optional ISO made by desktop/deploy/lib/config-disk.js holding the same hash
set -uo pipefail
hash="$1"; iso="${2:-}"
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/skel/usr/local/sbin/gmmc-signin"
work="$(mktemp -d)"
loops=()
cleanup() {
	mountpoint -q "$work/state/mnt" 2>/dev/null && umount "$work/state/mnt"
	for l in "${loops[@]}"; do losetup -d "$l" 2>/dev/null || true; done
	rm -rf "$work"
}
trap cleanup EXIT
mkvfat=$(command -v mkfs.vfat || command -v mkfs.fat) || { echo "mkfs.vfat is needed"; exit 2; }
fails=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }

# attach <file>: loop device for a file, left in $LOOP (detached again at the end)
attach() { LOOP=$(losetup -f --show "$1") || { echo "no loop device"; exit 2; }; loops+=("$LOOP"); blockdev --flushbufs "$LOOP" 2>/dev/null || true; }
# detach_all: removes every disk, so each case starts without a configuration disk
detach_all() { for l in "${loops[@]}"; do losetup -d "$l" 2>/dev/null || true; done; loops=(); }
# vfat_disk <label> <file-name> <content>: a FAT disk with one file, as a loop device
vfat_disk() {
	local img="$work/disk-$RANDOM.img" m="$work/m$RANDOM"
	truncate -s 8M "$img"; "$mkvfat" -n "$1" "$img" >/dev/null
	attach "$img"; mkdir -p "$m"; mount "$LOOP" "$m"
	if [ -n "$2" ]; then printf '%b' "$3" > "$m/$2"; fi
	umount "$m"
}
run() { # runs the lookup; the boot directory does not exist unless a case makes it
	rm -rf "$work/state"
	out=$(GMMC_STATE_DIR="$work/state" GMMC_BOOT_DIR="$work/no-boot" GMMC_SCAN_TRIES=1 sh "$script" 2>&1); status=$?
}
state() { cat "$work/state/signin-state" 2>/dev/null; }
leaks() { case "$out" in *pbkdf2-sha256:*) return 0 ;; esac; return 1; }
expect_on() { # <name>
	if [ "$status" = 0 ] && [ "$(state)" = on ] && [ "$(cat "$work/state/app.env" 2>/dev/null)" = "GMMC_PASSWORD_HASH=$hash" ] \
		&& [ "$(stat -c %a "$work/state/app.env")" = 600 ] && [ "$(stat -c %a "$work/state")" = 700 ] \
		&& [ "$(cat "$work/state/signin-fingerprint")" = "$(printf '%s' "$hash" | sha256sum | cut -d ' ' -f 1)" ] && ! leaks; then ok "$1"; else bad "$1 (status $status, state $(state))"; echo "$out"; fi
}
expect_invalid() { # <name> <reason fragment>
	case "$(state)" in invalid:*"$2"*) s=1 ;; *) s=0 ;; esac
	if [ "$status" = 3 ] && [ "$s" = 1 ] && [ ! -e "$work/state/app.env" ] && ! leaks; then ok "$1"; else bad "$1 (status $status, state $(state))"; echo "$out"; fi
}

echo "== no configuration at all"
run
if [ "$status" = 0 ] && [ "$(state)" = off ] && [ ! -e "$work/state/app.env" ] && [ "$(cat "$work/state/signin-fingerprint")" = off ]; then ok "no source turns sign-in off"; else bad "no source turns sign-in off"; echo "$out"; fi

echo "== FAT configuration disk"
vfat_disk GMMCCONF password-hash "$hash\n"; run; expect_on "FAT disk with password-hash"
detach_all; run
if [ "$(state)" = off ] && [ ! -e "$work/state/app.env" ]; then ok "removing the disk turns sign-in off again"; else bad "removing the disk turns sign-in off again"; fi
detach_all; vfat_disk GMMCCONF password-hash "\xef\xbb\xbf  $hash  \r\nignored second line\r\n"; run; expect_on "byte order mark, blanks and CRLF are ignored"
detach_all; vfat_disk GMMCCONF password-hash "$hash"; run; expect_on "no trailing newline"
detach_all; vfat_disk GMMCCONF password-hash "not a hash\n"; run; expect_invalid "garbage is refused" "expected format"
detach_all; vfat_disk GMMCCONF password-hash "pbkdf2-sha256:1000:${hash#pbkdf2-sha256:*:}\n"; run; expect_invalid "short iteration count is refused" "expected format"
low="pbkdf2-sha256:099999:${hash#pbkdf2-sha256:*:}"
detach_all; vfat_disk GMMCCONF password-hash "$low\n"; run; expect_invalid "iteration count below 100000 is refused" "iteration"
high="pbkdf2-sha256:5000001:${hash#pbkdf2-sha256:*:}"
detach_all; vfat_disk GMMCCONF password-hash "$high\n"; run; expect_invalid "iteration count above 5000000 is refused" "iteration"
detach_all; vfat_disk GMMCCONF password-hash "plainpassword123\n"; run; expect_invalid "a plain password is refused" "expected format"
detach_all; vfat_disk GMMCCONF password-hash ""; run; expect_invalid "an empty file is refused" "empty"
detach_all; vfat_disk GMMCCONF other-file "$hash\n"; run; expect_invalid "a disk without the file is refused" "no file named"

echo "== ISO 9660 configuration disk"
if [ -n "$iso" ]; then
	detach_all; attach "$iso"; run; expect_on "ISO from the deploy app"
else
	echo "SKIP no ISO given"
fi

echo "== boot partition"
detach_all; rm -rf "$work/state"; mkdir -p "$work/boot"; printf '%s\n' "$hash" > "$work/boot/gmmc-password-hash"
out=$(GMMC_STATE_DIR="$work/state" GMMC_BOOT_DIR="$work/boot" GMMC_SCAN_TRIES=1 sh "$script" 2>&1); status=$?; expect_on "gmmc-password-hash in the boot directory"
detach_all; vfat_disk GMMCBOOT gmmc-password-hash "$hash\n"; run; expect_on "FAT partition labelled GMMCBOOT"
detach_all; vfat_disk GMMCBOOT config.txt "arm_64bit=1\n"; run
if [ "$status" = 0 ] && [ "$(state)" = off ]; then ok "a boot partition without the file leaves sign-in off"; else bad "a boot partition without the file leaves sign-in off (status $status, state $(state))"; echo "$out"; fi
detach_all; rm -rf "$work/state"; mkdir -p "$work/boot"; printf 'garbage\n' > "$work/boot/gmmc-password-hash"
out=$(GMMC_STATE_DIR="$work/state" GMMC_BOOT_DIR="$work/boot" GMMC_SCAN_TRIES=1 sh "$script" 2>&1); status=$?; expect_invalid "garbage in the boot directory is refused" "expected format"
echo "== precedence"
detach_all; vfat_disk GMMCCONF password-hash "garbage\n"; mkdir -p "$work/boot"; printf '%s\n' "$hash" > "$work/boot/gmmc-password-hash"
out=$(GMMC_STATE_DIR="$work/state" GMMC_BOOT_DIR="$work/boot" GMMC_SCAN_TRIES=1 sh "$script" 2>&1); status=$?; expect_invalid "the configuration disk wins over the boot file" "expected format"

detach_all
echo
if [ "$fails" -eq 0 ]; then echo "ALL PASSED"; else echo "$fails FAILED"; exit 1; fi
