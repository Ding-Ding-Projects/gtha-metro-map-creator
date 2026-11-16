// Usage: node scripts/verify/edge-drive.mjs <url> <steps.json> <out dir> [width] [height]
// Drive headless Edge over CDP: node edge-drive.mjs <url> <steps.json> <outdir> [width] [height]
// steps: [{wait:ms} | {name, js} | {shot:"file.png"}]
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [url, stepsFile, outDir, W = '1440', H = '900'] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const prof = path.join(outDir, 'profile');
const port = 9400 + Math.floor(Math.random() * 300);
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-features=msImplicitSignin,msEdgeSignInPromo,msSyncConsentPromo', '--inprivate', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, url], { stdio: 'ignore' });
const kill = () => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
const killer = setTimeout(() => { kill(); console.log('HARD TIMEOUT'); process.exit(3); }, 240000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 40 && !target; i++) { await sleep(500); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = l.find((x) => x.type === 'page'); } catch {} }
if (!target) { kill(); console.log('NO TARGET'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' ')); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
if (process.env.EDGE_SCHEME) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: process.env.EDGE_SCHEME }] });
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: +W < 600 });
for (const s of steps) {
  if (s.wait) { await sleep(s.wait); continue; }
  if (s.shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, s.shot), Buffer.from(r.result.data, 'base64')); console.log('shot', s.shot); continue; }
  const r = await send('Runtime.evaluate', { expression: s.js, awaitPromise: true, returnByValue: true });
  console.log(s.name + ':', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r.error));
}
console.log('page errors:', JSON.stringify(errors));
ws.close(); kill(); clearTimeout(killer); console.log('torn down');
