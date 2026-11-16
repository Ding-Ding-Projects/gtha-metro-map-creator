// Makes the small configuration disk that carries an appliance's sign-in password hash.
//
// The appliance looks for a read-only disk labelled GMMCCONF (FAT or ISO 9660) holding one file named
// "password-hash". A virtual machine gets it as a CD-ROM, so this writes a minimal ISO 9660 image in plain
// Node (level 2 names, one directory, one file) that VirtualBox and VMware can attach directly.
//
// The file is stored as PASSWORD_HASH because ISO 9660 names cannot contain a hyphen. Without Rock Ridge or
// Joliet extensions Linux shows it as "password_hash", which the appliance reads as well as "password-hash".
// Only the hash is ever written, never the password.
'use strict';
const fs = require('node:fs');
const { hashOk } = require('../../shared/password');

const SECTOR = 2048;
const LABEL = 'GMMCCONF';
const FILE_ID = 'PASSWORD_HASH.;1';

const both32 = (n) => { const b = Buffer.alloc(8); b.writeUInt32LE(n, 0); b.writeUInt32BE(n, 4); return b; };
const both16 = (n) => { const b = Buffer.alloc(4); b.writeUInt16LE(n, 0); b.writeUInt16BE(n, 2); return b; };
const pad = (text, n) => Buffer.from(String(text).padEnd(n, ' ').slice(0, n), 'latin1');
const sectors = (bytes) => Math.max(1, Math.ceil(bytes / SECTOR));

// Seven-byte directory record time stamp.
function recordTime(d) {
  return Buffer.from([d.getUTCFullYear() - 1900, d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), 0]);
}
// Seventeen-byte volume descriptor time stamp.
function volumeTime(d) {
  const p = (n, w) => String(n).padStart(w, '0');
  return Buffer.concat([Buffer.from(p(d.getUTCFullYear(), 4) + p(d.getUTCMonth() + 1, 2) + p(d.getUTCDate(), 2) + p(d.getUTCHours(), 2) + p(d.getUTCMinutes(), 2) + p(d.getUTCSeconds(), 2) + '00', 'latin1'), Buffer.from([0])]);
}
const noTime = () => Buffer.concat([Buffer.from('0'.repeat(16), 'latin1'), Buffer.from([0])]);

// One directory record. `id` is a Buffer (the name, or 0x00 for "." and 0x01 for "..").
function dirRecord(id, extent, length, isDir, time) {
  const len = 33 + id.length + (id.length % 2 === 0 ? 1 : 0);
  const b = Buffer.alloc(len);
  b[0] = len; b[1] = 0;
  both32(extent).copy(b, 2); both32(length).copy(b, 10);
  recordTime(time).copy(b, 18);
  b[25] = isDir ? 2 : 0; b[26] = 0; b[27] = 0;
  both16(1).copy(b, 28);
  b[32] = id.length; id.copy(b, 33);
  return b;
}

// Returns the bytes of an ISO 9660 image with one file, `fileName`, holding `content` (a Buffer).
function buildIso(content, opts = {}) {
  const time = opts.time || new Date();
  const label = opts.label || LABEL;
  const fileId = Buffer.from(opts.fileId || FILE_ID, 'latin1');
  const L_PATH = 18, M_PATH = 19, ROOT = 20, DATA = 21;
  const total = DATA + sectors(content.length);
  const out = Buffer.alloc(total * SECTOR);

  // Root directory: ".", ".." and the file, in one sector.
  const dot = dirRecord(Buffer.from([0]), ROOT, SECTOR, true, time);
  const dotdot = dirRecord(Buffer.from([1]), ROOT, SECTOR, true, time);
  const file = dirRecord(fileId, DATA, content.length, false, time);
  Buffer.concat([dot, dotdot, file]).copy(out, ROOT * SECTOR);

  // Primary volume descriptor.
  const pvd = Buffer.alloc(SECTOR);
  pvd[0] = 1; pvd.write('CD001', 1, 'latin1'); pvd[6] = 1;
  pad('', 32).copy(pvd, 8); pad(label, 32).copy(pvd, 40);
  both32(total).copy(pvd, 80);
  both16(1).copy(pvd, 120); both16(1).copy(pvd, 124); both16(SECTOR).copy(pvd, 128);
  both32(10).copy(pvd, 132);
  pvd.writeUInt32LE(L_PATH, 140); pvd.writeUInt32BE(M_PATH, 148);
  dirRecord(Buffer.from([0]), ROOT, SECTOR, true, time).copy(pvd, 156); // 34 bytes
  for (const [off, n] of [[190, 128], [318, 128], [446, 128], [574, 128], [702, 37], [739, 37], [776, 37]]) pad('', n).copy(pvd, off);
  volumeTime(time).copy(pvd, 813); volumeTime(time).copy(pvd, 830); noTime().copy(pvd, 847); volumeTime(time).copy(pvd, 864);
  pvd[881] = 1;
  pvd.copy(out, 16 * SECTOR);

  // Volume descriptor set terminator.
  const end = Buffer.alloc(SECTOR); end[0] = 255; end.write('CD001', 1, 'latin1'); end[6] = 1;
  end.copy(out, 17 * SECTOR);

  // Path tables (little and big endian), one entry for the root directory.
  const l = Buffer.alloc(10); l[0] = 1; l.writeUInt32LE(ROOT, 2); l.writeUInt16LE(1, 6);
  const m = Buffer.alloc(10); m[0] = 1; m.writeUInt32BE(ROOT, 2); m.writeUInt16BE(1, 6);
  l.copy(out, L_PATH * SECTOR); m.copy(out, M_PATH * SECTOR);

  content.copy(out, DATA * SECTOR);
  return out;
}

// Writes the configuration disk for `hash` to `file` (an .iso path). Refuses anything that is not a hash,
// so a plain password can never end up on the disk.
function writeConfigIso(file, hash) {
  if (!hashOk(hash)) throw new Error('The sign-in setting is not a valid password hash.');
  fs.writeFileSync(file, buildIso(Buffer.from(hash + '\n', 'latin1')), { mode: 0o600 });
  return file;
}

module.exports = { buildIso, writeConfigIso, LABEL, FILE_ID };

// node config-disk.js <hash-file> <out.iso>: used by the CI boot test to make the same disk the deploy app makes.
if (require.main === module) {
  const [hashFile, outFile] = process.argv.slice(2);
  if (!hashFile || !outFile) { console.error('usage: node config-disk.js <hash-file> <out.iso>'); process.exit(2); }
  try { writeConfigIso(outFile, fs.readFileSync(hashFile, 'utf8').trim()); console.log('wrote ' + outFile); } catch (e) { console.error(e.message); process.exit(1); }
}
