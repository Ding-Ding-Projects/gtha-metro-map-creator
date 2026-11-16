// mod-journey.js: see docs/features/journey.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const I = window.I18N;
  let C = null; // window.GMMC, set by the ready hook

  I.add({
    jyTitle: 'Plan a trip', jyFrom: 'From', jyTo: 'To', jyBand: 'Time of day', jyPeak: 'Peak', jyMidday: 'Midday', jyEvening: 'Evening', jyWeekend: 'Weekend',
    jyMin: 'min', jyChange: 'change', jyChanges: 'changes', jyDirect: 'No change', jyEstimate: 'estimate', jyWait: 'Wait about', jyRide: 'ride',
    jyStop: 'stop', jyStops: 'stops', jyTowards: 'towards', jyChangeAt: 'Change', jyWalkTo: 'Walk to', jyArrive: 'Arrive',
    jyShowTimes: 'Show travel times from', jyHideTimes: 'Hide travel times', jyMinutesFrom: 'Minutes from', jyNoRoute: 'No route found between these stations',
    jyPickBoth: 'Choose two stations to plan a trip', jyUnknown: 'Station not found', jyClose: 'Close'
  }, {
    jyTitle: '規劃行程', jyFrom: '由', jyTo: '去', jyBand: '時段', jyPeak: '繁忙時段', jyMidday: '日間', jyEvening: '晚間', jyWeekend: '週末',
    jyMin: '分鐘', jyChange: '次轉乘', jyChanges: '次轉乘', jyDirect: '免轉乘', jyEstimate: '估算', jyWait: '候車約', jyRide: '車程',
    jyStop: '個站', jyStops: '個站', jyTowards: '往', jyChangeAt: '轉車', jyWalkTo: '步行去', jyArrive: '到達',
    jyShowTimes: '顯示所需時間，起點：', jyHideTimes: '隱藏所需時間', jyMinutesFrom: '由呢度出發嘅分鐘數：', jyNoRoute: '呢兩個車站之間搵唔到路線',
    jyPickBoth: '請揀兩個車站嚟規劃行程', jyUnknown: '搵唔到車站', jyClose: '關閉'
  });
  const t = (k) => I.t(k);

  // ---------- model ----------
  const SPEED = { solid: 32, rail: 55, brt: 24, bus: 18, express: 32 * 1.3, superExpress: 32 * 1.6, dashed: 30 };
  const BANDS = ['peak', 'midday', 'evening', 'weekend'];
  const GRID_KM = 0.9, WALK_KMH = 4.8, WALK_MIN = 2, NEAR_M = 400, CHANGE_MIN = 3, DWELL_MIN = 0.4, DEFAULT_HEADWAY = 10;
  const COLORS = [[15, '#1B7F3B'], [30, '#7CB342'], [45, '#F9A825'], [60, '#E65100'], [Infinity, '#B71C1C']];
  const colorFor = (m) => COLORS.find((c) => m <= c[0])[1];

  function haversine(a, b) {
    const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function distKm(a, b) {
    if (a.lat !== undefined && b.lat !== undefined) return haversine(a, b);
    return Math.hypot(a.x - b.x, a.y - b.y) * GRID_KM;
  }
  const pos = (v) => (v > 0 ? v : null);
  function headway(line, band) {
    const f = line.freq || {};
    const mid = pos(f.midday) ?? pos(f.offpeak);
    let h = null;
    if (band === 'peak') h = pos(f.peak);
    else if (band === 'midday') h = mid;
    else if (band === 'evening') h = pos(f.evening) ?? (mid !== null ? mid * 1.3 : null);
    else h = pos(f.weekend) ?? mid;
    return h ?? DEFAULT_HEADWAY;
  }

  /** Min-heap of [cost, node]. */
  function Heap() {
    const a = [];
    return {
      get size() { return a.length; },
      push(c, v) {
        let i = a.push([c, v]) - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
      },
      pop() {
        const top = a[0], last = a.pop();
        if (a.length) {
          a[0] = last; let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = l + 1; let m = i;
            if (l < a.length && a[l][0] < a[m][0]) m = l;
            if (r < a.length && a[r][0] < a[m][0]) m = r;
            if (m === i) break;
            [a[m], a[i]] = [a[i], a[m]]; i = m;
          }
        }
        return top;
      }
    };
  }

  /** States: station (origin) 0..n-1, arrived by vehicle n..2n-1, arrived on foot 2n..3n-1, then one per stop of each line. */
  function build(map, band) {
    const ids = Object.keys(map.stations), idx = {};
    ids.forEach((id, i) => { idx[id] = i; });
    const n = ids.length, lines = [], lnOf = [], pOf = [];
    let total = 3 * n;
    for (const l of map.lines) {
      if (l.visible === false) continue;
      const stops = [];
      l.path.forEach((r, pi) => {
        if (r[0] === '@' || idx[r] === undefined) return;
        if (stops.length && stops[stops.length - 1].id === r) return;
        stops.push({ id: r, i: idx[r], pi, ok: !(Array.isArray(l.skip) && l.skip.includes(r)) });
      });
      if (stops.length < 2) continue;
      const speed = SPEED[l.style] || SPEED.solid;
      const seg = [];
      for (let k = 0; k < stops.length - 1; k++) seg.push(distKm(map.stations[stops[k].id], map.stations[stops[k + 1].id]) / speed * 60 + DWELL_MIN);
      const li = lines.length;
      lines.push({ l, stops, base: total, hw: headway(l, band), seg, oneWay: !!l.oneWay });
      for (let p = 0; p < stops.length; p++) { lnOf.push(li); pOf.push(p); }
      total += stops.length;
    }
    const boards = ids.map(() => []), walkMap = new Map();
    lines.forEach((ln, li) => ln.stops.forEach((s, p) => { if (s.ok) boards[s.i].push([li, p]); }));
    const addWalk = (a, b, min) => {
      for (const [x, y] of [[a, b], [b, a]]) { const k = x * n + y, old = walkMap.get(k); if (old === undefined || min < old) walkMap.set(k, min); }
    };
    const walkMin = (km) => Math.max(WALK_MIN, km / WALK_KMH * 60);
    for (const tr of (map.transfers || [])) {
      if (idx[tr.a] === undefined || idx[tr.b] === undefined || tr.a === tr.b) continue;
      addWalk(idx[tr.a], idx[tr.b], walkMin(distKm(map.stations[tr.a], map.stations[tr.b])));
    }
    // Any two served stations within 400 m of each other, from real coordinates.
    const served = ids.filter((id, i) => boards[i].length && map.stations[id].lat !== undefined).sort((a, b) => map.stations[a].lat - map.stations[b].lat);
    const dLat = NEAR_M / 111320;
    for (let a = 0; a < served.length; a++) {
      const A = map.stations[served[a]];
      for (let b = a + 1; b < served.length; b++) {
        const B = map.stations[served[b]];
        if (B.lat - A.lat > dLat) break;
        const km = haversine(A, B);
        if (km * 1000 <= NEAR_M) addWalk(idx[served[a]], idx[served[b]], walkMin(km));
      }
    }
    const walks = ids.map(() => []);
    for (const [k, m] of walkMap) walks[Math.floor(k / n)].push([k % n, m]);
    return { ids, idx, n, lines, lnOf, pOf, boards, walks, total };
  }

  function search(Gr, fromId, stopAt) {
    const { n, lines, lnOf, pOf, boards, walks, total } = Gr;
    const dist = new Float64Array(total).fill(Infinity), prev = new Int32Array(total).fill(-1);
    const src = Gr.idx[fromId];
    if (src === undefined) return { dist, prev };
    const h = Heap();
    dist[src] = 0; h.push(0, src);
    const relax = (u, v, c) => { const nd = dist[u] + c; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; h.push(nd, v); } };
    while (h.size) {
      const [c, u] = h.pop();
      if (c > dist[u]) continue;
      if (stopAt !== undefined && (u === n + stopAt || u === 2 * n + stopAt || u === stopAt)) break;
      if (u < 3 * n) {
        const i = u % n, kind = Math.floor(u / n); // 0 origin, 1 by vehicle, 2 on foot
        const extra = kind === 1 ? CHANGE_MIN : 0;
        for (const [li, p] of boards[i]) relax(u, lines[li].base + p, extra + lines[li].hw / 2);
        if (kind < 2) for (const [j, m] of walks[i]) relax(u, 2 * n + j, m);
      } else {
        const li = lnOf[u - 3 * n], p = pOf[u - 3 * n], ln = lines[li], s = ln.stops[p];
        if (p + 1 < ln.stops.length) relax(u, ln.base + p + 1, ln.seg[p]);
        if (p > 0 && !ln.oneWay) relax(u, ln.base + p - 1, ln.seg[p - 1]);
        if (s.ok) relax(u, n + s.i, 0);
      }
    }
    return { dist, prev };
  }

  function legsTo(Gr, res, destIdx) {
    const { n, lines, lnOf, pOf, ids } = Gr, { dist, prev } = res;
    let end = -1, best = Infinity;
    for (const v of [destIdx, n + destIdx, 2 * n + destIdx]) if (dist[v] < best) { best = dist[v]; end = v; }
    if (end < 0) return null;
    const chain = [];
    for (let v = end; v !== -1; v = prev[v]) chain.push(v);
    chain.reverse();
    const kind = (v) => (v >= 3 * n ? 3 : Math.floor(v / n));
    const legs = [];
    let cur = null;
    for (let k = 1; k < chain.length; k++) {
      const u = chain[k - 1], v = chain[k], tu = kind(u), tv = kind(v);
      if (tv === 3 && tu !== 3) {
        const li = lnOf[v - 3 * n], p = pOf[v - 3 * n], ln = lines[li];
        cur = { type: 'ride', lineId: ln.l.id, color: ln.l.color, from: ln.stops[p].id, p0: p, p1: p, wait: ln.hw / 2, change: tu === 1 ? CHANGE_MIN : 0, t0: dist[v], t1: dist[v], via: [ln.stops[p].id], li };
      } else if (tv === 3 && tu === 3) {
        const p = pOf[v - 3 * n]; cur.p1 = p; cur.via.push(lines[cur.li].stops[p].id); cur.t1 = dist[v];
      } else if (tu === 3 && tv === 1) {
        const ln = lines[cur.li];
        cur.to = ln.stops[cur.p1].id;
        cur.minutes = cur.t1 - cur.t0;
        cur.stops = Math.abs(cur.p1 - cur.p0);
        cur.dirTo = ln.stops[cur.p1 >= cur.p0 ? ln.stops.length - 1 : 0].id;
        cur.piFrom = ln.stops[cur.p0].pi; cur.piTo = ln.stops[cur.p1].pi;
        legs.push(cur); cur = null;
      } else if (tv === 2) {
        legs.push({ type: 'walk', from: ids[u % n], to: ids[v % n], minutes: dist[v] - dist[u] });
      }
    }
    const rides = legs.filter((l) => l.type === 'ride').length;
    return { total: best, legs, changes: Math.max(0, rides - 1) };
  }

  function plan(fromId, toId, band) {
    const map = C ? C.getMap() : null;
    band = BANDS.includes(band) ? band : 'peak';
    if (!map || !map.stations[fromId] || !map.stations[toId]) return { ok: false, reason: 'unknown', band };
    if (fromId === toId) return { ok: true, from: fromId, to: toId, band, total: 0, changes: 0, legs: [] };
    const Gr = build(map, band);
    const r = legsTo(Gr, search(Gr, fromId, Gr.idx[toId]), Gr.idx[toId]);
    if (!r || !r.legs.length) return { ok: false, reason: 'none', from: fromId, to: toId, band };
    r.legs.forEach((l) => { delete l.li; delete l.t0; delete l.t1; });
    return Object.assign({ ok: true, from: fromId, to: toId, band }, r);
  }

  function times(fromId, band) {
    const map = C ? C.getMap() : null;
    band = BANDS.includes(band) ? band : 'peak';
    if (!map || !map.stations[fromId]) return {};
    const Gr = build(map, band), res = search(Gr, fromId), out = {};
    Gr.ids.forEach((id, i) => {
      const m = Math.min(res.dist[i], res.dist[Gr.n + i], res.dist[2 * Gr.n + i]);
      if (Number.isFinite(m)) out[id] = Math.round(m * 10) / 10;
    });
    return out;
  }
  window.GMMCJourney = { plan, times };

  // ---------- state and panel ----------
  const J = { open: false, from: '', to: '', fromText: '', toText: '', band: 'peak', trip: null, times: null, err: '', sig: '', lang: '', timer: 0 };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, s) => (window.icon ? window.icon(n, s) : '');

  function stName(id) {
    const s = C.getMap().stations[id]; if (!s) return id;
    const lang = I.getLang();
    if (lang === 'yue') return s.nameZh || s.name;
    if (lang === 'both' && s.nameZh) return s.name + ' · ' + s.nameZh;
    return s.name;
  }
  function resolve(text) {
    text = String(text || '').trim().toLowerCase();
    if (!text) return '';
    const sts = Object.values(C.getMap().stations);
    const exact = sts.filter((s) => s.name.toLowerCase() === text || (s.nameZh && s.nameZh === text) || (s.nameZh && (s.name + ' · ' + s.nameZh).toLowerCase() === text));
    if (exact.length) return (exact.find((s) => s.kind !== 'stop') || exact[0]).id;
    const part = sts.filter((s) => s.name.toLowerCase().includes(text) || (s.nameZh && s.nameZh.includes(text)));
    return part.length === 1 ? part[0].id : '';
  }
  function signature() {
    const m = C.getMap();
    return [C.isGeo() ? 'g' : 's', Object.keys(m.stations).length, (m.transfers || []).length,
      m.lines.map((l) => l.id + (l.visible ? '1' : '0') + l.path.join(',') + (l.freq ? [l.freq.peak, l.freq.offpeak, l.freq.midday, l.freq.evening, l.freq.weekend].join('/') : '')).join('|')].join('#');
  }

  function shell() {
    const host = $('jy'); if (!host) return;
    const bandBtns = BANDS.map((b) => `<button type="button" data-band="${b}" aria-pressed="${J.band === b}">${esc(t('jy' + b[0].toUpperCase() + b.slice(1)))}</button>`).join('');
    host.innerHTML = `<button type="button" class="jy-head" id="jyToggle" aria-expanded="${J.open}" aria-controls="jyBody">${icon('route', 20)}<span>${esc(t('jyTitle'))}</span><span class="jy-chev">${icon('arrow_drop_down', 24)}</span></button>
      <div class="jy-body" id="jyBody"${J.open ? '' : ' hidden'}>
        <label class="tf"><span class="tf-label">${esc(t('jyFrom'))}</span><input id="jyFrom" list="jyStations" autocomplete="off" spellcheck="false" value="${esc(J.from ? stName(J.from) : J.fromText)}"></label>
        <label class="tf"><span class="tf-label">${esc(t('jyTo'))}</span><input id="jyTo" list="jyStations" autocomplete="off" spellcheck="false" value="${esc(J.to ? stName(J.to) : J.toText)}"></label>
        <div class="segmented jy-seg" role="group" aria-label="${esc(t('jyBand'))}">${bandBtns}</div>
        <div id="jyResult" aria-live="polite"></div>
      </div>`;
    J.lang = I.getLang();
    result();
  }
  function fillList() {
    let dl = $('jyStations');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'jyStations'; document.body.appendChild(dl); }
    const yue = I.getLang() === 'yue';
    dl.innerHTML = Object.values(C.getMap().stations).sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => `<option value="${esc(yue && s.nameZh ? s.nameZh : s.name)}"${s.nameZh && !yue ? ` label="${esc(s.nameZh)}"` : ''}></option>`).join('');
  }

  const fmt = (m) => Math.max(1, Math.round(m));
  function result() {
    const box = $('jyResult'); if (!box) return;
    let html = '';
    const trip = J.trip;
    if (J.err) html += `<p class="jy-msg err">${esc(J.err)}</p>`;
    else if (!J.from || !J.to) html += `<p class="jy-msg">${esc(t('jyPickBoth'))}</p>`;
    else if (trip && !trip.ok) html += `<p class="jy-msg err">${esc(t('jyNoRoute'))}</p>`;
    else if (trip) {
      const ch = trip.changes === 0 ? t('jyDirect') : trip.changes + ' ' + (trip.changes === 1 ? t('jyChange') : t('jyChanges'));
      html += `<div class="jy-total"><span class="jy-big">${trip.total ? fmt(trip.total) : 0} ${esc(t('jyMin'))}</span><span class="jy-sub">${esc(ch)} · ${esc(t('jyEstimate'))}</span></div><ol class="jy-steps">`;
      const rows = [];
      trip.legs.forEach((leg, k) => {
        const next = trip.legs[k + 1];
        if (leg.type === 'ride') {
          const line = C.lineById(leg.lineId);
          const wait = `${esc(t('jyWait'))} ${fmt(leg.wait)} ${esc(t('jyMin'))} · `;
          rows.push({ color: leg.color, head: esc(stName(leg.from)), body: [`<span class="jy-chip" style="--c:${esc(leg.color)}">${esc(line ? C.lineName(line) : leg.lineId)}</span> ${esc(t('jyTowards'))} ${esc(stName(leg.dirTo))}`, `${wait}${fmt(leg.minutes)} ${esc(t('jyMin'))} ${esc(t('jyRide'))} · ${leg.stops} ${esc(leg.stops === 1 ? t('jyStop') : t('jyStops'))}`] });
          if (!next) rows.push({ head: esc(stName(leg.to)), body: [esc(t('jyArrive'))] });
          else if (next.type === 'ride') rows.push({ head: esc(stName(leg.to)), body: [`${esc(t('jyChangeAt'))}, ${fmt(next.change)} ${esc(t('jyMin'))}`] });
          else rows.push({ head: esc(stName(leg.to)), body: [] });
        } else {
          rows.push({ walk: true, head: `${esc(t('jyWalkTo'))} ${esc(stName(leg.to))}`, body: [`${fmt(leg.minutes)} ${esc(t('jyMin'))}`] });
          if (!next) rows.push({ head: esc(stName(leg.to)), body: [esc(t('jyArrive'))] });
        }
      });
      html += rows.map((r) => `<li style="--c:${esc(r.color || 'var(--md-outline)')}" class="${r.color ? 'ride' : ''}${r.walk ? ' walk' : ''}"><span class="jy-node"></span><div><b>${r.head}</b>${r.body.map((b) => `<div class="jy-line">${b}</div>`).join('')}</div></li>`).join('');
      html += '</ol>';
    }
    if (J.from) html += `<button type="button" class="btn tonal jy-times" id="jyTimes" aria-pressed="${!!J.times}">${icon('schedule', 18)}<span>${esc(J.times ? t('jyHideTimes') : t('jyShowTimes') + ' ' + stName(J.from))}</span></button>`;
    box.innerHTML = html;
    legend();
  }

  function legend() {
    const stage = $('stage'); if (!stage) return;
    let el = $('jyLegend');
    if (!el) { el = document.createElement('div'); el.id = 'jyLegend'; el.className = 'jy-legend'; el.hidden = true; stage.appendChild(el); }
    if (!J.times) { el.hidden = true; return; }
    const dots = [['15', 15], ['30', 30], ['45', 45], ['60', 60], ['60+', 61]].map(([lab, v]) => `<span class="jy-lg"><i style="background:${colorFor(v)}"></i>${lab}</span>`).join('');
    el.innerHTML = `<span class="jy-lg-title">${esc(t('jyMinutesFrom'))} ${esc(stName(J.times.from))}</span>${dots}<button type="button" class="icon-btn jy-close" id="jyLegendClose" aria-label="${esc(t('jyClose'))}">${icon('close', 20)}</button>`;
    el.hidden = false;
  }

  function recompute() {
    J.sig = signature();
    const m = C.getMap();
    if (J.from && !m.stations[J.from]) J.from = '';
    if (J.to && !m.stations[J.to]) J.to = '';
    J.trip = J.from && J.to ? plan(J.from, J.to, J.band) : null;
    if (J.times) J.times = J.from ? { from: J.from, band: J.band, minutes: times(J.from, J.band) } : null;
  }
  function refresh() { recompute(); result(); C.render(); }

  function onInput(e) {
    const id = e.target.id;
    if (id !== 'jyFrom' && id !== 'jyTo') return;
    const key = id === 'jyFrom' ? 'from' : 'to', st = resolve(e.target.value);
    J[key] = st; J[key + 'Text'] = e.target.value;
    J.err = e.target.value.trim() && !st && e.type === 'change' ? t('jyUnknown') : '';
    refresh();
  }
  function onClick(e) {
    const b = e.target.closest && e.target.closest('[data-band],#jyToggle,#jyTimes,#jyLegendClose');
    if (!b) return;
    if (b.id === 'jyToggle') {
      J.open = !J.open; b.setAttribute('aria-expanded', J.open);
      const body = $('jyBody'); if (body) body.hidden = !J.open;
      return;
    }
    if (b.dataset.band) { J.band = b.dataset.band; document.querySelectorAll('.jy-seg button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.band === J.band)); refresh(); return; }
    if (b.id === 'jyTimes') { J.times = J.times ? null : (J.from ? { from: J.from, band: J.band, minutes: times(J.from, J.band) } : null); result(); C.render(); return; }
    if (b.id === 'jyLegendClose') { J.times = null; result(); C.render(); }
  }

  // ---------- map overlay ----------
  X.svgOver = X.svgOver || [];
  X.svgOver.push(function (m, ctx) {
    if (!C) return '';
    const G = ctx.G;
    let out = '';
    const trip = J.trip;
    if (trip && trip.ok && trip.legs.length) {
      let halo = '', marks = '';
      const geo = ctx.geo || [];
      for (const leg of trip.legs) {
        if (leg.type === 'ride') {
          const g = geo.find((x) => x.line.id === leg.lineId);
          if (!g) continue;
          const lo = Math.min(leg.piFrom, leg.piTo), hi = Math.max(leg.piFrom, leg.piTo);
          for (const e of g.edges) {
            if (e.index < lo || e.index >= hi) continue;
            const pts = e.pts.map((p) => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
            halo += `<polyline points="${pts}" fill="none" stroke="#FFFFFF" stroke-opacity=".85" stroke-width="${g.line.width + 14}" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${pts}" fill="none" stroke="${leg.color}" stroke-width="${g.line.width + 6}" stroke-linecap="round" stroke-linejoin="round"/>`;
          }
        } else {
          const a = m.stations[leg.from], b = m.stations[leg.to];
          if (a && b) halo += `<line x1="${a.x * G}" y1="${a.y * G}" x2="${b.x * G}" y2="${b.y * G}" stroke="#16181D" stroke-width="6" stroke-dasharray="2 9" stroke-linecap="round"/>`;
        }
      }
      const stops = [];
      trip.legs.forEach((leg) => { stops.push(leg.from, leg.to); });
      [...new Set(stops)].forEach((id) => {
        const s = m.stations[id]; if (!s) return;
        const end = id === trip.from || id === trip.to;
        marks += `<circle cx="${s.x * G}" cy="${s.y * G}" r="${end ? 11 : 8}" fill="#FFFFFF" stroke="#16181D" stroke-width="${end ? 5 : 4}"/>`;
      });
      out += `<g class="jy-trip" pointer-events="none">${halo}${marks}</g>`;
    }
    if (J.times) {
      let dots = '';
      for (const [id, min] of Object.entries(J.times.minutes)) {
        const s = m.stations[id]; if (!s) continue;
        dots += `<circle cx="${s.x * G}" cy="${s.y * G}" r="${id === J.times.from ? 13 : 8}" fill="${colorFor(min)}" fill-opacity=".92" stroke="#FFFFFF" stroke-width="2"><title>${esc(stName(id))}: ${Math.round(min)} ${esc(t('jyMin'))}</title></circle>`;
      }
      out += `<g class="jy-times" pointer-events="none">${dots}</g>`;
      if (!ctx.opts || !ctx.opts.editor) {
        const sts = Object.values(m.stations);
        if (sts.length) {
          const x0 = Math.min(...sts.map((s) => s.x)) * G, y1 = Math.max(...sts.map((s) => s.y)) * G + 60;
          const items = [['15', 15], ['30', 30], ['45', 45], ['60', 60], ['60+', 61]].map(([lab, v], k) => `<circle cx="${x0 + 420 + k * 70}" cy="${y1}" r="10" fill="${colorFor(v)}"/><text x="${x0 + 436 + k * 70}" y="${y1 + 5}" font-size="16" fill="#16181D">${lab}</text>`).join('');
          out += `<g class="jy-export-legend"><text x="${x0}" y="${y1 + 5}" font-size="18" font-weight="700" fill="#16181D">${esc(t('jyMinutesFrom'))} ${esc(stName(J.times.from))}</text>${items}</g>`;
        }
      }
    }
    return out;
  });

  X.afterRender = X.afterRender || [];
  X.afterRender.push(function () {
    if (!C || !$('jy')) return;
    if (J.lang !== I.getLang()) { fillList(); shell(); }
    if ((J.trip || J.times || J.from) && signature() !== J.sig) {
      clearTimeout(J.timer);
      J.timer = setTimeout(() => { if (signature() !== J.sig) { fillList(); refresh(); } }, 250);
    }
  });

  X.ready = X.ready || [];
  X.ready.push(function (gmmc) {
    C = gmmc;
    const right = document.querySelector('.panel.right');
    if (!right) return;
    const sec = document.createElement('section');
    sec.id = 'jy'; sec.className = 'jy';
    right.insertBefore(sec, right.querySelector('h2') || $('inspector'));
    fillList();
    shell();
    J.sig = signature();
    sec.addEventListener('input', onInput);
    sec.addEventListener('change', onInput);
    document.addEventListener('click', onClick);
  });
})();
