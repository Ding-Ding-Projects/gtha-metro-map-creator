// mod-deploy.js: "Deploy" dialog. Publishes the editor as a static website to many kinds of host, and
// lists what was deployed in an Instances tab. One UI serves both the web editor (browser backend: ZIP,
// folder, GitHub Pages) and the desktop deploy app (window.deployApi backend: all nine targets).
// See docs/features/deploy.md.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const hooks = (n) => (X[n] = X[n] || []);
  const core = window.GMMCDeployCore;
  const UI = window.GMMCDeployUI;
  const { el, glyph, targetGlyph, button, textField, selectField, switchControl, checkbox, segmented, chips, dialog, linkify, fmtBytes } = UI;
  const RELEASES = 'https://github.com/Ding-Ding-Projects/gtha-metro-map-creator/releases/latest';
  const IDS = ['docker', 'builtin', 'virtualbox', 'vmware', 'ssh', 'usb', 'rpi', 'pages', 'folder'];
  const FLASH = ['usb', 'rpi'];
  const GROUP = { docker: 'local', builtin: 'local', virtualbox: 'vm', vmware: 'vm', usb: 'flash', rpi: 'flash', ssh: 'online', pages: 'online', folder: 'online' };
  const STORE = 'gmmc.deploy.v1'; const STORE_TOKEN = 'gmmc.deploy.token'; const STORE_INST = 'gmmc.deploy.instances.v1';

  window.I18N.add({
    dp_menu: 'Deploy…', dp_title: 'Put your map online, everywhere at once', dp_bar: 'Deploy your map', dp_close: 'Close', dp_lang: 'Language', dp_tabDeploy: 'Deploy', dp_tabs: 'Deploy sections',
    dp_mapCurrent: 'Start with my current map', dp_mapStd: 'Map: the standard GTHA map', dp_mapIs: 'Map', dp_version: 'version', dp_pick: 'tick the places, then press Deploy',
    dp_chooseMap: 'Choose map', dp_clearMap: 'Use the standard map', dp_mapBad: 'The chosen map could not be used',
    dp_settings: 'Settings', dp_retry: 'Retry', dp_cancel: 'Cancel', dp_open: 'Open', dp_copy: 'Copy', dp_copied: 'Copied', dp_again: 'Download again', dp_reveal: 'Open folder',
    dp_showLog: 'Show log', dp_hideLog: 'Hide log', dp_copyAll: 'Copy all links', dp_noLinks: 'There are no live links yet.',
    dp_deployN: 'Deploy to {n} places', dp_deployOne: 'Deploy to 1 place', dp_deployNone: 'Tick a place first',
    dp_idle: 'Ready', dp_running: 'Working', dp_live: 'Live', dp_verified: 'Verified', dp_failed: 'Failed', dp_signin: 'Needs sign-in', dp_unavailable: 'Not available here',
    dp_sumLive: 'live', dp_sumWork: 'working', dp_sumFail: 'failed', dp_sumWait: 'waiting for you', dp_sumNone: 'Nothing deployed yet', dp_sumWritten: 'drive written',
    dp_g_all: 'All', dp_g_local: 'On this computer', dp_g_vm: 'Virtual machines', dp_g_flash: 'Flash a drive', dp_g_online: 'Online', dp_filters: 'Filter the places',
    dp_t_docker: 'Docker on this computer', dp_d_docker: 'Hosted web app', dp_t_builtin: 'Built-in server', dp_d_builtin: 'No Docker needed',
    dp_t_virtualbox: 'VirtualBox', dp_d_virtualbox: 'Appliance VM', dp_t_vmware: 'VMware', dp_d_vmware: 'Workstation or Player · appliance VM',
    dp_t_ssh: 'Remote server over SSH', dp_d_ssh: 'A server you can sign in to with a key, running Docker Compose',
    dp_t_usb: 'USB drive for a spare PC', dp_d_usb: 'Writes the PC appliance image', dp_t_rpi: 'Raspberry Pi', dp_d_rpi: 'SD card or USB · Pi 4 and Pi 5 · arm64',
    dp_t_pages: 'GitHub Pages', dp_d_pages: 'A public website on github.io', dp_t_folder: 'Folder or ZIP', dp_d_folder: 'Static site for any web host',
    dp_net_bridged: 'bridged network', dp_net_nat: 'NAT with a forwarded port', dp_port: 'port', dp_chooseDrive: 'Choose a drive',
    dp_why_server: 'Needs the desktop deploy app. Browsers cannot start servers or virtual machines.', dp_why_ssh: 'Needs the desktop deploy app. Browsers cannot open SSH connections.', dp_why_drive: 'Needs the desktop deploy app. Browsers cannot write to drives.',
    dp_getApp: 'Get the desktop deploy app', dp_noPicker: 'This browser cannot write to a folder, so a ZIP file is used.',
    dp_f_name: 'Instance name', dp_f_nameHint: 'Deploying the same name again updates that instance. A new name makes a new one.', dp_f_port: 'Port', dp_f_portHint: 'If the port is taken, the next free one is used.', dp_f_tag: 'Image version tag', dp_f_keep: 'Keep running after closing this window (the app stays in the tray)',
    dp_keepNote: 'With this off, the servers stop when you close the app. With it on, closing the window hides it to the tray; quit from the tray icon to stop the servers.',
    dp_stopServer: 'Stop the built-in servers', dp_f_host: 'Server name or address', dp_f_user: 'User name', dp_f_sshPort: 'SSH port', dp_f_folder: 'Remote folder',
    dp_f_key: 'Key file (optional, otherwise ssh-agent)', dp_f_webPort: 'Website port', dp_sshNote: 'Uses the Windows OpenSSH client with key login only. No password is typed here. Each instance gets its own sub-folder.',
    dp_f_repo: 'Repository (owner/name)', dp_pagesNote: 'The repository is created as public if it does not exist. The site is published from the gh-pages branch.',
    dp_f_net: 'Network', dp_m_bridged: 'Bridged', dp_m_nat: 'NAT', dp_vboxNote: 'Downloads the appliance image of this version from the GitHub release, checks its SHA-256 against the release, imports it as a new machine and starts it without a window. Bridged gives it its own address on your network.',
    dp_vmwareNote: 'Downloads the appliance image, converts it with VMware OVF Tool (or vmware-vdiskmanager) and starts it with vmrun. The map editor serves the standard map: the appliance has no map seeding.',
    dp_driveNote: 'Only removable USB and SD drives are listed, never the Windows disk. Nothing is chosen for you. You confirm the exact drive before anything is erased.', dp_refreshDrives: 'Refresh drives', dp_noDrives: 'No removable USB or SD drive was found. Plug one in and press Refresh drives.', dp_drivesFailed: 'The drives could not be listed',
    dp_driveLine: 'Disk {n} · {bus} · {p} partitions', dp_driveRO: 'write protected', dp_writeBtn: 'Erase and write…', dp_chooseFirst: 'Choose a drive first.',
    dp_signIn: 'Sign in with GitHub', dp_signedIn: 'Signed in as', dp_signOut: 'Sign out', dp_cliFound: 'The GitHub CLI is signed in as',
    dp_signInHelpDesk: 'Sign in once with your GitHub account. The key is kept by Windows, never in a file.',
    dp_signInHelpWeb: 'Paste a fine-grained token. It stays in this page\'s memory and goes only to api.github.com.',
    dp_tokenLabel: 'Fine-grained personal access token', dp_tokenHelp: 'Needs read and write for Contents, Administration and Pages on the repository. Create one at github.com/settings/personal-access-tokens.',
    dp_remember: 'Remember on this device (stored unencrypted in this browser)', dp_saveToken: 'Sign in', dp_noEnc: 'Windows protection is not available, so a token cannot be saved. Use the GitHub CLI instead.',
    dp_f_mode: 'Write', dp_m_folder: 'A folder', dp_m_zip: 'A ZIP file', dp_f_path: 'Where', dp_browse: 'Browse',
    dp_zipDone: 'ZIP file downloaded', dp_folderDone: 'Written to the folder you chose',
    dp_flashTitleUsb: 'Erase this drive and write the PC image?', dp_flashTitleRpi: 'Erase this card and write the Pi image?',
    dp_flashEraseAll: 'Everything on Disk {n} will be erased. The image is {name} (about {size}). It is downloaded and checked first, and after writing, every byte is read back and checked.',
    dp_flashSub: 'Disk {n} · removable · {p} partitions · not the Windows disk', dp_flashUnderstand: 'I understand Disk {n} will be erased', dp_flashPermission: 'Windows will ask for permission to write to the disk.',
    dp_flashGo: 'Erase and write', dp_flashBoot: 'Written and read back.'
  }, {
    dp_menu: '部署……', dp_title: '一次過，將地圖放上所有地方', dp_bar: '部署你嘅地圖', dp_close: '關閉', dp_lang: '語言', dp_tabDeploy: '部署', dp_tabs: '部署分頁',
    dp_mapCurrent: '用我而家嘅地圖做起始地圖', dp_mapStd: '地圖：標準 GTHA 地圖', dp_mapIs: '地圖', dp_version: '版本', dp_pick: '剔好要放嘅地方，再㩒「部署」',
    dp_chooseMap: '揀地圖', dp_clearMap: '用返標準地圖', dp_mapBad: '用唔到你揀嘅地圖',
    dp_settings: '設定', dp_retry: '再試', dp_cancel: '取消', dp_open: '打開', dp_copy: '複製', dp_copied: '已複製', dp_again: '再下載一次', dp_reveal: '打開資料夾',
    dp_showLog: '睇記錄', dp_hideLog: '收埋記錄', dp_copyAll: '複製所有連結', dp_noLinks: '暫時未有可用連結。',
    dp_deployN: '部署到 {n} 個地方', dp_deployOne: '部署到 1 個地方', dp_deployNone: '請先剔一個地方',
    dp_idle: '準備好', dp_running: '處理緊', dp_live: '已上線', dp_verified: '已驗證', dp_failed: '失敗', dp_signin: '要登入', dp_unavailable: '呢度用唔到',
    dp_sumLive: '個已上線', dp_sumWork: '個處理緊', dp_sumFail: '個失敗', dp_sumWait: '個等你處理', dp_sumNone: '未部署過', dp_sumWritten: '個磁碟已寫入',
    dp_g_all: '全部', dp_g_local: '呢部電腦', dp_g_vm: '虛擬機', dp_g_flash: '寫入磁碟', dp_g_online: '網上', dp_filters: '篩選地方',
    dp_t_docker: '呢部電腦，用 Docker', dp_d_docker: '網頁應用程式', dp_t_builtin: '內置伺服器', dp_d_builtin: '唔使 Docker',
    dp_t_virtualbox: 'VirtualBox', dp_d_virtualbox: '應用虛擬機', dp_t_vmware: 'VMware', dp_d_vmware: 'Workstation 或 Player · 應用虛擬機',
    dp_t_ssh: '遠端伺服器（SSH）', dp_d_ssh: '用密鑰登入嘅伺服器，行 Docker Compose',
    dp_t_usb: '後備電腦用嘅 USB 手指', dp_d_usb: '寫入電腦版應用映像', dp_t_rpi: 'Raspberry Pi', dp_d_rpi: 'SD 卡或 USB · Pi 4 同 Pi 5 · arm64',
    dp_t_pages: 'GitHub Pages', dp_d_pages: 'github.io 上面嘅公開網站', dp_t_folder: '資料夾或 ZIP', dp_d_folder: '靜態網站，任何網頁主機都用得',
    dp_net_bridged: '橋接網絡', dp_net_nat: 'NAT 加轉發連接埠', dp_port: '連接埠', dp_chooseDrive: '揀一個磁碟',
    dp_why_server: '要用桌面部署程式。瀏覽器開唔到伺服器或虛擬機。', dp_why_ssh: '要用桌面部署程式。瀏覽器開唔到 SSH 連線。', dp_why_drive: '要用桌面部署程式。瀏覽器寫唔到磁碟。',
    dp_getApp: '下載桌面部署程式', dp_noPicker: '呢個瀏覽器寫唔到資料夾，所以改用 ZIP 檔案。',
    dp_f_name: '實例名稱', dp_f_nameHint: '用同一個名再部署會更新嗰個實例，用新名就開一個新嘅。', dp_f_port: '連接埠', dp_f_portHint: '如果連接埠被佔用，會用下一個空閒嘅。', dp_f_tag: '映像版本標籤', dp_f_keep: '關閉視窗後繼續行（程式留喺系統匣）',
    dp_keepNote: '關咗呢個選項，關閉程式伺服器就會停。開咗之後，關視窗只係收埋去系統匣；要停伺服器就喺系統匣圖示退出。',
    dp_stopServer: '停止內置伺服器', dp_f_host: '伺服器名稱或地址', dp_f_user: '用戶名稱', dp_f_sshPort: 'SSH 連接埠', dp_f_folder: '遠端資料夾',
    dp_f_key: '密鑰檔案（可選，否則用 ssh-agent）', dp_f_webPort: '網站連接埠', dp_sshNote: '用 Windows 內置嘅 OpenSSH，只用密鑰登入，唔會喺度輸入密碼。每個實例有自己嘅子資料夾。',
    dp_f_repo: '儲存庫（擁有者/名稱）', dp_pagesNote: '儲存庫如果未有，會建立做公開。網站會由 gh-pages 分支發佈。',
    dp_f_net: '網絡', dp_m_bridged: '橋接', dp_m_nat: 'NAT', dp_vboxNote: '會由 GitHub 發佈版本下載呢個版本嘅應用映像，對照發佈嘅 SHA-256 檢查，匯入做新虛擬機，再用冇視窗方式啟動。橋接會令佢喺你嘅網絡有自己嘅地址。',
    dp_vmwareNote: '會下載應用映像，用 VMware OVF Tool（或 vmware-vdiskmanager）轉換，再用 vmrun 啟動。地圖編輯器會顯示標準地圖：應用映像唔支援預載地圖。',
    dp_driveNote: '只會列出可移除嘅 USB 同 SD 磁碟，唔會列出 Windows 磁碟。程式唔會幫你預先揀。擦除任何嘢之前，你要確認確切嘅磁碟。', dp_refreshDrives: '重新整理磁碟', dp_noDrives: '搵唔到可移除嘅 USB 或 SD 磁碟。插好之後，㩒「重新整理磁碟」。', dp_drivesFailed: '列唔到磁碟',
    dp_driveLine: '磁碟 {n} · {bus} · {p} 個分割區', dp_driveRO: '防寫', dp_writeBtn: '擦除並寫入……', dp_chooseFirst: '請先揀一個磁碟。',
    dp_signIn: '用 GitHub 登入', dp_signedIn: '已登入為', dp_signOut: '登出', dp_cliFound: 'GitHub CLI 已登入為',
    dp_signInHelpDesk: '用你嘅 GitHub 帳戶登入一次。金鑰由 Windows 保管，唔會存喺檔案入面。',
    dp_signInHelpWeb: '貼上細粒度權杖。佢只留喺呢個頁面嘅記憶體，只會傳去 api.github.com。',
    dp_tokenLabel: '細粒度個人存取權杖', dp_tokenHelp: '要有該儲存庫嘅內容、管理同 Pages 讀寫權限。可以喺 github.com/settings/personal-access-tokens 建立。',
    dp_remember: '喺呢部裝置記住（未加密，存喺呢個瀏覽器）', dp_saveToken: '登入', dp_noEnc: 'Windows 保護功能用唔到，所以儲存唔到權杖。請改用 GitHub CLI。',
    dp_f_mode: '輸出', dp_m_folder: '資料夾', dp_m_zip: 'ZIP 檔案', dp_f_path: '位置', dp_browse: '瀏覽',
    dp_zipDone: 'ZIP 檔案已下載', dp_folderDone: '已寫入你揀嘅資料夾',
    dp_flashTitleUsb: '要擦除呢隻 USB 手指並寫入電腦版映像嗎？', dp_flashTitleRpi: '要擦除呢張卡並寫入 Pi 映像嗎？',
    dp_flashEraseAll: '磁碟 {n} 上面所有嘢都會被擦除。映像係 {name}（約 {size}）。程式會先下載同檢查，寫入之後會逐個位元組讀返出嚟核對。',
    dp_flashSub: '磁碟 {n} · 可移除 · {p} 個分割區 · 唔係 Windows 磁碟', dp_flashUnderstand: '我明白磁碟 {n} 會被擦除', dp_flashPermission: 'Windows 會問你准唔准許寫入磁碟。',
    dp_flashGo: '擦除並寫入', dp_flashBoot: '已寫入並讀返核對。'
  });
  const t = (k, vars) => { let s = window.I18N.t(k); if (vars) for (const [a, b] of Object.entries(vars)) s = s.split('{' + a + '}').join(String(b)); return s; };

  const DEFAULTS = {
    docker: { name: '', port: 8080, tag: 'latest' }, builtin: { name: '', port: 8090, keepRunning: false },
    virtualbox: { name: '', netMode: 'bridged' }, vmware: { name: '' },
    ssh: { name: '', host: '', user: '', sshPort: 22, folder: '~/gtha-map', key: '', port: 8080, tag: 'latest' },
    usb: { disk: -1 }, rpi: { disk: -1 }, pages: { name: '', repo: '' }, folder: { name: '', mode: 'zip', path: '' }
  };

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
    // ---- the instances this browser deployed (ZIP and GitHub Pages), kept in local storage ----
    let instListener = () => {};
    const loadInst = () => { try { const j = JSON.parse(localStorage.getItem(STORE_INST) || '[]'); return Array.isArray(j) ? j : []; } catch { return []; } };
    const saveInst = (l) => { try { localStorage.setItem(STORE_INST, JSON.stringify(l)); } catch { /* storage unavailable */ } };
    const view = (r) => Object.assign({ busy: false, latest: '', updateAvailable: false, canRun: false, canDuplicate: false, port: 0, tag: '', map: '', run: { path: '', repo: r.repo || '' } }, r);
    function record(id, st2, res) {
      if (id !== 'folder' && id !== 'pages') return;
      const s = st2.settings[id]; const mapTitle = G ? (G.getMap().title || '') : '';
      const name = String(s.name || '').trim() || mapTitle || (id === 'pages' ? s.repo : 'Metro map');
      const url = id === 'pages' ? ((res.links || []).find((l) => l.kind === 'url') || {}).url || '' : '';
      const where = id === 'pages' ? s.repo : (s.mode === 'folder' && hasPicker ? t('dp_m_folder') : t('dp_m_zip'));
      const list = loadInst(); const i = list.findIndex((x) => x.kind === id && x.name.toLowerCase() === name.toLowerCase());
      const rec = { id: i >= 0 ? list[i].id : Math.random().toString(16).slice(2, 14).padEnd(12, '0'), kind: id, name, where, url, version: '', map: mapTitle, created: i >= 0 ? list[i].created : new Date().toISOString(), repo: id === 'pages' ? s.repo : '', check: { at: Date.now(), state: id === 'pages' ? 'healthy' : 'unknown' } };
      if (i >= 0) list[i] = rec; else list.push(rec);
      saveInst(list); instListener(list.map(view));
    }
    const inst = {
      web: true,
      list: async () => loadInst().map(view),
      async check() {
        const list = loadInst();
        await Promise.all(list.map(async (r) => {
          if (r.kind !== 'pages' || !r.url) return;
          try { await fetch(r.url, { mode: 'no-cors', cache: 'no-store' }); r.check = { at: Date.now(), state: 'healthy' }; } catch { r.check = { at: Date.now(), state: 'unhealthy' }; }
        }));
        saveInst(list); return list.map(view);
      },
      async action(id, act) {
        const list = loadInst(); const r = list.find((x) => x.id === id); if (!r) return { ok: false, error: 'That entry is no longer here.' };
        if (act === 'remove') { saveInst(list.filter((x) => x.id !== id)); instListener(loadInst().map(view)); return { ok: true }; }
        if (act === 'logs') return { ok: true, text: r.kind === 'pages' ? 'Published to ' + r.repo + ' (the gh-pages branch).' : r.where + ': a ZIP file or folder has no log.' };
        return { ok: false, error: t('dpi_why_web') };
      },
      duplicate: async () => ({ ok: false, error: t('dpi_why_web') }),
      onChange: (fn) => { instListener = fn; }, onStatus() { /* no background work in the browser */ },
      can: (i, act) => (act === 'remove' || act === 'logs' ? { ok: true } : { ok: false, reason: t('dpi_why_web') })
    };
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
        if (id === 'docker' || id === 'builtin' || id === 'virtualbox' || id === 'vmware') return { ok: false, reason: t('dp_why_server') };
        if (id === 'ssh') return { ok: false, reason: t('dp_why_ssh') };
        if (FLASH.includes(id)) return { ok: false, reason: t('dp_why_drive') };
        return { ok: true };
      },
      async init() {
        const s = load(); const settings = {}; for (const id of IDS) settings[id] = Object.assign({}, DEFAULTS[id], (s.settings || {})[id] || {});
        if (!hasPicker) settings.folder.mode = 'zip';
        void FLASH;
        const ticked = {}; for (const id of IDS) ticked[id] = this.caps(id).ok && (s.ticked && id in s.ticked ? !!s.ticked[id] : id === 'folder');
        return { ticked, settings, useMap: s.useMap !== false, version: '', rememberToken: !!token && !!localStorage.getItem(STORE_TOKEN) };
      },
      save(state) { save({ ticked: state.ticked, settings: state.settings, useMap: state.useMap }); },
      mapText() { try { return G ? core.checkMapText(G.projectJson()) : null; } catch { return null; } },
      mapTitle() { return G ? G.getMap().title : ''; },
      onStatus(fn) { listener = fn; }, onLog(fn) { logger = fn; },
      inst,
      start(id, st) {
        const ctl = new AbortController(); aborts.set(id, ctl);
        const emit = (pct, msg) => listener({ id, state: 'running', pct, msg });
        const ctx = { emit, log: (l) => logger({ id, line: l }), signal: ctl.signal, mapText: st.useMap ? this.mapText() : null };
        listener({ id, state: 'running', pct: 2, msg: 'Starting', links: [], error: '', note: '' });
        // A folder must be chosen inside the click that started the deployment, so ask for it before any other await.
        const run = id === 'folder' ? (st.settings.folder.mode === 'folder' && hasPicker ? window.showDirectoryPicker({ mode: 'readwrite' }).then((dir) => deployFolder(ctx, dir)) : deployZip(ctx))
          : id === 'pages' ? deployPages(ctx, st.settings.pages) : Promise.reject(new Error(this.caps(id).reason));
        return run.then((res) => { if (ctl.signal.aborted) throw new Error('Cancelled.'); record(id, st, res); listener({ id, state: 'live', pct: 100, msg: 'Live', links: res.links, note: res.note || '' }); })
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
    let initData = null; let changeFn = () => {}; let statusFn = () => {};
    const inst = {
      web: false, list: () => api.instances(), check: () => api.instancesCheck(), action: (id, a) => api.instanceAction(id, a), duplicate: (id, n) => api.instanceDuplicate(id, n),
      onChange: (fn) => { changeFn = fn; api.onInstances((l) => changeFn(l)); }, onStatus: (fn) => { statusFn = fn; api.onInstanceStatus((s) => statusFn(s)); }, can: () => ({ ok: true })
    };
    return {
      kind: 'desktop', hasPicker: true, inst,
      caps() { return { ok: true }; },
      async init() { initData = await api.init(); return { ticked: initData.state.ticked, settings: initData.state.settings, useMap: true, version: initData.version, mapName: initData.mapName, mapError: initData.mapError, lang: initData.state.lang, builtinRunning: initData.builtinRunning, encryption: initData.encryption, instances: initData.instances }; },
      save(state) { api.saveState({ lang: window.I18N.getLang(), ticked: state.ticked, settings: state.settings }); },
      onStatus(fn) { api.onStatus(fn); }, onLog(fn) { api.onLog(fn); },
      start(id) { return api.deploy(id); }, cancel(id) { api.cancel(id); },
      disks: () => api.listDisks(), flash: (id, n) => api.flash(id, n),
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
    root.innerHTML = ''; // the dialogs below are added to root, so clear it first
    opts = opts || {};
    const st = { ticked: {}, settings: {}, status: {}, useMap: true, version: '', mapName: '', mapError: '', logOpen: false, gh: { stored: false, cli: false, login: '' }, logLines: [], filter: 'all', disks: [], disksFor: {}, diskError: '', tab: 'deploy' };
    const refs = {};
    const desk = backend.kind === 'desktop';
    const persist = () => backend.save(st);
    const pagesNeedsSignIn = () => st.ticked.pages && !(st.gh.stored || st.gh.cli);
    const imageName = (id) => 'gtha-metro-map-creator-appliance-' + (st.version || '1.6.0') + '-' + (id === 'rpi' ? 'arm64-rpi' : 'x86_64') + '.img';

    // Field descriptors: [key, kind, label key, extra]. kinds: text, number, select, switch, seg, path, secret.
    const NAME = ['name', 'text', 'dp_f_name', { wide: true, hint: 'dp_f_nameHint' }];
    const FIELDS = {
      docker: [NAME, ['port', 'number', 'dp_f_port', { min: 1024, max: 65535, hint: 'dp_f_portHint' }], ['tag', 'text', 'dp_f_tag', {}]],
      builtin: [NAME, ['port', 'number', 'dp_f_port', { min: 1024, max: 65535, hint: 'dp_f_portHint' }], ['keepRunning', 'switch', 'dp_f_keep', { wide: true }]],
      virtualbox: [NAME, ['netMode', 'seg', 'dp_f_net', { wide: true, options: [['bridged', 'dp_m_bridged'], ['nat', 'dp_m_nat']] }]],
      vmware: [NAME],
      ssh: [NAME, ['host', 'text', 'dp_f_host', {}], ['user', 'text', 'dp_f_user', {}], ['sshPort', 'number', 'dp_f_sshPort', { min: 1, max: 65535 }], ['folder', 'text', 'dp_f_folder', {}],
        ['port', 'number', 'dp_f_webPort', { min: 1024, max: 65535 }], ['tag', 'text', 'dp_f_tag', {}], ['key', 'text', 'dp_f_key', { wide: true }]],
      usb: [], rpi: [],
      pages: [NAME, ['repo', 'text', 'dp_f_repo', { wide: true }]],
      folder: [NAME, ['mode', 'seg', 'dp_f_mode', { wide: true, options: [['zip', 'dp_m_zip'], ['folder', 'dp_m_folder']] }]].concat(desk ? [['path', 'path', 'dp_f_path', { wide: true }]] : [])
    };
    const NOTES = { virtualbox: 'dp_vboxNote', vmware: 'dp_vmwareNote', ssh: 'dp_sshNote', pages: 'dp_pagesNote', builtin: 'dp_keepNote', usb: 'dp_driveNote', rpi: 'dp_driveNote' };
    const SUB = {
      docker: () => t('dp_d_docker') + ' · ' + t('dp_port') + ' ' + st.settings.docker.port, builtin: () => t('dp_d_builtin') + ' · ' + t('dp_port') + ' ' + st.settings.builtin.port,
      virtualbox: () => t('dp_d_virtualbox') + ' · ' + t(st.settings.virtualbox.netMode === 'nat' ? 'dp_net_nat' : 'dp_net_bridged'), vmware: () => t('dp_d_vmware'),
      ssh: () => (st.settings.ssh.host ? (st.settings.ssh.user || '?') + '@' + st.settings.ssh.host + ' · ' + st.settings.ssh.folder : t('dp_d_ssh')),
      usb: () => { const d = chosenDisk('usb'); return d ? d.model + ' · ' + fmtBytes(d.size) : t('dp_d_usb'); },
      rpi: () => { const d = chosenDisk('rpi'); return d ? d.model + ' · ' + fmtBytes(d.size) : t('dp_d_rpi'); },
      pages: () => (st.settings.pages.repo ? st.settings.pages.repo : t('dp_d_pages')), folder: () => t('dp_d_folder')
    };
    const chosenDisk = (id) => st.disks.find((d) => d.number === st.settings[id].disk) || null;

    function buildCard(id) {
      const r = refs[id] = { fields: {} };
      const card = el('section', 'dp-card'); card.dataset.target = id;
      const head = el('div', 'dp-card-head');
      const cb = checkbox({ checked: false, label: '', onChange: (v) => { st.ticked[id] = v; persist(); if (v && FLASH.includes(id)) loadDisks(); renderAll(); } });
      cb.input.id = 'dp-tick-' + id; r.check = cb.input; cb.root.classList.add('dp-card-check');
      const tile = el('span', 'dp-tile'); tile.append(targetGlyph(id, 20));
      const title = el('div', 'dp-card-title'); r.label = el('label'); r.label.htmlFor = r.check.id; r.sub = el('span', 'dp-hint'); title.append(r.label, r.sub);
      r.chip = el('span', 'dp-chip'); r.chip.setAttribute('role', 'status');
      head.append(cb.root, tile, title, r.chip);
      r.why = el('p', 'dp-why'); r.whyLink = el('a', 'dp-why-link'); r.whyLink.href = RELEASES; r.whyLink.target = '_blank'; r.whyLink.rel = 'noopener';
      r.links = el('div', 'dp-links');
      r.progress = el('div', 'dp-progress'); r.progress.append(document.createElement('i')); r.progress.setAttribute('role', 'progressbar'); r.progress.setAttribute('aria-valuemin', '0'); r.progress.setAttribute('aria-valuemax', '100');
      r.msg = el('p', 'dp-msg'); r.err = el('p', 'dp-err'); r.err.setAttribute('role', 'alert'); r.note = el('p', 'dp-note');
      r.actions = el('div', 'dp-row');
      card.append(head, r.why, r.links, r.progress, r.msg, r.err, r.note, r.actions);
      if (id === 'pages') { r.signin = el('div'); card.append(r.signin); }
      r.set = el('details', 'dp-set'); r.setSum = el('summary'); r.fieldBox = el('div', 'dp-fields'); r.set.append(r.setSum, r.fieldBox); card.append(r.set);
      buildFields(id);
      return card;
    }
    function buildFields(id) {
      const r = refs[id];
      for (const [key, kind, lk, extra] of FIELDS[id]) {
        const commit = (v) => { st.settings[id][key] = v; persist(); renderCard(id); };
        let c;
        if (kind === 'switch') c = switchControl({ label: t(lk), wide: extra.wide, onChange: commit });
        else if (kind === 'seg') { c = segmented({ options: extra.options.map(([v, k]) => [v, t(k)]), value: '', aria: t(lk), onChange: commit }); const wrap = el('div', extra.wide ? 'wide' : ''); const cap = el('div', 'dp-hint', t(lk)); wrap.append(cap, c.root); c.root = wrap; c.cap = cap; }
        else if (kind === 'path') {
          c = textField({ label: t(lk), wide: true, mono: true, onChange: (v) => { st.settings[id].path = v; persist(); } });
          const row = el('div', 'dp-row wide'); r.browse = button('', 'sm', async () => { const p = await backend.pickPath(st.settings.folder.mode); if (p && p.path) { c.input.value = p.path; st.settings.folder.path = p.path; persist(); } }); row.append(c.root, r.browse); c.root.style.flex = '1 1 200px'; c.row = row;
        } else {
          c = textField({ label: t(lk), type: kind === 'number' ? 'number' : 'text', min: extra.min, max: extra.max, wide: extra.wide, hint: extra.hint ? t(extra.hint) : undefined, mono: key === 'key' || key === 'folder' || key === 'host', onChange: commit });
        }
        c.lk = lk; c.hk = extra.hint; c.kind = kind; r.fields[key] = c;
        r.fieldBox.append(c.row || c.root);
      }
      if (NOTES[id]) { r.note2 = el('p', 'dp-hint wide'); r.fieldBox.append(r.note2); }
      if (id === 'builtin') { r.stopBtn = button('', 'sm wide', () => backend.builtinStop()); r.fieldBox.append(r.stopBtn); }
      if (id === 'folder') { r.noPicker = el('p', 'dp-hint wide'); r.fieldBox.append(r.noPicker); }
      if (FLASH.includes(id)) {
        r.driveBox = el('div', 'dp-drives wide'); r.driveBox.setAttribute('role', 'radiogroup'); r.fieldBox.append(r.driveBox);
        r.refresh = button('', 'sm tonal wide', () => loadDisks(true), 'refresh'); r.fieldBox.append(r.refresh);
      }
    }

    async function loadDisks() {
      if (!backend.disks) return;
      st.diskError = '';
      try { const r = await backend.disks(); if (r.ok) st.disks = r.disks; else { st.disks = []; st.diskError = r.error || ''; } } catch (e) { st.disks = []; st.diskError = String(e.message || e); }
      for (const id of FLASH) if (!st.disks.some((d) => d.number === st.settings[id].disk)) st.settings[id].disk = -1;
      renderAll();
    }

    function chipFor(id) {
      const caps = backend.caps(id); const s = st.status[id] || { state: 'idle' };
      if (!caps.ok) return { cls: 'idle', text: t('dp_unavailable') };
      if (s.state === 'running') return { cls: '', text: t('dp_running') + (s.pct ? ' ' + Math.round(s.pct) + '%' : ''), spin: true };
      if (s.state === 'live') return { cls: 'live', text: FLASH.includes(id) ? t('dp_verified') : '✓ ' + t('dp_live') };
      if (s.state === 'failed') return { cls: 'failed', text: t('dp_failed') };
      if (id === 'pages' && st.ticked.pages && pagesNeedsSignIn()) return { cls: 'signin', text: t('dp_signin') };
      return { cls: 'idle', text: t('dp_idle') };
    }

    function renderDrives(id) {
      const r = refs[id]; r.driveBox.textContent = '';
      r.driveBox.setAttribute('aria-label', t('dp_chooseDrive'));
      if (st.diskError) { r.driveBox.append(el('p', 'dp-err', t('dp_drivesFailed') + ': ' + st.diskError)); return; }
      if (!st.disks.length) { r.driveBox.append(el('p', 'dp-hint', t('dp_noDrives'))); return; }
      for (const d of st.disks) {
        const lab = el('label', 'dp-drive'); const rad = document.createElement('input'); rad.type = 'radio'; rad.name = 'dp-drive-' + id; rad.value = d.number; rad.checked = d.number === st.settings[id].disk; rad.disabled = d.readOnly;
        rad.addEventListener('change', () => { st.settings[id].disk = d.number; persist(); renderCard(id); });
        const txt = el('span', 'dp-drive-t'); txt.append(el('b', '', d.model + ' · ' + fmtBytes(d.size)), el('span', '', t('dp_driveLine', { n: d.number, bus: d.bus, p: d.partitions }) + (d.readOnly ? ' · ' + t('dp_driveRO') : '')));
        lab.append(rad, txt); r.driveBox.append(lab);
      }
    }

    function renderCard(id) {
      const r = refs[id]; const s = st.status[id] || { state: 'idle' }; const set = st.settings[id]; const caps = backend.caps(id);
      r.label.textContent = t('dp_t_' + id); r.sub.textContent = SUB[id](); r.sub.title = r.sub.textContent;
      r.check.checked = !!st.ticked[id] && caps.ok; r.check.disabled = !caps.ok || s.state === 'running'; r.check.setAttribute('aria-label', t('dp_t_' + id));
      r.label.parentNode.parentNode.parentNode.classList.toggle('on', !!st.ticked[id] && caps.ok);
      const c = chipFor(id); r.chip.className = 'dp-chip ' + c.cls; r.chip.textContent = ''; if (c.spin) r.chip.append(el('span', 'dp-spin')); r.chip.append(document.createTextNode(c.text));
      r.why.hidden = caps.ok; r.why.textContent = ''; if (!caps.ok) { r.why.append(document.createTextNode(caps.reason + ' ')); r.whyLink.textContent = t('dp_getApp'); r.why.append(r.whyLink); }
      r.set.hidden = !caps.ok; r.setSum.textContent = t('dp_settings');
      for (const [key, c2] of Object.entries(r.fields)) {
        if (c2.kind === 'switch') { c2.setLabel(t(c2.lk)); c2.set(set[key]); }
        else if (c2.kind === 'seg') { c2.cap.textContent = t(c2.lk); c2.setAria(t(c2.lk)); for (const [v, k] of FIELDS[id].find((f) => f[0] === key)[3].options) c2.setLabel(v, t(k)); c2.set(set[key]); }
        else { c2.setLabel(t(c2.lk)); if (c2.hk) c2.setHint(t(c2.hk)); c2.set(set[key]); }
      }
      if (r.browse) r.browse.setLabel(t('dp_browse'));
      if (r.note2) r.note2.textContent = t(NOTES[id]);
      if (r.stopBtn) r.stopBtn.setLabel(t('dp_stopServer'));
      if (r.noPicker) { r.noPicker.textContent = backend.hasPicker ? '' : t('dp_noPicker'); r.noPicker.hidden = backend.hasPicker; }
      if (FLASH.includes(id)) { r.refresh.setLabel(t('dp_refreshDrives')); renderDrives(id); if (st.ticked[id] && caps.ok && set.disk < 0) r.set.open = true; }
      r.links.textContent = '';
      if (s.state === 'live') for (const l of s.links || []) {
        const row = el('div', 'dp-link'); const u = el('span', 'dp-url', l.kind === 'url' || l.kind === 'path' ? l.url : l.label); u.title = l.label;
        row.append(u);
        if (l.kind === 'url' || l.kind === 'path') row.append(button(t('dp_copy'), 'sm', async (e) => { await backend.copy(l.url); const b = e.currentTarget; b.setLabel(t('dp_copied')); setTimeout(() => b.setLabel(t('dp_copy')), 1200); }), button(l.kind === 'path' ? t('dp_reveal') : t('dp_open'), 'sm primary', () => backend.open(l.url)));
        if (l.kind === 'download') row.append(button(t('dp_again'), 'sm', () => backend.download(l)));
        r.links.append(row);
      }
      const running = s.state === 'running';
      r.progress.hidden = !running; r.progress.firstChild.style.width = (s.pct || 0) + '%'; r.progress.setAttribute('aria-valuenow', String(Math.round(s.pct || 0))); r.progress.setAttribute('aria-label', t('dp_t_' + id));
      r.msg.hidden = !running; r.msg.textContent = running ? s.msg || '' : '';
      r.err.hidden = s.state !== 'failed'; if (s.state === 'failed') linkify(r.err, s.error || '', (u) => backend.open(u)); else r.err.textContent = '';
      r.note.hidden = !(s.state === 'live' && s.note); r.note.textContent = s.state === 'live' ? s.note || '' : '';
      r.actions.textContent = '';
      if (running) r.actions.append(button(t('dp_cancel'), 'sm', () => backend.cancel(id)));
      if (s.state === 'failed') r.actions.append(button(t('dp_retry'), 'sm tonal', () => (FLASH.includes(id) ? startFlash(id) : start(id))));
      if (FLASH.includes(id) && !running && st.ticked[id] && caps.ok && set.disk >= 0) r.actions.append(button(t('dp_writeBtn'), 'sm tonal', () => startFlash(id)));
      r.actions.hidden = !r.actions.childNodes.length;
      const inGroup = st.filter === 'all' || GROUP[id] === st.filter; r.label.closest('.dp-card').hidden = !inGroup;
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
      const tok = textField({ label: t('dp_tokenLabel'), type: 'password', wide: true }); tok.input.id = 'dp-token';
      const msg = el('p', 'dp-hint wide', backend.gh.encryption ? t('dp_tokenHelp') : t('dp_noEnc')); msg.id = 'dp-token-msg';
      let remember = null;
      if (backend.gh.web) { const rw = checkbox({ label: t('dp_remember'), wide: true }); remember = rw.input; remember.id = 'dp-remember'; form.append(tok.root, rw.root, msg); } else form.append(tok.root, msg);
      const save = button(t('dp_saveToken'), 'sm primary', async () => {
        save.disabled = true; const res = await backend.gh.saveToken(tok.input.value, remember && remember.checked); tok.input.value = ''; save.disabled = false;
        if (res.ok) { r.signinOpen = false; await refreshGh(res.login); } else { msg.textContent = res.error; msg.classList.add('dp-err'); }
      });
      save.id = 'dp-token-save'; save.disabled = !backend.gh.encryption; form.append(save);
      row.append(button(t('dp_signIn'), 'sm tonal', () => { r.signinOpen = form.hidden; form.hidden = !form.hidden; if (!form.hidden) tok.input.focus(); }));
      r.signin.append(row, form);
    }

    function renderHead() {
      const q = (s) => root.querySelector(s);
      q('.dp-title').textContent = t('dp_title'); q('.dp-barTitle').textContent = t('dp_bar');
      const line = q('.dp-mapLine'); line.textContent = '';
      if (desk) {
        line.append(document.createTextNode(st.mapName ? t('dp_mapIs') + ': ' : t('dp_mapStd'))); if (st.mapName) line.append(el('b', '', st.mapName));
        refs.chooseMap.setLabel(t('dp_chooseMap')); refs.clearMap.setLabel(t('dp_clearMap')); refs.clearMap.hidden = !st.mapName && !st.mapError;
      } else {
        const title = backend.mapTitle(); line.append(document.createTextNode(t('dp_mapIs') + ': ')); line.append(el('b', '', title || '-'));
        refs.useMap.setLabel(t('dp_mapCurrent')); refs.useMap.input.checked = st.useMap;
      }
      line.append(document.createTextNode((st.version ? ' · ' + t('dp_version') + ' ' + st.version : '') + ' · ' + t('dp_pick')));
      q('.dp-mapErr').hidden = !st.mapError; q('.dp-mapErr').textContent = st.mapError ? t('dp_mapBad') + ': ' + st.mapError : '';
      q('.dp-logToggle').textContent = st.logOpen ? t('dp_hideLog') : t('dp_showLog'); q('.dp-logToggle').setAttribute('aria-expanded', String(st.logOpen)); q('.dp-log').hidden = !st.logOpen;
      q('.dp-copyAll').textContent = t('dp_copyAll');
      for (const g of ['all', 'local', 'vm', 'flash', 'online']) refs.groups.setLabel(g, t('dp_g_' + g)); refs.groups.root.setAttribute('aria-label', t('dp_filters'));
      const n = IDS.filter((i) => st.ticked[i] && backend.caps(i).ok).length; const busy = IDS.some((i) => (st.status[i] || {}).state === 'running');
      const dep = refs.deploy; dep.setLabel(n === 0 ? t('dp_deployNone') : n === 1 ? t('dp_deployOne') : t('dp_deployN').replace('{n}', n)); dep.disabled = n === 0 || busy;
      const count = (s) => IDS.filter((i) => (st.status[i] || {}).state === s && !FLASH.includes(i)).length;
      const written = FLASH.filter((i) => (st.status[i] || {}).state === 'live').length;
      const bits = []; const live = count('live'), work = IDS.filter((i) => (st.status[i] || {}).state === 'running').length, fail = IDS.filter((i) => (st.status[i] || {}).state === 'failed').length, wait = pagesNeedsSignIn() ? 1 : 0;
      if (live) bits.push(live + ' ' + t('dp_sumLive')); if (work) bits.push(work + ' ' + t('dp_sumWork')); if (written) bits.push(written + ' ' + t('dp_sumWritten')); if (fail) bits.push(fail + ' ' + t('dp_sumFail')); if (wait) bits.push(wait + ' ' + t('dp_sumWait'));
      q('.dp-summary').textContent = bits.length ? bits.join(' · ') : t('dp_sumNone');
      if (q('.dp-lang')) q('.dp-lang').value = window.I18N.getLang();
      refs.tabDeploy.textContent = t('dp_tabDeploy'); refs.tabs.setAttribute('aria-label', t('dp_tabs'));
      refs.tabInst.textContent = t('dpi_tab') + (refs.instCount ? ' ' + refs.instCount : '');
    }
    function renderAll() { renderHead(); for (const id of IDS) renderCard(id); if (refs.inst) refs.inst.render(); }

    function start(id) { st.status[id] = { state: 'running', pct: 1, msg: '' }; renderAll(); return backend.start(id, st); }

    // ---- the erase-and-write confirmation (design/Flash16.dc.html) ----
    const flashDlg = dialog({ title: '', icon: 'warn', tone: 'error', host: root, persistent: true });
    const fRow = el('div', 'dp-modal-row'); const fTile = el('span', 'dp-tile'); fTile.append(glyph('drive', 22)); const fTxt = el('div', 'dp-drive-t'); const fModel = el('b'); const fSub = el('span'); fTxt.append(fModel, fSub); fRow.append(fTile, fTxt);
    const fText = el('p', 'dp-modal-p'); const fUnderstand = checkbox({ label: '' }); fUnderstand.root.classList.add('dp-modal-confirm'); fUnderstand.input.id = 'dp-flash-understand';
    const fHint = el('p', 'dp-hint'); flashDlg.body.append(fRow, fText, fUnderstand.root, fHint);
    const fCancel = button('', 'text'); const fGo = button('', 'danger'); fGo.id = 'dp-flash-go'; flashDlg.actions.append(fCancel, fGo);
    fUnderstand.input.addEventListener('change', () => { fGo.disabled = !fUnderstand.input.checked; });
    // Resolves true when the person confirmed this exact drive.
    function confirmFlash(id, disk) {
      return new Promise((resolve) => {
        const n = disk.number;
        flashDlg.setTitle(t(id === 'rpi' ? 'dp_flashTitleRpi' : 'dp_flashTitleUsb'));
        fModel.textContent = disk.model + ' · ' + fmtBytes(disk.size); fSub.textContent = t('dp_flashSub', { n, p: disk.partitions });
        fText.textContent = t('dp_flashEraseAll', { n, name: imageName(id), size: id === 'rpi' ? '1.3 GB' : '2 GB' });
        fUnderstand.setLabel(t('dp_flashUnderstand', { n })); fUnderstand.input.checked = false; fGo.disabled = true; fHint.textContent = t('dp_flashPermission');
        fCancel.setLabel(t('dp_cancel')); fGo.setLabel(t('dp_flashGo'));
        const done = (v) => { fCancel.onclick = null; fGo.onclick = null; flashDlg.dlg.onclose = null; flashDlg.close(); resolve(v); };
        fCancel.onclick = () => done(false); fGo.onclick = () => done(fUnderstand.input.checked);
        flashDlg.dlg.onclose = () => resolve(false);
        flashDlg.open(); fCancel.focus();
      });
    }
    async function startFlash(id) {
      const set = st.settings[id]; const disk = chosenDisk(id);
      if (!disk || set.disk < 0) { st.status[id] = { state: 'failed', error: t('dp_chooseFirst') }; renderAll(); return; }
      const ok = await confirmFlash(id, disk);
      if (!ok) return;
      st.status[id] = { state: 'running', pct: 1, msg: '' }; renderAll();
      await backend.flash(id, disk.number);
    }
    function deployAll() {
      persist();
      // No await before the calls: a folder picker must open inside this click.
      for (const id of IDS.filter((i) => st.ticked[i] && backend.caps(i).ok && !FLASH.includes(i))) {
        if (id === 'pages' && pagesNeedsSignIn()) { st.status[id] = { state: 'failed', error: t(backend.gh.web ? 'dp_signInHelpWeb' : 'dp_signInHelpDesk') }; renderAll(); continue; }
        start(id);
      }
      (async () => { for (const id of FLASH.filter((i) => st.ticked[i] && backend.caps(i).ok)) await startFlash(id); })();
    }
    async function refreshGh(login) { st.gh = await backend.gh.status(); if (login) st.gh.login = login; else if (backend.gh.web && st.gh.stored) st.gh.login = backend.gh.login || st.gh.login; renderAll(); }

    // ---- layout ----
    const app = el('div', 'dp');
    const top = el('div', 'dp-top'); top.innerHTML = '<span class="dp-logo" aria-hidden="true"></span><span class="dp-barTitle"></span><span class="grow"></span>';
    refs.tabs = el('div', 'dp-tabs'); refs.tabs.setAttribute('role', 'tablist');
    const mkTab = (id) => { const b = el('button', 'dp-tab'); b.type = 'button'; b.id = 'dp-tab-' + id; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'dp-pane-' + id); b.addEventListener('click', () => showTab(id)); return b; };
    refs.tabDeploy = mkTab('deploy'); refs.tabInst = mkTab('instances'); refs.tabs.append(refs.tabDeploy, refs.tabInst);
    refs.tabs.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') { e.preventDefault(); const next = (e.key === 'ArrowRight' || e.key === 'End') ? 'instances' : 'deploy'; showTab(next); (next === 'deploy' ? refs.tabDeploy : refs.tabInst).focus(); } });
    const deployPane = el('div', 'dp-pane'); deployPane.id = 'dp-pane-deploy'; deployPane.setAttribute('role', 'tabpanel'); deployPane.setAttribute('aria-labelledby', 'dp-tab-deploy');
    deployPane.innerHTML = '<div class="dp-head"><div class="dp-head-text"><h1 class="dp-title" tabindex="-1"></h1><p class="dp-sub dp-mapLine"></p><p class="dp-err dp-mapErr" role="alert" hidden></p></div><div class="dp-head-actions"></div></div>' +
      '<div class="dp-groups"></div><div class="dp-cards"></div>' +
      '<div class="dp-foot"><span class="dp-summary" role="status" aria-live="polite"></span><span class="grow"></span><button type="button" class="dp-btn text dp-logToggle" aria-expanded="false"></button><button type="button" class="dp-btn text dp-copyAll"></button><span class="dp-deploySlot"></span></div>' +
      '<pre class="dp-log" aria-label="Log" hidden></pre>';
    const instPane = el('div'); instPane.id = 'dp-pane-instances'; instPane.setAttribute('role', 'tabpanel'); instPane.setAttribute('aria-labelledby', 'dp-tab-instances'); instPane.hidden = true; instPane.style.cssText = 'display:flex;flex-direction:column;flex:1 1 auto;min-height:0';
    app.append(top, refs.tabs, deployPane, instPane); root.append(app);
    const head = deployPane.querySelector('.dp-head-actions');
    if (desk) {
      const lang = selectField({ label: t('dp_lang'), options: [['en', 'English'], ['yue', '廣東話'], ['both', 'English · 廣東話']], onChange: (v) => { window.I18N.setLang(v); persist(); renderAll(); document.documentElement.lang = v === 'yue' ? 'yue-HK' : 'en'; } });
      lang.select.className = 'dp-lang'; lang.root.style.width = '170px'; lang.root.classList.add('dp-lang-wrap'); top.append(lang.root); refs.lang = lang;
      refs.chooseMap = button('', 'tonal dp-chooseMap', async () => { const r = await backend.chooseMap(); if (r.ok) { st.mapName = r.name; st.mapError = ''; } else if (r.error) st.mapError = r.error; renderHead(); });
      refs.clearMap = button('', 'text dp-clearMap', async () => { await backend.clearMap(); st.mapName = ''; st.mapError = ''; renderHead(); });
      head.append(refs.chooseMap, refs.clearMap);
    } else {
      refs.useMap = switchControl({ label: '', onChange: (v) => { st.useMap = v; persist(); } }); refs.useMap.root.classList.add('dp-useMapWrap'); refs.useMap.input.classList.add('dp-useMap'); head.append(refs.useMap.root);
      if (opts.onClose) top.append(button(t('dp_close'), 'text dp-close', opts.onClose));
    }
    refs.groups = chips({ options: ['all', 'local', 'vm', 'flash', 'online'].map((g) => [g, '']), value: 'all', aria: '', onChange: (v) => { st.filter = v; renderAll(); } });
    deployPane.querySelector('.dp-groups').append(refs.groups.root);
    refs.deploy = button('', 'dpfab dp-deployAll', deployAll, 'play'); deployPane.querySelector('.dp-deploySlot').append(refs.deploy);
    const cards = deployPane.querySelector('.dp-cards'); for (const id of IDS) cards.append(buildCard(id));
    deployPane.querySelector('.dp-logToggle').addEventListener('click', () => { st.logOpen = !st.logOpen; renderHead(); });
    deployPane.querySelector('.dp-copyAll').addEventListener('click', async (e) => {
      const urls = IDS.flatMap((i) => ((st.status[i] || {}).state === 'live' ? st.status[i].links.filter((l) => l.kind === 'url' || l.kind === 'path').map((l) => l.url) : []));
      await backend.copy(urls.join('\n')); const b = e.currentTarget; b.textContent = urls.length ? t('dp_copied') : t('dp_noLinks'); setTimeout(() => { b.textContent = t('dp_copyAll'); }, 1500);
    });
    backend.onStatus((s) => { st.status[s.id] = Object.assign({}, st.status[s.id], s); renderHead(); if (refs[s.id]) renderCard(s.id); });
    backend.onLog((l) => { st.logLines.push('[' + l.id + '] ' + l.line); while (st.logLines.length > 300) st.logLines.shift(); const log = deployPane.querySelector('.dp-log'); log.textContent = st.logLines.join('\n'); log.scrollTop = log.scrollHeight; });

    refs.inst = window.GMMCDeployInstances.mount(instPane, backend.inst, {
      open: (u) => backend.open(u), copy: (x) => backend.copy(x), onNew: () => { showTab('deploy'); refs.tabDeploy.focus(); },
      setBadge: (n) => { refs.instCount = n || ''; if (refs.tabInst) refs.tabInst.textContent = t('dpi_tab') + (n ? ' ' + n : ''); }
    });
    function showTab(id) {
      st.tab = id; const dep = id === 'deploy';
      deployPane.hidden = !dep; instPane.hidden = dep; instPane.style.display = dep ? 'none' : 'flex';
      refs.tabDeploy.setAttribute('aria-selected', String(dep)); refs.tabInst.setAttribute('aria-selected', String(!dep)); refs.tabDeploy.tabIndex = dep ? 0 : -1; refs.tabInst.tabIndex = dep ? -1 : 0;
      if (!dep) { refs.inst.refresh().then(() => refs.inst.checkAll()); }
    }

    const api = {
      async refresh() {
        const init = await backend.init();
        Object.assign(st, { ticked: init.ticked, settings: init.settings, useMap: init.useMap, version: init.version || '', mapName: init.mapName || '', mapError: init.mapError || '' });
        for (const id of FLASH) st.settings[id].disk = -1; // never preselect a drive
        if (desk && init.lang) window.I18N.setLang(init.lang);
        if (desk) backend.gh.encryption = init.encryption;
        showTab(st.tab);
        renderAll(); refreshGh(); if (FLASH.some((i) => st.ticked[i] && backend.caps(i).ok)) loadDisks();
        await refs.inst.refresh();
      },
      focus() { const h = deployPane.querySelector('.dp-title'); if (h) h.focus(); },
      showTab, loadDisks, state: st, refs
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
    window.GMMCDeploy = { open, close: () => dlg.close(), get ui() { return ui; } };
  }
  hooks('ready').push(setup);

  // Standalone page inside the desktop deploy app.
  window.GMMCDeployMount = async function (rootEl) {
    const ui = mount(rootEl, desktopBackend(window.deployApi), {}); await ui.refresh(); ui.focus(); window.GMMCDeployUi = ui; return ui;
  };
})();
