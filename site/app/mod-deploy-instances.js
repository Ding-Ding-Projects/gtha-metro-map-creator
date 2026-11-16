// mod-deploy-instances.js: the "Instances" tab. Lists every instance the deploy app created (name, where,
// version, live health, link) and runs start, stop, restart, logs, update, duplicate and remove on them.
// It is a view over a backend: the desktop app's instance manager, or the web editor's local record of
// its ZIP and GitHub Pages deployments. See docs/features/deploy.md.
(function () {
  'use strict';
  const UI = window.GMMCDeployUI;
  const { el, glyph, targetGlyph, button, iconButton, textField, checkbox, chips, menu, dialog, fmtBytes } = UI;

  window.I18N.add({
    dpi_tab: 'Instances', dpi_title: 'Your instances', dpi_sub: 'Every copy this app deployed, with its own name, port, map and link. Health is checked live.',
    dpi_checkAll: 'Check all now', dpi_new: 'New instance', dpi_search: 'Search instances', dpi_clearSearch: 'Clear the search',
    dpi_f_all: 'All', dpi_f_running: 'Running', dpi_f_stopped: 'Stopped', dpi_f_updates: 'Updates', dpi_filters: 'Filter instances',
    dpi_c_name: 'Name', dpi_c_where: 'Where', dpi_c_version: 'Version', dpi_c_health: 'Health', dpi_c_link: 'Link', dpi_c_actions: 'Actions',
    dpi_healthy: 'Healthy', dpi_stopped: 'Stopped', dpi_unhealthy: 'Not answering', dpi_missing: 'Missing', dpi_unknown: 'Not checked', dpi_working: 'Working',
    dpi_checked: 'checked {t} ago', dpi_never: 'not checked yet', dpi_update: 'Update available · {v}', dpi_secs: '{n} s', dpi_mins: '{n} min', dpi_hours: '{n} h', dpi_checkedNow: 'checked just now',
    dpi_start: 'Start', dpi_stop: 'Stop', dpi_restart: 'Restart', dpi_open: 'Open', dpi_more: 'More actions', dpi_logs: 'View logs', dpi_updateBtn: 'Update', dpi_duplicate: 'Duplicate', dpi_copyLink: 'Copy link', dpi_remove: 'Remove…',
    dpi_selected: '{n} selected', dpi_selectRow: 'Select {name}', dpi_selectAll: 'Select all', dpi_none: 'Nothing deployed yet. Deploy something on the Deploy tab and it appears here.', dpi_noMatch: 'No instance matches your search or filter.',
    dpi_logsTitle: 'Logs: {name}', dpi_refresh: 'Refresh', dpi_close: 'Close', dpi_copy: 'Copy', dpi_copied: 'Copied',
    dpi_removeTitle: 'Remove “{name}”?', dpi_removeIntro: 'This will delete:', dpi_removeBtn: 'Remove', dpi_cancel: 'Cancel', dpi_removeMany: 'Remove {n} instances?', dpi_removeManyIntro: 'Each of these will be removed, with what is listed for it:',
    dpi_rm_docker: 'the container {name} and its network, found by this app\'s label (nothing else on this computer is touched)', dpi_rm_docker2: 'its compose file and starting map in this app\'s data folder. The downloaded image stays.',
    dpi_rm_builtin: 'the built-in server on port {port} (it stops now) and its saved starting map',
    dpi_rm_virtualbox: 'the VirtualBox machine {vm} and all of its disk files', dpi_rm_vmware: 'the VMware machine {vm}, its disk and its folder in this app\'s data folder',
    dpi_rm_ssh: 'the container on {host}, and the compose file and starting map this app wrote in {dir}', dpi_rm_folder: 'only this entry. The files in {path} stay where they are.', dpi_rm_pages: 'only this entry. The repository {repo} and its website stay on GitHub.', dpi_rm_web: 'only this entry in this browser. A downloaded ZIP file or a published site stays where it is.',
    dpi_dupTitle: 'Duplicate “{name}”', dpi_dupName: 'Name of the copy', dpi_dupHelp: 'The copy gets the same settings and starting map, and the next free port.', dpi_dupBtn: 'Duplicate',
    dpi_updating: 'Updating', dpi_failed: 'That did not work', dpi_dismiss: 'Dismiss', dpi_logHelp: 'Last lines', dpi_noLogs: 'No log.',
    dpi_why_web: 'Needs the desktop deploy app.', dpi_why_kind: 'Not available for this kind of instance.', dpi_why_fresh: 'Already the newest version.', dpi_ver_unknown: 'latest tag'
  }, {
    dpi_tab: '實例', dpi_title: '你嘅實例', dpi_sub: '呢個程式部署過嘅每一份，各有自己嘅名稱、連接埠、地圖同連結。健康狀況會即時檢查。',
    dpi_checkAll: '即刻檢查全部', dpi_new: '新增實例', dpi_search: '搜尋實例', dpi_clearSearch: '清除搜尋',
    dpi_f_all: '全部', dpi_f_running: '行緊', dpi_f_stopped: '已停', dpi_f_updates: '有更新', dpi_filters: '篩選實例',
    dpi_c_name: '名稱', dpi_c_where: '喺邊度', dpi_c_version: '版本', dpi_c_health: '健康狀況', dpi_c_link: '連結', dpi_c_actions: '操作',
    dpi_healthy: '正常', dpi_stopped: '已停', dpi_unhealthy: '冇回應', dpi_missing: '搵唔到', dpi_unknown: '未檢查', dpi_working: '處理緊',
    dpi_checked: '{t}前檢查', dpi_never: '未檢查過', dpi_update: '有新版本 · {v}', dpi_secs: '{n} 秒', dpi_mins: '{n} 分鐘', dpi_hours: '{n} 小時', dpi_checkedNow: '啱啱檢查過',
    dpi_start: '啟動', dpi_stop: '停止', dpi_restart: '重新啟動', dpi_open: '打開', dpi_more: '更多操作', dpi_logs: '睇記錄', dpi_updateBtn: '更新', dpi_duplicate: '複製', dpi_copyLink: '複製連結', dpi_remove: '移除……',
    dpi_selected: '已選 {n} 個', dpi_selectRow: '揀 {name}', dpi_selectAll: '全選', dpi_none: '仲未部署過任何嘢。喺「部署」分頁部署之後，就會喺度出現。', dpi_noMatch: '冇實例符合你嘅搜尋或篩選。',
    dpi_logsTitle: '記錄：{name}', dpi_refresh: '重新整理', dpi_close: '關閉', dpi_copy: '複製', dpi_copied: '已複製',
    dpi_removeTitle: '要移除「{name}」嗎？', dpi_removeIntro: '以下嘢會被刪除：', dpi_removeBtn: '移除', dpi_cancel: '取消', dpi_removeMany: '要移除 {n} 個實例嗎？', dpi_removeManyIntro: '每個實例都會連同列出嘅內容一齊移除：',
    dpi_rm_docker: '容器 {name} 同佢嘅網絡（由呢個程式嘅標籤搵出，電腦上其他嘢完全唔會郁）', dpi_rm_docker2: '喺呢個程式資料夾入面嘅 compose 檔同起始地圖。已下載嘅映像會保留。',
    dpi_rm_builtin: '連接埠 {port} 嘅內置伺服器（即刻停止）同佢儲起嘅起始地圖',
    dpi_rm_virtualbox: 'VirtualBox 虛擬機 {vm} 同佢所有磁碟檔案', dpi_rm_vmware: 'VMware 虛擬機 {vm}、佢嘅磁碟同呢個程式資料夾入面嘅虛擬機資料夾',
    dpi_rm_ssh: '{host} 上面嘅容器，同呢個程式寫喺 {dir} 嘅 compose 檔同起始地圖', dpi_rm_folder: '只係呢個項目。{path} 入面嘅檔案會原封不動。', dpi_rm_pages: '只係呢個項目。儲存庫 {repo} 同佢嘅網站會留喺 GitHub。', dpi_rm_web: '只係呢個瀏覽器入面嘅呢個項目。已下載嘅 ZIP 檔或者已發佈嘅網站會原封不動。',
    dpi_dupTitle: '複製「{name}」', dpi_dupName: '複本名稱', dpi_dupHelp: '複本會用相同設定同起始地圖，而且用下一個空閒連接埠。', dpi_dupBtn: '複製',
    dpi_updating: '更新緊', dpi_failed: '做唔到', dpi_dismiss: '收埋', dpi_logHelp: '最後幾行', dpi_noLogs: '冇記錄。',
    dpi_why_web: '要用桌面部署程式。', dpi_why_kind: '呢種實例用唔到。', dpi_why_fresh: '已經係最新版本。', dpi_ver_unknown: 'latest 標籤'
  });
  const t = (k, vars) => { let s = window.I18N.t(k); if (vars) for (const [a, b] of Object.entries(vars)) s = s.split('{' + a + '}').join(String(b)); return s; };

  const KIND_TITLE = { docker: 'dp_t_docker', builtin: 'dp_t_builtin', virtualbox: 'dp_t_virtualbox', vmware: 'dp_t_vmware', ssh: 'dp_t_ssh', pages: 'dp_t_pages', folder: 'dp_t_folder' };

  // opts: { backend (instance backend), open(url), copy(text), onNew(), setBadge(n) }
  function mount(root, B, opts) {
    const st = { list: [], q: '', filter: 'all', sel: new Set(), status: {}, error: '', checking: false };
    const refs = {};
    const kindName = (k) => window.I18N.t(KIND_TITLE[k] || 'dp_t_folder');
    const ago = (at) => {
      if (!at) return t('dpi_never');
      const s = Math.max(0, Math.round((Date.now() - at) / 1000));
      if (s < 5) return t('dpi_checkedNow');
      return t('dpi_checked', { t: s < 60 ? t('dpi_secs', { n: s }) : s < 3600 ? t('dpi_mins', { n: Math.round(s / 60) }) : t('dpi_hours', { n: Math.round(s / 3600) }) });
    };
    const stateOf = (i) => (i.busy ? 'working' : i.check && i.check.state ? i.check.state : 'unknown');
    const isRunning = (i) => ['healthy', 'unhealthy'].includes(stateOf(i)) && i.canRun;
    const isStopped = (i) => stateOf(i) === 'stopped';

    function chipFor(i) {
      const s = stateOf(i); const when = i.check && i.check.at ? ago(i.check.at) : '';
      if (s === 'working') { const m = (st.status[i.id] || {}).msg; return { cls: '', text: t('dpi_working') + (m ? ' · ' + m : ''), sub: '' }; }
      if (i.updateAvailable) return { cls: 'warn', text: t('dpi_update', { v: i.latest }), sub: s === 'healthy' ? t('dpi_healthy') + ' · ' + when : '' };
      const word = t('dpi_' + (['healthy', 'stopped', 'unhealthy', 'missing', 'unknown'].includes(s) ? s : 'unknown'));
      const cls = s === 'healthy' ? 'live' : s === 'unhealthy' || s === 'missing' ? 'failed' : 'idle';
      return { cls, text: word + (when && s !== 'unknown' ? ' · ' + when : '') };
    }
    const can = (i, act) => (B.can ? B.can(i, act) : { ok: true });
    const removeLines = (i) => {
      const r = i.run || {};
      if (B.web) return [t('dpi_rm_web')];
      switch (i.kind) {
        case 'docker': return [t('dpi_rm_docker', { name: 'gmmc-' + i.slug }), t('dpi_rm_docker2')];
        case 'builtin': return [t('dpi_rm_builtin', { port: i.port })];
        case 'virtualbox': return [t('dpi_rm_virtualbox', { vm: r.vm || i.name })];
        case 'vmware': return [t('dpi_rm_vmware', { vm: r.vm || i.name })];
        case 'ssh': return [t('dpi_rm_ssh', { host: r.host || '?', dir: r.remoteDir || '?' })];
        case 'pages': return [t('dpi_rm_pages', { repo: r.repo || i.where })];
        default: return [t('dpi_rm_folder', { path: r.path || i.where })];
      }
    };

    // ---- dialogs ----
    const logsDlg = dialog({ title: '', icon: 'logs', cls: 'wide', host: root });
    const logsPre = el('pre', 'dp-logtext'); logsPre.tabIndex = 0; logsDlg.body.append(logsPre);
    let logsFor = null;
    const logsRefresh = button('', 'text', async () => { if (logsFor) await showLogs(logsFor); });
    const logsCopy = button('', 'text', async (e) => { await opts.copy(logsPre.textContent); const b = e.currentTarget; b.setLabel(t('dpi_copied')); setTimeout(() => b.setLabel(t('dpi_copy')), 1200); });
    const logsClose = button('', 'tonal', () => logsDlg.close());
    logsDlg.actions.append(logsRefresh, logsCopy, logsClose);
    async function showLogs(i) {
      logsFor = i; logsDlg.setTitle(t('dpi_logsTitle', { name: i.name })); logsRefresh.setLabel(t('dpi_refresh')); logsCopy.setLabel(t('dpi_copy')); logsClose.setLabel(t('dpi_close'));
      logsPre.textContent = '...'; logsDlg.open();
      const r = await B.action(i.id, 'logs'); logsPre.textContent = r.ok ? r.text || t('dpi_noLogs') : r.error; logsPre.scrollTop = logsPre.scrollHeight;
    }

    const rmDlg = dialog({ title: '', icon: 'warn', tone: 'error', host: root });
    const rmList = el('ul'); const rmIntro = el('p', 'dp-modal-p'); rmDlg.body.append(rmIntro, rmList);
    const rmCancel = button('', 'text', () => rmDlg.close()); const rmGo = button('', 'danger');
    rmDlg.actions.append(rmCancel, rmGo);
    function confirmRemove(items) {
      rmList.textContent = '';
      if (items.length === 1) { rmDlg.setTitle(t('dpi_removeTitle', { name: items[0].name })); rmIntro.textContent = t('dpi_removeIntro'); for (const l of removeLines(items[0])) rmList.append(el('li', '', l)); }
      else { rmDlg.setTitle(t('dpi_removeMany', { n: items.length })); rmIntro.textContent = t('dpi_removeManyIntro'); for (const i of items) { const li = el('li'); li.append(el('b', '', i.name + ': '), document.createTextNode(removeLines(i).join(' '))); rmList.append(li); } }
      rmCancel.setLabel(t('dpi_cancel')); rmGo.setLabel(t('dpi_removeBtn'));
      rmGo.onclick = async () => { rmDlg.close(); for (const i of items) await run(i, 'remove'); st.sel.clear(); render(); };
      rmDlg.open(); rmCancel.focus();
    }

    const dupDlg = dialog({ title: '', icon: 'duplicate', host: root });
    const dupName = textField({ label: '', hint: '', wide: true }); dupDlg.body.append(dupName.root);
    const dupCancel = button('', 'text', () => dupDlg.close()); const dupGo = button('', 'primary'); dupDlg.actions.append(dupCancel, dupGo);
    function confirmDuplicate(i) {
      dupDlg.setTitle(t('dpi_dupTitle', { name: i.name })); dupName.setLabel(t('dpi_dupName')); dupName.setHint(t('dpi_dupHelp')); dupName.input.value = i.name + ' copy';
      dupCancel.setLabel(t('dpi_cancel')); dupGo.setLabel(t('dpi_dupBtn'));
      dupGo.onclick = async () => { const name = dupName.input.value.trim(); if (!name) { dupName.input.focus(); return; } dupDlg.close(); await runDup(i, name); };
      dupDlg.open(); dupName.input.focus(); dupName.input.select();
    }

    // ---- actions ----
    async function run(i, act) {
      st.error = ''; const r = await B.action(i.id, act);
      if (!r.ok) st.error = i.name + ': ' + (r.error || t('dpi_failed'));
      await reload(); return r;
    }
    async function runDup(i, name) { st.error = ''; const r = await B.duplicate(i.id, name); if (!r.ok) st.error = i.name + ': ' + (r.error || t('dpi_failed')); await reload(); }
    async function reload() { st.list = await B.list(); for (const id of Array.from(st.sel)) if (!st.list.some((x) => x.id === id)) st.sel.delete(id); render(); }
    async function checkAll() { st.checking = true; render(); try { st.list = await B.check(); } catch { /* keep the old list */ } st.checking = false; render(); }

    // ---- view ----
    const visible = () => {
      const q = st.q.trim().toLowerCase();
      return st.list.filter((i) => {
        if (st.filter === 'running' && !isRunning(i)) return false;
        if (st.filter === 'stopped' && !isStopped(i)) return false;
        if (st.filter === 'updates' && !i.updateAvailable) return false;
        return !q || [i.name, i.where, i.url, i.version, i.map, kindName(i.kind)].some((x) => String(x || '').toLowerCase().includes(q));
      });
    };

    function buildRow(i) {
      const sel = st.sel.has(i.id); const row = el('div', 'dp-trow dp-irow' + (sel ? ' sel' : '') + (i.busy ? ' busy' : '')); row.setAttribute('role', 'row'); row.dataset.id = i.id; row.dataset.kind = i.kind;
      const c0 = el('div'); c0.setAttribute('role', 'cell'); const cb = checkbox({ checked: sel, label: '', onChange: (v) => { if (v) st.sel.add(i.id); else st.sel.delete(i.id); render(); } });
      cb.input.setAttribute('aria-label', t('dpi_selectRow', { name: i.name })); cb.root.addEventListener('click', (e) => e.stopPropagation()); c0.append(cb.root);
      const c1 = el('div', 'dp-iname'); c1.setAttribute('role', 'cell'); c1.append(el('span', '', i.name)); if (i.map) c1.append(el('small', '', i.map));
      const c2 = el('div', 'dp-iwhere'); c2.setAttribute('role', 'cell'); c2.append(targetGlyph(i.kind === 'pages' ? 'pages' : i.kind, 18), el('span', '', i.where || kindName(i.kind)));
      const c3 = el('div', 'dp-iver'); c3.setAttribute('role', 'cell'); c3.textContent = i.version || (['docker', 'ssh'].includes(i.kind) && i.tag ? i.tag : '-');
      const ch = chipFor(i); const c4 = el('div', 'dp-ihealth'); c4.setAttribute('role', 'cell'); const chip = el('span', 'dp-chip ' + ch.cls, ch.text); chip.title = ch.text; c4.append(chip); if (ch.sub) c4.append(el('small', 'dp-hint', ch.sub));
      const c5 = el('div', 'dp-ilink' + (isStopped(i) || !i.url ? ' muted' : '')); c5.setAttribute('role', 'cell'); c5.textContent = i.url || '-';
      const c6 = el('div', 'dp-iact'); c6.setAttribute('role', 'cell');
      const running = isRunning(i); const busy = !!i.busy;
      if (i.canRun) { const pr = can(i, running ? 'stop' : 'start'); const b = iconButton(running ? 'stop' : 'play', pr.ok ? t(running ? 'dpi_stop' : 'dpi_start') : pr.reason, (e) => { e.stopPropagation(); run(i, running ? 'stop' : 'start'); }); b.disabled = busy || !pr.ok; c6.append(b); }
      const ob = iconButton('open', t('dpi_open'), (e) => { e.stopPropagation(); opts.open(i.url); }); ob.disabled = !i.url; c6.append(ob);
      const mb = iconButton('more', t('dpi_more'), (e) => e.stopPropagation()); mb.disabled = busy; c6.append(mb);
      menu(mb, () => [
        { label: t('dpi_restart'), icon: 'restart', disabled: !i.canRun || !can(i, 'restart').ok, title: can(i, 'restart').reason, onClick: () => run(i, 'restart') },
        { label: t('dpi_logs'), icon: 'logs', onClick: () => showLogs(i) },
        { label: t('dpi_updateBtn'), icon: 'update', disabled: !i.updateAvailable || !can(i, 'update').ok, title: can(i, 'update').reason || (!i.updateAvailable ? t('dpi_why_fresh') : ''), onClick: () => run(i, 'update') },
        { label: t('dpi_duplicate'), icon: 'duplicate', disabled: !i.canDuplicate || !can(i, 'duplicate').ok, title: can(i, 'duplicate').reason, onClick: () => confirmDuplicate(i) },
        { label: t('dpi_copyLink'), icon: 'copy', disabled: !i.url, onClick: () => opts.copy(i.url) },
        { divider: true },
        { label: t('dpi_remove'), icon: 'remove', danger: true, onClick: () => confirmRemove([i]) }
      ]);
      row.append(c0, c1, c2, c3, c4, c5, c6);
      row.addEventListener('click', () => { if (st.sel.size === 1 && st.sel.has(i.id)) st.sel.clear(); else { st.sel.clear(); st.sel.add(i.id); } render(); });
      return row;
    }

    function render() {
      const tableFocus = document.activeElement && root.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') || document.activeElement.title : '';
      root.querySelector('.dpi-title').textContent = t('dpi_title'); root.querySelector('.dpi-sub').textContent = t('dpi_sub');
      refs.checkBtn.setLabel(t('dpi_checkAll')); refs.checkBtn.disabled = st.checking; refs.newBtn.setLabel(t('dpi_new'));
      refs.search.placeholder = t('dpi_search'); refs.search.setAttribute('aria-label', t('dpi_search')); refs.clear.title = t('dpi_clearSearch'); refs.clear.setAttribute('aria-label', t('dpi_clearSearch')); refs.clear.hidden = !st.q;
      const n = st.list.length; const count = (f) => st.list.filter(f).length;
      refs.chips.setLabel('all', t('dpi_f_all'), n); refs.chips.setLabel('running', t('dpi_f_running'), count(isRunning)); refs.chips.setLabel('stopped', t('dpi_f_stopped'), count(isStopped)); refs.chips.setLabel('updates', t('dpi_f_updates'), count((i) => i.updateAvailable));
      refs.chips.root.setAttribute('aria-label', t('dpi_filters'));
      if (opts.setBadge) opts.setBadge(n);
      refs.err.hidden = !st.error; refs.err.textContent = st.error;
      const head = root.querySelector('.dp-thead'); head.textContent = '';
      const hc = el('div'); const all = checkbox({ checked: false, label: '' }); all.input.setAttribute('aria-label', t('dpi_selectAll')); hc.setAttribute('role', 'columnheader'); hc.append(all.root);
      const rows = visible(); all.input.checked = rows.length > 0 && rows.every((i) => st.sel.has(i.id));
      all.input.addEventListener('change', () => { if (all.input.checked) rows.forEach((i) => st.sel.add(i.id)); else rows.forEach((i) => st.sel.delete(i.id)); render(); });
      head.append(hc); for (const k of ['name', 'where', 'version', 'health', 'link', 'actions']) { const c = el('div', '', t('dpi_c_' + k)); c.setAttribute('role', 'columnheader'); head.append(c); }
      refs.rows.textContent = '';
      if (!rows.length) refs.rows.append(el('div', 'dp-empty', n ? t('dpi_noMatch') : t('dpi_none')));
      else for (const i of rows) refs.rows.append(buildRow(i));
      // The selection bar
      const picked = st.list.filter((i) => st.sel.has(i.id)); refs.bar.hidden = !picked.length; refs.bar.textContent = '';
      if (picked.length) {
        refs.bar.append(el('b', '', t('dpi_selected', { n: picked.length })));
        if (picked.length === 1) refs.bar.append(el('span', 'dp-hint', picked[0].name + ' · ' + (picked[0].where || kindName(picked[0].kind))));
        refs.bar.append(el('span', 'grow'));
        const one = picked.length === 1 ? picked[0] : null; const all2 = (f) => picked.every(f);
        const add = (label, cls, fn, icon, dis, why) => { const b = button(label, cls, fn, icon); b.classList.add('sm'); b.disabled = !!dis; if (why) b.title = why; refs.bar.append(b); };
        add(t('dpi_start'), '', () => runMany(picked, 'start'), 'play', !all2((i) => i.canRun && !isRunning(i)) || picked.some((i) => !can(i, 'start').ok));
        add(t('dpi_stop'), '', () => runMany(picked, 'stop'), 'stop', !all2((i) => i.canRun && isRunning(i)) || picked.some((i) => !can(i, 'stop').ok));
        add(t('dpi_restart'), '', () => runMany(picked, 'restart'), 'restart', !all2((i) => i.canRun) || picked.some((i) => !can(i, 'restart').ok));
        add(t('dpi_logs'), '', () => one && showLogs(one), 'logs', !one);
        add(t('dpi_updateBtn'), '', () => runMany(picked, 'update'), 'update', !all2((i) => i.updateAvailable) || picked.some((i) => !can(i, 'update').ok), !all2((i) => i.updateAvailable) ? t('dpi_why_fresh') : '');
        add(t('dpi_duplicate'), '', () => one && confirmDuplicate(one), 'duplicate', !one || !one.canDuplicate || !can(one, 'duplicate').ok);
        const rm = button(t('dpi_remove'), 'text dangertext', () => confirmRemove(picked)); rm.classList.add('sm'); refs.bar.append(rm);
      }
      if (tableFocus) { const again = Array.from(root.querySelectorAll('[aria-label],[title]')).find((x) => (x.getAttribute('aria-label') || x.title) === tableFocus && x.tagName !== 'DIV'); if (again && again.focus) again.focus({ preventScroll: true }); }
    }
    async function runMany(items, act) { for (const i of items) await run(i, act); }

    root.innerHTML = '';
    const pane = el('div', 'dp-pane');
    const head = el('div', 'dp-head'); const text = el('div', 'dp-head-text'); const h = el('h1', 'dp-title dpi-title'); h.tabIndex = -1; text.append(h, el('p', 'dp-sub dpi-sub'));
    const acts = el('div', 'dp-head-actions'); refs.checkBtn = button('', '', checkAll, 'refresh'); refs.newBtn = button('', 'primary', () => opts.onNew(), 'add'); acts.append(refs.checkBtn, refs.newBtn); head.append(text, acts);
    const tools = el('div', 'dp-row'); const sw = el('label', 'dp-search'); sw.append(glyph('search', 20)); refs.search = document.createElement('input'); refs.search.type = 'search'; refs.search.autocomplete = 'off'; refs.search.spellcheck = false;
    refs.clear = iconButton('close', '', () => { st.q = ''; refs.search.value = ''; render(); refs.search.focus(); }); sw.append(refs.search, refs.clear);
    refs.search.addEventListener('input', () => { st.q = refs.search.value; render(); });
    refs.chips = chips({ options: [['all', ''], ['running', ''], ['stopped', ''], ['updates', '']], value: 'all', onChange: (v) => { st.filter = v; render(); } });
    tools.append(sw, refs.chips.root);
    refs.err = el('p', 'dp-err'); refs.err.setAttribute('role', 'alert'); refs.err.hidden = true;
    const table = el('div', 'dp-table'); table.setAttribute('role', 'table'); const th = el('div', 'dp-trow dp-thead'); th.setAttribute('role', 'row'); refs.rows = el('div'); refs.rows.setAttribute('role', 'rowgroup'); refs.rows.style.display = 'flex'; refs.rows.style.flexDirection = 'column'; refs.rows.style.gap = '4px';
    table.append(th, refs.rows); refs.bar = el('div', 'dp-selbar'); refs.bar.hidden = true; refs.bar.setAttribute('role', 'region');
    pane.append(head, tools, refs.err, table, refs.bar); root.append(pane);

    B.onChange((list) => { st.list = list; render(); });
    B.onStatus((s) => { st.status[s.id] = Object.assign({}, st.status[s.id], s); render(); });
    setInterval(() => { if (root.offsetParent !== null && st.list.some((i) => i.check && i.check.at)) render(); }, 15000);

    return { refresh: async () => { await reload(); }, checkAll, focus() { const x = root.querySelector('.dpi-title'); if (x) x.focus(); }, render, state: st };
  }

  window.GMMCDeployInstances = { mount };
})();
