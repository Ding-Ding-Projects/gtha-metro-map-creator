// mod-simulate.js: see docs/features/simulate.md. Live service simulation: vehicles run along every visible
// route at the frequency of the current time band, drawn on a canvas over the map, with a Material bottom bar
// and a short video clip recorder. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const hk = (n) => (X[n] = X[n] || []);

  window.I18N.add({
    simTitle: 'Simulate service', simPlay: 'Play', simPause: 'Pause', simStep: 'Step 1 minute', simClock: 'Simulated time',
    simSpeed: 'Speed', simVehicles: 'vehicles', simRecord: 'Record clip', simRecording: 'Recording', simClose: 'Close simulation',
    simBand_peak: 'Weekday peak', simBand_midday: 'Weekday midday', simBand_evening: 'Weekday evening', simBand_offpeak: 'Weekday off-peak', simBand_weekend: 'Weekend',
    simDay: 'Switch between weekday and weekend', simNoRecorder: 'This browser cannot record video clips (MediaRecorder with WebM is needed).',
    simClipSaved: 'Clip saved', simClipFailed: 'The clip could not be recorded', simNoMap: 'There is no route to simulate'
  }, {
    simTitle: '模擬班次', simPlay: '播放', simPause: '暫停', simStep: '前進一分鐘', simClock: '模擬時間',
    simSpeed: '速度', simVehicles: '架車輛', simRecord: '錄製短片', simRecording: '錄影中', simClose: '關閉模擬',
    simBand_peak: '平日繁忙時段', simBand_midday: '平日日間', simBand_evening: '平日晚間', simBand_offpeak: '平日非繁忙時段', simBand_weekend: '週末',
    simDay: '切換平日與週末', simNoRecorder: '此瀏覽器無法錄製影片（需要支援 WebM 的 MediaRecorder）。',
    simClipSaved: '短片已儲存', simClipFailed: '無法錄製短片', simNoMap: '沒有可模擬的路線'
  });

  // ---------- model ----------
  const KMH = { solid: 32, rail: 55, brt: 24, bus: 18, express: 32 * 1.3, superExpress: 32 * 1.6, dashed: 30 };
  const DWELL = 30;            // seconds at each stop
  const SPEEDS = [1, 10, 60];
  const DAY = 86400;
  let GM = null;

  const st = { on: false, playing: true, speed: 10, t: 8 * 3600, weekend: false, reduced: false, reducedForced: null };
  let models = [];             // per visible line: timetable and pixel polyline
  let geomD = null;            // last drawn map
  let geomDirty = true;
  let canvas = null, ctx = null, bar = null, fabBtn = null, raf = 0, last = 0, lastKey = '', recording = false;
  const lengthKm = new Map();  // line id -> real length, kept so a clip can reuse it for the exported scene

  const rad = (d) => d * Math.PI / 180;
  function haversine(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const hasCoord = (s) => !!s && s.lat !== null && s.lat !== undefined && s.lon !== null && s.lon !== undefined && Number.isFinite(+s.lat) && Number.isFinite(+s.lon);

  function bandOf(t, weekend) {
    if (weekend) return 'weekend';
    const h = (t % DAY) / 3600;
    if (h >= 7 && h < 9) return 'peak';
    if (h >= 10 && h < 15) return 'midday';
    if (h >= 19 && h < 22) return 'evening';
    return 'offpeak';
  }
  const okFreq = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(+v) && +v >= 1;
  function headwayMin(line, band) {
    const f = line.freq || {};
    if (okFreq(f[band])) return +f[band];
    if (okFreq(f.offpeak)) return +f.offpeak;
    return 10;
  }

  /** Timetable of one line from its drawn polyline: stop distances, dwell and running time in seconds. */
  function buildModel(g, D, unit, kmFixed) {
    const line = g.line, poly = g.poly;
    if (!poly || poly.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
    const total = cum[cum.length - 1];
    if (!(total > 0)) return null;
    // vertex index in poly where each path node sits, replaying how computeGeometry joins the edges
    const posIdx = {};
    let n = 0;
    for (const e of g.edges) {
      if (!e.pts.length) continue;
      let pts = e.pts;
      if (n && Math.hypot(poly[n - 1].x - pts[0].x, poly[n - 1].y - pts[0].y) < 0.5) { posIdx[e.index] = n - 1; pts = pts.slice(1); } else posIdx[e.index] = n;
      n += pts.length;
      posIdx[e.index + 1] = n - 1;
    }
    const skip = new Set(Array.isArray(line.skip) ? line.skip : (line.skip && typeof line.skip === 'object' ? Object.keys(line.skip).filter((k) => line.skip[k]) : []));
    const stops = [];
    line.path.forEach((ref, i) => {
      if (ref[0] === '@' || posIdx[i] === undefined || !D.stations[ref]) return;
      stops.push({ ref, d: cum[Math.min(poly.length - 1, posIdx[i])] / total, dwell: skip.has(ref) ? 0 : DWELL });
    });
    if (stops.length < 2) { stops.length = 0; stops.push({ ref: '', d: 0, dwell: DWELL }, { ref: '', d: 1, dwell: DWELL }); }
    stops[0].d = 0; stops[stops.length - 1].d = 1;
    // real length: haversine over consecutive stops when every stop has coordinates, else grid units * 0.9 km
    let km = 0, coords = stops.length > 1;
    for (let i = 0; i < stops.length && coords; i++) if (!hasCoord(D.stations[stops[i].ref])) coords = false;
    if (coords) for (let i = 1; i < stops.length; i++) km += haversine(D.stations[stops[i - 1].ref], D.stations[stops[i].ref]);
    else km = total / unit * 0.9;
    if (kmFixed && kmFixed > 0) km = kmFixed;
    km = Math.max(km, 0.05);
    const mps = (KMH[line.style] || 32) / 3.6; // km/h -> m/s
    const segs = [];
    let tm = 0;
    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (s.dwell) { segs.push({ t0: tm, t1: tm + s.dwell, f0: s.d, f1: s.d }); tm += s.dwell; }
      if (i < stops.length - 1) {
        // a user-set travel time (line.times) replaces the estimate; it includes the dwell at the departure stop
        const ov = window.GMMCJourney && s.ref ? window.GMMCJourney.segmentOverride(line, s.ref, stops[i + 1].ref) : null;
        const dt = ov !== null ? Math.max(5, ov * 60 - s.dwell) : (stops[i + 1].d - s.d) * km * 1000 / mps;
        segs.push({ t0: tm, t1: tm + dt, f0: s.d, f1: stops[i + 1].d });
        tm += dt;
      }
    }
    return { line, poly, cum, total, stops, km, segs, T: Math.max(tm, 1) };
  }
  function fracAt(m, tau) {
    const segs = m.segs;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (tau < s.t1 || i === segs.length - 1) return s.t1 === s.t0 ? s.f0 : s.f0 + (s.f1 - s.f0) * Math.min(1, Math.max(0, (tau - s.t0) / (s.t1 - s.t0)));
    }
    return 0;
  }
  function pointAt(m, f) {
    const target = Math.min(1, Math.max(0, f)) * m.total, c = m.cum;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= target) lo = mid; else hi = mid; }
    const span = c[hi] - c[lo], u = span > 0 ? (target - c[lo]) / span : 0;
    return { x: m.poly[lo].x + (m.poly[hi].x - m.poly[lo].x) * u, y: m.poly[lo].y + (m.poly[hi].y - m.poly[lo].y) * u };
  }
  /** Positions of all vehicles of a model at the given time, both directions. */
  function vehicles(m, tSec, band) {
    const hw = headwayMin(m.line, band) * 60;
    const nDir = Math.max(1, Math.ceil(m.T / hw));
    const out = [];
    for (let k = 0; k < nDir; k++) {
      const a = (((tSec + k * hw) % m.T) + m.T) % m.T;
      out.push(pointAt(m, fracAt(m, a)));
      const b = (((tSec + k * hw + hw / 2) % m.T) + m.T) % m.T;
      out.push(pointAt(m, 1 - fracAt(m, b)));
    }
    return out;
  }

  function refreshModels() {
    if (!GM) return;
    const D = geomD || GM.viewMap(GM.dm());
    const unit = GM.G * (GM.isGeo() ? GM.getView().k : 1);
    models = [];
    for (const g of GM.computeGeometry(D)) {
      const m = buildModel(g, D, unit);
      if (m) { models.push(m); lengthKm.set(g.line.id, m.km); }
    }
    geomDirty = false;
  }

  const fmtClock = (t) => { const s = Math.floor(t % DAY); return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0'); };
  const totalVehicles = () => { const band = bandOf(st.t, st.weekend); let n = 0; for (const m of models) n += vehicles(m, st.t, band).length; return n; };

  // ---------- canvas ----------
  const stage = () => document.getElementById('stage');
  function sizeCanvas() {
    const r = stage().getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; lastKey = ''; }
    return dpr;
  }
  function drawDots(c, list, tx) {
    for (const { color, pts } of list) {
      for (const p of pts) {
        const q = tx(p);
        c.beginPath(); c.arc(q.x, q.y, 4, 0, Math.PI * 2); c.fillStyle = color; c.fill();
        c.lineWidth = 1.5; c.strokeStyle = '#FFFFFF'; c.stroke();
      }
    }
  }
  const collect = (band) => models.map((m) => ({ color: m.line.color, pts: vehicles(m, st.t, band) }));
  function draw(force) {
    if (!st.on || !canvas) return;
    const view = GM.getView();
    const key = [Math.floor(st.t * 4), view.tx, view.ty, view.k, GM.isGeo(), canvas.width, canvas.height, st.speed, st.playing].join('|');
    if (!force && key === lastKey) return;
    lastKey = key;
    const dpr = sizeCanvas();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    const sx = GM.isGeo() ? 1 : view.k;
    drawDots(ctx, collect(bandOf(st.t, st.weekend)), (p) => ({ x: p.x * sx + view.tx, y: p.y * sx + view.ty }));
    updateBar();
  }

  // ---------- animation loop ----------
  function frame(now) {
    raf = 0;
    if (!st.on || document.hidden) return;
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
    if (geomDirty) refreshModels();
    if (st.playing && !st.reduced) st.t = (st.t + dt * st.speed) % DAY;
    draw(false);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && st.on && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else kick(); });

  // ---------- bar ----------
  const T = (k) => (GM ? GM.t(k) : k);
  const SVG = {
    play: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
    pause: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    step: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5v14l8-7zM16 5h2v14h-2z"/></svg>',
    bus: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 16c0 .9.4 1.7 1 2.2V20c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1h8v1c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM18 11H6V6h12z"/></svg>'
  };
  function buildBar() {
    bar = document.createElement('div');
    bar.id = 'simBar'; bar.className = 'sim-bar'; bar.setAttribute('role', 'group'); bar.hidden = true;
    bar.innerHTML = `<button type="button" class="sim-play" id="simPlay"></button>
      <button type="button" class="sim-play sim-step" id="simStep" hidden>${SVG.step}</button>
      <div class="sim-time"><strong id="simClock" role="timer" aria-live="off">08:00</strong><button type="button" class="sim-band" id="simBand"></button></div>
      <div class="segmented sim-speed" role="group" id="simSpeed">${SPEEDS.map((s) => `<button type="button" data-speed="${s}" aria-pressed="false">${s}x</button>`).join('')}</div>
      <span class="sim-count" id="simCount"></span>
      <button type="button" class="btn outlined sim-rec" id="simRec"></button>
      <button type="button" class="sim-close" id="simClose">&times;</button>`;
    stage().appendChild(bar);
    bar.querySelector('#simPlay').addEventListener('click', () => api.toggle());
    bar.querySelector('#simStep').addEventListener('click', () => api.step(60));
    bar.querySelector('#simBand').addEventListener('click', () => { st.weekend = !st.weekend; draw(true); });
    bar.querySelector('#simSpeed').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) api.setSpeed(+b.dataset.speed); });
    bar.querySelector('#simRec').addEventListener('click', () => { api.record({ seconds: 10 }).catch(() => {}); });
    bar.querySelector('#simClose').addEventListener('click', () => api.stop());
  }
  function updateBar() {
    if (!bar) return;
    const q = (id) => bar.querySelector('#' + id);
    const running = st.playing && !st.reduced;
    const playBtn = q('simPlay');
    playBtn.innerHTML = running ? SVG.pause : SVG.play;
    const pl = running ? T('simPause') : T('simPlay');
    playBtn.setAttribute('aria-label', pl); playBtn.title = pl + ' (P)';
    playBtn.hidden = st.reduced;
    q('simStep').hidden = !st.reduced; q('simStep').setAttribute('aria-label', T('simStep')); q('simStep').title = T('simStep');
    q('simClock').textContent = fmtClock(st.t);
    q('simClock').setAttribute('aria-label', T('simClock'));
    const band = q('simBand'); band.textContent = T('simBand_' + bandOf(st.t, st.weekend)); band.title = T('simDay');
    q('simSpeed').setAttribute('aria-label', T('simSpeed'));
    for (const b of q('simSpeed').querySelectorAll('button')) { const on = +b.dataset.speed === st.speed; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    q('simCount').textContent = totalVehicles() + ' ' + T('simVehicles');
    q('simRec').textContent = recording ? T('simRecording') : T('simRecord'); q('simRec').disabled = recording;
    q('simClose').setAttribute('aria-label', T('simClose')); q('simClose').title = T('simClose');
    bar.setAttribute('aria-label', T('simTitle'));
    if (fabBtn) { fabBtn.setAttribute('aria-pressed', String(st.on)); fabBtn.setAttribute('aria-label', T('simTitle')); fabBtn.title = T('simTitle') + ' (P)'; }
  }

  // ---------- clip recording ----------
  async function record(opts) {
    opts = opts || {};
    const seconds = Math.max(1, Math.min(60, +opts.seconds || 10));
    const quiet = opts.toast === false;
    if (recording) throw new Error('busy');
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
    if (!window.MediaRecorder || !mime || !HTMLCanvasElement.prototype.captureStream) {
      if (!quiet) GM.toast(T('simNoRecorder'));
      throw new Error('simNoRecorder');
    }
    if (!st.on) api.start();
    if (geomDirty) refreshModels();
    recording = true; updateBar();
    let url = '';
    try {
      // the exported scene: the whole map on white, without background tiles
      const scene = GM.exportScene();
      const svg = GM.standaloneSvg(scene, () => '');
      const dim = /width="(\d+)" height="(\d+)"/.exec(svg);
      const w0 = +dim[1], h0 = +dim[2], sc = Math.min(1, 1280 / Math.max(w0, h0));
      const cw = Math.max(2, Math.round(w0 * sc) & ~1), ch = Math.max(2, Math.round(h0 * sc) & ~1);
      const img = new Image();
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.src = url;
      await img.decode();
      const off = document.createElement('canvas'); off.width = cw; off.height = ch;
      const c = off.getContext('2d');
      const rec = [];
      for (const g of GM.computeGeometry(scene.D)) { const m = buildModel(g, scene.D, GM.G, lengthKm.get(g.line.id)); if (m) rec.push(m); }
      const k = cw / scene.w;
      const tx = (p) => ({ x: (p.x - scene.x0) * k, y: (p.y - scene.y0) * k });
      const drawFrame = () => {
        c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, cw, ch);
        c.drawImage(img, 0, 0, cw, ch);
        const band = bandOf(st.t, st.weekend);
        drawDots(c, rec.map((m) => ({ color: m.line.color, pts: vehicles(m, st.t, band) })), tx);
        const label = fmtClock(st.t) + '  ' + T('simBand_' + band);
        c.font = '600 18px Roboto, "Segoe UI", Arial, sans-serif'; c.textBaseline = 'middle';
        const lw = c.measureText(label).width + 20;
        c.fillStyle = 'rgba(22,24,29,.78)'; c.fillRect(8, ch - 40, lw, 32);
        c.fillStyle = '#FFFFFF'; c.fillText(label, 18, ch - 24);
      };
      drawFrame();
      const stream = off.captureStream(30);
      const chunks = [];
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const done = new Promise((res) => { mr.onstop = res; });
      let frames = 0, lastT = performance.now();
      mr.start(250);
      const timer = setInterval(() => {
        const now = performance.now(), dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
        if (st.playing && !st.reduced) st.t = (st.t + dt * st.speed) % DAY;
        drawFrame(); frames++;
      }, 1000 / 30);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      clearInterval(timer);
      mr.stop(); await done;
      stream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      if (!blob.size) throw new Error('empty');
      if (opts.download !== false) { GM.download('metro-simulation.webm', blob); if (!quiet) GM.toast(T('simClipSaved')); }
      return { bytes: blob.size, type: blob.type, frames, seconds, width: cw, height: ch, blob };
    } catch (err) {
      console.warn('simulation clip', err);
      if (!quiet) GM.toast(T('simClipFailed'));
      throw err;
    } finally { if (url) URL.revokeObjectURL(url); recording = false; lastKey = ''; draw(true); updateBar(); }
  }

  // ---------- public API ----------
  const reducedNow = () => (st.reducedForced !== null ? st.reducedForced : !!(mq && mq.matches));
  const api = window.GMMCSim = {
    start() {
      if (!GM || st.on) return;
      st.on = true; geomDirty = true; lastKey = '';
      canvas.hidden = false; bar.hidden = false;
      refreshModels();
      if (!models.length) GM.toast(T('simNoMap'));
      draw(true); kick();
    },
    stop() { if (!st.on) return; st.on = false; canvas.hidden = true; bar.hidden = true; if (raf) cancelAnimationFrame(raf); raf = 0; updateBar(); },
    toggleSimulation() { if (st.on) api.stop(); else api.start(); },
    toggle() { if (st.reduced) return; st.playing = !st.playing; draw(true); kick(); },
    pause() { st.playing = false; draw(true); },
    play() { st.playing = true; draw(true); kick(); },
    step(seconds) { st.t = (st.t + (+seconds || 60)) % DAY; draw(true); },
    setSpeed(s) { if (SPEEDS.includes(+s)) { st.speed = +s; draw(true); } },
    setClock(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm)); if (m) { st.t = (+m[1] * 3600 + +m[2] * 60) % DAY; draw(true); } },
    setWeekend(b) { st.weekend = !!b; draw(true); },
    setReducedMotion(v) { st.reducedForced = v === null || v === undefined ? null : !!v; st.reduced = reducedNow(); draw(true); kick(); },
    record,
    state() {
      const band = bandOf(st.t, st.weekend);
      const lines = {};
      for (const m of models) {
        const n = vehicles(m, st.t, band).length;
        lines[m.line.id] = { name: m.line.name, headwayMin: headwayMin(m.line, band), vehicles: n, perDirection: n / 2, oneWayMin: +(m.T / 60).toFixed(2), lengthKm: +m.km.toFixed(2), stops: m.stops.length };
      }
      return { on: st.on, playing: st.playing, speed: st.speed, reducedMotion: st.reduced, recording, clock: fmtClock(st.t), seconds: st.t, band, weekend: st.weekend, total: Object.values(lines).reduce((a, l) => a + l.vehicles, 0), lines };
    }
  };

  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { st.reduced = reducedNow(); draw(true); kick(); });

  hk('afterRender').push((D) => {
    geomD = D; geomDirty = true;
    if (st.on) { refreshModels(); lastKey = ''; draw(true); }
  });
  hk('keydown').push((e, typing) => {
    if (typing || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'p') return false;
    e.preventDefault(); api.toggleSimulation(); return true;
  });
  hk('ready').push((G) => {
    GM = G;
    st.reduced = reducedNow();
    canvas = document.createElement('canvas');
    canvas.id = 'simCanvas'; canvas.className = 'sim-canvas'; canvas.hidden = true; canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    G.svgEl().insertAdjacentElement('afterend', canvas);
    buildBar();
    const col = stage().querySelector('.fab-col');
    if (col) {
      fabBtn = document.createElement('button');
      fabBtn.type = 'button'; fabBtn.className = 'fab'; fabBtn.id = 'simBtn'; fabBtn.innerHTML = SVG.bus;
      fabBtn.addEventListener('click', () => api.toggleSimulation());
      col.appendChild(fabBtn);
    }
    updateBar();
    window.addEventListener('resize', () => { lastKey = ''; draw(true); });
  });
})();
