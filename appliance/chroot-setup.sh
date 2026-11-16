#!/bin/sh
# Runs inside the image (alpine-make-vm-image --script-chroot). Enables services and locks root.
set -eu

chmod 0755 /etc/init.d/gmmc-app /etc/init.d/gmmc-banner /usr/local/sbin/gmmc-banner /usr/local/sbin/gmmc-signin

echo gmmc > /etc/hostname
rc-update add networking boot
rc-update add docker default
rc-update add gmmc-app default
rc-update add gmmc-banner default

# No default password: lock the root account. SSH is not installed.
passwd -l root >/dev/null 2>&1 || true

# Show boot messages on both the screen and the serial port, and boot the installed kernel.
sed -Ei \
	-e 's|^[# ]*(default_kernel_opts)=.*|\1="console=tty0 console=ttyS0,115200"|' \
	-e 's|^[# ]*(default)=.*|\1=virt|' \
	/etc/update-extlinux.conf
update-extlinux --warn-only 2>&1 | grep -Fv 'extlinux: cannot open device /dev' || true

# Console login prompts: the screen and the serial port.
sed -Ei 's|^[# ]*(ttyS0:.*)|\1|' /etc/inittab
grep -q '^ttyS0:' /etc/inittab || echo 'ttyS0::respawn:/sbin/getty -L 115200 ttyS0 vt100' >> /etc/inittab

# Keep the image small.
rm -rf /var/cache/apk/* /root/.cache
