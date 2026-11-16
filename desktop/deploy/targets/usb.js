// Targets: a USB drive for a spare PC (x86_64 image) and an SD card or USB drive for a Raspberry Pi
// (arm64 image). Both erase the chosen drive and write the appliance image. The app only gets here
// after the person confirmed the exact drive in the erase-and-write dialog; the elevated helper
// checks again that the drive is removable and not the Windows disk.
'use strict';
const path = require('node:path');
const { listDisks, prepareImage, writeImage, addBootPassword } = require('../lib/flash');

const KINDS = { usb: 'x86_64', rpi: 'arm64-rpi' };

function makeDeploy(id) {
  return async function deploy(ctx) {
    const number = Number(ctx.settings.disk);
    if (!Number.isInteger(number) || number < 0) throw new Error('Choose a drive first.');
    ctx.emit(3, 'Checking the drive');
    const disks = await listDisks();
    const disk = disks.find((d) => d.number === number);
    if (!disk) throw new Error('Disk ' + number + ' is not a removable USB or SD drive that Windows can see right now. Plug it in again and choose it again.');
    if (disk.readOnly) throw new Error('The drive is write protected. Slide its lock switch and try again.');
    if (!ctx.confirmedDisk || ctx.confirmedDisk !== number) throw new Error('The erase-and-write confirmation was not given for this drive.');
    let image = await prepareImage({ version: ctx.version, kind: KINDS[id], cacheDir: path.join(ctx.userData, 'images'), signal: ctx.signal, emit: ctx.emit, log: ctx.log });
    let res;
    try {
      // Only the Raspberry Pi image has a FAT boot partition to put the password file on.
      if (id === 'rpi' && ctx.passwordHash) image = await addBootPassword(image, ctx.passwordHash, ctx.emit);
      ctx.emit(75, 'Writing to disk ' + number + ' (Windows will ask for permission)');
      res = await writeImage({ disk: number, image, userData: ctx.userData, emit: ctx.emit, log: ctx.log, signal: ctx.signal });
    } finally { try { require('node:fs').rmSync(image.file, { force: true }); } catch { /* cache */ } }
    if (!res.ok) throw new Error(res.message);
    const note = id === 'rpi'
      ? 'Written and read back. Put the card or drive in the Pi, plug in Ethernet, power it on, then open the address shown on its screen (or find it in your router\'s list; the name is gmmc).' + (ctx.passwordHash ? ' The password you chose is required to open the editor.' : '')
      : 'Written and read back. Boot the PC from USB (legacy BIOS mode), then open the address on its screen.';
    return { links: [{ label: disk.model + ' · Disk ' + number, url: '', kind: 'text' }], note, patch: {} };
  };
}

module.exports = { usb: { deploy: makeDeploy('usb') }, rpi: { deploy: makeDeploy('rpi') }, KINDS };
