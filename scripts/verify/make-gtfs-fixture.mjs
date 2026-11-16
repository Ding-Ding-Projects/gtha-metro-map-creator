// Builds a small hand-made GTFS feed that exercises every file the viewer reads, with deliberate validation errors.
// Usage: node scripts/verify/make-gtfs-fixture.mjs   (writes scripts/verify/fixtures/viewer-feed.zip and viewer-feed.expected.json)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
fs.mkdirSync(out, { recursive: true });

const csv = (head, rows) => head.join(',') + '\r\n' + rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(',')).join('\r\n') + '\r\n';
const F = {};

F['agency.txt'] = csv(['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang', 'agency_phone'], [['A1', 'Fixture Transit', 'https://example.org/fixture', 'America/Toronto', 'en', '555-0100'], ['A2', 'Lakeshore Shuttle', 'https://example.org/lakeshore', 'America/Toronto', 'en', '']]);
F['feed_info.txt'] = csv(['feed_publisher_name', 'feed_publisher_url', 'feed_lang', 'default_lang', 'feed_start_date', 'feed_end_date', 'feed_version', 'feed_contact_email'], [['Fixture Transit Authority', 'https://example.org', 'en', 'en', '20261101', '20991231', '2026.11-test', 'feeds@example.org']]);
F['attributions.txt'] = csv(['attribution_id', 'organization_name', 'is_producer', 'is_operator', 'is_authority', 'attribution_url'], [['AT1', 'Fixture Transit Authority', '1', '0', '1', 'https://example.org']]);
F['levels.txt'] = csv(['level_id', 'level_index', 'level_name'], [['L0', '0', 'Street'], ['L1', '-1', 'Concourse']]);

const stops = [
  ['S1', 'C1', 'Central Station', '', 43.6532, -79.3832, '', 1, '', 1, 'L0', ''],
  ['P1A', '', 'Central Platform 1', '', 43.65321, -79.38325, '', 0, 'S1', 1, 'L1', '1'],
  ['P1B', '', 'Central Platform 2', '', 43.65319, -79.38315, '', 0, 'S1', 1, 'L1', '2'],
  ['E1', '', 'Central Main Entrance', '', 43.65330, -79.38340, '', 2, 'S1', 1, 'L0', ''],
  ['N1', '', 'Central Concourse', '', 43.65325, -79.38330, '', 3, 'S1', 0, 'L1', ''],
  ['B1', '', 'Platform 1 Boarding Area', '', 43.65322, -79.38327, '', 4, 'P1A', 0, 'L1', ''],
  ['ST2', 'C2', 'Maple Ave', '', 43.6700, -79.3500, 'Z1', 0, '', 1, '', ''],
  ['ST3', 'C3', 'Oak St', '', 43.6850, -79.3200, 'Z1', 0, '', 0, '', ''],
  ['ST4', 'C4', 'Pine Rd', '', 43.7000, -79.2900, 'Z2', 0, '', 2, '', ''],
  ['ST5', 'C5', 'Harbour', '', 43.6400, -79.3700, 'Z1', 0, '', 1, '', ''],
  ['ST6', 'C6', 'Airport', '', 43.6777, -79.6248, 'Z3', 0, '', 1, '', ''],
  ['UNUSED1', '', 'Unused Stop', '', 43.71, -79.40, '', 0, '', 0, '', ''],
  ['BAD1', '', 'Bad Coordinates', '', 95, -79.4, '', 0, '', 0, '', ''],
  ['ST3', '', 'Oak St Duplicate', '', 43.6851, -79.3201, '', 0, '', 0, '', '']
];
F['stops.txt'] = csv(['stop_id', 'stop_code', 'stop_name', 'stop_desc', 'stop_lat', 'stop_lon', 'zone_id', 'location_type', 'parent_station', 'wheelchair_boarding', 'level_id', 'platform_code'], stops);

F['routes.txt'] = csv(['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color', 'route_text_color', 'continuous_pickup', 'continuous_drop_off', 'x_custom_flag'], [
  ['R1', 'A1', '1', 'Blue Line', 1, '0079AB', 'FFFFFF', '', '', 'a'], ['R2', 'A1', '2', 'Harbour Bus', 3, 'F28C28', '000000', 2, 3, 'b'], ['R3', 'A1', '3', 'Airport Rail', 2, '6A1B9A', 'FFFFFF', '', '', ''],
  ['R4', 'A2', 'L4', 'Lakeshore Express', 702, '009688', 'FFFFFF', '', '', ''], ['R5', 'A1', '5', 'Spare Tram', 0, '', '', '', '', ''], ['R6', 'A2', '6', 'Low Contrast', 3, 'FFFF00', 'FFFFFF', '', '', '']]);

F['calendar.txt'] = csv(['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], [['WK', 1, 1, 1, 1, 1, 0, 0, '20261101', '20261231'], ['WE', 0, 0, 0, 0, 0, 1, 1, '20261101', '20261231'], ['UNUSED_SVC', 1, 1, 1, 1, 1, 1, 1, '20261101', '20261231']]);
F['calendar_dates.txt'] = csv(['service_id', 'date', 'exception_type'], [['WK', '20261111', 2], ['WE', '20261225', 1], ['SPECIAL', '20261120', 1]]);

const trips = [
  ['R1', 'WK', 'T1', 'Northbound', '', 0, 'B1', 'SH1', 1, 1], ['R1', 'WK', 'T2', 'Southbound', '', 1, 'B1', 'SH1', 1, 0], ['R1', 'WK', 'T3', 'Northbound', '', 0, 'B1', 'SH1', 1, 1],
  ['R1', 'WK', 'T4', 'Southbound', '', 1, 'B2', 'SH1', 0, 0], ['R1', 'WK', 'T5', 'Northbound', '', 0, 'B2', 'SH1', 0, 0], ['R1', 'WE', 'T6', 'Northbound', '', 0, '', 'SH1', 1, 1],
  ['R2', 'WK', 'T7', 'Harbour loop', 'H1', 0, 'B3', 'SH2', 2, 2], ['R2', 'WK', 'T8', 'Harbour loop', 'H2', 0, 'B3', 'SH2', 2, 2],
  ['R3', 'WK', 'T9', 'Airport', '', 0, 'B4', 'SH4', 1, 1], ['R3', 'WK', 'T10', 'Central', '', 1, 'B4', 'SH4', 1, 1],
  ['R4', 'WK', 'T11', 'On demand', '', 0, '', '', 0, 0], ['R6', 'WK', 'T12', 'Maple', '', 0, '', 'SH_MISSING', 0, 0], ['R1', 'SPECIAL', 'T13', 'Special', '', 0, '', 'SH1', 0, 0],
  ['R1', 'WK', 'T14', 'Bad times', '', 0, '', 'SH1', 0, 0], ['R_MISSING', 'WK', 'T15', 'Ghost', '', 0, '', '', 0, 0], ['R6', 'NOSVC', 'T16', 'No service', '', 0, '', '', 0, 0]
];
F['trips.txt'] = csv(['route_id', 'service_id', 'trip_id', 'trip_headsign', 'trip_short_name', 'direction_id', 'block_id', 'shape_id', 'wheelchair_accessible', 'bikes_allowed'], trips);

// stop_times: [trip, stop, arr, dep, seq, pickup, drop_off, dist, timepoint, extra...]
const hhmm = (s) => (s ? s + ':00' : '');
const st = [];
const add = (trip, rows) => rows.forEach((r, i) => st.push({ trip, stop: r[0], arr: hhmm(r[1]), dep: hhmm(r[2] === undefined ? r[1] : r[2]), seq: i + 1, pu: r[3] || '', dr: r[4] || '', dist: r[5] === undefined ? '' : r[5], tp: r[6] === undefined ? '' : r[6], note: r[7] || '', win0: '', win1: '', loc: '', grp: '', bk: '' }));
add('T1', [['P1A', '07:00', '07:00', '', '', 0, 1], ['ST2', '07:08', '07:08', '', '', 3000, 1], ['ST3', '07:15', '07:15', '', '', 6000], ['ST4', '07:22', '07:22', '', 1, 9000, 1]]);
add('T2', [['ST4', '07:40', '07:40', '', '', 0, 1], ['ST3', '07:47', '07:47', '', '', 3000], ['ST2', '07:54', '07:54', '', '', 6000], ['P1B', '08:02', '08:02', 1, '', 9000, 1]]);
add('T3', [['P1A', '08:20', '08:20', '', '', 0, 1], ['ST2', '08:28', '08:28', '', '', 3000], ['ST3', '08:35', '08:35', '', '', 6000], ['ST4', '08:42', '08:42', '', '', 9000, 1]]);
add('T4', [['ST4', '09:00', '09:00', '', '', 0, 1], ['ST3', '09:07', '09:07', '', '', 3000], ['ST2', '09:14', '09:14', '', '', 6000], ['P1B', '09:22', '09:22', '', '', 9000, 1]]);
add('T5', [['P1A', '09:15', '09:15', '', '', 0, 1], ['ST2', '09:23', '09:23', '', '', 3000], ['ST3', '09:30', '09:30', '', '', 6000], ['ST4', '09:37', '09:37', '', '', 9000, 1]]);
add('T6', [['P1A', '08:00', '08:00', '', '', 0, 1], ['ST2', '08:08', '08:08'], ['ST3', '08:15', '08:15'], ['ST4', '08:22', '08:22']]);
add('T7', [['ST5', '06:00', '06:00', '', 1, 0, 1], ['P1B', '06:12', '06:12', '', '', 3000], ['ST2', '06:20', '06:20', 1, '', 6000, 1]]);
add('T8', [['ST5', '12:00', '12:00', '', 1, 0, 1], ['P1B', '12:12', '12:12', '', '', 3000], ['ST2', '12:20', '12:20', 1, '', 6000, 1]]);
add('T9', [['P1A', '10:00', '10:00', '', '', 0, 1], ['ST2', '10:10', '10:10', '', '', 5000], ['ST6', '10:11', '10:11', '', '', 4000, 1]]);
add('T10', [['ST6', '11:00', '11:00', '', '', 0, 1], ['ST2', '11:40', '11:40', '', '', 5000], ['P1A', '11:50', '11:50', '', '', 9000, 1]]);
add('T12', [['ST2', '13:00', '13:00'], ['ST3', '13:10', '13:10']]);
add('T13', [['P1A', '20:00', '20:00'], ['ST2', '20:08', '20:08'], ['ST3', '20:15', '20:15']]);
add('T14', [['P1A', '14:00', '14:00'], ['ST2', '14:20', '14:20'], ['ST3', '14:10', '14:10']]);
add('T15', [['ST2', '15:00', '15:00'], ['NOSUCH', '15:05', '15:05']]);
add('T_GHOST', [['ST2', '16:00', '16:00']]);
// T11 is a flex trip: one fixed stop, then two windows with booking rules.
st.push({ trip: 'T11', stop: 'ST3', arr: '11:00:00', dep: '11:00:00', seq: 1, pu: '', dr: '', dist: '', tp: 1, note: 'n1', win0: '', win1: '', loc: '', grp: '', bk: '' });
st.push({ trip: 'T11', stop: '', arr: '', dep: '', seq: 2, pu: 2, dr: 2, dist: '', tp: '', note: '', win0: '11:00:00', win1: '13:00:00', loc: 'LOC1', grp: '', bk: 'BR1' });
st.push({ trip: 'T11', stop: '', arr: '', dep: '', seq: 3, pu: 2, dr: 2, dist: '', tp: '', note: '', win0: '13:00:00', win1: '15:00:00', loc: '', grp: 'LG1', bk: 'BR2' });
// Rows of trips are written grouped but deliberately out of order for T4 (sequence 2 and 3 swapped) to exercise sorting.
const rowsText = st.map((r) => [r.trip, r.arr, r.dep, r.stop, r.grp, r.loc, r.seq, r.pu, r.dr, r.dist, r.tp, r.win0, r.win1, r.bk, '', r.note]);
const swap = rowsText.findIndex((r) => r[0] === 'T4');
[rowsText[swap + 1], rowsText[swap + 2]] = [rowsText[swap + 2], rowsText[swap + 1]];
F['stop_times.txt'] = csv(['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'location_group_id', 'location_id', 'stop_sequence', 'pickup_type', 'drop_off_type', 'shape_dist_traveled', 'timepoint', 'start_pickup_drop_off_window', 'end_pickup_drop_off_window', 'pickup_booking_rule_id', 'drop_off_booking_rule_id', 'x_note'], rowsText);

F['frequencies.txt'] = csv(['trip_id', 'start_time', 'end_time', 'headway_secs', 'exact_times'], [['T7', '06:00:00', '09:00:00', 600, 0], ['T7', '15:00:00', '18:00:00', 900, 0]]);
F['shapes.txt'] = csv(['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence', 'shape_dist_traveled'], [
  ...[[43.65321, -79.38325, 0], [43.6600, -79.3650, 1500], [43.6700, -79.3500, 3000], [43.6850, -79.3200, 6000], [43.7000, -79.2900, 9000]].map((p, i) => ['SH1', p[0], p[1], i + 1, p[2]]),
  ...[[43.6400, -79.3700, 0], [43.6532, -79.3832, 3000], [43.6600, -79.3650, 4500], [43.6700, -79.3500, 6000]].map((p, i) => ['SH2', p[0], p[1], i + 1, p[2]]),
  ['SH3', 43.60, -79.30, 1, 0], ['SH3', 43.61, -79.31, 2, 1500],
  ['SH4', 43.65321, -79.38325, 1, 0], ['SH4', 43.6700, -79.3500, 2, 5000], ['SH4', 43.6777, -79.6248, 3, 4000]]);

F['transfers.txt'] = csv(['from_stop_id', 'to_stop_id', 'from_route_id', 'to_route_id', 'from_trip_id', 'to_trip_id', 'transfer_type', 'min_transfer_time'], [
  ['P1A', 'P1B', '', '', '', '', 2, 120], ['ST2', 'ST2', 'R1', 'R2', '', '', 1, ''], ['', '', '', '', 'T1', 'T3', 4, ''], ['', '', '', '', 'T4', 'T5', 5, ''], ['ST3', 'ST4', '', '', '', '', 0, ''], ['ST5', 'ST6', '', '', '', '', 3, '']]);
F['pathways.txt'] = csv(['pathway_id', 'from_stop_id', 'to_stop_id', 'pathway_mode', 'is_bidirectional', 'length', 'traversal_time', 'stair_count', 'max_slope', 'min_width', 'signposted_as', 'reversed_signposted_as'], [
  ['PW1', 'E1', 'N1', 1, 1, 40, 45, '', '', 2.5, 'Concourse', 'Exit'], ['PW2', 'N1', 'P1A', 2, 1, 12, 30, 24, '', '', 'Platform 1', ''], ['PW3', 'N1', 'P1B', 4, 0, 14, 20, '', '', '', 'Platform 2', ''], ['PW4', 'P1A', 'B1', 1, 1, 6, 8, '', 0.02, '', '', ''], ['PW5', 'N1', 'E1', 5, 0, 10, 40, '', '', '', 'Street', '']]);

F['fare_attributes.txt'] = csv(['fare_id', 'price', 'currency_type', 'payment_method', 'transfers', 'agency_id', 'transfer_duration'], [['F1', '2.50', 'CAD', 0, 0, 'A1', ''], ['F2', '3.75', 'CAD', 1, 2, 'A1', 7200]]);
F['fare_rules.txt'] = csv(['fare_id', 'route_id', 'origin_id', 'destination_id', 'contains_id'], [['F1', 'R1', '', '', ''], ['F1', 'R2', '', '', ''], ['F2', '', 'Z1', 'Z3', '']]);
F['fare_media.txt'] = csv(['fare_media_id', 'fare_media_name', 'fare_media_type'], [['M1', 'Transit Card', 2], ['M2', 'Mobile App', 4]]);
F['rider_categories.txt'] = csv(['rider_category_id', 'rider_category_name', 'is_default_fare_category'], [['RC1', 'Adult', 1], ['RC2', 'Youth', 0]]);
F['fare_products.txt'] = csv(['fare_product_id', 'fare_product_name', 'rider_category_id', 'fare_media_id', 'amount', 'currency'], [['FP1', 'Single Adult', 'RC1', 'M1', '3.35', 'CAD'], ['FP2', 'Single Youth', 'RC2', 'M1', '2.10', 'CAD'], ['FP3', 'Day Pass', '', 'M2', '10.00', 'CAD']]);
F['networks.txt'] = csv(['network_id', 'network_name'], [['N1', 'Subway'], ['N2', 'Bus']]);
F['route_networks.txt'] = csv(['network_id', 'route_id'], [['N1', 'R1'], ['N2', 'R2'], ['N2', 'R6']]);
F['areas.txt'] = csv(['area_id', 'area_name'], [['AR1', 'Downtown'], ['AR2', 'Airport']]);
F['stop_areas.txt'] = csv(['area_id', 'stop_id'], [['AR1', 'ST2'], ['AR1', 'ST3'], ['AR2', 'ST6']]);
F['timeframes.txt'] = csv(['timeframe_group_id', 'start_time', 'end_time', 'service_id'], [['peak', '06:00:00', '09:00:00', 'WK']]);
F['fare_leg_rules.txt'] = csv(['leg_group_id', 'network_id', 'from_area_id', 'to_area_id', 'from_timeframe_group_id', 'fare_product_id'], [['LG_A', 'N1', 'AR1', 'AR1', '', 'FP1'], ['LG_B', 'N2', '', '', 'peak', 'FP3']]);
F['fare_leg_join_rules.txt'] = csv(['from_network_id', 'to_network_id', 'from_stop_id', 'to_stop_id'], [['N1', 'N2', 'ST2', 'ST2']]);
F['fare_transfer_rules.txt'] = csv(['from_leg_group_id', 'to_leg_group_id', 'transfer_count', 'duration_limit', 'duration_limit_type', 'fare_transfer_type', 'fare_product_id'], [['LG_A', 'LG_B', 1, 5400, 1, 0, 'FP2']]);
F['location_groups.txt'] = csv(['location_group_id', 'location_group_name'], [['LG1', 'Downtown group']]);
F['location_group_stops.txt'] = csv(['location_group_id', 'stop_id'], [['LG1', 'ST2'], ['LG1', 'ST3']]);
F['booking_rules.txt'] = csv(['booking_rule_id', 'booking_type', 'prior_notice_duration_min', 'prior_notice_last_day', 'prior_notice_last_time', 'message', 'phone_number'], [['BR1', 1, 60, '', '', 'Call one hour ahead', '555-0111'], ['BR2', 2, '', 1, '17:00:00', 'Book by 5 pm the day before', '555-0112']]);
F['locations.geojson'] = JSON.stringify({ type: 'FeatureCollection', features: [
  { type: 'Feature', id: 'LOC1', properties: { stop_name: 'Maple zone', stop_desc: 'Demand responsive area' }, geometry: { type: 'Polygon', coordinates: [[[-79.37, 43.66], [-79.33, 43.66], [-79.33, 43.69], [-79.37, 43.69], [-79.37, 43.66]]] } },
  { type: 'Feature', id: 'LOC2', properties: { stop_name: 'Pine zone' }, geometry: { type: 'Polygon', coordinates: [[[-79.31, 43.69], [-79.27, 43.69], [-79.27, 43.71], [-79.31, 43.71], [-79.31, 43.69]]] } }] });
F['translations.txt'] = csv(['table_name', 'field_name', 'language', 'translation', 'record_id', 'record_sub_id', 'field_value'], [
  ['stops', 'stop_name', 'zh-HK', '中央車站', 'S1', '', ''], ['stops', 'stop_name', 'zh-HK', '楓樹道', 'ST2', '', ''], ['routes', 'route_long_name', 'zh-HK', '藍線', 'R1', '', ''], ['routes', 'route_long_name', 'zh-HK', '港口巴士', 'R2', '', ''],
  ['trips', 'trip_headsign', 'zh-HK', '北行', '', '', 'Northbound'], ['feed_info', 'feed_publisher_name', 'zh-HK', '測試交通局', '', '', '']]);
F['custom_notes.txt'] = csv(['note_id', 'text'], [['1', 'An unknown file that the viewer shows as it is'], ['2', 'Second row']]);
F['README.md'] = '# Fixture feed\nA hand made feed for the GTFS viewer checks.\n';

// ---- zip writer ----
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const parts = [], central = []; let off = 0;
for (const [name, text] of Object.entries(F)) {
  const raw = Buffer.from(text, 'utf8'), data = zlib.deflateRawSync(raw), nb = Buffer.from(name), c = crc(raw);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
  parts.push(lh, nb, data);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
  central.push(ch, nb); off += 30 + nb.length + data.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(F).length, 8); end.writeUInt16LE(Object.keys(F).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
fs.writeFileSync(path.join(out, 'viewer-feed.zip'), Buffer.concat([...parts, cd, end]));

// ---- expected numbers, derived here independently of the viewer ----
const rows = (name) => F[name].trim().split('\r\n').length - 1;
const dow = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay();
const cal = { WK: { days: [1, 2, 3, 4, 5], s: '20261101', e: '20261231' }, WE: { days: [0, 6], s: '20261101', e: '20261231' }, UNUSED_SVC: { days: [0, 1, 2, 3, 4, 5, 6], s: '20261101', e: '20261231' } };
const exc = { WK: { '20261111': 2 }, WE: { '20261225': 1 }, SPECIAL: { '20261120': 1 } };
const runs = (svc, d) => { const x = exc[svc] && exc[svc][d]; if (x === 1) return true; if (x === 2) return false; const c = cal[svc]; return !!c && c.days.includes(dow(d)) && c.s <= d && d <= c.e; };
const tripsOn = (d) => trips.filter((t) => runs(t[1], d)).length;
const expected = {
  files: Object.fromEntries(Object.keys(F).filter((n) => n.endsWith('.txt')).map((n) => [n, rows(n)])),
  routes: 6, stops: stops.length, trips: trips.length, stopTimes: st.length, shapes: 4, services: 4,
  tripsOn_20261116: tripsOn('20261116'), tripsOn_20261111: tripsOn('20261111'), tripsOn_20261120: tripsOn('20261120'), tripsOn_20261225: tripsOn('20261225'), tripsOn_20261121: tripsOn('20261121'),
  blocks_20261116: 4, overlapBlocks: 1, deadheadBlocks: 2, frequencyRunsT7: 30,
  validation: { errors: ['dup_id stops', 'ref_missing route', 'ref_missing stop', 'ref_missing trip(stop_times)', 'time_decrease T14', 'dist_decrease T9', 'dist_decrease SH4', 'coord_range BAD1', 'ref_missing service NOSVC', 'ref_missing shape SH_MISSING'], warnings: ['unused stops 2', 'unused route R5', 'unused shape SH3', 'unused service UNUSED_SVC', 'color_contrast R4 R6', 'speed T9, T14', 'trip_no_times T16'] }
};
fs.writeFileSync(path.join(out, 'viewer-feed.expected.json'), JSON.stringify(expected, null, 1) + '\n');
console.log('wrote viewer-feed.zip,', Object.keys(F).length, 'files;', JSON.stringify({ stopTimes: st.length, tripsOn_20261116: expected.tripsOn_20261116 }));
