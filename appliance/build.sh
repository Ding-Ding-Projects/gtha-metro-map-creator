#!/bin/bash
# Builds the appliance disk images. Needs root, Linux, qemu-utils, rsync, e2fsprogs, zip, xz and Docker.
# Usage: sudo appliance/build.sh <version> <image-ref> <output-dir>
#   <image-ref> is the exact container image to bake in, for example
#   ghcr.io/ding-ding-projects/gtha-metro-map-creator:1.5.0
set -euo pipefail
version="$1"; image="$2"; out="$(mkdir -p "$3" && cd "$3" && pwd)"
here="$(cd "$(dirname "$0")" && pwd)"
base="gtha-metro-map-creator-appliance-$version-x86_64"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

AMVI_VERSION=v0.13.4
AMVI_SHA256=c643b7f894e34575836c4835bd2ded6f27958ea5212c1295b4f82ccd0b670029
ALPINE_BRANCH=v3.22

echo "== Fetching alpine-make-vm-image $AMVI_VERSION"
curl -fsSL "https://raw.githubusercontent.com/alpinelinux/alpine-make-vm-image/$AMVI_VERSION/alpine-make-vm-image" -o "$work/amvi"
echo "$AMVI_SHA256  $work/amvi" | sha256sum -c -
chmod +x "$work/amvi"

echo "== Staging the image tree and the container image"
cp -a "$here/skel" "$work/skel"
mkdir -p "$work/skel/opt/gmmc"
docker image inspect "$image" >/dev/null
docker save "$image" -o "$work/skel/opt/gmmc/image.tar"
cat > "$work/skel/opt/gmmc/appliance.env" <<ENV
GMMC_VERSION=$version
GMMC_IMAGE=$image
ENV
chmod 0644 "$work/skel/opt/gmmc/appliance.env"

echo "== Building the Alpine disk image"
"$work/amvi" --image-format qcow2 --image-size 2G --branch "$ALPINE_BRANCH" \
	--serial-console --initfs-features ata \
	--packages "docker docker-openrc iproute2" \
	--fs-skel-dir "$work/skel" --fs-skel-chown root:root \
	--script-chroot "$work/$base.qcow2" "$here/chroot-setup.sh"

echo "== Converting"
qemu-img convert -O vhdx -o subformat=dynamic "$work/$base.qcow2" "$work/$base.vhdx"
qemu-img convert -O vmdk -o subformat=streamOptimized "$work/$base.qcow2" "$work/$base.vmdk"
for f in vhdx vmdk; do
	qemu-img compare -f qcow2 -F "$f" "$work/$base.qcow2" "$work/$base.$f"
done

echo "== Packing the OVA"
capacity=$(qemu-img info --output=json "$work/$base.qcow2" | sed -n 's/.*"virtual-size": *\([0-9]*\).*/\1/p' | head -n 1)
sed -e "s|@DISK@|$base.vmdk|" -e "s|@DISKSIZE@|$(stat -c %s "$work/$base.vmdk")|" \
	-e "s|@CAPACITY@|$capacity|" -e "s|@NAME@|GTHA Metro Map Creator $version|" \
	-e "s|@VERSION@|$version|" "$here/ovf.template" > "$work/$base.ovf"
(cd "$work" && tar --format=ustar -cf "$base.ova" "$base.ovf" "$base.vmdk")

echo "== Compressing"
cp "$work/$base.qcow2" "$out/$base.qcow2"          # kept uncompressed for the boot test
(cd "$work" && zip -9 -q "$out/$base.vhdx.zip" "$base.vhdx" && zip -9 -q "$out/$base.ova.zip" "$base.ova")
xz -9 -T0 -k -c "$work/$base.qcow2" > "$out/$base.qcow2.xz"
# A raw disk image for writing to a USB drive. It boots with legacy BIOS only: the bootloader is
# syslinux in the MBR, and the image has no EFI system partition.
qemu-img convert -O raw "$work/$base.qcow2" "$work/$base.img"
xz -9 -T0 -c "$work/$base.img" > "$out/$base.img.xz"
ls -l "$out"
