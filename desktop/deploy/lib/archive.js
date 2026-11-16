// Small readers for the two archive formats the appliance release uses: a ZIP holding one file
// (.ova.zip) and a tar (.ova). Node has no built-in ZIP or tar reader.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');

function readZipEntries(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 70000); const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    let e = tailLen - 22; while (e >= 0 && tail.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < 0) throw new Error('The ZIP file is damaged.');
    const count = tail.readUInt16LE(e + 10); const off = tail.readUInt32LE(e + 16); const cdSize = tail.readUInt32LE(e + 12);
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, off);
    const out = []; let p = 0;
    for (let i = 0; i < count; i++) {
      const method = cd.readUInt16LE(p + 10); const csize = cd.readUInt32LE(p + 20); const usize = cd.readUInt32LE(p + 24);
      const n = cd.readUInt16LE(p + 28); const x = cd.readUInt16LE(p + 30); const c = cd.readUInt16LE(p + 32); const lho = cd.readUInt32LE(p + 42);
      out.push({ name: cd.toString('utf8', p + 46, p + 46 + n), method, csize, usize, lho });
      p += 46 + n + x + c;
    }
    return out;
  } finally { fs.closeSync(fd); }
}

// Extracts the first entry whose name ends with `ext` into `destDir`. Returns the written file path.
async function unzipOne(file, destDir, ext) {
  const ent = readZipEntries(file).find((e) => e.name.toLowerCase().endsWith(ext));
  if (!ent) throw new Error('The ZIP file does not contain a ' + ext + ' file.');
  const fd = fs.openSync(file, 'r'); const head = Buffer.alloc(30); fs.readSync(fd, head, 0, 30, ent.lho); fs.closeSync(fd);
  const start = ent.lho + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(ent.name));
  const src = fs.createReadStream(file, { start, end: start + ent.csize - 1 });
  await pipeline(src, ...(ent.method === 8 ? [zlib.createInflateRaw()] : []), fs.createWriteStream(dest));
  if (fs.statSync(dest).size !== ent.usize) throw new Error('The unzipped file has the wrong size.');
  return dest;
}

// Lists a ustar archive: [{ name, size, offset }].
function listTar(file) {
  const fd = fs.openSync(file, 'r'); const out = []; const h = Buffer.alloc(512); let pos = 0;
  try {
    for (;;) {
      if (fs.readSync(fd, h, 0, 512, pos) < 512 || h.every((b) => b === 0)) break;
      const name = h.toString('utf8', 0, 100).replace(/\0.*$/, ''); const size = parseInt(h.toString('ascii', 124, 136).replace(/\0.*$/, '').trim() || '0', 8);
      out.push({ name, size, offset: pos + 512 }); pos += 512 + Math.ceil(size / 512) * 512;
    }
  } finally { fs.closeSync(fd); }
  return out;
}
async function untarOne(file, destDir, ext) {
  const ent = listTar(file).find((e) => e.name.toLowerCase().endsWith(ext));
  if (!ent) throw new Error('The archive does not contain a ' + ext + ' file.');
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(ent.name));
  await pipeline(fs.createReadStream(file, { start: ent.offset, end: ent.offset + ent.size - 1 }), fs.createWriteStream(dest));
  return dest;
}

module.exports = { unzipOne, untarOne, listTar, readZipEntries };
