// mod-patterns.js: see docs/features/patterns.md. Registers hooks on window.GMMCX before app.js loads.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  ['validate', 'transform', 'lineStyle', 'inspector', 'click', 'keydown', 'pointer', 'ready'].forEach((k) => { X[k] = X[k] || []; });
  let C = null; // window.GMMC once the editor is ready
  let active = null; // { lineId, index }: the branch that Route-tool clicks append to

  window.I18N.add({
    bandPeak: 'Peak', bandMidday: 'Midday', bandEvening: 'Evening', bandWeekend: 'Weekend',
    frequencyByTime: 'Frequency by time of day', patStops: 'Stops', patStopsState: 'Stops', patPassesState: 'Passes',
    patStopToggle: 'Toggle whether this route stops here', patEndpoint: 'Terminals always stop',
    patBranches: 'Branches', patBranch: 'Branch', patNoBranches: 'No branches. Add one from a station on this route.',
    patDraw: 'Draw', patDrawing: 'Drawing', patDeleteBranch: 'Delete branch', patBranchHere: 'Branch from here',
    patAddBranch: 'Add branch from this station', patServicePatterns: 'Service patterns',
    patBranchHint: 'Branch started. With the Route tool, click stations to extend it. Press Escape when done.',
    patClickStation: 'Click an existing station to extend the branch',
    freqWeight: 'Line weight follows frequency'
  }, {
    bandPeak: '繁忙時間', bandMidday: '午間', bandEvening: '晚間', bandWeekend: '週末',
    frequencyByTime: '各時段班次', patStops: '車站', patStopsState: '停站', patPassesState: '過站',
    patStopToggle: '切換呢條路線喺呢度停唔停', patEndpoint: '總站一定停',
    patBranches: '支線', patBranch: '支線', patNoBranches: '未有支線。喺路線上面揀個站加入。',
    patDraw: '畫線', patDrawing: '畫緊', patDeleteBranch: '刪除支線', patBranchHere: '由呢度開支線',
    patAddBranch: '由呢個站開支線', patServicePatterns: '服務模式',
    patBranchHint: '已開始支線。用路線工具撳車站延伸，完成後撳 Escape。',
    patClickStation: '請撳一個現有車站延伸支線',
    freqWeight: '線條粗幼跟班次'
  });

  const isStationRef = (r) => typeof r === 'string' && r[0] !== '@';

  // Validation: line.skip (stations the route passes) and line.branches (extra station paths).
  X.validate.push((src, out) => {
    out.lines.forEach((l, i) => {
      const s = src.lines[i] || {};
      if (Array.isArray(s.skip)) {
        const skip = [...new Set(s.skip.filter((id) => typeof id === 'string' && l.path.includes(id)))].slice(0, 2000);
        if (skip.length) l.skip = skip;
      }
      if (Array.isArray(s.branches)) {
        const br = s.branches.slice(0, 20).filter(Array.isArray)
          .map((b) => b.slice(0, 200).filter((id) => typeof id === 'string' && out.stations[id]))
          .filter((b) => b.length >= 2);
        if (br.length) l.branches = br;
      }
    });
  });

  // Drawing: each branch becomes an extra line with the same identity. The stored map is untouched.
  X.transform.push((m) => {
    if (!m.lines.some((l) => l.branches && l.branches.length)) return null;
    const lines = [];
    for (const l of m.lines) {
      lines.push(l);
      (l.branches || []).forEach((b, i) => {
        const path = b.filter((id) => m.stations[id]);
        if (path.length < 2) return;
        const copy = Object.assign({}, l, { id: l.id + '~b' + i, path, bends: {}, showFreq: false, _branchOf: l.id });
        delete copy.branches;
        lines.push(copy);
      });
    }
    return Object.assign({}, m, { lines });
  });

  // Frequent-network style: width follows the peak headway when the setting is on.
  X.lineStyle.push((line) => {
    if (!C || !C.getSettings().freqWeight) return null;
    const f = line.freq || {};
    const h = f.peak || f.midday || f.offpeak;
    if (!h) return null;
    return Object.assign({}, line, { width: h <= 10 ? 10 : h <= 15 ? 7 : h <= 30 ? 5 : 3 });
  });

  const selLine = (sel) => (sel && (sel.type === 'line' || sel.type === 'edge')) ? C.lineById(sel.lineId || sel.id) : null;
  const branchActive = () => {
    if (!active || !C) return null;
    const l = C.lineById(active.lineId);
    const b = l && l.branches && l.branches[active.index];
    return b ? { line: l, branch: b } : null;
  };

  X.inspector.push((sel, map) => {
    if (!C) return '';
    const T = C.t, E = C.esc;
    const l = selLine(sel);
    if (!l) {
      // A single selected station: offer to start a branch on the active line.
      if (sel && sel.type === 'station' && sel.ids.length === 1) {
        const al = C.getActiveLine() && C.lineById(C.getActiveLine());
        if (al && al.path.includes(sel.ids[0])) {
          return `<div class="insp patterns"><h3 class="title-sm">${E(T('patServicePatterns'))}</h3><div class="actions"><button type="button" class="btn tonal" data-pat="addBranch" data-line="${E(al.id)}" data-st="${E(sel.ids[0])}"><span>${E(T('patAddBranch'))}</span></button></div></div>`;
        }
      }
      return '';
    }
    if (active && active.lineId !== l.id) active = null;
    const skip = new Set(l.skip || []);
    const last = l.path.length - 1;
    const rows = l.path.map((r, i) => [r, i]).filter(([r]) => isStationRef(r) && map.stations[r]).map(([r, i]) => {
      const st = map.stations[r], passes = skip.has(r), end = i === 0 || i === last;
      const mark = `<span class="pat-mark${passes ? ' pass' : ''}" style="--c:${E(l.color)}"></span>`;
      return `<li class="pat-row">${mark}<span class="pat-name">${E(st.name)}</span>` +
        `<button type="button" class="pat-chip${passes ? ' pass' : ''}" data-pat="toggle" data-line="${E(l.id)}" data-st="${E(r)}"${end ? ` disabled title="${E(T('patEndpoint'))}"` : ` title="${E(T('patStopToggle'))}"`}>${E(T(passes ? 'patPassesState' : 'patStopsState'))}</button>` +
        `<button type="button" class="pat-mini" data-pat="addBranch" data-line="${E(l.id)}" data-st="${E(r)}" title="${E(T('patBranchHere'))}" aria-label="${E(T('patBranchHere') + ': ' + st.name)}">+</button></li>`;
    }).join('');
    const brs = (l.branches || []).map((b, i) => {
      const on = active && active.lineId === l.id && active.index === i;
      return `<li class="pat-row"><span class="pat-name">${E(T('patBranch'))} ${i + 1} <span class="supporting">${b.length} ${E(T('stops'))}</span></span>` +
        `<button type="button" class="pat-chip${on ? ' on' : ''}" aria-pressed="${on}" data-pat="draw" data-line="${E(l.id)}" data-i="${i}">${E(T(on ? 'patDrawing' : 'patDraw'))}</button>` +
        `<button type="button" class="pat-chip" data-pat="delBranch" data-line="${E(l.id)}" data-i="${i}">${E(T('patDeleteBranch'))}</button></li>`;
    }).join('');
    return `<div class="insp patterns"><h3 class="title-sm">${E(T('patStops'))} <span class="supporting">${l.path.filter((r) => isStationRef(r)).length}</span></h3><ul class="pat-list" id="patStopList">${rows}</ul>` +
      `<h3 class="title-sm">${E(T('patBranches'))} <span class="supporting">${(l.branches || []).length}</span></h3>` +
      (brs ? `<ul class="pat-list pat-branches">${brs}</ul>` : `<p class="supporting">${E(T('patNoBranches'))}</p>`) +
      (active ? `<p class="supporting">${E(T('patBranchHint'))}</p>` : '') + `</div>`;
  });

  X.click.push((e) => {
    const b = e.target.closest && e.target.closest('[data-pat]');
    if (!b || !C || b.disabled) return false;
    const l = C.lineById(b.dataset.line);
    if (!l) return true;
    const list = document.getElementById('patStopList');
    const keep = list ? list.scrollTop : 0;
    const act = b.dataset.pat;
    if (act === 'toggle') {
      C.checkpoint();
      const skip = new Set(l.skip || []);
      if (skip.has(b.dataset.st)) skip.delete(b.dataset.st); else skip.add(b.dataset.st);
      if (skip.size) l.skip = [...skip]; else delete l.skip;
      C.changed();
      const nl = document.getElementById('patStopList'); if (nl) nl.scrollTop = keep;
    } else if (act === 'addBranch') {
      C.checkpoint();
      l.branches = (l.branches || []).concat([[b.dataset.st]]);
      active = { lineId: l.id, index: l.branches.length - 1 };
      C.setActiveLine(l.id); C.setSelection({ type: 'line', id: l.id }); C.setTool('line');
      C.changed(); C.toast(C.t('patBranchHint'));
    } else if (act === 'draw') {
      const i = +b.dataset.i;
      active = active && active.lineId === l.id && active.index === i ? null : { lineId: l.id, index: i };
      if (active) { C.setActiveLine(l.id); C.setTool('line'); }
      C.renderInspector();
    } else if (act === 'delBranch') {
      C.checkpoint();
      l.branches.splice(+b.dataset.i, 1);
      if (!l.branches.length) delete l.branches;
      active = null;
      C.changed();
    }
    return true;
  });

  // With a branch armed, Route-tool station clicks extend that branch instead of the main route.
  X.pointer.push((e, p, tool, target) => {
    const a = branchActive();
    if (!a || (tool !== 'line' && tool !== 'bus') || e.button !== 0) return false;
    const id = target && target.dataset.st;
    if (!id) {
      if (target) return false;
      C.toast(C.t('patClickStation'));
      return true;
    }
    if (!C.getMap().stations[id]) return false;
    if (a.branch[a.branch.length - 1] !== id) { C.checkpoint(); a.branch.push(id); }
    C.setSelection({ type: 'line', id: a.line.id });
    C.changed();
    return true;
  });

  X.keydown.push((e) => {
    if (e.key === 'Escape' && active && !document.querySelector('dialog[open]')) { active = null; }
    return false;
  });

  X.ready.push((api) => {
    C = api;
    const dlg = document.getElementById('settingsDialog'), anchor = document.getElementById('setFreq');
    if (!dlg || !anchor) return;
    const row = document.createElement('label');
    row.className = 'switch-row';
    row.innerHTML = '<span data-t="freqWeight"></span><input id="setFreqWeight" type="checkbox" role="switch" class="switch">';
    anchor.closest('label').after(row);
    row.firstChild.textContent = C.t('freqWeight');
    const box = row.querySelector('input');
    box.addEventListener('input', () => { C.getSettings().freqWeight = box.checked; C.saveSettings(); C.render(); });
    new MutationObserver(() => { if (dlg.open) box.checked = !!C.getSettings().freqWeight; }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  });
})();
