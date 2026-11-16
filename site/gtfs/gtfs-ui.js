// gtfs-ui.js: Material Design 3 components for the GTFS viewer. Every control is keyboard operable and labelled.
(function () {
  'use strict';
  const U = {};
  const tr = (k, v) => U.t(k, v);
  U.t = (k) => k;

  // ---------- icons (24 px grid) with a fallback to the editor icon set ----------
  const P = {
    menu: 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z', search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z', chevron_right: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z', chevron_left: 'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z',
    expand_more: 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z', expand_less: 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z', check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    arrow_up: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z', arrow_down: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
    calendar: 'M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z', clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    place: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z', tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
    more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    language: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z',
    dark: 'M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z', light: 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2a1 1 0 0 0 0-2H2a1 1 0 0 0 0 2zm18 0h2a1 1 0 0 0 0-2h-2a1 1 0 0 0 0 2zM11 2v2a1 1 0 0 0 2 0V2a1 1 0 0 0-2 0zm0 18v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-2 0z',
    warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z', error: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z', list: 'M3 14h4v-4H3v4zm0 5h4v-4H3v4zM3 9h4V5H3v4zm5 5h13v-4H8v4zm0 5h13v-4H8v4zM8 5v4h13V5H8z',
    table: 'M10 10.02h5V21h-5zM17 21h3c1.1 0 2-.9 2-2v-9h-5v11zm3-18H5c-1.1 0-2 .9-2 2v3h19V5c0-1.1-.9-2-2-2zM3 19c0 1.1.9 2 2 2h3V10H3v9z',
    payments: 'M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9 1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V9h2z',
    sync: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
    sensors: 'M7.76 16.24l-1.41 1.41A7.93 7.93 0 0 1 4 12c0-2.21.9-4.21 2.35-5.65l1.41 1.41A5.98 5.98 0 0 0 6 12c0 1.66.68 3.15 1.76 4.24zM12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm5.65-3.65-1.41 1.41A5.98 5.98 0 0 1 18 12c0 1.66-.68 3.15-1.76 4.24l1.41 1.41A7.93 7.93 0 0 0 20 12c0-2.21-.9-4.21-2.35-5.65z',
    open_new: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
    filter: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z', home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z', bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
    train: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    shapes: 'M12 2l-5.5 9h11L12 2zm5.5 11c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zM3 21.5h8v-8H3v8z', add_map: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm4 8h-3v3h-2v-3H8V8h3V5h2v3h3v2z',
    upload: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z', download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z', trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z', link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    zoom_in: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-5 0H9v-1.5H7.5V11H9V9.5h1.5V11H12v1.5h-1.5V14z', fit: 'M5 5h5V3H3v7h2V5zm5 14H5v-5H3v7h7v-2zm9-5v5h-5v2h7v-7h-2zM14 5h5v5h2V3h-7v2z',
    layers: 'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z', accessible: 'M12 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm7 6h-5V8h4V6h-4.5C12.5 6 11 7.5 11 9.5V16h-4l-2 5h2.2l1.4-3H15l-1 3h2.2l1.8-6.5V12h2z',
    keyboard: 'M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z',
    flex: 'M3 5v14h2V5H3zm16 0v14h2V5h-2zM7 11h10v2H7z', info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z', gantt: 'M3 5h8v3H3V5zm4 5h10v3H7v-3zm6 5h8v3h-8v-3z', stairs: 'M4 20v-4h4v-4h4V8h4V4h4v16z', pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z', play: 'M8 5v14l11-7z'
  };
  U.icon = (name, size) => {
    size = size || 20;
    if (P[name]) return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${P[name]}"/></svg>`;
    return window.icon ? window.icon(name, size) : '';
  };

  // ---------- element helper ----------
  U.h = function (tag, props, ...kids) {
    const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(tag); const e = document.createElement(m ? m[1] : tag);
    if (m && m[2]) for (const x of m[2].match(/[.#][\w-]+/g)) if (x[0] === '.') e.classList.add(x.slice(1)); else e.id = x.slice(1);
    if (props) for (const k in props) {
      const v = props[k]; if (v === undefined || v === null || v === false) continue;
      if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') v.split(' ').forEach((c) => c && e.classList.add(c)); else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(2)) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  const h = U.h;
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  U.btn = (label, o) => { o = o || {}; const b = h('button', { type: 'button', class: 'btn ' + (o.kind || 'tonal') + (o.cls ? ' ' + o.cls : ''), title: o.title, 'aria-label': o.aria, onclick: o.onclick }); b.innerHTML = (o.icon ? U.icon(o.icon, 18) : '') + (label ? '<span>' + U.esc(label) + '</span>' : ''); return b; };
  U.iconBtn = (icon, label, onclick, cls) => { const b = h('button', { type: 'button', class: 'ibtn ' + (cls || ''), 'aria-label': label, 'data-tip': label, onclick }); b.innerHTML = U.icon(icon, 22); return b; };

  // ---------- snackbar ----------
  let snackEl = null, snackTimer = 0;
  U.snack = (text, action) => {
    if (!snackEl) { snackEl = h('div.snack', { role: 'status', 'aria-live': 'polite' }); document.body.append(snackEl); }
    snackEl.textContent = ''; snackEl.append(h('span', { text }));
    if (action) snackEl.append(h('button', { type: 'button', class: 'snack-act', text: action.label, onclick: () => { action.run(); snackEl.classList.remove('on'); } }));
    snackEl.append(h('button', { type: 'button', class: 'snack-x', 'aria-label': tr('close'), html: U.icon('close', 18), onclick: () => snackEl.classList.remove('on') }));
    snackEl.classList.add('on'); clearTimeout(snackTimer); snackTimer = setTimeout(() => snackEl.classList.remove('on'), action ? 8000 : 5000);
  };

  // ---------- tooltip ----------
  let tipEl = null;
  U.initTips = () => {
    tipEl = h('div.tip', { role: 'tooltip', id: 'gtip' }); document.body.append(tipEl);
    const show = (t) => { const txt = t.getAttribute('data-tip'); if (!txt) return; tipEl.textContent = txt; tipEl.classList.add('on'); const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, hh = tipEl.offsetHeight; let x = r.left + r.width / 2 - w / 2, y = r.bottom + 8; if (y + hh > innerHeight - 4) y = r.top - hh - 8; tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, x)) + 'px'; tipEl.style.top = Math.max(6, y) + 'px'; };
    const hide = () => tipEl.classList.remove('on');
    document.addEventListener('pointerover', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) show(t); else if (!e.target.closest('.tip')) hide(); });
    document.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) show(t); });
    document.addEventListener('focusout', hide); document.addEventListener('scroll', hide, true); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    /** Show a tip at a point (canvas bars). */
    U.tipAt = (x, y, txt) => { if (!txt) { hide(); return; } tipEl.textContent = txt; tipEl.classList.add('on'); const w = tipEl.offsetWidth, hh = tipEl.offsetHeight; tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, x - w / 2)) + 'px'; tipEl.style.top = Math.max(6, y - hh - 12) + 'px'; };
    U.tipHide = hide;
  };

  // ---------- progress ----------
  U.progress = (label) => { const bar = h('div.lp-bar'); const el = h('div.lp', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-label': label }, bar); return { el, set(p) { bar.style.width = p + '%'; el.setAttribute('aria-valuenow', Math.round(p)); } }; };

  // ---------- segmented button ----------
  U.segmented = (o) => {
    const el = h('div.seg', { role: 'radiogroup', 'aria-label': o.label }); let value = o.value; const btns = [];
    const sync = () => btns.forEach(([v, b]) => { const on = v === value; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); });
    for (const it of o.items) {
      const b = h('button', { type: 'button', role: 'radio', class: 'seg-b', 'data-tip': it.tip }); b.innerHTML = (it.icon ? U.icon(it.icon, 18) : '') + '<span>' + U.esc(it.label) + '</span>';
      b.addEventListener('click', () => { value = it.value; sync(); o.onChange && o.onChange(value); });
      b.addEventListener('keydown', (e) => { const i = btns.findIndex((x) => x[1] === b); let j = -1; if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % btns.length; else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + btns.length - 1) % btns.length; if (j >= 0) { e.preventDefault(); btns[j][1].focus(); btns[j][1].click(); } });
      btns.push([it.value, b]); el.append(b);
    }
    sync(); return { el, set(v) { value = v; sync(); }, get: () => value };
  };

  // ---------- chips ----------
  U.filterChip = (label, on, onChange, o) => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': !!on }); const draw = () => { b.innerHTML = '<span class="chip-ic">' + (b.getAttribute('aria-pressed') === 'true' ? U.icon('check', 18) : (o && o.icon ? U.icon(o.icon, 18) : '')) + '</span><span>' + U.esc(label) + '</span>' + (o && o.count !== undefined ? '<span class="chip-n">' + o.count + '</span>' : ''); b.classList.toggle('on', b.getAttribute('aria-pressed') === 'true'); };
    b.addEventListener('click', () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); draw(); onChange(b.getAttribute('aria-pressed') === 'true'); }); draw();
    if (o && o.color) { b.style.setProperty('--chip-c', o.color); b.classList.add('colored'); }
    return b;
  };
  U.inputChip = (label, onRemove, color) => { const c = h('span.chip.input', { role: 'group', 'aria-label': label }, h('span', { text: label }), h('button', { type: 'button', class: 'chip-x', 'aria-label': tr('remove') + ' ' + label, html: U.icon('close', 16), onclick: onRemove })); if (color) c.style.setProperty('--chip-c', color); return c; };

  // ---------- switch ----------
  U.switch = (label, on, onChange) => {
    const b = h('button', { type: 'button', role: 'switch', class: 'sw', 'aria-checked': !!on }, h('span.sw-track', null, h('span.sw-thumb')), h('span.sw-l', { text: label }));
    b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v); onChange(v); });
    return { el: b, set(v) { b.setAttribute('aria-checked', !!v); } };
  };

  // ---------- slider ----------
  U.slider = (o) => {
    let v = o.value; const min = o.min, max = o.max, step = o.step || 1; const fmt = o.format || ((x) => String(x));
    const thumb = h('span.sl-thumb', null, h('span.sl-val')), fill = h('span.sl-fill'), track = h('span.sl-track', null, fill);
    const el = h('div.sl', { role: 'slider', tabindex: 0, 'aria-label': o.label, 'aria-valuemin': min, 'aria-valuemax': max }, track, thumb); if (o.cls) el.classList.add(o.cls);
    const draw = () => { const p = (v - min) / (max - min) * 100; fill.style.width = p + '%'; thumb.style.left = p + '%'; thumb.firstChild.textContent = fmt(v); el.setAttribute('aria-valuenow', v); el.setAttribute('aria-valuetext', fmt(v)); };
    const set = (x, fire) => { x = Math.max(min, Math.min(max, Math.round(x / step) * step)); x = +x.toFixed(6); if (x === v && fire !== 'force') return; v = x; draw(); if (fire && o.onInput) o.onInput(v); };
    const fromPtr = (e) => { const r = track.getBoundingClientRect(); set(min + (e.clientX - r.left) / r.width * (max - min), true); };
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.classList.add('drag'); fromPtr(e); el.focus(); });
    el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) fromPtr(e); });
    el.addEventListener('pointerup', (e) => { el.classList.remove('drag'); if (o.onChange) o.onChange(v); });
    el.addEventListener('keydown', (e) => { const k = e.key; let d = 0; if (k === 'ArrowRight' || k === 'ArrowUp') d = step; else if (k === 'ArrowLeft' || k === 'ArrowDown') d = -step; else if (k === 'PageUp') d = step * 10; else if (k === 'PageDown') d = -step * 10; else if (k === 'Home') { set(min, true); if (o.onChange) o.onChange(v); e.preventDefault(); return; } else if (k === 'End') { set(max, true); if (o.onChange) o.onChange(v); e.preventDefault(); return; } else return; e.preventDefault(); set(v + d, true); if (o.onChange) o.onChange(v); });
    draw(); return { el, set: (x) => set(x, false), get: () => v, setRange(a, b) { /* ranges are fixed at creation */ } };
  };

  // ---------- menus ----------
  let openMenuState = null;
  U.closeMenu = () => { if (openMenuState) { const s = openMenuState; openMenuState = null; s.el.remove(); document.removeEventListener('pointerdown', s.away, true); if (s.restore && document.contains(s.anchor)) s.anchor.focus(); } };
  /** items: [{label, icon, value, checked, disabled, divider, onSelect, sub}] ; opts.listbox for a select. */
  U.menu = (anchor, items, opts) => {
    opts = opts || {}; U.closeMenu();
    const el = h('div.menu', { role: opts.listbox ? 'listbox' : 'menu', 'aria-label': opts.label }); const btns = [];
    for (const it of items) {
      if (it.divider) { el.append(h('div.menu-div', { role: 'separator' })); continue; }
      const b = h('button', { type: 'button', class: 'menu-i' + (it.checked ? ' on' : ''), role: opts.listbox ? 'option' : (it.checked !== undefined ? 'menuitemradio' : 'menuitem'), disabled: it.disabled, tabindex: -1 });
      if (opts.listbox) b.setAttribute('aria-selected', !!it.checked); else if (it.checked !== undefined) b.setAttribute('aria-checked', !!it.checked);
      b.innerHTML = '<span class="mi-ic">' + (it.checked ? U.icon('check', 20) : it.icon ? U.icon(it.icon, 20) : '') + '</span><span class="mi-l">' + U.esc(it.label) + '</span>' + (it.sub ? '<span class="mi-s">' + U.esc(it.sub) + '</span>' : '');
      b.addEventListener('click', () => { U.closeMenu(); anchor.focus && anchor.focus(); it.onSelect && it.onSelect(it.value, it); }); btns.push(b); el.append(b);
    }
    document.body.append(el);
    const r = anchor.getBoundingClientRect(); const w = Math.max(opts.minWidth || 0, r.width, 200);
    el.style.minWidth = w + 'px'; const eh = el.offsetHeight, ew = el.offsetWidth;
    let x = opts.align === 'end' ? r.right - ew : r.left, y = r.bottom + 4; if (y + eh > innerHeight - 8) y = Math.max(8, r.top - eh - 4);
    el.style.left = Math.max(8, Math.min(innerWidth - ew - 8, x)) + 'px'; el.style.top = y + 'px'; el.style.maxHeight = Math.max(160, innerHeight - 16) + 'px';
    const away = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) { U.closeMenu(); } };
    document.addEventListener('pointerdown', away, true); openMenuState = { el, away, anchor, restore: true };
    el.addEventListener('keydown', (e) => {
      const act = btns.filter((b) => !b.disabled); const i = act.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); act[(i + 1) % act.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); act[(i - 1 + act.length) % act.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); act[0].focus(); } else if (e.key === 'End') { e.preventDefault(); act[act.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); U.closeMenu(); } else if (e.key === 'Tab') { U.closeMenu(); }
    });
    const first = btns.find((b) => b.classList.contains('on') && !b.disabled) || btns.find((b) => !b.disabled); if (first) first.focus();
    return el;
  };
  /** A filled select field built from a menu. */
  U.select = (o) => {
    let value = o.value; const b = h('button', { type: 'button', class: 'field select', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': o.label });
    const draw = () => { const it = o.items.find((x) => x.value === value) || o.items[0]; b.innerHTML = '<span class="f-l">' + U.esc(o.label) + '</span><span class="f-v">' + (it && it.icon ? U.icon(it.icon, 18) : '') + U.esc(it ? it.label : '') + '</span>' + U.icon('expand_more', 20); };
    b.addEventListener('click', () => { b.setAttribute('aria-expanded', 'true'); const m = U.menu(b, o.items.map((it) => Object.assign({}, it, { checked: it.value === value, onSelect: (v) => { value = v; draw(); o.onChange && o.onChange(v); } })), { listbox: true, label: o.label }); const obs = new MutationObserver(() => { if (!document.contains(m)) { b.setAttribute('aria-expanded', 'false'); obs.disconnect(); } }); obs.observe(document.body, { childList: true }); });
    draw(); return { el: b, set(v) { value = v; draw(); }, get: () => value, setItems(items) { o.items = items; draw(); } };
  };

  // ---------- dialogs ----------
  U.dialog = (o) => {
    const dlg = h('dialog.dlg', { 'aria-labelledby': 'dlgT' + (++U.dlgN) }); if (o.cls) dlg.classList.add(o.cls);
    const head = h('div.dlg-h', null, h('h2', { id: 'dlgT' + U.dlgN, text: o.title }), o.close === false ? null : h('button', { type: 'button', class: 'ibtn', 'aria-label': tr('close'), html: U.icon('close', 22), onclick: () => dlg.close() }));
    const body = h('div.dlg-b'); if (o.body) body.append(o.body); const foot = h('div.dlg-f');
    for (const a of o.actions || []) foot.append(U.btn(a.label, { kind: a.primary ? 'filled' : 'text', onclick: () => { if (a.onClick && a.onClick(dlg) === false) return; dlg.close(); } }));
    dlg.append(head, body, foot); document.body.append(dlg);
    const opener = document.activeElement;
    dlg.addEventListener('close', () => { dlg.remove(); if (opener && document.contains(opener)) opener.focus(); if (o.onClose) o.onClose(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.showModal(); return dlg;
  };
  U.dlgN = 0;

  // ---------- date picker ----------
  /** o: {value, min, max, title, active:(yyyymmdd)=>bool, onPick} */
  U.datePicker = (o) => {
    const C = window.GtfsCore; let sel = o.value || C.key(new Date()), view = sel.slice(0, 6), focus = sel;
    const grid = h('div.dp-grid', { role: 'grid', 'aria-label': o.title }), label = h('div.dp-month', { 'aria-live': 'polite' }), big = h('div.dp-big');
    const legend = h('div.dp-legend', null, h('span.dp-dot'), h('span', { text: tr('dpServiceRuns') }));
    const names = tr('dpDays').split(',');
    const draw = () => {
      const y = +view.slice(0, 4), m = +view.slice(4, 6); label.textContent = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(U.locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
      big.textContent = C.dateLabel(sel, U.lang()); grid.textContent = '';
      const head = h('div.dp-row', { role: 'row' }, names.map((n) => h('span', { role: 'columnheader', class: 'dp-h', text: n })));
      grid.append(head);
      const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), dim = new Date(Date.UTC(y, m, 0)).getUTCDate(); let row = null;
      for (let i = 0; i < first + dim; i++) {
        if (i % 7 === 0) { row = h('div.dp-row', { role: 'row' }); grid.append(row); }
        if (i < first) { row.append(h('span.dp-e', { role: 'gridcell' })); continue; }
        const d = view + C.pad(i - first + 1), act = o.active ? o.active(d) : false, out = (o.min && d < o.min) || (o.max && d > o.max);
        const b = h('button', { type: 'button', role: 'gridcell', class: 'dp-d' + (act ? ' act' : '') + (d === sel ? ' sel' : '') + (out ? ' out' : '') + (d === C.key(new Date()) ? ' today' : ''), tabindex: d === focus ? 0 : -1, 'aria-selected': d === sel, 'aria-label': C.dateLabel(d, U.lang()) + (act ? ', ' + tr('dpServiceRuns') : ''), 'data-d': d, text: String(i - first + 1) });
        b.addEventListener('click', () => { sel = d; focus = d; draw(); focusDay(); });
        row.append(b);
      }
    };
    const focusDay = () => { const b = grid.querySelector(`[data-d="${focus}"]`); if (b) b.focus(); };
    const move = (days) => { focus = C.addDays(focus, days); if (focus.slice(0, 6) !== view) view = focus.slice(0, 6); draw(); focusDay(); };
    grid.addEventListener('keydown', (e) => { const k = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (k) { e.preventDefault(); move(k); } else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); const dt = C.ymd(focus); dt.setUTCMonth(dt.getUTCMonth() + (e.key === 'PageUp' ? -1 : 1)); focus = C.key(dt); view = focus.slice(0, 6); draw(); focusDay(); } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); focus = view + (e.key === 'Home' ? '01' : C.pad(new Date(Date.UTC(+view.slice(0, 4), +view.slice(4, 6), 0)).getUTCDate())); draw(); focusDay(); } });
    const shift = (n) => { const dt = C.ymd(view + '01'); dt.setUTCMonth(dt.getUTCMonth() + n); view = C.key(dt).slice(0, 6); focus = view + '01'; draw(); };
    const nav = h('div.dp-nav', null, U.iconBtn('chevron_left', tr('dpPrev'), () => shift(-1)), label, U.iconBtn('chevron_right', tr('dpNext'), () => shift(1)));
    const quick = h('div.dp-quick', null, U.btn(tr('dpToday'), { kind: 'text', onclick: () => { sel = C.key(new Date()); focus = sel; view = sel.slice(0, 6); draw(); } }), o.busy ? U.btn(tr('dpBusiest'), { kind: 'text', onclick: () => { sel = o.busy; focus = sel; view = sel.slice(0, 6); draw(); } }) : null);
    const body = h('div.dp', null, big, nav, grid, legend, quick); draw();
    U.dialog({ title: o.title, body, cls: 'dlg-dp', actions: [{ label: tr('cancel') }, { label: tr('ok'), primary: true, onClick: () => { o.onPick(sel); } }] });
    setTimeout(focusDay, 30);
  };

  // ---------- time picker ----------
  U.timePicker = (o) => {
    let hh = Math.floor(o.value / 3600), mm = Math.floor(o.value % 3600 / 60);
    const C = window.GtfsCore;
    const mk = (max, get, set, label) => {
      const inp = h('input', { type: 'text', inputmode: 'numeric', class: 'tp-in', 'aria-label': label, maxlength: 2 });
      const draw = () => { inp.value = C.pad(get()); };
      inp.addEventListener('input', () => { const v = parseInt(inp.value.replace(/\D/g, ''), 10); if (!isNaN(v)) set(Math.min(max, v)); });
      inp.addEventListener('blur', draw); inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { e.preventDefault(); set((get() + 1) % (max + 1)); draw(); } else if (e.key === 'ArrowDown') { e.preventDefault(); set((get() + max) % (max + 1)); draw(); } });
      draw(); return { el: h('div.tp-f', null, inp, h('span.tp-l', { text: label })), inp, draw };
    };
    const H = mk(29, () => hh, (v) => { hh = v; }, tr('tpHour')), M = mk(59, () => mm, (v) => { mm = v; }, tr('tpMinute'));
    const step = (dh, dm) => { mm += dm; hh += dh; if (mm > 59) { mm -= 60; hh++; } if (mm < 0) { mm += 60; hh--; } hh = Math.max(0, Math.min(29, hh)); H.draw(); M.draw(); };
    const quick = h('div.tp-q', null, [[6, 0], [8, 0], [12, 0], [17, 0], [22, 0]].map(([a, b]) => U.filterChip(C.pad(a) + ':' + C.pad(b), false, () => { hh = a; mm = b; H.draw(); M.draw(); })));
    const body = h('div.tp', null, h('div.tp-row', null, U.iconBtn('chevron_left', tr('tpEarlier'), () => step(0, -15)), H.el, h('span.tp-c', { text: ':' }), M.el, U.iconBtn('chevron_right', tr('tpLater'), () => step(0, 15))), h('p.tp-hint', { text: tr('tpHint') }), quick);
    U.dialog({ title: o.title, body, cls: 'dlg-tp', actions: [{ label: tr('cancel') }, { label: tr('ok'), primary: true, onClick: () => { o.onPick(hh * 3600 + mm * 60); } }] });
    setTimeout(() => H.inp.focus(), 30);
  };

  // ---------- autocomplete ----------
  /** source(query) -> [{value,label,sub,badge:{text,bg,fg}}] */
  U.autocomplete = (o) => {
    const inp = h('input', { type: 'text', class: 'ac-in', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-label': o.label, placeholder: ' ', autocomplete: 'off', spellcheck: 'false' });
    const id = 'ac' + (++U.dlgN), list = h('div.ac-list', { role: 'listbox', id, 'aria-label': o.label }); inp.setAttribute('aria-controls', id);
    const clear = h('button', { type: 'button', class: 'ibtn ac-x', 'aria-label': tr('clear'), html: U.icon('close', 18), hidden: true, onclick: () => { inp.value = ''; close(); clear.hidden = true; o.onClear && o.onClear(); inp.focus(); } });
    const el = h('div.ac', null, h('span.ac-ic', { html: U.icon('search', 20) }), inp, h('span.ac-fl', { text: o.label }), clear, list);
    let items = [], active = -1;
    const close = () => { list.classList.remove('on'); inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); active = -1; };
    const render = () => {
      list.textContent = ''; items.forEach((it, i) => {
        const b = h('div', { role: 'option', id: id + 'o' + i, class: 'ac-o' + (i === active ? ' act' : ''), 'aria-selected': i === active });
        b.innerHTML = (it.badge ? `<span class="badge" style="background:${it.badge.bg};color:${it.badge.fg}">${U.esc(it.badge.text)}</span>` : '<span class="ac-pin">' + U.icon(it.icon || 'place', 18) + '</span>') + `<span class="ac-t"><span class="ac-l">${U.esc(it.label)}</span>${it.sub ? `<span class="ac-s">${U.esc(it.sub)}</span>` : ''}</span>`;
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(i); }); list.append(b);
      });
      if (!items.length) list.append(h('div.ac-none', { text: tr('noMatches') }));
      list.classList.add('on'); inp.setAttribute('aria-expanded', 'true'); if (active >= 0) inp.setAttribute('aria-activedescendant', id + 'o' + active);
    };
    const pick = (i) => { const it = items[i]; if (!it) return; close(); inp.value = o.keep === false ? '' : it.label; clear.hidden = !inp.value; o.onSelect(it); if (o.keep === false) inp.blur(); };
    inp.addEventListener('input', () => { clear.hidden = !inp.value; items = o.source(inp.value.trim()); active = items.length ? 0 : -1; render(); });
    inp.addEventListener('focus', () => { inp.select(); if (o.openOnFocus !== false) { items = o.source(inp.value.trim()); active = -1; render(); } });
    inp.addEventListener('blur', () => setTimeout(close, 120));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!list.classList.contains('on')) { items = o.source(inp.value.trim()); render(); } active = Math.min(items.length - 1, active + 1); render(); list.children[active] && list.children[active].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); list.children[active] && list.children[active].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); pick(active); } } else if (e.key === 'Escape') { if (list.classList.contains('on')) { e.preventDefault(); e.stopPropagation(); close(); } }
    });
    return { el, input: inp, set(label) { inp.value = label || ''; clear.hidden = !inp.value; }, focus() { inp.focus(); } };
  };

  // ---------- virtual list ----------
  U.vlist = (o) => {
    const host = h('div.vl', { role: 'listbox', tabindex: 0, 'aria-label': o.label }), spacer = h('div.vl-sp'), win = h('div.vl-w'); host.append(spacer, win);
    let count = o.count || 0, active = -1;
    const rowH = () => o.rowH;
    const draw = () => {
      const st = host.scrollTop, hh = host.clientHeight || 400, a = Math.max(0, Math.floor(st / o.rowH) - 3), b = Math.min(count, Math.ceil((st + hh) / o.rowH) + 3);
      win.style.transform = `translateY(${a * o.rowH}px)`; win.textContent = '';
      for (let i = a; i < b; i++) { const r = o.render(i); r.style.height = o.rowH + 'px'; r.setAttribute('role', 'option'); r.setAttribute('aria-posinset', i + 1); r.setAttribute('aria-setsize', count); r.id = (o.id || 'vl') + 'r' + i; if (i === active) { r.classList.add('act'); r.setAttribute('aria-selected', 'true'); } win.append(r); }
      if (active >= 0) host.setAttribute('aria-activedescendant', (o.id || 'vl') + 'r' + active);
    };
    host.addEventListener('scroll', draw, { passive: true });
    const ro = new ResizeObserver(draw); ro.observe(host);
    host.addEventListener('keydown', (e) => {
      if (!count) return; let n = active;
      if (e.key === 'ArrowDown') n = Math.min(count - 1, active + 1); else if (e.key === 'ArrowUp') n = Math.max(0, active - 1); else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = count - 1; else if (e.key === 'PageDown') n = Math.min(count - 1, active + 10); else if (e.key === 'PageUp') n = Math.max(0, active - 10);
      else if ((e.key === 'Enter' || e.key === ' ') && active >= 0) { e.preventDefault(); o.onActivate && o.onActivate(active); return; } else return;
      e.preventDefault(); active = n; const top = n * o.rowH; if (top < host.scrollTop) host.scrollTop = top; else if (top + o.rowH > host.scrollTop + host.clientHeight) host.scrollTop = top + o.rowH - host.clientHeight; draw();
    });
    host.addEventListener('click', (e) => { const r = e.target.closest('[role=option]'); if (!r) return; const i = +r.getAttribute('aria-posinset') - 1; active = i; draw(); o.onActivate && o.onActivate(i); });
    return { el: host, setCount(n, keep) { count = n; spacer.style.height = n * o.rowH + 'px'; if (!keep) { host.scrollTop = 0; active = -1; } draw(); }, redraw: draw, setActive(i, scroll) { active = i; if (scroll && i >= 0) { host.scrollTop = Math.max(0, i * o.rowH - host.clientHeight / 2); } draw(); }, get count() { return count; } };
  };

  // ---------- virtual sortable, resizable table ----------
  /** o: {columns:[{key,label,width,align,sortable,num}], rows:()=>array, cell(row,col)->string|Node, onRow(row), label} */
  U.vtable = (o) => {
    const host = h('div.vt', { role: 'grid', 'aria-label': o.label }); const head = h('div.vt-h', { role: 'row' }), body = h('div.vt-b', { tabindex: 0 }), spacer = h('div.vt-sp'), win = h('div.vt-w'); body.append(spacer, win); host.append(head, body);
    const cols = o.columns.map((c) => Object.assign({ width: 140 }, c)); let rows = [], sort = null, active = -1; const RH = o.rowH || 36;
    const total = () => cols.reduce((n, c) => n + c.width, 0);
    const drawHead = () => {
      head.textContent = ''; head.style.width = total() + 'px';
      cols.forEach((c, i) => {
        const th = h('div.vt-th', { role: 'columnheader', style: { width: c.width + 'px', textAlign: c.num ? 'right' : 'left' }, 'aria-sort': sort && sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none' });
        const b = h('button', { type: 'button', class: 'vt-sort', 'aria-label': tr('sortBy') + ' ' + c.label }); b.innerHTML = '<span>' + U.esc(c.label) + '</span>' + (sort && sort.key === c.key ? U.icon(sort.dir > 0 ? 'arrow_up' : 'arrow_down', 16) : '');
        b.addEventListener('click', () => { sort = sort && sort.key === c.key ? (sort.dir > 0 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }; doSort(); drawHead(); });
        th.append(b);
        const rs = h('div.vt-rs', { role: 'separator', tabindex: 0, 'aria-orientation': 'vertical', 'aria-label': tr('resize') + ' ' + c.label, 'aria-valuenow': c.width });
        rs.addEventListener('pointerdown', (e) => { e.preventDefault(); rs.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = c.width; const mv = (ev) => { c.width = Math.max(60, w0 + ev.clientX - x0); resize(); }; const up = () => { rs.removeEventListener('pointermove', mv); rs.removeEventListener('pointerup', up); drawHead(); }; rs.addEventListener('pointermove', mv); rs.addEventListener('pointerup', up); });
        rs.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); c.width = Math.max(60, c.width + (e.key === 'ArrowRight' ? 20 : -20)); resize(); drawHead(); host.querySelectorAll('.vt-rs')[i].focus(); } });
        th.append(rs); head.append(th);
      });
    };
    const resize = () => { head.style.width = total() + 'px'; spacer.style.width = total() + 'px'; head.querySelectorAll('.vt-th').forEach((t, i) => { t.style.width = cols[i].width + 'px'; }); draw(); };
    const doSort = () => { if (!sort) { rows = o.rows().slice(); } else { const c = cols.find((x) => x.key === sort.key); const val = (r) => o.sortValue ? o.sortValue(r, c) : o.cell(r, c); rows = o.rows().slice().sort((a, b) => { const x = val(a), y = val(b); const nx = typeof x === 'number', ny = typeof y === 'number'; if (nx && ny) return (x - y) * sort.dir; return String(x).localeCompare(String(y), undefined, { numeric: true }) * sort.dir; }); } spacer.style.height = rows.length * RH + 'px'; body.scrollTop = 0; draw(); };
    const draw = () => {
      const st = body.scrollTop, hh = body.clientHeight || 400, a = Math.max(0, Math.floor(st / RH) - 3), b = Math.min(rows.length, Math.ceil((st + hh) / RH) + 3);
      win.style.transform = `translateY(${a * RH}px)`; win.style.width = total() + 'px'; win.textContent = '';
      for (let i = a; i < b; i++) {
        const r = rows[i], tr0 = h('div.vt-r' + (i === active ? '.act' : ''), { role: 'row', style: { height: RH + 'px' }, 'aria-rowindex': i + 2 });
        cols.forEach((c) => { const v = o.cell(r, c), td = h('div.vt-td', { role: 'gridcell', style: { width: c.width + 'px', textAlign: c.num ? 'right' : 'left' } }); if (v && v.nodeType) td.append(v); else { td.textContent = v === undefined || v === null ? '' : v; td.title = td.textContent; } tr0.append(td); });
        if (o.onRow) { tr0.classList.add('click'); tr0.addEventListener('click', () => { active = i; o.onRow(r); draw(); }); }
        win.append(tr0);
      }
      head.style.transform = `translateX(${-body.scrollLeft}px)`;
    };
    body.addEventListener('scroll', draw, { passive: true });
    body.addEventListener('keydown', (e) => { if (!rows.length) return; if (e.key === 'ArrowDown') active = Math.min(rows.length - 1, active + 1); else if (e.key === 'ArrowUp') active = Math.max(0, active - 1); else if (e.key === 'Enter' && active >= 0 && o.onRow) { o.onRow(rows[active]); return; } else return; e.preventDefault(); const top = active * RH; if (top < body.scrollTop) body.scrollTop = top; else if (top + RH > body.scrollTop + body.clientHeight) body.scrollTop = top + RH - body.clientHeight; draw(); });
    new ResizeObserver(draw).observe(host);
    drawHead(); spacer.style.width = total() + 'px';
    return { el: host, refresh() { doSort(); }, get count() { return rows.length; }, setColumns(c) { cols.splice(0, cols.length, ...c.map((x) => Object.assign({ width: 140 }, x))); sort = null; drawHead(); resize(); doSort(); } };
  };

  // ---------- 2D virtual grid (timetable) ----------
  U.vgrid = (o) => {
    const host = h('div.vg', { role: 'grid', tabindex: 0, 'aria-label': o.label }), sizer = h('div.vg-sz'), cells = h('div.vg-c'), colh = h('div.vg-ch'), rowh = h('div.vg-rh'), corner = h('div.vg-co', { text: o.corner || '' });
    host.append(sizer, cells, colh, rowh, corner); const RH = o.rowH || 34, CW = o.colW || 76, HW = o.headW || 200, HH = o.headH || 56; let nr = 0, nc = 0;
    corner.style.width = HW + 'px'; corner.style.height = HH + 'px';
    const draw = () => {
      const sl = host.scrollLeft, st = host.scrollTop, w = host.clientWidth, hh = host.clientHeight;
      const c0 = Math.max(0, Math.floor(sl / CW) - 1), c1 = Math.min(nc, Math.ceil((sl + w) / CW) + 1), r0 = Math.max(0, Math.floor(st / RH) - 1), r1 = Math.min(nr, Math.ceil((st + hh) / RH) + 1);
      cells.textContent = ''; colh.textContent = ''; rowh.textContent = '';
      for (let r = r0; r < r1; r++) { const rh = o.rowHead(r); rh.style.top = (HH + r * RH) + 'px'; rh.style.height = RH + 'px'; rh.style.width = HW + 'px'; rowh.append(rh); }
      for (let c = c0; c < c1; c++) { const ch = o.colHead(c); ch.style.left = (HW + c * CW) + 'px'; ch.style.width = CW + 'px'; ch.style.height = HH + 'px'; colh.append(ch); }
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) { const ce = o.cell(r, c); ce.style.left = (HW + c * CW) + 'px'; ce.style.top = (HH + r * RH) + 'px'; ce.style.width = CW + 'px'; ce.style.height = RH + 'px'; cells.append(ce); }
      rowh.style.transform = `translateX(${sl}px)`; colh.style.transform = `translateY(${st}px)`; corner.style.transform = `translate(${sl}px,${st}px)`;
    };
    host.addEventListener('scroll', draw, { passive: true }); new ResizeObserver(draw).observe(host);
    host.addEventListener('keydown', (e) => { const k = { ArrowLeft: [-CW, 0], ArrowRight: [CW, 0], ArrowUp: [0, -RH], ArrowDown: [0, RH], PageDown: [0, host.clientHeight - HH], PageUp: [0, -(host.clientHeight - HH)] }[e.key]; if (k) { e.preventDefault(); host.scrollBy(k[0], k[1]); } else if (e.key === 'Home') { e.preventDefault(); host.scrollTo(0, 0); } });
    return { el: host, set(r, c) { nr = r; nc = c; sizer.style.width = HW + c * CW + 'px'; sizer.style.height = HH + r * RH + 'px'; draw(); }, redraw: draw };
  };

  U.t = (k, v) => k; U.lang = () => 'en'; U.locale = () => 'en-CA';
  window.GUI = U;
})();
