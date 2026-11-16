// Writing an appliance image to a USB or SD drive: list the drives that may be written, prepare the
// image (download, checksum, decompress), and run the elevated helper that writes and verifies it.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { run } = require('./proc');
const { downloadRelease, applianceName } = require('./download');
const { buildScript, encode } = require('./flash-helper');

const TEST = process.env.GMMC_HIDDEN === '1';
// Hidden test runs may use a plain file as the "drive": GMMC_TEST_FLASH_FILE=<path>.
const testFile = () => (TEST && process.env.GMMC_TEST_FLASH_FILE ? process.env.GMMC_TEST_FLASH_FILE : '');
const TEST_DISK_NUMBER = 99;

const PS = (script, timeout = 30000) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout });

// Only removable disks are ever offered: USB, SD or MMC bus, never the Windows system or boot disk.
const LIST_SCRIPT = `
$out = @()
foreach ($d in Get-Disk) {
  $bus = [string]$d.BusType
  if (@('USB','SD','MMC') -notcontains $bus) { continue }
  if ($d.IsSystem -or $d.IsBoot) { continue }
  $out += [pscustomobject]@{ number = [int]$d.Number; model = [string]$d.FriendlyName; size = [int64]$d.Size; bus = $bus; partitions = [int]$d.NumberOfPartitions; readOnly = [bool]$d.IsReadOnly }
}
ConvertTo-Json -InputObject @($out) -Compress`;

// Returns [{ number, model, size, bus, partitions, readOnly }].
async function listDisks() {
  const files = testFile();
  if (files) return [{ number: TEST_DISK_NUMBER, model: 'Test image file (no real drive)', size: 64 * 1024 * 1024 * 1024, bus: 'FILE', partitions: 2, readOnly: false, test: true }];
  const r = await PS(LIST_SCRIPT);
  if (r.code !== 0) throw new Error('Windows could not list the drives: ' + r.out.trim().split(/\r?\n/).slice(-1)[0]);
  let list; try { list = JSON.parse(r.out.trim() || '[]'); } catch { throw new Error('The drive list could not be read.'); }
  return (Array.isArray(list) ? list : [list]).filter((d) => d && Number.isInteger(d.number))
    .map((d) => ({ number: d.number, model: String(d.model || 'Unknown drive').slice(0, 80), size: Number(d.size) || 0, bus: String(d.bus), partitions: Number(d.partitions) || 0, readOnly: !!d.readOnly }));
}

// Decompresses an .img.xz to a raw file and returns { file, size, sha256 }.
async function decompress(xzFile, rawFile, onProgress, signal) {
  const { XzReadableStream } = require('xz-decompress');
  const total = fs.statSync(xzFile).size;
  const free = fs.statfsSync(path.dirname(rawFile)); const freeBytes = free.bavail * free.bsize;
  if (freeBytes < 3 * 1024 * 1024 * 1024) throw new Error('There is not enough free space to unpack the image (about 3 GB needed).');
  const hash = crypto.createHash('sha256'); let size = 0; let read = 0;
  const counter = new Transform({ transform(c, _e, cb) { hash.update(c); size += c.length; cb(null, c); } });
  const input = fs.createReadStream(xzFile); input.on('data', (c) => { read += c.length; if (onProgress) onProgress(read / total); });
  const web = new XzReadableStream(Readable.toWeb(input));
  await pipeline(Readable.fromWeb(web), counter, fs.createWriteStream(rawFile), { signal });
  return { file: rawFile, size, sha256: hash.digest('hex') };
}

// kind: 'x86_64' (USB drive for a PC) or 'arm64-rpi' (Raspberry Pi). Returns { file, size, sha256, name }.
async function prepareImage({ version, kind, cacheDir, signal, emit, log }) {
  const xzName = applianceName(version, kind) + '.img.xz';
  emit(8, 'Downloading ' + xzName);
  const dl = await downloadRelease({ version, name: xzName, cacheDir, signal, log, onProgress: (f) => emit(8 + Math.round(f * 40), 'Downloading ' + xzName) });
  emit(50, 'Unpacking the image');
  const raw = path.join(cacheDir, applianceName(version, kind) + '.img');
  const out = await decompress(dl.file, raw, (f) => emit(50 + Math.round(f * 25), 'Unpacking the image'), signal);
  return Object.assign(out, { name: path.basename(raw) });
}

// Starts the helper. In a test run with a file target it runs without elevation. Otherwise it goes
// through the Windows permission prompt; declining it ends the run as "cancelled".
// Returns { ok, cancelled, message, sha256 }.
async function writeImage({ disk, image, userData, emit, log, signal }) {
  const dir = fs.mkdtempSync(path.join(userData, 'flash-'));
  const progressFile = path.join(dir, 'progress.json');
  const tf = testFile();
  const script = buildScript({ diskNumber: tf ? -1 : disk, targetFile: tf, imagePath: image.file, imageSize: image.size, sha256: image.sha256, progressFile });
  const enc = encode(script);
  let timer = null;
  const poll = () => { try { const p = JSON.parse(fs.readFileSync(progressFile, 'utf8')); if (p.state === 'running') emit(75 + Math.round(p.pct * 0.24), p.msg); } catch { /* not written yet */ } };
  timer = setInterval(poll, 700);
  try {
    let res;
    if (TEST && process.env.GMMC_TEST_ELEVATION === 'cancel') res = { code: 10, out: '' };
    else if (TEST && process.env.GMMC_TEST_ELEVATION === 'fail') res = { code: 11, out: 'The elevated helper could not be started (test).' };
    else if (tf) res = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { timeout: 3600000, signal });
    else {
      const launcher = "try { $p = Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','" + enc + "'); exit 0 } catch { if ($_.Exception.Message -match 'cancel') { exit 10 }; Write-Output $_.Exception.Message; exit 11 }";
      res = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', launcher], { timeout: 3600000, signal });
    }
    if (res.code === 10) return { ok: false, cancelled: true, message: 'Windows did not get permission to write to the drive, so nothing was written.' };
    if (res.code === 11) return { ok: false, message: 'The write helper could not be started: ' + res.out.trim().split(/\r?\n/).slice(-1)[0] };
    let final = null; try { final = JSON.parse(fs.readFileSync(progressFile, 'utf8')); } catch { /* no result */ }
    if (!final) return { ok: false, message: 'The write helper ended without a result. The drive may be partly written; try again.' };
    if (final.state === 'done' && final.sha === image.sha256) return { ok: true, sha256: final.sha, message: final.msg };
    return { ok: false, message: final.state === 'failed' ? String(final.msg || 'The write failed.') : 'The write helper ended before it finished. The drive may be partly written; try again.' };
  } finally { clearInterval(timer); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp folder */ } }
}

module.exports = { listDisks, prepareImage, writeImage, decompress, TEST_DISK_NUMBER };
