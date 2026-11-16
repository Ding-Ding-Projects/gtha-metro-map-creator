// mod-schematic.js: see docs/features/schematic.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const hk = (n) => (X[n] = X[n] || []);
  const SRC = document.currentScript && document.currentScript.src;
  const WORKER_URL = new URL('schematic-worker.js', SRC || location.href).href;
  let GM = null;
  let preview = null;   // { positions, stats, params } shown as an overlay
  let last = null;      // last result for the current slider values
  let busy = false;

  window.I18N.add({
    schTitle: 'Auto-schematic',
    schIntro: 'Turns real positions into a tidy diagram with 45-degree angles. Station order on every route is kept.',
    schSpacing: 'Spacing', schKeep: 'Keep geographic shape',
    schPercent: 'segments at 45°', schOrder: 'order changes', schCross: 'crossings',
    schPreview: 'Preview', schApply: 'Apply', schClear: 'Clear preview', schOpen: 'Auto-schematic…',
    schWorking: 'Working out the layout', schApplied: 'Schematic layout applied', schNoStations: 'Add stations and routes first',
    schFailed: 'Auto-schematic failed', schPreviewing: 'Previewing. Nothing has changed yet.',
    schOneBend: 'with one bend', schBefore: 'before', schRan: 'Computed in'
  }, {
    schTitle: '自動示意圖',
    schIntro: '將真實位置變成整齊嘅 45 度示意圖，每條路線嘅車站次序保持不變。',
    schSpacing: '站距', schKeep: '保留地理形狀',
    schPercent: '路段呈 45°', schOrder: '次序改變', schCross: '交叉',
    schPreview: '預覽', schApply: '套用', schClear: '清除預覽', schOpen: '自動示意圖…',
    schWorking: '計緊版面', schApplied: '已套用示意圖版面', schNoStations: '請先加車站同路線',
    schFailed: '自動示意圖失敗', schPreviewing: '預覽中，暫時未改任何嘢。',
    schOneBend: '有一個轉角', schBefore: '之前', schRan: '運算時間'
  });

  const t = (k) => (GM ? GM.t(k) : k);
  const el = (id) => document.getElementById(id);
  const params = () => ({ spacing: +(el('schSpacing') || { value: 2 }).value, keepShape: +(el('schKeep') || { value: 0.3 }).value });

  function collect() {
    const m = GM.getMap();
    return {
      stations: Object.values(m.stations).map((s) => { const g = GM.stGeo(s); return { id: s.id, x: g.x, y: g.y }; }),
      lines: m.lines.map((l) => ({ id: l.id, path: l.path.filter((r) => r[0] !== '@') }))
    };
  }

  let seq = 0;
  function solveAsync(input, onProgress) {
    const id = ++seq;
    const viaScript = () => new Promise((resolve, reject) => {
      const go = () => { try { resolve(window.GMMCSchematicSolve(input, onProgress)); } catch (e) { reject(e); } };
      if (window.GMMCSchematicSolve) { setTimeout(go, 0); return; }
      const s = document.createElement('script');
      s.src = WORKER_URL; s.onload = () => setTimeout(go, 0); s.onerror = () => reject(new Error('worker script unavailable'));
      document.head.appendChild(s);
    });
    return new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(WORKER_URL); } catch (e) { viaScript().then(resolve, reject); return; }
      let settled = false;
      w.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.id !== id) return;
        if (d.progress !== undefined) { if (onProgress) onProgress(d.progress); return; }
        settled = true; w.terminate();
        if (d.error) reject(new Error(d.error)); else resolve(d.result);
      };
      w.onerror = () => { if (settled) return; settled = true; w.terminate(); viaScript().then(resolve, reject); };
      w.postMessage({ id, input });
    });
  }

  function centroid(points) {
    let x = 0, y = 0; for (const p of points) { x += p.x; y += p.y; }
    return points.length ? { x: x / points.length, y: y / points.length } : { x: 0, y: 0 };
  }

  /** Compute a schematic layout. Resolves { positions, stats, params, runtimeMs }. */
  async function run(p, onProgress) {
    const prm = { spacing: Math.min(4, Math.max(1, +(p && p.spacing) || 2)), keepShape: Math.min(1, Math.max(0, p && p.keepShape !== undefined ? +p.keepShape : 0.3)) };
    const input = collect();
    if (!input.stations.length) throw new Error('no stations');
    input.spacing = prm.spacing; input.keepShape = prm.keepShape;
    const t0 = performance.now();
    const res = await solveAsync(input, onProgress);
    // keep the diagram where the current schematic sits
    const old = centroid(Object.values(GM.getMap().stations)), now = centroid(Object.values(res.positions));
    const dx = Math.round(old.x - now.x), dy = Math.round(old.y - now.y);
    for (const id of Object.keys(res.positions)) { res.positions[id].x += dx; res.positions[id].y += dy; }
    return { positions: res.positions, stats: res.stats, params: prm, runtimeMs: Math.round(performance.now() - t0) };
  }

  /** Write a result into the map as one undoable step and switch to the schematic layout. */
  function apply(result) {
    if (!result || !result.positions) return false;
    const m = GM.getMap();
    GM.checkpoint();
    const before = Object.values(m.stations).map((s) => ({ id: s.id, x: s.x, y: s.y }));
    for (const s of Object.values(m.stations)) {
      const p = result.positions[s.id];
      if (p) { s.x = Math.round(p.x); s.y = Math.round(p.y); }
    }
    // keep free text labels beside the station they were next to
    for (const lb of m.labels || []) {
      let best = null, bd = Infinity;
      for (const b of before) { const d = Math.hypot(b.x - lb.x, b.y - lb.y); if (d < bd) { bd = d; best = b; } }
      const p = best && result.positions[best.id];
      if (p) { lb.x += Math.round(p.x) - best.x; lb.y += Math.round(p.y) - best.y; }
    }
    for (const l of m.lines) { l.path = l.path.filter((r) => r[0] !== '@'); l.bends = {}; }
    preview = null; last = null;
    GM.setLayout('schematic');
    GM.changed();
    GM.fit();
    refreshUi();
    return true;
  }

  // ---------- overlay ----------
  hk('svgOver').push((m, ctx) => {
    if (!preview || m._geo || (ctx.opts && ctx.opts.exportColors)) return '';
    const G = ctx.G, pos = preview.positions;
    let out = '<g class="sch-ghost" pointer-events="none">';
    for (const l of m.lines) {
      if (!l.visible) continue;
      const ids = l.path.filter((r) => r[0] !== '@' && pos[r]);
      for (let i = 0; i < ids.length - 1; i++) {
        if (ids[i] === ids[i + 1]) continue;
        const pts = GM.route(pos[ids[i]], pos[ids[i + 1]], 'early');
        out += '<path d="' + pts.map((p, k) => (k ? 'L' : 'M') + (p.x * G).toFixed(1) + ' ' + (p.y * G).toFixed(1)).join('') + '" fill="none" stroke="' + l.color + '" stroke-width="3" stroke-opacity=".7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 7"/>';
      }
    }
    for (const id of Object.keys(pos)) out += '<circle cx="' + (pos[id].x * G).toFixed(1) + '" cy="' + (pos[id].y * G).toFixed(1) + '" r="4.5" fill="var(--map-bg)" stroke="var(--md-primary)" stroke-width="2"/>';
    return out + '</g>';
  });
  hk('keydown').push((e) => { if (preview && e.key === 'Escape') { clearPreview(); return true; } return false; });

  function clearPreview() { if (!preview) return; preview = null; GM.render(); refreshUi(); }

  // ---------- panel ----------
  function setBusy(on, frac) {
    busy = on;
    const bar = el('schProgress');
    if (!bar) return;
    bar.hidden = !on;
    if (on) bar.firstElementChild.style.width = Math.round((frac || 0) * 100) + '%';
    bar.setAttribute('aria-valuenow', String(Math.round((frac || 0) * 100)));
    el('schPreview').disabled = on; el('schApply').disabled = on; el('schBody').setAttribute('aria-busy', on ? 'true' : 'false');
    if (on) el('schNote').textContent = t('schWorking') + '…';
  }
  function refreshUi() {
    if (!el('schSec')) return;
    el('schSpacingOut').textContent = (+el('schSpacing').value).toFixed(1);
    el('schKeepOut').textContent = Math.round(+el('schKeep').value * 100) + '%';
    el('schClear').hidden = !preview;
    el('schIntroT').title = preview ? t('schPreviewing') : '';
    const s = last && last.stats;
    el('schStatPct').textContent = s ? Math.round(s.straightShare * 100) + '%' : '–';
    el('schStatOrder').textContent = s ? String(s.orderChanges) : '–';
    el('schStatCross').textContent = s ? String(s.crossings) : '–';
    if (!busy) {
      el('schNote').textContent = s
        ? Math.round(s.oneBendShare * 100) + '% ' + t('schOneBend') + ' · ' + t('schCross') + ' ' + t('schBefore') + ': ' + s.crossingsBefore + ' · ' + last.runtimeMs + ' ms'
        : '';
    }
  }
  function relabel() {
    for (const [id, k] of [['schTitleT', 'schTitle'], ['schIntroT', 'schIntro'], ['schSpacingT', 'schSpacing'], ['schKeepT', 'schKeep'], ['schPctT', 'schPercent'], ['schOrderT', 'schOrder'], ['schCrossT', 'schCross'], ['schPreview', 'schPreview'], ['schApply', 'schApply'], ['schClear', 'schClear'], ['schOpen', 'schOpen']]) {
      const n = el(id); if (n) n.textContent = t(k);
    }
  }

  async function doRun(forPreview) {
    if (busy) return null;
    if (!Object.keys(GM.getMap().stations).length || !GM.getMap().lines.length) { GM.toast(t('schNoStations')); return null; }
    setBusy(true, 0);
    try {
      const res = await run(params(), (f) => setBusy(true, f));
      last = res;
      setBusy(false);
      if (forPreview) { preview = res; GM.setLayout('schematic'); GM.render(); }
      refreshUi();
      return res;
    } catch (err) {
      console.error('auto-schematic', err);
      setBusy(false); el('schNote').textContent = t('schFailed'); GM.toast(t('schFailed'));
      return null;
    }
  }

  function build() {
    const aside = document.querySelector('aside.panel.right');
    if (!aside) return;
    const sec = document.createElement('section');
    sec.id = 'schSec'; sec.className = 'sch-sec';
    sec.innerHTML = '<details open id="schDetails"><summary id="schTitleT" class="title-sm"></summary>'
      + '<div id="schBody">'
      + '<p class="supporting sch-intro" id="schIntroT"></p>'
      + '<label class="tf tf-range sch-range"><span class="tf-label"><span id="schSpacingT"></span> <output id="schSpacingOut" for="schSpacing"></output></span><input id="schSpacing" type="range" min="1" max="4" step="0.5" value="2"></label>'
      + '<label class="tf tf-range sch-range"><span class="tf-label"><span id="schKeepT"></span> <output id="schKeepOut" for="schKeep"></output></span><input id="schKeep" type="range" min="0" max="1" step="0.05" value="0.3"></label>'
      + '<div class="sch-stats" role="group" aria-label="Auto-schematic results">'
      + '<div><b id="schStatPct">–</b><span id="schPctT"></span></div>'
      + '<div><b id="schStatOrder">–</b><span id="schOrderT"></span></div>'
      + '<div><b id="schStatCross">–</b><span id="schCrossT"></span></div></div>'
      + '<div class="sch-progress" id="schProgress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden><span></span></div>'
      + '<p class="supporting" id="schNote" role="status" aria-live="polite"></p>'
      + '<div class="sch-actions"><button type="button" class="btn outlined" id="schPreview"></button><button type="button" class="btn filled" id="schApply"></button></div>'
      + '<button type="button" class="btn text sm" id="schClear" hidden></button>'
      + '</div></details>';
    const h = aside.querySelector('h2');
    aside.insertBefore(sec, h || aside.firstChild);
    relabel(); refreshUi();
    for (const id of ['schSpacing', 'schKeep']) el(id).addEventListener('input', () => { last = null; if (preview) { preview = null; GM.render(); } refreshUi(); });
    el('schPreview').addEventListener('click', () => { doRun(true); });
    el('schClear').addEventListener('click', clearPreview);
    el('schApply').addEventListener('click', async () => {
      const res = (last && !busy) ? last : await doRun(false);
      if (res && apply(res)) GM.toast(t('schApplied'), true);
    });
    // reachable from Settings too
    const row = document.querySelector('#settingsDialog .dialog-scroll .row.wrap');
    if (row) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn outlined'; b.id = 'schOpen';
      b.addEventListener('click', () => {
        const d = el('settingsDialog'); if (d && d.close) d.close();
        el('schDetails').open = true; sec.scrollIntoView({ block: 'start' }); el('schSpacing').focus();
      });
      row.insertBefore(b, row.firstChild); relabel();
    }
    // keep labels current when the language changes
    let lang = GM.getSettings().lang;
    hk('afterRender').push(() => { const l = GM.getSettings().lang; if (l !== lang) { lang = l; relabel(); refreshUi(); } });
  }

  hk('ready').push((g) => { GM = g; build(); });
  window.GMMCSchematic = {
    run: (p, cb) => run(p, cb), apply: (r) => apply(r),
    preview: (r) => { preview = r; GM.setLayout('schematic'); GM.render(); }, clear: clearPreview
  };
})();
