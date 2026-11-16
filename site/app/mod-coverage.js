// mod-coverage.js: see docs/features/coverage.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const I = window.I18N;
  let C = null; // window.GMMC, set by the ready hook

  I.add({
    covTitle: 'Coverage, 800 m walk', covPeople: 'people', cov400: 'within 400 m', covFreq: 'near frequent service', covShare: '{p} of the GTHA population',
    covWalk: 'Show walksheds (400 m and 800 m)', covWalkHint: 'Walksheds are drawn in the geographic layout', covLines: 'By line', covBaseline: 'Baseline', covSetBase: 'Use as baseline', covClearBase: 'Clear baseline',
    covVsBase: 'vs baseline', covNote: 'Statistics Canada 2021 Census, population by dissemination area. Jobs are not available at this level, so only people are counted.',
    covNoData: 'Population data is not loaded', covSkipped: 'stations without coordinates are skipped', covFreqHint: 'Peak service every 10 minutes or better', covStations: 'stations', covNoStations: 'No stations on visible lines'
  }, {
    covTitle: '覆蓋範圍，步行800米', covPeople: '人', cov400: '400米內', covFreq: '鄰近高頻服務', covShare: '佔大多倫多及夏美頓地區人口{p}',
    covWalk: '顯示步行範圍（400米同800米）', covWalkHint: '步行範圍只會喺地理版面顯示', covLines: '按路線', covBaseline: '基準', covSetBase: '設為基準', covClearBase: '清除基準',
    covVsBase: '對比基準', covNote: '加拿大統計局2021年人口普查，按傳播區計算人口。呢個層面冇就業數據，所以只計人口。',
    covNoData: '未載入人口數據', covSkipped: '冇座標嘅車站會被略過', covFreqHint: '繁忙時段每10分鐘或更密', covStations: '個車站', covNoStations: '可見路線上冇車站'
  });
  const t = (k) => I.t(k);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const M_PER_DEG = 111195, FREQUENT_MIN = 10, R_NEAR = 400, R_FAR = 800;
  const CELL_LAT = 0.01, CELL_LON = 0.014;

  // ---------- population index ----------
  let index = null;
  function popIndex() {
    const data = window.GTHAPopulation;
    if (!data || !Array.isArray(data.points)) return null;
    if (index && index.data === data) return index;
    const cells = new Map(), pts = data.points;
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const key = Math.floor(pts[i][0] / CELL_LAT) * 100000 + Math.floor(pts[i][1] / CELL_LON);
      let c = cells.get(key); if (!c) cells.set(key, c = []);
      c.push(i); total += pts[i][2];
    }
    index = { data, pts, cells, total };
    return index;
  }
  /** Indices of population points within R_FAR metres, with their distance in metres. */
  function around(ix, lat, lon) {
    const ci = Math.floor(lat / CELL_LAT), cj = Math.floor(lon / CELL_LON), kx = M_PER_DEG * Math.cos(lat * Math.PI / 180);
    const idx = [], dist = [];
    for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) {
      const c = ix.cells.get(a * 100000 + b); if (!c) continue;
      for (const i of c) {
        const p = ix.pts[i], dy = (p[0] - lat) * M_PER_DEG, dx = (p[1] - lon) * kx, d = Math.sqrt(dx * dx + dy * dy);
        if (d <= R_FAR) { idx.push(i); dist.push(d); }
      }
    }
    return { idx, dist };
  }

  // ---------- model ----------
  /** Population within 400 m and 800 m of the stations of the visible lines. Each census point counts once. */
  function compute(map) {
    map = map || (C && C.getMap());
    const ix = popIndex();
    if (!map || !ix) return null;
    const pts = ix.pts, N = pts.length;
    const served = new Map(); // station id -> { lines: Set, frequent }
    const lineIds = [];
    let skipped = 0;
    for (const l of map.lines) {
      if (l.visible === false) continue;
      const peak = l.freq && l.freq.peak > 0 ? l.freq.peak : null, frequent = peak !== null && peak <= FREQUENT_MIN;
      const mine = new Set();
      for (const r of l.path) {
        if (r[0] === '@' || !map.stations[r] || (Array.isArray(l.skip) && l.skip.includes(r))) continue;
        mine.add(r);
        let e = served.get(r); if (!e) served.set(r, e = { lines: new Set(), frequent: false });
        e.lines.add(l.id); if (frequent) e.frequent = true;
      }
      if (mine.size) lineIds.push([l, mine]);
    }
    const stations = {}, nearAll = new Uint8Array(N), farAll = new Uint8Array(N), freqAll = new Uint8Array(N);
    for (const [id, e] of served) {
      const s = map.stations[id];
      if (!(Number.isFinite(s.lat) && Number.isFinite(s.lon))) { skipped++; continue; }
      const a = around(ix, s.lat, s.lon);
      let p400 = 0, p800 = 0;
      for (let k = 0; k < a.idx.length; k++) {
        const i = a.idx[k], p = pts[i][2];
        p800 += p; farAll[i] = 1;
        if (a.dist[k] <= R_NEAR) { p400 += p; nearAll[i] = 1; }
        if (e.frequent) freqAll[i] = 1;
      }
      stations[id] = { p400, p800, lat: s.lat, lon: s.lon, frequent: e.frequent, lines: [...e.lines], idx: a.idx };
    }
    let within400 = 0, within800 = 0, frequent800 = 0;
    for (let i = 0; i < N; i++) { const p = pts[i][2]; if (nearAll[i]) within400 += p; if (farAll[i]) within800 += p; if (freqAll[i]) frequent800 += p; }
    const stamp = new Int32Array(N), perLine = [];
    lineIds.forEach(([l, mine], li) => {
      let p800 = 0, n = 0;
      for (const id of mine) {
        const st = stations[id]; if (!st) continue;
        n++;
        for (const i of st.idx) if (stamp[i] !== li + 1) { stamp[i] = li + 1; p800 += pts[i][2]; }
      }
      perLine.push({ id: l.id, name: C ? C.lineName(l) : l.name, color: l.color, p800, stations: n });
    });
    return { total: ix.total, within400, within800, frequent800, stationCount: Object.keys(stations).length, skipped, stations, perLine };
  }

  // ---------- state and panel ----------
  const S = { walk: false, res: null, sig: '', lang: '', geo: true, base: null, linesOpen: false, timer: 0 };
  const icon = (n, s) => (window.icon ? window.icon(n, s) : '');
  function big(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' M';
    if (n >= 1e4) return Math.round(n / 1e3) + ' k';
    return new Intl.NumberFormat(I.getLang() === 'yue' ? 'zh-HK' : 'en-CA').format(Math.round(n));
  }
  const signedBig = (n) => (n >= 0 ? '+' : '−') + big(Math.abs(n));

  function signature() {
    const m = C.getMap();
    let h = 0;
    for (const s of Object.values(m.stations)) h += (s.lat || 0) * 1e5 + (s.lon || 0) * 1e5;
    return [Object.keys(m.stations).length, h.toFixed(1), m.lines.map((l) => l.id + (l.visible === false ? '0' : '1') + l.path.join(',') + (l.skip ? l.skip.join(',') : '') + (l.freq ? l.freq.peak : '')).join('|')].join('#');
  }

  function shell() {
    const host = $('cov'); if (!host) return;
    S.lang = I.getLang();
    const was = host.querySelector('.cov-lines'); if (was) S.linesOpen = was.open;
    const r = S.res, geo = C.isGeo();
    let body;
    if (!window.GTHAPopulation) body = `<p class="cov-note">${esc(t('covNoData'))}</p>`;
    else if (!r || !r.stationCount) body = `<p class="cov-note">${esc(t('covNoStations'))}</p>`;
    else {
      const share = r.total ? Math.round(r.within800 / r.total * 100) : 0;
      const delta = S.base ? `<span class="cov-delta ${r.within800 >= S.base.within800 ? 'up' : 'down'}">${signedBig(r.within800 - S.base.within800)} ${esc(t('covVsBase'))}</span>` : '';
      const maxLine = Math.max(1, ...r.perLine.map((l) => l.p800));
      const rows = r.perLine.slice().sort((a, b) => b.p800 - a.p800).map((l) =>
        `<li style="--c:${esc(l.color)}"><span class="cov-dot"></span><span class="cov-ln">${esc(l.name)}</span><span class="cov-val">${big(l.p800)}</span><span class="cov-bar" style="--w:${(l.p800 / maxLine * 100).toFixed(1)}%"></span></li>`).join('');
      body = `<div class="cov-card" aria-live="polite">
          <div class="cov-stat"><b id="covMain">${big(r.within800)}</b><span>${esc(t('covPeople'))}</span></div>
          <div class="cov-stat"><b>${big(r.within400)}</b><span>${esc(t('cov400'))}</span></div>
          <div class="cov-stat"><b>${big(r.frequent800)}</b><span title="${esc(t('covFreqHint'))}">${esc(t('covFreq'))}</span></div>
          ${delta ? `<div class="cov-stat wide">${delta}</div>` : ''}
        </div>
        <p class="cov-sub">${esc(t('covShare').replace('{p}', share + '%'))} (${big(r.total)}) · ${r.stationCount} ${esc(t('covStations'))}${r.skipped ? ' · ' + r.skipped + ' ' + esc(t('covSkipped')) : ''}</p>
        <label class="switch-row"><span>${esc(t('covWalk'))}</span><input type="checkbox" role="switch" class="switch" id="covWalk"${S.walk ? ' checked' : ''}></label>
        ${geo ? '' : `<p class="cov-note">${esc(t('covWalkHint'))}</p>`}
        <details class="cov-lines"${S.linesOpen ? ' open' : ''}><summary>${esc(t('covLines'))}</summary><ul>${rows}</ul></details>
        <div class="cov-actions"><button type="button" class="btn tonal" id="covBase">${esc(S.base ? t('covClearBase') : t('covSetBase'))}</button></div>
        <p class="cov-note">${esc(t('covNote'))}</p>`;
    }
    host.innerHTML = `<h3 class="title-sm cov-title">${icon('my_location', 20)}<span>${esc(t('covTitle'))}</span></h3>${body}`;
  }

  function recompute() {
    S.sig = signature();
    S.res = compute();
    shell();
  }

  function onChange(e) {
    if (e.target.id === 'covWalk') { S.walk = e.target.checked; C.render(); }
  }
  function onClick(e) {
    const b = e.target.closest && e.target.closest('#covBase');
    if (!b) return;
    S.base = S.base ? null : (S.res ? { within800: S.res.within800 } : null);
    shell();
  }

  // ---------- map overlay ----------
  X.svgUnder = X.svgUnder || [];
  X.svgUnder.push(function (m, ctx) {
    if (!C || !S.walk || !S.res || !m._geo || !ctx.opts || !ctx.opts.editor) return '';
    const G = ctx.G;
    let far = '', near = '';
    for (const [id, st] of Object.entries(S.res.stations)) {
      const d = m.stations[id]; if (!d) continue;
      // Web Mercator at zoom 13: 19.109 m per pixel at the equator, scaled by the view zoom.
      const pxPerM = m._k / (19.1094 * Math.cos(st.lat * Math.PI / 180));
      const cx = (d.x * G).toFixed(1), cy = (d.y * G).toFixed(1);
      far += `<circle cx="${cx}" cy="${cy}" r="${(R_FAR * pxPerM).toFixed(1)}"/>`;
      near += `<circle cx="${cx}" cy="${cy}" r="${(R_NEAR * pxPerM).toFixed(1)}"/>`;
    }
    return `<g class="cov-walksheds" pointer-events="none"><g style="fill:var(--md-primary,#1B5E9E)" opacity=".24">${far}</g><g style="fill:none;stroke:var(--md-primary,#1B5E9E)" stroke-width="1.5" stroke-dasharray="6 5" opacity=".9">${near}</g></g>`;
  });

  X.afterRender = X.afterRender || [];
  X.afterRender.push(function () {
    if (!C || !$('cov')) return;
    if (S.lang !== I.getLang() || S.geo !== C.isGeo()) { S.geo = C.isGeo(); shell(); }
    if (signature() !== S.sig) {
      clearTimeout(S.timer);
      S.timer = setTimeout(() => { if (signature() !== S.sig) { recompute(); if (S.walk) C.render(); } }, 250);
    }
  });

  window.GMMCCoverage = {
    compute,
    result: () => S.res,
    setWalksheds: (on) => { S.walk = !!on; shell(); if (C) C.render(); }
  };

  X.ready = X.ready || [];
  X.ready.push(function (gmmc) {
    C = gmmc;
    const right = document.querySelector('.panel.right');
    if (!right) return;
    const sec = document.createElement('section');
    sec.id = 'cov'; sec.className = 'cov';
    right.insertBefore(sec, right.querySelector('h2') || $('inspector'));
    S.geo = C.isGeo();
    recompute();
    sec.addEventListener('change', onChange);
    sec.addEventListener('click', onClick);
  });
})();
