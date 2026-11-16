// Builds site/app/gtha-population.js from Statistics Canada 2021 Census open data.
// Usage: node scripts/data/make-population.mjs <temp dir outside the repository>
// Sources and processing are described in scripts/data/README.md.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const work = process.argv[2] && path.resolve(process.argv[2]);
if (!work) { console.error('Usage: node scripts/data/make-population.mjs <temp dir>'); process.exit(2); }
fs.mkdirSync(work, { recursive: true });
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'app', 'gtha-population.js');

// Toronto, Peel, York, Durham, Halton, Hamilton census divisions.
const CDS = { 3520: 'Toronto', 3521: 'Peel', 3519: 'York', 3518: 'Durham', 3524: 'Halton', 3525: 'Hamilton' };
const TABLE_URL = 'https://www150.statcan.gc.ca/n1/tbl/csv/98100015-eng.zip';
const DA_URL = 'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Digital_boundary_files/MapServer/12/query';

/** Minimal ZIP reader: returns the named entry (stored or deflated). */
function unzipFirst(buf, name) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a ZIP archive');
  let p = buf.readUInt32LE(e + 16);
  for (let n = buf.readUInt16LE(e + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nlen) === name) {
      const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), data = buf.subarray(start, start + csize);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error('Entry not found in archive: ' + name);
}

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return r; } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error('Download failed: ' + url);
}

// 1. Population by dissemination area (table 98-10-0001-5, "Population and dwelling counts").
const zip = path.join(work, 'table.zip'), csv = path.join(work, '98100015.csv');
if (!fs.existsSync(csv)) {
  fs.writeFileSync(zip, Buffer.from(await (await get(TABLE_URL)).arrayBuffer()));
  fs.writeFileSync(csv, unzipFirst(fs.readFileSync(zip), '98100015.csv'));
}
const pop = new Map(), cdTotals = {};
function parseLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
for (const line of fs.readFileSync(csv, 'utf8').split(/\r?\n/)) {
  const f = parseLine(line.replace(/^\uFEFF/, ''));
  const dg = f[2] || '';
  if (dg.startsWith('2021S0512')) {
    const da = dg.slice(9);
    if (CDS[da.slice(0, 4)]) pop.set(da, Number(f[4]) || 0);
  } else if (dg.startsWith('2021A0003')) {
    const cd = dg.slice(9);
    if (CDS[cd]) cdTotals[cd] = Number(f[4]);
  }
}
console.log('DAs with population:', pop.size);

// 2. DA polygons (Statistics Canada digital boundary file) -> area-weighted centroid.
function centroid(rings) {
  let A = 0, cx = 0, cy = 0;
  const lat0 = rings[0][0][1], kx = Math.cos(lat0 * Math.PI / 180);
  for (const ring of rings) {
    for (let i = 0, n = ring.length - 1; i < n; i++) {
      const x0 = ring[i][0] * kx, y0 = ring[i][1], x1 = ring[i + 1][0] * kx, y1 = ring[i + 1][1];
      const c = x0 * y1 - x1 * y0;
      A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
  }
  if (!A) { const p = rings[0][0]; return [p[1], p[0]]; }
  return [cy / (3 * A), cx / (3 * A) / kx];
}
const cache = path.join(work, 'da-centroids.json');
let cent = fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : null;
if (!cent) {
  cent = {};
  for (const cd of Object.keys(CDS)) {
    for (let off = 0; ; off += 400) {
      const q = new URLSearchParams({ where: `DAUID LIKE '${cd}%'`, outFields: 'DAUID', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0003', geometryPrecision: '6', orderByFields: 'DAUID', resultOffset: String(off), resultRecordCount: '400', f: 'json' });
      const j = await (await get(DA_URL + '?' + q)).json();
      for (const ft of j.features || []) cent[ft.attributes.DAUID] = centroid(ft.geometry.rings);
      if (!j.exceededTransferLimit && (j.features || []).length < 400) break;
    }
    console.log(CDS[cd], 'DA boundaries so far:', Object.keys(cent).length);
  }
  fs.writeFileSync(cache, JSON.stringify(cent));
}

// 3. Join, check totals, write.
const points = [], totals = {}; let missing = 0, sum = 0;
for (const [da, p] of [...pop].sort()) {
  if (!p) continue;
  const c = cent[da];
  if (!c) { missing++; continue; }
  points.push([+c[0].toFixed(4), +c[1].toFixed(4), p]);
  sum += p; totals[da.slice(0, 4)] = (totals[da.slice(0, 4)] || 0) + p;
}
for (const cd of Object.keys(CDS)) console.log(CDS[cd], 'DA sum', totals[cd], 'division total', cdTotals[cd]);
console.log('DAs without a boundary:', missing, 'points:', points.length, 'population:', sum);
const meta = { source: 'Statistics Canada, 2021 Census of Population: table 98-10-0015-01 (population by dissemination area) joined to the 2021 digital boundary file for dissemination areas (point is the area-weighted centroid of each polygon)', licence: 'Statistics Canada Open Licence', year: 2021, divisions: Object.values(CDS), total: sum, count: points.length };
fs.writeFileSync(OUT, '// Generated by scripts/data/make-population.mjs. Do not edit by hand.\n// Statistics Canada 2021 Census, Statistics Canada Open Licence. Each point is [lat, lon, population] for one dissemination area.\nwindow.GTHAPopulation = ' + JSON.stringify({ ...meta, points }).replace('"points":[[', '"points":[\n[').replace(/\],\[/g, '],\n[') + ';\n');
console.log('Wrote', OUT, fs.statSync(OUT).size, 'bytes');
