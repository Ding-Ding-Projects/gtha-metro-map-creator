// deploy-core.js: browser-safe deployment logic shared by the web editor (mod-deploy.js) and the
// desktop deploy app. It has no DOM and no Node dependency: a ZIP writer, the site file list, and the
// GitHub Pages publisher built on the GitHub REST API. See docs/features/deploy.md.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GMMCDeployCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const API = 'https://api.github.com';
  const MAP_NAME = 'app/default-map.json';
  const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
  const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
  const POLL_LIMIT_MS = 10 * 60 * 1000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const enc = (s) => new TextEncoder().encode(s);

  // ---- encoding helpers ----
  function toBase64(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }
  let crcTable = null;
  function crc32(u8) {
    if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ---- map validation ----
  // Returns the text when it is a GTHA Metro Map Creator map or project file, else throws an Error with a plain reason.
  function checkMapText(text) {
    if (text.length > 5 * 1024 * 1024) throw new Error('The map file is larger than 5 MB.');
    let obj; try { obj = JSON.parse(text); } catch { throw new Error('The map file is not valid JSON.'); }
    const m = obj && obj.format ? obj.map : obj;
    if (!m || typeof m !== 'object' || m.version !== 1 || !m.stations || typeof m.stations !== 'object' || !Array.isArray(m.lines)) throw new Error('That file is not a GTHA Metro Map Creator map.');
    return text;
  }

  // ---- ZIP ----
  // files: [{ rel, bytes: async () => Uint8Array }]. deflateRaw: async (u8) => Uint8Array, or null for stored entries.
  async function buildZip(files, deflateRaw) {
    const parts = []; const central = []; let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const data = await f.bytes(); const name = enc(f.rel); const crc = crc32(data);
      const comp = deflateRaw && data.length ? await deflateRaw(data) : data; const method = comp === data ? 0 : 8;
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, method, true);
      local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true); local.setUint32(18, comp.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      parts.push(new Uint8Array(local.buffer), name, comp);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, method, true);
      cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true); cd.setUint32(16, crc, true); cd.setUint32(20, comp.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + comp.length;
    }
    const cdLen = central.reduce((n, p) => n + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let o = 0;
    for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }

  // ---- GitHub Pages ----
  function parseRepo(text) {
    const m = String(text || '').trim().replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '').match(/^([^/\s]+)\/([^/\s]+)$/);
    if (!m || !OWNER_RE.test(m[1]) || !REPO_RE.test(m[2]) || m[2] === '.' || m[2] === '..') throw new Error('Enter the repository as owner/name, for example your-name/my-metro-map.');
    return { owner: m[1], repo: m[2] };
  }
  function checkToken(token) {
    if (!/^[A-Za-z0-9_]{20,255}$/.test(String(token || '').trim())) throw new Error('That does not look like a GitHub token. A fine-grained token starts with github_pat_.');
    return String(token).trim();
  }

  function client(token, f) {
    const doFetch = f || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
    return async function gh(method, path, body) {
      const res = await doFetch(API + path, {
        method, headers: Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000)
      });
      const text = await res.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      return { status: res.status, json };
    };
  }
  function problem(r, what) {
    if (r.status === 401) return new Error('GitHub did not accept the token. Check it and sign in again.');
    if (r.status === 403) return new Error(what + ': GitHub refused it (403). ' + ((r.json && r.json.message) || 'Check the token permissions: repository contents, administration and Pages, read and write.'));
    if (r.status === 404) return new Error(what + ': not found, or the token cannot see it.');
    return new Error(what + ': GitHub answered ' + r.status + (r.json && r.json.message ? ' (' + r.json.message + ')' : '') + '.');
  }
  async function whoami(token, f) {
    let r; try { r = await client(token, f)('GET', '/user'); } catch (e) { throw new Error('Could not reach GitHub: ' + (e && e.message ? e.message : e)); }
    if (r.status !== 200) throw problem(r, 'Signing in');
    return r.json.login;
  }
  async function pool(items, limit, fn) {
    let i = 0; const out = new Array(items.length);
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
    return out;
  }

  // o: { token, repo, files:[{rel, bytes}], emit(pct,msg), log(line), signal, fetch }
  // Returns { links:[{label,url,kind}] }. The token is only ever sent to api.github.com in a header.
  async function publishPages(o) {
    const { owner, repo } = parseRepo(o.repo); const token = checkToken(o.token);
    const gh = client(token, o.fetch); const emit = o.emit || (() => {}); const log = o.log || (() => {}); const branch = 'gh-pages';
    emit(4, 'Signing in to GitHub');
    const login = await whoami(token, o.fetch); log('Signed in as ' + login);
    emit(10, 'Checking the repository');
    const base = '/repos/' + owner + '/' + repo;
    let r = await gh('GET', base); let defaultBranch = 'main';
    if (r.status === 404) {
      log('Creating the public repository ' + owner + '/' + repo);
      const payload = { name: repo, private: false, auto_init: true, description: 'Map made with GTHA Metro Map Creator' };
      const create = owner.toLowerCase() === login.toLowerCase() ? await gh('POST', '/user/repos', payload) : await gh('POST', '/orgs/' + owner + '/repos', payload);
      if (create.status !== 201) throw problem(create, 'Creating the repository');
      defaultBranch = create.json.default_branch || 'main'; await sleep(2500);
    } else if (r.status === 200) {
      if (r.json.private) log('Note: the repository is private; GitHub Pages for private repositories needs a paid plan.');
      if (!r.json.permissions || !r.json.permissions.push) throw new Error('The signed-in account cannot write to ' + owner + '/' + repo + '.');
      defaultBranch = r.json.default_branch || 'main';
    } else throw problem(r, 'Checking the repository');

    emit(20, 'Uploading files');
    const files = o.files.concat([{ rel: '.nojekyll', bytes: async () => new Uint8Array(0) }]); let done = 0;
    const entries = await pool(files, 6, async (f) => {
      if (o.signal && o.signal.aborted) throw new Error('Cancelled.');
      const b = await gh('POST', base + '/git/blobs', { content: toBase64(await f.bytes()), encoding: 'base64' });
      if (b.status !== 201) throw problem(b, 'Uploading ' + f.rel);
      done++; emit(20 + Math.round((done / files.length) * 40), 'Uploading files ' + done + ' of ' + files.length);
      return { path: f.rel, mode: '100644', type: 'blob', sha: b.json.sha };
    });
    emit(62, 'Creating the commit');
    const tree = await gh('POST', base + '/git/trees', { tree: entries });
    if (tree.status !== 201) throw problem(tree, 'Creating the file tree');
    const ref = await gh('GET', base + '/git/ref/heads/' + branch);
    const parents = ref.status === 200 ? [ref.json.object.sha] : [];
    const commit = await gh('POST', base + '/git/commits', { message: 'Deploy GTHA Metro Map Creator', tree: tree.json.sha, parents });
    if (commit.status !== 201) throw problem(commit, 'Creating the commit');
    const upd = ref.status === 200 ? await gh('PATCH', base + '/git/refs/heads/' + branch, { sha: commit.json.sha, force: false }) : await gh('POST', base + '/git/refs', { ref: 'refs/heads/' + branch, sha: commit.json.sha });
    if (upd.status !== 200 && upd.status !== 201) throw problem(upd, 'Updating the ' + branch + ' branch');
    log('Published ' + files.length + ' files to ' + branch + ' (' + commit.json.sha.slice(0, 7) + ', default branch ' + defaultBranch + ')');

    emit(68, 'Turning on GitHub Pages');
    const pages = await gh('GET', base + '/pages');
    if (pages.status === 404) { const en = await gh('POST', base + '/pages', { source: { branch, path: '/' } }); if (en.status !== 201 && en.status !== 409) throw problem(en, 'Turning on GitHub Pages'); }
    else if (pages.status === 200) {
      if (!pages.json.source || pages.json.source.branch !== branch || pages.json.source.path !== '/') { const put = await gh('PUT', base + '/pages', { source: { branch, path: '/' } }); if (put.status !== 204) throw problem(put, 'Pointing GitHub Pages at ' + branch); }
    } else throw problem(pages, 'Reading the GitHub Pages settings');
    const info = await gh('GET', base + '/pages');
    const siteUrl = ((info.json && info.json.html_url) || 'https://' + owner.toLowerCase() + '.github.io/' + repo + '/').replace(/\/?$/, '/');
    emit(72, 'Waiting for GitHub to build the site');
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < POLL_LIMIT_MS) {
      if (o.signal && o.signal.aborted) throw new Error('Cancelled.');
      const b = await gh('GET', base + '/pages/builds/latest');
      if (b.status === 200 && b.json.status === 'errored') throw new Error('GitHub could not build the site: ' + ((b.json.error && b.json.error.message) || 'unknown error') + '.');
      if (b.status === 200 && b.json.status === 'built') {
        try {
          // Browsers cannot read another site's response without CORS, so a no-cors request only proves it answered.
          const res = await (o.fetch || fetch)(siteUrl + 'app/index.html', { cache: 'no-store', mode: o.probeMode || 'cors', signal: AbortSignal.timeout(10000) });
          if (res.status === 200 || res.type === 'opaque') return { links: [{ label: owner + '/' + repo, url: siteUrl, kind: 'url' }] };
        } catch { /* not reachable yet */ }
      }
      n++; emit(Math.min(96, 72 + n), 'Waiting for GitHub to build the site (' + Math.round((Date.now() - t0) / 1000) + ' s)');
      await sleep(6000);
    }
    throw new Error('GitHub did not finish building the site within 10 minutes. It may still appear at ' + siteUrl + ' shortly; press Retry to check again.');
  }

  return { MAP_NAME, checkMapText, buildZip, parseRepo, checkToken, whoami, publishPages, crc32, toBase64 };
});
