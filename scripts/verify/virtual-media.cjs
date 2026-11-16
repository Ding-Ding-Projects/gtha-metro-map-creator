// Writes the released appliance images to virtual drives with the deploy app's own flash code.
// No real drive is touched: the target of each write is a plain disk-image file, which is the
// helper's test mode (no elevation, same write and read-back code). Afterwards boot the virtual
// USB stick with appliance/boot-usb-test.sh.
//
// Usage: node scripts/verify/virtual-media.cjs <version> <work-dir>
// Writes <work-dir>/virtual-usb-stick.img (4 GiB) and <work-dir>/virtual-sd-card.img (8 GiB, with a
// sign-in password hash on its boot partition) and prints a JSON summary. The test password is
// random, used once and never printed.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [version, workArg] = process.argv.slice(2);
if (!version || !workArg) { console.error('Usage: node scripts/verify/virtual-media.cjs <version> <work-dir>'); process.exit(2); }
const work = path.resolve(workArg);
fs.mkdirSync(work, { recursive: true });
process.env.GMMC_HIDDEN = '1';

const desktop = path.join(__dirname, '..', '..', 'desktop');
const flash = require(path.join(desktop, 'deploy', 'lib', 'flash.js'));
const { hashPassword } = require(path.join(desktop, 'shared', 'password.js'));

const GiB = 1024 * 1024 * 1024;
const log = () => {};
let last = '';
const emit = (pct, msg) => { const line = pct + '% ' + msg; if (line !== last) { last = line; process.stderr.write(line + '\n'); } };

async function writeTo(target, sizeBytes, image) {
  fs.rmSync(target, { force: true });
  fs.closeSync(fs.openSync(target, 'w'));
  fs.truncateSync(target, sizeBytes); // a blank drive larger than the image, like a real stick or card
  process.env.GMMC_TEST_FLASH_FILE = target;
  const disks = await flash.listDisks();
  if (disks.length !== 1 || disks[0].number !== flash.TEST_DISK_NUMBER) throw new Error('The test drive list is wrong.');
  const t0 = Date.now();
  const r = await flash.writeImage({ disk: flash.TEST_DISK_NUMBER, image, userData: work, emit, log });
  if (!r.ok) throw new Error('The write failed: ' + r.message);
  // Independent check: hash the first image.size bytes of the virtual drive here, outside the helper.
  const h = crypto.createHash('sha256');
  await new Promise((res, rej) => fs.createReadStream(target, { start: 0, end: image.size - 1 }).on('data', (c) => h.update(c)).on('end', res).on('error', rej));
  const independent = h.digest('hex');
  if (independent !== image.sha256) throw new Error('The virtual drive does not hold the image bytes.');
  return { target, driveBytes: fs.statSync(target).size, imageBytes: image.size, sha256: image.sha256, helperSha256: r.sha256, independentSha256: independent, helperMessage: r.message, seconds: Math.round((Date.now() - t0) / 1000) };
}

(async () => {
  const cacheDir = path.join(work, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = { version };

  const usbImage = await flash.prepareImage({ version, kind: 'x86_64', cacheDir, emit, log });
  out.usb = await writeTo(path.join(work, 'virtual-usb-stick.img'), 4 * GiB, usbImage);

  const piImage = await flash.prepareImage({ version, kind: 'arm64-rpi', cacheDir, emit, log });
  const password = 'test-' + crypto.randomBytes(12).toString('hex');
  const hash = hashPassword(password);
  fs.writeFileSync(path.join(work, 'expected-password-hash'), hash + '\n');
  fs.writeFileSync(path.join(work, 'test-password'), password, { mode: 0o600 });
  const withPassword = await flash.addBootPassword(piImage, hash, emit);
  out.sd = await writeTo(path.join(work, 'virtual-sd-card.img'), 8 * GiB, withPassword);
  out.sd.passwordHashAdded = true;

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error('VIRTUAL MEDIA FAILED: ' + e.message); process.exit(1); });
