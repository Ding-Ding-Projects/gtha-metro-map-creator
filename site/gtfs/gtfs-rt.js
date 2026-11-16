// gtfs-rt.js: a small GTFS Realtime (protobuf) reader for vehicle positions, trip updates and service alerts.
(function () {
  'use strict';
  function reader(buf, start, end) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p = start || 0; const e = end === undefined ? b.length : end;
    const dec = new TextDecoder('utf-8');
    return {
      get done() { return p >= e; },
      /** [low32, high32] of a varint. */
      v64() {
        let lo = 0, hi = 0, shift = 0, byte, n = 0;
        do {
          if (p >= e || n > 9) throw new Error('bad varint');
          byte = b[p++]; n++;
          if (shift < 28) lo |= (byte & 0x7f) << shift;
          else if (shift === 28) { lo |= (byte & 0x0f) << 28; hi |= (byte & 0x7f) >> 4; }
          else hi |= (byte & 0x7f) << (shift - 32);
          shift += 7;
        } while (byte & 0x80);
        return [lo >>> 0, hi >>> 0];
      },
      uint() { const [lo, hi] = this.v64(); return lo + hi * 4294967296; },
      int32() { const [lo] = this.v64(); return lo | 0; },
      tag() { const [lo] = this.v64(); return { field: lo >>> 3, wire: lo & 7 }; },
      f32() { if (p + 4 > e) throw new Error('truncated'); const v = dv.getFloat32(p, true); p += 4; return v; },
      f64() { if (p + 8 > e) throw new Error('truncated'); const v = dv.getFloat64(p, true); p += 8; return v; },
      range() { const n = this.uint(); if (p + n > e) throw new Error('truncated'); const r = [p, p + n]; p += n; return r; },
      skip(w) { if (w === 0) this.v64(); else if (w === 1) p += 8; else if (w === 2) this.range(); else if (w === 5) p += 4; else throw new Error('bad wire type'); if (p > e) throw new Error('truncated'); },
      sub(r) { return reader(b, r[0], r[1]); },
      str(r) { return dec.decode(b.subarray(r[0], r[1])); }
    };
  }
  function each(r, fn) { while (!r.done) { const t = r.tag(); if (!fn(t.field, t.wire)) r.skip(t.wire); } }

  function tripDesc(r) { const o = { tripId: '', routeId: '', directionId: '', startDate: '', startTime: '', relationship: 0 }; each(r, (f, w) => { if (w === 2 && f === 1) o.tripId = r.str(r.range()); else if (w === 2 && f === 2) o.startTime = r.str(r.range()); else if (w === 2 && f === 3) o.startDate = r.str(r.range()); else if (w === 2 && f === 5) o.routeId = r.str(r.range()); else if (w === 0 && f === 6) o.directionId = String(r.uint()); else if (w === 0 && f === 4) o.relationship = r.uint(); else return false; return true; }); return o; }
  function position(r) { const o = { lat: NaN, lon: NaN, bearing: undefined, speed: undefined }; each(r, (f, w) => { if (w === 5 && f === 1) o.lat = r.f32(); else if (w === 5 && f === 2) o.lon = r.f32(); else if (w === 5 && f === 3) o.bearing = r.f32(); else if (w === 5 && f === 5) o.speed = r.f32(); else return false; return true; }); return o; }
  function vehDesc(r) { const o = { id: '', label: '', plate: '' }; each(r, (f, w) => { if (w === 2 && f === 1) o.id = r.str(r.range()); else if (w === 2 && f === 2) o.label = r.str(r.range()); else if (w === 2 && f === 3) o.plate = r.str(r.range()); else return false; return true; }); return o; }
  function stopEvent(r) { const o = { delay: undefined, time: 0 }; each(r, (f, w) => { if (w === 0 && f === 1) o.delay = r.int32(); else if (w === 0 && f === 2) o.time = r.uint(); else return false; return true; }); return o; }
  function translated(r) { const out = []; each(r, (f, w) => { if (w === 2 && f === 1) { const s = r.sub(r.range()); const o = { text: '', lang: '' }; each(s, (g, x) => { if (x === 2 && g === 1) o.text = s.str(s.range()); else if (x === 2 && g === 2) o.lang = s.str(s.range()); else return false; return true; }); out.push(o); return true; } return false; }); return out; }

  /** Parses a FeedMessage: { timestamp, vehicles[], updates[], alerts[] }. */
  function parse(buf) {
    const top = reader(buf), out = { timestamp: 0, vehicles: [], updates: [], alerts: [] };
    each(top, (f, w) => {
      if (f === 1 && w === 2) { const h = top.sub(top.range()); each(h, (g, x) => { if (g === 3 && x === 0) { out.timestamp = h.uint(); return true; } return false; }); return true; }
      if (f === 2 && w === 2) {
        const ent = top.sub(top.range()); let id = '', deleted = false, veh = null, upd = null, alert = null;
        each(ent, (g, x) => { if (g === 1 && x === 2) id = ent.str(ent.range()); else if (g === 2 && x === 0) deleted = ent.uint() !== 0; else if (g === 3 && x === 2) upd = ent.range(); else if (g === 4 && x === 2) veh = ent.range(); else if (g === 5 && x === 2) alert = ent.range(); else return false; return true; });
        if (deleted) return true;
        if (veh) {
          const v = ent.sub(veh), o = { id, vid: '', label: '', tripId: '', routeId: '', directionId: '', lat: NaN, lon: NaN, bearing: undefined, speed: undefined, stopId: '', status: 2, timestamp: 0 };
          each(v, (g, x) => {
            if (g === 1 && x === 2) { const d = tripDesc(v.sub(v.range())); o.tripId = d.tripId; o.routeId = d.routeId; o.directionId = d.directionId; }
            else if (g === 2 && x === 2) Object.assign(o, position(v.sub(v.range())));
            else if (g === 4 && x === 0) o.status = v.uint(); else if (g === 5 && x === 0) o.timestamp = v.uint(); else if (g === 7 && x === 2) o.stopId = v.str(v.range());
            else if (g === 8 && x === 2) { const d = vehDesc(v.sub(v.range())); o.vid = d.id; o.label = d.label; } else return false; return true;
          });
          out.vehicles.push(o);
        }
        if (upd) {
          const u = ent.sub(upd), o = { id, tripId: '', routeId: '', delay: undefined, vehicle: '', timestamp: 0, stops: [] };
          each(u, (g, x) => {
            if (g === 1 && x === 2) { const d = tripDesc(u.sub(u.range())); o.tripId = d.tripId; o.routeId = d.routeId; o.relationship = d.relationship; }
            else if (g === 2 && x === 2) { const s = u.sub(u.range()), rec = { seq: 0, stopId: '', arrival: null, departure: null, relationship: 0 }; each(s, (h, y) => { if (h === 1 && y === 0) rec.seq = s.uint(); else if (h === 2 && y === 2) rec.arrival = stopEvent(s.sub(s.range())); else if (h === 3 && y === 2) rec.departure = stopEvent(s.sub(s.range())); else if (h === 4 && y === 2) rec.stopId = s.str(s.range()); else if (h === 5 && y === 0) rec.relationship = s.uint(); else return false; return true; }); o.stops.push(rec); }
            else if (g === 3 && x === 2) o.vehicle = vehDesc(u.sub(u.range())).label; else if (g === 4 && x === 0) o.timestamp = u.uint(); else if (g === 5 && x === 0) o.delay = u.int32(); else return false; return true;
          });
          out.updates.push(o);
        }
        if (alert) {
          const a = ent.sub(alert), o = { id, header: [], description: [], url: [], cause: 1, effect: 8, periods: [], entities: [] };
          each(a, (g, x) => {
            if (g === 1 && x === 2) { const p = a.sub(a.range()), per = { start: 0, end: 0 }; each(p, (h, y) => { if (h === 1 && y === 0) per.start = p.uint(); else if (h === 2 && y === 0) per.end = p.uint(); else return false; return true; }); o.periods.push(per); }
            else if (g === 5 && x === 2) { const p = a.sub(a.range()), en = { agencyId: '', routeId: '', stopId: '', tripId: '' }; each(p, (h, y) => { if (y === 2 && h === 1) en.agencyId = p.str(p.range()); else if (y === 2 && h === 2) en.routeId = p.str(p.range()); else if (y === 2 && h === 5) en.stopId = p.str(p.range()); else if (y === 2 && h === 4) en.tripId = tripDesc(p.sub(p.range())).tripId; else return false; return true; }); o.entities.push(en); }
            else if (g === 6 && x === 0) o.cause = a.uint(); else if (g === 7 && x === 0) o.effect = a.uint();
            else if (g === 8 && x === 2) o.url = translated(a.sub(a.range())); else if (g === 10 && x === 2) o.header = translated(a.sub(a.range())); else if (g === 11 && x === 2) o.description = translated(a.sub(a.range())); else return false; return true;
          });
          out.alerts.push(o);
        }
        return true;
      }
      return false;
    });
    return out;
  }

  // ---- writer, used for a built in sample and for checks ----
  const enc = new TextEncoder();
  const wv = (n) => { const o = []; let x = n; if (x < 0) { x += 4294967296; const lo = x, hi = 4294967295; let l = lo, h = hi; for (let i = 0; i < 10; i++) { let byte; if (i < 4) byte = l & 0x7f, l = l >>> 7; else if (i === 4) byte = ((l & 0x0f) | ((h & 0x07) << 4)), h = h >>> 3; else byte = h & 0x7f, h = h >>> 7; if (i < 9) byte |= 0x80; o.push(byte); } return o; } do { let b = x % 128; x = Math.floor(x / 128); if (x) b |= 0x80; o.push(b); } while (x); return o; };
  const wtag = (f, w) => wv(f * 8 + w);
  const wstr = (f, s) => { const b = enc.encode(s); return [...wtag(f, 2), ...wv(b.length), ...b]; };
  const wmsg = (f, a) => [...wtag(f, 2), ...wv(a.length), ...a];
  const wint = (f, n) => [...wtag(f, 0), ...wv(n)];
  const wf32 = (f, n) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, n, true); return [...wtag(f, 5), ...b]; };
  function build(msg) {
    const bytes = [...wmsg(1, [...wstr(1, '2.0'), ...wint(3, msg.timestamp || 0)])];
    let n = 0;
    for (const v of msg.vehicles || []) bytes.push(...wmsg(2, [...wstr(1, 'v' + ++n), ...wmsg(4, [...wmsg(1, [...wstr(1, v.tripId || ''), ...wstr(5, v.routeId || '')]), ...wmsg(2, [...wf32(1, v.lat), ...wf32(2, v.lon)]), ...wmsg(8, [...wstr(1, v.vid || ''), ...wstr(2, v.label || '')]), ...wint(5, v.timestamp || 0)])]));
    for (const u of msg.updates || []) bytes.push(...wmsg(2, [...wstr(1, 'u' + ++n), ...wmsg(3, [...wmsg(1, [...wstr(1, u.tripId || '')]), ...(u.stops || []).flatMap((s) => wmsg(2, [...wint(1, s.seq || 0), ...wmsg(2, wint(1, s.delay || 0)), ...wstr(4, s.stopId || '')])), ...wint(5, u.delay || 0)])]));
    for (const a of msg.alerts || []) bytes.push(...wmsg(2, [...wstr(1, 'a' + ++n), ...wmsg(5, [...wmsg(5, wstr(2, a.routeId || '')), ...wmsg(10, wmsg(1, [...wstr(1, a.header), ...wstr(2, 'en')])), ...wint(7, a.effect || 8)])]));
    return new Uint8Array(bytes);
  }
  window.GtfsRt = { parse, build };
})();
