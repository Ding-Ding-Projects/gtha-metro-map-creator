// Target 1: this computer with Docker. Pulls the published image and starts it with Compose.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { IMAGE, portNum, tagOk, lanAddresses, get, portFree } = require('../../shared/common');
const { run } = require('../lib/proc');

const DOCROOT_MAP = '/usr/share/nginx/html/app/default-map.json';

// Adds a read-only mount so the chosen map is the one the editor opens first.
function composeWithMap(text) {
  return text.replace(/(\n    restart:)/, '\n    volumes:\n      - ./default-map.json:' + DOCROOT_MAP + ':ro$1');
}

async function deploy(ctx) {
  const s = ctx.settings;
  const port = portNum(s.port); const tag = String(s.tag || 'latest').trim();
  if (!port) throw new Error('The port must be a whole number from 1024 to 65535.');
  if (!tagOk(tag)) throw new Error('The image tag has characters that are not allowed.');
  ctx.emit(5, 'Checking Docker');
  const engine = await run('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 20000 });
  if (engine.code === -1) throw new Error('Docker is not installed. Install Docker Desktop, then try again.');
  if (engine.code !== 0) throw new Error('Docker is not running. Start Docker Desktop, then try again.');
  const compose = await run('docker', ['compose', 'version', '--short'], { timeout: 20000 });
  if (compose.code !== 0) throw new Error('Docker Compose v2 was not found. Update Docker Desktop.');
  ctx.log('Docker Engine ' + engine.out.trim() + ', Compose ' + compose.out.trim());

  ctx.emit(10, 'Checking port ' + port);
  const free = await portFree(port);
  if (!free.ok) {
    const ours = await run('docker', ['ps', '--filter', 'label=com.docker.compose.project=gtha-metro-map-creator', '--format', '{{.Ports}}'], { timeout: 20000 });
    if (!(ours.code === 0 && ours.out.includes(':' + port + '->'))) throw new Error('Port ' + port + ' is already in use. Choose another port in Settings.');
    ctx.log('Port ' + port + ' is used by this map server and will be updated.');
  }

  ctx.emit(15, 'Downloading the image');
  const image = IMAGE + ':' + tag;
  const pull = await run('docker', ['pull', image], { timeout: 600000, signal: ctx.signal, onLine: (l) => ctx.log(l) });
  if (pull.code !== 0) throw new Error('The image download failed: ' + pull.out.trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 300));

  ctx.emit(60, 'Starting the container');
  const dir = path.join(ctx.userData, 'docker');
  fs.mkdirSync(dir, { recursive: true });
  const base = fs.readFileSync(ctx.composeSrc, 'utf8');
  const file = path.join(dir, 'compose.yaml');
  if (ctx.mapText) { fs.writeFileSync(path.join(dir, 'default-map.json'), ctx.mapText, 'utf8'); fs.writeFileSync(file, composeWithMap(base)); } else fs.writeFileSync(file, base);
  const up = await run('docker', ['compose', '-f', file, 'up', '-d', '--force-recreate'], { env: { GMMC_PORT: String(port), GMMC_TAG: tag }, timeout: 180000, signal: ctx.signal, onLine: (l) => ctx.log(l) });
  if (up.code !== 0) throw new Error('Docker Compose could not start the server: ' + up.out.trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 300));

  ctx.emit(80, 'Waiting for the health check');
  const t0 = Date.now(); let healthy = false;
  while (Date.now() - t0 < 60000) {
    if ((await get('http://127.0.0.1:' + port + '/healthz')) === 200) { healthy = true; break; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!healthy) throw new Error('The container started but did not answer its health check within 60 seconds.');

  ctx.emit(92, 'Checking your network address');
  const links = [];
  for (const ip of lanAddresses().slice(0, 4)) {
    const url = 'http://' + ip + ':' + port + '/';
    if ((await get(url)) === 200) links.push({ label: ip, url, kind: 'url' });
  }
  if (!links.length) throw new Error('The server answers on this computer, but not on a network address. Check Windows Firewall for port ' + port + '.');
  return { links };
}

module.exports = { deploy, composeWithMap };
