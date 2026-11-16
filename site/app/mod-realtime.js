// mod-realtime.js: live vehicle positions (desktop app only). See docs/features/realtime.md.
// The protobuf reader below is hand written and has no dependencies, so it can also be loaded in Node for checks.
(function () {
  'use strict';

  // ---- Minimal protobuf reader for GTFS-Realtime VehiclePositions ------------------------------
  function reader(buf, start, end) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p = start || 0; const e = end === undefined ? b.length : end;
    return {
      get done() { return p >= e; },
      varint() {
        let lo = 0, mul = 1, n = 0, byte;
        do { if (p >= e || n > 9) throw new Error('bad varint'); byte = b[p++]; lo += (byte & 0x7f) * mul; mul *= 128; n++; } while (byte & 0x80);
        return lo;
      },
      tag() { const v = this.varint(); return { field: Math.floor(v / 8), wire: v % 8 }; },
      fixed32() { if (p + 4 > e) throw new Error('truncated'); const v = dv.getFloat32(p, true); p += 4; return v; },
      bytes() { const n = this.varint(); if (p + n > e) throw new Error('truncated'); const r = [p, p + n]; p += n; return r; },
      skip(wire) {
        if (wire === 0) this.varint(); else if (wire === 1) p += 8; else if (wire === 2) this.bytes(); else if (wire === 5) p += 4; else throw new Error('bad wire type');
        if (p > e) throw new Error('truncated');
      },
      sub(r) { return reader(b, r[0], r[1]); },
      str(r) { return new TextDecoder('utf-8').decode(b.subarray(r[0], r[1])); }
    };
  }

  /** Parse a FeedMessage and return the vehicles it holds: [{ id, label, routeId, tripId, lat, lon, bearing, timestamp }]. */
  function parseFeed(buf) {
    const top = reader(buf), out = [];
    let headerTs = 0;
    while (!top.done) {
      const { field, wire } = top.tag();
      if (field === 1 && wire === 2) { // header
        const h = top.sub(top.bytes());
        while (!h.done) { const t = h.tag(); if (t.field === 3 && t.wire === 0) headerTs = h.varint(); else h.skip(t.wire); }
      } else if (field === 2 && wire === 2) { // entity
        const ent = top.sub(top.bytes());
        let veh = null, deleted = false;
        while (!ent.done) {
          const t = ent.tag();
          if (t.field === 2 && t.wire === 0) deleted = ent.varint() !== 0;
          else if (t.field === 4 && t.wire === 2) veh = ent.bytes();
          else ent.skip(t.wire);
        }
        if (!veh || deleted) continue;
        const v = ent.sub(veh), rec = { id: '', label: '', routeId: '', tripId: '', lat: NaN, lon: NaN, bearing: undefined, timestamp: 0 };
        while (!v.done) {
          const t = v.tag();
          if (t.field === 1 && t.wire === 2) { // trip
            const tr = v.sub(v.bytes());
            while (!tr.done) { const u = tr.tag(); if (u.field === 1 && u.wire === 2) rec.tripId = tr.str(tr.bytes()); else if (u.field === 5 && u.wire === 2) rec.routeId = tr.str(tr.bytes()); else tr.skip(u.wire); }
          } else if (t.field === 2 && t.wire === 2) { // position
            const ps = v.sub(v.bytes());
            while (!ps.done) { const u = ps.tag(); if (u.field === 1 && u.wire === 5) rec.lat = ps.fixed32(); else if (u.field === 2 && u.wire === 5) rec.lon = ps.fixed32(); else if (u.field === 3 && u.wire === 5) rec.bearing = ps.fixed32(); else ps.skip(u.wire); }
          } else if (t.field === 5 && t.wire === 0) rec.timestamp = v.varint();
          else if (t.field === 8 && t.wire === 2) { // vehicle descriptor
            const vd = v.sub(v.bytes());
            while (!vd.done) { const u = vd.tag(); if (u.field === 1 && u.wire === 2) rec.id = vd.str(vd.bytes()); else if (u.field === 2 && u.wire === 2) rec.label = vd.str(vd.bytes()); else vd.skip(u.wire); }
          } else v.skip(t.wire);
        }
        if (Number.isFinite(rec.lat) && Number.isFinite(rec.lon) && Math.abs(rec.lat) <= 90 && Math.abs(rec.lon) <= 180) out.push(rec);
      } else top.skip(wire);
    }
    return { timestamp: headerTs, vehicles: out };
  }

  if (typeof window === 'undefined') { module.exports = { parseFeed }; return; }

  // ---- Editor module ------------------------------------------------------------------------------
  const X = window.GMMCX = window.GMMCX || {};
  const hk = (n) => (X[n] = X[n] || []);
  window.GMMCRealtime = { parseFeed };
  const FEEDS = [
    { id: 'yrt', url: 'https://rtu.york.ca/gtfsrealtime/VehiclePositions' },
    { id: 'ttc', url: 'https://bustime.ttc.ca/gtfsrt/vehicles' }
  ];
  const POLL_MS = 30000, STALE_MS = 120000, KEY = 'gmmc.live';
  let GM = null, on = false, timer = 0, busy = false, lastOk = 0, lastErr = false;
  let vehicles = []; // positions from the last good polls
  const desktop = () => !!(window.gmmcDesktop && typeof window.gmmcDesktop.fetchFeed === 'function');

  window.I18N.add({
    liveVehicles: 'Live vehicles',
    liveVehiclesNote: 'Shows buses and streetcars from official agency feeds in the geographic layout. Updates every 30 seconds while this window is visible.',
    liveNeedsDesktop: 'Live vehicles need the desktop app because transit agencies do not allow browsers to read their live feeds directly.',
    liveUpdated: 'Live, updated {time}', liveStale: 'Stale, last update {time}', liveWaiting: 'Live, waiting for the first update',
    liveCount: '{n} vehicles', liveFailed: 'Could not read the live vehicle feeds. Showing the last known positions.',
    liveSchematic: 'Live vehicles are shown in the geographic layout.', liveVehicle: 'Vehicle', liveRoute: 'route'
  }, {
    liveVehicles: '即時車輛',
    liveVehiclesNote: '喺地理佈局顯示官方資料入面嘅巴士同電車位置。呢個視窗見到嗰陣，每 30 秒更新一次。',
    liveNeedsDesktop: '即時車輛要用桌面版，因為交通機構唔俾瀏覽器直接讀取佢哋嘅即時資料。',
    liveUpdated: '即時，更新於 {time}', liveStale: '資料過時，上次更新 {time}', liveWaiting: '即時，等緊第一次更新',
    liveCount: '{n} 架車', liveFailed: '讀唔到即時車輛資料，繼續顯示最後已知位置。',
    liveSchematic: '即時車輛只會喺地理佈局顯示。', liveVehicle: '車輛', liveRoute: '路線'
  });

  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_m, k) => o[k]);
  const isStale = () => !lastOk || Date.now() - lastOk > STALE_MS;

  // Match a vehicle's route id to a map line: same id, or a route number of three or more characters in the line name.
  function lineIndex(map) {
    const byKey = new Map();
    for (const l of map.lines) {
      const keys = [String(l.id).toLowerCase()];
      for (const field of [l.name, l.nameZh]) for (const tok of String(field || '').toLowerCase().split(/[^a-z0-9]+/)) if (tok.length >= 3 && /\d/.test(tok)) keys.push(tok);
      if (Array.isArray(l.routeIds)) for (const r of l.routeIds) keys.push(String(r).toLowerCase());
      for (const k of keys) if (!byKey.has(k)) byKey.set(k, l);
    }
    return byKey;
  }
  const inkFor = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#FFFFFF'; const n = parseInt(m[1], 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#16181D' : '#FFFFFF'; };

  hk('svgOver').push((m, ctx) => {
    if (!on || !GM || !m._geo || !vehicles.length || (ctx.opts && ctx.opts.exportColors)) return '';
    const idx = lineIndex(GM.getMap()), k = m._k || 1, G = ctx.G, stale = isStale();
    let out = '';
    for (const v of vehicles) {
      const g = GM.geoGrid(v.lat, v.lon), x = g.x * k * G, y = g.y * k * G;
      const line = idx.get(String(v.routeId).toLowerCase());
      const color = line ? line.color : '#8A8D93';
      const tip = `${GM.t('liveVehicle')} ${v.label || v.id}${v.routeId ? ' · ' + GM.t('liveRoute') + ' ' + v.routeId : ''}`;
      out += `<g class="live-veh${stale ? ' stale' : ''}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="6" fill="${GM.esc(color)}" stroke="#FFFFFF" stroke-width="2"/><circle r="2" fill="${inkFor(color)}"/><title>${GM.esc(tip)}</title></g>`;
    }
    return `<g class="live-vehicles" data-count="${vehicles.length}">${out}</g>`;
  });

  // ---- Chip and controls --------------------------------------------------------------------------
  let chip = null, fab = null, sw = null;
  function updateChip() {
    if (!chip) return;
    const geo = GM.isGeo();
    if (!on) { chip.hidden = true; } else {
      chip.hidden = false;
      const stale = !!lastOk && isStale();
      chip.classList.toggle('stale', stale || lastErr);
      let text;
      if (!geo) text = GM.t('liveSchematic');
      else if (!lastOk) text = GM.t('liveWaiting');
      else text = fill(GM.t(stale ? 'liveStale' : 'liveUpdated'), { time: clock(lastOk) }) + ' · ' + fill(GM.t('liveCount'), { n: vehicles.length });
      chip.querySelector('.lv-text').textContent = text;
    }
    if (fab) { fab.classList.toggle('live-on', on); fab.setAttribute('aria-pressed', String(on)); }
    if (sw) sw.checked = on;
  }

  async function poll() {
    if (!on || busy || document.hidden) return;
    busy = true;
    try {
      const results = await Promise.allSettled(FEEDS.map((f) => window.gmmcDesktop.fetchFeed(f.url).then((buf) => parseFeed(buf).vehicles)));
      const ok = results.filter((r) => r.status === 'fulfilled');
      if (ok.length) {
        vehicles = ok.flatMap((r) => r.value).filter((v) => v.lat > 41 && v.lat < 46 && v.lon > -82 && v.lon < -77);
        lastOk = Date.now();
      }
      if (ok.length < FEEDS.length) { if (!lastErr) GM.toast(GM.t('liveFailed')); lastErr = true; } else lastErr = false;
    } catch (e) { if (!lastErr) GM.toast(GM.t('liveFailed')); lastErr = true; }
    busy = false;
    GM.render(); updateChip();
  }
  const schedule = () => { clearInterval(timer); timer = on && !document.hidden ? setInterval(() => { poll(); updateChip(); }, POLL_MS) : 0; };

  function setOn(v) {
    if (v && !desktop()) { GM.toast(GM.t('liveNeedsDesktop')); updateChip(); return; }
    on = !!v;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* storage may be unavailable */ }
    if (!on) { vehicles = []; lastOk = 0; lastErr = false; }
    schedule(); updateChip(); GM.render();
    if (on) poll();
  }

  hk('ready').push((gmmc) => {
    GM = gmmc;
    const stage = document.getElementById('stage');
    chip = document.createElement('div');
    chip.className = 'live-chip'; chip.id = 'liveChip'; chip.hidden = true; chip.setAttribute('role', 'status');
    chip.innerHTML = '<span class="lv-dot"></span><span class="lv-text"></span>';
    stage.appendChild(chip);

    fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'fab live-fab'; fab.id = 'liveBtn';
    fab.innerHTML = window.icon('directions_bus', 24);
    fab.setAttribute('aria-label', GM.t('liveVehicles')); fab.title = desktop() ? GM.t('liveVehicles') : GM.t('liveNeedsDesktop');
    fab.setAttribute('aria-pressed', 'false');
    if (!desktop()) { fab.setAttribute('aria-disabled', 'true'); fab.classList.add('disabled'); }
    fab.addEventListener('click', () => setOn(!on));
    document.querySelector('.fab-col').appendChild(fab);

    const scroll = document.querySelector('#settingsDialog .dialog-scroll'), after = document.getElementById('setLive');
    const row = document.createElement('div'); row.className = 'live-setting';
    row.innerHTML = `<label class="switch-row"><span>${GM.esc(GM.t('liveVehicles'))}</span><input id="setLiveVeh" type="checkbox" role="switch" class="switch"${desktop() ? '' : ' disabled'} aria-describedby="liveNote"></label><p class="supporting" id="liveNote">${GM.esc(GM.t(desktop() ? 'liveVehiclesNote' : 'liveNeedsDesktop'))}</p>`;
    const anchor = after && after.closest('.switch-row');
    if (anchor && anchor.parentNode === scroll) anchor.after(row); else if (scroll) scroll.appendChild(row);
    sw = row.querySelector('input');
    sw.addEventListener('change', () => setOn(sw.checked));

    document.addEventListener('visibilitychange', () => { if (!on) return; if (document.hidden) { clearInterval(timer); timer = 0; } else { schedule(); if (Date.now() - lastOk >= POLL_MS) poll(); } });
    let remembered = false; try { remembered = localStorage.getItem(KEY) === '1'; } catch (e) { /* ignore */ }
    if (remembered && desktop()) setOn(true); else updateChip();
  });
  hk('afterRender').push(() => updateChip());
})();
