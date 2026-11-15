// Usage: node scripts/verify/drive-exe.mjs <portable exe> <debug port> <steps.json> [screenshot.png]
// Launch a built portable exe hidden, drive its page over loopback CDP, then tear it down.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
const [exe, port, scriptFile, shotFile] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
const child = spawn(exe, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env: { ...process.env, GMMC_HIDDEN: '1' }, stdio: 'ignore' });
const killer = setTimeout(() => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} console.log('HARD TIMEOUT, torn down'); process.exit(3); }, 330000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 60 && !target; i++) { await sleep(1000); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const pages = l.filter((x) => x.type === 'page'); if (pages.length === 1) target = pages[0]; else if (pages.length > 1) throw new Error('More than one page: ' + pages.map((p) => p.url).join(', ')); } catch (e) { if (String(e.message).startsWith('More')) throw e; } }
if (!target) { console.log('NO TARGET'); execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F']); process.exit(1); }
console.log('target', target.url);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
for (const s of steps) {
  if (s.wait) { await sleep(s.wait); continue; }
  const r = await send('Runtime.evaluate', { expression: s.js, awaitPromise: true, returnByValue: true });
  console.log(s.name + ':', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r.error));
}
if (shotFile) { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) { fs.writeFileSync(shotFile, Buffer.from(r.result.data, 'base64')); console.log('shot', shotFile); } else console.log('shot failed', JSON.stringify(r.error)); }
ws.close();
try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
console.log('torn down', child.pid); clearTimeout(killer);
