#!/bin/sh
# Run by the nginx image entrypoint before nginx starts. Chooses the sign-in configuration and, when a
# password hash is configured, starts the small sign-in service. Never prints the hash.
set -eu
conf=/tmp/gmmc-auth
mkdir -p "$conf"

hash="${GMMC_PASSWORD_HASH:-}"
if [ -z "$hash" ] && [ -n "${GMMC_PASSWORD_HASH_FILE:-}" ]; then
  [ -r "$GMMC_PASSWORD_HASH_FILE" ] || { echo "gmmc: GMMC_PASSWORD_HASH_FILE is not readable" >&2; exit 1; }
  hash="$(head -n 1 "$GMMC_PASSWORD_HASH_FILE" | tr -d '\r\n ')"
fi

if [ -z "$hash" ]; then
  cp /etc/gmmc/off.http.conf "$conf/http.conf"
  cp /etc/gmmc/off.server.conf "$conf/server.conf"
  echo "gmmc: sign-in is off"
  exit 0
fi

cp /etc/gmmc/on.http.conf "$conf/http.conf"
cp /etc/gmmc/on.server.conf "$conf/server.conf"
GMMC_PASSWORD_HASH="$hash" /usr/local/bin/gmmc-auth &
pid=$!
i=0
until wget -q -O /dev/null http://127.0.0.1:9100/ready 2>/dev/null; do
  i=$((i + 1))
  if ! kill -0 "$pid" 2>/dev/null || [ "$i" -gt 50 ]; then
    echo "gmmc: the sign-in service did not start; check GMMC_PASSWORD_HASH" >&2
    exit 1
  fi
  sleep 0.1
done
echo "gmmc: sign-in is on"
