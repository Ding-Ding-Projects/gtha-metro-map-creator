// mod-demand.js: see docs/features/demand.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const I = window.I18N;
  let C = null; // window.GMMC, set by the ready hook

  I.add({
    dmTitle: 'Ridership estimate', dmShow: 'Show estimated loads', dmDisclaimer: 'Illustrative estimate, not a forecast', dmLower: 'lower', dmHigher: 'higher',
    dmHelp: 'Line width follows the average load a gravity model puts on each line, from people within 800 m and peak travel times.', dmRunning: 'Estimating', dmDone: 'Estimated for', dmStationsUsed: 'busiest stations',
    dmBusiest: 'Busiest segment', dmRank: 'Relative load by line', dmNoData: 'Needs population data and the journey planner', dmSeconds: 's', dmStale: 'Map changed, updating', dmNone: 'No routes to estimate'
  }, {
    dmTitle: '乘客量估算', dmShow: '顯示估算載客量', dmDisclaimer: '示意估算，並非預測', dmLower: '較低', dmHigher: '較高',
    dmHelp: '線條闊度跟隨重力模型為每條路線估算嘅平均載客量，根據800米內人口同繁忙時段行車時間計算。', dmRunning: '估算中', dmDone: '已估算，涵蓋', dmStationsUsed: '個人口最多嘅車站',
    dmBusiest: '最繁忙路段', dmRank: '各路線相對載客量', dmNoData: '需要人口數據同行程規劃功能', dmSeconds: '秒', dmStale: '地圖已更改，更新中', dmNone: '冇可估算嘅路線'
  });
  const t = (k) => I.t(k);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, s) => (window.icon ? window.icon(n, s) : '');

  const TOP_N = 150, MIN_MINUTES = 5, W_MIN = 3, W_MAX = 16, CHUNK = 6, BAND = 'peak', K = 1;
  const baseId = (id) => String(id).split('~b')[0];

  // ---------- model ----------
  /** Stops of a visible line in the same order the journey graph uses them. */
  function lineStops(l, map) {
    const out = [];
    for (const r of l.path) {
      if (r[0] === '@' || !map.stations[r]) continue;
      if (out.length && out[out.length - 1] === r) continue;
      out.push(r);
    }
    return out;
  }
  const segKey = (lineId, a, b) => lineId + '|' + (a < b ? a + '>' + b : b + '>' + a);

  let runToken = 0;
  /** Gravity model among the TOP_N most populous stations; loads are summed on the segments of the fastest paths.
   * trips_ij = K * P_i * P_j / max(t_ij, 5)^2, P = people within 800 m, t = peak minutes. */
  async function estimate(onProgress) {
    const J = window.GMMCJourney, Cv = window.GMMCCoverage;
    if (!C || !J || !J.graph || !Cv || !window.GTHAPopulation) return null;
    const token = ++runToken, started = performance.now();
    const map = C.getMap(), cov = Cv.compute(map);
    if (!cov) return null;
    const ranked = Object.entries(cov.stations).filter(([, s]) => s.p800 > 0).sort((a, b) => b[1].p800 - a[1].p800).slice(0, TOP_N);
    const ids = ranked.map((r) => r[0]), pop = Object.fromEntries(ranked.map((r) => [r[0], r[1].p800]));
    const Gr = J.graph(BAND);
    const seg = new Map();
    let pairs = 0;
    for (let o = 0; o < ids.length; o++) {
      const from = ids[o], paths = J.pathsFrom(Gr, from, ids);
      for (const d of Object.keys(paths)) {
        const p = paths[d], trips = K * pop[from] * pop[d] / (Math.max(p.minutes, MIN_MINUTES) ** 2);
        pairs++;
        for (const ride of p.rides) for (let k = 1; k < ride.via.length; k++) {
          const key = segKey(ride.lineId, ride.via[k - 1], ride.via[k]);
          seg.set(key, (seg.get(key) || 0) + trips);
        }
      }
      if ((o + 1) % CHUNK === 0 || o === ids.length - 1) {
        if (onProgress) onProgress((o + 1) / ids.length);
        await new Promise((r) => setTimeout(r, 0)); // let the page paint and take input
        if (token !== runToken) return null; // a newer run replaced this one
      }
    }
    // Average load per line over its stop-to-stop segments (segments nobody uses count as zero).
    const lines = {};
    let busiest = null;
    for (const l of map.lines) {
      if (l.visible === false) continue;
      const stops = lineStops(l, map);
      if (stops.length < 2) continue;
      let sum = 0, n = 0, peak = 0;
      for (let k = 1; k < stops.length; k++) {
        if (stops[k] === stops[k - 1]) continue;
        const v = seg.get(segKey(l.id, stops[k - 1], stops[k])) || 0;
        sum += v; n++;
        if (v > peak) peak = v;
        if (!busiest || v > busiest.load) busiest = { lineId: l.id, from: stops[k - 1], to: stops[k], load: v };
      }
      if (n) lines[l.id] = { avg: sum / n, peak, name: C.lineName(l), color: l.color, segments: n };
    }
    const avgs = Object.values(lines).map((x) => x.avg), lo = Math.min(...avgs), hi = Math.max(...avgs);
    for (const v of Object.values(lines)) {
      v.index = hi > 0 ? v.avg / hi : 0;
      v.width = hi > lo ? W_MIN + (W_MAX - W_MIN) * Math.sqrt((v.avg - lo) / (hi - lo)) : (W_MIN + W_MAX) / 2;
    }
    return { lines, busiest, stations: ids.length, pairs, ms: Math.round(performance.now() - started), maxAvg: hi };
  }

  // ---------- state and panel ----------
  const S = { on: false, res: null, running: false, progress: 0, sig: '', lang: '', timer: 0 };
  const stName = (id) => {
    const s = C.getMap().stations[id]; if (!s) return id;
    const lang = I.getLang();
    return lang === 'yue' ? (s.nameZh || s.name) : s.name;
  };
  function signature() {
    const m = C.getMap();
    let h = 0;
    for (const s of Object.values(m.stations)) h += (s.lat || 0) * 1e5 + (s.lon || 0) * 1e5;
    return [Object.keys(m.stations).length, h.toFixed(1), (m.transfers || []).length,
      m.lines.map((l) => l.id + (l.visible === false ? '0' : '1') + l.path.join(',') + (l.skip ? l.skip.join(',') : '') + (l.freq ? [l.freq.peak, l.freq.midday, l.freq.offpeak].join('/') : '')).join('|')].join('#');
  }

  function shell() {
    const host = $('dm'); if (!host) return;
    S.lang = I.getLang();
    const ready = !!(window.GMMCJourney && window.GMMCJourney.graph && window.GMMCCoverage && window.GTHAPopulation);
    let body = '';
    if (!ready) body = `<p class="dm-note">${esc(t('dmNoData'))}</p>`;
    else {
      body = `<label class="switch-row"><span>${esc(t('dmShow'))}</span><input type="checkbox" role="switch" class="switch" id="dmOn"${S.on ? ' checked' : ''}></label>`;
      if (S.on && S.running) body += `<p class="dm-note" aria-live="polite">${esc(t('dmRunning'))} ${Math.round(S.progress * 100)}%</p><div class="dm-progress"><i style="width:${Math.round(S.progress * 100)}%"></i></div>`;
      else if (S.on && S.res) {
        const r = S.res, rows = Object.values(r.lines).sort((a, b) => b.index - a.index).map((l) =>
          `<li style="--c:${esc(l.color)}"><span class="dm-ln">${esc(l.name)}</span><span class="dm-bar" style="--w:${(l.index * 100).toFixed(1)}%"></span><span class="dm-val">${Math.round(l.index * 100)}</span></li>`).join('');
        const b = r.busiest && r.busiest.load > 0 ? `<p class="dm-note">${esc(t('dmBusiest'))}: ${esc(stName(r.busiest.from))} → ${esc(stName(r.busiest.to))}</p>` : '';
        body += `<details class="dm-rank"><summary>${esc(t('dmRank'))}</summary><ol>${rows}</ol></details>${b}
          <p class="dm-note">${esc(t('dmDone'))} ${r.stations} ${esc(t('dmStationsUsed'))} · ${(r.ms / 1000).toFixed(1)} ${esc(t('dmSeconds'))}</p>`;
      }
      body += `<p class="dm-note">${esc(t('dmHelp'))}</p>`;
    }
    host.innerHTML = `<h3 class="title-sm dm-title">${icon('sync_alt', 20)}<span>${esc(t('dmTitle'))}</span></h3>${body}<p class="dm-note dm-flag">${esc(t('dmDisclaimer'))}</p>`;
  }

  function legend() {
    const stage = $('stage'); if (!stage) return;
    let el = $('dmLegend');
    if (!el) { el = document.createElement('div'); el.id = 'dmLegend'; el.className = 'dm-legend'; el.hidden = true; stage.appendChild(el); }
    if (!S.on || !S.res) { el.hidden = true; return; }
    el.innerHTML = `<b>${esc(t('dmDisclaimer'))}</b><span class="dm-key"><span>${esc(t('dmLower'))}</span><i style="height:3px"></i><i style="height:8px"></i><i style="height:14px"></i><span>${esc(t('dmHigher'))}</span></span>`;
    el.hidden = false;
  }

  async function run() {
    if (!C) return;
    S.sig = signature(); S.running = true; S.progress = 0; shell();
    const res = await estimate((p) => { S.progress = p; shell(); });
    if (res === null) return; // replaced by a newer run
    S.res = res; S.running = false;
    shell(); legend(); C.render();
  }

  function onChange(e) {
    if (e.target.id !== 'dmOn') return;
    S.on = e.target.checked;
    if (S.on) run();
    else { runToken++; S.running = false; shell(); legend(); C.render(); }
  }

  // ---------- map ----------
  X.lineStyle = X.lineStyle || [];
  X.lineStyle.push(function (line) {
    if (!S.on || !S.res) return null;
    const r = S.res.lines[baseId(line.id)];
    return r ? Object.assign({}, line, { width: Math.round(r.width * 10) / 10 }) : null;
  });
  X.svgOver = X.svgOver || [];
  X.svgOver.push(function (m, ctx) {
    if (!C || !S.on || !S.res || (ctx.opts && ctx.opts.editor)) return '';
    const sts = Object.values(m.stations); if (!sts.length) return '';
    const G = ctx.G, x0 = Math.min(...sts.map((s) => s.x)) * G, y1 = Math.max(...sts.map((s) => s.y)) * G + 100;
    return `<text class="dm-export-note" x="${x0}" y="${y1}" font-size="18" font-weight="700" fill="#16181D">${esc(t('dmDisclaimer'))}</text>`;
  });
  X.afterRender = X.afterRender || [];
  X.afterRender.push(function () {
    if (!C || !$('dm')) return;
    if (S.lang !== I.getLang()) { shell(); legend(); }
    if (S.on && !S.running && signature() !== S.sig) {
      clearTimeout(S.timer);
      S.timer = setTimeout(() => { if (S.on && !S.running && signature() !== S.sig) run(); }, 400);
    }
  });

  window.GMMCDemand = {
    estimate: () => estimate(),
    result: () => S.res,
    setLoads: async (on) => { S.on = !!on; if (S.on) await run(); else { runToken++; S.running = false; shell(); legend(); C.render(); } },
    params: { topStations: TOP_N, minMinutes: MIN_MINUTES, minWidth: W_MIN, maxWidth: W_MAX, band: BAND }
  };

  X.ready = X.ready || [];
  X.ready.push(function (gmmc) {
    C = gmmc;
    const right = document.querySelector('.panel.right');
    if (!right) return;
    const sec = document.createElement('section');
    sec.id = 'dm'; sec.className = 'dm';
    const cov = $('cov');
    right.insertBefore(sec, cov ? cov.nextSibling : (right.querySelector('h2') || $('inspector')));
    S.sig = signature();
    shell();
    sec.addEventListener('change', onChange);
  });
})();
