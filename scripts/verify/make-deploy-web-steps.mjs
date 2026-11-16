// Generates scripts/verify/deploy-web.steps.json (run: node scripts/verify/make-deploy-web-steps.mjs).
// Drive it with: node scripts/serve.mjs <port> site, then
//   node scripts/verify/edge-drive.mjs http://127.0.0.1:<port>/app/index.html scripts/verify/deploy-web.steps.json <out dir> 1280 900
// and again with width 390 to check the narrow layout.
import fs from 'node:fs';
const S = [];
const js = (name, f) => S.push({ name, js: `(${f.toString()})()` });
S.push({ wait: 2000 });
js('open', async () => { await window.GMMCDeploy.open(); await new Promise((r) => setTimeout(r, 700)); const d = document.getElementById('deployDialog'); return { open: d.open, title: d.querySelector('.dp-title').textContent, cards: d.querySelectorAll('.dp-card').length }; });
S.push({ shot: 'deploy-open.png' });
js('disabled targets', () => { const d = document.getElementById('deployDialog'); return ['docker', 'builtin', 'ssh', 'pages', 'folder'].map((id) => { const c = d.querySelector('[data-target=' + id + ']'); const w = c.querySelector('.dp-why'); return { id, disabled: c.querySelector('input[type=checkbox]').disabled, chip: c.querySelector('.dp-chip').textContent, why: w.hidden ? '' : w.textContent, link: w.hidden ? '' : c.querySelector('.dp-why-link').href }; }); });
js('zip deploy', async () => {
  window.__zip = null; const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { const n = this.download; fetch(this.href).then((r) => r.arrayBuffer()).then((b) => { window.__zip = { name: n, bytes: new Uint8Array(b) }; }); return; } return orig.call(this); };
  const d = document.getElementById('deployDialog'); d.querySelector('.dp-deployAll').click();
  for (let i = 0; i < 60 && !window.__zip; i++) await new Promise((r) => setTimeout(r, 500));
  await new Promise((r) => setTimeout(r, 500));
  const c = d.querySelector('[data-target=folder]');
  return { chip: c.querySelector('.dp-chip').textContent, got: !!window.__zip, name: window.__zip && window.__zip.name, size: window.__zip && window.__zip.bytes.length, link: c.querySelector('.dp-url') && c.querySelector('.dp-url').textContent, note: c.querySelector('.dp-note').textContent };
});
S.push({ shot: 'deploy-zip-live.png' });
js('zip contents', async () => {
  const u8 = window.__zip.bytes; const dv = new DataView(u8.buffer); let e = u8.length - 22; while (dv.getUint32(e, true) !== 0x06054b50) e--;
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const ent = {};
  for (let i = 0; i < n; i++) { const m = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), len = dv.getUint16(p + 28, true), ex = dv.getUint16(p + 30, true), cm = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true); const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + len)); ent[name] = { m, cs, lo }; p += 46 + len + ex + cm; }
  const read = async (name) => { const x = ent[name]; const ln = dv.getUint16(x.lo + 26, true), le = dv.getUint16(x.lo + 28, true); const data = u8.subarray(x.lo + 30 + ln + le, x.lo + 30 + ln + le + x.cs); if (x.m === 0) return new TextDecoder().decode(data); const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(data); w.close(); return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer()); };
  const idx = await read('index.html'); const app = await read('app/index.html'); const map = JSON.parse(await read('app/default-map.json')); const names = Object.keys(ent);
  return { files: n, hasIndex: /<html/i.test(idx), appIsEditor: /GTHA Metro Map Creator/.test(app), hasDeployModule: names.includes('app/mod-deploy.js'), noManifest: !names.includes('site-manifest.json'), mapFormat: map.format || ('version ' + map.version), mapTitle: (map.map || map).title, editorTitle: window.GMMC.getMap().title };
});
js('pages validation', async () => {
  const d = document.getElementById('deployDialog'); const set = (id, on) => { const c = d.querySelector('#dp-tick-' + id); if (c.checked !== on) c.click(); };
  set('folder', false); set('pages', true);
  const card = d.querySelector('[data-target=pages]'); card.querySelector('details').open = true;
  const wait = async (f) => { for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (f()) return true; } return false; };
  const out = {};
  d.querySelector('.dp-deployAll').click(); await wait(() => /Failed/.test(card.querySelector('.dp-chip').textContent)); out.noSignIn = card.querySelector('.dp-err').textContent;
  Array.from(card.querySelectorAll('button')).find((b) => b.textContent === 'Sign in with GitHub').click();
  const tok = card.querySelector('#dp-token'); const save = card.querySelector('#dp-token-save'); const msg = card.querySelector('#dp-token-msg');
  tok.value = 'abc'; save.click(); await wait(() => /does not look like/.test(msg.textContent)); out.shortToken = msg.textContent;
  tok.value = 'github_pat_' + 'x'.repeat(40); save.click(); await wait(() => /did not accept|Could not reach|refused/.test(msg.textContent)); out.badToken = msg.textContent; out.tokenFieldCleared = tok.value === ''; out.notStored = !localStorage.getItem('gmmc.deploy.token');
  return out;
});
js('repo validation', () => { const { parseRepo } = window.GMMCDeployCore; const bad = ['', 'a', 'a/b/c', 'a b/c', '../x', 'a/..'].map((x) => { try { parseRepo(x); return 'ACCEPTED ' + x; } catch { return 'rejected'; } }); const ok = parseRepo('https://github.com/Name/my-map.git'); return { bad, ok }; });
S.push({ shot: 'deploy-pages-form.png' });
js('cantonese', async () => { window.I18N.setLang('yue'); await window.GMMCDeploy.open(); const d = document.getElementById('deployDialog'); await new Promise((r) => setTimeout(r, 300)); return { title: d.querySelector('.dp-title').textContent, docker: d.querySelector('[data-target=docker] .dp-why').textContent, btn: d.querySelector('.dp-deployAll').textContent, chip: d.querySelector('[data-target=docker] .dp-chip').textContent }; });
S.push({ shot: 'deploy-yue.png' });
js('overflow', () => { const d = document.getElementById('deployDialog'); const dr = d.getBoundingClientRect(); const main = d.querySelector('.dp-main'); const wide = []; for (const e of d.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width && (r.right > dr.right + 1 || r.left < dr.left - 1)) wide.push(e.className || e.tagName); } return { vw: innerWidth, dialogW: Math.round(dr.width), mainScrollW: main.scrollWidth, mainClientW: main.clientWidth, docScrollW: document.documentElement.scrollWidth, escaping: wide.slice(0, 8) }; });
fs.writeFileSync(new URL('./deploy-web.steps.json', import.meta.url), JSON.stringify(S, null, 1));
