// Target: this computer with Docker. Each instance is its own Compose project (gmmc-<name>) with its
// own port, its own starting map and a label that names the instance. The manager finds an
// instance's containers by that label, never by name, so containers it did not create are never
// listed, stopped or removed.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { IMAGE, portNum, tagOk, lanAddresses, get, portFree, INSTANCE_LABEL } = require('../../shared/common');
const { run } = require('../lib/proc');

// The Compose file for one instance. The map, when set, is mounted read-only so the editor opens it first.
function composeText(inst, opts) {
  const lines = [
    '# Written by the GTHA Metro Map Creator deploy app. Instance ' + inst.id + '.',
    'name: gmmc-' + inst.slug,
    'services:',
    '  web:',
    '    image: ' + IMAGE + ':' + inst.tag,
    '    ports:', '      - "' + inst.port + ':8080"',
    // The sign-in hash comes from the .env file next to this file (empty means sign-in is off).
    '    environment:', '      GMMC_PASSWORD_HASH: ${GMMC_PASSWORD_HASH:-}',
    '    restart: unless-stopped', '    read_only: true', '    tmpfs:', '      - /tmp',
    '    labels:', '      ' + INSTANCE_LABEL + ': "' + inst.id + '"'
  ];
  if (opts && opts.map) lines.push('    volumes:', '      - ./default-map.json:/usr/share/nginx/html/app/default-map.json:ro');
  lines.push('    healthcheck:', '      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]', '      interval: 10s', '      timeout: 3s', '      retries: 3', '      start_period: 5s',
    'networks:', '  default:', '    labels:', '      ' + INSTANCE_LABEL + ': "' + inst.id + '"');
  return lines.join('\n') + '\n';
}

const NOT_INSTALLED = 'Docker is not installed. Install Docker Desktop, then try again.';
const NOT_RUNNING = 'Docker is not running. Start Docker Desktop, then try again.';
async function engine() {
  const e = await run('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 20000 });
  if (e.code === -1) throw new Error(NOT_INSTALLED);
  if (e.code !== 0) throw new Error(NOT_RUNNING);
  return e.out.trim();
}
// The instance's containers, found by label: [{ id, state, name }].
async function containers(inst) {
  const r = await run('docker', ['ps', '-a', '--filter', 'label=' + INSTANCE_LABEL + '=' + inst.id, '--format', '{{.ID}}|{{.State}}|{{.Names}}'], { timeout: 20000 });
  if (r.code !== 0) throw new Error(r.code === -1 ? NOT_INSTALLED : NOT_RUNNING);
  return r.out.split(/\r?\n/).filter(Boolean).map((l) => { const [id, state, name] = l.split('|'); return { id, state, name }; });
}
const tailOut = (r) => r.out.trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 300);

async function imageVersion(image) {
  const r = await run('docker', ['image', 'inspect', image, '--format', '{{index .Config.Labels "org.opencontainers.image.version"}}'], { timeout: 20000 });
  // The "latest" tag overwrites the label with the tag name, so only a real version number counts.
  const v = r.code === 0 ? r.out.trim() : '';
  return /^\d+\.\d+\.\d+/.test(v) ? v : '';
}

// Pulls the image, writes the Compose file and starts the project. Used for a new instance and for an update.
async function up(inst, ctx, label) {
  const dir = ctx.instDir; fs.mkdirSync(dir, { recursive: true });
  const image = IMAGE + ':' + inst.tag;
  ctx.emit(15, 'Downloading the image');
  // Hidden verification only: use an image that was built locally instead of downloading one.
  const noPull = process.env.GMMC_HIDDEN === '1' && process.env.GMMC_TEST_NO_PULL === '1';
  const pull = noPull ? { code: 0, out: '' } : await run('docker', ['pull', image], { timeout: 600000, signal: ctx.signal, onLine: (l) => ctx.log(l) });
  if (pull.code !== 0) throw new Error('The image download failed: ' + tailOut(pull));
  const hasMap = !!ctx.mapText;
  if (hasMap) fs.writeFileSync(path.join(dir, 'default-map.json'), ctx.mapText, 'utf8'); else fs.rmSync(path.join(dir, 'default-map.json'), { force: true });
  const file = path.join(dir, 'compose.yaml'); fs.writeFileSync(file, composeText(inst, { map: hasMap }));
  // Only the hash is written, never the password. The file is private to this user.
  if (inst.passwordHash) fs.writeFileSync(path.join(dir, '.env'), 'GMMC_PASSWORD_HASH=' + inst.passwordHash + '\n', { mode: 0o600 }); else fs.rmSync(path.join(dir, '.env'), { force: true });
  ctx.emit(60, label || 'Starting the container');
  const upc = await run('docker', ['compose', '-p', 'gmmc-' + inst.slug, '-f', file, 'up', '-d', '--force-recreate'], { timeout: 180000, signal: ctx.signal, onLine: (l) => ctx.log(l) });
  if (upc.code !== 0) throw new Error('Docker Compose could not start the server: ' + tailOut(upc));
  return imageVersion(image);
}

async function verify(inst, ctx) {
  ctx.emit(80, 'Waiting for the health check');
  const t0 = Date.now(); let healthy = false;
  while (Date.now() - t0 < 60000) {
    if ((await get('http://127.0.0.1:' + inst.port + '/healthz')) === 200) { healthy = true; break; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!healthy) throw new Error('The container started but did not answer its health check within 60 seconds.');
  if (inst.passwordHash) {
    // With sign-in on, the editor must send a visitor to the sign-in page (or answer 401), never serve itself.
    const gate = await get('http://127.0.0.1:' + inst.port + '/app/');
    if (![301, 302, 303, 401].includes(gate)) throw new Error('The server is running but did not ask for a password.');
  }
  ctx.emit(92, 'Checking your network address');
  const links = [];
  for (const ip of lanAddresses().slice(0, 4)) {
    const url = 'http://' + ip + ':' + inst.port + '/';
    // /healthz stays open when sign-in is on, so it is the right page to ask.
    if ((await get(inst.passwordHash ? url + 'healthz' : url)) === 200) links.push({ label: ip, url, kind: 'url' });
  }
  if (!links.length) throw new Error('The server answers on this computer, but not on a network address. Check Windows Firewall for port ' + inst.port + '.');
  return links;
}

async function deploy(ctx) {
  const inst = ctx.inst;
  if (!portNum(inst.port)) throw new Error('The port must be a whole number from 1024 to 65535.');
  if (!tagOk(inst.tag)) throw new Error('The image tag has characters that are not allowed.');
  ctx.emit(5, 'Checking Docker');
  const ver = await engine();
  const compose = await run('docker', ['compose', 'version', '--short'], { timeout: 20000 });
  if (compose.code !== 0) throw new Error('Docker Compose v2 was not found. Update Docker Desktop.');
  ctx.log('Docker Engine ' + ver + ', Compose ' + compose.out.trim());
  ctx.emit(10, 'Checking port ' + inst.port);
  const mine = (await containers(inst)).length > 0;
  if (!mine) { const free = await portFree(inst.port); if (!free.ok) throw new Error('Port ' + inst.port + ' is already in use. Choose another port in Settings.'); }
  const version = await up(inst, ctx);
  const links = await verify(inst, ctx);
  return { links, patch: { url: links[0].url, version, where: 'Docker · port ' + inst.port } };
}

async function state(inst) {
  try { await engine(); } catch (e) { return { exists: false, running: false, reason: e.message }; }
  const c = await containers(inst);
  return { exists: c.length > 0, running: c.some((x) => x.state === 'running'), reason: c.length ? '' : 'The container no longer exists.' };
}
async function act(verb, inst) {
  const c = await containers(inst);
  if (!c.length) throw new Error('The container for this instance no longer exists. Use Update to create it again, or Remove.');
  const r = await run('docker', [verb, ...c.map((x) => x.id)], { timeout: 120000 });
  if (r.code !== 0) throw new Error('Docker could not ' + verb + ' it: ' + tailOut(r));
  return {};
}
const quiet = { emit: () => {}, log: () => {} };
async function start(inst) { await act('start', inst); await verify(inst, quiet); return {}; }
const stop = (inst) => act('stop', inst);
async function restart(inst) { await act('restart', inst); await verify(inst, quiet); return {}; }
async function logs(inst) {
  const c = await containers(inst);
  if (!c.length) return '(The container no longer exists.)';
  const r = await run('docker', ['logs', '--tail', '200', c[0].id], { timeout: 30000 });
  return r.out.trim() || '(The container has not written anything yet.)';
}
async function remove(inst, ctx) {
  const c = await containers(inst);
  if (c.length) { const r = await run('docker', ['rm', '-f', ...c.map((x) => x.id)], { timeout: 120000 }); if (r.code !== 0) throw new Error('Docker could not remove the container: ' + tailOut(r)); }
  const nets = await run('docker', ['network', 'ls', '-q', '--filter', 'label=' + INSTANCE_LABEL + '=' + inst.id], { timeout: 20000 });
  const ids = nets.out.split(/\r?\n/).filter(Boolean);
  if (ids.length) await run('docker', ['network', 'rm', ...ids], { timeout: 30000 });
  fs.rmSync(ctx.instDir, { recursive: true, force: true });
  return {};
}
// Pulls the newest image and recreates the container, keeping the port and the starting map.
async function update(inst, ctx, latest) {
  const draft = Object.assign({}, inst, { tag: inst.tag === 'latest' ? 'latest' : latest });
  const mapFile = path.join(ctx.instDir, 'default-map.json');
  const mapText = fs.existsSync(mapFile) ? fs.readFileSync(mapFile, 'utf8') : '';
  await engine();
  const version = await up(draft, Object.assign({}, ctx, { mapText }), 'Recreating the container');
  const links = await verify(draft, ctx);
  return { links, patch: { tag: draft.tag, version: version || (draft.tag === 'latest' ? '' : latest), url: links[0].url } };
}

module.exports = { deploy, state, start, stop, restart, logs, remove, update, composeText, containers };
