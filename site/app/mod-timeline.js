// mod-timeline.js: network timeline. See docs/features/timeline.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  ['validate', 'transform', 'svgOver', 'inspector', 'input', 'keydown', 'afterRender', 'ready'].forEach((k) => { X[k] = X[k] || []; });

  const MIN_YEAR = 1800, MAX_YEAR = 2100;
  /** Opening years written into the built-in template only where they are certain. Other lines stay blank. */
  const TEMPLATE_YEARS = { l1: 1954, l2: 1966, l4: 2002, up: 2015 };

  const tl = { enabled: false, year: null, playing: false, timer: 0, lastYear: null, prevOpen: null };
  let G = null; // the GMMC editor API, set at ready time
  let bar = null;

  const t = (k) => (G ? G.t(k) : k);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function cleanYear(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
  }
  const isOpen = (o, year) => !((o.opens != null && o.opens > year) || (o.closes != null && o.closes <= year));

  // ---------- template years ----------
  if (window.GTHATemplates && typeof window.GTHATemplates.gtha === 'function') {
    const original = window.GTHATemplates.gtha;
    window.GTHATemplates.gtha = function () {
      const m = original.apply(this, arguments);
      for (const l of m.lines) if (TEMPLATE_YEARS[l.id] !== undefined && l.opens === undefined) l.opens = TEMPLATE_YEARS[l.id];
      return m;
    };
  }

  // ---------- strings ----------
  window.I18N.add({
    tlTitle: 'Network timeline', tlPlay: 'Play', tlPause: 'Pause', tlYear: 'Year', tlLinesOpen: 'lines open', tlLineOpen: 'line open',
    tlOpens: 'Opens', tlCloses: 'Closes', tlSection: 'Timeline', tlHelp: 'Years are optional. Leave a field blank when the date is unknown.',
    tlSetting: 'Show network timeline (Y)', tlOn: 'Timeline on', tlOff: 'Timeline off', tlShownFor: 'Network in'
  }, {
    tlTitle: '路網時間軸', tlPlay: '播放', tlPause: '暫停', tlYear: '年份', tlLinesOpen: '條路線通車', tlLineOpen: '條路線通車',
    tlOpens: '通車年份', tlCloses: '停駛年份', tlSection: '時間軸', tlHelp: '年份可留空。不確定的日期請保持空白。',
    tlSetting: '顯示路網時間軸 (Y)', tlOn: '已開啟時間軸', tlOff: '已關閉時間軸', tlShownFor: '路網年份'
  });

  // ---------- validation ----------
  X.validate.push((src, out) => {
    const grab = (from, to) => {
      const o = cleanYear(from && from.opens), c = cleanYear(from && from.closes);
      if (o !== null) to.opens = o;
      if (c !== null) to.closes = c;
    };
    for (const [id, s] of Object.entries(src.stations || {})) if (out.stations[id]) grab(s, out.stations[id]);
    (src.lines || []).forEach((l, i) => { if (out.lines[i]) grab(l, out.lines[i]); });
  });

  // ---------- year range ----------
  function years(map) {
    const set = new Set();
    for (const o of map.lines.concat(Object.values(map.stations))) { if (o.opens != null) set.add(o.opens); if (o.closes != null) set.add(o.closes); }
    return [...set].sort((a, b) => a - b);
  }
  function range(map) {
    const ys = years(map);
    if (!ys.length) return { min: 1950, max: 2030, ys };
    let min = ys[0], max = ys[ys.length - 1];
    if (min === max) { min -= 1; max += 1; }
    return { min, max, ys };
  }

  // ---------- transform ----------
  X.transform.push((m) => {
    if (!tl.enabled) return null;
    const year = tl.year;
    const openLine = new Map(m.lines.map((l) => [l.id, isOpen(l, year)]));
    const served = new Map();
    for (const l of m.lines) for (const r of l.path) { if (r[0] === '@') continue; served.set(r, served.get(r) || openLine.get(l.id)); }
    const stations = {};
    for (const [id, s] of Object.entries(m.stations)) {
      if (!isOpen(s, year)) continue;
      if (served.has(id) && !served.get(id)) continue; // served only by lines that are not open
      stations[id] = s;
    }
    const lines = [];
    for (const l of m.lines) {
      if (!openLine.get(l.id)) continue;
      const path = l.path.filter((r) => r[0] === '@' || stations[r]);
      while (path.length && path[0][0] === '@') path.shift();
      while (path.length && path[path.length - 1][0] === '@') path.pop();
      lines.push(Object.assign({}, l, { path }));
    }
    const transfers = (m.transfers || []).filter((x) => stations[x.a] && stations[x.b]);
    return Object.assign({}, m, { stations, lines, transfers, _timelineYear: year });
  });

  // ---------- exports ----------
  X.svgOver.push((m, ctx) => {
    if (!tl.enabled || !ctx || !ctx.opts || !ctx.opts.exportColors) return '';
    const pts = Object.values(m.stations);
    if (!pts.length) return '';
    const x = Math.min(...pts.map((s) => s.x)) * ctx.G, y = Math.min(...pts.map((s) => s.y)) * ctx.G;
    return `<text class="timeline-year" x="${x.toFixed(1)}" y="${(y - 84).toFixed(1)}" font-size="18" font-weight="600" fill="#545249">${esc(t('tlShownFor'))} ${tl.year}</text>`;
  });

  // ---------- inspector ----------
  function target(sel, map) {
    if (!sel) return null;
    if (sel.type === 'station' && sel.ids.length === 1) return map.stations[sel.ids[0]] || null;
    if (sel.type === 'line' || sel.type === 'edge') return map.lines.find((l) => l.id === (sel.lineId || sel.id)) || null;
    return null;
  }
  X.inspector.push((sel, map) => {
    const o = target(sel, map);
    if (!o) return '';
    const field = (key, label, val) => `<label class="tf"><span class="tf-label">${esc(label)}</span><input type="number" min="${MIN_YEAR}" max="${MAX_YEAR}" step="1" inputmode="numeric" data-f="tl.${key}" value="${val == null ? '' : val}" placeholder="-"></label>`;
    return `<div class="insp tl-insp"><h3 class="title-sm">${esc(t('tlSection'))}</h3><div class="two">${field('opens', t('tlOpens'), o.opens)}${field('closes', t('tlCloses'), o.closes)}</div><p class="supporting">${esc(t('tlHelp'))}</p></div>`;
  });
  let checkpointed = null;
  document.addEventListener('focusin', () => { checkpointed = null; });
  X.input.push((f, e, sel) => {
    if (f !== 'tl.opens' && f !== 'tl.closes') return false;
    const o = target(sel, G.getMap());
    if (!o) return true;
    const key = f.slice(3), y = cleanYear(e.target.value);
    e.target.setAttribute('aria-invalid', String(e.target.value !== '' && y === null));
    if (e.target.value !== '' && y === null) return true;
    if (checkpointed !== e.target) { G.checkpoint(); checkpointed = e.target; }
    if (y === null) delete o[key]; else o[key] = y;
    G.render();
    return true;
  });
  document.addEventListener('change', (e) => {
    const f = e.target && e.target.dataset && e.target.dataset.f;
    if (G && (f === 'tl.opens' || f === 'tl.closes')) G.changed();
  });

  // ---------- timeline bar ----------
  const PLAY = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  function buildBar() {
    const stage = document.getElementById('stage');
    bar = document.createElement('div');
    bar.className = 'tl-bar'; bar.id = 'timelineBar'; bar.hidden = true;
    bar.setAttribute('role', 'group');
    bar.innerHTML = '<button type="button" class="tl-play" id="tlPlay"></button>' +
      '<span class="tl-year" id="tlYear" aria-live="off"></span>' +
      '<div class="tl-track"><input type="range" id="tlSlider" step="1"><div class="tl-ticks" id="tlTicks" aria-hidden="true"></div></div>' +
      '<span class="tl-count" id="tlCount" aria-live="polite"></span>';
    stage.appendChild(bar);
    bar.querySelector('#tlPlay').addEventListener('click', () => (tl.playing ? stop() : play()));
    bar.querySelector('#tlSlider').addEventListener('input', (e) => { const y = +e.target.value; stop(); setYear(y); });
  }

  function refreshBar(D) {
    if (!bar) return;
    bar.hidden = !tl.enabled;
    const stage = document.getElementById('stage');
    if (stage) stage.classList.toggle('tl-on', tl.enabled);
    if (!tl.enabled) return;
    const map = G.getMap(), r = range(map);
    if (tl.year === null) tl.year = r.max;
    tl.year = Math.min(Math.max(tl.year, MIN_YEAR), MAX_YEAR);
    const slider = bar.querySelector('#tlSlider');
    slider.min = r.min; slider.max = r.max; slider.value = Math.min(Math.max(tl.year, r.min), r.max);
    slider.style.setProperty('--p', ((slider.value - r.min) / (r.max - r.min) * 100).toFixed(2) + '%');
    slider.setAttribute('aria-label', t('tlYear'));
    slider.setAttribute('aria-valuetext', String(tl.year));
    bar.setAttribute('aria-label', t('tlTitle'));
    bar.querySelector('#tlYear').textContent = tl.year;
    const playBtn = bar.querySelector('#tlPlay');
    playBtn.innerHTML = tl.playing ? PAUSE : PLAY;
    playBtn.setAttribute('aria-label', tl.playing ? t('tlPause') : t('tlPlay'));
    // tick labels for years where something opens, thinned so they never collide
    let ticks = '', lastPct = -100;
    for (const y of r.ys) {
      const pct = (y - r.min) / (r.max - r.min) * 100;
      if (pct - lastPct < 7 && ticks) continue;
      lastPct = pct;
      ticks += `<span style="left:${pct.toFixed(2)}%">${y}</span>`;
    }
    bar.querySelector('#tlTicks').innerHTML = ticks;
    const n = (D || G.viewMap(G.getMap())).lines.filter((l) => l.visible !== false).length;
    bar.querySelector('#tlCount').textContent = n + ' ' + t(n === 1 ? 'tlLineOpen' : 'tlLinesOpen');
  }

  function setYear(y) { tl.year = y; G.render(); }
  function stop() { tl.playing = false; clearInterval(tl.timer); tl.timer = 0; refreshBar(); }
  function play() {
    const r = range(G.getMap());
    if (reduced()) { stop(); setYear(r.max); return; }
    if (tl.year >= r.max) tl.year = r.min;
    tl.playing = true;
    G.render();
    clearInterval(tl.timer);
    tl.timer = setInterval(() => {
      const rr = range(G.getMap());
      if (tl.year >= rr.max) { stop(); return; }
      tl.year += 1;
      G.render();
      if (tl.year >= rr.max) stop();
    }, 400);
  }
  function setEnabled(on) {
    tl.enabled = !!on;
    if (!tl.enabled) { stop(); tl.prevOpen = null; tl.lastYear = null; }
    else if (tl.year === null) tl.year = range(G.getMap()).max;
    const sw = document.getElementById('setTimeline'); if (sw) sw.checked = tl.enabled;
    G.render();
    G.toast(t(tl.enabled ? 'tlOn' : 'tlOff'));
  }

  X.keydown.push((e, typing) => {
    if (typing || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'y') return false;
    e.preventDefault(); setEnabled(!tl.enabled); return true;
  });

  // ---------- after render: bar state and draw-in animation ----------
  X.afterRender.push((D) => {
    refreshBar(D);
    if (!tl.enabled) return;
    const open = new Set(D.lines.map((l) => l.id));
    const advancing = tl.prevOpen && tl.lastYear !== null && tl.year > tl.lastYear;
    if (advancing && !reduced()) {
      const fresh = D.lines.filter((l) => !tl.prevOpen.has(l.id));
      const vp = document.getElementById('viewport');
      for (const l of fresh) {
        if (!vp) break;
        for (const p of vp.querySelectorAll('path:not(.hit)')) {
          if (p.getAttribute('stroke') !== l.color) continue;
          if (p.hasAttribute('stroke-dasharray')) { p.classList.add('tl-fade'); continue; }
          let len = 0; try { len = p.getTotalLength(); } catch { /* not measurable */ }
          if (len > 0) { p.style.setProperty('--tl-len', len.toFixed(0)); p.classList.add('tl-draw'); } else p.classList.add('tl-fade');
        }
      }
    }
    tl.prevOpen = open; tl.lastYear = tl.year;
  });

  // ---------- ready: build the bar and the Settings switch ----------
  X.ready.push((api) => {
    G = api;
    buildBar();
    const legend = document.getElementById('setLegend');
    const row = legend && legend.closest('.switch-row');
    if (row) {
      const label = document.createElement('label');
      label.className = 'switch-row';
      label.innerHTML = `<span data-t="tlSetting">${esc(t('tlSetting'))}</span><input id="setTimeline" type="checkbox" role="switch" class="switch">`;
      row.after(label);
      label.querySelector('input').addEventListener('change', (e) => { e.stopPropagation(); setEnabled(e.target.checked); });
    }
    const btn = document.getElementById('settingsBtn');
    if (btn) btn.addEventListener('click', () => { const sw = document.getElementById('setTimeline'); if (sw) sw.checked = tl.enabled; });
    G.applyI18n();
  });

  // Small scripting surface, also used by the verification steps.
  window.GMMCTimeline = {
    get state() { return { enabled: tl.enabled, year: tl.year, playing: tl.playing }; },
    enable: (on) => setEnabled(on === undefined ? true : on),
    setYear: (y) => { stop(); if (!tl.enabled) setEnabled(true); setYear(y); },
    play: () => { if (!tl.enabled) setEnabled(true); play(); },
    stop
  };
})();
