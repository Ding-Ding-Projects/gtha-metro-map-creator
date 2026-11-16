# Appliance virtual machine

The appliance is a small Linux virtual machine whose only job is to run the editor. It boots straight
into Docker, starts the published container image and shows its web address on the console, in the
same spirit as Home Assistant OS. Use it when you want a dedicated server without installing Docker on
a computer yourself.

## Which file to download

Each release attaches three images. The file names are
`gtha-metro-map-creator-appliance-<version>-x86_64.<format>.<compression>`.

| You use | Download | How |
| --- | --- | --- |
| Hyper-V on Windows | `.vhdx.zip` | Unzip. Create a **Generation 1** virtual machine with 1 GB of memory and a network switch, and attach the `.vhdx` as its existing disk. |
| VirtualBox | `.ova.zip` | Unzip, then File > Import Appliance. |
| VMware Workstation, Player or Fusion | `.ova.zip` | Unzip, then open or import the `.ova`. |
| Proxmox VE | `.qcow2.xz` | Run `unxz` on it, then `qm importdisk <vmid> <file>.qcow2 <storage>` and attach the disk. Use SeaBIOS (the default), not UEFI. |
| QEMU, KVM, libvirt, UTM (x86_64) | `.qcow2.xz` | Run `unxz`, then boot the `.qcow2`, for example `qemu-system-x86_64 -m 1024 -drive file=<file>.qcow2,if=virtio -nic user,hostfwd=tcp::8080-:8080`. |

Give the machine a network adapter that is bridged to your network (or NAT with a port forward) so other
devices can reach it. 1 GB of memory and 2 GB of disk are enough. The images are for 64-bit x86
(`x86_64`) and boot with legacy BIOS. There is no Raspberry Pi or other ARM image in this release.

## First boot

1. Start the machine. It needs no internet connection: the container image is part of the disk.
2. On first boot it loads the bundled image into Docker and starts the container, which takes a few
   seconds after the machine starts.
3. The console shows the address, for example
   `GTHA Metro Map Creator 1.5.0 is ready at: http://192.168.1.50:8080/`. The login prompt repeats it
   above the prompt as well. Open that address from any device on the same network. The editor is at
   `/app/`, the documentation at `/docs/` and the health check at `/healthz`.

If the console says it is waiting for a network address, check that the virtual network adapter is
connected and that your network hands out addresses by DHCP. You can also find the machine in your
router's list of connected devices; its name is `gmmc`.

## What is inside

- Alpine Linux with Docker, started at boot, and DHCP networking.
- The container image of the same release, stored on the disk and loaded on first boot.
- The container runs with a read-only file system, restart set to `unless-stopped`, and port 8080.
- A service that refreshes the address on the console whenever it changes.

## Updating

The editor stores nothing on the server (maps live in each visitor's browser), so updating is simply
replacing the virtual machine: download the new release's image, start it, and delete the old one. Keep
the old machine until the new one answers.

## Security notes

- The root account has no password and SSH is not installed, so the machine cannot be logged into over
  the network. The console shows the address only.
- The editor has no sign-in. Run the appliance on a network you trust and do not forward its port to the
  internet.
- To get a shell for maintenance, open the console, edit the boot entry at the boot menu to add
  `init=/bin/sh`, then set a password with `passwd root`. This is a deliberate local-only step.
- The images are not signed. Check them against `SHA256SUMS.txt` on the release page.

## How the images are built and tested

The Release workflow builds the appliance after the container image of the tag exists. It bakes in that
exact image by digest, converts the disk to each format and checks that every conversion holds identical
data. Before anything is uploaded it boots the `.qcow2` under QEMU with the guest port forwarded, waits up
to ten minutes for `/healthz` and `/app/` to answer, and checks that the console banner shows the address
and version. If the boot test fails nothing is uploaded. Only the QEMU boot is tested automatically; the
Hyper-V, VirtualBox and VMware formats are checked for identical contents but not started in those
products.

Files: `appliance/build.sh`, `appliance/chroot-setup.sh`, `appliance/boot-test.sh`,
`appliance/ovf.template` and the files under `appliance/skel/`.
