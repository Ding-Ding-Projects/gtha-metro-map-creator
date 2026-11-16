# Appliance virtual machine and drive images

The appliance is a small Linux system whose only job is to run the editor. It boots straight into
Docker, starts the published container image and shows its web address on the console, in the same
spirit as Home Assistant OS. Use it when you want a dedicated server without installing Docker on a
computer yourself. It comes as virtual machine disks, as a raw image for a USB drive in a spare PC, and
as an image for a Raspberry Pi 4 or 5.

The [deploy app](deploy.md) can do the whole job for you: **VirtualBox** and **VMware** download the
right file, check it, import it and start it; **USB drive** and **Raspberry Pi** write the image to a
drive you choose. This page describes the files themselves, for doing it by hand.

## Which file to download

Each release attaches these images. The file names are
`gtha-metro-map-creator-appliance-<version>-<arch>.<format>` where `<arch>` is `x86_64` or `arm64-rpi`.

| You use | Download | How |
| --- | --- | --- |
| Hyper-V on Windows | `x86_64` `.vhdx.zip` | Unzip. Create a **Generation 1** virtual machine with 1 GB of memory and a network switch, and attach the `.vhdx` as its existing disk. |
| VirtualBox | `x86_64` `.ova.zip` | Unzip, then File > Import Appliance. |
| VMware Workstation, Player or Fusion | `x86_64` `.ova.zip` | Unzip, then open or import the `.ova`. |
| Proxmox VE | `x86_64` `.qcow2.xz` | Run `unxz` on it, then `qm importdisk <vmid> <file>.qcow2 <storage>` and attach the disk. Use SeaBIOS (the default), not UEFI. |
| QEMU, KVM, libvirt, UTM (x86_64) | `x86_64` `.qcow2.xz` | Run `unxz`, then boot the `.qcow2`, for example `qemu-system-x86_64 -m 1024 -drive file=<file>.qcow2,if=virtio -nic user,hostfwd=tcp::8080-:8080`. |
| A spare PC, from a USB drive | `x86_64` `.img.xz` | Unpack it (7-Zip or `unxz`) and write the `.img` to a USB drive with a tool such as Balena Etcher, Rufus (DD mode) or `dd`, or use the deploy app. The PC must boot in **legacy BIOS (CSM)** mode. |
| Raspberry Pi 4 or 5 | `arm64-rpi` `.img.xz` | Write it to an SD card or USB drive with Raspberry Pi Imager ("Use custom"), Balena Etcher or the deploy app. See the Raspberry Pi section below. |

Give a virtual machine a network adapter that is bridged to your network (or NAT with a port forward) so
other devices can reach it. 1 GB of memory and 2 GB of disk are enough.

## First boot

1. Start the machine. It needs no internet connection: the container image is part of the disk.
2. On first boot it loads the bundled image into Docker and starts the container, which takes a few
   seconds after the machine starts (a little longer on a Raspberry Pi).
3. The console shows the address, for example
   `GTHA Metro Map Creator 1.5.0 is ready at: http://192.168.1.50:8080/`. The login prompt repeats it
   above the prompt as well. Open that address from any device on the same network. The editor is at
   `/app/`, the documentation at `/docs/` and the health check at `/healthz`.

If the console says it is waiting for a network address, check that the network adapter or cable is
connected and that your network hands out addresses by DHCP. You can also find the machine in your
router's list of connected devices; its name is `gmmc`.

## The raw image for a USB drive (x86_64)

The `.img.xz` is the same disk as the `.qcow2`, as a raw image. It boots with **legacy BIOS only**: the
bootloader is syslinux in the MBR and the image has no EFI system partition, so a PC that can only boot
UEFI (no CSM or "legacy" option) will not start it. Writing it **erases the whole drive**. Use the deploy
app's **USB drive** card, which lists only removable USB and SD drives, makes you confirm the exact drive,
and reads every byte back after writing.

## Raspberry Pi 4 and 5 (arm64)

The `arm64-rpi` image is built from Alpine Linux for 64-bit ARM with the Raspberry Pi kernel and
firmware packages (`linux-rpi`, `raspberrypi-bootloader`). It has a FAT boot partition (firmware, kernel,
initramfs, device trees, `config.txt`, `cmdline.txt`) and an ext4 root, and uses the arm64 variant of the
same container image.

1. Write the image to an SD card or a USB drive (Raspberry Pi Imager > Choose OS > Use custom).
2. Plug **Ethernet** into the Pi (there is no Wi-Fi setup in this image), put the card or drive in and power it on.
3. Read the address on a screen attached to the Pi (HDMI) or in your router's list of connected devices.
   The root file system is about 1 GB and is not resized.

**What is and is not tested.** CI builds this image on an arm64 runner and boot-tests a "virt twin": the
same root file system booted under QEMU's generic arm64 machine with a generic arm64 kernel, checking that
Docker starts, the bundled image loads, `/healthz` and `/app/` answer, and the console banner shows the
address. The boot partition was inspected (firmware, kernel, initramfs, device trees for Pi 4 and Pi 5,
and the kernel's built-in ext4, SD and USB storage drivers). **Real Raspberry Pi hardware has not been
booted with this image**, so the firmware, kernel and device-tree path on a real Pi 4 or Pi 5 is
unverified until someone tries it.

The virt-twin boot test was also run once locally (Windows, Docker Desktop, QEMU 'virt' in an Alpine
container, software emulation): the image built from a real arm64 build of the container image booted,
Docker loaded the bundled image, `/healthz` and `/app/` answered after 38 seconds and the console showed
`GTHA Metro Map Creator 1.5.0 is ready at: http://10.0.2.15:8080/`. The CI jobs themselves have not run yet.

## Password sign-in

The editor can ask for a password before it shows anything except `/healthz`. The appliance has no console login and no
keyboard setup, so the password is given to it as a **password hash on a small disk or file**, read at every boot. Make the hash
with the deploy app (it does everything below for you on VirtualBox, VMware and a Raspberry Pi card) or by hand with the
container image's own tool, which reads the password from standard input:

```
printf 'your password here' | docker run --rm -i ghcr.io/ding-ding-projects/gtha-metro-map-creator:<version> gmmc-auth hash
```

The result looks like `pbkdf2-sha256:600000:<salt>:<hash>` and cannot be turned back into the password. Then put it in one of these:

| Where | How |
| --- | --- |
| **Configuration disk** (any appliance) | A disk whose file system label is `GMMCCONF`, FAT or ISO 9660, holding a text file named `password-hash` with the hash on its first line. Attach it to the virtual machine as a second disk or as a CD-ROM, or plug in a small FAT32 USB stick named `GMMCCONF`. The appliance mounts it read-only. On an ISO 9660 disk without Rock Ridge or Joliet extensions the name may appear as `password_hash`, which is accepted too |
| **Raspberry Pi boot partition** | A file named `gmmc-password-hash` in the root of the FAT boot partition (the card shows it as a normal drive on any computer once it is written, like the `ssh` file of Raspberry Pi OS). The deploy app adds it for you before writing the card |

What the appliance does with it, at every boot, before it starts the editor:

- **No disk and no file:** sign-in stays off, as before. Removing the disk or the file turns sign-in off again at the next boot.
- **A valid hash:** the editor starts with sign-in on. The hash goes to the container through a file that only root can read (docker `--env-file`), never on a command line.
  The console banner adds **Password required**. The container carries a label with a digest of the setting, so when the hash changes on a later boot the container is replaced
  with one that has the new hash (the editor stores nothing on the server, so nothing is lost).
- **An invalid value** (not a `pbkdf2-sha256:<100000 to 5000000>:<salt>:<hash>` hash, an empty file, or a configuration disk without the file): the editor is **not started**,
  any older container is removed so nothing answers, and the console says the password setting is not valid. The value itself is never printed. Fix or remove the file and restart the machine.
- If both exist, the configuration disk wins over the boot-partition file.

The disk or file holds a hash, not the password, but anyone who can read the hash can try to guess the password offline, so treat it like a secret: do not put it on a shared disk.
A virtual machine's configuration disk is a file in the instance's folder; the container's environment (`docker inspect`, root only) also holds it.
The hash alone does not let anyone sign in.

## What is inside

- Alpine Linux with Docker, started at boot, and DHCP networking.
- The container image of the same release, stored on the disk and loaded on first boot.
- The container runs with a read-only file system, restart set to `on-failure` (the appliance's own service starts it at boot, after it has checked the sign-in setting), and port 8080.
- `gmmc-signin`, which looks for the password hash at boot (above), and `blkid` to find the labelled disk.
- A service that refreshes the address on the console whenever it changes (screen, serial port and, on
  a Pi, `ttyAMA0`).

## Updating

The editor stores nothing on the server (maps live in each visitor's browser), so updating is simply
replacing the machine or the drive: download the new release's image, start it, and delete the old one.
In the deploy app, **Update** on an appliance instance builds the new machine first and removes the old
one only after the new one answers. Keep the old machine until the new one answers.

## Security notes

- The root account has no password and SSH is not installed, so the machine cannot be logged into over
  the network. The console shows the address only.
- The editor has no sign-in unless you turn it on (see Password sign-in above). Run the appliance on a network you trust and do not forward
  its port to the internet.
- Password sign-in is built in and off until you give the appliance a password hash (next section). With it off,
  anyone on the network can open the editor, and the console says so.
- To get a shell for maintenance, open the console, edit the boot entry at the boot menu to add
  `init=/bin/sh`, then set a password with `passwd root`. This is a deliberate local-only step.
- The images are not signed. Check them against `SHA256SUMS.txt` on the release page. The deploy app
  does this check itself and deletes a download whose hash does not match.

## How the images are built and tested

The container image is published for `linux/amd64` and `linux/arm64`. The Release workflow builds the
appliance after the container image of the tag exists. The x86_64 job bakes in that exact image by
digest, converts the disk to each format (including the raw `.img.xz`) and checks that every conversion
holds identical data. Before anything is uploaded it boots the `.qcow2` under QEMU with the guest port
forwarded, waits up to ten minutes for `/healthz` and `/app/` to answer, and checks that the console
banner shows the address and version. A second job on an `ubuntu-24.04-arm` runner builds the Raspberry
Pi image in an arm64 Alpine container (`appliance/build-rpi.sh`, `appliance/rpi-in-container.sh`) and
runs the virt-twin boot test (`appliance/boot-test-rpi.sh`). If a boot test fails nothing is uploaded.
Password sign-in is tested in three more boots of the x86_64 image and one of the Raspberry Pi virt twin, each with a random password hashed by the container image's own `gmmc-auth`: a FAT configuration disk, the ISO that the deploy app writes
(made by the same Node code, `desktop/deploy/lib/config-disk.js`), an invalid disk (the editor must not start and the banner must say so without showing the value), and, for the Pi, a FAT disk labelled `GMMCBOOT`
standing in for the boot partition. Each checks that `/healthz` stays open, `/app/` redirects to `/signin`, a wrong password is refused, the right one signs in and then `/app/` is 200, and that the console banner says **Password required**.
The Pi virt twin cannot prove that a real Pi mounts its own boot partition at `/boot`; the lookup for that path (and for FAT, ISO, empty, malformed and out-of-range values) is covered by `appliance/test-signin.sh`, which runs
against real loop devices before the images are built, and `appliance/test-service.sh` runs the openrc service against a fake `docker` (container created, kept, replaced when the hash changes, recreated without sign-in when the file is removed,
refused when invalid, hash never on a command line). Only the QEMU boots are tested automatically; the Hyper-V, VirtualBox and VMware formats are checked
for identical contents but not started in those products, and the raw USB image's legacy BIOS boot on
physical hardware has not been tried.

Files: `appliance/build.sh`, `appliance/chroot-setup.sh`, `appliance/boot-test.sh`,
`appliance/build-rpi.sh`, `appliance/rpi-in-container.sh`, `appliance/boot-test-rpi.sh`,
`appliance/ovf.template`, the sign-in tests below and the files under `appliance/skel/`. The `Appliance check` workflow runs both
builds and boot tests from `main` without releasing anything.
