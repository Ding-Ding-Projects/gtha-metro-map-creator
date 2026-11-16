// deploy-ui.js: small Material Design 3 controls shared by the deploy dialog, the deploy app and the
// instance manager: text fields with floating labels, switches, checkboxes, segmented buttons, filter
// chips, icon buttons, menus and dialogs. No dependencies; everything is plain DOM so it works in the
// web editor and in the standalone deploy window.
(function (root) {
  'use strict';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  let uid = 0; const nextId = (p) => (p || 'dp') + '-u' + (++uid);

  // 24 px glyphs (viewBox 0 0 24 24) for actions and states.
  const G = {
    play: 'M8 5v14l11-7z', stop: 'M6 6h12v12H6z', restart: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    open: 'M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z',
    more: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z', check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z', close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
    warn: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z', refresh: 'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    logs: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z', update: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z', duplicate: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm-1 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V10l-6-5zm-1 6V6.5L18.5 11H14z',
    remove: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z', drive: 'M20 6H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-3 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z'
  };
  const glyph = (name, size) => { const s = size || 20; const w = el('span', 'dp-ic'); w.setAttribute('aria-hidden', 'true'); w.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="' + (G[name] || '') + '"/></svg>'; return w; };
  const targetGlyph = (id, size) => { const s = size || 20; const w = el('span', 'dp-ic'); w.setAttribute('aria-hidden', 'true'); const d = (root.GMMCDeployIcons || {})[id] || ''; w.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 -960 960 960" focusable="false"><path fill="currentColor" d="' + d + '"/></svg>'; return w; };

  function button(label, cls, fn, icon) {
    const b = el('button', 'dp-btn ' + (cls || '')); b.type = 'button';
    if (icon) b.append(glyph(icon, 18));
    b.append(el('span', 'dp-btn-t', label)); if (fn) b.addEventListener('click', fn);
    b.setLabel = (s) => { b.querySelector('.dp-btn-t').textContent = s; };
    return b;
  }
  function iconButton(icon, label, fn, cls) {
    const b = el('button', 'dp-ib ' + (cls || '')); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.append(glyph(icon, 20));
    if (fn) b.addEventListener('click', fn); return b;
  }

  // Outlined text field with a floating label. opts: { label, type, value, min, max, placeholder, hint, wide, onChange(value), mono }
  function textField(opts) {
    const wrap = el('div', 'dp-tf' + (opts.wide ? ' wide' : '') + (opts.mono ? ' mono' : ''));
    const input = document.createElement('input'); input.type = opts.type || 'text'; input.id = nextId('tf'); input.placeholder = ' ';
    input.autocomplete = 'off'; input.spellcheck = false; if (opts.min !== undefined) { input.min = opts.min; input.max = opts.max; }
    if (opts.value !== undefined) input.value = opts.value;
    const label = el('label', 'dp-tf-l'); label.htmlFor = input.id; label.textContent = opts.label || '';
    const hint = el('div', 'dp-tf-h'); hint.id = input.id + '-h'; hint.textContent = opts.hint || ''; if (opts.hint) input.setAttribute('aria-describedby', hint.id);
    wrap.append(input, label); if (opts.hint !== undefined) wrap.append(hint);
    if (opts.onChange) input.addEventListener('change', () => opts.onChange(opts.type === 'number' ? Number(input.value) : input.value));
    return { root: wrap, input, label, hint, setLabel: (s) => { label.textContent = s; }, setHint: (s) => { hint.textContent = s; if (s) input.setAttribute('aria-describedby', hint.id); else input.removeAttribute('aria-describedby'); }, set: (v) => { if (document.activeElement !== input) input.value = v === undefined || v === null ? '' : v; } };
  }
  // Outlined select with a label. opts: { label, options: [[value, label]], value, onChange, wide }
  function selectField(opts) {
    const wrap = el('div', 'dp-tf dp-sel' + (opts.wide ? ' wide' : ''));
    const sel = document.createElement('select'); sel.id = nextId('sel');
    const label = el('label', 'dp-tf-l', opts.label); label.htmlFor = sel.id;
    wrap.append(sel, label, glyphDown());
    const fill = (options) => { sel.textContent = ''; for (const [v, l] of options) { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.append(o); } };
    fill(opts.options || []); if (opts.value !== undefined) sel.value = opts.value;
    if (opts.onChange) sel.addEventListener('change', () => opts.onChange(sel.value));
    return { root: wrap, select: sel, label, fill, setLabel: (s) => { label.textContent = s; } };
  }
  function glyphDown() { const g = el('span', 'dp-sel-a'); g.setAttribute('aria-hidden', 'true'); g.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>'; return g; }

  // M3 switch. Returns { root, input, setLabel, set }.
  function switchControl(opts) {
    const w = el('label', 'dp-switch' + (opts.wide ? ' wide' : ''));
    const input = document.createElement('input'); input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.checked = !!opts.checked;
    const track = el('span', 'dp-track'); track.append(el('span', 'dp-thumb'));
    const text = el('span', 'dp-switch-t', opts.label || '');
    w.append(input, track, text);
    if (opts.onChange) input.addEventListener('change', () => opts.onChange(input.checked));
    return { root: w, input, setLabel: (s) => { text.textContent = s; }, set: (v) => { input.checked = !!v; } };
  }
  // M3 checkbox. Returns { root, input, setLabel }.
  function checkbox(opts) {
    const w = el('label', 'dp-cb' + (opts.wide ? ' wide' : ''));
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!opts.checked; if (opts.id) input.id = opts.id;
    const box = el('span', 'dp-box'); box.append(glyph('check', 16));
    const text = el('span', 'dp-cb-t', opts.label || ''); w.append(input, box, text);
    if (opts.onChange) input.addEventListener('change', () => opts.onChange(input.checked));
    return { root: w, input, text, setLabel: (s) => { text.textContent = s; } };
  }
  // Segmented button. opts: { options: [[value, label]], value, aria, onChange }
  function segmented(opts) {
    const w = el('div', 'dp-seg'); w.setAttribute('role', 'radiogroup'); if (opts.aria) w.setAttribute('aria-label', opts.aria);
    const name = nextId('seg'); const items = {};
    for (const [v, l] of opts.options) {
      const lab = el('label', 'dp-seg-i'); const r = document.createElement('input'); r.type = 'radio'; r.name = name; r.value = v; r.checked = v === opts.value;
      const t = el('span', '', l); lab.append(r, glyph('check', 16), t); w.append(lab); items[v] = { r, t };
      r.addEventListener('change', () => { if (r.checked && opts.onChange) opts.onChange(v); });
    }
    return { root: w, set: (v) => { for (const k of Object.keys(items)) items[k].r.checked = k === v; }, setLabel: (v, s) => { if (items[v]) items[v].t.textContent = s; }, setAria: (s) => w.setAttribute('aria-label', s), items };
  }
  // Filter chips with counts. opts: { options: [[value, label]], value, aria, onChange }. update(value, counts).
  function chips(opts) {
    const w = el('div', 'dp-chips'); w.setAttribute('role', 'group'); if (opts.aria) w.setAttribute('aria-label', opts.aria);
    const btns = {}; let cur = opts.value;
    const paint = () => { for (const [v, b] of Object.entries(btns)) { const on = v === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.firstChild.hidden = !on; } };
    for (const [v, l] of opts.options) {
      const b = el('button', 'dp-fchip'); b.type = 'button'; b.append(glyph('check', 16), el('span', 'dp-fchip-t', l));
      b.addEventListener('click', () => { cur = v; paint(); if (opts.onChange) opts.onChange(v); }); w.append(b); btns[v] = b;
    }
    paint();
    return { root: w, set: (v) => { cur = v; paint(); }, setLabel: (v, s, count) => { if (btns[v]) btns[v].querySelector('.dp-fchip-t').textContent = s + (count === undefined ? '' : ' ' + count); }, buttons: btns };
  }
  // Menu button: a popup list of actions. items: () => [{ label, icon, onClick, disabled, danger, divider }]
  function menu(anchor, items) {
    const pop = el('div', 'dp-menu'); pop.setAttribute('role', 'menu'); pop.hidden = true; anchor.parentNode.style.position = 'relative'; anchor.after(pop);
    anchor.setAttribute('aria-haspopup', 'menu'); anchor.setAttribute('aria-expanded', 'false');
    const close = () => { pop.hidden = true; anchor.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); };
    const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
    const open = () => {
      pop.textContent = '';
      for (const it of items()) {
        if (it.divider) { pop.append(el('div', 'dp-menu-d')); continue; }
        const b = el('button', 'dp-menu-i' + (it.danger ? ' danger' : '')); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.disabled = !!it.disabled; if (it.title) b.title = it.title;
        if (it.icon) b.append(glyph(it.icon, 18)); b.append(el('span', '', it.label)); b.addEventListener('click', () => { close(); anchor.focus(); it.onClick(); }); pop.append(b);
      }
      pop.hidden = false; anchor.setAttribute('aria-expanded', 'true'); document.addEventListener('click', outside, true);
      const first = pop.querySelector('button:not(:disabled)'); if (first) first.focus();
    };
    anchor.addEventListener('click', (e) => { e.stopPropagation(); if (pop.hidden) open(); else close(); });
    pop.addEventListener('keydown', (e) => {
      const bs = Array.from(pop.querySelectorAll('button:not(:disabled)')); const i = bs.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); } else if (e.key === 'ArrowDown') { e.preventDefault(); (bs[i + 1] || bs[0]).focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); } else if (e.key === 'Tab') close();
    });
    return { close };
  }
  // Modal dialog. opts: { title, icon, tone: 'error'|'', cls }. Returns { dlg, body, actions, open(), close(), setTitle }.
  function dialog(opts) {
    const dlg = document.createElement('dialog'); dlg.className = 'dp-modal ' + (opts.cls || '');
    const head = el('div', 'dp-modal-h'); let tile = null;
    if (opts.icon) { tile = el('span', 'dp-modal-ic ' + (opts.tone || '')); tile.append(glyph(opts.icon, 24)); head.append(tile); }
    const h = el('h2', 'dp-modal-t', opts.title || ''); h.id = nextId('mt'); head.append(h); dlg.setAttribute('aria-labelledby', h.id);
    const body = el('div', 'dp-modal-b'); const actions = el('div', 'dp-modal-a'); dlg.append(head, body, actions);
    dlg.addEventListener('click', (e) => { if (e.target === dlg && !opts.persistent) dlg.close(); });
    (opts.host || document.body).append(dlg);
    return { dlg, body, actions, setTitle: (s) => { h.textContent = s; }, open: () => { if (!dlg.open) dlg.showModal(); }, close: () => { if (dlg.open) dlg.close(); } };
  }
  // Puts text into a node, turning http(s) addresses into links that call open(url).
  function linkify(node, text, open) {
    node.textContent = '';
    const re = /(https?:\/\/[^\s)]+)/g; let last = 0; let m;
    while ((m = re.exec(text))) {
      if (m.index > last) node.append(document.createTextNode(text.slice(last, m.index)));
      const a = el('a', 'dp-why-link', m[1]); a.href = m[1]; a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', (e) => { if (open) { e.preventDefault(); open(m[1]); } }); node.append(a); last = m.index + m[1].length;
    }
    if (last < text.length) node.append(document.createTextNode(text.slice(last)));
  }
  const fmtBytes = (n) => (n >= 1e9 ? (n / 1e9).toFixed(n >= 1e11 ? 0 : 1) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.round(n / 1e3) + ' KB');

  root.GMMCDeployUI = { el, glyph, targetGlyph, button, iconButton, textField, selectField, switchControl, checkbox, segmented, chips, menu, dialog, linkify, fmtBytes, nextId };
})(typeof self !== 'undefined' ? self : this);
