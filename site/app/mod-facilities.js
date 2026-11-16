// mod-facilities.js: see docs/features/facilities.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const KINDS = ['accessible', 'parking', 'bike', 'airport', 'ferry', 'busTerminal'];
  const ICON = { accessible: 'accessible', parking: 'local_parking', bike: 'pedal_bike', airport: 'flight', ferry: 'directions_boat', busTerminal: 'directions_bus' };
  const NICE = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const M_PER_PX_Z13 = 156543.03392 / 8192; // metres per zoom-13 pixel at the equator
  let GM = null;
  const hk = (n) => (X[n] = X[n] || []);

  window.I18N.add({
    stationFacilities: 'Station facilities',
    fac_accessible: 'Accessible', fac_parking: 'Parking', fac_bike: 'Bike', fac_airport: 'Airport', fac_ferry: 'Ferry', fac_busTerminal: 'Bus terminal',
    northArrow: 'North'
  }, {
    stationFacilities: '車站設施',
    fac_accessible: '無障礙設施', fac_parking: '停車場', fac_bike: '單車', fac_airport: '機場', fac_ferry: '渡輪', fac_busTerminal: '巴士總站',
    northArrow: '北'
  });

  const pathOf = (name) => { const m = /\sd="([^"]+)"/.exec(window.icon(name, 24)); return m ? m[1] : ''; };
  const cleanList = (v) => { const out = []; for (const k of (Array.isArray(v) ? v : [])) if (KINDS.includes(k) && !out.includes(k)) out.push(k); return out; };
  const nice = (maxPx, mpp) => { let best = NICE[0]; for (const n of NICE) if (n / mpp <= maxPx) best = n; return best; };
  const fmt = (m) => (m >= 1000 ? (m / 1000) + ' km' : m + ' m');
  const textW = (str, fs) => { let w = 0; for (const ch of String(str || '')) w += (ch.charCodeAt(0) > 255 ? 1 : 0.5) * fs; return w; };

  hk("validate").push((src, out) => {
    for (const id of Object.keys(out.stations)) {
      const s = src.stations && src.stations[id];
      const list = cleanList(s && s.facilities);
      if (list.length) out.stations[id].facilities = list;
    }
  });

  hk("labelExtra").push((m, s, rc, ctx) => {
    const list = cleanList(s.facilities);
    if (!list.length) return '';
    const fs = ctx.fs, size = Math.max(12, Math.min(14, fs)), step = size + 3;
    const settings = GM ? GM.getSettings() : { lang: 'en' };
    const main = settings.lang === 'yue' ? (s.nameZh || s.name) : s.name;
    let w = textW(main, fs);
    if (settings.lang === 'both' && s.nameZh) w = Math.max(w, textW(s.nameZh, fs * 0.9));
    const total = list.length * step - 3;
    let x0;
    if (ctx.anchor === 'start') x0 = rc.x0 + 2 + w + 4;
    else if (ctx.anchor === 'end') x0 = rc.x1 - 2 - w - 4 - total;
    else x0 = (rc.x0 + rc.x1) / 2 + w / 2 + 4;
    const y = rc.y0 + fs * 0.62 - size / 2;
    const ex = ctx.opts && ctx.opts.exportColors;
    const paint = ex ? 'fill="#16181D" stroke="#FFFFFF"' : 'style="fill:var(--label);stroke:var(--map-bg)"';
    const k = size / 960;
    return list.map((f, i) => `<g class="fac-icon" data-fac="${f}" transform="translate(${(x0 + i * step).toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(5)}) translate(0 960)"><path d="${pathOf(ICON[f])}" ${paint} stroke-width="150" stroke-linejoin="round" paint-order="stroke"/></g>`).join('');
  });

  function centreLat(m) {
    const xs = Object.values(m.stations);
    if (!xs.length) return 43.65;
    const k = m._k || 1;
    let sx = 0, sy = 0; for (const s of xs) { sx += s.x; sy += s.y; }
    return GM.gridToLatLon({ x: sx / xs.length / k, y: sy / xs.length / k }).lat;
  }

  hk("svgOver").push((m, ctx) => {
    if (!m._geo || !(ctx.opts && ctx.opts.exportColors) || !GM) return '';
    const xs = Object.values(m.stations); if (!xs.length) return '';
    const G = ctx.G, k = m._k || 1;
    const mpp = M_PER_PX_Z13 * Math.cos(centreLat(m) * Math.PI / 180) / k;
    const len = nice(240, mpp), px = len / mpp;
    const x = Math.min(...xs.map((s) => s.x)) * G - 40, y = Math.min(...xs.map((s) => s.y)) * G - 60;
    const ink = '#16181D';
    const bar = `M${x.toFixed(1)} ${(y - 6).toFixed(1)}V${y.toFixed(1)}H${(x + px).toFixed(1)}V${(y - 6).toFixed(1)}`;
    return `<g class="map-scale"><g transform="translate(${(x - 4).toFixed(1)} ${(y - 44).toFixed(1)}) scale(${(32 / 960).toFixed(5)}) translate(0 960)"><path d="${pathOf('explore')}" fill="${ink}" stroke="#FFFFFF" stroke-width="120" paint-order="stroke" stroke-linejoin="round"/></g>`
      + `<path d="${bar}" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linejoin="round"/>`
      + `<path d="${bar}" fill="none" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`
      + `<text x="${x.toFixed(1)}" y="${(y + 18).toFixed(1)}" font-size="14" font-weight="600" fill="${ink}" stroke="#FFFFFF" stroke-width="4" paint-order="stroke">${fmt(len)}</text></g>`;
  });

  hk("inspector").push((selection, map) => {
    if (!selection || selection.type !== 'station' || selection.ids.length !== 1) return '';
    const s = map.stations[selection.ids[0]]; if (!s) return '';
    const on = cleanList(s.facilities), t = GM.t, esc = GM.esc;
    const chips = KINDS.map((k) => `<button type="button" class="fac-chip${on.includes(k) ? ' on' : ''}" data-facility="${k}" aria-pressed="${on.includes(k)}">${on.includes(k) ? window.icon('check', 18) : window.icon(ICON[k], 18)}<span>${esc(t('fac_' + k))}</span></button>`).join('');
    return `<div class="insp fac-section"><h3 class="title-sm">${esc(t('stationFacilities'))}</h3><div class="fac-chips" role="group" aria-label="${esc(t('stationFacilities'))}">${chips}</div></div>`;
  });

  hk("click").push((e) => {
    const b = e.target.closest && e.target.closest('[data-facility]');
    if (!b || !GM) return false;
    const sel = GM.getSelection(); if (!sel || sel.type !== 'station' || sel.ids.length !== 1) return false;
    const s = GM.getMap().stations[sel.ids[0]]; if (!s) return false;
    const k = b.dataset.facility; if (!KINDS.includes(k)) return false;
    GM.checkpoint();
    const cur = cleanList(s.facilities), i = cur.indexOf(k);
    if (i >= 0) cur.splice(i, 1); else cur.push(k);
    if (cur.length) s.facilities = KINDS.filter((x) => cur.includes(x)); else delete s.facilities;
    GM.changed();
    GM.renderPanels();
    return true;
  });

  // Screen overlay: scale bar and north arrow for the geographic layout.
  let box = null;
  function updateScale() {
    if (!box) return;
    if (!GM.isGeo()) { box.hidden = true; return; }
    const st = document.getElementById('stage'), r = st.getBoundingClientRect(), v = GM.getView(), G = GM.G;
    const c = GM.gridToLatLon({ x: (r.width / 2 - v.tx) / v.k / G, y: (r.height / 2 - v.ty) / v.k / G });
    const mpp = M_PER_PX_Z13 * Math.cos(c.lat * Math.PI / 180) / v.k;
    const len = nice(140, mpp), px = Math.max(8, len / mpp);
    box.hidden = false;
    box.querySelector('.fs-bar').style.width = px.toFixed(0) + 'px';
    box.querySelector('.fs-text').textContent = fmt(len);
  }
  hk("afterRender").push(updateScale);
  hk("ready").push((gmmc) => {
    GM = gmmc;
    box = document.createElement('div');
    box.className = 'fac-scale'; box.id = 'facScale'; box.hidden = true;
    box.setAttribute('role', 'img');
    box.innerHTML = `<span class="fs-north" title="${GM.esc(GM.t('northArrow'))}">${window.icon('explore', 24)}</span><span class="fs-text"></span><span class="fs-bar"></span>`;
    document.getElementById('stage').appendChild(box);
    updateScale();
  });
})();
