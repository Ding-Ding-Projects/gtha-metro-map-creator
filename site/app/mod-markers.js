// mod-markers.js: per-line station markers and the shared-bend strings. See docs/features/styles.md
// and docs/features/editor.md. A line may set marker to ring, tick, pill or dot; when it is unset the
// map style decides. Stations served by two or more drawn lines always keep a ring.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const hooks = (n) => (X[n] = X[n] || []);
  const KINDS = ['ring', 'tick', 'pill', 'dot'];
  const NIGHT_BG = '#15171c';
  const DIRS = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1], NE: [1, -1], NW: [-1, -1], SE: [1, 1], SW: [-1, 1] };

  window.I18N.add({
    mkTitle: 'Station markers', mkAuto: 'Auto', mkRing: 'Ring', mkTick: 'Tick', mkPill: 'Pill', mkDot: 'Dot',
    mkHint: 'Interchanges keep a ring so changes stay easy to spot. The map style sets the default; this line overrides it.',
    mkPreview: 'Preview of the station markers for this line', mkSet: 'Station markers changed',
    sharedBend: 'Same bend for every line here', sharedBendShare: 'share this segment', sharedBendAlone: 'Only this line uses this segment'
  }, {
    mkTitle: '車站標記', mkAuto: '跟風格', mkRing: '圓環', mkTick: '短橫', mkPill: '膠囊', mkDot: '圓點',
    mkHint: '轉車站一律保留圓環，咁樣先容易睇到改動。地圖風格設定預設值，呢條路線可以覆蓋。',
    mkPreview: '呢條路線嘅車站標記預覽', mkSet: '車站標記已更改',
    sharedBend: '呢度每條路線用同一個轉角', sharedBendShare: '共用呢個路段', sharedBendAlone: '只有呢條路線用呢個路段'
  });

  const G = () => window.GMMC;
  const style = () => { const s = G() && G().getSettings && G().getSettings(); return s ? s.mapStyle : 'material'; };
  /** The marker kind the current map style gives a line that has none of its own. */
  const styleDefault = () => (style() === 'classic' ? 'tick' : 'ring');
  const lighten = (hex, k) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return hex;
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  };

  /** Normal of the line at a station, from the nearest drawn vertex of a serving line. */
  function localNormal(s, c) {
    let best = null;
    for (const g of c.geo || []) {
      if (!g.line.path.includes(s.id) || g.poly.length < 2) continue;
      for (let i = 0; i < g.poly.length; i++) {
        const p = g.poly[i], d = Math.hypot(p.x - c.cx, p.y - c.cy);
        if (!best || d < best.d) { const a = g.poly[Math.max(0, i - 1)], b = g.poly[Math.min(g.poly.length - 1, i + 1)]; best = { d, dx: b.x - a.x, dy: b.y - a.y }; }
      }
    }
    if (!best || best.d > 24 || !(best.dx || best.dy)) return null;
    const len = Math.hypot(best.dx, best.dy);
    return { nx: -best.dy / len, ny: best.dx / len };
  }
  /** The side of the line opposite the label, as a unit vector. */
  function awayFrom(n, labelDir) {
    const u = labelDir && DIRS[labelDir];
    if (!u) return { x: n.nx, y: n.ny };
    const dot = n.nx * u[0] + n.ny * u[1];
    return dot > 0.01 ? { x: -n.nx, y: -n.ny } : { x: n.nx, y: n.ny };
  }

  /**
   * SVG for one marker. p: { cx, cy, col, width, stop, night, normal: {nx, ny} | null, away: {x, y} | null }.
   * Ticks and pills need the direction of the line; without it they fall back to a ring.
   */
  function draw(kind, p) {
    const col = p.night ? lighten(p.col, 0.3) : p.col, bg = p.night ? NIGHT_BG : '#FFFFFF';
    const f = (v) => (+v).toFixed(1);
    if (kind === 'dot') {
      const r = Math.max(p.stop ? 3.4 : 5, p.width / 2 + (p.stop ? 0.5 : 1.5));
      return `<circle class="mk-dot" cx="${f(p.cx)}" cy="${f(p.cy)}" r="${f(r)}" fill="${col}" stroke="${bg}" stroke-width="1.5"/>`;
    }
    if (kind === 'tick' && p.normal) {
      const a = p.away || { x: p.normal.nx, y: p.normal.ny }, len = p.width / 2 + (p.stop ? 5 : 7);
      return `<path class="mk-tick" d="M${f(p.cx)} ${f(p.cy)}L${f(p.cx + a.x * len)} ${f(p.cy + a.y * len)}" stroke="${col}" stroke-width="${p.stop ? 3 : 4.5}" stroke-linecap="butt" fill="none"/>`;
    }
    if (kind === 'pill' && p.normal) {
      const L = p.width + (p.stop ? 6 : 9), T = p.stop ? 5 : 7, ang = Math.atan2(p.normal.ny, p.normal.nx) * 180 / Math.PI;
      return `<rect class="mk-pill" x="${f(p.cx - L / 2)}" y="${f(p.cy - T / 2)}" width="${f(L)}" height="${f(T)}" rx="${f(T / 2)}" transform="rotate(${f(ang)} ${f(p.cx)} ${f(p.cy)})" fill="${bg}" stroke="${col}" stroke-width="2"/>`;
    }
    const r = p.stop ? 3.6 : 6;
    return `<circle class="mk-ring" cx="${f(p.cx)}" cy="${f(p.cy)}" r="${r}" fill="${bg}" stroke="${col}" stroke-width="${p.stop ? 2.2 : 3}"/>`;
  }
  window.GMMCMarkers = { KINDS, draw, styleDefault };

  hooks('validate').push((src, out) => {
    (src.lines || []).forEach((l, i) => { if (l && out.lines[i] && KINDS.includes(l.marker)) out.lines[i].marker = l.marker; });
  });

  hooks('stationMarker').push((m, s, c) => {
    const line = (c.lines && c.lines[0]) || null;
    if (!line || !KINDS.includes(line.marker) || c.inter) return '';
    const normal = line.marker === 'ring' || line.marker === 'dot' ? null : localNormal(s, c);
    return draw(line.marker, { cx: c.cx, cy: c.cy, col: c.col, width: line.width, stop: s.kind === 'stop', night: style() === 'night', normal, away: normal ? awayFrom(normal, c.labelDir) : null });
  });

  // ---------- inspector ----------
  function previewSvg(l) {
    const kind = KINDS.includes(l.marker) ? l.marker : styleDefault(), g = G();
    const names = l.path.filter((r) => r[0] !== '@').map((id) => g.getMap().stations[id]).filter(Boolean).slice(0, 4).map((s) => s.name);
    while (names.length < 4) names.push('Station ' + (names.length + 1));
    const w = Math.min(10, l.width), night = style() === 'night';
    let body = `<path d="M20 44H420" stroke="${night ? lighten(l.color, 0.3) : l.color}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
    const xs = [80, 180, 280, 380];
    xs.forEach((x) => { body += draw(kind, { cx: x, cy: 44, col: l.color, width: w, stop: false, night, normal: { nx: 0, ny: 1 }, away: { x: 0, y: 1 } }); });
    body += '<g font-size="12" text-anchor="middle" fill="currentColor">' + xs.map((x, i) => `<text x="${x}" y="22">${g.esc(names[i].slice(0, 14))}</text>`).join('') + '</g>';
    return `<svg class="mk-preview${night ? ' night' : ''}" viewBox="0 0 440 72" role="img" aria-label="${g.esc(g.t('mkPreview'))}" focusable="false">${body}</svg>`;
  }
  hooks('lineInspector').push((l) => {
    const g = G(); if (!g) return '';
    const btn = (v, label) => `<button type="button" data-marker="${v}" title="${g.esc(v ? label : g.t('mapStyle'))}" aria-pressed="${(l.marker || '') === v}"><span class="seg-check">${window.icon('check', 18)}</span><span>${g.esc(label)}</span></button>`;
    return `<div class="mk-sec"><span class="tf-label" id="mkLbl">${g.esc(g.t('mkTitle'))}</span>
      <div class="segmented wide" role="group" aria-labelledby="mkLbl">${btn('', g.t('mkAuto'))}${KINDS.map((k) => btn(k, g.t('mk' + k[0].toUpperCase() + k.slice(1)))).join('')}</div>
      ${previewSvg(l)}<p class="supporting">${g.esc(g.t('mkHint'))}</p></div>`;
  });
  hooks('click').push((e) => {
    const b = e.target.closest && e.target.closest('#inspector [data-marker]');
    if (!b) return false;
    const g = G(), sel = g.getSelection(), l = sel && g.lineById(sel.lineId || sel.id);
    if (!l) return true;
    const v = b.dataset.marker;
    if ((l.marker || '') !== v) {
      g.checkpoint();
      if (v) l.marker = v; else delete l.marker;
      g.changed();
      g.toast(g.t('mkSet') + ': ' + g.t(v ? 'mk' + v[0].toUpperCase() + v.slice(1) : 'mkAuto'));
    }
    const again = document.querySelector('#inspector [data-marker="' + v + '"]');
    if (again) again.focus();
    return true;
  });
})();
