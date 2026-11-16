// mod-vehicles.js: see docs/features/vehicles.md. Registers hooks on window.GMMCX before app.js loads.
// Each route can list the vehicle types that run on it (line.vehicles); they show in the inspector, the route list,
// the optional export legend and the trip planner.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  ['validate', 'inspector', 'lineRow', 'legendColumn', 'ready'].forEach((k) => { X[k] = X[k] || []; });
  const I = window.I18N;
  let C = null; // window.GMMC, set by the ready hook

  I.add({
    vhTitle: 'Vehicles', vhAdd: 'Add vehicle', vhMaker: 'Maker', vhModel: 'Model', vhKind: 'Type', vhCount: 'Number of vehicles', vhNote: 'Note',
    vhRemove: 'Remove vehicle', vhUp: 'Move up', vhDown: 'Move down', vhEdit: 'Edit vehicle', vhCollapse: 'Close editor', vhDrag: 'Reorder: drag, or press the up and down arrow keys', vhSuggest: 'Suggestions', vhCountSuffix: 'vehicles', vhNone: 'No vehicles listed for this route.',
    vhHint: 'Suggestions are common GTHA and North American vehicles. You can type any maker or model.',
    vhLegendCol: 'Show vehicles in the export legend', vhVehicle: 'Vehicle',
    vk_bus: 'Bus', vk_articulated: 'Articulated bus', vk_doubleDecker: 'Double-decker', vk_lrv: 'Light rail vehicle', vk_subway: 'Subway car', vk_regional: 'Regional train', vk_other: 'Other'
  }, {
    vhTitle: '車輛', vhAdd: '新增車輛', vhMaker: '製造商', vhModel: '型號', vhKind: '類型', vhCount: '車輛數目', vhNote: '備註',
    vhRemove: '移除車輛', vhUp: '上移', vhDown: '下移', vhEdit: '編輯車輛', vhCollapse: '收起編輯', vhDrag: '重新排序：拖曳，或者按上下方向鍵', vhSuggest: '建議項目', vhCountSuffix: '架', vhNone: '呢條路線未有列出車輛。',
    vhHint: '建議項目係大多地區同北美常見嘅車輛，亦可以自己輸入任何製造商或型號。',
    vhLegendCol: '圖例匯出包括車輛', vhVehicle: '車輛',
    vk_bus: '巴士', vk_articulated: '雙節巴士', vk_doubleDecker: '雙層巴士', vk_lrv: '輕軌列車', vk_subway: '地鐵列車', vk_regional: '區域列車', vk_other: '其他'
  });
  const t = (k) => I.t(k);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, s) => (window.icon ? window.icon(n, s) : '');

  const KINDS = ['bus', 'articulated', 'doubleDecker', 'lrv', 'subway', 'regional', 'other'];
  const KIND_ICON = { bus: 'directions_bus', articulated: 'directions_bus', doubleDecker: 'directions_bus', lrv: 'tram', subway: 'train', regional: 'train', other: 'train' };
  // Suggestions only: real, publicly documented vehicle models common in the GTHA and North America.
  const CATALOGUE = [
    { maker: 'New Flyer', model: 'Xcelsior XD40', kind: 'bus' },
    { maker: 'New Flyer', model: 'Xcelsior XD60', kind: 'articulated' },
    { maker: 'New Flyer', model: 'Xcelsior XE40', kind: 'bus' },
    { maker: 'Nova Bus', model: 'LFS', kind: 'bus' },
    { maker: 'Nova Bus', model: 'LFS Articulated', kind: 'articulated' },
    { maker: 'Alexander Dennis', model: 'Enviro500', kind: 'doubleDecker' },
    { maker: 'Proterra', model: 'ZX5', kind: 'bus' },
    { maker: 'BYD', model: 'K9M', kind: 'bus' },
    { maker: 'Alstom (Bombardier)', model: 'Flexity Outlook', kind: 'lrv' },
    { maker: 'Alstom', model: 'Citadis Spirit', kind: 'lrv' },
    { maker: 'Bombardier', model: 'Toronto Rocket', kind: 'subway' },
    { maker: 'Bombardier', model: 'BiLevel Coach', kind: 'regional' },
    { maker: 'Siemens', model: 'Charger', kind: 'regional' },
    { maker: 'Stadler', model: 'FLIRT', kind: 'regional' }
  ];
  const MAX_VEHICLES = 20;

  // ---------- data ----------
  function clean(v) {
    if (!v || typeof v !== 'object') return null;
    const o = { maker: String(v.maker || '').trim().slice(0, 60), model: String(v.model || '').trim().slice(0, 60), kind: KINDS.includes(v.kind) ? v.kind : 'other' };
    if (!o.maker && !o.model) return null;
    const n = Math.round(+v.count);
    if (v.count !== null && v.count !== '' && v.count !== undefined && Number.isFinite(n) && n >= 1 && n <= 9999) o.count = n;
    const note = String(v.note || '').trim().slice(0, 120);
    if (note) o.note = note;
    return o;
  }
  X.validate.push(function (src, out) {
    (src.lines || []).forEach((sl, i) => {
      const ol = out.lines[i];
      if (!ol || !sl || !Array.isArray(sl.vehicles)) return;
      const list = sl.vehicles.slice(0, MAX_VEHICLES).map(clean).filter(Boolean);
      if (list.length) ol.vehicles = list;
    });
  });

  const name = (v) => [v.maker, v.model].filter(Boolean).join(' ');
  /** A compact summary of a route's vehicles: the first one, then how many more, for example "New Flyer Xcelsior XD60 +1". */
  function summary(line) {
    const list = line && Array.isArray(line.vehicles) ? line.vehicles.filter((v) => v && (v.maker || v.model)) : [];
    if (!list.length) return '';
    return name(list[0]) + (list.length > 1 ? ' +' + (list.length - 1) : '');
  }
  const kindLabel = (k) => t('vk_' + (KINDS.includes(k) ? k : 'other'));
  const fullList = (line) => (line.vehicles || []).map((v) => name(v) + (v.count ? ' x' + v.count : '')).join(', ');

  // ---------- route list, legend ----------
  X.lineRow.push(function (l) {
    const s = summary(l);
    if (!s) return '';
    const first = l.vehicles[0];
    return `<span class="li-sub li-veh" title="${esc(fullList(l))}">${icon(KIND_ICON[first.kind] || 'train', 14)}<span>${esc(s)}</span></span>`;
  });
  X.legendColumn.push(function (l, ctx) {
    if (!C || !C.getSettings().vehicleLegend || !l.vehicles || !l.vehicles.length) return '';
    let txt = fullList(l);
    if (txt.length > 64) txt = txt.slice(0, 61) + '...';
    return `<text x="${ctx.x}" y="${ctx.y}" font-size="12" fill="${ctx.th.sub}">${esc(txt)}</text>`;
  });

  // ---------- inspector ----------
  const open = new WeakSet(); // vehicles whose editor is expanded (not saved with the map)
  const makers = () => [...new Set(CATALOGUE.map((c) => c.maker))];
  function modelsFor(maker) {
    const m = String(maker || '').trim().toLowerCase();
    const own = CATALOGUE.filter((c) => c.maker.toLowerCase() === m);
    return (own.length ? own : CATALOGUE).map((c) => c.model);
  }
  const listbox = (cls, id, items, sel) => `<ul class="m3-menu ${cls}" id="${id}" role="listbox" hidden>${items.map((it) => `<li role="option" tabindex="-1" data-val="${esc(it.val)}" aria-selected="${it.val === sel}">${it.icon ? icon(it.icon, 20) : ''}<span>${esc(it.text)}</span></li>`).join('')}</ul>`;
  function rowHtml(line, v, i, n) {
    const at = `data-line="${esc(line.id)}" data-i="${i}"`, uid = `${i}`;
    const isOpen = open.has(v);
    const title = name(v) || t('vhVehicle') + ' ' + (i + 1);
    const sub = kindLabel(v.kind) + (v.count ? ' · ' + v.count + ' ' + t('vhCountSuffix') : '');
    const kindItems = KINDS.map((k) => ({ val: k, text: kindLabel(k), icon: KIND_ICON[k] }));
    const head = `<div class="vh-head"><button type="button" class="icon-btn vh-drag" data-vhact="drag" ${at} aria-label="${esc(t('vhDrag'))}" title="${esc(t('vhDrag'))}">${icon('drag_indicator', 20)}</button>` +
      `<span class="vh-ic">${icon(KIND_ICON[v.kind] || 'train', 20)}</span><span class="vh-text"><span class="vh-title">${esc(title)}</span><span class="vh-sub">${esc(sub)}</span></span>` +
      `<button type="button" class="icon-btn vh-btn" data-vhact="edit" ${at} aria-expanded="${isOpen}" aria-label="${esc(t(isOpen ? 'vhCollapse' : 'vhEdit') + ': ' + title)}" title="${esc(t(isOpen ? 'vhCollapse' : 'vhEdit'))}">${icon('edit', 20)}</button>` +
      `<button type="button" class="icon-btn vh-btn" data-vhact="remove" ${at} aria-label="${esc(t('vhRemove') + ': ' + title)}" title="${esc(t('vhRemove'))}">${icon('delete', 20)}</button></div>`;
    const ac = (f, label, val, items) => `<div class="tf vh-ac"><label class="tf-label" for="vh_${f}_${uid}">${esc(label)}</label><input type="text" id="vh_${f}_${uid}" data-vh="${f}" ${at} role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="vh_${f}_${uid}_l" maxlength="60" value="${esc(val)}" autocomplete="off">${listbox('vh-sug', `vh_${f}_${uid}_l`, items.map((x) => ({ val: x, text: x })), '')}</div>`;
    const body = `<div class="vh-body"${isOpen ? '' : ' hidden'}>` +
      ac('maker', t('vhMaker'), v.maker, makers().map((x) => x)) + ac('model', t('vhModel'), v.model, modelsFor(v.maker)) +
      `<div class="vh-two"><div class="tf vh-kind"><span class="tf-label" id="vh_k_${uid}_lb">${esc(t('vhKind'))}</span><button type="button" class="m3-menu-btn" data-vhkind="${uid}" ${at} aria-haspopup="listbox" aria-expanded="false" aria-labelledby="vh_k_${uid}_lb vh_k_${uid}_v">${icon(KIND_ICON[v.kind] || 'train', 20)}<span id="vh_k_${uid}_v">${esc(kindLabel(v.kind))}</span>${icon('arrow_drop_down', 24)}</button>${listbox('vh-kinds', `vh_k_${uid}_m`, kindItems, v.kind)}</div>` +
      `<div class="tf vh-count-f"><span class="tf-label">${esc(t('vhCount'))}</span>${window.GMMCControls.stepper({ attrs: `data-vh="count" ${at}`, value: v.count || '', min: 1, max: 9999, step: 1, unit: '', label: t('vhCount'), placeholder: '-', clearable: true })}</div></div>` +
      `<label class="tf"><span class="tf-label">${esc(t('vhNote'))}</span><input type="text" data-vh="note" ${at} maxlength="120" value="${esc(v.note || '')}"></label></div>`;
    return `<li class="vh-card${isOpen ? ' open' : ''}" data-vhcard="${i}" ${at}>${head}${body}</li>`;
  }
  X.inspector.push(function (sel) {
    if (!sel || (sel.type !== 'line' && sel.type !== 'edge')) return '';
    const line = C && C.lineById(sel.lineId || sel.id);
    if (!line) return '';
    const list = line.vehicles || [];
    const body = list.length ? `<ul class="vh-list" id="vhList">${list.map((v, i) => rowHtml(line, v, i, list.length)).join('')}</ul>` : `<p class="supporting">${esc(t('vhNone'))}</p>`;
    return `<div class="insp vh-section"><h3 class="title-sm">${icon('directions_bus', 18)} ${esc(t('vhTitle'))}<span class="supporting vh-count">${list.length}</span></h3>${body}` +
      `<p class="supporting">${esc(t('vhHint'))}</p>` +
      `<div class="actions"><button type="button" class="btn tonal" data-vhact="add" data-line="${esc(line.id)}"${list.length >= MAX_VEHICLES ? ' disabled' : ''}>${icon('add', 18)}<span>${esc(t('vhAdd'))}</span></button></div></div>`;
  });

  function defaultKind(line) { return line.style === 'rail' ? 'regional' : (line.style === 'bus' || line.style === 'brt') ? 'bus' : 'other'; }
  const vehicleOf = (el) => { const line = C.lineById(el.dataset.line); return { line, v: line && line.vehicles && line.vehicles[+el.dataset.i] }; };

  /** Update one card in place after an edit, so focus is never lost while tabbing between fields. */
  function refreshCard(card, v) {
    const title = name(v) || t('vhVehicle') + ' ' + (+card.dataset.i + 1);
    card.querySelector('.vh-title').textContent = title;
    card.querySelector('.vh-sub').textContent = kindLabel(v.kind) + (v.count ? ' · ' + v.count + ' ' + t('vhCountSuffix') : '');
    card.querySelector('.vh-ic').innerHTML = icon(KIND_ICON[v.kind] || 'train', 20);
    const kb = card.querySelector('.m3-menu-btn'), vs = kb.querySelector('span');
    kb.innerHTML = icon(KIND_ICON[v.kind] || 'train', 20) + `<span id="${vs.id}">${esc(kindLabel(v.kind))}</span>` + icon('arrow_drop_down', 24);
    card.querySelectorAll('.vh-kinds [role="option"]').forEach((o) => o.setAttribute('aria-selected', String(o.dataset.val === v.kind)));
    for (const f of ['maker', 'model']) { const inp = card.querySelector(`[data-vh="${f}"]`); if (inp !== document.activeElement) inp.value = v[f]; }
    const cnt = card.querySelector('[data-vh="count"]'); if (cnt !== document.activeElement) cnt.value = v.count || '';
    const ml = card.querySelector('.vh-ac:nth-of-type(2) .m3-menu');
    if (ml) ml.innerHTML = modelsFor(v.maker).map((m) => `<li role="option" tabindex="-1" data-val="${esc(m)}" aria-selected="false"><span>${esc(m)}</span></li>`).join('');
  }
  function applyField(el, f, raw) {
    const { v } = vehicleOf(el);
    if (!v) return;
    if (f === 'count') {
      const n = Math.round(+raw);
      if (String(raw).trim() !== '' && !(Number.isFinite(n) && n >= 1 && n <= 9999)) { el.value = v.count || ''; return; }
      C.checkpoint();
      if (String(raw).trim() === '') delete v.count; else v.count = n;
    } else if (f === 'kind') {
      if (!KINDS.includes(raw)) return;
      C.checkpoint(); v.kind = raw;
    } else {
      C.checkpoint();
      const val = String(raw).trim().slice(0, f === 'note' ? 120 : 60);
      if (f === 'note') { if (val) v.note = val; else delete v.note; } else v[f] = val;
      if (f === 'model') {
        const hit = CATALOGUE.find((c) => c.model.toLowerCase() === v.model.toLowerCase() && (!v.maker || c.maker.toLowerCase() === v.maker.toLowerCase()));
        if (hit) { if (!v.maker) v.maker = hit.maker; v.kind = hit.kind; }
      }
    }
    const card = el.closest('.vh-card');
    if (card) refreshCard(card, v);
    C.saveMap(); C.renderLines();
  }
  document.addEventListener('change', function (e) {
    const el = e.target && e.target.closest && e.target.closest('[data-vh]');
    if (!el || !C) return;
    // the editor stays open while the inspector is redrawn
    applyField(el, el.dataset.vh, el.value);
  });

  // ---------- autocomplete menus (maker, model) and the kind dropdown ----------
  function closeMenus(except) {
    document.querySelectorAll('.vh-section .m3-menu:not([hidden])').forEach((m) => { if (m !== except) { m.hidden = true; const ctl = m.parentElement.querySelector('[aria-expanded]'); if (ctl) ctl.setAttribute('aria-expanded', 'false'); } });
  }
  function showMenu(menu, owner) { closeMenus(menu); menu.hidden = false; owner.setAttribute('aria-expanded', 'true'); }
  const visibleOptions = (menu) => [...menu.querySelectorAll('[role="option"]:not([hidden])')];
  function filterSuggestions(input) {
    const menu = document.getElementById(input.getAttribute('aria-controls'));
    if (!menu) return;
    const q = input.value.trim().toLowerCase();
    let any = false;
    menu.querySelectorAll('[role="option"]').forEach((o) => { const hit = !q || o.textContent.toLowerCase().includes(q); o.hidden = !hit; if (hit) any = true; });
    if (any) showMenu(menu, input); else { menu.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  }
  function pickSuggestion(input, opt) {
    input.value = opt.dataset.val;
    closeMenus();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.addEventListener('input', function (e) {
    const el = e.target;
    if (el && el.matches && el.matches('.vh-ac input')) filterSuggestions(el);
  });
  document.addEventListener('focusin', function (e) {
    const el = e.target;
    if (el && el.matches && el.matches('.vh-ac input')) filterSuggestions(el);
    else if (!(el.closest && el.closest('.m3-menu'))) { const own = el.closest && el.closest('.vh-kind'); closeMenus(own ? own.querySelector('.m3-menu') : null); }
  });
  document.addEventListener('mousedown', function (e) {
    const opt = e.target && e.target.closest && e.target.closest('.vh-section .m3-menu [role="option"]');
    if (opt) {
      e.preventDefault(); // keep focus in the field
      const menu = opt.closest('.m3-menu');
      if (menu.classList.contains('vh-kinds')) { const btn = menu.parentElement.querySelector('.m3-menu-btn'); closeMenus(); applyField(btn, 'kind', opt.dataset.val); }
      else pickSuggestion(menu.parentElement.querySelector('input'), opt);
      return;
    }
    if (!(e.target.closest && (e.target.closest('.vh-ac') || e.target.closest('.vh-kind')))) closeMenus();
  });
  document.addEventListener('keydown', function (e) {
    const t0 = e.target;
    if (!t0 || !t0.closest || !C) return;
    // autocomplete field
    if (t0.matches('.vh-ac input')) {
      const menu = document.getElementById(t0.getAttribute('aria-controls')), opts = visibleOptions(menu);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (menu.hidden) filterSuggestions(t0);
        const o = visibleOptions(menu); if (!o.length) return;
        const cur = o.findIndex((x) => x.classList.contains('active'));
        o.forEach((x) => x.classList.remove('active'));
        const nx = o[(cur + (e.key === 'ArrowDown' ? 1 : -1) + o.length) % o.length]; nx.classList.add('active'); nx.scrollIntoView({ block: 'nearest' });
        t0.setAttribute('aria-activedescendant', '');
      } else if (e.key === 'Enter') {
        const act = opts.find((x) => x.classList.contains('active'));
        if (act) { e.preventDefault(); pickSuggestion(t0, act); }
      } else if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); e.stopPropagation(); menu.hidden = true; t0.setAttribute('aria-expanded', 'false'); }
      return;
    }
    // kind dropdown button and its options
    const kb = t0.closest('.m3-menu-btn');
    if (kb) {
      const menu = kb.parentElement.querySelector('.m3-menu');
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault(); showMenu(menu, kb);
        const o = visibleOptions(menu); (o.find((x) => x.getAttribute('aria-selected') === 'true') || o[0]).focus();
      }
      return;
    }
    const opt = t0.closest('.vh-kinds [role="option"]');
    if (opt) {
      const menu = opt.closest('.m3-menu'), o = visibleOptions(menu), i = o.indexOf(opt), btn = menu.parentElement.querySelector('.m3-menu-btn');
      if (e.key === 'ArrowDown') { e.preventDefault(); o[(i + 1) % o.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); o[(i - 1 + o.length) % o.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); o[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); o[o.length - 1].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeMenus(); applyField(btn, 'kind', opt.dataset.val); }
      else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } closeMenus(); btn.focus(); }
      return;
    }
    // drag handle: arrow keys reorder
    const h = t0.closest('.vh-drag');
    if (h && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const line = C.lineById(h.dataset.line), i = +h.dataset.i, j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (line && line.vehicles && j >= 0 && j < line.vehicles.length) { move(line, i, j); C.changed(); const nh = document.querySelector(`.vh-drag[data-i="${j}"]`); if (nh) nh.focus(); }
    }
  }, true);
  document.addEventListener('click', function (e) {
    const kb = e.target && e.target.closest && e.target.closest('.m3-menu-btn');
    if (!kb) return;
    const menu = kb.parentElement.querySelector('.m3-menu');
    if (menu.hidden) { showMenu(menu, kb); const o = visibleOptions(menu); (o.find((x) => x.getAttribute('aria-selected') === 'true') || o[0]).focus(); } else closeMenus();
  });

  // ---------- card actions and drag-and-drop ----------
  function move(line, from, to) { const [x] = line.vehicles.splice(from, 1); line.vehicles.splice(to, 0, x); }
  document.addEventListener('click', function (e) {
    const b = e.target && e.target.closest && e.target.closest('[data-vhact]');
    if (!b || !C || b.disabled || b.dataset.vhact === 'drag') return;
    const line = C.lineById(b.dataset.line);
    if (!line) return;
    const act = b.dataset.vhact, i = +b.dataset.i;
    if (act === 'edit') {
      const v = line.vehicles[i]; if (!v) return;
      if (open.has(v)) open.delete(v); else open.add(v);
      C.renderInspector();
      const nb = document.querySelector(`[data-vhact="edit"][data-i="${i}"]`); if (nb) nb.focus();
      return;
    }
    C.checkpoint();
    if (act === 'add') { const nv = { maker: '', model: '', kind: defaultKind(line) }; line.vehicles = (line.vehicles || []).concat([nv]).slice(0, MAX_VEHICLES); open.add(nv); }
    else if (act === 'remove') { line.vehicles.splice(i, 1); if (!line.vehicles.length) delete line.vehicles; }
    C.changed();
    if (act === 'add') { const f = document.querySelector('.vh-card:last-child [data-vh="maker"]'); if (f) f.focus(); }
  });
  let dragFrom = null;
  document.addEventListener('pointerdown', function (e) {
    const h = e.target && e.target.closest && e.target.closest('.vh-drag');
    if (h) h.closest('.vh-card').draggable = true;
  });
  document.addEventListener('dragstart', function (e) {
    const card = e.target && e.target.closest && e.target.closest('.vh-card');
    if (!card) return;
    dragFrom = +card.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom));
    card.classList.add('dragging');
  });
  document.addEventListener('dragover', function (e) {
    const card = e.target && e.target.closest && e.target.closest('.vh-card');
    if (!card || dragFrom === null) return;
    e.preventDefault();
    document.querySelectorAll('.vh-card.drop').forEach((c) => c.classList.remove('drop'));
    card.classList.add('drop');
  });
  document.addEventListener('drop', function (e) {
    const card = e.target && e.target.closest && e.target.closest('.vh-card');
    if (!card || dragFrom === null) return;
    e.preventDefault();
    const line = C.lineById(card.dataset.line), to = +card.dataset.i;
    if (line && line.vehicles && to !== dragFrom) { C.checkpoint(); move(line, dragFrom, to); C.changed(); }
    dragFrom = null;
  });
  document.addEventListener('dragend', function () {
    dragFrom = null;
    document.querySelectorAll('.vh-card').forEach((c) => { c.classList.remove('dragging', 'drop'); c.draggable = false; });
  });

  window.GMMCVehicles = { KINDS, CATALOGUE, summary, kindLabel, clean, move: (line, i, j) => move(line, i, j) };
  X.ready.push(function (gmmc) { C = gmmc; });
})();
