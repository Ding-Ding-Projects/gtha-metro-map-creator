// mod-times.js: see docs/features/journey.md ("Travel times between stops"). Registers hooks on window.GMMCX before app.js loads.
// Draws the time between two stops as a small pill on the map, lets the user set it (line.times) and edits it in the inspector.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  ['validate', 'svgOver', 'inspector', 'click', 'keydown', 'pointer', 'ready'].forEach((k) => { X[k] = X[k] || []; });
  const I = window.I18N;
  let C = null; // window.GMMC, set by the ready hook

  I.add({
    tvTitle: 'Travel times', tvMin: 'min', tvHint: 'Leave a field empty to use the estimate (shown with ~). A time includes the stop at its start.',
    tvEstimate: 'Estimated', tvSetByYou: 'Set by you', tvReset: 'Use the estimate', tvInvalid: 'Enter a time from 0.1 to 600 minutes',
    tvShowTimes: 'Show travel times when zoomed in', tvExportTimes: 'Include travel times in image exports', tvNone: 'This route needs at least two stops',
    tvDone: 'Done', tvEditTitle: 'Travel time', tvFieldLabel: 'Minutes from {a} to {b}', tvCount: 'set', tvPillHint: 'Click a time to change it',
    tvEstimateIs: 'Estimate', tvDec: 'Decrease by 1', tvInc: 'Increase by 1'
  }, {
    tvTitle: '行車時間', tvMin: '分鐘', tvHint: '留空就會用估算時間（有 ~ 符號）。時間已包括起點站嘅停站時間。',
    tvEstimate: '估算', tvSetByYou: '自行設定', tvReset: '用返估算時間', tvInvalid: '請輸入 0.1 至 600 分鐘',
    tvShowTimes: '放大時顯示站與站之間嘅行車時間', tvExportTimes: '圖片匯出包括行車時間', tvNone: '路線最少要有兩個站',
    tvDone: '完成', tvEditTitle: '行車時間', tvFieldLabel: '由 {a} 去 {b} 嘅分鐘數', tvCount: '個已設定', tvPillHint: '點擊時間就可以修改',
    tvEstimateIs: '估算', tvDec: '減 1', tvInc: '加 1'
  });
  const t = (k, v) => { let s = I.t(k); if (v) for (const x in v) s = s.replace('{' + x + '}', v[x]); return s; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, s) => (window.icon ? window.icon(n, s) : '');
  const $ = (id) => document.getElementById(id);

  const MIN = 0.1, MAX = 600;
  const GEO_MIN_ZOOM = 1.2, SCHEMATIC_MIN_ZOOM = 0.9; // where the map is zoomed in enough for station labels to be readable
  const PILL_H = 20;

  // ---------- data ----------
  const isRef = (r) => typeof r === 'string' && r[0] !== '@';
  /** line.times as { "<fromId>><toId>": minutes }: keep numbers from 0.1 to 600 between two known stations. */
  X.validate.push(function (src, out) {
    (src.lines || []).forEach((sl, i) => {
      const ol = out.lines[i];
      if (!ol || !sl || !sl.times || typeof sl.times !== 'object' || Array.isArray(sl.times)) return;
      const times = {};
      for (const [k, v] of Object.entries(sl.times).slice(0, 2000)) {
        const parts = String(k).split('>');
        const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? +v : NaN;
        if (parts.length !== 2 || !out.stations[parts[0]] || !out.stations[parts[1]] || parts[0] === parts[1]) continue;
        if (Number.isFinite(n) && n >= MIN && n <= MAX) times[k] = Math.round(n * 100) / 100;
      }
      if (Object.keys(times).length) ol.times = times;
    });
  });

  const J = () => window.GMMCJourney;
  /** Consecutive station pairs of a line (its main route, then its branches), each pair once, in route order. */
  function pairsOf(line, map) {
    const out = [], seen = new Set();
    const walk = (path) => {
      const ids = (path || []).filter((r) => isRef(r) && map.stations[r]);
      for (let i = 1; i < ids.length; i++) {
        const a = ids[i - 1], b = ids[i];
        const key = a < b ? a + '>' + b : b + '>' + a;
        if (a === b || seen.has(key)) continue;
        seen.add(key); out.push([a, b]);
      }
    };
    walk(line.path);
    (line.branches || []).forEach(walk);
    return out;
  }
  const fmtSet = (m) => String(Math.round(m * 10) / 10);
  const fmtEst = (m) => String(Math.max(1, Math.round(m)));
  function info(line, a, b, map) {
    const o = J() ? J().segmentOverride(line, a, b) : null;
    if (o !== null) return { minutes: o, set: true };
    const e = J() ? J().estimateMinutes(line, a, b, map) : null;
    return e === null ? null : { minutes: e, set: false };
  }
  function setTime(line, a, b, minutes) {
    const times = Object.assign({}, line.times || {});
    delete times[a + '>' + b]; delete times[b + '>' + a];
    if (minutes !== null) times[a + '>' + b] = Math.round(minutes * 100) / 100;
    if (Object.keys(times).length) line.times = times; else delete line.times;
  }
  function parse(text) {
    const s = String(text).trim().replace(',', '.');
    if (s === '') return { ok: true, value: null };
    const n = +s;
    return Number.isFinite(n) && n >= MIN && n <= MAX ? { ok: true, value: n } : { ok: false };
  }

  // ---------- shared Material number stepper: minus button, field with unit, plus button ----------
  /** o: { attrs, value, min, max, step, base, unit, label, placeholder, clearable } */
  function stepper(o) {
    return `<span class="m3-stepper" role="group" aria-label="${esc(o.label)}">` +
      `<button type="button" class="icon-btn m3-step" data-step="-1" aria-label="${esc(t('tvDec') + ': ' + o.label)}" title="${esc(t('tvDec'))}">${icon('remove', 20)}</button>` +
      `<input type="number" inputmode="decimal" class="m3-num" min="${o.min}" max="${o.max}" step="${o.step}" ${o.attrs || ''} value="${o.value === '' || o.value === undefined ? '' : esc(o.value)}" placeholder="${esc(o.placeholder || '')}"${o.base !== undefined ? ` data-base="${esc(o.base)}"` : ''}${o.clearable ? ' data-clearable="1"' : ''} aria-label="${esc(o.label)}">` +
      (o.unit ? `<span class="m3-unit">${esc(o.unit)}</span>` : '') +
      `<button type="button" class="icon-btn m3-step" data-step="1" aria-label="${esc(t('tvInc') + ': ' + o.label)}" title="${esc(t('tvInc'))}">${icon('add', 20)}</button></span>`;
  }
  document.addEventListener('click', function (e) {
    const b = e.target && e.target.closest && e.target.closest('.m3-stepper [data-step]');
    if (!b) return;
    const inp = b.parentElement.querySelector('input'), dir = +b.dataset.step;
    const min = +inp.min, max = +inp.max, step = +inp.step || 1, raw = inp.value.trim().replace(',', '.');
    let v = raw === '' ? NaN : +raw;
    if (!Number.isFinite(v)) {
      if (inp.dataset.base !== undefined) v = +inp.dataset.base + dir * step;
      else if (dir > 0) v = min;
      else return;
    } else v += dir * step;
    v = Math.round(v * 10) / 10;
    if (v < min) v = inp.dataset.clearable ? '' : min;
    if (v > max) v = max;
    inp.value = v === '' ? '' : String(v);
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.focus();
  });
  window.GMMCControls = { stepper };

  // ---------- map pills ----------
  const inkFor = (hex) => { const n = parseInt(String(hex).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#16181D' : '#FFFFFF'; };
  const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  /** Point at a fraction of the way along a polyline, by length. */
  function along(pts, f) {
    let total = 0; const segs = [];
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); segs.push(l); total += l; }
    let target = total * f, i = 0;
    while (i < segs.length - 1 && target > segs[i]) { target -= segs[i]; i++; }
    const a = pts[i], b = pts[i + 1], u = segs[i] ? target / segs[i] : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, total };
  }

  X.svgOver.push(function (m, ctx) {
    if (!C || !J()) return '';
    const S = C.getSettings(), opts = ctx.opts || {}, exp = opts.editor === false;
    if (exp ? !S.exportTimes : !S.showTimes) return '';
    if (!exp && (m._geo ? m._k < GEO_MIN_ZOOM : C.getView().k < SCHEMATIC_MIN_ZOOM)) return '';
    const real = C.getMap(), G = ctx.G;
    const taken = [];
    for (const b of ctx.badges || []) taken.push({ x0: b.x - b.w / 2 - 2, x1: b.x + b.w / 2 + 2, y0: b.y - 13, y1: b.y + 13 });
    for (const r of ctx.labels || []) taken.push({ x0: r.x0 - 2, x1: r.x1 + 2, y0: r.y0 - 2, y1: r.y1 + 2 });
    const marks = Object.values(m.stations).map((s) => ({ x: s.x * G, y: s.y * G }));
    const done = new Set();
    let out = '';
    for (const g of ctx.geo || []) {
      const line = g.line;
      if (!line || line.visible === false || !g.edges || !g.edges.length) continue;
      const base = line._branchOf || line.id;
      const stops = [];
      line.path.forEach((r, i) => { if (isRef(r) && real.stations[r]) stops.push({ id: r, i }); });
      for (let k = 1; k < stops.length; k++) {
        const A = stops[k - 1], B = stops[k];
        if (A.id === B.id) continue;
        const key = base + '|' + (A.id < B.id ? A.id + '|' + B.id : B.id + '|' + A.id);
        if (done.has(key)) continue;
        const edges = g.edges.filter((e) => e.index >= A.i && e.index < B.i && e.pts && e.pts.length).sort((p, q) => p.index - q.index);
        if (!edges.length) continue;
        let pts = [];
        for (const e of edges) {
          const seg = pts.length && Math.hypot(pts[pts.length - 1].x - e.pts[0].x, pts[pts.length - 1].y - e.pts[0].y) < 0.5 ? e.pts.slice(1) : e.pts;
          pts = pts.concat(seg);
        }
        if (pts.length < 2) continue;
        const inf = info(line, A.id, B.id, real);
        if (!inf) continue;
        const text = (inf.set ? '' : '~') + (inf.set ? fmtSet(inf.minutes) : fmtEst(inf.minutes)) + ' ' + t('tvMin');
        const w = Math.round(text.length * 6.4 + 18);
        let spot = null;
        for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
          const p = along(pts, f);
          if (p.total * Math.min(f, 1 - f) < w / 2 + 16) continue; // too short: the pill would sit on a station marker
          const rc = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - PILL_H / 2, y1: p.y + PILL_H / 2 };
          if (taken.some((q) => overlap(rc, q))) continue;
          if (marks.some((s) => s.x > rc.x0 - 15 && s.x < rc.x1 + 15 && s.y > rc.y0 - 15 && s.y < rc.y1 + 15)) continue;
          spot = { p, rc }; break;
        }
        if (!spot) continue;
        done.add(key); taken.push(spot.rc);
        const col = line.color, tx = spot.rc.x0, ty = spot.rc.y0;
        const title = `<title>${esc(t(inf.set ? 'tvSetByYou' : 'tvEstimate'))}: ${esc(real.stations[A.id].name)} - ${esc(real.stations[B.id].name)}</title>`;
        const geoNode = `<rect width="${w}" height="${PILL_H}" rx="${PILL_H / 2}"`;
        if (exp) {
          const fill = inf.set ? col : '#FFFFFF', ink = inf.set ? inkFor(col) : '#3A3D44';
          out += `<g class="tv-pill ${inf.set ? 'set' : 'est'}" transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)})">${geoNode} fill="${fill}" fill-opacity="${inf.set ? 1 : 0.92}" stroke="${col}" stroke-width="2"/><text x="${w / 2}" y="14" font-size="11" font-weight="${inf.set ? 700 : 500}"${inf.set ? '' : ' font-style="italic"'} text-anchor="middle" fill="${ink}">${esc(text)}</text></g>`;
        } else {
          out += `<g class="tv-pill ${inf.set ? 'set' : 'est'}" style="--c:${esc(col)};--ink:${inkFor(col)}" data-tvp="${esc(base)}|${esc(A.id)}|${esc(B.id)}" transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)})">${title}${geoNode} class="tv-bg"/><text class="tv-tx" x="${w / 2}" y="14" text-anchor="middle">${esc(text)}</text></g>`;
        }
      }
    }
    return out ? `<g class="tv-layer">${out}</g>` : '';
  });

  // ---------- pill editor (a small popover over the map) ----------
  let pop = null, popFor = null;
  function closePop() { if (pop) { pop.remove(); pop = null; popFor = null; } }
  function openPop(pill) {
    closePop();
    const [lid, a, b] = pill.dataset.tvp.split('|');
    const map = C.getMap(), line = C.lineById(lid);
    if (!line || !map.stations[a] || !map.stations[b]) return;
    const inf = info(line, a, b, map);
    const stage = $('stage'), sr = stage.getBoundingClientRect(), pr = pill.getBoundingClientRect();
    pop = document.createElement('div');
    pop.className = 'tv-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', t('tvEditTitle'));
    const est = J().estimateMinutes(line, a, b, map);
    const A = map.stations[a].name, B = map.stations[b].name;
    pop.innerHTML = `<p class="tv-pop-title">${esc(A)} <span aria-hidden="true">&rarr;</span> ${esc(B)}</p>
      ${stepper({ attrs: 'id="tvPopIn"', value: inf && inf.set ? fmtSet(inf.minutes) : '', min: MIN, max: MAX, step: 1, base: est === null ? undefined : fmtEst(est), unit: t('tvMin'), label: t('tvFieldLabel', { a: A, b: B }), placeholder: est === null ? '' : '~' + fmtEst(est) })}
      <p class="supporting tv-est">${esc(t('tvEstimateIs'))}: ~${est === null ? '' : fmtEst(est)} ${esc(t('tvMin'))}</p>
      <p class="supporting tv-pop-err" id="tvPopErr" role="alert" hidden>${esc(t('tvInvalid'))}</p>
      <div class="actions"><button type="button" class="btn text" data-tvpop="reset"${inf && inf.set ? '' : ' disabled'}>${esc(t('tvReset'))}</button><button type="button" class="btn tonal" data-tvpop="done">${esc(t('tvDone'))}</button></div>`;
    stage.appendChild(pop);
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(sr.width - w - 8, pr.left - sr.left + pr.width / 2 - w / 2)) + 'px';
    const below = pr.bottom - sr.top + 10, above = pr.top - sr.top - h - 10;
    pop.style.top = Math.max(8, below + h + 8 < sr.height ? below : above) + 'px';
    popFor = { lid, a, b };
    const input = $('tvPopIn'); input.focus(); input.select();
  }
  function commitPop() {
    if (!pop || !popFor) return false;
    const r = parse($('tvPopIn').value);
    if (!r.ok) { $('tvPopErr').hidden = false; return false; }
    const line = C.lineById(popFor.lid);
    if (line) { C.checkpoint(); setTime(line, popFor.a, popFor.b, r.value); C.changed(); }
    closePop();
    return true;
  }

  X.pointer.push(function (e, p, tool, target) {
    const pill = e.target && e.target.closest && e.target.closest('[data-tvp]');
    if (!pill || tool !== 'select' || e.button !== 0) { if (pop && !(e.target.closest && e.target.closest('.tv-pop'))) closePop(); return false; }
    e.preventDefault();
    openPop(pill);
    return true;
  });
  X.keydown.push(function (e) {
    if (!pop) return false;
    if (e.key === 'Escape') { closePop(); return true; }
    if (e.key === 'Enter' && document.activeElement === $('tvPopIn')) { e.preventDefault(); commitPop(); return true; }
    return false;
  });

  // ---------- inspector list ----------
  function rowHtml(line, a, b, i, map) {
    const inf = info(line, a, b, map);
    const est = J().estimateMinutes(line, a, b, map);
    const A = map.stations[a].name, B = map.stations[b].name;
    const attrs = `data-tvt="${i}" data-line="${esc(line.id)}" data-a="${esc(a)}" data-b="${esc(b)}"`;
    return `<li class="tv-row"><span class="tv-names"><span>${esc(A)}</span><span class="tv-arrow" aria-hidden="true">&rarr;</span><span>${esc(B)}</span></span>` +
      stepper({ attrs, value: inf && inf.set ? fmtSet(inf.minutes) : '', min: MIN, max: MAX, step: 1, base: est === null ? undefined : fmtEst(est), unit: t('tvMin'), label: t('tvFieldLabel', { a: A, b: B }), placeholder: est === null ? '' : '~' + fmtEst(est) }) +
      `<button type="button" class="icon-btn tv-reset" data-tvreset="${i}" data-line="${esc(line.id)}" data-a="${esc(a)}" data-b="${esc(b)}" aria-label="${esc(t('tvReset') + ': ' + A + ' - ' + B)}" title="${esc(t('tvReset'))}"${inf && inf.set ? '' : ' disabled'}>${icon('undo', 20)}</button>` +
      `<span class="supporting tv-est">${esc(t('tvEstimateIs'))}: ~${est === null ? '' : fmtEst(est)} ${esc(t('tvMin'))}</span></li>`;
  }
  X.inspector.push(function (sel, map) {
    if (!C || !J() || !sel || (sel.type !== 'line' && sel.type !== 'edge')) return '';
    const line = C.lineById(sel.lineId || sel.id);
    if (!line) return '';
    const pairs = pairsOf(line, map);
    const count = pairs.filter(([a, b]) => J().segmentOverride(line, a, b) !== null).length;
    const body = pairs.length ? `<ul class="tv-list" id="tvList">${pairs.map(([a, b], i) => rowHtml(line, a, b, i, map)).join('')}</ul>` : `<p class="supporting">${esc(t('tvNone'))}</p>`;
    return `<div class="insp tv-section"><h3 class="title-sm">${icon('schedule', 18)} ${esc(t('tvTitle'))}<span class="supporting tv-count" id="tvCount">${count} ${esc(t('tvCount'))}</span></h3><p class="supporting">${esc(t('tvHint'))}</p>${body}</div>`;
  });

  function refreshRow(input, line) {
    const inf = info(line, input.dataset.a, input.dataset.b, C.getMap());
    const row = input.closest('.tv-row');
    const btn = row && row.querySelector('.tv-reset');
    if (btn) btn.disabled = !(inf && inf.set);
    const cnt = $('tvCount');
    if (cnt) cnt.textContent = pairsOf(line, C.getMap()).filter(([a, b]) => J().segmentOverride(line, a, b) !== null).length + ' ' + t('tvCount');
  }
  document.addEventListener('change', function (e) {
    const inp = e.target && e.target.closest && e.target.closest('[data-tvt]');
    if (!inp || !C) return;
    const line = C.lineById(inp.dataset.line);
    if (!line) return;
    const r = parse(inp.value);
    if (!r.ok) { C.toast(t('tvInvalid')); const cur = J().segmentOverride(line, inp.dataset.a, inp.dataset.b); inp.value = cur === null ? '' : fmtSet(cur); return; }
    C.checkpoint();
    setTime(line, inp.dataset.a, inp.dataset.b, r.value);
    if (r.value !== null) inp.value = fmtSet(r.value);
    refreshRow(inp, line);
    C.render(); C.saveMap();
  });
  X.click.push(function (e) {
    const tg = e.target && e.target.closest ? e.target : null;
    if (!tg || !C) return false;
    const rs = tg.closest('[data-tvreset]');
    if (rs && !rs.disabled) {
      const line = C.lineById(rs.dataset.line);
      if (line) {
        C.checkpoint(); setTime(line, rs.dataset.a, rs.dataset.b, null);
        const inp = rs.closest('.tv-row').querySelector('[data-tvt]'); inp.value = '';
        refreshRow(inp, line); C.render(); C.saveMap();
      }
      return true;
    }
    const act = tg.closest('[data-tvpop]');
    if (act) {
      if (act.dataset.tvpop === 'done') commitPop();
      else if (popFor && !act.disabled) { const line = C.lineById(popFor.lid); if (line) { C.checkpoint(); setTime(line, popFor.a, popFor.b, null); C.changed(); } closePop(); }
      return true;
    }
    if (pop && !tg.closest('.tv-pop') && !tg.closest('[data-tvp]')) closePop();
    return false;
  });

  window.GMMCTimes = { pairsOf, setTime, parse, MIN, MAX };
  X.ready.push(function (gmmc) { C = gmmc; });
})();
