// gtfs-app.js: the shell of the GTFS viewer: opening feeds, navigation, theme, language, search and shared helpers.
// The views live in gtfs-views.js and gtfs-views2.js and register themselves on GA.views.
(function () {
  'use strict';
  const C = window.GtfsCore, U = window.GUI, h = U.h;
  const KEY = 'gmmc.gtfs.v1', EDITOR_KEY = 'gmmc.settings.v1';
  const GA = window.GA = { feed: null, views: {}, date: '', time: 8 * 3600, sel: new Set(), rt: null, validation: null, fileName: '', blob: null };
  const $ = (id) => document.getElementById(id);

  // ---------- storage ----------
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const prefs = Object.assign({ lang: null, theme: null, route: 'overview' }, load(KEY) || {});
  const editor = load(EDITOR_KEY) || {};
  if (!prefs.lang) prefs.lang = editor.lang === 'yue' ? 'yue' : 'en';
  if (!prefs.theme) prefs.theme = editor.theme || 'system';
  GA.savePrefs = () => save(KEY, prefs); GA.prefs = prefs;

  // ---------- language and theme ----------
  const I = window.I18N;
  GA.t = (k, v) => { let s = I.t(k); if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
  const t = GA.t; U.t = t; U.lang = () => (I.getLang() === 'yue' ? 'yue' : 'en'); U.locale = () => (I.getLang() === 'yue' ? 'zh-HK' : 'en-CA');
  GA.setLang = (l) => { prefs.lang = l; I.setLang(l); document.documentElement.lang = l === 'yue' ? 'zh-HK' : 'en'; GA.savePrefs(); document.title = t('appTitle'); GA.renderChrome(); GA.route(true); };
  GA.setTheme = (th) => { prefs.theme = th; if (th === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th); GA.savePrefs(); if (GA.mapRedraw) GA.mapRedraw(); GA.renderChrome(); };
  GA.isDark = () => { const th = document.documentElement.getAttribute('data-theme'); return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

  // ---------- shared helpers ----------
  GA.n = (x) => Number(x).toLocaleString(U.locale());
  GA.esc = U.esc;
  GA.badge = (r, big) => { const f = GA.feed; const s = h('span', { class: 'badge' + (big ? ' big' : ''), text: f.routeShort(r) }); s.style.background = f.routeColor(r); s.style.color = f.routeText(r); return s; };
  GA.badgeStyle = (r) => ({ bg: GA.feed.routeColor(r), fg: GA.feed.routeText(r), text: GA.feed.routeShort(r) });
  GA.href = (kind, ...id) => '#' + kind + '/' + id.map(encodeURIComponent).join('/');
  GA.link = (kind, id, label, extra) => h('a', { class: 'lnk', href: GA.href(kind, id), text: label || id }, extra);
  GA.go = (hash) => { if (location.hash === hash) GA.route(true); else location.hash = hash; };
  GA.empty = (icon, text, sub) => h('div.empty', null, h('div', { html: U.icon(icon, 40) }), h('p.empty-t', { text }), sub ? h('p.empty-s', { text: sub }) : null);
  GA.stat = (label, value, sub) => h('div.stat', null, h('div.stat-v', { text: value }), h('div.stat-l', { text: label }), sub ? h('div.stat-s', { text: sub }) : null);
  GA.card = (title, ...kids) => h('section.card', null, title ? h('h3.card-t', { text: title }) : null, ...kids);
  GA.kv = (pairs) => { const dl = h('dl.kv'); for (const [k, v] of pairs) { if (v === '' || v === undefined || v === null) continue; dl.append(h('dt', { text: k }), h('dd', null, v && v.nodeType ? v : String(v))); } return dl; };
  GA.dateText = (d) => C.dateLabel(d, U.lang());
  GA.timeText = (s) => C.fmtTime(s);
  GA.typeName = (rt) => { rt = +rt; const k = 'rt' + rt; if (I.en[k]) return t(k); const g = 'rtx' + Math.floor(rt / 100) * 100; return I.en[g] ? t(g) + ' (' + rt + ')' : C.routeTypeName(rt); };

  GA.dateButton = (value, onPick, extra) => {
    const b = h('button', { type: 'button', class: 'field picker', 'aria-haspopup': 'dialog', 'aria-label': t('serviceDate') });
    const draw = () => { b.innerHTML = '<span class="f-l">' + U.esc(t('serviceDate')) + '</span><span class="f-v">' + U.icon('calendar', 18) + U.esc(GA.dateText(GA.date)) + '</span>'; };
    b.addEventListener('click', () => U.datePicker({ title: t('serviceDate'), value: GA.date, min: GA.feed.rangeStart, max: GA.feed.rangeEnd, active: (d) => GA.feed.tripsOn(d).length > 0, busy: GA.feed.defaultDate(), onPick: (d) => { GA.date = d; draw(); onPick(d); } }));
    draw(); b.redraw = draw; return b;
  };
  GA.timeButton = (onPick) => {
    const b = h('button', { type: 'button', class: 'field picker', 'aria-haspopup': 'dialog', 'aria-label': t('departAfter') });
    const draw = () => { b.innerHTML = '<span class="f-l">' + U.esc(t('departAfter')) + '</span><span class="f-v">' + U.icon('clock', 18) + C.fmtTime(GA.time) + '</span>'; };
    b.addEventListener('click', () => U.timePicker({ title: t('departAfter'), value: GA.time, onPick: (s) => { GA.time = s; draw(); onPick(s); } })); draw(); return b;
  };
  /** Dropdown for the feed's date on every date-dependent view. */
  GA.barChart = (o) => {
    const max = Math.max(1, ...o.data.map((d) => d.value)), el = h('div.bars', { role: 'img', 'aria-label': o.label, style: { height: (o.height || 120) + 'px' } });
    o.data.forEach((d, i) => {
      const b = h('button', { type: 'button', class: 'bar' + (d.on ? ' on' : ''), 'data-tip': d.tip, 'aria-label': d.tip, style: { height: Math.max(2, d.value / max * 100) + '%' } });
      if (d.color) b.style.background = d.color; if (o.onBar) b.addEventListener('click', () => o.onBar(d, i)); else b.tabIndex = -1;
      el.append(h('div.bar-c', null, b));
    });
    return h('div.chart', null, el, o.axis ? h('div.bars-axis', null, o.axis.map((a) => h('span', { text: a }))) : null);
  };

  // ---------- page chrome ----------
  const NAV = [['overview', 'dashboard'], ['routes', 'route'], ['stops', 'place'], ['trips', 'clock'], ['blocks', 'gantt'], ['calendar', 'calendar'], ['shapes', 'shapes'], ['transfers', 'sync'], ['fares', 'payments'], ['flex', 'flex'], ['validation', 'check'], ['realtime', 'sensors'], ['data', 'table']];
  GA.renderChrome = () => {
    const f = GA.feed;
    const rail = $('rail'); rail.textContent = '';
    const cur = (GA.cur || 'overview');
    for (const [id, ic] of NAV) {
      const a = h('a', { class: 'rail-i' + (cur === id ? ' on' : ''), href: '#' + id, 'aria-current': cur === id ? 'page' : null, title: t('nav_' + id) }); a.innerHTML = '<span class="rail-pill">' + U.icon(ic, 22) + '</span><span class="rail-l">' + U.esc(t('nav_' + id)) + '</span>';
      if (id === 'validation' && GA.validation && GA.validation.errors + GA.validation.warnings) { const bd = h('span', { class: 'rail-b' + (GA.validation.errors ? ' err' : ''), text: GA.n(GA.validation.errors + GA.validation.warnings) }); a.querySelector('.rail-pill').append(bd); }
      if (!f) a.setAttribute('aria-disabled', 'true'), a.tabIndex = -1;
      rail.append(a);
    }
    const chip = $('feedChip');
    if (f) { chip.hidden = false; chip.innerHTML = U.icon('folder_open', 20) + '<span class="chip-t"><b>' + U.esc(GA.fileName) + '</b><small>' + GA.n(f.routes.length) + ' ' + U.esc(t('routesLc')) + ' · ' + GA.n(f.stops.length) + ' ' + U.esc(t('stopsLc')) + ' · ' + GA.n(f.trips.length) + ' ' + U.esc(t('tripsLc')) + '</small></span>'; } else chip.hidden = true;
    $('addMapBtn').hidden = !f; $('searchBtn').disabled = !f; $('searchBtn').querySelector('.sb-t').textContent = t('searchPlaceholder');
    $('openBtn').querySelector('span').textContent = t('openFeed'); $('addMapBtn').querySelector('span').textContent = GA.sel.size ? t('addNToMap', { n: GA.sel.size }) : t('addToMap');
    $('skipLink').textContent = t('skipToContent'); document.querySelector('.brand-t').textContent = t('appTitle'); $('moreBtn').setAttribute('aria-label', t('settings')); $('moreBtn').setAttribute('data-tip', t('settings'));
  };

  // ---------- opening a feed ----------
  const worker = () => new Worker('gtfs-worker.js');
  GA.openBlob = async (blob, name, source) => {
    GA.fileName = name; GA.blob = blob; GA.source = source || 'file';
    const wrap = h('div.load'), list = h('div.load-list'); wrap.append(h('h2', { text: t('reading', { name }) }), h('p.sub', { text: t('readingSub') }), list);
    const view = $('main'); view.textContent = ''; view.append(wrap);
    const bars = new Map(), mk = (name, bytes) => { if (bars.has(name)) return bars.get(name); const p = U.progress(name), row = h('div.load-r', null, h('span.load-n', { text: name }), h('span.load-s', { text: bytes ? (bytes / 1024 > 1024 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB') : '' }), p.el, h('span.load-c', { text: '' })); list.append(row); const o = { p, row }; bars.set(name, o); return o; };
    const w = worker();
    const result = await new Promise((resolve, reject) => {
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'plan') { for (const f of m.files) if (/\.(txt|geojson)$/.test(f.name)) mk(f.name, f.bytes); }
        else if (m.type === 'progress') { const b = mk(m.file); b.p.set(m.percent); }
        else if (m.type === 'file') { const b = mk(m.file); b.p.set(100); b.row.classList.add('done'); b.row.querySelector('.load-c').textContent = GA.n(m.rows) + ' ' + t('rowsLc'); }
        else if (m.type === 'done') resolve(m.result); else if (m.type === 'error') reject(new Error(m.message));
      };
      w.onerror = (e) => reject(new Error(e.message || 'worker'));
      w.postMessage({ type: 'parse', file: blob });
    }).catch((err) => { w.terminate(); const msg = { notzip: 'errNotZip', zip64: 'errZip64', encrypted: 'errEncrypted', damaged: 'errDamaged', method: 'errMethod' }[err.message]; U.snack(msg ? t(msg) : t('errRead', { m: err.message })); $('main').textContent = ''; GA.route(true); return null; });
    w.terminate(); if (!result) return false;
    const info = h('p.sub', { text: t('indexing') }); wrap.append(info); await new Promise((r) => setTimeout(r, 20));
    try { GA.feed = new C.Feed(result, name); } catch (err) { console.error(err); U.snack(t('errRead', { m: err.message })); return false; }
    GA.parseMs = result.ms; GA.date = GA.feed.defaultDate(); GA.sel = new Set(); GA.rt = null; GA.validation = null;
    GA.feed.defaultColor = '5F6368'; if (GA.feed.languages.length) { /* translations available */ }
    U.snack(t('opened', { name, r: GA.n(GA.feed.routes.length), s: GA.n(GA.feed.stops.length) }));
    if (location.hash && !/^#(overview)?$/.test(location.hash)) GA.route(true); else GA.go('#overview');
    GA.renderChrome();
    setTimeout(() => GA.runValidation(), 50);
    return true;
  };
  GA.runValidation = async () => {
    const f = GA.feed; GA.validating = true; GA.validation = null; if (GA.cur === 'validation') GA.route(true);
    const v = await window.GtfsValidate.validate(f, (p) => { GA.valProgress = p; if (GA.onValProgress) GA.onValProgress(p); });
    if (GA.feed !== f) return; GA.validation = v; GA.validating = false; GA.renderChrome(); if (GA.cur === 'validation' || GA.cur === 'overview') GA.route(true);
  };
  GA.openFile = (file) => { if (!file) return; GA.openBlob(file, file.name, 'file'); };
  GA.openUrl = async (url) => {
    try {
      U.snack(t('fetching'));
      const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = await r.blob(); GA.openBlob(b, url.split('/').pop().split('?')[0] || 'feed.zip', 'url');
    } catch (err) {
      const dlg = h('div', null, h('p', { text: t('corsBody') }), h('p.sub', { text: String(err.message) }));
      U.dialog({ title: t('corsTitle'), body: dlg, actions: [{ label: t('ok'), primary: true }] });
    }
  };
  const pickFile = () => { const i = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true }); i.addEventListener('change', () => GA.openFile(i.files[0])); document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000); };
  GA.openMenu = (anchor) => U.menu(anchor, [
    { label: t('openZip'), icon: 'upload_file', onSelect: pickFile },
    { label: t('openUrl'), icon: 'link', onSelect: () => { const inp = h('input', { type: 'text', class: 'field-in', 'aria-label': t('feedUrl'), placeholder: 'https://example.org/gtfs.zip', style: { width: '100%' } }); U.dialog({ title: t('openUrl'), body: h('div', null, h('p.sub', { text: t('urlHelp') }), inp), actions: [{ label: t('cancel') }, { label: t('open'), primary: true, onClick: () => { if (!inp.value.trim()) return false; GA.openUrl(inp.value.trim()); } }] }); setTimeout(() => inp.focus(), 30); } },
    { divider: true }, { label: t('openRealtime'), icon: 'sensors', onSelect: () => GA.go('#realtime') }
  ], { label: t('openFeed') });

  // ---------- handoff through IndexedDB ----------
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('gmmc-gtfs', 1); r.onupgradeneeded = () => r.result.createObjectStore('handoff'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  GA.takeHandoff = async (key) => { try { const db = await idb(); return await new Promise((res) => { const tx = db.transaction('handoff', 'readwrite'), st = tx.objectStore('handoff'), g = st.get(key); g.onsuccess = () => { const v = g.result; if (v) st.delete(key); res(v || null); }; g.onerror = () => res(null); }); } catch { return null; } };
  GA.putHandoff = async (key, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('handoff', 'readwrite'); tx.objectStore('handoff').put(v, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };

  /** Send the selected routes (or all) to the editor through its GTFS import path. */
  GA.addToMap = async () => {
    if (!GA.feed || !GA.blob) return;
    try {
      await GA.putHandoff('editor', { blob: GA.blob, name: GA.fileName, routes: [...GA.sel].map((i) => GA.feed.routes[i].route_id), time: Date.now() });
      U.snack(t('sentToEditor'), { label: t('openEditor'), run: () => window.open('../app/', '_blank') });
      window.open('../app/', '_blank');
    } catch (err) { U.snack(t('errRead', { m: err.message })); }
  };

  // ---------- global search ----------
  GA.openSearch = () => {
    const f = GA.feed; if (!f) return;
    const source = (q) => {
      q = q.toLowerCase(); const out = [], lim = 40;
      const add = (o) => { if (out.length < lim) out.push(o); };
      for (let i = 0; i < f.routes.length && out.length < lim; i++) { const r = f.routes[i]; const name = f.routeName(r); if (!q || (name + ' ' + r.route_id).toLowerCase().includes(q)) add({ kind: 'route', id: r.route_id, label: name, sub: t('kindRoute') + ' · ' + GA.typeName(r.route_type), badge: GA.badgeStyle(r) }); }
      if (q) {
        for (let i = 0; i < f.stops.length && out.length < lim; i++) { const s = f.stops[i]; if ((f.stopName(s) + ' ' + s.stop_id + ' ' + (s.stop_code || '')).toLowerCase().includes(q)) add({ kind: 'stop', id: s.stop_id, label: f.stopName(s), sub: t('kindStop') + ' · ' + s.stop_id, icon: 'place' }); }
        for (let i = 0; i < f.trips.length && out.length < lim; i++) { const tr0 = f.trips[i]; if ((tr0.trip_id + ' ' + tr0.trip_headsign + ' ' + tr0.trip_short_name).toLowerCase().includes(q)) { const ri = f.routeIx.get(tr0.route_id); add({ kind: 'trip', id: tr0.trip_id, label: tr0.trip_headsign || tr0.trip_short_name || tr0.trip_id, sub: t('kindTrip') + ' · ' + tr0.trip_id, badge: ri === undefined ? null : GA.badgeStyle(f.routes[ri]) }); } }
        for (const b of f.blocksOn(GA.date)) if (out.length < lim && b.id.toLowerCase().includes(q)) add({ kind: 'block', id: b.id, label: t('kindBlock') + ' ' + b.id, sub: GA.dateText(GA.date) + ' · ' + b.trips.length + ' ' + t('tripsLc'), icon: 'gantt' });
        for (const sid of f.serviceIds) if (out.length < lim && sid.toLowerCase().includes(q)) add({ kind: 'service', id: sid, label: sid, sub: t('kindService'), icon: 'calendar' });
      }
      return out;
    };
    const ac = U.autocomplete({ label: t('searchAll'), source, keep: false, onSelect: (it) => { dlg.close(); if (it.kind === 'block') GA.go(GA.href('block', GA.date, it.id)); else GA.go(GA.href(it.kind, it.id)); } });
    const body = h('div.gs', null, ac.el, h('p.sub', { text: t('searchHelp') }));
    const dlg = U.dialog({ title: t('search'), body, cls: 'dlg-search' }); setTimeout(() => ac.focus(), 40);
  };

  // ---------- menus ----------
  GA.settingsMenu = (anchor) => {
    const f = GA.feed, langs = f ? f.languages : [];
    U.menu(anchor, [
      { label: 'English', icon: 'language', checked: prefs.lang === 'en', onSelect: () => GA.setLang('en') }, { label: '廣東話', icon: 'language', checked: prefs.lang === 'yue', onSelect: () => GA.setLang('yue') }, { divider: true },
      { label: t('themeLight'), icon: 'light', checked: prefs.theme === 'light', onSelect: () => GA.setTheme('light') }, { label: t('themeDark'), icon: 'dark', checked: prefs.theme === 'dark', onSelect: () => GA.setTheme('dark') }, { label: t('themeSystem'), icon: 'dashboard', checked: prefs.theme === 'system', onSelect: () => GA.setTheme('system') },
      ...(langs.length ? [{ divider: true }, { label: t('feedLangOff'), icon: 'language', checked: !f.tlang, onSelect: () => { f.setLang(''); GA.route(true); GA.renderChrome(); } }, ...langs.map((l) => ({ label: t('feedLang') + ': ' + l, icon: 'language', checked: f.tlang === l, onSelect: () => { f.setLang(l); GA.route(true); GA.renderChrome(); } }))] : []),
      { divider: true }, { label: t('shortcuts'), icon: 'keyboard', onSelect: () => GA.shortcuts() }
    ], { align: 'end', label: t('settings') });
  };
  GA.shortcuts = () => {
    const rows = [['Ctrl K', t('scSearch')], ['/', t('scSearch')], ['G O', t('scOverview')], ['Esc', t('scClose')], ['← ↑ → ↓', t('scMap')], ['+ −', t('scZoom')]];
    U.dialog({ title: t('shortcuts'), body: h('dl.kv', null, rows.flatMap(([k, v]) => [h('dt', null, h('kbd', { text: k })), h('dd', { text: v })])), actions: [{ label: t('ok'), primary: true }] });
  };

  // ---------- routing ----------
  GA.parseHash = () => { const raw = location.hash.replace(/^#/, ''); const parts = raw.split('/').map((p) => { try { return decodeURIComponent(p); } catch { return p; } }); return { view: parts[0] || 'overview', args: parts.slice(1), raw }; };
  GA.route = (force) => {
    const { view, args } = GA.parseHash(); const f = GA.feed; const main = $('main');
    const map = { route: 'routes', stop: 'stops', trip: 'trips', block: 'blocks', service: 'calendar', shape: 'shapes' };
    const nav = map[view] || view; GA.cur = nav;
    if (GA.destroyView) { try { GA.destroyView(); } catch { /* ignore */ } GA.destroyView = null; }
    GA.mapRedraw = null;
    if (!f) { GA.renderLanding(main); GA.renderChrome(); return; }
    const v = GA.views[nav] || GA.views.overview; main.textContent = ''; main.scrollTop = 0;
    const page = h('div.page.view-' + nav); main.append(page);
    try { GA.destroyView = v(page, { view, args }) || null; } catch (err) { console.error(err); page.append(GA.empty('error', t('errView'), String(err.message))); }
    prefs.route = nav; GA.renderChrome(); main.focus({ preventScroll: true });
  };

  GA.renderLanding = (main) => {
    main.textContent = '';
    const zone = h('div.drop', { tabindex: 0, role: 'button', 'aria-label': t('openZip') }, h('div.drop-ic', { html: U.icon('upload_file', 56) }), h('h2', { text: t('landingTitle') }), h('p', { text: t('landingBody') }));
    const row = h('div.drop-row', null, U.btn(t('openZip'), { kind: 'filled', icon: 'upload_file', onclick: pickFile }), U.btn(t('openUrl'), { kind: 'tonal', icon: 'link', onclick: () => GA.openMenu($('openBtn')) && null }));
    row.lastChild.addEventListener('click', (e) => { e.stopPropagation(); }, true);
    zone.append(row, h('p.sub', { text: t('landingPrivacy') }), h('p.sub', { html: U.esc(t('landingEditor')) + ' <a class="lnk" href="../app/">' + U.esc(t('landingEditorLink')) + '</a>' }));
    zone.addEventListener('click', (e) => { if (e.target === zone || e.target.closest('.drop-ic,h2,p')) pickFile(); });
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } });
    main.append(h('div.page.landing', null, zone));
  };

  // ---------- start ----------
  GA.start = async () => {
    I.setLang(prefs.lang); document.documentElement.lang = prefs.lang === 'yue' ? 'zh-HK' : 'en'; document.title = t('appTitle');
    if (prefs.theme !== 'system') document.documentElement.setAttribute('data-theme', prefs.theme);
    U.initTips();
    $('openBtn').addEventListener('click', (e) => GA.openMenu(e.currentTarget));
    $('addMapBtn').addEventListener('click', GA.addToMap); $('searchBtn').addEventListener('click', GA.openSearch);
    $('moreBtn').addEventListener('click', (e) => GA.settingsMenu(e.currentTarget)); $('feedChip').addEventListener('click', () => GA.go('#data'));
    addEventListener('hashchange', () => GA.route());
    addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase(); const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); GA.openSearch(); } else if (e.key === '/' && !typing && GA.feed) { e.preventDefault(); GA.openSearch(); }
    });
    // drag and drop
    let depth = 0; const ov = $('dropOverlay');
    addEventListener('dragenter', (e) => { if ([...(e.dataTransfer.types || [])].includes('Files')) { depth++; ov.hidden = false; } });
    addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) ov.hidden = true; });
    addEventListener('dragover', (e) => e.preventDefault());
    addEventListener('drop', (e) => { e.preventDefault(); depth = 0; ov.hidden = true; const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) GA.openFile(f); });
    GA.renderChrome(); GA.route(true);
    const hand = await GA.takeHandoff('viewer');
    if (hand && hand.blob) GA.openBlob(hand.blob, hand.name || 'map-gtfs.zip', 'editor');
    const q = new URLSearchParams(location.search).get('feed'); if (q && !hand) GA.openUrl(q);
  };
})();
