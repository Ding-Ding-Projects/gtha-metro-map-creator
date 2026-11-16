// mod-share.js: see docs/features/share.md. Registers hooks on window.GMMCX before app.js loads.
// Share link: the map is compressed in the browser and carried in the URL fragment, which is never sent to a server.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const on = (name, fn) => { (X[name] = Array.isArray(X[name]) ? X[name] : []).push(fn); };
  const t = (k) => window.I18N.t(k);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const PREFIX = '#map=';
  const MAX_LINK = 32000; // characters in the whole link
  const MAX_UNPACKED = 8 * 1024 * 1024; // bytes after decompression

  window.I18N.add({
    shShare: 'Share link', shTitle: 'Share this map', shCopy: 'Copy link', shClose: 'Close', shCopied: 'Link copied to the clipboard',
    shCopyFailed: 'Could not copy automatically. Select the link below and copy it.',
    shLength: 'Link length', shChars: 'characters', shNote: 'The map travels inside the link and is never sent to a server. Anyone with the link can open a copy.',
    shTooLong: 'This map is too large for a link. Use Save project in the Export menu instead.',
    shUnsupported: 'This browser cannot compress the map for a link. Use Save project instead.',
    shOpenTitle: 'Open shared map?', shOpenBody: 'This link contains a map. It opens as a new scenario named "Shared map". Your current work stays as it is.',
    shOpenBtn: 'Open as new scenario', shDismiss: 'Dismiss', shOpened: 'Shared map opened as a new scenario',
    shOpenedReplace: 'Shared map opened', shBadLink: 'This share link could not be read', shSharedName: 'Shared map'
  }, {
    shShare: '分享連結', shTitle: '分享呢幅地圖', shCopy: '複製連結', shClose: '關閉', shCopied: '連結已複製到剪貼簿',
    shCopyFailed: '未能自動複製。請選取下面嘅連結再複製。',
    shLength: '連結長度', shChars: '個字元', shNote: '地圖資料放喺連結入面，唔會傳送去任何伺服器。有連結嘅人可以開啟一份副本。',
    shTooLong: '呢幅地圖太大，放唔落連結。請用匯出選單入面嘅「儲存專案」。',
    shUnsupported: '呢個瀏覽器唔支援壓縮，未能製作連結。請改用「儲存專案」。',
    shOpenTitle: '開啟分享嘅地圖？', shOpenBody: '呢條連結包含一幅地圖，會以新方案「分享嘅地圖」開啟。你而家嘅工作唔會受影響。',
    shOpenBtn: '以新方案開啟', shDismiss: '忽略', shOpened: '已將分享嘅地圖開啟為新方案',
    shOpenedReplace: '已開啟分享嘅地圖', shBadLink: '睇唔明呢條分享連結', shSharedName: '分享嘅地圖'
  });

  let M = null;

  // ---------- encoding ----------
  const supported = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  function toB64url(bytes) {
    let bin = ''; const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(s) {
    const b = s.replace(/-/g, '+').replace(/_/g, '/'), bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function pack(text) {
    const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return toB64url(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  async function unpack(b64) {
    const stream = new Blob([fromB64url(b64)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader(), chunks = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length; if (total > MAX_UNPACKED) { reader.cancel(); throw new Error('too large'); }
      chunks.push(value);
    }
    const all = new Uint8Array(total); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    return new TextDecoder('utf-8', { fatal: true }).decode(all);
  }
  const baseUrl = () => location.origin + location.pathname + location.search;
  /** Build a link for a map. Resolves { link, length, tooLong }. */
  async function makeLink(map) {
    const link = baseUrl() + PREFIX + await pack(JSON.stringify(map));
    return { link, length: link.length, tooLong: link.length > MAX_LINK };
  }

  // ---------- share dialog ----------
  function ensureShareDialog() {
    let d = $('shDialog'); if (d) return d;
    d = document.createElement('dialog'); d.id = 'shDialog'; d.setAttribute('aria-labelledby', 'shDlgTitle');
    d.innerHTML = `<form method="dialog" class="dialog-body"><h2 id="shDlgTitle" class="headline"></h2>
      <p class="supporting" id="shDlgMsg" role="status"></p>
      <label class="tf" id="shLinkWrap"><span class="tf-label" id="shLinkLabel"></span><textarea id="shLinkText" rows="4" readonly spellcheck="false"></textarea></label>
      <p class="supporting" id="shLen"></p><p class="supporting" id="shNote"></p>
      <div class="row end"><button type="button" class="btn filled" id="shCopyBtn"></button><button value="close" class="btn text" id="shCloseBtn"></button></div></form>`;
    document.body.appendChild(d);
    d.querySelector('#shCopyBtn').addEventListener('click', () => copyLink(d.dataset.link || ''));
    d.querySelector('#shLinkText').addEventListener('focus', (e) => e.target.select());
    return d;
  }
  async function copyLink(link) {
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch { ok = false; }
    if (!ok) { try { const ta = $('shLinkText'); ta.focus(); ta.select(); ok = document.execCommand('copy'); } catch { ok = false; } }
    $('shDlgMsg').textContent = t(ok ? 'shCopied' : 'shCopyFailed');
    if (ok) M.toast(t('shCopied'));
    return ok;
  }
  async function share() {
    const d = ensureShareDialog();
    d.querySelector('#shDlgTitle').textContent = t('shTitle');
    d.querySelector('#shLinkLabel').textContent = t('shShare');
    d.querySelector('#shCopyBtn').textContent = t('shCopy'); d.querySelector('#shCloseBtn').textContent = t('shClose');
    d.querySelector('#shNote').textContent = t('shNote');
    const msg = d.querySelector('#shDlgMsg'), wrap = d.querySelector('#shLinkWrap'), copy = d.querySelector('#shCopyBtn');
    msg.textContent = ''; d.dataset.link = '';
    if (!supported()) {
      wrap.hidden = true; copy.hidden = true; d.querySelector('#shLen').textContent = ''; msg.textContent = t('shUnsupported'); msg.classList.add('err');
      if (!d.open) d.showModal();
      return null;
    }
    const r = await makeLink(M.getMap());
    d.querySelector('#shLen').textContent = `${t('shLength')}: ${r.length.toLocaleString('en-US')} ${t('shChars')}`;
    msg.classList.toggle('err', r.tooLong);
    if (r.tooLong) { wrap.hidden = true; copy.hidden = true; msg.textContent = t('shTooLong'); }
    else { wrap.hidden = false; copy.hidden = false; d.dataset.link = r.link; d.querySelector('#shLinkText').value = r.link; }
    if (!d.open) d.showModal();
    if (!r.tooLong) await copyLink(r.link);
    return r;
  }

  // ---------- opening a shared link ----------
  function clearHash() { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ } }
  let pending = false;
  async function handleHash() {
    const h = location.hash;
    if (!h.startsWith(PREFIX) || pending) return;
    pending = true;
    try {
      let map = null;
      if (supported()) { try { map = M.validateMap(JSON.parse(await unpack(h.slice(PREFIX.length)))); } catch { map = null; } }
      if (!map) { clearHash(); M.toast(t('shBadLink')); return; }
      await waitForNoDialog();
      await askOpen(map);
    } finally { pending = false; }
  }
  const waitForNoDialog = () => new Promise((res) => {
    let n = 0; const tick = () => { if (!document.querySelector('dialog[open]') || ++n > 300) res(); else setTimeout(tick, 400); }; tick();
  });
  function askOpen(map) {
    return new Promise((res) => {
      let d = $('shOpenDialog');
      if (!d) {
        d = document.createElement('dialog'); d.id = 'shOpenDialog'; d.setAttribute('aria-labelledby', 'shOpenTitle');
        d.innerHTML = `<form method="dialog" class="dialog-body"><h2 id="shOpenTitle" class="headline"></h2><p id="shOpenBody"></p>
          <p class="supporting" id="shOpenInfo"></p>
          <div class="row end"><button value="dismiss" class="btn text" id="shDismissBtn"></button><button value="open" class="btn filled" id="shOpenBtn"></button></div></form>`;
        document.body.appendChild(d);
      }
      d.querySelector('#shOpenTitle').textContent = t('shOpenTitle'); d.querySelector('#shOpenBody').textContent = t('shOpenBody');
      d.querySelector('#shOpenInfo').textContent = `${map.title} · ${map.lines.length} ${t('scRoutes')} · ${Object.keys(map.stations).length} ${t('stations')}`;
      d.querySelector('#shDismissBtn').textContent = t('shDismiss'); d.querySelector('#shOpenBtn').textContent = t('shOpenBtn');
      d.returnValue = '';
      const done = () => {
        d.removeEventListener('close', done); clearHash();
        if (d.returnValue === 'open') openShared(map);
        res();
      };
      d.addEventListener('close', done);
      d.showModal();
    });
  }
  function openShared(map) {
    const S = window.GMMCScenarios;
    if (S) { S.create(t('shSharedName'), map); M.toast(t('shOpened')); }
    else { M.replaceMap(map); M.toast(t('shOpenedReplace')); }
  }

  // ---------- hooks ----------
  on('scenarioSheet', (slot) => {
    if (!slot || slot.querySelector('#shShareBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn outlined'; b.id = 'shShareBtn'; b.textContent = t('shShare');
    b.addEventListener('click', () => { share(); });
    slot.appendChild(b);
  });
  on('ready', (GMMC) => {
    M = GMMC;
    const menu = $('exportMenu');
    if (menu) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.id = 'shMenuItem';
      b.innerHTML = `${window.icon('public', 24)}<span>${esc(t('shShare'))}</span>`;
      const hrs = menu.querySelectorAll('hr'); menu.insertBefore(b, hrs[0] || null);
      b.addEventListener('click', () => { menu.hidden = true; $('exportBtn').setAttribute('aria-expanded', 'false'); share(); });
    }
    window.GMMCShare = { makeLink, share, pack, unpack, handleHash, MAX_LINK };
    window.addEventListener('hashchange', handleHash);
    handleHash();
  });
})();
