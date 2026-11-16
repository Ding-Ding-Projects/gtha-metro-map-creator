#!/bin/bash
# Builds the Raspberry Pi (arm64) appliance disk image. Needs Docker. Run it on an arm64 host (the
# release workflow uses an ubuntu-24.04-arm runner); on an x86_64 host it also works when Docker has
# arm64 emulation (qemu-user-static / binfmt), only much more slowly.
# Usage: appliance/build-rpi.sh <version> <image-ref> <output-dir>
#   <image-ref> is the exact container image to bake in. Its linux/arm64 variant is used.
# Output: <base>.img.xz (the image to write), plus <base>-virt-root.ext4, vmlinuz-virt and
# initramfs-virt for appliance/boot-test-rpi.sh.
set -euo pipefail
version="$1"; image="$2"; out="$(mkdir -p "$3" && cd "$3" && pwd)"
here="$(cd "$(dirname "$0")" && pwd)"
base="gtha-metro-map-creator-appliance-$version-arm64-rpi"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "== Saving the arm64 container image"
docker pull --platform linux/arm64 "$image" >/dev/null
arch="$(docker image inspect "$image" --format '{{.Architecture}}')"
[ "$arch" = "arm64" ] || { echo "The image $image is $arch, not arm64. Publish a multi-architecture image first."; exit 1; }
docker save "$image" -o "$work/image.tar"
cat > "$work/appliance.env" <<ENV
GMMC_VERSION=$version
GMMC_IMAGE=$image
ENV

echo "== Building the Raspberry Pi image in an arm64 Alpine container"
docker run --rm --platform linux/arm64 \
	-v "$here:/appliance:ro" -v "$work:/work:ro" -v "$out:/out" \
	alpine:3.22 sh /appliance/rpi-in-container.sh "$version" "$base"
ls -l "$out"
