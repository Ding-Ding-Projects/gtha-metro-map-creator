// schematic-worker.js: automatic schematic layout. See docs/features/schematic.md.
// Runs as a Web Worker (message in: {id, input}; out: {id, progress} and {id, result}).
// When it is loaded as an ordinary script instead (no Worker available), it exposes
// window.GMMCSchematicSolve(input, onProgress) with the same behaviour.
(function () {
  'use strict';
  const SQ = Math.SQRT1_2;
  const ROUNDS = 220;

  /** Angular deviation, in degrees, of a vector from the nearest multiple of 45 degrees. */
  function devDeg(dx, dy) {
    if (!dx && !dy) return 90;
    const a = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
    return Math.min(a, Math.abs(a - 45), 90 - a);
  }
  /** Same two-segment route as the editor's route() with the default bend. */
  function routePts(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx === 0 || ady === 0 || adx === ady) return [a, b];
    const d = Math.min(adx, ady), sx = Math.sign(dx), sy = Math.sign(dy);
    return [a, { x: a.x + sx * d, y: a.y + sy * d }, b];
  }
  const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  function properCross(a, b, c, d) {
    const d1 = orient(c, d, a), d2 = orient(c, d, b), d3 = orient(a, b, c), d4 = orient(a, b, d);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  function countCrossings(edges, pos, bend) {
    const polys = edges.map((e) => {
      const a = pos[e.a], b = pos[e.b];
      return bend ? routePts(a, b) : [a, b];
    });
    let n = 0;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const ei = edges[i], ej = edges[j];
        if (ei.a === ej.a || ei.a === ej.b || ei.b === ej.a || ei.b === ej.b) continue;
        let hit = false;
        for (let p = 0; p < polys[i].length - 1 && !hit; p++) {
          for (let q = 0; q < polys[j].length - 1 && !hit; q++) hit = properCross(polys[i][p], polys[i][p + 1], polys[j][q], polys[j][q + 1]);
        }
        if (hit) n++;
      }
    }
    return n;
  }

  /**
   * input: { stations: [{id, x, y}] geographic grid positions, lines: [{id, path: [stationIds]}],
   *          spacing: 1..4, keepShape: 0..1 }
   * returns { positions: {id: {x, y}} integers, stats }
   */
  function solve(input, onProgress) {
    const spacing = Math.min(4, Math.max(1, +input.spacing || 2));
    const keep = Math.min(1, Math.max(0, +input.keepShape || 0));
    const ids = input.stations.map((s) => s.id);
    const N = ids.length;
    const index = new Map(ids.map((id, i) => [id, i]));
    const result = { positions: {}, stats: null };
    if (!N) { result.stats = { edges: 0, straight: 0, oneBend: 0, straightShare: 1, oneBendShare: 0, orderChanges: 0, crossings: 0, crossingsBefore: 0 }; return result; }

    // unique undirected edges and consecutive-stop triples
    const edgeMap = new Map(), edges = [], triples = [];
    for (const l of input.lines) {
      const seq = [];
      for (const r of l.path) { const i = index.get(r); if (i !== undefined && seq[seq.length - 1] !== i) seq.push(i); }
      for (let k = 0; k < seq.length - 1; k++) {
        const a = Math.min(seq[k], seq[k + 1]), b = Math.max(seq[k], seq[k + 1]), key = a + '|' + b;
        if (!edgeMap.has(key)) { const e = { a, b, len0: 0, oct: -1 }; edgeMap.set(key, e); edges.push(e); }
      }
      for (let k = 1; k < seq.length - 1; k++) if (seq[k - 1] !== seq[k + 1]) triples.push([seq[k - 1], seq[k], seq[k + 1]]);
    }
    const geo = input.stations.map((s) => ({ x: s.x, y: s.y }));
    // fisheye: spread the dense core and pull the far suburbs in, so one spacing suits the whole map
    const med = (arr) => { const a = arr.slice().sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
    const mx = med(geo.map((g) => g.x)), my = med(geo.map((g) => g.y));
    const dist = geo.map((g) => Math.hypot(g.x - mx, g.y - my));
    const D = Math.max(1e-9, med(dist));
    const FISH = 0.55 + 0.4 * keep; // more faithful distances when the shape is kept
    const comp = geo.map((g, i) => {
      if (dist[i] < 1e-9) return { x: 0, y: 0 };
      const f = D * Math.pow(dist[i] / D, FISH) / dist[i];
      return { x: (g.x - mx) * f, y: (g.y - my) * f };
    });
    for (const e of edges) e.len0 = Math.hypot(comp[e.b].x - comp[e.a].x, comp[e.b].y - comp[e.a].y);
    const lens = edges.map((e) => e.len0).filter((v) => v > 1e-9).sort((p, q) => p - q);
    const median = lens.length ? lens[Math.floor(lens.length / 2)] : 1;
    const scale = spacing / median;
    const N0 = N;
    const x0 = new Float64Array(N0), y0 = new Float64Array(N0), px = new Float64Array(N0), py = new Float64Array(N0);
    for (let i = 0; i < N0; i++) { x0[i] = comp[i].x * scale; y0[i] = comp[i].y * scale; px[i] = x0[i]; py[i] = y0[i]; }

    const incident = Array.from({ length: N }, () => []);
    edges.forEach((e, i) => { incident[e.a].push(i); incident[e.b].push(i); });
    const trOf = Array.from({ length: N }, () => []);
    triples.forEach((t, i) => { for (const n of t) trOf[n].push(i); });

    const isFold = (t, X, Y) => {
      const [a, b, c] = t;
      const ux = X[b] - X[a], uy = Y[b] - Y[a], vx = X[c] - X[b], vy = Y[c] - Y[b];
      const m = Math.hypot(ux, uy) * Math.hypot(vx, vy);
      if (m < 1e-9) return false;
      return (ux * vx + uy * vy) / m < -SQ;
    };
    const origFold = triples.map((t) => isFold(t, x0, y0));
    const badAt = (n, X, Y) => { for (const ti of trOf[n]) if (!origFold[ti] && isFold(triples[ti], X, Y)) return true; return false; };

    const ancK = 0.01 + keep * 0.6;
    const minD = spacing * 0.8;
    const dx8 = [], dy8 = [];
    for (let o = 0; o < 8; o++) { dx8.push(Math.cos(o * Math.PI / 4)); dy8.push(Math.sin(o * Math.PI / 4)); }
    const dvx = new Float64Array(edges.length), dvy = new Float64Array(edges.length);

    for (let it = 0; it < ROUNDS; it++) {
      const phase = it / ROUNDS;
      const lambda = Math.min(1, 0.05 + phase * 0.8);
      const k = ancK * (phase > 0.7 ? 0.3 : 1);
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const vx = px[e.b] - px[e.a], vy = py[e.b] - py[e.a], cur = Math.hypot(vx, vy);
        let oc = Math.round(Math.atan2(vy, vx) / (Math.PI / 4));
        const ang = Math.atan2(vy, vx) / (Math.PI / 4);
        if (e.oct >= 0) {
          let df = Math.abs(ang - e.oct); df = Math.min(df, 8 - df);
          if (df < 0.62) oc = e.oct;
        }
        oc = ((oc % 8) + 8) % 8; e.oct = oc;
        const r = e.len0 / median;
        const tgt = spacing * Math.min(3.5, Math.max(0.8, Math.pow(r, 0.5)));
        const L = cur * (1 - lambda) + tgt * lambda;
        dvx[i] = dx8[oc] * L; dvy[i] = dy8[oc] * L;
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let n = 0; n < N; n++) {
          let sx = k * x0[n], sy = k * y0[n], den = k;
          for (const ei of incident[n]) {
            const e = edges[ei];
            if (e.a === n) { sx += px[e.b] - dvx[ei]; sy += py[e.b] - dvy[ei]; }
            else { sx += px[e.a] + dvx[ei]; sy += py[e.a] + dvy[ei]; }
            den += 1;
          }
          if (den <= 0) continue;
          const ox = px[n], oy = py[n];
          let nx = sx / den, ny = sy / den;
          px[n] = nx; py[n] = ny;
          if (trOf[n].length && badAt(n, px, py)) {
            px[n] = (ox + nx) / 2; py[n] = (oy + ny) / 2;
            if (badAt(n, px, py)) { px[n] = ox; py[n] = oy; }
          }
        }
      }
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const ddx = px[j] - px[i], ddy = py[j] - py[i];
          if (Math.abs(ddx) > minD || Math.abs(ddy) > minD) continue;
          const d = Math.hypot(ddx, ddy);
          if (d >= minD) continue;
          const ux = d > 1e-9 ? ddx / d : 1, uy = d > 1e-9 ? ddy / d : 0, push = (minD - d) * 0.3;
          px[i] -= ux * push; py[i] -= uy * push; px[j] += ux * push; py[j] += uy * push;
        }
      }
      if (onProgress && it % 10 === 9) onProgress((it + 1) / ROUNDS * 0.8);
    }

    // snap to the integer grid, resolving collisions by moving to the nearest free cell
    const ix = new Int32Array(N), iy = new Int32Array(N), occ = new Map();
    const key = (x, y) => x + ',' + y;
    const order = Array.from({ length: N }, (_, i) => i);
    const nearestFree = (fx, fy) => {
      const bx = Math.round(fx), by = Math.round(fy);
      if (!occ.has(key(bx, by))) return [bx, by];
      let best = null, bd = Infinity;
      for (let r = 1; r <= 8 && !best; r++) {
        for (let ox = -r; ox <= r; ox++) for (let oy = -r; oy <= r; oy++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r || occ.has(key(bx + ox, by + oy))) continue;
          const d = Math.hypot(bx + ox - fx, by + oy - fy);
          if (d < bd) { bd = d; best = [bx + ox, by + oy]; }
        }
      }
      return best || [bx, by];
    };
    for (const n of order) { const [x, y] = nearestFree(px[n], py[n]); ix[n] = x; iy[n] = y; occ.set(key(x, y), n); }
    if (onProgress) onProgress(0.85);

    // integer hill-climb: reduce the angular error of every edge while keeping stops apart and in order
    const nodeCost = (n, x, y) => {
      let c = 0;
      for (const ei of incident[n]) {
        const e = edges[ei], o = e.a === n ? e.b : e.a;
        c += 3 * devDeg(ix[o] - x, iy[o] - y);
      }
      c += 0.6 * Math.hypot(x - px[n], y - py[n]);
      return c;
    };
    for (let sweep = 0; sweep < 40; sweep++) {
      let moved = 0;
      for (let n = 0; n < N; n++) {
        const cx0 = ix[n], cy0 = iy[n];
        let bestC = nodeCost(n, cx0, cy0), bx = cx0, by = cy0;
        for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) {
          if (!ox && !oy) continue;
          const x = cx0 + ox, y = cy0 + oy;
          if (occ.has(key(x, y))) continue;
          ix[n] = x; iy[n] = y;
          const c = nodeCost(n, x, y);
          let ok = c < bestC - 1e-9;
          if (ok && trOf[n].length) ok = !badAt(n, ix, iy);
          if (ok) { bestC = c; bx = x; by = y; }
        }
        ix[n] = cx0; iy[n] = cy0;
        if (bx !== cx0 || by !== cy0) { occ.delete(key(cx0, cy0)); occ.set(key(bx, by), n); ix[n] = bx; iy[n] = by; moved++; }
      }
      if (!moved) break;
    }
    if (onProgress) onProgress(0.97);

    const pos = ids.map((_, i) => ({ x: ix[i], y: iy[i] }));
    ids.forEach((id, i) => { result.positions[id] = { x: pos[i].x, y: pos[i].y }; });
    let straight = 0;
    for (const e of edges) if (devDeg(pos[e.b].x - pos[e.a].x, pos[e.b].y - pos[e.a].y) === 0) straight++;
    const X = Array.from(ix), Y = Array.from(iy);
    let folds = 0;
    triples.forEach((t, i) => { if (!origFold[i] && isFold(t, X, Y)) folds++; });
    const E = edges.length || 1;
    result.stats = {
      edges: edges.length, straight, oneBend: edges.length - straight,
      straightShare: straight / E, oneBendShare: (edges.length - straight) / E,
      orderChanges: folds,
      crossings: countCrossings(edges, pos, true),
      crossingsBefore: countCrossings(edges, geo, false)
    };
    if (onProgress) onProgress(1);
    return result;
  }

  if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = (ev) => {
      const { id, input } = ev.data || {};
      try {
        const out = solve(input, (p) => self.postMessage({ id, progress: p }));
        self.postMessage({ id, result: out });
      } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
    };
  } else if (typeof window !== 'undefined') {
    window.GMMCSchematicSolve = solve;
  }
})();
