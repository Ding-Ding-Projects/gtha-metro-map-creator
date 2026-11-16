// Writes a synthetic large GTFS feed for stress checks (about 5.5 million stop_times rows by default).
// Usage: node scripts/verify/make-gtfs-large.mjs <output.zip> [trips] [stops per trip]
import fs from 'node:fs';
import zlib from 'node:zlib';

const out = process.argv[2];
if (!out) { console.error('usage: make-gtfs-large.mjs <output.zip> [trips] [stopsPerTrip]'); process.exit(1); }
const TRIPS = +process.argv[3] || 55000, PER = +process.argv[4] || 100, ROUTES = 400, STOPS = 12000;
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
let crc = ~0; const crcUpdate = (b) => { for (let i = 0; i < b.length; i++) crc = crcT[(crc ^ b[i]) & 255] ^ (crc >>> 8); };
const fd = fs.openSync(out, 'w'); let off = 0; const central = [];
const write = (b) => { fs.writeSync(fd, b); off += b.length; };

async function entry(name, producer) {
  const nb = Buffer.from(name), start = off; crc = ~0; let raw = 0, csize = 0;
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(nb.length, 26); write(lh); write(nb);
  const z = zlib.createDeflateRaw({ level: 1 });
  const sink = new Promise((res) => { z.on('data', (c) => { csize += c.length; write(c); }); z.on('end', res); });
  await producer(async (text) => { const b = Buffer.from(text); raw += b.length; crcUpdate(b); if (!z.write(b)) await new Promise((r) => z.once('drain', r)); });
  z.end(); await sink;
  const c = ~crc >>> 0, patch = Buffer.alloc(12); patch.writeUInt32LE(c, 0); patch.writeUInt32LE(csize, 4); patch.writeUInt32LE(raw, 8); fs.writeSync(fd, patch, 0, 12, start + 14);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(csize, 20); ch.writeUInt32LE(raw, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(start, 42); central.push(ch, nb);
}

const small = (name, text) => entry(name, async (f) => { await f(text); });
await small('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\r\nA,Synthetic Transit,https://example.org,America/Toronto\r\n');
await small('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\r\nWK,1,1,1,1,1,0,0,20261101,20261231\r\nWE,0,0,0,0,0,1,1,20261101,20261231\r\n');
await entry('routes.txt', async (f) => { await f('route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\r\n'); for (let r = 0; r < ROUTES; r++) await f(`R${r},A,${r + 1},Synthetic route ${r + 1},3,${((r * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0')},FFFFFF\r\n`); });
await entry('stops.txt', async (f) => { await f('stop_id,stop_name,stop_lat,stop_lon\r\n'); for (let s = 0; s < STOPS; s++) await f(`S${s},Stop ${s},${(43.5 + (s % 120) * 0.004).toFixed(5)},${(-79.7 + Math.floor(s / 120) * 0.004).toFixed(5)}\r\n`); });
await entry('trips.txt', async (f) => { await f('route_id,service_id,trip_id,trip_headsign,direction_id,block_id\r\n'); for (let t = 0; t < TRIPS; t++) await f(`R${t % ROUTES},${t % 7 === 0 ? 'WE' : 'WK'},T${t},Headsign ${t % ROUTES},${t & 1},B${Math.floor(t / 4)}\r\n`); });
await entry('stop_times.txt', async (f) => {
  await f('trip_id,arrival_time,departure_time,stop_id,stop_sequence\r\n'); let buf = '';
  for (let t = 0; t < TRIPS; t++) {
    const base = 5 * 3600 + (t % 240) * 240 + Math.floor(t / ROUTES) % 60 * 20, r = t % ROUTES, first = (r * 29) % (STOPS - PER);
    for (let k = 0; k < PER; k++) { const s = base + k * 60, h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60; const tm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`; buf += `T${t},${tm},${tm},S${first + k},${k + 1}\r\n`; }
    if (t % 200 === 199) { await f(buf); buf = ''; }
  }
  await f(buf);
});
const cdSize = central.reduce((n, b) => n + b.length, 0), cdOff = off; for (const b of central) write(b);
const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(cdOff, 16); write(end); fs.closeSync(fd);
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1), 'MB;', TRIPS * PER, 'stop_times rows');
