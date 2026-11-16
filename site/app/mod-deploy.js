// mod-deploy.js: "Deploy" dialog. Publishes the editor as a static website to several kinds of host.
// One UI serves both the web editor (browser backend: ZIP, folder, GitHub Pages) and the desktop deploy app
// (window.deployApi backend: all five targets). See docs/features/deploy.md.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const hooks = (n) => (X[n] = X[n] || []);
  const core = window.GMMCDeployCore;
  const RELEASES = 'https://github.com/Ding-Ding-Projects/gtha-metro-map-creator/releases/latest';
  const IDS = ['docker', 'builtin', 'ssh', 'pages', 'folder'];
  const STORE = 'gmmc.deploy.v1'; const STORE_TOKEN = 'gmmc.deploy.token';

  window.I18N.add({
    dp_menu: 'Deploy…', dp_title: 'Put your map online, everywhere at once', dp_bar: 'Deploy your map', dp_close: 'Close', dp_lang: 'Language',
    dp_mapCurrent: 'Start with my current map', dp_mapStd: 'Map: the standard GTHA map', dp_mapIs: 'Map', dp_version: 'version', dp_pick: 'pick where it goes, then press Deploy',
    dp_chooseMap: 'Choose map', dp_clearMap: 'Use the standard map', dp_mapBad: 'The chosen map could not be used',
    dp_settings: 'Settings', dp_retry: 'Retry', dp_cancel: 'Cancel', dp_open: 'Open', dp_copy: 'Copy', dp_copied: 'Copied', dp_again: 'Download again', dp_reveal: 'Open folder',
    dp_showLog: 'Show log', dp_hideLog: 'Hide log', dp_copyAll: 'Copy all links', dp_noLinks: 'There are no live links yet.',
    dp_deployN: 'Deploy to {n} places', dp_deployOne: 'Deploy to 1 place', dp_deployNone: 'Tick a place first',
    dp_idle: 'Ready', dp_skipped: 'Skipped', dp_running: 'Working', dp_live: 'Live', dp_failed: 'Failed', dp_signin: 'Needs sign-in', dp_unavailable: 'Not available here',
    dp_sumLive: 'live', dp_sumWork: 'working', dp_sumFail: 'failed', dp_sumWait: 'waiting for you', dp_sumNone: 'Nothing deployed yet',
    dp_t_docker: 'This computer with Docker', dp_d_docker: 'Container image from GitHub, your home network',
    dp_t_builtin: 'This computer, no Docker', dp_d_builtin: 'Built-in web server, your home network',
    dp_t_ssh: 'Remote server over SSH', dp_d_ssh: 'A server you can sign in to with a key, running Docker Compose',
    dp_t_pages: 'GitHub Pages', dp_d_pages: 'A public website on github.io',
    dp_t_folder: 'Folder or ZIP', dp_d_folder: 'Static website for any web host',
    dp_why_server: 'Needs the desktop deploy app. Browsers cannot start servers.', dp_why_ssh: 'Needs the desktop deploy app. Browsers cannot open SSH connections.',
    dp_getApp: 'Get the desktop deploy app', dp_noPicker: 'This browser cannot write to a folder, so a ZIP file is used.',
    dp_f_port: 'Port', dp_f_tag: 'Image version tag', dp_f_keep: 'Keep running after closing this window (the app stays in the tray)',
    dp_keepNote: 'With this off, the server stops when you close the app. With it on, closing the window hides it to the tray; quit from the tray icon to stop the server.',
    dp_stopServer: 'Stop the server', dp_f_host: 'Server name or address', dp_f_user: 'User name', dp_f_sshPort: 'SSH port', dp_f_folder: 'Remote folder',
    dp_f_key: 'Key file (optional, otherwise ssh-agent)', dp_f_webPort: 'Website port', dp_sshNote: 'Uses the Windows OpenSSH client with key login only. No password is typed here.',
    dp_f_repo: 'Repository (owner/name)', dp_pagesNote: 'The repository is created as public if it does not exist. The site is published from the gh-pages branch.',
    dp_signIn: 'Sign in with GitHub', dp_signedIn: 'Signed in as', dp_signOut: 'Sign out', dp_cliFound: 'The GitHub CLI is signed in as',
    dp_signInHelpDesk: 'Sign in once with your GitHub account. The key is kept by Windows, never in a file.',
    dp_signInHelpWeb: 'Paste a fine-grained token. It stays in this page\'s memory and goes only to api.github.com.',
    dp_tokenLabel: 'Fine-grained personal access token', dp_tokenHelp: 'Needs read and write for Contents, Administration and Pages on the repository. Create one at github.com/settings/personal-access-tokens.',
    dp_remember: 'Remember on this device (stored unencrypted in this browser)', dp_saveToken: 'Sign in', dp_noEnc: 'Windows protection is not available, so a token cannot be saved. Use the GitHub CLI instead.',
    dp_f_mode: 'Write', dp_m_folder: 'A folder', dp_m_zip: 'A ZIP file', dp_f_path: 'Where', dp_browse: 'Browse',
    dp_zipDone: 'ZIP file downloaded', dp_folderDone: 'Written to the folder you chose'
  }, {
    dp_menu: '部署……', dp_title: '一次過，將地圖放上所有地方', dp_bar: '部署你嘅地圖', dp_close: '關閉', dp_lang: '語言',
    dp_mapCurrent: '用我而家嘅地圖做起始地圖', dp_mapStd: '地圖：標準 GTHA 地圖', dp_mapIs: '地圖', dp_version: '版本', dp_pick: '揀好放邊度，再㩒「部署」',
    dp_chooseMap: '揀地圖', dp_clearMap: '用返標準地圖', dp_mapBad: '用唔到你揀嘅地圖',
    dp_settings: '設定', dp_retry: '再試', dp_cancel: '取消', dp_open: '打開', dp_copy: '複製', dp_copied: '已複製', dp_again: '再下載一次', dp_reveal: '打開資料夾',
    dp_showLog: '睇記錄', dp_hideLog: '收埋記錄', dp_copyAll: '複製所有連結', dp_noLinks: '暫時未有可用連結。',
    dp_deployN: '部署到 {n} 個地方', dp_deployOne: '部署到 1 個地方', dp_deployNone: '請先剔一個地方',
    dp_idle: '準備好', dp_skipped: '略過', dp_running: '處理緊', dp_live: '已上線', dp_failed: '失敗', dp_signin: '要登入', dp_unavailable: '呢度用唔到',
    dp_sumLive: '個已上線', dp_sumWork: '個處理緊', dp_sumFail: '個失敗', dp_sumWait: '個等你處理', dp_sumNone: '未部署過',
    dp_t_docker: '呢部電腦，用 Docker', dp_d_docker: '由 GitHub 下載容器映像，喺屋企網絡用',
    dp_t_builtin: '呢部電腦，唔使 Docker', dp_d_builtin: '內置網頁伺服器，喺屋企網絡用',
    dp_t_ssh: '遠端伺服器（SSH）', dp_d_ssh: '用密鑰登入嘅伺服器，行 Docker Compose',
    dp_t_pages: 'GitHub Pages', dp_d_pages: 'github.io 上面嘅公開網站',
    dp_t_folder: '資料夾或 ZIP', dp_d_folder: '靜態網站，任何網頁主機都用得',
    dp_why_server: '要用桌面部署程式。瀏覽器開唔到伺服器。', dp_why_ssh: '要用桌面部署程式。瀏覽器開唔到 SSH 連線。',
    dp_getApp: '下載桌面部署程式', dp_noPicker: '呢個瀏覽器寫唔到資料夾，所以改用 ZIP 檔案。',
    dp_f_port: '連接埠', dp_f_tag: '映像版本標籤', dp_f_keep: '關閉視窗後繼續行（程式留喺系統匣）',
    dp_keepNote: '關咗呢個選項，關閉程式伺服器就會停。開咗之後，關視窗只係收埋去系統匣；要停伺服器就喺系統匣圖示退出。',
    dp_stopServer: '停止伺服器', dp_f_host: '伺服器名稱或地址', dp_f_user: '用戶名稱', dp_f_sshPort: 'SSH 連接埠', dp_f_folder: '遠端資料夾',
    dp_f_key: '密鑰檔案（可選，否則用 ssh-agent）', dp_f_webPort: '網站連接埠', dp_sshNote: '用 Windows 內置嘅 OpenSSH，只用密鑰登入，唔會喺度輸入密碼。',
    dp_f_repo: '儲存庫（擁有者/名稱）', dp_pagesNote: '儲存庫如果未有，會建立做公開。網站會由 gh-pages 分支發佈。',
    dp_signIn: '用 GitHub 登入', dp_signedIn: '已登入為', dp_signOut: '登出', dp_cliFound: 'GitHub CLI 已登入為',
    dp_signInHelpDesk: '用你嘅 GitHub 帳戶登入一次。金鑰由 Windows 保管，唔會存喺檔案入面。',
    dp_signInHelpWeb: '貼上細粒度權杖。佢只留喺呢個頁面嘅記憶體，只會傳去 api.github.com。',
    dp_tokenLabel: '細粒度個人存取權杖', dp_tokenHelp: '要有該儲存庫嘅內容、管理同 Pages 讀寫權限。可以喺 github.com/settings/personal-access-tokens 建立。',
    dp_remember: '喺呢部裝置記住（未加密，存喺呢個瀏覽器）', dp_saveToken: '登入', dp_noEnc: 'Windows 保護功能用唔到，所以儲存唔到權杖。請改用 GitHub CLI。',
    dp_f_mode: '輸出', dp_m_folder: '資料夾', dp_m_zip: 'ZIP 檔案', dp_f_path: '位置', dp_browse: '瀏覽',
    dp_zipDone: 'ZIP 檔案已下載', dp_folderDone: '已寫入你揀嘅資料夾'
  });
  const t = (k) => window.I18N.t(k);

  const DEFAULTS = {
    docker: { port: 8080, tag: 'latest' }, builtin: { port: 8090, keepRunning: false },
    ssh: { host: '', user: '', sshPort: 22, folder: '~/gtha-map', key: '', port: 8080, tag: 'latest' },
    pages: { repo: '' }, folder: { mode: 'zip', path: '' }
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const button = (label, cls, fn) => { const b = el('button', 'dp-btn ' + (cls || ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };

  // ---------------------------------------------------------------- browser backend
  function webBackend(G) {
    let token = ''; let listener = () => {}; let logger = () => {}; const aborts = new Map();
    const hasPicker = typeof window.showDirectoryPicker === 'function';
    try { token = localStorage.getItem(STORE_TOKEN) || ''; } catch { token = ''; }
    const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch { return {}; } };
    const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage unavailable */ } };

    const siteRoot = () => { const u = new URL(location.href); u.hash = ''; u.search = ''; u.pathname = u.pathname.replace(/[^/]*$/, '').replace(/app\/$/, ''); return u.href; };
    async function fetchBytes(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('Could not read ' + url.replace(siteRoot(), '') + ' (' + r.status + ').'); return new Uint8Array(await r.arrayBuffer()); }
    // The file list: the build writes site-manifest.json. A plain source copy has none, so its files are discovered from the pages.
    async function listSite() {
      const root = siteRoot();
      try {
        const r = await fetch(root + 'site-manifest.json', { cache: 'no-store' });
        if (r.ok) { const m = await r.json(); if (Array.isArray(m.files) && m.files.length) return { root, rels: m.files.filter((f) => typeof f === 'string' && !f.startsWith('/') && !f.includes('..')), crawled: false }; }
      } catch { /* fall through to discovery */ }
      const seen = new Set(); const queue = ['index.html', 'app/index.html', 'docs/index.html'];
      while (queue.length && seen.size < 400) {
        const rel = queue.shift(); if (seen.has(rel)) continue;
        let res; try { res = await fetch(root + rel, { cache: 'no-store' }); } catch { continue; }
        if (!res.ok) continue; seen.add(rel);
        if (!/\.(html|css|js)$/.test(rel)) continue;
        const text = await res.text(); const dir = rel.replace(/[^/]*$/, '');
        const found = [];
        if (rel.endsWith('.html')) for (const m of text.matchAll(/(?:href|src)="([^"#?:]+)/g)) found.push(m[1]);
        if (rel.endsWith('.css')) for (const m of text.matchAll(/url\(\s*['"]?([^'")#?:]+)/g)) found.push(m[1]);
        if (rel.endsWith('.js')) for (const m of text.matchAll(/['"]([\w./-]+\.(?:js|css|json|png|svg|woff2?))['"]/g)) found.push(m[1]);
        for (const f of found) {
          const parts = (f.startsWith('/') ? f.slice(1) : dir + f).split('/'); const out = [];
          for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
          const n = out.join('/'); if (n && !n.endsWith('/') && !seen.has(n)) queue.push(n);
          else if (f.endsWith('/')) queue.push((out.join('/') + '/index.html').replace(/^\//, ''));
        }
      }
      return { root, rels: Array.from(seen).filter((r) => r !== 'site-manifest.json').sort(), crawled: true };
    }
    async function siteFiles(ctx) {
      const { root, rels, crawled } = await listSite();
      if (crawled) ctx.log('No site-manifest.json here: found ' + rels.length + ' files from the pages.');
      const files = rels.filter((r) => r !== core.MAP_NAME && r !== 'site-manifest.json').map((rel) => ({ rel, bytes: () => fetchBytes(root + rel) }));
      if (!files.some((f) => f.rel === 'index.html') || !files.some((f) => f.rel === 'app/index.html')) throw new Error('The editor files could not be read from this page. Open the editor from a web server, not from a file.');
      if (ctx.mapText) files.push({ rel: core.MAP_NAME, bytes: async () => new TextEncoder().encode(ctx.mapText) });
      return files;
    }
    const deflateRaw = typeof CompressionStream === 'function' ? async (u8) => { const cs = new CompressionStream('deflate-raw'); const w = cs.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); } : null;
    function zipNames(u8) {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = u8.length - 22;
      while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
      if (e < 0) throw new Error('The ZIP file is damaged.');
      const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const names = [];
      for (let i = 0; i < n; i++) { const len = dv.getUint16(p + 28, true); const ex = dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true); names.push(new TextDecoder().decode(u8.subarray(p + 46, p + 46 + len))); p += 46 + len + ex; }
      return names;
    }
    const slug = () => ((G && G.getMap().title) || 'gtha-map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'gtha-map';

    async function deployZip(ctx) {
      ctx.emit(10, 'Collecting the site files');
      const files = await siteFiles(ctx);
      ctx.emit(40, 'Building the ZIP file');
      const zip = await core.buildZip(files, deflateRaw);
      const names = zipNames(zip);
      for (const need of ['index.html', 'app/index.html'].concat(ctx.mapText ? [core.MAP_NAME] : [])) if (!names.includes(need)) throw new Error('The ZIP file is missing ' + need + '.');
      const name = slug() + '-website.zip'; const blob = new Blob([zip], { type: 'application/zip' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      ctx.log('Built ' + names.length + ' files, ' + zip.length + ' bytes: ' + name);
      return { links: [{ label: name + ' (' + names.length + ' files, ' + Math.round(zip.length / 1024) + ' KB)', url: '', kind: 'download', blob, name }], note: t('dp_zipDone') };
    }
    async function deployFolder(ctx, dir) {
      ctx.emit(10, 'Collecting the site files');
      const files = await siteFiles(ctx);
      let i = 0;
      for (const f of files) {
        const parts = f.rel.split('/'); let d = dir;
        for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
        const fh = await d.getFileHandle(parts[parts.length - 1], { create: true }); const w = await fh.createWritable(); await w.write(await f.bytes()); await w.close();
        i++; ctx.emit(10 + Math.round((i / files.length) * 85), 'Writing files ' + i + ' of ' + files.length);
      }
      const sub = await dir.getDirectoryHandle('app'); const idx = await (await sub.getFileHandle('index.html')).getFile();
      if (!idx.size) throw new Error('The copy finished but app/index.html is empty.');
      return { links: [{ label: dir.name + ' (' + files.length + ' files)', url: '', kind: 'text' }], note: t('dp_folderDone') };
    }
    async function deployPages(ctx, s) {
      if (!token) throw new Error('Not signed in. Choose Sign in with GitHub, then deploy again.');
      core.parseRepo(s.repo);
      const files = await siteFiles(ctx);
      return core.publishPages({ token, repo: s.repo, files, emit: ctx.emit, log: ctx.log, signal: ctx.signal });
    }

    return {
      kind: 'web', hasPicker,
      caps(id) {
        if (id === 'docker' || id === 'builtin') return { ok: false, reason: t('dp_why_server') };
        if (id === 'ssh') return { ok: false, reason: t('dp_why_ssh') };
        return { ok: true };
      },
      async init() {
        const s = load(); const settings = {}; for (const id of IDS) settings[id] = Object.assign({}, DEFAULTS[id], (s.settings || {})[id] || {});
        if (!hasPicker) settings.folder.mode = 'zip';
        const ticked = {}; for (const id of IDS) ticked[id] = this.caps(id).ok && (s.ticked && id in s.ticked ? !!s.ticked[id] : id === 'folder');
        return { ticked, settings, useMap: s.useMap !== false, version: '', rememberToken: !!token && !!localStorage.getItem(STORE_TOKEN) };
      },
      save(state) { save({ ticked: state.ticked, settings: state.settings, useMap: state.useMap }); },
      mapText() { try { return G ? core.checkMapText(G.projectJson()) : null; } catch { return null; } },
      mapTitle() { return G ? G.getMap().title : ''; },
      onStatus(fn) { listener = fn; }, onLog(fn) { logger = fn; },
      start(id, st) {
        const ctl = new AbortController(); aborts.set(id, ctl);
        const emit = (pct, msg) => listener({ id, state: 'running', pct, msg });
        const ctx = { emit, log: (l) => logger({ id, line: l }), signal: ctl.signal, mapText: st.useMap ? this.mapText() : null };
        listener({ id, state: 'running', pct: 2, msg: 'Starting', links: [], error: '', note: '' });
        // A folder must be chosen inside the click that started the deployment, so ask for it before any other await.
        const run = id === 'folder' ? (st.settings.folder.mode === 'folder' && hasPicker ? window.showDirectoryPicker({ mode: 'readwrite' }).then((dir) => deployFolder(ctx, dir)) : deployZip(ctx))
          : id === 'pages' ? deployPages(ctx, st.settings.pages) : Promise.reject(new Error(this.caps(id).reason));
        return run.then((res) => { if (ctl.signal.aborted) throw new Error('Cancelled.'); listener({ id, state: 'live', pct: 100, msg: 'Live', links: res.links, note: res.note || '' }); })
          .catch((e) => { const msg = e && e.name === 'AbortError' ? 'The folder was not chosen.' : ctl.signal.aborted ? 'Cancelled.' : String((e && e.message) || e).slice(0, 600); logger({ id, line: 'Failed: ' + msg }); listener({ id, state: 'failed', pct: 0, msg: '', error: msg }); })
          .finally(() => aborts.delete(id));
      },
      cancel(id) { const c = aborts.get(id); if (c) c.abort(); },
      gh: {
        async status() { return { stored: !!token, cli: false, login: token ? '…' : '' }; },
        async saveToken(tok, remember) {
          let clean; try { clean = core.checkToken(tok); } catch (e) { return { ok: false, error: e.message }; }
          try { const login = await core.whoami(clean); token = clean; try { if (remember) localStorage.setItem(STORE_TOKEN, clean); else localStorage.removeItem(STORE_TOKEN); } catch { /* storage unavailable */ } this.login = login; return { ok: true, login }; } catch (e) { return { ok: false, error: e.message }; }
        },
        async signOut() { token = ''; try { localStorage.removeItem(STORE_TOKEN); } catch { /* storage unavailable */ } this.login = ''; },
        login: '', web: true, encryption: true
      },
      open(url) { window.open(url, '_blank', 'noopener'); },
      async copy(text) { try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ } },
      download(link) { const a = document.createElement('a'); a.href = URL.createObjectURL(link.blob); a.download = link.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); }
    };
  }

  // ---------------------------------------------------------------- desktop backend (window.deployApi)
  function desktopBackend(api) {
    let initData = null;
    return {
      kind: 'desktop', hasPicker: true,
      caps() { return { ok: true }; },
      async init() { initData = await api.init(); return { ticked: initData.state.ticked, settings: initData.state.settings, useMap: true, version: initData.version, mapName: initData.mapName, mapError: initData.mapError, lang: initData.state.lang, builtinRunning: initData.builtinRunning, encryption: initData.encryption }; },
      save(state) { api.saveState({ lang: window.I18N.getLang(), ticked: state.ticked, settings: state.settings }); },
      onStatus(fn) { api.onStatus(fn); }, onLog(fn) { api.onLog(fn); },
      start(id) { return api.deploy(id); }, cancel(id) { api.cancel(id); },
      chooseMap: () => api.chooseMap(), clearMap: () => api.clearMap(), pickPath: (m) => api.pickPath(m), builtinStop: () => api.builtinStop(),
      gh: {
        async status() { return api.ghStatus(); },
        async saveToken(tok) { return api.ghSaveToken(tok); },
        async signOut() { return api.ghSignOut(); }, web: false, encryption: initData ? initData.encryption : true
      },
      open: (u) => api.open(u), copy: (x) => api.copy(x), download() { /* not used on the desktop */ }
    };
  }

  // ---------------------------------------------------------------- the interface
  function mount(root, backend, opts) {
    opts = opts || {};
    const st = { ticked: {}, settings: {}, status: {}, useMap: true, version: '', mapName: '', mapError: '', logOpen: false, gh: { stored: false, cli: false, login: '' }, logLines: [] };
    const refs = {};
    const desk = backend.kind === 'desktop';
    const persist = () => backend.save(st);
    const pagesNeedsSignIn = () => st.ticked.pages && !(st.gh.stored || st.gh.cli);

    const FIELDS = {
      docker: [['port', 'number', 'dp_f_port', { min: 1024, max: 65535 }], ['tag', 'text', 'dp_f_tag', {}]],
      builtin: [['port', 'number', 'dp_f_port', { min: 1024, max: 65535 }], ['keepRunning', 'check', 'dp_f_keep', { wide: true }]],
      ssh: [['host', 'text', 'dp_f_host', {}], ['user', 'text', 'dp_f_user', {}], ['sshPort', 'number', 'dp_f_sshPort', { min: 1, max: 65535 }], ['folder', 'text', 'dp_f_folder', {}],
        ['port', 'number', 'dp_f_webPort', { min: 1024, max: 65535 }], ['tag', 'text', 'dp_f_tag', {}], ['key', 'text', 'dp_f_key', { wide: true }]],
      pages: [['repo', 'text', 'dp_f_repo', { wide: true, placeholder: 'your-name/my-metro-map' }]],
      folder: desk ? [['mode', 'select', 'dp_f_mode', {}], ['path', 'path', 'dp_f_path', { wide: true }]] : [['mode', 'select', 'dp_f_mode', {}]]
    };
    const SUB = {
      docker: () => t('dp_d_docker') + ', ' + t('dp_f_port').toLowerCase() + ' ' + st.settings.docker.port, builtin: () => t('dp_d_builtin') + ', ' + t('dp_f_port').toLowerCase() + ' ' + st.settings.builtin.port,
      ssh: () => (st.settings.ssh.host ? (st.settings.ssh.user || '?') + '@' + st.settings.ssh.host + ', ' + st.settings.ssh.folder : t('dp_d_ssh')),
      pages: () => (st.settings.pages.repo ? st.settings.pages.repo + ', ' + t('dp_d_pages') : t('dp_d_pages')), folder: () => t('dp_d_folder')
    };

    function buildCard(id) {
      const r = refs[id] = {};
      const card = el('section', 'dp-card'); card.dataset.target = id;
      const head = el('div', 'dp-card-head');
      r.check = document.createElement('input'); r.check.type = 'checkbox'; r.check.id = 'dp-tick-' + id;
      r.check.addEventListener('change', () => { st.ticked[id] = r.check.checked; persist(); renderAll(); });
      const title = el('div', 'dp-card-title'); r.label = el('label'); r.label.htmlFor = r.check.id; r.sub = el('span', 'dp-hint'); title.append(r.label, r.sub);
      r.chip = el('span', 'dp-chip'); r.chip.setAttribute('role', 'status');
      head.append(r.check, title, r.chip);
      r.why = el('p', 'dp-why'); r.whyLink = el('a', 'dp-why-link'); r.whyLink.href = RELEASES; r.whyLink.target = '_blank'; r.whyLink.rel = 'noopener';
      r.links = el('div', 'dp-links');
      r.progress = el('div', 'dp-progress'); r.progress.append(document.createElement('i')); r.progress.setAttribute('role', 'progressbar'); r.progress.setAttribute('aria-valuemin', '0'); r.progress.setAttribute('aria-valuemax', '100');
      r.msg = el('p', 'dp-msg'); r.err = el('p', 'dp-err'); r.err.setAttribute('role', 'alert'); r.note = el('p', 'dp-note');
      r.actions = el('div', 'dp-row dp-indent');
      card.append(head, r.why, r.links, r.progress, r.msg, r.err, r.note, r.actions);
      if (id === 'pages') { r.signin = el('div', 'dp-indent'); card.append(r.signin); }
      r.set = el('details', 'dp-set'); r.setSum = el('summary'); r.fields = el('div', 'dp-fields'); r.set.append(r.setSum, r.fields); card.append(r.set);
      buildFields(id);
      return card;
    }
    function buildFields(id) {
      const r = refs[id]; r.inputs = {}; r.fieldLabels = {};
      for (const [key, type, lk, extra] of FIELDS[id]) {
        const wrap = el('label', 'dp-field' + (extra.wide ? ' wide' : '') + (type === 'check' ? ' check' : ''));
        const text = el('span'); r.fieldLabels[key] = [text, lk]; let input;
        const commit = () => { st.settings[id][key] = type === 'check' ? input.checked : type === 'number' ? Number(input.value) : input.value; persist(); renderCard(id); };
        if (type === 'select') {
          input = document.createElement('select');
          for (const [v, k] of [['zip', 'dp_m_zip'], ['folder', 'dp_m_folder']]) { if (v === 'folder' && !backend.hasPicker) continue; const o = document.createElement('option'); o.value = v; o.dataset.t = k; input.append(o); }
        } else if (type === 'path') {
          const row = el('div', 'dp-row'); input = document.createElement('input'); input.type = 'text'; input.spellcheck = false;
          r.browse = button('', 'sm', async () => { const p = await backend.pickPath(st.settings.folder.mode); if (p && p.path) { input.value = p.path; st.settings.folder.path = p.path; persist(); } });
          wrap.append(text); row.append(input, r.browse); wrap.append(row); r.inputs[key] = input; input.addEventListener('change', commit); r.fields.append(wrap); continue;
        } else { input = document.createElement('input'); input.type = type === 'number' ? 'number' : type === 'check' ? 'checkbox' : 'text'; if (type === 'text') input.spellcheck = false; }
        if (extra.min !== undefined) { input.min = extra.min; input.max = extra.max; }
        if (extra.placeholder) input.placeholder = extra.placeholder;
        input.addEventListener('change', commit); r.inputs[key] = input;
        if (type === 'check') wrap.append(input, text); else wrap.append(text, input);
        r.fields.append(wrap);
      }
      for (const [k, cls] of [['sshNote', 'ssh'], ['pagesNote', 'pages'], ['keepNote', 'builtin'], ['noPickerNote', 'folder']]) if (cls === id) { r[k] = el('p', 'dp-hint wide'); r.fields.append(r[k]); }
    }

    function chipFor(id) {
      const caps = backend.caps(id); const s = st.status[id] || { state: 'idle' };
      if (!caps.ok) return { cls: 'idle', text: t('dp_unavailable') };
      if (s.state === 'running') return { cls: '', text: t('dp_running') + (s.pct ? ' ' + Math.round(s.pct) + '%' : ''), spin: true };
      if (s.state === 'live') return { cls: 'live', text: '✓ ' + t('dp_live') };
      if (s.state === 'failed') return { cls: 'failed', text: t('dp_failed') };
      if (!st.ticked[id]) return { cls: 'idle', text: t('dp_skipped') };
      if (id === 'pages' && pagesNeedsSignIn()) return { cls: '', text: t('dp_signin') };
      return { cls: 'idle', text: t('dp_idle') };
    }

    function renderCard(id) {
      const r = refs[id]; const s = st.status[id] || { state: 'idle' }; const set = st.settings[id]; const caps = backend.caps(id);
      r.label.textContent = t('dp_t_' + id); r.sub.textContent = SUB[id]();
      r.check.checked = !!st.ticked[id] && caps.ok; r.check.disabled = !caps.ok || s.state === 'running';
      const c = chipFor(id); r.chip.className = 'dp-chip ' + c.cls; r.chip.textContent = ''; if (c.spin) r.chip.append(el('span', 'dp-spin')); r.chip.append(document.createTextNode(c.text));
      r.why.hidden = caps.ok; r.why.textContent = ''; if (!caps.ok) { r.why.append(document.createTextNode(caps.reason + ' ')); r.whyLink.textContent = t('dp_getApp'); r.why.append(r.whyLink); }
      r.set.hidden = !caps.ok; r.setSum.textContent = t('dp_settings');
      for (const [, [node, lk]] of Object.entries(r.fieldLabels)) node.textContent = t(lk);
      for (const [key, input] of Object.entries(r.inputs)) { if (document.activeElement === input) continue; if (input.type === 'checkbox') input.checked = !!set[key]; else input.value = set[key] ?? ''; }
      for (const o of r.fields.querySelectorAll('option')) o.textContent = t(o.dataset.t);
      if (r.browse) r.browse.textContent = t('dp_browse');
      if (r.sshNote) r.sshNote.textContent = t('dp_sshNote'); if (r.pagesNote) r.pagesNote.textContent = t('dp_pagesNote'); if (r.keepNote) r.keepNote.textContent = t('dp_keepNote');
      if (r.noPickerNote) { r.noPickerNote.textContent = backend.hasPicker ? '' : t('dp_noPicker'); r.noPickerNote.hidden = backend.hasPicker; }
      r.links.textContent = '';
      if (s.state === 'live') for (const l of s.links || []) {
        const row = el('div', 'dp-link'); const u = el('span', 'dp-url', l.kind === 'url' || l.kind === 'path' ? l.url : l.label); u.title = l.label;
        row.append(u);
        if (l.kind === 'url' || l.kind === 'path') row.append(button(t('dp_copy'), 'sm', async (e) => { await backend.copy(l.url); e.target.textContent = t('dp_copied'); setTimeout(() => { e.target.textContent = t('dp_copy'); }, 1200); }), button(l.kind === 'path' ? t('dp_reveal') : t('dp_open'), 'sm', () => backend.open(l.url)));
        if (l.kind === 'download') row.append(button(t('dp_again'), 'sm', () => backend.download(l)));
        r.links.append(row);
      }
      const running = s.state === 'running';
      r.progress.hidden = !running; r.progress.firstChild.style.width = (s.pct || 0) + '%'; r.progress.setAttribute('aria-valuenow', String(Math.round(s.pct || 0))); r.progress.setAttribute('aria-label', t('dp_t_' + id));
      r.msg.hidden = !running; r.msg.textContent = running ? s.msg || '' : '';
      r.err.hidden = s.state !== 'failed'; r.err.textContent = s.state === 'failed' ? s.error : '';
      r.note.hidden = !(s.state === 'live' && s.note); r.note.textContent = s.state === 'live' ? s.note || '' : '';
      r.actions.textContent = '';
      if (running) r.actions.append(button(t('dp_cancel'), 'sm', () => backend.cancel(id)));
      if (s.state === 'failed') r.actions.append(button(t('dp_retry'), 'sm tonal', () => start(id)));
      if (id === 'builtin' && s.state === 'live' && desk) r.actions.append(button(t('dp_stopServer'), 'sm', () => backend.builtinStop()));
      r.actions.hidden = !r.actions.childNodes.length;
      if (id === 'pages') renderSignIn();
    }

    function renderSignIn() {
      const r = refs.pages; r.signin.textContent = ''; const g = st.gh; const wasOpen = r.signinOpen;
      if (g.stored || g.cli) {
        const row = el('div', 'dp-row'); row.append(el('span', 'dp-hint', (g.stored ? t('dp_signedIn') : t('dp_cliFound')) + ' ' + (g.login || '')));
        if (g.stored) row.append(button(t('dp_signOut'), 'sm', async () => { await backend.gh.signOut(); await refreshGh(); }));
        r.signin.append(row); return;
      }
      const row = el('div', 'dp-row'); row.append(el('span', 'dp-hint grow', backend.gh.web ? t('dp_signInHelpWeb') : t('dp_signInHelpDesk')));
      const form = el('div', 'dp-fields'); form.hidden = !wasOpen;
      const wrap = el('label', 'dp-field wide'); wrap.append(el('span', '', t('dp_tokenLabel')));
      const input = document.createElement('input'); input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false; input.id = 'dp-token'; wrap.append(input);
      const msg = el('p', 'dp-hint wide', backend.gh.encryption ? t('dp_tokenHelp') : t('dp_noEnc')); msg.id = 'dp-token-msg';
      let remember = null;
      if (backend.gh.web) { const rw = el('label', 'dp-field check wide'); remember = document.createElement('input'); remember.type = 'checkbox'; remember.id = 'dp-remember'; rw.append(remember, el('span', '', t('dp_remember'))); form.append(wrap, rw, msg); } else form.append(wrap, msg);
      const save = button(t('dp_saveToken'), 'sm primary', async () => {
        save.disabled = true; const res = await backend.gh.saveToken(input.value, remember && remember.checked); input.value = ''; save.disabled = false;
        if (res.ok) { r.signinOpen = false; await refreshGh(res.login); } else { msg.textContent = res.error; msg.classList.add('dp-err'); }
      });
      save.id = 'dp-token-save'; save.disabled = !backend.gh.encryption; form.append(save);
      row.append(button(t('dp_signIn'), 'sm tonal', () => { r.signinOpen = form.hidden; form.hidden = !form.hidden; if (!form.hidden) input.focus(); }));
      r.signin.append(row, form);
    }

    function renderHead() {
      const q = (s) => root.querySelector(s);
      q('.dp-title').textContent = t('dp_title'); q('.dp-barTitle').textContent = t('dp_bar');
      const line = q('.dp-mapLine'); line.textContent = '';
      if (desk) {
        line.append(document.createTextNode(st.mapName ? t('dp_mapIs') + ': ' : t('dp_mapStd'))); if (st.mapName) line.append(el('b', '', st.mapName));
        q('.dp-chooseMap').textContent = t('dp_chooseMap'); q('.dp-clearMap').textContent = t('dp_clearMap'); q('.dp-clearMap').hidden = !st.mapName && !st.mapError;
      } else {
        const title = backend.mapTitle(); line.append(document.createTextNode(t('dp_mapIs') + ': ')); line.append(el('b', '', title || '-'));
        q('.dp-useMapWrap span').textContent = t('dp_mapCurrent'); q('.dp-useMap').checked = st.useMap;
      }
      line.append(document.createTextNode((st.version ? ' · ' + t('dp_version') + ' ' + st.version : '') + ' · ' + t('dp_pick')));
      q('.dp-mapErr').hidden = !st.mapError; q('.dp-mapErr').textContent = st.mapError ? t('dp_mapBad') + ': ' + st.mapError : '';
      q('.dp-logToggle').textContent = st.logOpen ? t('dp_hideLog') : t('dp_showLog'); q('.dp-logToggle').setAttribute('aria-expanded', String(st.logOpen)); q('.dp-log').hidden = !st.logOpen;
      q('.dp-copyAll').textContent = t('dp_copyAll');
      const n = IDS.filter((i) => st.ticked[i] && backend.caps(i).ok).length; const busy = IDS.some((i) => (st.status[i] || {}).state === 'running');
      const dep = q('.dp-deployAll'); dep.textContent = n === 0 ? t('dp_deployNone') : n === 1 ? t('dp_deployOne') : t('dp_deployN').replace('{n}', n); dep.disabled = n === 0 || busy;
      const count = (s) => IDS.filter((i) => (st.status[i] || {}).state === s).length;
      const bits = []; const live = count('live'), work = count('running'), fail = count('failed'), wait = pagesNeedsSignIn() ? 1 : 0;
      if (live) bits.push(live + ' ' + t('dp_sumLive')); if (work) bits.push(work + ' ' + t('dp_sumWork')); if (fail) bits.push(fail + ' ' + t('dp_sumFail')); if (wait) bits.push(wait + ' ' + t('dp_sumWait'));
      q('.dp-summary').textContent = bits.length ? bits.join(' · ') : t('dp_sumNone');
      if (q('.dp-lang')) q('.dp-lang').value = window.I18N.getLang();
    }
    function renderAll() { renderHead(); for (const id of IDS) renderCard(id); }

    function start(id) { st.status[id] = { state: 'running', pct: 1, msg: '' }; renderAll(); return backend.start(id, st); }
    function deployAll() {
      persist();
      // No await before the calls: a folder picker must open inside this click.
      for (const id of IDS.filter((i) => st.ticked[i] && backend.caps(i).ok)) {
        if (id === 'pages' && pagesNeedsSignIn()) { st.status[id] = { state: 'failed', error: t(backend.gh.web ? 'dp_signInHelpWeb' : 'dp_signInHelpDesk') }; renderAll(); continue; }
        start(id);
      }
    }
    async function refreshGh(login) { st.gh = await backend.gh.status(); if (login) st.gh.login = login; else if (backend.gh.web && st.gh.stored) st.gh.login = backend.gh.login || st.gh.login; renderAll(); }

    root.innerHTML = '';
    const app = el('div', 'dp');
    app.innerHTML = '<div class="dp-top"><span class="dp-logo" aria-hidden="true"></span><span class="dp-barTitle"></span><span class="grow"></span></div>' +
      '<div class="dp-main"><div class="dp-head"><div class="dp-head-text"><h1 class="dp-title" tabindex="-1"></h1><p class="dp-sub dp-mapLine"></p><p class="dp-err dp-mapErr" role="alert" hidden></p></div></div>' +
      '<div class="dp-cards"></div>' +
      '<div class="dp-foot"><span class="dp-summary" role="status" aria-live="polite"></span><span class="grow"></span><button type="button" class="dp-btn text dp-logToggle" aria-expanded="false"></button><button type="button" class="dp-btn text dp-copyAll"></button><button type="button" class="dp-btn primary dp-deployAll"></button></div>' +
      '<pre class="dp-log" aria-label="Log" hidden></pre></div>';
    root.append(app);
    const top = app.querySelector('.dp-top'); const head = app.querySelector('.dp-head');
    if (desk) {
      const lang = document.createElement('select'); lang.className = 'dp-lang'; lang.setAttribute('aria-label', t('dp_lang'));
      for (const [v, l] of [['en', 'English'], ['yue', '廣東話'], ['both', 'English · 廣東話']]) { const o = document.createElement('option'); o.value = v; o.textContent = l; lang.append(o); }
      lang.addEventListener('change', () => { window.I18N.setLang(lang.value); persist(); renderAll(); document.documentElement.lang = lang.value === 'yue' ? 'yue-HK' : 'en'; });
      top.append(lang);
      const cm = button('', 'tonal dp-chooseMap', async () => { const r = await backend.chooseMap(); if (r.ok) { st.mapName = r.name; st.mapError = ''; } else if (r.error) st.mapError = r.error; renderHead(); });
      const xm = button('', 'text dp-clearMap', async () => { await backend.clearMap(); st.mapName = ''; st.mapError = ''; renderHead(); });
      head.append(cm, xm);
    } else {
      const w = el('label', 'dp-useMapWrap'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'dp-useMap';
      cb.addEventListener('change', () => { st.useMap = cb.checked; persist(); }); w.append(cb, el('span')); head.append(w);
      if (opts.onClose) top.append(button(t('dp_close'), 'text dp-close', opts.onClose));
    }
    const cards = app.querySelector('.dp-cards'); for (const id of IDS) cards.append(buildCard(id));
    app.querySelector('.dp-logToggle').addEventListener('click', () => { st.logOpen = !st.logOpen; renderHead(); });
    app.querySelector('.dp-deployAll').addEventListener('click', deployAll);
    app.querySelector('.dp-copyAll').addEventListener('click', async (e) => {
      const urls = IDS.flatMap((i) => ((st.status[i] || {}).state === 'live' ? st.status[i].links.filter((l) => l.kind === 'url' || l.kind === 'path').map((l) => l.url) : []));
      await backend.copy(urls.join('\n')); const b = e.currentTarget; b.textContent = urls.length ? t('dp_copied') : t('dp_noLinks'); setTimeout(() => { b.textContent = t('dp_copyAll'); }, 1500);
    });
    backend.onStatus((s) => { st.status[s.id] = Object.assign({}, st.status[s.id], s); renderHead(); renderCard(s.id); });
    backend.onLog((l) => { st.logLines.push('[' + l.id + '] ' + l.line); while (st.logLines.length > 300) st.logLines.shift(); const log = app.querySelector('.dp-log'); log.textContent = st.logLines.join('\n'); log.scrollTop = log.scrollHeight; });

    const api = {
      async refresh() {
        const init = await backend.init();
        Object.assign(st, { ticked: init.ticked, settings: init.settings, useMap: init.useMap, version: init.version || '', mapName: init.mapName || '', mapError: init.mapError || '' });
        if (desk && init.lang) window.I18N.setLang(init.lang);
        if (desk) backend.gh.encryption = init.encryption;
        renderAll(); refreshGh();
      },
      focus() { const h = app.querySelector('.dp-title'); if (h) h.focus(); },
      state: st
    };
    return api;
  }

  // ---------------------------------------------------------------- hooks into the editor
  function setup(G) {
    if (document.body.dataset.deployStandalone === '1') return;
    const dlg = document.createElement('dialog'); dlg.id = 'deployDialog'; dlg.className = 'dp-dialog'; dlg.setAttribute('aria-label', t('dp_menu'));
    const body = el('div', 'dialog-body dp-dialog-body'); const rootEl = el('div', 'dp-root'); body.append(rootEl); dlg.append(body); document.body.append(dlg);
    let ui = null;
    const open = async () => {
      if (!ui) ui = mount(rootEl, webBackend(G), { onClose: () => dlg.close() });
      await ui.refresh(); if (!dlg.open) dlg.showModal(); ui.focus();
    };
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    const menu = document.getElementById('exportMenu');
    if (menu && !document.getElementById('deployMenuBtn')) {
      const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'deployMenuBtn'; btn.setAttribute('role', 'menuitem');
      btn.innerHTML = '<span data-ic="public"></span><span data-t="dp_menu"></span>';
      btn.lastChild.textContent = t('dp_menu'); if (window.icon) btn.firstChild.innerHTML = window.icon('public', 24);
      const site = menu.querySelector('[data-act="site"]'); menu.insertBefore(btn, site ? site.nextSibling : null);
    }
    hooks('click').push((e) => { const b = e.target.closest && e.target.closest('#deployMenuBtn'); if (!b) return false; const m = document.getElementById('exportMenu'); if (m) m.hidden = true; const eb = document.getElementById('exportBtn'); if (eb) eb.setAttribute('aria-expanded', 'false'); open(); return true; });
    window.GMMCDeploy = { open, close: () => dlg.close() };
  }
  hooks('ready').push(setup);

  // Standalone page inside the desktop deploy app.
  window.GMMCDeployMount = async function (rootEl) {
    const ui = mount(rootEl, desktopBackend(window.deployApi), {}); await ui.refresh(); ui.focus(); return ui;
  };
})();
