// Adds one small file to the root directory of a FAT32 volume inside a raw disk image, in plain Node.
//
// It is used to put the appliance's sign-in password hash (gmmc-password-hash) on the boot partition of the
// Raspberry Pi image before the image is written to a card. Only that one narrow job is supported: a file that
// fits in one cluster, added to the root directory, on a volume that has not been touched by anything else. It
// refuses (and changes nothing) when the volume is not FAT32, the name already exists, or there is no room.
'use strict';
const fs = require('node:fs');

const SECTOR = 512;

// The byte offset and size of the first partition in a raw image with an MBR partition table, or null.
function firstPartition(fd) {
  const mbr = Buffer.alloc(SECTOR);
  if (fs.readSync(fd, mbr, 0, SECTOR, 0) !== SECTOR || mbr.readUInt16LE(510) !== 0xaa55) return null;
  const type = mbr[446 + 4]; const lba = mbr.readUInt32LE(446 + 8); const count = mbr.readUInt32LE(446 + 12);
  if (!lba || !count || ![0x0b, 0x0c].includes(type)) return null; // FAT32 CHS or LBA
  return { offset: lba * SECTOR, size: count * SECTOR };
}

const readAt = (fd, pos, len) => { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); if (n !== len) throw new Error('The image ended early.'); return b; };
const writeAt = (fd, pos, buf) => { if (fs.writeSync(fd, buf, 0, buf.length, pos) !== buf.length) throw new Error('The image could not be written.'); };

// The 8.3 checksum that ties long-name entries to their short entry.
function lfnChecksum(short11) { let s = 0; for (const c of short11) s = (((s & 1) << 7) + (s >> 1) + c) & 0xff; return s; }

function fatDate(d) { return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(); }
function fatTime(d) { return (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1); }

// Adds `name` (long file name, ASCII letters, digits, '-', '_' and '.') holding `content` to the root directory
// of the FAT32 volume that starts `volumeOffset` bytes into the open file `fd`.
function addRootFile(fd, volumeOffset, name, content, now = new Date()) {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new Error('That file name cannot be used.');
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'latin1');
  const boot = readAt(fd, volumeOffset, SECTOR);
  if (boot.readUInt16LE(510) !== 0xaa55 || boot.toString('latin1', 82, 90) !== 'FAT32   ' || boot.readUInt16LE(11) !== SECTOR || boot.readUInt16LE(17) !== 0 || boot.readUInt16LE(22) !== 0) throw new Error('The boot partition is not a FAT32 volume with 512-byte sectors.');
  const spc = boot[13]; const reserved = boot.readUInt16LE(14); const nfats = boot[16]; const total = boot.readUInt32LE(32); const fatSectors = boot.readUInt32LE(36);
  const rootCluster = boot.readUInt32LE(44); const fsinfoSector = boot.readUInt16LE(48);
  const clusterBytes = spc * SECTOR;
  if (!spc || !nfats || !fatSectors || rootCluster < 2 || data.length > clusterBytes) throw new Error('The FAT32 volume has an unexpected layout.');
  const dataStart = reserved + nfats * fatSectors;
  const clusters = Math.floor((total - dataStart) / spc);
  const fatOffset = volumeOffset + reserved * SECTOR;
  const fat = readAt(fd, fatOffset, fatSectors * SECTOR);
  const next = (c) => fat.readUInt32LE(c * 4) & 0x0fffffff;
  const clusterPos = (c) => volumeOffset + (dataStart + (c - 2) * spc) * SECTOR;
  const isEnd = (v) => v >= 0x0ffffff8;
  const setFat = (c, v) => {
    fat.writeUInt32LE((fat.readUInt32LE(c * 4) & 0xf0000000 | v) >>> 0, c * 4);
    for (let i = 0; i < nfats; i++) writeAt(fd, fatOffset + i * fatSectors * SECTOR + c * 4, fat.subarray(c * 4, c * 4 + 4));
  };
  const freeCluster = (skip) => { for (let c = 2; c < clusters + 2; c++) if (next(c) === 0 && c !== skip) return c; throw new Error('The boot partition is full.'); };

  // Read the root directory chain.
  const chain = []; for (let c = rootCluster; !isEnd(c) && c >= 2 && chain.length < 4096; c = next(c)) chain.push(c);
  if (!chain.length) throw new Error('The root directory could not be read.');
  const dir = Buffer.concat(chain.map((c) => readAt(fd, clusterPos(c), clusterBytes)));
  const entries = dir.length / 32;

  // Existing names, short and long, so nothing is overwritten.
  const shortNames = new Set(); let longName = ''; let end = entries;
  for (let i = 0; i < entries; i++) {
    const e = dir.subarray(i * 32, i * 32 + 32);
    if (e[0] === 0x00) { end = i; break; }
    if (e[0] === 0xe5) { longName = ''; continue; }
    if (e[11] === 0x0f) { // a long-name part, parts come last-first
      let part = ''; for (const o of [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30]) { const ch = e.readUInt16LE(o); if (ch === 0 || ch === 0xffff) break; part += String.fromCharCode(ch); }
      longName = part + longName; continue;
    }
    shortNames.add(e.toString('latin1', 0, 11));
    if (longName.toLowerCase() === name.toLowerCase()) throw new Error('A file named ' + name + ' is already on the boot partition.');
    longName = '';
  }

  // A short name that is free: GMMCPA~1 and so on.
  const stem = name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6).padEnd(2, '_');
  let short = null;
  for (let n = 1; n < 10; n++) { const cand = (stem + '~' + n).padEnd(8, ' ') + '   '; if (!shortNames.has(cand)) { short = Buffer.from(cand, 'latin1'); break; } }
  if (!short) throw new Error('No free short name was found.');

  // The directory slots: long-name parts (last part first) then the short entry.
  const parts = Math.ceil(name.length / 13); const need = parts + 1;
  const sum = lfnChecksum(short);
  const records = [];
  for (let p = parts; p >= 1; p--) {
    const e = Buffer.alloc(32, 0xff);
    e[0] = p === parts ? 0x40 | p : p; e[11] = 0x0f; e[12] = 0; e[13] = sum; e.writeUInt16LE(0, 26);
    const chars = name.slice((p - 1) * 13, p * 13);
    [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30].forEach((o, i) => { if (i < chars.length) e.writeUInt16LE(chars.charCodeAt(i), o); else if (i === chars.length) e.writeUInt16LE(0, o); });
    records.push(e);
  }
  const cluster = freeCluster(0);
  const se = Buffer.alloc(32);
  short.copy(se, 0); se[11] = 0x20;
  se.writeUInt16LE(fatTime(now), 14); se.writeUInt16LE(fatDate(now), 16); se.writeUInt16LE(fatDate(now), 18);
  se.writeUInt16LE(cluster >>> 16, 20); se.writeUInt16LE(fatTime(now), 22); se.writeUInt16LE(fatDate(now), 24); se.writeUInt16LE(cluster & 0xffff, 26); se.writeUInt32LE(data.length, 28);
  records.push(se);

  // Slots must be free, in a row: after the last used entry, or in deleted entries. Extend the directory when it is full.
  let startIdx = end; let extra = null; let usedForDir = 0;
  if (startIdx + need > entries) {
    // Not enough room before the end of the chain: add one cluster (entries are contiguous across the chain).
    const newDirCluster = freeCluster(cluster);
    extra = newDirCluster; usedForDir = 1;
  }

  // ---- all checks passed: write the data first, then the allocation, then the directory entry last ----
  const block = Buffer.alloc(clusterBytes); data.copy(block);
  writeAt(fd, clusterPos(cluster), block);
  setFat(cluster, 0x0fffffff);
  if (extra) {
    writeAt(fd, clusterPos(extra), Buffer.alloc(clusterBytes));
    setFat(extra, 0x0fffffff);
    setFat(chain[chain.length - 1], extra);
    chain.push(extra);
  }
  // Write the records into the right clusters (a record never straddles a cluster: 32 divides the cluster size).
  const perCluster = clusterBytes / 32;
  records.forEach((rec, i) => { const idx = startIdx + i; writeAt(fd, clusterPos(chain[Math.floor(idx / perCluster)]) + (idx % perCluster) * 32, rec); });

  // Keep the free-cluster hint in the FSInfo sector honest.
  if (fsinfoSector && fsinfoSector < reserved) {
    const pos = volumeOffset + fsinfoSector * SECTOR; const info = readAt(fd, pos, SECTOR);
    if (info.readUInt32LE(0) === 0x41615252 && info.readUInt32LE(484) === 0x61417272) {
      const free = info.readUInt32LE(488);
      if (free !== 0xffffffff && free >= 1 + usedForDir) { info.writeUInt32LE(free - 1 - usedForDir, 488); writeAt(fd, pos, info); }
    }
  }
  return { cluster, shortName: short.toString('latin1').trim() };
}

// Adds `name` with `content` to the first FAT32 partition of the raw disk image at `file`.
function addFileToFirstPartition(file, name, content) {
  const fd = fs.openSync(file, 'r+');
  try {
    const part = firstPartition(fd);
    if (!part) throw new Error('The image has no FAT32 boot partition first.');
    const r = addRootFile(fd, part.offset, name, content);
    fs.fsyncSync(fd);
    return r;
  } finally { fs.closeSync(fd); }
}

module.exports = { addRootFile, addFileToFirstPartition, firstPartition, lfnChecksum };
