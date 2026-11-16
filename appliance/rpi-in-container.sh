#!/bin/sh
# Runs inside an arm64 Alpine container (started by build-rpi.sh). Builds the Raspberry Pi root file
# system and the boot partition, assembles the raw disk image, and builds a "virt" twin of the same
# root file system that the QEMU boot test can start.
# Arguments: <version> <base-name>. Mounts: /appliance (read-only), /work (the image tar and env file), /out.
set -eu
version="$1"; base="$2"
BOOT_MB=256
ROOT_MB=1000
DISK_ID=6d6d6763          # fixed MBR disk id, so the kernel command line can use PARTUUID=<id>-02

apk add --no-cache e2fsprogs mtools dosfstools sfdisk xz file >/dev/null

# --- the root file system ---------------------------------------------------------------------
R=/rootfs
mkdir -p "$R/etc/apk" "$R/etc/mkinitfs" "$R/proc" "$R/sys" "$R/dev" "$R/run" "$R/tmp" "$R/boot"
cp /etc/apk/repositories "$R/etc/apk/repositories"
# The initramfs must be able to find an ext4 root on an SD card or a USB drive.
cat > "$R/etc/mkinitfs/mkinitfs.conf" <<'CONF'
features="base ext4 mmc usb"
CONF
apk add --root "$R" --initdb --keys-dir /etc/apk/keys --no-cache --no-progress \
	alpine-base openrc docker docker-openrc iproute2 e2fsprogs \
	linux-rpi raspberrypi-bootloader mkinitfs

echo gmmc > "$R/etc/hostname"
mkdir -p "$R/etc/network"
printf 'auto lo\niface lo inet loopback\n\nauto eth0\niface eth0 inet dhcp\n' > "$R/etc/network/interfaces"
cp -a /appliance/skel/. "$R/"
mkdir -p "$R/opt/gmmc"
cp /work/image.tar "$R/opt/gmmc/image.tar"
cp /work/appliance.env "$R/opt/gmmc/appliance.env"
chmod 0644 "$R/opt/gmmc/appliance.env"
chmod 0755 "$R/etc/init.d/gmmc-app" "$R/etc/init.d/gmmc-banner" "$R/usr/local/sbin/gmmc-banner"

for s in devfs dmesg mdev hwdrivers; do chroot "$R" rc-update add "$s" sysinit; done
for s in modules sysctl hostname bootmisc syslog networking swclock; do chroot "$R" rc-update add "$s" boot; done
for s in mount-ro killprocs savecache; do chroot "$R" rc-update add "$s" shutdown; done
for s in docker gmmc-app gmmc-banner; do chroot "$R" rc-update add "$s" default; done
chroot "$R" passwd -l root >/dev/null 2>&1 || true
# Docker needs these kernel modules, which the Raspberry Pi kernel builds as modules.
printf 'overlay
veth
bridge
br_netfilter
' >> "$R/etc/modules"

# Console login prompts: the screen and the Raspberry Pi serial port.
grep -q '^ttyAMA0:' "$R/etc/inittab" || echo 'ttyAMA0::respawn:/sbin/getty -L 115200 ttyAMA0 vt100' >> "$R/etc/inittab"
rm -rf "$R/var/cache/apk"/* "$R/root/.cache"

# --- the virt twin used by the boot test (same root, different kernel and root device) ----------
V=/rootfs-virt
cp -a "$R" "$V"
cat > "$V/etc/mkinitfs/mkinitfs.conf" <<'CONF'
features="base ext4 virtio"
CONF
apk add --root "$V" --keys-dir /etc/apk/keys --no-cache --no-progress linux-virt
echo '/dev/vda / ext4 defaults,noatime 0 1' > "$V/etc/fstab"
ls "$V/boot" | grep -E 'vmlinuz-virt|initramfs-virt' >/dev/null
mke2fs -q -t ext4 -L gmmc-root -d "$V" /out/"$base"-virt-root.ext4 "${ROOT_MB}M"
cp "$V/boot/vmlinuz-virt" "$V/boot/initramfs-virt" /out/
# mkinitfs writes the initramfs as root-only; the boot test runs as the runner user.
chmod 0644 /out/vmlinuz-virt /out/initramfs-virt
rm -rf "$V"

# --- the Raspberry Pi boot partition -----------------------------------------------------------
B=/bootfs
mkdir -p "$B"
cp -a "$R/boot/." "$B/"
# Alpine may keep the device trees in a subdirectory; the firmware wants them at the top.
if [ -d "$B/dtbs-rpi" ]; then cp -a "$B/dtbs-rpi/." "$B/"; fi
kernel=$(ls "$B" | grep -E '^vmlinuz-rpi' | head -n 1)
initrd=$(ls "$B" | grep -E '^initramfs-rpi' | head -n 1)
[ -n "$kernel" ] && [ -n "$initrd" ] || { echo "The Raspberry Pi kernel or initramfs is missing from /boot"; ls -l "$B"; exit 1; }
ls "$B" | grep -Eq '^start4?\.elf$' || { echo "The Raspberry Pi firmware (start.elf) is missing from /boot"; ls -l "$B"; exit 1; }
cat > "$B/config.txt" <<CFG
# GTHA Metro Map Creator appliance for Raspberry Pi 4 and 5 (64-bit).
arm_64bit=1
kernel=$kernel
initramfs $initrd followkernel
enable_uart=1
disable_splash=1
CFG
echo "root=PARTUUID=$DISK_ID-02 rootfstype=ext4 rootwait console=tty1 console=ttyAMA0,115200" > "$B/cmdline.txt"
printf 'PARTUUID=%s-01 /boot vfat defaults 0 2\nPARTUUID=%s-02 / ext4 defaults,noatime 0 1\n' "$DISK_ID" "$DISK_ID" > "$R/etc/fstab"

truncate -s "${BOOT_MB}M" /boot.img
mkfs.vfat -F 32 -n GMMCBOOT /boot.img >/dev/null
mcopy -i /boot.img -s "$B"/* ::/
mke2fs -q -t ext4 -L gmmc-root -d "$R" /root.img "${ROOT_MB}M"

img=/out/"$base".img
truncate -s "$((1 + BOOT_MB + ROOT_MB + 1))M" "$img"
sfdisk "$img" >/dev/null <<PT
label: dos
label-id: 0x$DISK_ID
unit: sectors
start=2048, size=$((BOOT_MB * 2048)), type=c, bootable
start=$((2048 + BOOT_MB * 2048)), size=$((ROOT_MB * 2048)), type=83
PT
dd if=/boot.img of="$img" bs=1M seek=1 conv=notrunc status=none
dd if=/root.img of="$img" bs=1M seek="$((1 + BOOT_MB))" conv=notrunc status=none
sfdisk -l "$img"
xz -9 -T0 -c "$img" > "$img.xz"
rm -f "$img"
ls -l /out
