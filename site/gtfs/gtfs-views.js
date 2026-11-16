// gtfs-views.js: overview, routes, stops and trips. Registers on GA.views.
(function () {
  'use strict';
  const C = window.GtfsCore, U = window.GUI, h = U.h, GA = window.GA, t = GA.t;
  const V = GA.views, GV = window.GV = {};
  const fmt = C.fmtTime;
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  const enumL = (g, v) => { if (v === '' || v === undefined) return ''; const k = 'e_' + g + '_' + v; return window.I18N.en[k] ? t(k) : String(v); };
  GV.enumL = enumL;

  // ---------- shared pieces ----------
  GV.textField = (label, onInput, o) => {
    o = o || {}; const inp = h('input', { type: 'text', class: 'tf-in', placeholder: ' ', 'aria-label': label, autocomplete: 'off', spellcheck: 'false' });
    const clear = h('button', { type: 'button', class: 'ibtn tf-x', 'aria-label': t('clear'), html: U.icon('close', 18), hidden: true, onclick: () => { inp.value = ''; clear.hidden = true; onInput(''); inp.focus(); } });
    inp.addEventListener('input', () => { clear.hidden = !inp.value; onInput(inp.value); });
    return { el: h('label.tf', null, o.icon === false ? null : h('span.tf-ic', { html: U.icon('search', 20) }), inp, h('span.tf-l', { text: label }), clear), input: inp };
  };
  GV.split = (list, detail, hasDetail, both) => h('div.split' + (hasDetail ? '.has-detail' : '') + (both ? '.both' : ''), null, h('div.split-l', null, list), h('div.split-r', null, detail));
  GV.backBtn = (href, label) => { const a = h('a', { class: 'back', href }); a.innerHTML = U.icon('chevron_left', 22) + '<span>' + U.esc(label) + '</span>'; return a; };

  /** A map with a zoom slider, +/- and fit buttons. */
  GV.map = (host, label) => {
    let zs = null; const m = new window.GMap(host, { label, dark: GA.isDark, onView: (mm) => { if (zs) zs.set(mm.z); } });
    GA.mapRedraw = () => m.redraw();
    zs = U.slider({ min: 2, max: 19, step: 0.5, value: m.z, label: t('zoom'), format: (v) => 'z' + v, cls: 'sl-v', onInput: (v) => m.zoomTo(v) });
    const ui = h('div.gmap-ui', null, U.iconBtn('add', t('zoomIn'), () => m.zoomBy(1)), zs.el, U.iconBtn('remove', t('zoomOut'), () => m.zoomBy(-1)), U.iconBtn('fit', t('fitMap'), () => m.fit(m.home)));
    host.append(ui); m.home = null; m.setHome = (b) => { m.home = b; m.fit(b); };
    return m;
  };
  const projPath = (ctx, m, pts, stride) => { ctx.beginPath(); for (let i = 0; i < pts.length; i += stride) { const p = m.px(pts[i][0], pts[i][1]); if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); } const l = pts[pts.length - 1], p = m.px(l[0], l[1]); ctx.lineTo(p[0], p[1]); };
  GV.drawPath = (ctx, m, pts, color, width, o) => {
    if (!pts || pts.length < 2) return; o = o || {}; const stride = Math.max(1, Math.floor(pts.length / 1500));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (o.halo) { projPath(ctx, m, pts, stride); ctx.strokeStyle = o.halo; ctx.lineWidth = width + 3; ctx.globalAlpha = o.alpha || 1; ctx.stroke(); }
    projPath(ctx, m, pts, stride); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = o.alpha || 1; ctx.stroke(); ctx.globalAlpha = 1;
    if (o.arrows) { let acc = 60; ctx.fillStyle = o.arrowColor || '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 1; for (let i = 1; i < pts.length; i++) { const a = m.px(pts[i - 1][0], pts[i - 1][1]), b = m.px(pts[i][0], pts[i][1]), d = Math.hypot(b[0] - a[0], b[1] - a[1]); acc += d; if (acc >= 90 && d > 4 && b[0] > -20 && b[0] < m.w + 20 && b[1] > -20 && b[1] < m.h + 20) { acc = 0; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); ctx.save(); ctx.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-4, -4.5); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); } } }
  };
  GV.drawStop = (ctx, p, color, r, ring) => { ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = ring || 2; ctx.strokeStyle = color; ctx.stroke(); };
  GV.boundsOf = (pts) => { let a = 90, b = 180, c = -90, d = -180; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[0] > c) c = p[0]; if (p[1] < b) b = p[1]; if (p[1] > d) d = p[1]; } return pts.length ? [a, b, c, d] : null; };
  GV.thumb = (ri, w, hgt) => {
    const f = GA.feed, cv = h('canvas', { width: w * 2, height: hgt * 2, class: 'thumb', 'aria-hidden': 'true' }); cv.style.width = w + 'px'; cv.style.height = hgt + 'px';
    const cache = f.cache.thumbs || (f.cache.thumbs = new Map()); let pts = cache.get(ri); if (!pts) { pts = f.routePath(ri); const stride = Math.max(1, Math.floor(pts.length / 120)); pts = pts.filter((_, i) => i % stride === 0 || i === pts.length - 1); cache.set(ri, pts); }
    if (pts.length < 2) return cv; const b = GV.boundsOf(pts), ctx = cv.getContext('2d'); ctx.scale(2, 2);
    const cl = Math.cos((b[0] + b[2]) / 2 * Math.PI / 180), dx = Math.max(1e-9, (b[3] - b[1]) * cl), dy = Math.max(1e-9, b[2] - b[0]), s = Math.min((w - 8) / dx, (hgt - 8) / dy), ox = (w - dx * s) / 2, oy = (hgt - dy * s) / 2;
    ctx.beginPath(); pts.forEach((p, i) => { const x = ox + (p[1] - b[1]) * cl * s, y = hgt - oy - (p[0] - b[0]) * s; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.strokeStyle = f.routeColor(f.routes[ri]); ctx.lineWidth = 2.5; ctx.lineJoin = ctx.lineCap = 'round'; ctx.stroke(); return cv;
  };
  const routeLabel = (ri) => GA.feed.routeName(GA.feed.routes[ri]);

  // ---------- OVERVIEW ----------
  V.overview = (page) => {
    const f = GA.feed, fi = f.feedInfo; const grid = h('div.grid'); page.append(h('h1.pg-t', { text: t('nav_overview') }), grid);
    // feed info
    const url = (u) => u ? h('a', { class: 'lnk', href: /^https?:/.test(u) ? u : '#', target: '_blank', rel: 'noopener', text: u }) : '';
    grid.append(GA.card(t('feedInfo'), fi.feed_publisher_name || fi.feed_lang ? GA.kv([[t('publisher'), fi.feed_publisher_name], [t('publisherUrl'), url(fi.feed_publisher_url)], [t('feedLangL'), fi.feed_lang], [t('defaultLang'), fi.default_lang], [t('feedVersion'), fi.feed_version], [t('feedStart'), fi.feed_start_date ? GA.dateText(fi.feed_start_date) : ''], [t('feedEnd'), fi.feed_end_date ? GA.dateText(fi.feed_end_date) : ''], [t('contactEmail'), fi.feed_contact_email], [t('contactUrl'), url(fi.feed_contact_url)]]) : h('p.sub', { text: t('noFeedInfo') }), GA.kv([[t('fileL'), GA.fileName], [t('parseTime'), (GA.parseMs / 1000).toFixed(1) + ' s']])));
    // totals
    const stats = h('div.stats', null, GA.stat(t('routesLc'), GA.n(f.routes.length)), GA.stat(t('stopsLc'), GA.n(f.stops.length)), GA.stat(t('tripsLc'), GA.n(f.trips.length)), GA.stat(t('stopTimesLc'), GA.n(f.st.n)), GA.stat(t('shapesLc'), GA.n(f.shapes ? f.shapes.ids.length : 0)), GA.stat(t('servicesLc'), GA.n(f.serviceIds.length)));
    grid.append(GA.card(t('totals'), stats));
    // agencies
    const ag = h('div.list-plain'); for (const a of f.agencies) ag.append(h('div.ag', null, h('b', { text: a.agency_name || a.agency_id }), h('span.sub', { text: [a.agency_timezone, a.agency_lang, a.agency_phone].filter(Boolean).join(' · ') }), a.agency_url ? url(a.agency_url) : null));
    grid.append(GA.card(t('agencies') + ' (' + f.agencies.length + ')', f.agencies.length ? ag : h('p.sub', { text: t('none') })));
    // service range and activity
    const days = f.tripsPerDay(), busy = days.filter((d) => d[1] > 0).length;
    const data = days.length > 366 ? (() => { const o = [], step = Math.ceil(days.length / 120); for (let i = 0; i < days.length; i += step) { const sl = days.slice(i, i + step); o.push({ value: Math.round(sl.reduce((n, d) => n + d[1], 0) / sl.length), tip: GA.dateText(sl[0][0]) + ' - ' + GA.dateText(sl[sl.length - 1][0]) + ': ' + GA.n(Math.round(sl.reduce((n, d) => n + d[1], 0) / sl.length)) + ' ' + t('avgTripsDay'), date: sl[0][0] }); } return o; })() : days.map((d) => ({ value: d[1], tip: GA.dateText(d[0]) + ': ' + GA.n(d[1]) + ' ' + t('tripsLc'), date: d[0], on: d[0] === GA.date, color: d[1] === 0 ? 'var(--md-outline-variant)' : null }));
    grid.append(GA.card(t('serviceRange'), f.rangeStart ? h('div', null, h('p', { text: GA.dateText(f.rangeStart) + ' - ' + GA.dateText(f.rangeEnd) }), h('p.sub', { text: t('activeDays', { n: GA.n(busy), m: GA.n(days.length) }) }), GA.barChart({ label: t('tripsPerDay'), data, height: 110, axis: [GA.dateText(days[0][0]), GA.dateText(days[days.length - 1][0])], onBar: (d) => { GA.date = d.date; U.snack(t('dateSet', { d: GA.dateText(d.date) }), { label: t('openCalendar'), run: () => GA.go('#calendar') }); } })) : h('p.sub', { text: t('noService') })));
    // route types
    const byType = new Map(); f.routes.forEach((r, i) => { const k = String(+r.route_type || 0); (byType.get(k) || byType.set(k, []).get(k)).push(i); });
    const tdata = [...byType].sort((a, b) => b[1].length - a[1].length); const tmax = Math.max(1, ...tdata.map((x) => x[1].length));
    const tb = h('div.hbars'); for (const [k, list] of tdata) { const row = h('a', { class: 'hbar', href: '#routes', onclick: () => { rs.types = new Set([k]); } }); row.innerHTML = `<span class="hb-l">${U.esc(GA.typeName(k))}<small>route_type ${k}</small></span><span class="hb-t"><span style="width:${list.length / tmax * 100}%"></span></span><b>${GA.n(list.length)}</b>`; tb.append(row); }
    grid.append(GA.card(t('routeTypes'), tb));
    // files
    const fl = h('div.files'); for (const [name, info] of Object.entries(f.files).sort((a, b) => a[0].localeCompare(b[0]))) { const b = h('a', { class: 'file-c', href: '#data/' + encodeURIComponent(name) }); b.innerHTML = `<b>${U.esc(name)}</b><span>${GA.n(info.rows)} ${U.esc(t('rowsLc'))}</span>`; fl.append(b); }
    grid.append(GA.card(t('files') + ' (' + Object.keys(f.files).length + ')', fl));
    // attributions
    const at = f.table('attributions'); if (at.length) grid.append(GA.card(t('attributions'), h('div.list-plain', null, at.map((a) => h('div.ag', null, h('b', { text: a.organization_name }), h('span.sub', { text: [a.is_producer === '1' ? t('producer') : '', a.is_operator === '1' ? t('operator') : '', a.is_authority === '1' ? t('authority') : ''].filter(Boolean).join(' · ') }), a.attribution_url ? url(a.attribution_url) : null)))));
    if (f.languages.length) grid.append(GA.card(t('translationsL'), h('p.sub', { text: t('translationsHelp') }), h('div.chips', null, [U.filterChip(t('feedLangOff'), !f.tlang, () => { f.setLang(''); GA.route(true); }), ...f.languages.map((l) => U.filterChip(l, f.tlang === l, () => { f.setLang(l); GA.route(true); }))])));
    // validation summary
    const vs = GA.validation; grid.append(GA.card(t('nav_validation'), vs ? h('div', null, h('div.stats', null, GA.stat(t('errors'), GA.n(vs.errors)), GA.stat(t('warnings'), GA.n(vs.warnings))), U.btn(t('viewIssues'), { kind: 'tonal', icon: 'check', onclick: () => GA.go('#validation') })) : h('div', null, U.progress(t('validating')).el, h('p.sub', { text: t('validating') }))));
    // map
    const mapCard = h('section.card.span2', null, h('h3.card-t', { text: t('allRoutesMap') })), host = h('div.mapbox'); mapCard.append(host); grid.append(mapCard);
    setTimeout(() => {
      const m = GV.map(host, t('allRoutesMap')); const pts = []; const paths = f.routes.map((_, i) => f.routePath(i)); const col = f.routes.map((r) => f.routeColor(r));
      const order = paths.map((_, i) => i).sort((a, b) => paths[b].length - paths[a].length);
      const hasPaths = paths.some((p) => p.length > 1);
      m.addLayer((ctx) => { const w = f.routes.length > 300 ? 1.4 : 2.5; for (const i of order) GV.drawPath(ctx, m, paths[i], col[i], w, { alpha: 0.9 }); if (!hasPaths) { ctx.fillStyle = '#5F6368'; for (const s of f.stops) if (s.ok) { const p = m.px(s.lat, s.lon); ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2); } } });
      m.onHit((x, y) => { let best = null, bd = 10; for (const i of order) { const p = paths[i]; const stride = Math.max(1, Math.floor(p.length / 400)); for (let k = 0; k < p.length; k += stride) { const q = m.px(p[k][0], p[k][1]), d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; best = i; } } } return best === null ? null : { route: best }; });
      m.o.onClick = (hit) => { if (hit) GA.go(GA.href('route', f.routes[hit.route].route_id)); };
      m.o.onHover = (hit) => { host.style.cursor = hit ? 'pointer' : ''; host.title = hit ? routeLabel(hit.route) : ''; };
      for (const s of f.stops) if (s.ok) pts.push([s.lat, s.lon]); m.setHome(f.bounds || null);
    }, 0);
  };

  // ---------- ROUTES ----------
  const rs = { q: '', agency: '', types: new Set(), network: '', sort: 'num', mode: 'list', dir: 'all', pat: null, view: 'map', band: 'am' };
  V.routes = (page, { view, args }) => {
    const f = GA.feed; const id = view === 'route' ? args[0] : null; const sel = id ? f.routeIx.get(id) : undefined;
    const q = /type=(\d+)/.exec(location.hash); if (q && !rs.types.size) rs.types.add(q[1]);
    const perRoute = new Int32Array(f.routes.length); for (const ti of f.tripsOn(GA.date)) { const ri = f.routeIx.get(f.trips[ti].route_id); if (ri !== undefined) perRoute[ri]++; }
    const nets = new Map(); for (const r of f.table('route_networks')) { const ri = f.routeIx.get(r.route_id); if (ri !== undefined) { (nets.get(r.network_id) || nets.set(r.network_id, new Set()).get(r.network_id)).add(ri); } }
    let rows = [];
    const typesPresent = [...new Set(f.routes.map((r) => String(+r.route_type || 0)))].sort((a, b) => a - b);
    const compute = () => {
      const qq = rs.q.trim().toLowerCase(); rows = [];
      f.routes.forEach((r, i) => { if (rs.agency && r.agency_id !== rs.agency) return; if (rs.types.size && !rs.types.has(String(+r.route_type || 0))) return; if (rs.network && !(nets.get(rs.network) || new Set()).has(i)) return; if (qq && !(f.routeName(r) + ' ' + r.route_id + ' ' + r.route_desc).toLowerCase().includes(qq)) return; rows.push(i); });
      rows.sort(rs.sort === 'trips' ? (a, b) => perRoute[b] - perRoute[a] || natural(f.routeShort(f.routes[a]), f.routeShort(f.routes[b])) : (a, b) => natural(f.routeShort(f.routes[a]), f.routeShort(f.routes[b])));
    };
    // list pane
    const search = GV.textField(t('searchRoutes'), (v) => { rs.q = v; refresh(); });
    const agencySel = f.agencies.length > 1 ? U.select({ label: t('agency'), value: rs.agency, items: [{ value: '', label: t('all') }, ...f.agencies.map((a) => ({ value: a.agency_id, label: a.agency_name || a.agency_id }))], onChange: (v) => { rs.agency = v; refresh(); } }) : null;
    const typeChips = h('div.chips'); for (const k of typesPresent) typeChips.append(U.filterChip(GA.typeName(k), rs.types.has(k), (on) => { if (on) rs.types.add(k); else rs.types.delete(k); refresh(); }, { count: f.routes.filter((r) => String(+r.route_type || 0) === k).length }));
    const netSel = nets.size ? U.select({ label: t('network'), value: rs.network, items: [{ value: '', label: t('all') }, ...[...nets.keys()].map((n) => ({ value: n, label: f.label('network', n) || n }))], onChange: (v) => { rs.network = v; refresh(); } }) : null;
    const sortSeg = U.segmented({ label: t('sortBy'), value: rs.sort, items: [{ value: 'num', label: t('byNumber'), icon: 'list' }, { value: 'trips', label: t('byTrips'), icon: 'clock' }], onChange: (v) => { rs.sort = v; refresh(); } });
    const modeSeg = U.segmented({ label: t('viewMode'), value: rs.mode, items: [{ value: 'list', label: t('listView'), icon: 'list' }, { value: 'grid', label: t('gridView'), icon: 'dashboard' }], onChange: (v) => { rs.mode = v; buildList(); } });
    const count = h('p.sub.count', { 'aria-live': 'polite' }); const selBar = h('div.chips.selbar');
    const listHost = h('div.listhost');
    let vl = null;
    const rowFor = (ri) => {
      const r = f.routes[ri], on = GA.sel.has(ri), row = h('div.rrow' + (ri === sel ? '.cur' : '') + (rs.mode === 'grid' ? '.card' : ''));
      const a = h('a', { class: 'rrow-a', href: GA.href('route', r.route_id), tabindex: -1 });
      a.append(GA.badge(r, true), h('span.rrow-t', null, h('b', { text: f.routeName(r) }), h('small', { text: GA.typeName(r.route_type) + ' · ' + GA.n(f.routePatterns[ri].length ? f.patternStops(f.routePatterns[ri][0]).length : 0) + ' ' + t('stopsLc') + ' · ' + GA.n(perRoute[ri]) + ' ' + t('tripsOnDate') })), GV.thumb(ri, rs.mode === 'grid' ? 150 : 56, rs.mode === 'grid' ? 70 : 38));
      const chk = h('button', { type: 'button', class: 'ibtn pick' + (on ? ' on' : ''), tabindex: -1, 'aria-pressed': on, 'aria-label': t('selectRoute') + ' ' + f.routeName(r), 'data-tip': t('selectForMap'), html: U.icon(on ? 'check' : 'add_map', 20), onclick: (e) => { e.stopPropagation(); if (GA.sel.has(ri)) GA.sel.delete(ri); else GA.sel.add(ri); GA.renderChrome(); buildSel(); vl.redraw(); } });
      row.append(a, chk); return row;
    };
    const buildSel = () => { selBar.textContent = ''; for (const ri of [...GA.sel].slice(0, 12)) selBar.append(U.inputChip(f.routeShort(f.routes[ri]), () => { GA.sel.delete(ri); GA.renderChrome(); buildSel(); vl && vl.redraw(); }, f.routeColor(f.routes[ri]))); if (GA.sel.size > 12) selBar.append(h('span.sub', { text: '+' + (GA.sel.size - 12) })); if (GA.sel.size) selBar.append(U.btn(t('clearSel'), { kind: 'text', onclick: () => { GA.sel.clear(); GA.renderChrome(); buildSel(); vl.redraw(); } })); };
    const buildList = () => {
      listHost.textContent = ''; const gridMode = rs.mode === 'grid'; const rowH = gridMode ? 112 : 64;
      const cols = () => gridMode ? Math.max(1, Math.floor((listHost.clientWidth || 320) / 190)) : 1;
      vl = U.vlist({ label: t('nav_routes'), rowH, id: 'rl', count: 0, render: (i) => { if (!gridMode) return rowFor(rows[i]); const c = cols(), wrap = h('div.rgrid'); for (let k = 0; k < c && i * c + k < rows.length; k++) wrap.append(rowFor(rows[i * c + k])); return wrap; }, onActivate: (i) => { if (!gridMode) GA.go(GA.href('route', f.routes[rows[i]].route_id)); } });
      listHost.append(vl.el); vl.setCount(gridMode ? Math.ceil(rows.length / cols()) : rows.length); if (sel !== undefined) { const ix = rows.indexOf(sel); if (ix >= 0 && !gridMode) vl.setActive(ix, true); }
    };
    const refresh = () => { compute(); count.textContent = t('nResults', { n: GA.n(rows.length), m: GA.n(f.routes.length) }); buildList(); };
    const list = h('div.listpane', null, search.el, h('div.row', null, agencySel && agencySel.el, netSel && netSel.el), typeChips, h('div.row.between', null, sortSeg.el, modeSeg.el), selBar, count, listHost);
    // detail pane
    const detail = h('div.detail');
    if (sel === undefined) {
      if (id) detail.append(GA.empty('error', t('notFound', { id })));
      else detail.append(GA.empty('route', t('pickRoute'), t('pickRouteSub')));
    } else GV.routeDetail(detail, sel, perRoute);
    page.append(GV.split(list, detail, sel !== undefined));
    refresh(); buildSel();
    return () => { };
  };

  const patLabel = (p) => { const f = GA.feed, st = f.patternStops(p.id), a = f.stops[st[0]], b = f.stops[st[st.length - 1]]; return (a ? f.stopName(a) : '?') + ' → ' + (b ? f.stopName(b) : '?') + ' · ' + st.length + ' ' + t('stopsLc') + ' · ' + p.trips.length + ' ' + t('tripsLc'); };
  GV.patternItems = (ri, dir) => { const f = GA.feed; return f.routePatterns[ri].map((i) => f.patterns[i]).filter((p) => dir === 'all' || p.dir === dir || (dir === '0' && p.dir === '')).slice(0, 40); };

  GV.routeDetail = (host, ri, perRoute) => {
    const f = GA.feed, r = f.routes[ri]; const dirs = [...new Set(f.routePatterns[ri].map((p) => f.patterns[p].dir))].sort();
    if (rs.routeFor !== ri) { rs.routeFor = ri; rs.dir = 'all'; rs.pat = null; }
    const head = h('header.dh', null, GA.badge(r, true), h('div.dh-t', null, h('h2', { text: f.routeName(r) }), h('p.sub', { text: GA.typeName(r.route_type) + ' · ' + (f.agencyIx.has(r.agency_id) ? f.agencies[f.agencyIx.get(r.agency_id)].agency_name : r.agency_id || '') })), GV.backBtn('#routes', t('nav_routes')));
    const chips = h('div.chips'); if (r.continuous_pickup && r.continuous_pickup !== '1') chips.append(h('span.tag', { text: t('contPickup') + ': ' + enumL('cont', r.continuous_pickup) })); if (r.continuous_drop_off && r.continuous_drop_off !== '1') chips.append(h('span.tag', { text: t('contDrop') + ': ' + enumL('cont', r.continuous_drop_off) }));
    for (const n of f.table('route_networks')) if (n.route_id === r.route_id) chips.append(h('span.tag', { text: t('network') + ': ' + (f.label('network', n.network_id) || n.network_id) }));
    const dirSeg = dirs.length > 1 ? U.segmented({ label: t('direction'), value: rs.dir, items: [{ value: 'all', label: t('both') }, ...dirs.map((d) => ({ value: d, label: d === '' ? t('noDir') : enumL('dir', d) || d }))], onChange: (v) => { rs.dir = v; rs.pat = null; body(); } }) : null;
    const dateBtn = GA.dateButton(GA.date, () => body());
    const viewSeg = U.segmented({ label: t('viewL'), value: rs.view, items: [{ value: 'map', label: t('vMap'), icon: 'map' }, { value: 'stops', label: t('vStops'), icon: 'place' }, { value: 'timetable', label: t('vTimetable'), icon: 'table' }, { value: 'service', label: t('vService'), icon: 'clock' }, { value: 'info', label: t('vInfo'), icon: 'info' }], onChange: (v) => { rs.view = v; body(); } });
    const content = h('div.dbody'); host.append(head, chips, h('div.row.ctl', null, dirSeg && dirSeg.el, dateBtn), viewSeg.el, content);
    let cleanup = null;
    const curPattern = () => { const items = GV.patternItems(ri, rs.dir); if (!items.length) return null; return items.find((p) => p.id === rs.pat) || items[0]; };
    const patSel = () => { const items = GV.patternItems(ri, rs.dir); if (items.length < 2) return null; const cur = curPattern(); return U.select({ label: t('pattern'), value: cur.id, items: items.map((p) => ({ value: p.id, label: patLabel(p) })), onChange: (v) => { rs.pat = v; body(); } }); };
    const body = () => {
      if (cleanup) { cleanup(); cleanup = null; } content.textContent = ''; const pat = curPattern(); const ps = patSel(); if (ps) content.append(h('div.row', null, ps.el));
      if (!pat && rs.view !== 'info') { content.append(GA.empty('route', t('noTripsRoute'))); return; }
      GV['route_' + rs.view](content, ri, pat, perRoute);
    };
    body(); return;
  };

  GV.route_map = (host, ri, pat) => {
    const f = GA.feed, r = f.routes[ri], col = f.routeColor(r), box = h('div.mapbox.tall'); host.append(box);
    const others = f.routePatterns[ri].map((i) => f.patterns[i]).filter((p) => p !== pat).slice(0, 30);
    const stopsIdx = f.patternStops(pat.id); const pts = f.tripPath(pat.rep); const otherPaths = others.map((p) => f.tripPath(p.rep));
    const m = GV.map(box, t('vMap'));
    m.addLayer((ctx) => { for (const p of otherPaths) GV.drawPath(ctx, m, p, col, 3, { alpha: 0.28 }); GV.drawPath(ctx, m, pts, col, 5, { halo: '#fff', arrows: true }); for (const si of stopsIdx) { const s = f.stops[si]; if (s && s.ok) GV.drawStop(ctx, m.px(s.lat, s.lon), col, 4.5); } });
    m.onHit((x, y) => { for (const si of stopsIdx) { const s = f.stops[si]; if (!s || !s.ok) continue; const p = m.px(s.lat, s.lon); if (Math.hypot(p[0] - x, p[1] - y) < 10) return { stop: s }; } return null; });
    m.o.onClick = (hit) => { if (hit) GA.go(GA.href('stop', hit.stop.stop_id)); }; m.o.onHover = (hit) => { box.style.cursor = hit ? 'pointer' : ''; box.title = hit ? f.stopName(hit.stop) : ''; };
    const all = [...pts]; m.setHome(GV.boundsOf(all.length ? all : [[43.7, -79.4]]));
    host.append(h('p.sub', { text: t('mapHelp') }));
  };

  GV.route_stops = (host, ri, pat) => {
    const f = GA.feed, st = f.st, t0 = pat.rep, a = st.tripStart[t0]; const list = h('ol.stoplist');
    f.patternStops(pat.id).forEach((si, i) => { const s = f.stops[si], r = a + i; const fl = st.flags[r]; const li = h('li', null, h('span.sl-dot'), h('span.sl-main', null, h('a', { class: 'lnk', href: GA.href('stop', s ? s.stop_id : ''), text: s ? f.stopName(s) : '?' }), h('small', { text: [s && s.stop_code, (fl >> 4 & 3) === 2 ? t('timepoint') : '', (fl & 3) === 1 ? t('noPickup') : '', (fl >> 2 & 3) === 1 ? t('noDropoff') : ''].filter(Boolean).join(' · ') })), h('span.sl-time', { text: fmt(st.dep[r] >= 0 ? st.dep[r] : st.arr[r]) })); list.append(li); });
    host.append(h('p.sub', { text: t('firstTripTimes', { id: f.trips[t0].trip_id }) }), list);
  };

  // Timetable: stops as rows, runs as columns.
  GV.timetableRuns = (ri, pat, date) => {
    const f = GA.feed, sv = f.servicesOn(date), runs = [];
    for (const ti of pat.trips) { if (!sv.has(f.trips[ti].service_id)) continue; const fr = f.freq.get(ti); for (const o of f.runs(ti)) runs.push({ ti, off: o, freq: !!fr, first: f.first[ti] + o }); }
    runs.sort((a, b) => a.first - b.first); return runs;
  };
  GV.route_timetable = (host, ri, pat) => {
    const f = GA.feed, st = f.st; const runs = GV.timetableRuns(ri, pat, GA.date), stops = f.patternStops(pat.id);
    const exportBtn = U.btn(t('exportCsv'), { kind: 'tonal', icon: 'download', onclick: () => { const rows = [[t('stopL'), ...runs.map((r) => fmt(r.first))]]; stops.forEach((si, i) => rows.push([f.stopName(f.stops[si]), ...runs.map((r) => { const rr = st.tripStart[r.ti] + i, v = st.dep[rr] >= 0 ? st.dep[rr] : st.arr[rr]; return v >= 0 ? fmt(v + r.off) : ''; })])); GV.downloadCsv(rows, 'timetable-' + f.routes[ri].route_id + '-' + GA.date + '.csv'); U.snack(t('exported', { n: runs.length })); } });
    host.append(h('div.row.between', null, h('p.sub', { text: t('timetableInfo', { n: GA.n(runs.length), d: GA.dateText(GA.date) }) }), exportBtn));
    if (!runs.length) { host.append(GA.empty('calendar', t('noRunsDate'))); return; }
    const legend = h('p.sub.legend', null, h('b', { text: '12:00' }), ' ' + t('lgTimepoint') + '   ', h('i', { text: '~12:00' }), ' ' + t('lgFreq') + '   ', h('span.pu', { text: 'P' }), ' ' + t('lgNoPickup') + '   ', h('span.pu', { text: 'D' }), ' ' + t('lgNoDrop')); host.append(legend);
    const grid = U.vgrid({ label: t('vTimetable'), rowH: 34, colW: 78, headW: 210, headH: 58, corner: t('stopL'),
      rowHead: (r) => { const s = f.stops[stops[r]]; const e = h('div.vg-rhc'); e.append(h('a', { class: 'lnk', href: GA.href('stop', s ? s.stop_id : ''), text: s ? f.stopName(s) : '?' })); return e; },
      colHead: (c) => { const run = runs[c], tr0 = f.trips[run.ti]; const e = h('a', { class: 'vg-chc', href: GA.href('trip', tr0.trip_id), 'data-tip': tr0.trip_id + (run.freq ? ' · ' + t('lgFreq') : ''), text: '' }); e.append(h('b', { text: (run.freq ? '~' : '') + fmt(run.first) }), h('small', { text: tr0.trip_short_name || tr0.trip_id })); return e; },
      cell: (r, c) => { const run = runs[c], rr = st.tripStart[run.ti] + r; const fl = st.flags[rr], v = st.dep[rr] >= 0 ? st.dep[rr] : st.arr[rr]; const e = h('div.vg-cell' + ((fl >> 4 & 3) === 2 ? '.tp' : '') + (run.freq ? '.fq' : '')); e.textContent = v >= 0 ? fmt(v + run.off) : '–'; const tags = []; if ((fl & 3) === 1) tags.push('P'); if ((fl >> 2 & 3) === 1) tags.push('D'); if (tags.length) e.append(h('span.pu', { text: tags.join('') })); const dd = st.dist[rr]; const tip = [(fl & 3) === 1 ? t('noPickup') : '', (fl >> 2 & 3) === 1 ? t('noDropoff') : '', (fl >> 4 & 3) === 1 ? t('approxTime') : '', !Number.isNaN(dd) ? 'shape_dist_traveled ' + dd : ''].filter(Boolean).join(' · '); if (tip) { e.setAttribute('data-tip', tip); } return e; } });
    grid.set(stops.length, runs.length); host.append(h('div.gridwrap', null, grid.el));
  };
  GV.downloadCsv = (rows, name) => { const q = (v) => /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v); const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }); const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };

  const BANDS = [['early', 0, 6], ['am', 6, 9], ['midday', 9, 15], ['pm', 15, 19], ['evening', 19, 24]];
  GV.route_service = (host, ri, pat) => {
    const f = GA.feed, stats = f.routeStats(ri, GA.date); const hw = f.headwayBands(stats.times);
    host.append(h('div.stats', null, GA.stat(t('tripsOnDateL'), GA.n(stats.trips), GA.dateText(GA.date)), GA.stat(t('firstTrip'), fmt(stats.first) || '–'), GA.stat(t('lastTrip'), fmt(stats.last) || '–'), GA.stat(t('patternsL'), GA.n(f.routePatterns[ri].length))));
    const data = stats.hours.map((n, hr) => ({ value: n, tip: C.pad(hr) + ':00 - ' + C.pad(hr) + ':59: ' + n + ' ' + t('tripsLc'), color: BANDS.find((b) => hr >= b[1] && hr < b[2]) && rs.band === BANDS.find((b) => hr >= b[1] && hr < b[2])[0] ? 'var(--md-primary)' : null }));
    host.append(GA.card(t('tripsPerHour'), GA.barChart({ label: t('tripsPerHour'), data, height: 130, axis: ['00', '06', '12', '18', '23'] })));
    const out = h('div.band-out'); const bandSeg = U.segmented({ label: t('timeBand'), value: rs.band, items: BANDS.map(([k, a, b]) => ({ value: k, label: t('band_' + k), tip: C.pad(a) + ':00-' + C.pad(b) + ':00' })), onChange: (v) => { rs.band = v; draw(); } });
    const draw = () => { const [, a, b] = BANDS.find((x) => x[0] === rs.band), ts = stats.times.filter((x) => x >= a * 3600 && x < b * 3600); out.textContent = ''; out.append(h('div.stats', null, GA.stat(t('headway'), hw[rs.band] ? hw[rs.band] + ' ' + t('minLc') : '–'), GA.stat(t('tripsLc'), GA.n(ts.length)))); if (ts.length) out.append(h('p.sub', { text: ts.slice(0, 80).map(fmt).join('  ') + (ts.length > 80 ? ' …' : '') })); data.forEach((d, hr) => { d.color = hr >= a && hr < b ? 'var(--md-primary)' : null; }); host.querySelectorAll('.bar').forEach((el, hr) => { el.style.background = data[hr].color || ''; }); };
    host.append(GA.card(t('headwayByBand'), bandSeg.el, out)); draw();
    const fr = []; for (const ti of f.routeTrips[ri]) { const w = f.freq.get(ti); if (w) for (const x of w) fr.push([f.trips[ti].trip_id, x]); }
    if (fr.length) host.append(GA.card(t('frequencyWindows'), h('ul.plain', null, fr.slice(0, 20).map(([id, w]) => h('li', { text: id + ': ' + fmt(w.start) + ' - ' + fmt(w.end) + ', ' + Math.round(w.headway / 60 * 10) / 10 + ' ' + t('minLc') + ' (' + (w.exact ? t('exactTimes') : t('inexactTimes')) + ')' })))));
  };
  GV.route_info = (host, ri) => {
    const f = GA.feed, r = f.routes[ri]; const pairs = [];
    for (const k of f.cols['routes.txt'] || Object.keys(r)) { let v = r[k]; if (v === '') continue; if (k === 'route_type') v = v + ' · ' + GA.typeName(v); else if (k === 'agency_id') v = v + (f.label('agency', v) ? ' · ' + f.label('agency', v) : ''); else if (k === 'route_color' || k === 'route_text_color') { const sw = h('span', null, h('span.swatch', { style: { background: '#' + v } }), ' #' + v); v = sw; } else if (k === 'continuous_pickup' || k === 'continuous_drop_off') v = v + ' · ' + enumL('cont', v); else if (/^https?:/.test(v)) v = h('a', { class: 'lnk', href: v, target: '_blank', rel: 'noopener', text: v }); pairs.push([k, v]); }
    host.append(GA.card(t('vInfo'), GA.kv(pairs)));
    if (f.tlang) { const tl = f.tr('routes', 'route_long_name', r.route_id, r.route_long_name); host.append(h('p.sub', { text: t('translatedTo', { l: f.tlang }) + ': ' + tl })); }
  };

  // ---------- STOPS ----------
  const ss = { q: '', types: new Set(), board: 'all' };
  const STOP_ICON = { '0': 'place', '1': 'home', '2': 'open_new', '3': 'shapes', '4': 'stairs' };
  V.stops = (page, { view, args }) => {
    const f = GA.feed; const id = view === 'stop' ? args[0] : null; const sel = id ? f.stopIx.get(id) : undefined; let rows = [];
    const lt = (s) => s.location_type || '0';
    const compute = () => { const q = ss.q.trim().toLowerCase(); rows = []; f.stops.forEach((s, i) => { if (ss.types.size && !ss.types.has(lt(s))) return; if (q && !(f.stopName(s) + ' ' + s.stop_id + ' ' + (s.stop_code || '')).toLowerCase().includes(q)) return; rows.push(i); }); };
    const search = GV.textField(t('searchStops'), (v) => { ss.q = v; refresh(); }); const chips = h('div.chips');
    for (const k of ['0', '1', '2', '3', '4']) { const n = f.stops.filter((s) => lt(s) === k).length; if (n) chips.append(U.filterChip(enumL('loc', k), ss.types.has(k), (on) => { if (on) ss.types.add(k); else ss.types.delete(k); refresh(); }, { count: n, icon: STOP_ICON[k] })); }
    const count = h('p.sub.count', { 'aria-live': 'polite' }), host = h('div.listhost'); let vl;
    vl = U.vlist({ label: t('nav_stops'), rowH: 60, id: 'sl', count: 0, render: (i) => { const s = f.stops[rows[i]]; const a = h('a', { class: 'srow' + (rows[i] === sel ? ' cur' : ''), href: GA.href('stop', s.stop_id), tabindex: -1 }); const rts = f.routesAt(rows[i]).slice(0, 4); a.append(h('span.srow-ic', { html: U.icon(STOP_ICON[lt(s)] || 'place', 22) }), h('span.srow-t', null, h('b', { text: f.stopName(s) }), h('small', { text: [s.stop_id, enumL('loc', lt(s)), s.platform_code ? t('platform') + ' ' + s.platform_code : ''].filter(Boolean).join(' · ') })), h('span.srow-r', null, rts.map((ri) => GA.badge(f.routes[ri])))); return a; }, onActivate: (i) => GA.go(GA.href('stop', f.stops[rows[i]].stop_id)) });
    host.append(vl.el);
    const refresh = () => { compute(); count.textContent = t('nResults', { n: GA.n(rows.length), m: GA.n(f.stops.length) }); vl.setCount(rows.length); if (sel !== undefined) { const ix = rows.indexOf(sel); if (ix >= 0) vl.setActive(ix, true); } };
    const list = h('div.listpane', null, search.el, chips, count, host);
    const detail = h('div.detail');
    if (sel === undefined) { detail.append(id ? GA.empty('error', t('notFound', { id })) : h('div', null, GA.empty('place', t('pickStop'), t('pickStopSub')))); const box = h('div.mapbox.tall'); detail.append(box); setTimeout(() => GV.stopsMap(box, null), 0); }
    else GV.stopDetail(detail, sel);
    page.append(GV.split(list, detail, sel !== undefined)); refresh();
  };

  /** Clustered map of all stops; selected stop is highlighted. */
  GV.stopsMap = (box, sel, extra) => {
    const f = GA.feed, m = GV.map(box, t('nav_stops')); const pts = f.stops.filter((s) => s.ok);
    m.addLayer((ctx) => {
      if (extra) extra(ctx, m);
      const cell = m.z >= 15.5 ? 0 : 46; const cl = new Map(); m.cl = [];
      for (const s of pts) { const p = m.px(s.lat, s.lon); if (p[0] < -20 || p[0] > m.w + 20 || p[1] < -20 || p[1] > m.h + 20) continue; if (!cell) { m.cl.push({ x: p[0], y: p[1], n: 1, s }); continue; } const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); const c = cl.get(k); if (c) { c.x += p[0]; c.y += p[1]; c.n++; } else { const o = { x: p[0], y: p[1], n: 1, s }; cl.set(k, o); m.cl.push(o); } }
      for (const c of m.cl) { if (cell && c.n > 1) { c.x /= c.n; c.y /= c.n; const r = Math.min(24, 11 + Math.log2(c.n) * 2.2); ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 7); ctx.fillStyle = getComputedStyle(box).getPropertyValue('--md-primary-container'); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = getComputedStyle(box).getPropertyValue('--md-primary'); ctx.stroke(); ctx.fillStyle = getComputedStyle(box).getPropertyValue('--md-on-primary-container'); ctx.font = '600 12px Roboto, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.n > 999 ? Math.round(c.n / 100) / 10 + 'k' : String(c.n), c.x, c.y + 0.5); } else { const on = c.s === (sel !== null && sel !== undefined ? f.stops[sel] : null); GV.drawStop(ctx, [c.x, c.y], on ? '#d93025' : getComputedStyle(box).getPropertyValue('--md-primary'), on ? 7 : 4, on ? 3 : 2); } }
      if (sel !== null && sel !== undefined) { const s = f.stops[sel]; if (s.ok) { const p = m.px(s.lat, s.lon); GV.drawStop(ctx, p, '#d93025', 8, 3); } }
    });
    m.onHit((x, y) => { for (const c of m.cl || []) { if (Math.hypot(c.x - x, c.y - y) < (c.n > 1 ? 16 : 9)) return c; } return null; });
    m.o.onClick = (c) => { if (!c) return; if (c.n > 1) m.zoomTo(m.z + 2, c.x, c.y); else GA.go(GA.href('stop', c.s.stop_id)); }; m.o.onHover = (c) => { box.style.cursor = c ? 'pointer' : ''; box.title = c ? (c.n > 1 ? c.n + ' ' + t('stopsLc') : f.stopName(c.s)) : ''; };
    if (sel !== null && sel !== undefined && f.stops[sel].ok) m.setView(f.stops[sel].lat, f.stops[sel].lon, 16); else m.setHome(f.bounds);
    return m;
  };

  GV.stopDetail = (host, si) => {
    const f = GA.feed, s = f.stops[si], lt = s.location_type || '0';
    host.append(h('header.dh', null, h('span.srow-ic.big', { html: U.icon(STOP_ICON[lt] || 'place', 28) }), h('div.dh-t', null, h('h2', { text: f.stopName(s) }), h('p.sub', { text: s.stop_id + ' · ' + enumL('loc', lt) })), GV.backBtn('#stops', t('nav_stops'))));
    const pairs = []; for (const k of f.cols['stops.txt'] || Object.keys(s)) { if (['lat', 'lon', 'ok'].includes(k)) continue; let v = s[k]; if (v === '' || v === undefined) continue; if (k === 'location_type') v = v + ' · ' + enumL('loc', v); else if (k === 'wheelchair_boarding') v = v + ' · ' + enumL('wc', v); else if (k === 'parent_station') v = h('a', { class: 'lnk', href: GA.href('stop', v), text: v + (f.label('stop', v) ? ' · ' + f.label('stop', v) : '') }); else if (k === 'level_id') v = v + (f.label('level', v) ? ' · ' + f.label('level', v) : ''); else if (/^https?:/.test(v)) v = h('a', { class: 'lnk', href: v, target: '_blank', rel: 'noopener', text: v }); pairs.push([k, v]); }
    const tags = h('div.chips'); if (s.wheelchair_boarding === '1') tags.append(h('span.tag.ok', { html: U.icon('accessible', 16) + ' ' + U.esc(t('wheelchairYes')) })); if (s.wheelchair_boarding === '2') tags.append(h('span.tag', { text: t('wheelchairNo') })); if (s.platform_code) tags.append(h('span.tag', { text: t('platform') + ' ' + s.platform_code })); if (s.level_id) tags.append(h('span.tag', { text: t('level') + ' ' + (f.label('level', s.level_id) || s.level_id) }));
    host.append(tags);
    const box = h('div.mapbox'); host.append(box); setTimeout(() => GV.stopsMap(box, si), 0);
    // hierarchy
    const kids = f.childrenOf(s.stop_id); const parent = s.parent_station ? f.stops[f.stopIx.get(s.parent_station)] : null;
    if (kids.length || parent) host.append(GA.card(t('hierarchy'), parent ? h('p', null, t('parentStation') + ': ', GA.link('stop', parent.stop_id, f.stopName(parent))) : null, kids.length ? h('ul.plain', null, kids.map((k) => h('li', null, GA.link('stop', k.stop_id, f.stopName(k) + ' (' + k.stop_id + ')'), ' ', h('span.sub', { text: enumL('loc', k.location_type || '0') + (k.level_id ? ' · ' + t('level') + ' ' + (f.label('level', k.level_id) || k.level_id) : '') + (k.platform_code ? ' · ' + t('platform') + ' ' + k.platform_code : '') })))) : null));
    host.append(GA.card(t('vInfo'), GA.kv(pairs)));
    const rts = f.routesAt(si); host.append(GA.card(t('routesServing') + ' (' + rts.length + ')', rts.length ? h('div.chips', null, rts.map((ri) => { const a = h('a', { class: 'rchip', href: GA.href('route', f.routes[ri].route_id) }); a.append(GA.badge(f.routes[ri]), h('span', { text: f.routes[ri].route_long_name || '' })); return a; })) : h('p.sub', { text: t('none') })));
    // departure board
    const bsel = h('div.board'); const dateBtn = GA.dateButton(GA.date, () => draw()), timeBtn = GA.timeButton(() => draw());
    const rf = U.select({ label: t('route'), value: ss.board, items: [{ value: 'all', label: t('all') }, ...rts.map((ri) => ({ value: String(ri), label: f.routeShort(f.routes[ri]) + ' ' + (f.routes[ri].route_long_name || '') }))], onChange: (v) => { ss.board = v; draw(); } });
    const draw = () => {
      bsel.textContent = ''; let deps = f.departures(si, GA.date, GA.time, 400); if (ss.board !== 'all') deps = deps.filter((d) => f.routeIx.get(f.trips[d.trip].route_id) === +ss.board); deps = deps.slice(0, 60);
      if (!deps.length) { bsel.append(GA.empty('clock', t('noDepartures'))); return; }
      const tb = h('table.tbl'); tb.append(h('thead', null, h('tr', null, [t('timeL'), t('route'), t('headsign'), t('stopL')].map((x) => h('th', { text: x })))));
      const body = h('tbody'); for (const d of deps) { const tr0 = f.trips[d.trip], ri = f.routeIx.get(tr0.route_id); const lastRow = f.st.tripStart[d.trip + 1] - 1; const dest = f.stops[f.st.stop[lastRow]]; const row = h('tr', null, h('td.num', { text: fmt(d.time) + (f.freq.has(d.trip) ? ' ~' : '') }), h('td', null, ri === undefined ? tr0.route_id : GA.badge(f.routes[ri])), h('td', null, h('a', { class: 'lnk', href: GA.href('trip', tr0.trip_id), text: f.headsign(tr0) || (dest ? f.stopName(dest) : tr0.trip_id) })), h('td', { text: d.stop !== si ? f.stopName(f.stops[d.stop]) : (f.st.extras ? '' : '') })); body.append(row); }
      tb.append(body); bsel.append(h('div.tblwrap', null, tb));
    };
    host.append(GA.card(t('departureBoard'), h('div.row.ctl', null, dateBtn, timeBtn, rf.el), bsel)); draw();
    // transfers and pathways
    const tf = f.table('transfers').filter((x) => x.from_stop_id === s.stop_id || x.to_stop_id === s.stop_id);
    if (tf.length) host.append(GA.card(t('transfersL') + ' (' + tf.length + ')', h('ul.plain', null, tf.slice(0, 30).map((x) => h('li', null, GA.link('stop', x.from_stop_id, f.label('stop', x.from_stop_id) || x.from_stop_id), ' → ', GA.link('stop', x.to_stop_id, f.label('stop', x.to_stop_id) || x.to_stop_id), ' ', h('span.sub', { text: enumL('xfer', x.transfer_type) + (x.min_transfer_time ? ' · ' + x.min_transfer_time + ' s' : '') }))))));
    const pw = f.table('pathways').filter((x) => x.from_stop_id === s.stop_id || x.to_stop_id === s.stop_id || kids.some((k) => k.stop_id === x.from_stop_id || k.stop_id === x.to_stop_id));
    if (pw.length) host.append(GA.card(t('pathwaysL') + ' (' + pw.length + ')', U.btn(t('openPathways'), { kind: 'tonal', icon: 'sync', onclick: () => GA.go('#transfers/pathways/' + encodeURIComponent(parent ? parent.stop_id : s.stop_id)) })));
  };

  // ---------- TRIPS ----------
  const ts = { q: '', onDate: true, route: '' };
  V.trips = (page, { view, args }) => {
    const f = GA.feed; const id = view === 'trip' ? args[0] : null; const sel = id ? f.tripIx.get(id) : undefined; let rows = [];
    const compute = () => { const q = ts.q.trim().toLowerCase(); const sv = ts.onDate ? f.servicesOn(GA.date) : null; rows = []; for (let i = 0; i < f.trips.length; i++) { const x = f.trips[i]; if (sv && !sv.has(x.service_id)) continue; if (ts.route && x.route_id !== ts.route) continue; if (q && !(x.trip_id + ' ' + x.trip_headsign + ' ' + x.trip_short_name + ' ' + x.block_id).toLowerCase().includes(q)) continue; rows.push(i); } rows.sort((a, b) => f.first[a] - f.first[b]); };
    const search = GV.textField(t('searchTrips'), (v) => { ts.q = v; refresh(); });
    const sw = U.switch(t('onlyOnDate'), ts.onDate, (v) => { ts.onDate = v; refresh(); }); const dateBtn = GA.dateButton(GA.date, () => refresh());
    const routeAc = U.autocomplete({ label: t('filterRoute'), source: (q) => { q = q.toLowerCase(); return f.routes.map((r, i) => ({ r, i })).filter((x) => !q || (f.routeName(x.r) + ' ' + x.r.route_id).toLowerCase().includes(q)).slice(0, 30).map((x) => ({ value: x.r.route_id, label: f.routeName(x.r), sub: GA.typeName(x.r.route_type), badge: GA.badgeStyle(x.r) })); }, onSelect: (it) => { ts.route = it.value; refresh(); }, onClear: () => { ts.route = ''; refresh(); } });
    if (ts.route && f.routeIx.has(ts.route)) routeAc.set(f.routeName(f.routes[f.routeIx.get(ts.route)]));
    const count = h('p.sub.count', { 'aria-live': 'polite' }), host = h('div.listhost'); let vl;
    vl = U.vlist({ label: t('nav_trips'), rowH: 58, id: 'tl', count: 0, render: (i) => { const x = f.trips[rows[i]], ri = f.routeIx.get(x.route_id); const a = h('a', { class: 'srow' + (rows[i] === sel ? ' cur' : ''), href: GA.href('trip', x.trip_id), tabindex: -1 }); a.append(ri === undefined ? h('span.badge', { text: '?' }) : GA.badge(f.routes[ri]), h('span.srow-t', null, h('b', { text: f.headsign(x) || x.trip_short_name || x.trip_id }), h('small', { text: x.trip_id + (x.block_id ? ' · ' + t('kindBlock') + ' ' + x.block_id : '') })), h('span.srow-r.time', { text: fmt(f.first[rows[i]]) + (f.freq.has(rows[i]) ? ' ~' : '') })); return a; }, onActivate: (i) => GA.go(GA.href('trip', f.trips[rows[i]].trip_id)) });
    host.append(vl.el);
    const refresh = () => { compute(); count.textContent = t('nResults', { n: GA.n(rows.length), m: GA.n(f.trips.length) }); vl.setCount(rows.length); if (sel !== undefined) { const ix = rows.indexOf(sel); if (ix >= 0) vl.setActive(ix, true); } };
    const list = h('div.listpane', null, search.el, routeAc.el, h('div.row.ctl', null, sw.el, dateBtn), count, host);
    const detail = h('div.detail'); if (sel === undefined) detail.append(id ? GA.empty('error', t('notFound', { id })) : GA.empty('clock', t('pickTrip'), t('pickTripSub'))); else GV.tripDetail(detail, sel);
    page.append(GV.split(list, detail, sel !== undefined)); refresh();
  };

  GV.rtDelay = (tripId) => { const rt = GA.rt; if (!rt) return null; return rt.updates.find((u) => u.tripId === tripId) || null; };
  GV.tripDetail = (host, ti) => {
    const f = GA.feed, x = f.trips[ti], ri = f.routeIx.get(x.route_id), st = f.st, a = st.tripStart[ti], b = st.tripStart[ti + 1];
    host.append(h('header.dh', null, ri === undefined ? h('span.badge.big', { text: '?' }) : GA.badge(f.routes[ri], true), h('div.dh-t', null, h('h2', { text: f.headsign(x) || x.trip_short_name || x.trip_id }), h('p.sub', { text: x.trip_id + (ri === undefined ? '' : ' · ' + f.routeName(f.routes[ri])) })), GV.backBtn('#trips', t('nav_trips'))));
    const pairs = []; for (const k of f.cols['trips.txt'] || Object.keys(x)) { let v = x[k]; if (v === '') continue; if (k === 'route_id') v = GA.link('route', v, v + (f.label('route', v) ? ' · ' + f.label('route', v) : '')); else if (k === 'service_id') v = GA.link('service', v, v); else if (k === 'shape_id') v = GA.link('shape', v, v); else if (k === 'direction_id') v = v + ' · ' + enumL('dir', v); else if (k === 'wheelchair_accessible') v = v + ' · ' + enumL('wct', v); else if (k === 'bikes_allowed') v = v + ' · ' + enumL('bike', v); pairs.push([k, v && v.nodeType ? v : v]); }
    const tags = h('div.chips'); if (x.wheelchair_accessible === '1') tags.append(h('span.tag.ok', { html: U.icon('accessible', 16) + ' ' + U.esc(t('wheelchairYes')) })); if (x.bikes_allowed === '1') tags.append(h('span.tag.ok', { text: t('bikesYes') })); if (f.freq.has(ti)) tags.append(h('span.tag', { text: t('lgFreq') })); host.append(tags);
    // block link fixes the date
    const dateBtn = x.block_id ? h('p', null, U.btn(t('openBlock'), { kind: 'tonal', icon: 'gantt', onclick: () => GA.go(GA.href('block', GA.date, x.block_id)) })) : null;
    const box = h('div.mapbox'); host.append(box);
    setTimeout(() => { const m = GV.map(box, t('vMap')), pts = f.tripPath(ti), col = ri === undefined ? '#5F6368' : f.routeColor(f.routes[ri]); const stops = []; for (let r = a; r < b; r++) { const s = f.stops[st.stop[r]]; if (s && s.ok) stops.push(s); } m.addLayer((ctx) => { GV.drawPath(ctx, m, pts, col, 5, { halo: '#fff', arrows: true }); for (const s of stops) GV.drawStop(ctx, m.px(s.lat, s.lon), col, 4.5); }); m.onHit((px, py) => { for (const s of stops) { const p = m.px(s.lat, s.lon); if (Math.hypot(p[0] - px, p[1] - py) < 10) return s; } return null; }); m.o.onClick = (s) => { if (s) GA.go(GA.href('stop', s.stop_id)); }; m.setHome(GV.boundsOf(pts.length ? pts : [[43.7, -79.4]])); }, 0);
    host.append(GA.card(t('vInfo'), GA.kv(pairs), dateBtn));
    // block neighbours
    if (x.block_id) { const bl = f.blocksOn(GA.date).find((q) => q.id === x.block_id); if (bl && bl.trips.includes(ti)) { const k = bl.trips.indexOf(ti); host.append(GA.card(t('inBlock', { id: x.block_id }), h('div.row', null, k > 0 ? h('span', null, t('prevTrip') + ': ', GA.link('trip', f.trips[bl.trips[k - 1]].trip_id, f.headsign(f.trips[bl.trips[k - 1]]) || f.trips[bl.trips[k - 1]].trip_id), ' (' + fmt(f.first[bl.trips[k - 1]]) + ')') : null, k < bl.trips.length - 1 ? h('span', null, t('nextTrip') + ': ', GA.link('trip', f.trips[bl.trips[k + 1]].trip_id, f.headsign(f.trips[bl.trips[k + 1]]) || f.trips[bl.trips[k + 1]].trip_id), ' (' + fmt(f.first[bl.trips[k + 1]]) + ')') : null), h('p.sub', { text: t('blockPosition', { i: k + 1, n: bl.trips.length }) }))); } }
    const fw = f.freq.get(ti); if (fw) host.append(GA.card(t('frequencyWindows'), h('ul.plain', null, fw.map((w) => h('li', { text: fmt(w.start) + ' - ' + fmt(w.end) + ', ' + Math.round(w.headway / 60 * 10) / 10 + ' ' + t('minLc') + ' (' + (w.exact ? t('exactTimes') : t('inexactTimes')) + ')' })))));
    // realtime
    const upd = GV.rtDelay(x.trip_id); if (upd) host.append(GA.card(t('realtimeL'), h('p', { text: upd.delay !== undefined ? t('delayTrip', { m: Math.round(upd.delay / 60 * 10) / 10 }) : t('updateNoDelay') })));
    // stop times
    const rows = []; for (let r = a; r < b; r++) rows.push(r);
    const dm = new Map(); if (upd) for (const s of upd.stops) { const key = s.stopId || ('#' + s.seq); dm.set(key, s); }
    const tbl = U.vtable({ label: t('stopTimesL'), rows: () => rows, rowH: 36, columns: [{ key: 'n', label: '#', width: 56, num: true }, { key: 'stop', label: t('stopL'), width: 230 }, { key: 'arr', label: t('arrival'), width: 90, num: true }, { key: 'dep', label: t('departure'), width: 90, num: true }, { key: 'pu', label: t('pickup'), width: 150 }, { key: 'do', label: t('dropoff'), width: 150 }, { key: 'tp', label: t('timepoint'), width: 100 }, { key: 'dist', label: 'shape_dist', width: 100, num: true }, { key: 'hs', label: t('headsign'), width: 150 }, { key: 'rt', label: t('realtimeL'), width: 120 }, { key: 'ex', label: t('otherFields'), width: 260 }],
      cell: (r, c) => { const i = r - a; const s = f.stops[st.stop[r]]; const fl = st.flags[r], ex = f.stExtra.get(r) || {}; switch (c.key) { case 'n': return i + 1; case 'stop': return s ? h('a', { class: 'lnk', href: GA.href('stop', s.stop_id), text: f.stopName(s) }) : (ex.stop_id || ex.location_id || ex.location_group_id || ''); case 'arr': return fmt(st.arr[r]); case 'dep': return fmt(st.dep[r]); case 'pu': return enumL('pu', fl & 3); case 'do': return enumL('pu', fl >> 2 & 3); case 'tp': return (fl >> 4 & 3) === 2 ? t('exactTime') : (fl >> 4 & 3) === 1 ? t('approxTime') : ''; case 'dist': return Number.isNaN(st.dist[r]) ? '' : st.dist[r]; case 'hs': return ex.stop_headsign || ''; case 'rt': { const u = s && (dm.get(s.stop_id) || dm.get('#' + (i + 1))); if (!u) return ''; const d = (u.arrival && u.arrival.delay !== undefined ? u.arrival.delay : u.departure && u.departure.delay) ; return d === undefined || d === false ? '' : (d >= 0 ? '+' : '') + Math.round(d / 6) / 10 + ' ' + t('minLc'); } case 'ex': return Object.entries(ex).filter(([k]) => k !== 'stop_headsign').map(([k, v]) => k + '=' + v).join('; '); default: return ''; } },
      sortValue: (r, c) => { const i = r - a; switch (c.key) { case 'n': return i; case 'arr': return st.arr[r]; case 'dep': return st.dep[r]; case 'dist': return st.dist[r]; default: return String(c.key === 'stop' ? (f.stops[st.stop[r]] ? f.stopName(f.stops[st.stop[r]]) : '') : ''); } } });
    host.append(GA.card(t('stopTimesL') + ' (' + rows.length + ')', h('div.vtwrap', null, tbl.el))); tbl.refresh();
  };
})();
