// gtfs-views2.js: blocks, calendar, shapes, transfers and pathways, fares, flex, validation, realtime and the raw data browser.
(function () {
  'use strict';
  const C = window.GtfsCore, U = window.GUI, h = U.h, GA = window.GA, GV = window.GV, t = GA.t;
  const V = GA.views, fmt = C.fmtTime, enumL = GV.enumL;

  // ---------- generic data table with resolved references ----------
  const KIND = { route_id: 'route', from_route_id: 'route', to_route_id: 'route', stop_id: 'stop', from_stop_id: 'stop', to_stop_id: 'stop', parent_station: 'stop', agency_id: 'agency', trip_id: 'trip', from_trip_id: 'trip', to_trip_id: 'trip', fare_product_id: 'fare_product', fare_media_id: 'fare_media', rider_category_id: 'rider_category', area_id: 'area', from_area_id: 'area', to_area_id: 'area', network_id: 'network', from_network_id: 'network', to_network_id: 'network', level_id: 'level', booking_rule_id: 'booking_rule', pickup_booking_rule_id: 'booking_rule', drop_off_booking_rule_id: 'booking_rule', location_group_id: 'location_group', fare_id: 'fare' };
  const ENUM = { transfer_type: 'xfer', pathway_mode: 'pmode', is_bidirectional: 'yn', location_type: 'loc', wheelchair_boarding: 'wc', wheelchair_accessible: 'wct', bikes_allowed: 'bike', direction_id: 'dir', exception_type: 'exc', exact_times: 'exact', pickup_type: 'pu', drop_off_type: 'pu', continuous_pickup: 'cont', continuous_drop_off: 'cont', fare_media_type: 'media', fare_transfer_type: 'ftt', booking_type: 'book', payment_method: 'pay', transfers: 'xfers', monday: 'yn', tuesday: 'yn', wednesday: 'yn', thursday: 'yn', friday: 'yn', saturday: 'yn', sunday: 'yn', timepoint: 'tp' };
  GA.dataCell = (col, v) => {
    if (v === '' || v === undefined) return '';
    const f = GA.feed; const k = KIND[col]; if (k) { const l = f.label(k, v); const href = { route: 'route', stop: 'stop', trip: 'trip' }[k]; if (href && l !== '' || href) { return h('span', null, h('a', { class: 'lnk', href: GA.href(href, v), text: v }), l ? h('span.sub', { text: ' · ' + l }) : null); } return l ? v + ' · ' + l : v; }
    if (ENUM[col]) { const e = enumL(ENUM[col], v); return e === v ? v : v + ' · ' + e; }
    if (col === 'route_type') return v + ' · ' + GA.typeName(v);
    if (/_color$/.test(col) && /^[0-9a-fA-F]{6}$/.test(v)) return h('span', null, h('span.swatch', { style: { background: '#' + v } }), ' ' + v);
    if (/(^|_)date$/.test(col) && C.dateOk(v)) return v + ' · ' + GA.dateText(v);
    if (/^https?:\/\//.test(v)) return h('a', { class: 'lnk', href: v, target: '_blank', rel: 'noopener', text: v });
    return v;
  };
  GA.dataTable = (file, o) => {
    o = o || {}; const f = GA.feed, name = file.replace(/\.txt$/, ''), rowsAll = f.table(name); const cols = (f.cols[file] || (rowsAll[0] ? Object.keys(rowsAll[0]) : [])).map((k) => ({ key: k, label: k, width: Math.min(260, Math.max(90, k.length * 9 + 30)), num: /^(stop_sequence|price|amount|min_|max_|length|traversal|stair|headway|shape_pt|stop_lat|stop_lon|rows)/.test(k) }));
    let q = ''; let rows = rowsAll; const tbl = U.vtable({ label: file, columns: cols, rows: () => rows, cell: (r, c) => GA.dataCell(c.key, r[c.key]), sortValue: (r, c) => { const v = r[c.key]; const n = parseFloat(v); return v !== '' && !isNaN(n) && /^-?[\d.]+$/.test(v) ? n : v; }, onRow: o.onRow });
    const search = GV.textField(t('filterRows'), (v) => { q = v.trim().toLowerCase(); rows = q ? rowsAll.filter((r) => { for (const k in r) if (String(r[k]).toLowerCase().includes(q)) return true; return false; }) : rowsAll; tbl.refresh(); count.textContent = t('nResults', { n: GA.n(rows.length), m: GA.n(rowsAll.length) }); });
    const count = h('p.sub.count', { text: t('nResults', { n: GA.n(rowsAll.length), m: GA.n(rowsAll.length) }) });
    const wrap = h('div.dt', null, h('div.row.between', null, search.el, count), h('div.vtwrap', null, tbl.el)); setTimeout(() => tbl.refresh(), 0);
    return wrap;
  };
  const missing = (file) => GA.empty('info', t('noFile', { f: file }), t('noFileSub'));

  // ---------- BLOCKS ----------
  const bs = { zoom: 8, start: 5 * 3600, sel: -1, only: '' };
  V.blocks = (page, { view, args }) => {
    const f = GA.feed; if (view === 'block' && args[0] && C.dateOk(args[0])) GA.date = args[0]; const wantId = view === 'block' ? args[1] : null;
    let blocks = f.blocksOn(GA.date); const hours = f.blocksPerHour(blocks); const issueSet = new Set(blocks.filter((b) => b.issues.length).map((b) => b.id));
    const noBlock = f.tripsOn(GA.date).filter((ti) => !f.trips[ti].block_id).length, inBlocks = blocks.reduce((n, b) => n + b.trips.length, 0), peak = Math.max(0, ...hours);
    const deadheads = new Map(); const dh = (b) => { if (deadheads.has(b.id)) return deadheads.get(b.id); const out = []; for (let k = 1; k < b.trips.length; k++) { const a = b.trips[k - 1], c = b.trips[k], sa = f.stops[f.st.stop[f.st.tripStart[a + 1] - 1]], sc = f.stops[f.st.stop[f.st.tripStart[c]]]; if (sa && sc && sa !== sc && sa.stop_id !== sc.stop_id) out.push({ a, b: c, m: sa.ok && sc.ok ? C.haversine(sa.lat, sa.lon, sc.lat, sc.lon) : -1, gap: f.first[c] - f.last[a] }); } deadheads.set(b.id, out); return out; };
    let filter = bs.only;
    const dateBtn = GA.dateButton(GA.date, () => GA.go(GA.href('blocks')));
    const zoomS = U.slider({ min: 1, max: 30, step: 1, value: bs.zoom, label: t('visibleHours'), caption: true, format: (v) => v + ' h', onInput: (v) => { bs.zoom = v; draw(); } });
    const startS = U.slider({ min: 0, max: 28 * 4, step: 1, value: bs.start / 900, label: t('scrubTime'), caption: true, format: (v) => fmt(v * 900), onInput: (v) => { bs.start = v * 900; draw(); } });
    const only = U.segmented({ label: t('showBlocks'), value: filter, items: [{ value: '', label: t('all') }, { value: 'overlap', label: t('flagOverlap'), icon: 'warning' }, { value: 'deadhead', label: t('flagDeadhead'), icon: 'sync' }, { value: 'layover', label: t('flagLayover'), icon: 'clock' }], onChange: (v) => { filter = bs.only = v; apply(); } });
    const stats = h('div.stats', null, GA.stat(t('blocksL'), GA.n(blocks.length)), GA.stat(t('tripsInBlocks'), GA.n(inBlocks)), GA.stat(t('tripsNoBlock'), GA.n(noBlock)), GA.stat(t('peakVehicles'), GA.n(peak)), GA.stat(t('overlapBlocks'), GA.n(issueSet.size)));
    const chart = GA.barChart({ label: t('vehiclesByHour'), data: hours.map((n, hr) => ({ value: n, tip: C.pad(hr) + ':00: ' + n + ' ' + t('vehiclesLc'), on: false })), height: 70, axis: ['00', '06', '12', '18', '23'] });
    // list of blocks
    let shown = []; const detail = h('div.bdetail'); let vl;
    const longLay = (b) => b.gaps.some((g) => g > 3600);
    const apply = () => { shown = blocks.filter((b) => !filter || (filter === 'overlap' && b.issues.length) || (filter === 'deadhead' && dh(b).length) || (filter === 'layover' && longLay(b))); vl.setCount(shown.length); count.textContent = t('nResults', { n: GA.n(shown.length), m: GA.n(blocks.length) }); draw(); };
    vl = U.vlist({ label: t('nav_blocks'), rowH: 56, id: 'bl', count: 0, render: (i) => { const b = shown[i]; const a = h('a', { class: 'srow' + (shown[bs.sel] === b ? ' cur' : ''), href: GA.href('block', GA.date, b.id), tabindex: -1 }); const rs0 = new Set(b.trips.map((x) => f.routeIx.get(f.trips[x].route_id))); a.append(h('span.srow-ic', { html: U.icon('gantt', 22) }), h('span.srow-t', null, h('b', { text: t('kindBlock') + ' ' + b.id }), h('small', { text: fmt(b.start) + ' - ' + fmt(b.end) + ' · ' + b.trips.length + ' ' + t('tripsLc') + (b.issues.length ? ' · ' + t('flagOverlap') : '') })), h('span.srow-r', null, [...rs0].slice(0, 3).map((ri) => ri === undefined ? null : GA.badge(f.routes[ri])))); return a; }, onActivate: (i) => GA.go(GA.href('block', GA.date, shown[i].id)) });
    const count = h('p.sub.count', { 'aria-live': 'polite' });
    // gantt
    const wrap = h('div.gantt', null), scroller = h('div.gt-scroll'), spacer = h('div.gt-sp'), cv = h('canvas.gt-cv', { tabindex: 0, role: 'application', 'aria-label': t('ganttLabel'), 'aria-describedby': 'gtHelp' });
    scroller.append(spacer, cv); wrap.append(scroller, h('p.sub#gtHelp', { text: t('ganttHelp') }));
    const ROW = 30, AX = 30, LW = 92; let bars = [];
    const resizeCv = () => { const d = window.devicePixelRatio || 1, w = scroller.clientWidth, hh = scroller.clientHeight; if (!w || !hh) return; cv.width = Math.round(w * d); cv.height = Math.round(hh * d); cv.style.width = w + 'px'; cv.style.height = hh + 'px'; draw(); };
    const css = (n) => getComputedStyle(wrap).getPropertyValue(n).trim();
    function draw() {
      const d = window.devicePixelRatio || 1, w = scroller.clientWidth, hh = scroller.clientHeight; if (!w || !hh) return; const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, w, hh);
      spacer.style.height = AX + shown.length * ROW + 'px'; const top = scroller.scrollTop, span = bs.zoom * 3600, t0 = bs.start, pw = Math.max(50, w - LW), x = (s) => LW + (s - t0) / span * pw;
      ctx.fillStyle = css('--md-surface-container-low'); ctx.fillRect(0, 0, w, hh); ctx.font = '12px Roboto, sans-serif'; ctx.textBaseline = 'middle';
      const step = bs.zoom <= 3 ? 900 : bs.zoom <= 8 ? 1800 : 3600;
      ctx.strokeStyle = css('--md-outline-variant'); ctx.fillStyle = css('--md-on-surface-variant'); ctx.lineWidth = 1; ctx.textAlign = 'center';
      for (let s = Math.ceil(t0 / step) * step; s <= t0 + span; s += step) { const px = Math.round(x(s)) + 0.5; ctx.beginPath(); ctx.moveTo(px, AX); ctx.lineTo(px, hh); ctx.stroke(); if (px > LW + 18) ctx.fillText(fmt(s), px, AX / 2); }
      bars = []; const r0 = Math.max(0, Math.floor(top / ROW)), r1 = Math.min(shown.length, Math.ceil((top + hh - AX) / ROW) + 1);
      for (let i = r0; i < r1; i++) {
        const b = shown[i], y = AX + i * ROW - top; if (shown[bs.sel] === b) { ctx.fillStyle = css('--md-secondary-container'); ctx.fillRect(0, y, w, ROW); }
        for (let k = 0; k < b.trips.length; k++) {
          const ti = b.trips[k], tr0 = f.trips[ti], ri = f.routeIx.get(tr0.route_id), col = ri === undefined ? '#5F6368' : f.routeColor(f.routes[ri]), a = f.first[ti], z = f.last[ti];
          const bx = x(a), bw = Math.max(2, x(z) - bx); if (bx + bw < LW || bx > w) continue;
          if (k > 0) { const pz = f.last[b.trips[k - 1]], gx = Math.max(LW, x(pz)); const dhk = dh(b).find((q) => q.b === ti); ctx.strokeStyle = dhk ? '#e8710a' : css('--md-outline'); ctx.setLineDash(dhk ? [4, 3] : []); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, y + ROW / 2); ctx.lineTo(Math.max(LW, bx), y + ROW / 2); ctx.stroke(); ctx.setLineDash([]); }
          const clipX = Math.max(LW, bx), clipW = bx + bw - clipX; if (clipW <= 0) continue;
          ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(clipX, y + 4, clipW, ROW - 8, 5); ctx.fill();
          const bad = b.issues.some((q) => q.a === ti || q.b === ti); if (bad) { ctx.strokeStyle = '#d93025'; ctx.lineWidth = 2.5; ctx.stroke(); }
          if (clipW > 30) { ctx.fillStyle = ri === undefined ? '#fff' : f.routeText(f.routes[ri]); ctx.textAlign = 'left'; ctx.fillText(ri === undefined ? '?' : f.routeShort(f.routes[ri]), clipX + 6, y + ROW / 2 + 0.5, clipW - 8); }
          bars.push({ x: clipX, y: y + 4, w: clipW, h: ROW - 8, ti, b, bad });
        }
        ctx.fillStyle = css('--md-surface-container-low'); ctx.fillRect(0, y, LW - 2, ROW); ctx.fillStyle = css('--md-on-surface'); ctx.textAlign = 'left'; ctx.font = '500 12px Roboto, sans-serif'; ctx.fillText(b.id, 8, y + ROW / 2 + 0.5, LW - 14); ctx.font = '12px Roboto, sans-serif';
        if (b.issues.length) { ctx.fillStyle = '#d93025'; ctx.fillText('!', LW - 12, y + ROW / 2); }
      }
      ctx.fillStyle = css('--md-surface-container-low'); ctx.fillRect(0, 0, LW - 2, AX); ctx.fillStyle = css('--md-on-surface-variant'); ctx.textAlign = 'left'; ctx.fillText(t('kindBlock'), 8, AX / 2);
    }
    const at = (e) => { const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top; return { px, py, bar: bars.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h), row: Math.floor((py - AX + scroller.scrollTop) / ROW) }; };
    cv.addEventListener('pointermove', (e) => { if (drag) return; const a = at(e); if (a.bar) { const ti = a.bar.ti, tr0 = f.trips[ti]; U.tipAt(e.clientX, e.clientY, (f.headsign(tr0) || tr0.trip_id) + ' · ' + fmt(f.first[ti]) + ' - ' + fmt(f.last[ti]) + (a.bar.bad ? ' · ' + t('flagOverlap') : '')); cv.style.cursor = 'pointer'; } else { U.tipHide(); cv.style.cursor = 'grab'; } });
    cv.addEventListener('pointerleave', () => U.tipHide());
    let drag = null; cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, s: bs.start, moved: 0 }; });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; drag.moved = Math.max(drag.moved, Math.abs(dx)); const pw = scroller.clientWidth - LW; bs.start = Math.max(0, Math.min(28 * 3600, drag.s - dx / pw * bs.zoom * 3600)); startS.set(Math.round(bs.start / 900)); draw(); });
    cv.addEventListener('pointerup', (e) => { const was = drag; drag = null; if (was && was.moved < 5) { const a = at(e); if (a.bar) GA.go(GA.href('trip', f.trips[a.bar.ti].trip_id)); else if (a.row >= 0 && a.row < shown.length) GA.go(GA.href('block', GA.date, shown[a.row].id)); } });
    cv.addEventListener('wheel', (e) => { if (e.ctrlKey || e.shiftKey) { e.preventDefault(); if (e.ctrlKey) { bs.zoom = Math.max(1, Math.min(30, bs.zoom + (e.deltaY > 0 ? 1 : -1))); zoomS.set(bs.zoom); } else { bs.start = Math.max(0, Math.min(28 * 3600, bs.start + Math.sign(e.deltaY) * 900)); startS.set(Math.round(bs.start / 900)); } draw(); } }, { passive: false });
    scroller.addEventListener('scroll', draw, { passive: true });
    cv.addEventListener('keydown', (e) => {
      const k = e.key; if (k === 'ArrowLeft' || k === 'ArrowRight') bs.start = Math.max(0, Math.min(28 * 3600, bs.start + (k === 'ArrowRight' ? 900 : -900))); else if (k === 'ArrowDown') { bs.sel = Math.min(shown.length - 1, bs.sel + 1); } else if (k === 'ArrowUp') { bs.sel = Math.max(0, bs.sel - 1); } else if (k === '+' || k === '=') bs.zoom = Math.max(1, bs.zoom - 1); else if (k === '-') bs.zoom = Math.min(30, bs.zoom + 1); else if (k === 'Enter' && shown[bs.sel]) { GA.go(GA.href('block', GA.date, shown[bs.sel].id)); return; } else return;
      e.preventDefault(); zoomS.set(bs.zoom); startS.set(Math.round(bs.start / 900)); const y = bs.sel * ROW; if (y < scroller.scrollTop) scroller.scrollTop = y; else if (y + ROW > scroller.scrollTop + scroller.clientHeight - AX) scroller.scrollTop = y + ROW - scroller.clientHeight + AX; draw();
    });
    new ResizeObserver(resizeCv).observe(scroller);
    // detail
    const showDetail = (b) => {
      detail.textContent = ''; if (!b) { detail.append(h('p.sub', { text: t('pickBlock') })); return; }
      const dhs = dh(b); detail.append(h('h3', { text: t('kindBlock') + ' ' + b.id + ' · ' + GA.dateText(GA.date) }), h('p.sub', { text: fmt(b.start) + ' - ' + fmt(b.end) + ' · ' + b.trips.length + ' ' + t('tripsLc') + ' · ' + t('blockLength', { h: Math.round((b.end - b.start) / 360) / 10 }) }));
      const tb = h('table.tbl'); tb.append(h('thead', null, h('tr', null, [t('route'), t('headsign'), t('departure'), t('arrival'), t('layover'), t('deadheadL')].map((x) => h('th', { text: x })))));
      const body = h('tbody'); b.trips.forEach((ti, k) => { const tr0 = f.trips[ti], ri = f.routeIx.get(tr0.route_id); const prev = k ? b.trips[k - 1] : -1, gap = k ? f.first[ti] - f.last[prev] : null, d = dhs.find((q) => q.b === ti); body.append(h('tr' + (gap !== null && gap < 0 ? '.bad' : ''), null, h('td', null, ri === undefined ? '' : GA.badge(f.routes[ri])), h('td', null, GA.link('trip', tr0.trip_id, f.headsign(tr0) || tr0.trip_id)), h('td.num', { text: fmt(f.first[ti]) }), h('td.num', { text: fmt(f.last[ti]) }), h('td.num', { text: gap === null ? '' : (gap < 0 ? t('overlapBy', { m: Math.round(-gap / 60) }) : Math.round(gap / 60) + ' ' + t('minLc')) }), h('td', { text: d ? (d.m >= 0 ? (d.m / 1000).toFixed(1) + ' km' : t('differentStop')) : '' }))); });
      tb.append(body); detail.append(h('div.tblwrap', null, tb));
    };
    const selectById = (id) => { const i = shown.findIndex((b) => b.id === id); bs.sel = i; if (i >= 0) { vl.setActive(i, true); const y = i * ROW; scroller.scrollTop = Math.max(0, y - scroller.clientHeight / 3); showDetail(shown[i]); const b = shown[i]; bs.start = Math.max(0, Math.floor((b.start - 1800) / 900) * 900); startS.set(bs.start / 900); } else showDetail(null); draw(); };
    const left = h('div.listpane', null, h('div.row.ctl', null, dateBtn), only.el, count, h('div.listhost', null, vl.el));
    const right = h('div.detail', null, h('h2.pg-t', { text: t('nav_blocks') }), stats, h('div.row.ctl', null, zoomS.el, startS.el), wrap, GA.card(t('vehiclesByHour'), chart), detail);
    page.append(GV.split(left, right, !!wantId, true)); apply();
    if (!blocks.length) right.insertBefore(GA.empty('gantt', t('noBlocks'), t('noBlocksSub')), wrap);
    if (wantId) selectById(wantId); else if (shown.length) { bs.sel = -1; } else showDetail(null);
    showDetail(shown[bs.sel] || null); setTimeout(resizeCv, 30);
  };

  // ---------- CALENDAR ----------
  const cs = { ym: '' };
  V.calendar = (page, { view, args }) => {
    const f = GA.feed; const id = view === 'service' ? args[0] : null; const sel = id && f.serviceIds.includes(id) ? id : null;
    const list = h('div.listpane'), detail = h('div.detail'); const q = GV.textField(t('searchServices'), (v) => { fq = v.toLowerCase(); build(); }); let fq = '';
    const dateBtn = GA.dateButton(GA.date, () => { cs.ym = GA.date.slice(0, 6); build(); detailDraw(); });
    const count = h('p.sub.count'), host = h('div.listhost'); let svcs = [], vl;
    const letters = (c) => c ? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d, i) => h('span', { class: 'dow' + (c[d] === '1' ? ' on' : ''), text: t('dow' + i) })) : null;
    vl = U.vlist({ label: t('nav_calendar'), rowH: 66, id: 'cl', count: 0, render: (i) => { const sid = svcs[i], c = f.cal.get(sid), ex = f.exc.get(sid); let add = 0, rem = 0; if (ex) for (const v of ex.values()) v === 1 ? add++ : rem++; const a = h('a', { class: 'srow' + (sid === sel ? ' cur' : ''), href: GA.href('service', sid), tabindex: -1 }); a.append(h('span.srow-ic', { html: U.icon('calendar', 22) }), h('span.srow-t', null, h('b', { text: sid }), h('small', { text: [(c ? c.start_date + ' - ' + c.end_date : ''), (add ? '+' + add : '') + (rem ? ' −' + rem : ''), GA.n((f.tripsByService.get(sid) || []).length) + ' ' + t('tripsLc')].map((x) => x.trim()).filter(Boolean).join(' · ') }), h('span.dows', null, letters(c) || []))); return a; }, onActivate: (i) => GA.go(GA.href('service', svcs[i])) }); host.append(vl.el);
    const build = () => { svcs = f.serviceIds.filter((s) => !fq || s.toLowerCase().includes(fq)); vl.setCount(svcs.length); count.textContent = t('nResults', { n: svcs.length, m: f.serviceIds.length }); if (sel) { const ix = svcs.indexOf(sel); if (ix >= 0) vl.setActive(ix, true); } };
    list.append(q.el, h('div.row.ctl', null, dateBtn), count, host);
    const detailDraw = () => {
      detail.textContent = ''; if (!f.serviceIds.length) { detail.append(missing('calendar.txt')); return; }
      if (!cs.ym) cs.ym = (GA.date || f.rangeStart).slice(0, 6);
      if (sel) detail.append(h('header.dh', null, h('span.srow-ic.big', { html: U.icon('calendar', 28) }), h('div.dh-t', null, h('h2', { text: sel }), h('p.sub', { text: t('serviceTrips', { n: GA.n((f.tripsByService.get(sel) || []).length) }) })), GV.backBtn('#calendar', t('nav_calendar'))));
      else detail.append(h('h2.pg-t', { text: t('nav_calendar') }));
      const month = h('div.month'); const shift = (n) => { const dt = C.ymd(cs.ym + '01'); dt.setUTCMonth(dt.getUTCMonth() + n); cs.ym = C.key(dt).slice(0, 6); drawMonth(); };
      const label = h('div.dp-month', { 'aria-live': 'polite' });
      const nav = h('div.dp-nav', null, U.iconBtn('chevron_left', t('dpPrev'), () => shift(-1)), label, U.iconBtn('chevron_right', t('dpNext'), () => shift(1)));
      const legend = h('div.legend', null, h('span', null, h('i.lg.reg'), t('lgRegular')), h('span', null, h('i.lg.add'), t('lgAdded')), h('span', null, h('i.lg.rem'), t('lgRemoved')));
      function drawMonth() {
        const y = +cs.ym.slice(0, 4), m = +cs.ym.slice(4, 6); label.textContent = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(U.locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }); month.textContent = '';
        const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
        month.append(...[0, 1, 2, 3, 4, 5, 6].map((i) => h('span.m-h', { text: t('dow' + i) }))); // Sunday first
        for (let i = 0; i < first; i++) month.append(h('span.m-e'));
        for (let d = 1; d <= dim; d++) {
          const ds = cs.ym + C.pad(d); let cls = 'm-d', tip = '', n = 0;
          if (sel) { const ex = f.exc.get(sel) && f.exc.get(sel).get(ds), c = f.cal.get(sel), reg = c && c[C.DAYS[C.dow(ds)]] === '1' && c.start_date <= ds && ds <= c.end_date; if (ex === 1) { cls += ' add'; tip = t('lgAdded'); } else if (ex === 2) { cls += ' rem'; tip = t('lgRemoved'); } else if (reg) { cls += ' reg'; tip = t('lgRegular'); } n = f.serviceActive(sel, ds) ? 1 : 0; }
          else { const sv = f.servicesOn(ds), tn = f.tripsOn(ds).length; n = sv.size; if (tn) cls += ' reg'; tip = tn + ' ' + t('tripsLc') + ' · ' + n + ' ' + t('servicesLc'); }
          if (ds === GA.date) cls += ' cur';
          const b = h('button', { type: 'button', class: cls, 'aria-label': GA.dateText(ds) + (tip ? ', ' + tip : ''), 'data-tip': GA.dateText(ds) + (tip ? ': ' + tip : ''), text: String(d), onclick: () => { GA.date = ds; U.snack(t('dateSet', { d: GA.dateText(ds) })); dateBtn.redraw(); drawMonth(); drawOn(); } }); month.append(b);
        }
      }
      detail.append(GA.card(sel ? t('serviceMonth') : t('serviceMonthAll'), nav, month, legend)); drawMonth();
      if (sel) { const c = f.cal.get(sel), ex = f.exc.get(sel); const pairs = [[t('weekdays'), c ? h('span.dows', null, letters(c)) : t('noCalendarRow')], [t('startDate'), c ? GA.dateText(c.start_date) : ''], [t('endDate'), c ? GA.dateText(c.end_date) : '']]; detail.append(GA.card(t('vInfo'), GA.kv(pairs))); if (ex) { const rows = [...ex].sort((a, b) => a[0] < b[0] ? -1 : 1); detail.append(GA.card(t('exceptions') + ' (' + rows.length + ')', h('ul.plain', null, rows.slice(0, 200).map(([d, v]) => h('li', null, h('b', { text: v === 1 ? '+ ' : '− ' }), GA.dateText(d), ' ', h('span.sub', { text: v === 1 ? t('lgAdded') : t('lgRemoved') })))))); } }
      const on = h('div'); const drawOn = () => { on.textContent = ''; const sv = [...f.servicesOn(GA.date)].sort(); on.append(h('p.sub', { text: GA.dateText(GA.date) + ': ' + t('servicesRun', { n: sv.length, m: GA.n(f.tripsOn(GA.date).length) }) }), h('div.chips', null, sv.map((s) => { const a = h('a', { class: 'rchip', href: GA.href('service', s), text: s + ' · ' + GA.n((f.tripsByService.get(s) || []).length) }); return a; }))); }; detail.append(GA.card(t('whichServices'), h('div.row.ctl', null, dateBtn.cloneNode(false) && null), on)); drawOn();
      const days = f.tripsPerDay(); if (days.length) { const max = days.length > 366 ? 120 : 366; const step = Math.ceil(days.length / max); const data = []; for (let i = 0; i < days.length; i += step) { const sl = days.slice(i, i + step), v = Math.round(sl.reduce((n, d) => n + d[1], 0) / sl.length); data.push({ value: v, tip: GA.dateText(sl[0][0]) + (step > 1 ? ' - ' + GA.dateText(sl[sl.length - 1][0]) : '') + ': ' + GA.n(v) + ' ' + t('tripsLc'), date: sl[0][0] }); } detail.append(GA.card(t('tripsPerDay'), GA.barChart({ label: t('tripsPerDay'), data, height: 110, axis: [GA.dateText(days[0][0]), GA.dateText(days[days.length - 1][0])], onBar: (d) => { GA.date = d.date; cs.ym = d.date.slice(0, 6); dateBtn.redraw(); drawMonth(); drawOn(); U.snack(t('dateSet', { d: GA.dateText(d.date) })); } }))); }
    };
    page.append(GV.split(list, detail, !!sel, true)); build(); detailDraw();
  };

  // ---------- SHAPES ----------
  const sh = { filter: '' };
  V.shapes = (page, { view, args }) => {
    const f = GA.feed; if (!f.shapes) { page.append(h('h1.pg-t', { text: t('nav_shapes') }), missing('shapes.txt')); return; }
    const id = view === 'shape' ? args[0] : null; const sel = id ? f.shapeIx.get(id) : undefined; const S = f.shapes;
    if (!f.cache.shapeUse) { const use = S.ids.map(() => ({ trips: 0, routes: new Set() })); for (const tr0 of f.trips) { const i = f.shapeIx.get(tr0.shape_id); if (i !== undefined) { use[i].trips++; const ri = f.routeIx.get(tr0.route_id); if (ri !== undefined) use[i].routes.add(ri); } } f.cache.shapeUse = use; f.cache.shapeLen = S.ids.map((_, i) => f.shapeLength(i)); }
    const use = f.cache.shapeUse, len = f.cache.shapeLen; let rows = S.ids.map((_, i) => i);
    const filt = U.segmented({ label: t('showShapes'), value: sh.filter, items: [{ value: '', label: t('all') }, { value: 'unused', label: t('shapesUnused') }, { value: 'reused', label: t('shapesReused') }], onChange: (v) => { sh.filter = v; apply(); } });
    const count = h('p.sub.count');
    const tbl = U.vtable({ label: t('nav_shapes'), rowH: 40, columns: [{ key: 'id', label: 'shape_id', width: 160 }, { key: 'pts', label: t('points'), width: 90, num: true }, { key: 'len', label: t('lengthKm'), width: 100, num: true }, { key: 'trips', label: t('tripsLc'), width: 90, num: true }, { key: 'routes', label: t('routesLc'), width: 90, num: true }], rows: () => rows, onRow: (i) => GA.go(GA.href('shape', S.ids[i])),
      cell: (i, c) => { switch (c.key) { case 'id': return S.ids[i]; case 'pts': return GA.n(S.start[i + 1] - S.start[i]); case 'len': return (len[i] / 1000).toFixed(2); case 'trips': return GA.n(use[i].trips); case 'routes': return GA.n(use[i].routes.size); default: return ''; } },
      sortValue: (i, c) => ({ id: S.ids[i], pts: S.start[i + 1] - S.start[i], len: len[i], trips: use[i].trips, routes: use[i].routes.size })[c.key] });
    const apply = () => { rows = S.ids.map((_, i) => i).filter((i) => !sh.filter || (sh.filter === 'unused' && use[i].trips === 0) || (sh.filter === 'reused' && use[i].routes.size > 1)); count.textContent = t('nResults', { n: GA.n(rows.length), m: GA.n(S.ids.length) }); tbl.refresh(); };
    const search = GV.textField(t('searchShapes'), (v) => { const q = v.toLowerCase(); rows = S.ids.map((_, i) => i).filter((i) => (!q || S.ids[i].toLowerCase().includes(q)) && (!sh.filter || (sh.filter === 'unused' && use[i].trips === 0) || (sh.filter === 'reused' && use[i].routes.size > 1))); count.textContent = t('nResults', { n: GA.n(rows.length), m: GA.n(S.ids.length) }); tbl.refresh(); });
    const left = h('div.listpane', null, search.el, filt.el, count, h('div.vtwrap.grow', null, tbl.el));
    const detail = h('div.detail'); const box = h('div.mapbox.tall');
    if (sel === undefined) detail.append(id ? GA.empty('error', t('notFound', { id })) : GA.empty('shapes', t('pickShape')), box);
    else { detail.append(h('header.dh', null, h('span.srow-ic.big', { html: U.icon('shapes', 28) }), h('div.dh-t', null, h('h2', { text: S.ids[sel] }), h('p.sub', { text: GA.n(S.start[sel + 1] - S.start[sel]) + ' ' + t('points') + ' · ' + (len[sel] / 1000).toFixed(2) + ' km' })), GV.backBtn('#shapes', t('nav_shapes'))), box); const rs0 = [...use[sel].routes]; detail.append(GA.card(t('usedBy'), use[sel].trips ? h('div.chips', null, rs0.map((ri) => { const a = h('a', { class: 'rchip', href: GA.href('route', f.routes[ri].route_id) }); a.append(GA.badge(f.routes[ri]), h('span', { text: f.routes[ri].route_long_name || '' })); return a; }), h('span.sub', { text: GA.n(use[sel].trips) + ' ' + t('tripsLc') })) : h('p.sub', { text: t('shapeUnused') }))); }
    page.append(GV.split(left, detail, sel !== undefined, true)); apply();
    setTimeout(() => { const m = GV.map(box, t('nav_shapes')); const drawOne = (ctx, i, color, w, o) => { const pts = []; const stride = Math.max(1, Math.floor((S.start[i + 1] - S.start[i]) / 1500)); for (let k = S.start[i]; k < S.start[i + 1]; k += stride) pts.push([S.lat[k], S.lon[k]]); GV.drawPath(ctx, m, pts, color, w, o); return pts; }; const prim = getComputedStyle(box).getPropertyValue('--md-primary');
      if (sel === undefined) { m.addLayer((ctx) => { const step = Math.max(1, Math.floor(S.ids.length / 800)); for (let i = 0; i < S.ids.length; i += step) drawOne(ctx, i, use[i].trips ? '#5f6368' : '#d93025', 1.5, { alpha: 0.6 }); }); const all = []; for (let i = 0; i < S.ids.length; i += Math.max(1, Math.floor(S.ids.length / 200))) { all.push([S.lat[S.start[i]], S.lon[S.start[i]]]); } m.setHome(GV.boundsOf(all.filter((p) => Number.isFinite(p[0])))); }
      else { const b = []; m.addLayer((ctx) => { drawOne(ctx, sel, prim, 5, { halo: '#fff', arrows: true }); for (let k = S.start[sel]; k < S.start[sel + 1]; k++) { const p = m.px(S.lat[k], S.lon[k]); if (m.z >= 14) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, 7); ctx.fillStyle = prim; ctx.fill(); } } }); for (let k = S.start[sel]; k < S.start[sel + 1]; k++) b.push([S.lat[k], S.lon[k]]); m.setHome(GV.boundsOf(b)); } }, 0);
  };

  // ---------- TRANSFERS and PATHWAYS ----------
  V.transfers = (page, { args }) => {
    const f = GA.feed; const tab = args[0] === 'pathways' ? 'pathways' : args[0] === 'levels' ? 'levels' : 'transfers'; const station = args[1];
    const seg = U.segmented({ label: t('viewL'), value: tab, items: [{ value: 'transfers', label: t('nav_transfers'), icon: 'sync' }, { value: 'pathways', label: t('pathwaysL'), icon: 'stairs' }, { value: 'levels', label: t('levelsL'), icon: 'layers' }], onChange: (v) => GA.go('#transfers/' + v) });
    page.append(h('h1.pg-t', { text: t('nav_transfers') }), seg.el); const body = h('div.tabbody'); page.append(body);
    if (tab === 'transfers') { if (!f.has('transfers')) { body.append(missing('transfers.txt')); return; } const counts = {}; for (const x of f.table('transfers')) counts[x.transfer_type || '0'] = (counts[x.transfer_type || '0'] || 0) + 1; body.append(h('div.chips', null, Object.entries(counts).map(([k, n]) => h('span.tag', { text: k + ' · ' + enumL('xfer', k) + ': ' + GA.n(n) }))), GA.dataTable('transfers.txt')); }
    else if (tab === 'levels') { body.append(f.has('levels') ? GA.dataTable('levels.txt') : missing('levels.txt')); }
    else {
      const pw = f.table('pathways'); if (!pw.length) { body.append(missing('pathways.txt')); return; }
      const stationOf = (sid) => { const s = f.stops[f.stopIx.get(sid)]; return s ? (s.parent_station || s.stop_id) : sid; };
      const stations = [...new Set(pw.flatMap((p) => [stationOf(p.from_stop_id), stationOf(p.to_stop_id)]))];
      const cur = station && stations.includes(station) ? station : stations[0];
      const ac = U.autocomplete({ label: t('pickStation'), source: (q) => { q = q.toLowerCase(); return stations.filter((s) => !q || (f.label('stop', s) + ' ' + s).toLowerCase().includes(q)).slice(0, 30).map((s) => ({ value: s, label: f.label('stop', s) || s, sub: s + ' · ' + pw.filter((p) => stationOf(p.from_stop_id) === s || stationOf(p.to_stop_id) === s).length + ' ' + t('pathwaysLc'), icon: 'home' })); }, onSelect: (it) => GA.go('#transfers/pathways/' + encodeURIComponent(it.value)) }); ac.set(f.label('stop', cur) || cur);
      body.append(h('div.row', null, ac.el)); const mine = pw.filter((p) => stationOf(p.from_stop_id) === cur || stationOf(p.to_stop_id) === cur);
      const ids = [...new Set(mine.flatMap((p) => [p.from_stop_id, p.to_stop_id]))]; const W = 760, H = 420, pos = new Map();
      const geo = ids.map((i) => f.stops[f.stopIx.get(i)]).filter((s) => s && s.ok); const spread = geo.length > 1 && (Math.max(...geo.map((s) => s.lat)) - Math.min(...geo.map((s) => s.lat)) + Math.max(...geo.map((s) => s.lon)) - Math.min(...geo.map((s) => s.lon))) > 1e-7;
      ids.forEach((i, k) => { const s = f.stops[f.stopIx.get(i)]; if (spread && s && s.ok) { const la0 = Math.min(...geo.map((g) => g.lat)), la1 = Math.max(...geo.map((g) => g.lat)), lo0 = Math.min(...geo.map((g) => g.lon)), lo1 = Math.max(...geo.map((g) => g.lon)); pos.set(i, [60 + (s.lon - lo0) / Math.max(1e-9, lo1 - lo0) * (W - 120), H - 50 - (s.lat - la0) / Math.max(1e-9, la1 - la0) * (H - 100)]); } else { const a = k / ids.length * Math.PI * 2; pos.set(i, [W / 2 + Math.cos(a) * (W / 2 - 90), H / 2 + Math.sin(a) * (H / 2 - 60)]); } });
      const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'pwsvg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', t('pathwayGraph'));
      const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
      svg.append((() => { const d = el('defs', {}), m = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }); m.append(el('path', { d: 'M0 0L10 5L0 10z', fill: 'currentColor' })); d.append(m); return d; })());
      const pairN = new Map(), pairI = new Map(); for (const p of mine) { const k = [p.from_stop_id, p.to_stop_id].sort().join('|'); pairN.set(k, (pairN.get(k) || 0) + 1); }
      for (const p of mine) { let a = pos.get(p.from_stop_id), b = pos.get(p.to_stop_id); if (!a || !b) continue; const k = [p.from_stop_id, p.to_stop_id].sort().join('|'), idx = pairI.get(k) || 0; pairI.set(k, idx + 1); const nn = pairN.get(k); if (nn > 1) { const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, off = (idx - (nn - 1) / 2) * 22; a = [a[0] - dy / len * off, a[1] + dx / len * off]; b = [b[0] - dy / len * off, b[1] + dx / len * off]; } const g = el('g', { class: 'pw-e', tabindex: 0, role: 'img', 'data-tip': enumL('pmode', p.pathway_mode) + (p.length ? ' · ' + p.length + ' m' : '') + (p.traversal_time ? ' · ' + p.traversal_time + ' s' : '') + (p.stair_count ? ' · ' + p.stair_count + ' ' + t('stairsLc') : '') + (p.max_slope ? ' · ' + t('slope') + ' ' + p.max_slope : '') + (p.signposted_as ? ' · ' + p.signposted_as : ''), 'aria-label': enumL('pmode', p.pathway_mode) }); g.append(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'marker-end': 'url(#arr)', 'marker-start': p.is_bidirectional === '1' ? 'url(#arr)' : '' })); const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; const tx = el('text', { x: mx, y: my - 5, 'text-anchor': 'middle' }); tx.textContent = enumL('pmode', p.pathway_mode) + (p.length ? ' ' + p.length + 'm' : ''); g.append(tx); svg.append(g); }
      for (const i of ids) { const p = pos.get(i), s = f.stops[f.stopIx.get(i)]; const g = el('g', { class: 'pw-n', transform: `translate(${p[0]} ${p[1]})` }); g.append(el('circle', { r: 9 })); const tx = el('text', { y: 24, 'text-anchor': 'middle' }); tx.textContent = (s ? f.stopName(s) : i).slice(0, 26) + (s && s.location_type ? ' · ' + enumL('loc', s.location_type) : ''); g.append(tx); svg.append(g); }
      body.append(h('div.card.pwcard', null, svg)); const tbl = h('div.dt'); body.append(GA.card(t('pathwaysL') + ' (' + mine.length + ')', h('div.vtwrap', null, (() => { const t2 = U.vtable({ label: t('pathwaysL'), rowH: 36, columns: ['pathway_id', 'from_stop_id', 'to_stop_id', 'pathway_mode', 'is_bidirectional', 'length', 'traversal_time', 'stair_count', 'max_slope', 'min_width', 'signposted_as', 'reversed_signposted_as'].map((k) => ({ key: k, label: k, width: k.endsWith('stop_id') ? 200 : 130, num: ['length', 'traversal_time', 'stair_count', 'max_slope', 'min_width'].includes(k) })), rows: () => mine, cell: (r, c) => GA.dataCell(c.key, r[c.key]) }); setTimeout(() => t2.refresh(), 0); return t2.el; })())));
    }
  };

  // ---------- FARES ----------
  const fs = { tab: 'v1', table: 'fare_products' };
  V.fares = (page) => {
    const f = GA.feed; page.append(h('h1.pg-t', { text: t('nav_fares') }));
    const v2 = ['fare_media', 'fare_products', 'rider_categories', 'fare_leg_rules', 'fare_leg_join_rules', 'fare_transfer_rules', 'timeframes', 'areas', 'stop_areas', 'networks', 'route_networks'];
    const have1 = f.has('fare_attributes') || f.has('fare_rules'), have2 = v2.some((x) => f.has(x)); if (!have1 && !have2) { page.append(missing('fare_attributes.txt / fare_products.txt')); return; }
    if (fs.tab === 'v1' && !have1 && have2) fs.tab = 'v2'; if (fs.tab === 'v2' && !f.has(fs.table)) fs.table = v2.find((x) => f.has(x)) || fs.table;
    const body = h('div.tabbody');
    const seg = U.segmented({ label: t('fareVersion'), value: fs.tab, items: [{ value: 'v1', label: t('faresV1') }, { value: 'v2', label: t('faresV2') }], onChange: (v) => { fs.tab = v; draw(); } }); page.append(seg.el, body);
    const draw = () => {
      body.textContent = '';
      if (fs.tab === 'v1') { for (const n of ['fare_attributes', 'fare_rules']) body.append(GA.card(n + '.txt', f.has(n) ? GA.dataTable(n + '.txt') : missing(n + '.txt'))); }
      else { const sel = U.select({ label: t('fareTable'), value: fs.table, items: v2.map((n) => ({ value: n, label: n + '.txt' + (f.has(n) ? ' (' + GA.n(f.table(n).length) + ')' : ' ·  ' + t('absent')), icon: f.has(n) ? 'check' : null })), onChange: (v) => { fs.table = v; draw(); } }); body.append(h('div.row', null, sel.el), f.has(fs.table) ? GA.dataTable(fs.table + '.txt') : missing(fs.table + '.txt')); }
    }; draw();
  };

  // ---------- FLEX ----------
  const fx = { tab: 'map' };
  V.flex = (page) => {
    const f = GA.feed; page.append(h('h1.pg-t', { text: t('nav_flex') }));
    const wins = []; for (const [row, ex] of f.stExtra) if (ex.start_pickup_drop_off_window || ex.end_pickup_drop_off_window || ex.location_id || ex.location_group_id || ex.pickup_booking_rule_id || ex.drop_off_booking_rule_id) wins.push(row);
    if (!f.geo && !f.has('location_groups') && !f.has('booking_rules') && !wins.length) { page.append(GA.empty('flex', t('noFlex'), t('noFlexSub'))); return; }
    const seg = U.segmented({ label: t('viewL'), value: fx.tab, items: [{ value: 'map', label: t('fxLocations'), icon: 'map' }, { value: 'groups', label: t('fxGroups'), icon: 'hub' }, { value: 'booking', label: t('fxBooking'), icon: 'calendar' }, { value: 'windows', label: t('fxWindows'), icon: 'clock' }], onChange: (v) => { fx.tab = v; draw(); } });
    const body = h('div.tabbody'); page.append(seg.el, body);
    const draw = () => {
      body.textContent = '';
      if (fx.tab === 'map') {
        if (!f.geo) { body.append(missing('locations.geojson')); return; }
        const feats = f.geo.features || [], box = h('div.mapbox.tall'), info = h('div.card', null, h('p.sub', { text: t('flexPick') })); body.append(box, info); body.append(h('p.sub', { text: t('flexCount', { n: feats.length }) }));
        setTimeout(() => { const m = GV.map(box, t('fxLocations')); const polys = feats.map((ft, i) => { const g = ft.geometry || {}; let rings = []; if (g.type === 'Polygon') rings = [g.coordinates[0]]; else if (g.type === 'MultiPolygon') rings = g.coordinates.map((p) => p[0]); else if (g.type === 'Point') rings = [[g.coordinates]]; return { ft, rings: rings.filter(Boolean), id: ft.id || (ft.properties || {}).stop_id || String(i) }; }); let hl = -1; const all = [];
          const hue = (i) => `hsl(${(i * 67) % 360} 65% 45%)`; for (const p of polys) for (const r of p.rings) for (const c of r) all.push([c[1], c[0]]);
          m.addLayer((ctx) => { polys.forEach((p, i) => { ctx.fillStyle = hue(i); ctx.strokeStyle = hue(i); for (const r of p.rings) { ctx.beginPath(); r.forEach((c, k) => { const q = m.px(c[1], c[0]); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); if (r.length === 1) { const q = m.px(r[0][1], r[0][0]); ctx.arc(q[0], q[1], 7, 0, 7); } else ctx.closePath(); ctx.globalAlpha = i === hl ? 0.55 : 0.28; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = i === hl ? 3 : 1.8; ctx.stroke(); } }); });
          const inside = (x, y, r) => { let c = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const p = m.px(r[a][1], r[a][0]), q = m.px(r[b][1], r[b][0]); if ((p[1] > y) !== (q[1] > y) && x < (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]) + p[0]) c = !c; } return c; };
          m.onHit((x, y) => { for (let i = polys.length - 1; i >= 0; i--) for (const r of polys[i].rings) if (r.length === 1 ? Math.hypot(m.px(r[0][1], r[0][0])[0] - x, m.px(r[0][1], r[0][0])[1] - y) < 9 : inside(x, y, r)) return { i }; return null; });
          m.o.onClick = (hit) => { hl = hit ? hit.i : -1; m.redraw(); info.textContent = ''; if (!hit) { info.append(h('p.sub', { text: t('flexPick') })); return; } const p = polys[hit.i]; info.append(h('h3', { text: String(p.id) }), GA.kv(Object.entries(p.ft.properties || {}).map(([k, v]) => [k, String(v)])), h('p.sub', { text: (p.ft.geometry || {}).type })); };
          m.setHome(GV.boundsOf(all.length ? all : [[43.7, -79.4]])); }, 0);
      } else if (fx.tab === 'groups') { body.append(GA.card('location_groups.txt', f.has('location_groups') ? GA.dataTable('location_groups.txt') : missing('location_groups.txt')), GA.card('location_group_stops.txt', f.has('location_group_stops') ? GA.dataTable('location_group_stops.txt') : missing('location_group_stops.txt'))); }
      else if (fx.tab === 'booking') { body.append(f.has('booking_rules') ? GA.dataTable('booking_rules.txt') : missing('booking_rules.txt')); }
      else {
        if (!wins.length) { body.append(GA.empty('clock', t('noWindows'))); return; }
        const tripOf = (row) => { let lo = 0, hi = f.trips.length - 1; const ts0 = f.st.tripStart; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ts0[mid] <= row) lo = mid; else hi = mid - 1; } return lo; };
        const cols = [['trip', 140], ['seq', 60], ['stop', 200], ['location_id', 160], ['location_group_id', 160], ['start_pickup_drop_off_window', 130], ['end_pickup_drop_off_window', 130], ['pickup_booking_rule_id', 170], ['drop_off_booking_rule_id', 170]];
        const tbl = U.vtable({ label: t('fxWindows'), rowH: 36, columns: cols.map(([k, w]) => ({ key: k, label: k, width: w })), rows: () => wins, onRow: (r) => GA.go(GA.href('trip', f.trips[tripOf(r)].trip_id)), cell: (r, c) => { const ex = f.stExtra.get(r), ti = tripOf(r); if (c.key === 'trip') return f.trips[ti].trip_id; if (c.key === 'seq') return r - f.st.tripStart[ti] + 1; if (c.key === 'stop') { const s = f.stops[f.st.stop[r]]; return s ? f.stopName(s) : ''; } return GA.dataCell(c.key, ex[c.key]); } });
        body.append(h('div.vtwrap', null, tbl.el)); setTimeout(() => tbl.refresh(), 0);
      }
    }; draw();
  };

  // ---------- VALIDATION ----------
  const vs = { sev: 'all', code: '' };
  V.validation = (page) => {
    const f = GA.feed, v = GA.validation; page.append(h('h1.pg-t', { text: t('nav_validation') }));
    if (!v) { const p = U.progress(t('validating')); page.append(h('p', { text: t('validating') }), p.el); GA.onValProgress = (x) => p.set(x); return () => { GA.onValProgress = null; }; }
    const sevSeg = U.segmented({ label: t('severity'), value: vs.sev, items: [{ value: 'all', label: t('all') + ' ' + GA.n(v.errors + v.warnings) }, { value: 'error', label: t('errors') + ' ' + GA.n(v.errors), icon: 'error' }, { value: 'warning', label: t('warnings') + ' ' + GA.n(v.warnings), icon: 'warning' }], onChange: (x) => { vs.sev = x; refresh(); } });
    const chips = h('div.chips'); const codes = Object.entries(v.counts).sort((a, b) => (a[1].sev === 'error' ? 0 : 1) - (b[1].sev === 'error' ? 0 : 1) || b[1].n - a[1].n);
    const redoBtn = U.btn(t('revalidate'), { kind: 'text', icon: 'sync', onclick: () => GA.runValidation() });
    if (!codes.length) { page.append(h('div.ok', { html: U.icon('check', 28) + '<b>' + U.esc(t('noIssues')) + '</b>' }), redoBtn); return; }
    let rows = []; const count = h('p.sub.count', { 'aria-live': 'polite' }); let vl;
    const msg = (i) => t('v_' + i.code, { file: i.file, field: i.field || '', value: i.value || '', id: i.id || '', target: i.target || '', n: i.count || '', row: i.row || '', alt: i.alt || '' }).replace(/s+([.。])/g, '$1') + (i.count && i.code !== 'time_format' ? ' (' + GA.n(i.count) + ')' : '');
    const refresh = () => { rows = v.issues.filter((i) => (vs.sev === 'all' || i.sev === vs.sev) && (!vs.code || i.code === vs.code)); count.textContent = t('nResults', { n: GA.n(rows.length), m: GA.n(v.issues.length) }) + (v.errors + v.warnings > v.issues.length ? ' · ' + t('issuesCapped') : ''); vl.setCount(rows.length); };
    for (const [code, c] of codes) chips.append(U.filterChip(t('v_title_' + code), vs.code === code, (on) => { vs.code = on ? code : ''; chips.querySelectorAll('.chip').forEach((b) => { if (!on || b.textContent.indexOf(t('v_title_' + code)) < 0) { b.setAttribute('aria-pressed', 'false'); b.classList.remove('on'); } }); refresh(); }, { count: GA.n(c.n), icon: c.sev === 'error' ? 'error' : 'warning' }));
    vl = U.vlist({ label: t('nav_validation'), rowH: 64, id: 'vi', count: 0, render: (i) => { const x = rows[i]; const href = x.kind && x.id !== undefined && x.id !== '' ? GA.href({ trip: 'trip', stop: 'stop', route: 'route', shape: 'shape', service: 'service' }[x.kind] || 'data', x.id) : '#data/' + encodeURIComponent(x.file); const a = h('a', { class: 'issue ' + x.sev, href, tabindex: -1 }); a.append(h('span.is-ic', { html: U.icon(x.sev === 'error' ? 'error' : 'warning', 22) }), h('span.is-t', null, h('b', { text: msg(x) }), h('small', { text: x.file + (x.kind ? ' · ' + t('kind' + x.kind[0].toUpperCase() + x.kind.slice(1)) + ' ' + x.id : '') })), h('span.is-go', { html: U.icon('chevron_right', 22) })); return a; }, onActivate: (i) => { const x = rows[i]; if (x.kind && x.id) GA.go(GA.href({ trip: 'trip', stop: 'stop', route: 'route', shape: 'shape', service: 'service' }[x.kind] || 'data', x.id)); else GA.go('#data/' + encodeURIComponent(x.file)); } });
    page.append(h('div.stats', null, GA.stat(t('errors'), GA.n(v.errors)), GA.stat(t('warnings'), GA.n(v.warnings)), GA.stat(t('checkTypes'), GA.n(codes.length))), h('div.row.between', null, sevSeg.el, redoBtn), chips, count, h('div.listhost.tall', null, vl.el)); refresh();
  };

  // ---------- REALTIME ----------
  const rt = { tab: 'vehicles' };
  V.realtime = (page) => {
    const f = GA.feed; page.append(h('h1.pg-t', { text: t('nav_realtime') }), h('p.sub', { text: t('rtHelp') }));
    const bar = h('div.row.ctl', null, U.btn(t('rtOpenFile'), { kind: 'filled', icon: 'upload_file', onclick: () => { const i = h('input', { type: 'file', accept: '.pb,.bin,application/octet-stream', hidden: true }); i.addEventListener('change', async () => { if (i.files[0]) load(new Uint8Array(await i.files[0].arrayBuffer()), i.files[0].name); }); document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000); } }), U.btn(t('rtOpenUrl'), { kind: 'tonal', icon: 'link', onclick: () => { const inp = h('input', { type: 'text', class: 'field-in', 'aria-label': t('rtUrl'), placeholder: 'https://example.org/vehicle-positions.pb', style: { width: '100%' } }); U.dialog({ title: t('rtOpenUrl'), body: h('div', null, h('p.sub', { text: t('rtUrlHelp') }), inp), actions: [{ label: t('cancel') }, { label: t('open'), primary: true, onClick: async () => { try { const r = await fetch(inp.value.trim(), { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status); load(new Uint8Array(await r.arrayBuffer()), inp.value.trim().split('/').pop()); } catch (e) { U.snack(t('corsTitle') + ' · ' + e.message); } } }] }); setTimeout(() => inp.focus(), 30); } }), f ? U.btn(t('rtSample'), { kind: 'text', icon: 'sensors', onclick: () => sample() }) : null);
    page.append(bar); const body = h('div.tabbody'); page.append(body);
    function sample() { const date = GA.date, trips = f.tripsOn(date).slice(0, 25), veh = [], ups = []; trips.forEach((ti, k) => { const a = f.st.tripStart[ti], b = f.st.tripStart[ti + 1]; if (b - a < 2) return; const mid = a + Math.floor((b - a) / 2), s = f.stops[f.st.stop[mid]]; if (!s || !s.ok) return; veh.push({ tripId: f.trips[ti].trip_id, routeId: f.trips[ti].route_id, lat: s.lat, lon: s.lon, vid: 'S' + k, label: 'Sample ' + (k + 1), timestamp: 1 }); const delay = (k % 5 - 1) * 90; ups.push({ tripId: f.trips[ti].trip_id, delay, stops: [{ seq: mid - a + 1, stopId: s.stop_id, delay }] }); }); ups.push(...[]); const bytes = window.GtfsRt.build({ timestamp: Math.floor(Date.now() / 1000), vehicles: veh, updates: ups, alerts: [{ routeId: f.routes[0] ? f.routes[0].route_id : '', header: t('rtSampleAlert'), effect: 8 }] }); load(bytes, t('rtSampleName')); }
    function load(bytes, name) { try { GA.rt = Object.assign(window.GtfsRt.parse(bytes), { name }); U.snack(t('rtLoaded', { v: GA.rt.vehicles.length, u: GA.rt.updates.length, a: GA.rt.alerts.length })); draw(); } catch (e) { U.snack(t('rtBad', { m: e.message })); } }
    GA.loadRealtime = load;
    const seg = U.segmented({ label: t('viewL'), value: rt.tab, items: [{ value: 'vehicles', label: t('rtVehicles'), icon: 'bus' }, { value: 'updates', label: t('rtUpdates'), icon: 'clock' }, { value: 'alerts', label: t('rtAlerts'), icon: 'warning' }], onChange: (v) => { rt.tab = v; draw(); } }); page.insertBefore(seg.el, body);
    function draw() {
      body.textContent = ''; const r = GA.rt; if (!r) { body.append(GA.empty('sensors', t('rtNone'), t('rtNoneSub'))); return; }
      body.append(h('p.sub', { text: (r.name || '') + (r.timestamp ? ' · ' + new Date(r.timestamp * 1000).toLocaleString(U.locale()) : '') }));
      if (rt.tab === 'vehicles') {
        const box = h('div.mapbox.tall'); body.append(box); const list = h('div.chips'); r.vehicles.slice(0, 80).forEach((v0) => { const ri = f.routeIx.get(v0.routeId); const a = h('a', { class: 'rchip', href: v0.tripId ? GA.href('trip', v0.tripId) : '#realtime' }); if (ri !== undefined) a.append(GA.badge(f.routes[ri])); a.append(h('span', { text: v0.label || v0.vid || v0.id })); list.append(a); }); body.append(list);
        setTimeout(() => { const m = GV.map(box, t('rtVehicles')); const vs0 = r.vehicles.filter((v0) => Number.isFinite(v0.lat)); m.addLayer((ctx) => { for (const v0 of vs0) { const ri = f.routeIx.get(v0.routeId), col = ri === undefined ? '#5F6368' : f.routeColor(f.routes[ri]), p = m.px(v0.lat, v0.lon); ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke(); if (v0.bearing !== undefined) { ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(v0.bearing * Math.PI / 180); ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(5, -8); ctx.lineTo(-5, -8); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.restore(); } } }); m.onHit((x, y) => vs0.find((v0) => { const p = m.px(v0.lat, v0.lon); return Math.hypot(p[0] - x, p[1] - y) < 12; }) || null); m.o.onClick = (v0) => { if (v0 && v0.tripId) GA.go(GA.href('trip', v0.tripId)); }; m.o.onHover = (v0) => { box.title = v0 ? (v0.label || v0.vid) : ''; }; m.setHome(GV.boundsOf(vs0.length ? vs0.map((v0) => [v0.lat, v0.lon]) : [[43.7, -79.4]])); }, 0);
      } else if (rt.tab === 'updates') {
        const tbl = U.vtable({ label: t('rtUpdates'), rowH: 38, rows: () => r.updates, columns: [{ key: 'trip', label: t('kindTrip'), width: 220 }, { key: 'route', label: t('route'), width: 140 }, { key: 'delay', label: t('delayL'), width: 110, num: true }, { key: 'stops', label: t('stopUpdates'), width: 120, num: true }], onRow: (u) => { if (f.tripIx.has(u.tripId)) GA.go(GA.href('trip', u.tripId)); }, cell: (u, c) => c.key === 'trip' ? u.tripId : c.key === 'route' ? (f.label('route', u.routeId) || u.routeId) : c.key === 'delay' ? (u.delay === undefined ? '' : (u.delay >= 0 ? '+' : '') + Math.round(u.delay / 6) / 10 + ' ' + t('minLc')) : u.stops.length, sortValue: (u, c) => c.key === 'delay' ? (u.delay || 0) : c.key === 'stops' ? u.stops.length : u.tripId });
        body.append(h('div.vtwrap', null, tbl.el)); setTimeout(() => tbl.refresh(), 0);
      } else {
        if (!r.alerts.length) { body.append(GA.empty('info', t('rtNoAlerts'))); return; }
        for (const a of r.alerts) { const pick = (l) => (l.find((x) => x.lang === (GA.prefs.lang === 'yue' ? 'zh' : 'en')) || l[0] || {}).text || ''; body.append(GA.card(pick(a.header) || a.id, h('p', { text: pick(a.description) }), h('p.sub', { text: a.entities.map((e) => e.routeId ? f.label('route', e.routeId) || e.routeId : e.stopId || e.tripId || e.agencyId).filter(Boolean).join(', ') }))); }
      }
    }
    draw();
  };

  // ---------- DATA ----------
  V.data = (page, { args }) => {
    const f = GA.feed; const names = Object.keys(f.files).sort(); const cur = args[0] && f.files[args[0]] ? args[0] : (f.files['routes.txt'] ? 'routes.txt' : names[0]);
    const list = h('div.listpane'); const chips = h('div.files.col'); for (const n of names) { const a = h('a', { class: 'file-c' + (n === cur ? ' cur' : ''), href: '#data/' + encodeURIComponent(n) }); a.innerHTML = `<b>${U.esc(n)}</b><span>${GA.n(f.files[n].rows)} ${U.esc(t('rowsLc'))}${/\.txt$/.test(n) && !(n.replace('.txt', '') in f.T) && !['stop_times.txt', 'shapes.txt'].includes(n) ? '' : ''}</span>`; chips.append(a); } list.append(chips);
    const detail = h('div.detail'); detail.append(h('header.dh', null, h('div.dh-t', null, h('h2', { text: cur }), h('p.sub', { text: GA.n(f.files[cur].rows) + ' ' + t('rowsLc') + ' · ' + (f.files[cur].bytes > 1048576 ? (f.files[cur].bytes / 1048576).toFixed(1) + ' MB' : Math.round(f.files[cur].bytes / 1024) + ' KB') + ((f.cols[cur] || []).length ? ' · ' + (f.cols[cur] || []).length + ' ' + t('columnsLc') : '') })), GV.backBtn('#data', t('nav_data'))));
    const st = f.st;
    if (cur === 'stop_times.txt') {
      const tripOf = (r) => { let lo = 0, hi = f.trips.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (st.tripStart[mid] <= r) lo = mid; else hi = mid - 1; } return lo; };
      const cols = [['trip_id', 160], ['arrival_time', 110], ['departure_time', 110], ['stop_id', 200], ['stop_sequence', 100], ['pickup_type', 140], ['drop_off_type', 140], ['timepoint', 110], ['shape_dist_traveled', 150], ['other', 300]];
      // stop_times can hold millions of rows: show a windowed view without building a row array
      const wrap = h('div.vt', { role: 'grid', 'aria-label': cur }); wrap.textContent = ''; const head = h('div.vt-h'), bodyEl = h('div.vt-b', { tabindex: 0 }), sp = h('div.vt-sp'), win = h('div.vt-w'); bodyEl.append(sp, win); wrap.append(head, bodyEl); const tw = cols.reduce((n, c) => n + c[1], 0); head.style.width = tw + 'px'; sp.style.width = tw + 'px'; sp.style.height = st.n * 34 + 'px'; cols.forEach(([k, w]) => head.append(h('div.vt-th', { style: { width: w + 'px' } }, h('span.vt-sort', { text: k }))));
      const draw = () => { const a = Math.max(0, Math.floor(bodyEl.scrollTop / 34) - 3), b = Math.min(st.n, Math.ceil((bodyEl.scrollTop + bodyEl.clientHeight) / 34) + 3); win.style.transform = `translateY(${a * 34}px)`; win.style.width = tw + 'px'; win.textContent = ''; for (let r = a; r < b; r++) { const ti = tripOf(r), ex = f.stExtra.get(r) || {}, fl = st.flags[r], s = f.stops[st.stop[r]]; const vals = [f.trips[ti].trip_id, fmt(st.arr[r], true), fmt(st.dep[r], true), s ? s.stop_id : (ex.stop_id || ''), r - st.tripStart[ti] + 1, String(fl & 3), String(fl >> 2 & 3), ['', '0', '1'][fl >> 4 & 3], Number.isNaN(st.dist[r]) ? '' : st.dist[r], Object.entries(ex).map(([k, v]) => k + '=' + v).join('; ')]; const row = h('div.vt-r', { style: { height: '34px' } }); vals.forEach((v, i) => { const td = h('div.vt-td', { style: { width: cols[i][1] + 'px' } }); td.textContent = v; td.title = String(v); row.append(td); }); win.append(row); } head.style.transform = `translateX(${-bodyEl.scrollLeft}px)`; };
      bodyEl.addEventListener('scroll', draw, { passive: true }); new ResizeObserver(draw).observe(wrap); detail.append(h('p.sub', { text: t('stopTimesVirtual') }), h('div.vtwrap', null, wrap)); setTimeout(draw, 0);
    } else if (cur === 'shapes.txt' && f.shapes) {
      const S = f.shapes, n = S.lat.length; const idOf = (r) => { let lo = 0, hi = S.ids.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S.start[mid] <= r) lo = mid; else hi = mid - 1; } return lo; };
      const cols = [['shape_id', 160], ['shape_pt_lat', 130], ['shape_pt_lon', 130], ['shape_pt_sequence', 140], ['shape_dist_traveled', 150]]; const tw = cols.reduce((x, c) => x + c[1], 0);
      const wrap = h('div.vt'), head = h('div.vt-h'), bodyEl = h('div.vt-b', { tabindex: 0 }), sp = h('div.vt-sp'), win = h('div.vt-w'); bodyEl.append(sp, win); wrap.append(head, bodyEl); head.style.width = tw + 'px'; sp.style.height = n * 34 + 'px'; sp.style.width = tw + 'px'; cols.forEach(([k, w]) => head.append(h('div.vt-th', { style: { width: w + 'px' } }, h('span.vt-sort', { text: k }))));
      const draw = () => { const a = Math.max(0, Math.floor(bodyEl.scrollTop / 34) - 3), b = Math.min(n, Math.ceil((bodyEl.scrollTop + bodyEl.clientHeight) / 34) + 3); win.style.transform = `translateY(${a * 34}px)`; win.style.width = tw + 'px'; win.textContent = ''; for (let r = a; r < b; r++) { const si = idOf(r); const vals = [S.ids[si], S.lat[r], S.lon[r], S.seq[r], Number.isNaN(S.dist[r]) ? '' : S.dist[r]]; const row = h('div.vt-r', { style: { height: '34px' } }); vals.forEach((v, i) => { const td = h('div.vt-td', { style: { width: cols[i][1] + 'px' } }); td.textContent = v; row.append(td); }); win.append(row); } head.style.transform = `translateX(${-bodyEl.scrollLeft}px)`; };
      bodyEl.addEventListener('scroll', draw, { passive: true }); new ResizeObserver(draw).observe(wrap); detail.append(h('div.vtwrap', null, wrap)); setTimeout(draw, 0);
    }
    else if (/\.geojson$/.test(cur) || cur === 'locations.json') { detail.append(h('pre.raw', { text: JSON.stringify(f.geo, null, 1).slice(0, 200000) })); }
    else if (cur.replace(/\.txt$/, '') in f.T) detail.append(GA.dataTable(cur));
    else detail.append(GA.empty('info', t('rawNotText', { f: cur })));
    page.append(GV.split(list, detail, !!args[0]));
  };
})();
