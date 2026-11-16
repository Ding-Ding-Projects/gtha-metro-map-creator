// mod-styles.js: map style presets. See docs/features/styles.md.
// Presets are stored as settings.mapStyle and in the project file; they change drawing through
// the lineStyle, stationMarker, labelStyle and exportTheme hooks and a data attribute on #stage.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const hooks = (n) => (X[n] = X[n] || []);

  window.I18N.add({
    mapStyle: 'Map style', mapStyleHint: 'How lines, stations and labels are drawn, on the map and in exports.',
    ms_material: 'Material', ms_material_d: 'Rings, rounded lines',
    ms_classic: 'Classic metro', ms_classic_d: 'Ticks, bold capitals',
    ms_frequent: 'Frequent network', ms_frequent_d: 'Width follows frequency',
    ms_night: 'Night', ms_night_d: 'Dark paper, bright lines',
    mapStyleSet: 'Map style changed'
  }, {
    mapStyle: '地圖風格', mapStyleHint: '路線、車站同標籤喺地圖同匯出檔嘅畫法。',
    ms_material: '物料設計', ms_material_d: '圓環、圓角線條',
    ms_classic: '經典地鐵', ms_classic_d: '車站短橫、粗體大楷',
    ms_frequent: '班次網絡', ms_frequent_d: '線條闊度跟班次',
    ms_night: '夜間', ms_night_d: '深色紙面、光亮線條',
    mapStyleSet: '地圖風格已更改'
  });

  const PRESETS = [
    { id: 'material', sw: ['#1565c0', '#1565c0'], bg: '#ffffff' },
    { id: 'classic', sw: ['#c8102e', '#c8102e'], bg: '#ffffff' },
    { id: 'frequent', sw: ['#1b8a3a', '#9aa0a6'], bg: '#ffffff' },
    { id: 'night', sw: ['#ffd400', '#46d2ff'], bg: '#15171c' }
  ];
  const IDS = PRESETS.map((p) => p.id);
  const NIGHT_BG = '#15171c';
  const current = () => {
    const s = window.GMMC && window.GMMC.getSettings && window.GMMC.getSettings();
    return s && IDS.includes(s.mapStyle) ? s.mapStyle : 'material';
  };

  function lighten(hex, k) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return hex;
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  /** Width in pixels for a route frequency: peak headway in minutes, or off-peak when there is no peak. */
  function freqWidth(line) {
    const f = line.freq || {}, n = f.peak || f.offpeak;
    if (!n) return null;
    return n <= 10 ? 10 : n <= 15 ? 7 : n <= 30 ? 5 : 3;
  }
  /** Direction of the first serving route at a station, from the nearest drawn vertex. */
  function localDirection(s, c) {
    let best = null;
    for (const g of c.geo || []) {
      if (!g.line.path.includes(s.id) || g.poly.length < 2) continue;
      for (let i = 0; i < g.poly.length; i++) {
        const p = g.poly[i], d = Math.hypot(p.x - c.cx, p.y - c.cy);
        if (!best || d < best.d) { const a = g.poly[Math.max(0, i - 1)], b = g.poly[Math.min(g.poly.length - 1, i + 1)]; best = { d, dx: b.x - a.x, dy: b.y - a.y, w: g.line.width }; }
      }
    }
    if (!best || best.d > 24 || !(best.dx || best.dy)) return null;
    const len = Math.hypot(best.dx, best.dy);
    return { nx: -best.dy / len, ny: best.dx / len, w: best.w };
  }

  hooks('lineStyle').push((line) => {
    const st = current();
    if (st === 'classic') return Object.assign({}, line, { cap: 'square', join: 'miter' });
    if (st === 'frequent') {
      const w = freqWidth(line);
      return w ? Object.assign({}, line, { width: w }) : Object.assign({}, line, { width: 3, color: '#9AA0A6' });
    }
    if (st === 'night') return Object.assign({}, line, { color: lighten(line.color, 0.3) });
    return null;
  });

  hooks('stationMarker').push((m, s, c) => {
    const st = current();
    if (st === 'classic' && !c.inter) {
      const d = localDirection(s, c);
      if (!d) return '';
      const half = (s.kind === 'stop' ? 0.4 : 0.55) * d.w + 4;
      return `<line x1="${(c.cx - d.nx * half).toFixed(1)}" y1="${(c.cy - d.ny * half).toFixed(1)}" x2="${(c.cx + d.nx * half).toFixed(1)}" y2="${(c.cy + d.ny * half).toFixed(1)}" stroke="#16181D" stroke-width="${s.kind === 'stop' ? 2.4 : 3.6}" stroke-linecap="butt"/>`;
    }
    if (st === 'night') {
      if (s.kind === 'stop' && !c.inter) return `<circle cx="${c.cx}" cy="${c.cy}" r="3.6" fill="${NIGHT_BG}" stroke="${lighten(c.col, 0.3)}" stroke-width="2.2"/>`;
      return `<circle cx="${c.cx}" cy="${c.cy}" r="${c.inter ? 8.5 : 6}" fill="${NIGHT_BG}" stroke="${c.inter ? '#FFFFFF' : lighten(c.col, 0.3)}" stroke-width="${c.inter ? 3.5 : 3}"/>`;
    }
    return '';
  });

  hooks('labelStyle').push((m, s, c) => (current() === 'classic' ? { upper: true, weight: c.small ? 600 : 700 } : null));

  hooks('exportTheme').push(() => (current() === 'night'
    ? { bg: NIGHT_BG, ink: '#F1F1F4', halo: NIGHT_BG, sub: '#B8BAC4', tileFilter: 'invert(1) hue-rotate(180deg) brightness(.8) contrast(.9) saturate(.5)' } : null));

  // ---------- picker ----------
  const sw = (p) => `<span class="ms-sw" style="--bg:${p.bg}"><i style="background:${p.sw[0]}"></i><i style="background:${p.sw[1]}"></i></span>`;
  function cardsHtml(where) {
    return `<div class="ms-cards" role="group" aria-label="${window.GMMC.esc(window.GMMC.t('mapStyle'))}" data-ms-where="${where}">` + PRESETS.map((p) =>
      `<button type="button" class="ms-card" data-ms="${p.id}" aria-pressed="false">${sw(p)}<span class="ms-text"><span class="ms-name"></span><span class="ms-desc"></span></span></button>`).join('') + '</div>';
  }
  function refreshCards() {
    const G = window.GMMC; if (!G) return;
    const st = current();
    document.querySelectorAll('.ms-card').forEach((b) => {
      const id = b.dataset.ms;
      b.setAttribute('aria-pressed', String(id === st));
      b.querySelector('.ms-name').textContent = G.t('ms_' + id);
      b.querySelector('.ms-desc').textContent = G.t('ms_' + id + '_d');
    });
    document.querySelectorAll('[data-ms-title]').forEach((n) => { n.textContent = G.t('mapStyle'); });
    document.querySelectorAll('[data-ms-hint]').forEach((n) => { n.textContent = G.t('mapStyleHint'); });
    document.querySelectorAll('.ms-cards').forEach((n) => n.setAttribute('aria-label', G.t('mapStyle')));
    const stage = document.getElementById('stage');
    if (stage) stage.dataset.mapstyle = st;
  }
  function setStyle(id) {
    const G = window.GMMC;
    if (!IDS.includes(id) || id === current()) return;
    G.getSettings().mapStyle = id;
    G.saveSettings();
    G.render();
    refreshCards();
    G.toast(G.t('mapStyleSet') + ': ' + G.t('ms_' + id));
  }
  hooks('click').push((e) => {
    const b = e.target.closest && e.target.closest('.ms-card');
    if (!b) return false;
    e.preventDefault();
    setStyle(b.dataset.ms);
    return true;
  });
  hooks('afterRender').push(refreshCards);

  hooks('ready').push((G) => {
    const side = document.querySelector('.panel.right');
    if (side && !document.getElementById('mapStyleSec')) {
      const sec = document.createElement('section');
      sec.id = 'mapStyleSec'; sec.className = 'ms-sec';
      sec.innerHTML = `<h2 class="title-sm" data-ms-title></h2>${cardsHtml('panel')}`;
      side.appendChild(sec);
    }
    const scroll = document.querySelector('#settingsDialog .dialog-scroll');
    if (scroll && !document.getElementById('msSettings')) {
      const wrap = document.createElement('div');
      wrap.id = 'msSettings';
      wrap.innerHTML = `<h3 class="title-sm" data-ms-title></h3><p class="supporting" data-ms-hint></p>${cardsHtml('settings')}`;
      const appHead = [...scroll.querySelectorAll('h3')].find((h) => h.dataset.t === 'appSection');
      scroll.insertBefore(wrap, appHead || null);
    }
    G.render();
    refreshCards();
  });
})();
