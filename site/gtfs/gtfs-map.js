// gtfs-map.js: a small canvas slippy map on OpenStreetMap raster tiles. Layers are plain draw callbacks.
(function () {
  'use strict';
  const TILE = 256, URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  const tiles = new Map(); // key -> Image (shared by all maps)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class GMap {
    constructor(host, opts) {
      opts = opts || {}; this.host = host; this.o = opts; this.z = 10; this.cx = 0; this.cy = 0; this.layers = []; this.hitFns = []; this.pending = false;
      host.classList.add('gmap'); host.tabIndex = 0; host.setAttribute('role', 'application'); host.setAttribute('aria-label', opts.label || 'Map');
      this.cv = document.createElement('canvas'); this.cv.className = 'gmap-cv'; host.appendChild(this.cv);
      this.attr = document.createElement('div'); this.attr.className = 'gmap-attr'; this.attr.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'; host.appendChild(this.attr);
      this.setView(43.7, -79.4, 9);
      this.ro = new ResizeObserver(() => { this.resize(); }); this.ro.observe(host);
      this.bind();
    }
    get w() { return this.host.clientWidth; } get h() { return this.host.clientHeight; }
    resize() { const d = window.devicePixelRatio || 1, w = this.w, h = this.h; if (!w || !h) return; this.cv.width = Math.round(w * d); this.cv.height = Math.round(h * d); this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; this.redraw(); }
    world(lat, lon, z) { const s = TILE * 2 ** (z === undefined ? this.z : z), r = lat * Math.PI / 180; return [(lon + 180) / 360 * s, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s]; }
    unworld(x, y, z) { const s = TILE * 2 ** (z === undefined ? this.z : z), n = Math.PI - 2 * Math.PI * y / s; return [180 / Math.PI * Math.atan(Math.sinh(n)), x / s * 360 - 180]; }
    /** screen position of a coordinate */
    px(lat, lon) { const [x, y] = this.world(lat, lon); return [x - this.cx + this.w / 2, y - this.cy + this.h / 2]; }
    center() { return this.unworld(this.cx, this.cy); }
    setView(lat, lon, z) { this.z = clamp(z, 2, 19); [this.cx, this.cy] = this.world(lat, lon); this.changed(); }
    fit(b, pad) {
      if (!b) return; pad = pad === undefined ? 24 : pad; const w = Math.max(40, this.w - pad * 2), h = Math.max(40, this.h - pad * 2);
      let z = 19; for (; z > 2; z -= 0.25) { const a = this.world(b[2], b[1], z), c = this.world(b[0], b[3], z); if (Math.abs(c[0] - a[0]) <= w && Math.abs(c[1] - a[1]) <= h) break; }
      this.setView((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.min(z, 17));
    }
    zoomTo(z, ax, ay) {
      z = clamp(z, 2, 19); ax = ax === undefined ? this.w / 2 : ax; ay = ay === undefined ? this.h / 2 : ay;
      const [lat, lon] = this.unworld(this.cx + ax - this.w / 2, this.cy + ay - this.h / 2); this.z = z;
      const [wx, wy] = this.world(lat, lon); this.cx = wx - ax + this.w / 2; this.cy = wy - ay + this.h / 2; this.changed();
    }
    zoomBy(d) { this.zoomTo(this.z + d); }
    panBy(dx, dy) { this.cx += dx; this.cy += dy; this.changed(); }
    changed() { this.redraw(); if (this.o.onView) this.o.onView(this); }
    addLayer(fn) { this.layers.push(fn); this.redraw(); return fn; }
    clearLayers() { this.layers = []; this.hitFns = []; }
    onHit(fn) { this.hitFns.push(fn); }
    hit(x, y) { for (let i = this.hitFns.length - 1; i >= 0; i--) { const r = this.hitFns[i](x, y, this); if (r) return r; } return null; }
    dark() { return this.o.dark ? this.o.dark() : false; }
    redraw() {
      if (this.pending) return; this.pending = true;
      requestAnimationFrame(() => { this.pending = false; this.draw(); });
    }
    draw() {
      const d = window.devicePixelRatio || 1, ctx = this.cv.getContext('2d'), w = this.w, h = this.h; if (!w || !h) return;
      ctx.setTransform(d, 0, 0, d, 0, 0); const cs = getComputedStyle(this.host);
      ctx.fillStyle = cs.getPropertyValue('--map-bg') || '#f3f1ec'; ctx.fillRect(0, 0, w, h);
      const zt = clamp(Math.round(this.z), 2, 19), sc = 2 ** (this.z - zt), sz = TILE * sc, n = 2 ** zt;
      const [wx, wy] = [this.cx * 2 ** (zt - this.z), this.cy * 2 ** (zt - this.z)];
      const x0 = Math.floor((wx - w / 2 / sc) / TILE), x1 = Math.floor((wx + w / 2 / sc) / TILE), y0 = Math.floor((wy - h / 2 / sc) / TILE), y1 = Math.floor((wy + h / 2 / sc) / TILE);
      if (this.o.tiles !== false) {
        ctx.save(); if (this.dark()) ctx.filter = 'invert(1) hue-rotate(180deg) brightness(.85) contrast(.9)';
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (ty < 0 || ty >= n) continue; const wxm = ((tx % n) + n) % n, k = zt + '/' + wxm + '/' + ty;
          let im = tiles.get(k);
          if (!im) { im = new Image(); im.decoding = 'async'; im.onload = () => { im.ok = true; this.redraw(); }; im.onerror = () => { im.bad = true; }; im.src = URL(zt, wxm, ty); tiles.set(k, im); if (tiles.size > 700) { const first = tiles.keys().next().value; tiles.delete(first); } }
          const sx = (tx * TILE - wx) * sc + w / 2, sy = (ty * TILE - wy) * sc + h / 2;
          if (im.ok) ctx.drawImage(im, sx, sy, sz + 0.5, sz + 0.5);
        }
        ctx.restore();
      }
      for (const fn of this.layers) { ctx.save(); fn(ctx, this); ctx.restore(); }
    }
    bind() {
      const host = this.host; const pts = new Map(); let drag = null, pinch = 0, moved = 0;
      host.addEventListener('pointerdown', (e) => { if (e.target.closest('.gmap-ui')) return; host.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
      host.addEventListener('pointermove', (e) => {
        const r = host.getBoundingClientRect();
        if (!pts.has(e.pointerId)) { if (this.o.onHover) this.o.onHover(this.hit(e.clientX - r.left, e.clientY - r.top), e); return; }
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 2) { const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.zoomTo(this.z + Math.log2(dist / pinch), (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch = dist; moved = 99; return; }
        if (drag) { const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; moved += Math.abs(dx) + Math.abs(dy); drag = [e.clientX, e.clientY]; this.panBy(-dx, -dy); }
      });
      const up = (e) => {
        const was = pts.has(e.pointerId); pts.delete(e.pointerId); if (pts.size < 2) pinch = 0;
        if (was && e.type === 'pointerup' && moved < 6 && this.o.onClick) { const r = host.getBoundingClientRect(); this.o.onClick(this.hit(e.clientX - r.left, e.clientY - r.top), e.clientX - r.left, e.clientY - r.top); }
        if (!pts.size) drag = null;
      };
      host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
      host.addEventListener('wheel', (e) => { if (e.target.closest('.gmap-ui')) return; e.preventDefault(); const r = host.getBoundingClientRect(); this.zoomTo(this.z - Math.sign(e.deltaY) * 0.5, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
      host.addEventListener('dblclick', (e) => { if (e.target.closest('.gmap-ui')) return; const r = host.getBoundingClientRect(); this.zoomTo(this.z + 1, e.clientX - r.left, e.clientY - r.top); });
      host.addEventListener('keydown', (e) => {
        if (e.target !== host) return; const s = e.shiftKey ? 240 : 60;
        const k = e.key; if (k === 'ArrowLeft') this.panBy(-s, 0); else if (k === 'ArrowRight') this.panBy(s, 0); else if (k === 'ArrowUp') this.panBy(0, -s); else if (k === 'ArrowDown') this.panBy(0, s);
        else if (k === '+' || k === '=') this.zoomBy(1); else if (k === '-' || k === '_') this.zoomBy(-1); else return; e.preventDefault();
      });
    }
    destroy() { this.ro.disconnect(); }
  }
  window.GMap = GMap;
})();
