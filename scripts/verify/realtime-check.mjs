// Usage: node scripts/verify/realtime-check.mjs <VehiclePositions .pb file> [more files]
// Parses downloaded GTFS-Realtime files with the editor's own protobuf reader and reports counts and a sample.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { parseFeed } = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site', 'app', 'mod-realtime.js'));
const files = process.argv.slice(2);
if (!files.length) { console.log('Give at least one feed file.'); process.exit(2); }
let bad = 0;
for (const f of files) {
  const r = parseFeed(fs.readFileSync(f));
  const gtha = r.vehicles.filter((v) => v.lat > 43 && v.lat < 45 && v.lon > -80.5 && v.lon < -78.5);
  console.log(path.basename(f), 'header time', r.timestamp, 'vehicles', r.vehicles.length, 'in GTHA box', gtha.length);
  console.log('  sample', JSON.stringify(r.vehicles[0]));
  if (!r.vehicles.length || gtha.length !== r.vehicles.length) bad++;
}
process.exit(bad ? 1 : 0);
