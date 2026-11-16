// Target: this computer without Docker. A web server inside this app serves the bundled site. Each
// instance has its own server, port and starting map. The servers run inside this app's process, so
// they stop when the app closes (unless "Keep running after closing" holds the window in the tray).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { portNum, lanAddresses, get, portFree } = require('../../shared/common');
const { createServer } = require('../lib/site');

const servers = new Map(); // instance id -> { server, port }

const RULE = (port) => 'netsh advfirewall firewall add rule name="GTHA Metro Map ' + port + '" dir=in action=allow protocol=TCP localport=' + port;
const firewallHelp = (port) => 'Windows Firewall may be blocking port ' + port + ' for other devices. To allow it, run this once in an administrator Command Prompt: ' + RULE(port);

function closeServer(id) {
  return new Promise((resolve) => { const e = servers.get(id); if (!e) { resolve(); return; } servers.delete(id); e.server.closeAllConnections?.(); e.server.close(() => resolve()); });
}
const isRunning = (id) => (id ? servers.has(id) : servers.size > 0);
async function stopAll() { for (const id of Array.from(servers.keys())) await closeServer(id); }

const mapFileOf = (ctx) => path.join(ctx.instDir, 'default-map.json');

async function listen(inst, ctx, mapText) {
  const port = portNum(inst.port);
  if (!port) throw new Error('The port must be a whole number from 1024 to 65535.');
  await closeServer(inst.id);
  const free = await portFree(port); if (!free.ok) throw new Error('Port ' + port + ' is already in use. Choose another port in Settings.');
  await new Promise((resolve, reject) => {
    const s = createServer(ctx.siteDir, () => mapText || null);
    s.once('error', (e) => reject(new Error(e.code === 'EADDRINUSE' ? 'Port ' + port + ' is already in use. Choose another port in Settings.' : 'The server could not start: ' + e.message)));
    s.listen(port, '0.0.0.0', () => { servers.set(inst.id, { server: s, port }); resolve(); });
  });
  ctx.log('Listening on 0.0.0.0:' + port);
}

async function verify(inst, ctx) {
  ctx.emit(70, 'Checking your network address');
  const links = [];
  for (const ip of lanAddresses().slice(0, 4)) {
    const url = 'http://' + ip + ':' + inst.port + '/';
    if ((await get(url)) === 200 && (await get(url + 'app/index.html')) === 200) links.push({ label: ip, url, kind: 'url' });
  }
  if (!links.length) {
    if ((await get('http://127.0.0.1:' + inst.port + '/')) === 200) throw new Error('The server runs on this computer, but no network address answered. ' + firewallHelp(inst.port));
    throw new Error('The built-in server did not answer.');
  }
  return links;
}

async function deploy(ctx) {
  const inst = ctx.inst;
  fs.mkdirSync(ctx.instDir, { recursive: true });
  if (ctx.mapText) fs.writeFileSync(mapFileOf(ctx), ctx.mapText, 'utf8'); else fs.rmSync(mapFileOf(ctx), { force: true });
  ctx.emit(20, 'Starting the built-in web server');
  await listen(inst, ctx, ctx.mapText);
  const links = await verify(inst, ctx);
  return { links, note: 'Verified from this computer. If another device cannot open it, ' + firewallHelp(inst.port), patch: { url: links[0].url, version: ctx.version, where: 'This app · port ' + inst.port } };
}

const mapText = (ctx) => { try { return fs.readFileSync(mapFileOf(ctx), 'utf8'); } catch { return null; } };
async function state(inst) { return { exists: true, running: servers.has(inst.id), reason: '' }; }
async function start(inst, ctx) { await listen(inst, ctx, mapText(ctx)); await verify(inst, ctx); return {}; }
async function stop(inst) { await closeServer(inst.id); return {}; }
async function restart(inst, ctx) { await closeServer(inst.id); return start(inst, ctx); }
async function logs(inst) { return servers.has(inst.id) ? 'The built-in server is listening on port ' + inst.port + '. It keeps no request log.' : 'The built-in server is stopped.'; }
async function remove(inst, ctx) { await closeServer(inst.id); fs.rmSync(ctx.instDir, { recursive: true, force: true }); return {}; }
async function update(inst, ctx, latest) {
  // The server serves the site bundled in this app, so updating means restarting it from this app's files.
  await restart(inst, ctx);
  return { links: await verify(inst, ctx), patch: { version: latest } };
}

module.exports = { deploy, state, start, stop, restart, logs, remove, update, isRunning, stopAll, firewallHelp };
