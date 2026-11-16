// Helpers shared by the server setup wizard and the deploy app.
'use strict';
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');

const IMAGE = 'ghcr.io/ding-ding-projects/gtha-metro-map-creator';
const portNum = (p) => { const n = Number(p); return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : null; };
const tagOk = (t) => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(t);

function lanAddresses() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) list.push({ name, address: a.address });
  }
  // Prefer real adapters; virtual ones (Hyper-V, WSL, Docker, VirtualBox, VMware) are not reachable from other devices.
  const virtual = (x) => /vEthernet|WSL|Docker|VirtualBox|VMware|Hyper-V|Loopback/i.test(x.name) || x.address.startsWith('192.168.56.');
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const real = list.filter((x) => !virtual(x));
  return (real.length ? real : list).sort((a, b) => rank(a.address) - rank(b.address)).map((x) => x.address).filter((v, i, arr) => arr.indexOf(v) === i);
}

// Resolves with the HTTP status code, or 0 when nothing answered in time.
function get(url, timeout = 3000) {
  return new Promise((resolve) => {
    let req;
    try { req = http.get(url, { timeout }, (res) => { res.resume(); resolve(res.statusCode); }); } catch { resolve(0); return; }
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
  });
}

// Resolves with { ok: true } when the port is free, else { ok: false, reason }.
function portFree(p) {
  return new Promise((resolve) => {
    const n = portNum(p); if (!n) { resolve({ ok: false, reason: 'range' }); return; }
    // A test bind is not enough on Windows, where Docker's port forwarding may not block it,
    // so first see whether anything already answers on the port.
    const probe = net.connect({ host: '127.0.0.1', port: n });
    const done = (busy) => {
      probe.destroy();
      if (busy) { resolve({ ok: false, reason: 'busy' }); return; }
      const s = net.createServer();
      s.once('error', () => resolve({ ok: false, reason: 'busy' }));
      s.once('listening', () => s.close(() => resolve({ ok: true })));
      s.listen(n, '0.0.0.0');
    };
    probe.setTimeout(700, () => done(false));
    probe.once('connect', () => done(true));
    probe.once('error', () => done(false));
  });
}

// First free port from "start" upward that is not in "avoid" (ports other instances already own).
async function findFreePort(start, avoid = [], span = 200) {
  const taken = new Set(avoid.map(Number));
  for (let p = start; p < start + span && p <= 65535; p++) {
    if (taken.has(p) || p < 1024) continue;
    if ((await portFree(p)).ok) return p;
  }
  return null;
}
const slugify = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'map';
const INSTANCE_LABEL = 'io.github.dingdingprojects.gmmc.instance';
const RELEASE_REPO = 'Ding-Ding-Projects/gtha-metro-map-creator';

module.exports = { IMAGE, portNum, tagOk, lanAddresses, get, portFree, findFreePort, slugify, INSTANCE_LABEL, RELEASE_REPO };
