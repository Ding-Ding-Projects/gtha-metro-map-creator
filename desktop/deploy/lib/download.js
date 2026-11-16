// Downloads a release file with a SHA-256 check against the release's SHA256SUMS.txt, and keeps it in a cache folder.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { RELEASE_REPO } = require('../../shared/common');

// GMMC_RELEASE_BASE points the downloads at a local test server. It is honoured only in hidden test runs.
const base = (version) => (process.env.GMMC_HIDDEN === '1' && process.env.GMMC_RELEASE_BASE ? process.env.GMMC_RELEASE_BASE.replace(/\/$/, '') : 'https://github.com/' + RELEASE_REPO + '/releases/download/v' + version);
const assetUrl = (version, name) => base(version) + '/' + name;
const applianceName = (version, kind) => 'gtha-metro-map-creator-appliance-' + version + '-' + kind;

function parseSums(text) {
  const map = {};
  for (const line of String(text).split(/\r?\n/)) { const m = /^([0-9a-fA-F]{64})\s+\*?(?:\.\/)?(.+?)\s*$/.exec(line); if (m) map[m[2]] = m[1].toLowerCase(); }
  return map;
}
async function fetchText(url, signal) {
  const r = await fetch(url, { signal, redirect: 'follow' });
  if (!r.ok) throw new Error('Could not download ' + url.split('/').pop() + ' (HTTP ' + r.status + ').');
  return r.text();
}
async function sha256File(file) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}
// The hash the release lists for `name`, or throws a plain reason.
async function expectedHash(version, name, signal) {
  let sums;
  try { sums = parseSums(await fetchText(assetUrl(version, 'SHA256SUMS.txt'), signal)); } catch (e) { throw new Error('Release ' + version + ' has no checksum list yet (' + e.message + ').'); }
  if (!sums[name]) throw new Error('Release ' + version + ' does not list ' + name + '. The image for this version may not be published yet.');
  return sums[name];
}

// opts: { version, name, cacheDir, signal, onProgress(fraction), log }. Returns { file, sha256 }.
async function downloadRelease(opts) {
  const { version, name, cacheDir, signal } = opts;
  const want = await expectedHash(version, name, signal);
  fs.mkdirSync(cacheDir, { recursive: true });
  const dest = path.join(cacheDir, name);
  if (fs.existsSync(dest) && (await sha256File(dest)) === want) { if (opts.log) opts.log('Using the cached ' + name); if (opts.onProgress) opts.onProgress(1); return { file: dest, sha256: want }; }
  const r = await fetch(assetUrl(version, name), { signal, redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error('Could not download ' + name + ' (HTTP ' + r.status + ').');
  const total = Number(r.headers.get('content-length')) || 0; let got = 0;
  const hash = crypto.createHash('sha256'); const tmp = dest + '.part';
  const src = Readable.fromWeb(r.body);
  src.on('data', (c) => { got += c.length; hash.update(c); if (opts.onProgress && total) opts.onProgress(got / total); });
  try { await pipeline(src, fs.createWriteStream(tmp)); } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { /* gone */ } throw e; }
  const have = hash.digest('hex');
  if (have !== want) { fs.rmSync(tmp, { force: true }); throw new Error('The downloaded file does not match the checksum in the release (expected ' + want.slice(0, 12) + '..., got ' + have.slice(0, 12) + '...). It was deleted.'); }
  fs.renameSync(tmp, dest);
  return { file: dest, sha256: have };
}

// The newest published release version (for "update available"), or '' when GitHub cannot be reached.
async function latestReleaseVersion(signal) {
  if (process.env.GMMC_HIDDEN === '1' && process.env.GMMC_LATEST_VERSION !== undefined) return process.env.GMMC_LATEST_VERSION;
  try {
    const r = await fetch('https://api.github.com/repos/' + RELEASE_REPO + '/releases/latest', { signal: signal || AbortSignal.timeout(8000), headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'gmmc-deploy' } });
    if (!r.ok) return '';
    const j = await r.json(); return String(j.tag_name || '').replace(/^v/, '');
  } catch { return ''; }
}
const cmpVersion = (a, b) => { const p = (v) => String(v).split(/[.+-]/).map((x) => parseInt(x, 10) || 0); const x = p(a); const y = p(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

module.exports = { assetUrl, applianceName, parseSums, sha256File, expectedHash, downloadRelease, latestReleaseVersion, cmpVersion };
