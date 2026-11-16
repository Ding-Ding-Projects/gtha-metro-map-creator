#!/bin/sh
# Exercises the gmmc-app openrc service (appliance/skel/etc/init.d/gmmc-app) with a fake docker command:
# when the container is created, started again or replaced, and that the password hash only ever travels
# through a root-only env file. openrc itself is replaced by small stand-ins for ebegin, einfo and eend.
# It installs files below /opt and /usr/local, so it refuses to run unless GMMC_TEST_DISPOSABLE=1 says that
# this is a throwaway Linux container or machine (for example an Alpine container).
# Usage: GMMC_TEST_DISPOSABLE=1 sh appliance/test-service.sh <valid-hash> <another-valid-hash>
set -u
[ "${GMMC_TEST_DISPOSABLE:-}" = 1 ] || { echo "Set GMMC_TEST_DISPOSABLE=1 to confirm this is a disposable machine"; exit 2; }
hash1="$1"; hash2="$2"
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fails=0
ok() { echo "PASS $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }

mkdir -p /opt/gmmc /usr/local/sbin "$work/bin" "$work/docker" "$work/boot"
cp "$here/skel/usr/local/sbin/gmmc-signin" /usr/local/sbin/gmmc-signin
chmod 0755 /usr/local/sbin/gmmc-signin
printf 'GMMC_VERSION=9.9.9\nGMMC_IMAGE=example/gmmc:9.9.9\n' > /opt/gmmc/appliance.env

# A fake docker that keeps its state in $work/docker and records every call.
cat > "$work/bin/docker" <<'FAKE'
#!/bin/sh
d="$GMMC_FAKE_DOCKER"
echo "docker $*" >> "$d/calls"
case "$1" in
info) exit 0 ;;
image) exit 0 ;;
load) exit 0 ;;
stop|start) exit 0 ;;
rm) rm -f "$d/exists" "$d/label"; exit 0 ;;
container)
	[ -e "$d/exists" ] || exit 1
	cat "$d/label"
	exit 0 ;;
run)
	shift
	all="$*"
	: > "$d/exists"
	rm -f "$d/envfile" "$d/envcontent"
	while [ $# -gt 0 ]; do
		case "$1" in
		--label) printf '%s\n' "${2#gmmc.signin=}" > "$d/label"; shift ;;
		--env-file) printf '%s\n' "$2" > "$d/envfile"; cat "$2" > "$d/envcontent"; stat -c %a "$2" > "$d/envmode"; shift ;;
		esac
		shift
	done
	echo "$all" > "$d/last-run"
	exit 0 ;;
esac
exit 0
FAKE
chmod 0755 "$work/bin/docker"

# Stand-ins for the openrc helpers; the service file is read as an ordinary shell script.
ebegin() { :; }
einfo() { :; }
eend() { return "$1"; }
export GMMC_FAKE_DOCKER="$work/docker" GMMC_STATE_DIR="$work/state" GMMC_BOOT_DIR="$work/boot" GMMC_SCAN_TRIES=1
export PATH="$work/bin:$PATH"
# shellcheck disable=SC1091
. "$here/skel/etc/init.d/gmmc-app"

boot() { # one boot of the service; the state directory is wiped, as /run is on a real boot
	rm -rf "$work/state"; : > "$work/docker/calls"; rm -f "$work/docker/last-run"
	start >/dev/null 2>&1; boot_status=$?
}
calls_have() { grep -q "$1" "$work/docker/calls"; }
no_hash_in_calls() { ! grep -qF "pbkdf2" "$work/docker/calls" && ! grep -qF "pbkdf2" "$work/docker/last-run" 2>/dev/null; }

echo "== sign-in off"
boot
if [ "$boot_status" = 0 ] && [ "$(cat "$work/docker/label")" = off ] && [ ! -e "$work/docker/envfile" ] && grep -q -- '--restart on-failure' "$work/docker/last-run"; then ok "first boot without a password creates the container with sign-in off"; else bad "first boot without a password (status $boot_status)"; fi
boot
if [ "$boot_status" = 0 ] && calls_have "docker start gmmc" && ! calls_have "docker run"; then ok "second boot only starts the existing container"; else bad "second boot only starts the existing container"; fi

echo "== sign-in on"
printf '%s\n' "$hash1" > "$work/boot/gmmc-password-hash"
boot
if [ "$boot_status" = 0 ] && calls_have "docker rm -f gmmc" && [ "$(cat "$work/docker/envcontent")" = "GMMC_PASSWORD_HASH=$hash1" ] && [ "$(cat "$work/docker/envmode")" = 600 ] \
	&& [ "$(cat "$work/docker/label")" = "$(printf '%s' "$hash1" | sha256sum | cut -d ' ' -f 1)" ]; then ok "a new password replaces the container and goes in through a root-only env file"; else bad "a new password replaces the container (status $boot_status)"; fi
if no_hash_in_calls; then ok "the hash is on no docker command line"; else bad "the hash appears on a docker command line"; fi
boot
if [ "$boot_status" = 0 ] && calls_have "docker start gmmc" && ! calls_have "docker run"; then ok "the same password keeps the container"; else bad "the same password keeps the container"; fi
printf '%s\n' "$hash2" > "$work/boot/gmmc-password-hash"
boot
if [ "$boot_status" = 0 ] && calls_have "docker run" && [ "$(cat "$work/docker/envcontent")" = "GMMC_PASSWORD_HASH=$hash2" ]; then ok "a changed password recreates the container with the new hash"; else bad "a changed password recreates the container"; fi

echo "== sign-in removed"
rm -f "$work/boot/gmmc-password-hash"
boot
if [ "$boot_status" = 0 ] && calls_have "docker run" && [ "$(cat "$work/docker/label")" = off ] && [ ! -e "$work/docker/envfile" ]; then ok "removing the password file turns sign-in off again"; else bad "removing the password file turns sign-in off again"; fi

echo "== invalid hash"
printf 'garbage\n' > "$work/boot/gmmc-password-hash"
boot
if [ "$boot_status" != 0 ] && calls_have "docker rm -f gmmc" && ! calls_have "docker run" && ! calls_have "docker start" && [ ! -e "$work/docker/exists" ]; then ok "an invalid hash refuses to start and removes any older container"; else bad "an invalid hash refuses to start (status $boot_status)"; fi

echo "== console banner"
cat > "$work/bin/ip" <<'FAKE'
#!/bin/sh
echo "2: eth0    inet 10.0.2.15/24 brd 10.0.2.255 scope global eth0"
FAKE
chmod 0755 "$work/bin/ip"
banner() { # <state text>: runs the banner for a moment with the given sign-in state
	mkdir -p "$work/state"; echo "$1" > "$work/state/signin-state"; : > "$work/console"; rm -f "$work/issue"
	GMMC_ISSUE_FILE="$work/issue" GMMC_CONSOLES="$work/console" GMMC_BANNER_INTERVAL=1 timeout 2 sh "$here/skel/usr/local/sbin/gmmc-banner" >/dev/null 2>&1
}
banner on
if grep -q "ready at: http://10.0.2.15:8080/ (Password required)" "$work/console" && grep -q "Password required" "$work/issue"; then ok "the banner says Password required when sign-in is on"; else bad "the banner says Password required"; cat "$work/console"; fi
banner off
if grep -q "ready at: http://10.0.2.15:8080/" "$work/console" && ! grep -q "Password required" "$work/console" "$work/issue" && grep -q "Sign-in is off" "$work/issue"; then ok "the banner says sign-in is off when it is off"; else bad "the banner when sign-in is off"; cat "$work/console"; fi
banner "invalid:the value is not a hash"
if grep -q "not valid, the editor was not started" "$work/console" && ! grep -q "ready at" "$work/console" && ! grep -q "the value is not a hash" "$work/issue"; then ok "the banner explains an invalid setting without the value"; else bad "the banner for an invalid setting"; cat "$work/console"; fi

echo
if [ "$fails" -eq 0 ]; then echo "ALL PASSED"; else echo "$fails FAILED"; exit 1; fi
