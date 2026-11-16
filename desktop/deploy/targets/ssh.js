// Target: a remote server over SSH. Uses the system OpenSSH client with key or agent login only.
// Each instance lives in its own folder (<base folder>/<name>) as its own Compose project, with a
// label that names the instance. Remote containers are found by that label, so containers on the
// server that this app did not create are never touched.
'use strict';
const fs = require('node:fs');
const { portNum, tagOk, get, INSTANCE_LABEL } = require('../../shared/common');
const { run } = require('../lib/proc');
const { composeText } = require('./docker');

const HOST_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const USER_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/;
const FOLDER_RE = /^(?!-)(?:~\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

// Returns { host, user, sshPort, folder, key, webPort, tag } with every value checked, or throws an Error with a plain reason.
// Only these checked values are ever placed in the remote command.
function validate(s) {
  const host = String(s.host || '').trim(); const user = String(s.user || '').trim();
  const folder = String(s.folder || '~/gtha-map').trim(); const key = String(s.key || '').trim();
  const sshPort = Number(s.sshPort || 22); const webPort = portNum(s.port || 8080);
  if (!host) throw new Error('Enter the server name or address.');
  if (!HOST_RE.test(host) || host.length > 253) throw new Error('The server name has characters that are not allowed. Use letters, digits, dots and hyphens.');
  if (!user) throw new Error('Enter the user name for the server.');
  if (!USER_RE.test(user)) throw new Error('The user name has characters that are not allowed.');
  if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) throw new Error('The SSH port must be a whole number from 1 to 65535.');
  if (!webPort) throw new Error('The website port must be a whole number from 1024 to 65535.');
  if (!FOLDER_RE.test(folder) || folder.split('/').includes('..') || folder.length > 200) throw new Error('The remote folder may use letters, digits, dots, hyphens, underscores and slashes only, for example ~/gtha-map.');
  if (key && !fs.existsSync(key)) throw new Error('The key file was not found: ' + key);
  const tag = String(s.tag || 'latest').trim();
  if (!tagOk(tag)) throw new Error('The image tag has characters that are not allowed.');
  return { host, user, sshPort, folder, key, webPort, tag };
}

// "~/x" becomes "$HOME/x" inside double quotes; every other character was validated above, so nothing can break out.
const remoteDir = (folder) => '"' + (folder.startsWith('~/') ? '$HOME/' + folder.slice(2) : folder) + '"';

function sshArgs(v, command) {
  const a = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=10', '-o', 'StrictHostKeyChecking=accept-new', '-p', String(v.sshPort)];
  if (v.key) a.push('-i', v.key);
  a.push('--', v.user + '@' + v.host, command);
  return a;
}

function explain(r) {
  const t = r.out.trim();
  if (r.timedOut) return 'The server did not answer in time.';
  if (/Permission denied/i.test(t)) return 'The server refused the key. Use a key file, or load your key into ssh-agent. Passwords are not typed into this app.';
  if (/Could not resolve hostname|Name or service not known/i.test(t)) return 'The server name could not be found.';
  if (/Connection (refused|timed out)|timed out|No route to host/i.test(t)) return 'Could not connect to the server. Check the address, the SSH port and your network.';
  if (/Host key verification failed/i.test(t)) return 'The server\'s host key changed. Remove the old entry from known_hosts if you trust the change.';
  if (r.code === -1) return 'The ssh program was not found. Install the Windows OpenSSH Client (Settings, Optional features).';
  return t.split(/\r?\n/).slice(-2).join(' ').slice(0, 300) || 'The remote command failed with code ' + r.code + '.';
}

// The connection details of an instance, from its record. The remote instance folder is <base>/<slug>.
function connOf(inst) {
  const r = inst.run;
  const v = validate({ host: r.host, user: r.user, sshPort: r.sshPort, folder: r.remoteDir, key: r.key, port: inst.port, tag: inst.tag || 'latest' });
  return v;
}
const label = (inst) => 'label=' + INSTANCE_LABEL + '=' + inst.id;
const remote = (v, inst, command, opts) => run('ssh', sshArgs(v, command), Object.assign({ timeout: 60000 }, opts || {}));
const COMPOSE = (inst, dir) => 'docker compose -p gmmc-' + inst.slug + ' -f ' + dir + '/compose.yaml';

async function deploy(ctx) {
  const inst = ctx.inst; const s = ctx.settings;
  const base = validate(Object.assign({}, s, { port: inst.port, tag: inst.tag }));
  const folder = base.folder.replace(/\/+$/, '') + '/' + inst.slug;
  const v = Object.assign({}, base, { folder });
  const dir = remoteDir(folder);
  const opts = (extra) => Object.assign({ timeout: 30000, signal: ctx.signal, onLine: (l) => ctx.log(l) }, extra);
  ctx.emit(8, 'Connecting to ' + v.host);
  const probe = await run('ssh', sshArgs(v, 'docker compose version --short'), opts());
  if (probe.code !== 0) {
    if (/command not found|not found/i.test(probe.out) && probe.code !== 255) throw new Error('Docker Compose v2 is not installed on the server.');
    throw new Error(explain(probe));
  }
  ctx.log('Remote Docker Compose ' + probe.out.trim().split(/\r?\n/).pop());
  if (!ctx.known) {
    // A new instance must not take a port another container on the server already publishes.
    const used = await run('ssh', sshArgs(v, 'docker ps --format "{{.Ports}}"'), opts());
    if (used.code === 0 && new RegExp(':' + v.webPort + '->').test(used.out)) throw new Error('Port ' + v.webPort + ' is already published by a container on the server. Choose another website port.');
  }

  ctx.emit(20, 'Uploading compose.yaml');
  const upC = await run('ssh', sshArgs(v, 'mkdir -p ' + dir + ' && cat > ' + dir + '/compose.yaml'), opts({ input: composeText(Object.assign({}, inst, { port: v.webPort, tag: v.tag }), { map: !!ctx.mapText }) }));
  if (upC.code !== 0) throw new Error('Could not write to the remote folder: ' + explain(upC));
  if (ctx.mapText) {
    const upM = await run('ssh', sshArgs(v, 'cat > ' + dir + '/default-map.json'), opts({ input: ctx.mapText }));
    if (upM.code !== 0) throw new Error('Could not upload the starting map: ' + explain(upM));
  } else await run('ssh', sshArgs(v, 'rm -f ' + dir + '/default-map.json'), opts());

  ctx.emit(35, 'Downloading the image on the server');
  const pull = await run('ssh', sshArgs(v, COMPOSE(inst, dir) + ' pull'), opts({ timeout: 600000 }));
  if (pull.code !== 0) throw new Error('docker compose pull failed: ' + explain(pull));
  ctx.emit(65, 'Starting the server');
  const up = await run('ssh', sshArgs(v, COMPOSE(inst, dir) + ' up -d --force-recreate'), opts({ timeout: 180000 }));
  if (up.code !== 0) throw new Error('docker compose up failed: ' + explain(up));

  const url = await verifyWeb(v, opts, ctx);
  const ver = await run('ssh', sshArgs(v, 'docker ps --filter ' + label(inst) + ' --format "{{.Image}}"'), opts());
  void ver;
  return { links: [{ label: v.host, url, kind: 'url' }], patch: { url, version: ctx.version, where: v.user + '@' + v.host + ' · ' + folder, run: Object.assign({}, inst.run, { host: v.host, user: v.user, sshPort: v.sshPort, key: v.key, remoteDir: folder }) } };
}

async function verifyWeb(v, opts, ctx) {
  ctx.emit(85, 'Checking the website');
  const url = 'http://' + v.host + ':' + v.webPort + '/';
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) { ok = (await get(url, 4000)) === 200; if (!ok) await new Promise((r) => setTimeout(r, 2000)); }
  if (!ok) {
    const inside = await run('ssh', sshArgs(v, 'curl -fsS -o /dev/null http://127.0.0.1:' + v.webPort + '/healthz && echo healthy'), opts({ timeout: 20000 }));
    if (inside.code === 0 && /healthy/.test(inside.out)) throw new Error('The server runs, but ' + url + ' does not answer from this computer. Open port ' + v.webPort + ' in the server\'s firewall.');
    throw new Error('The server was started but the website did not answer at ' + url + '.');
  }
  return url;
}

// Remote container ids of this instance, found by label.
async function ids(v, inst) {
  const r = await remote(v, inst, 'docker ps -a --filter ' + label(inst) + ' --format "{{.ID}}|{{.State}}"');
  if (r.code !== 0) throw new Error(explain(r));
  return r.out.split(/\r?\n/).filter(Boolean).map((l) => { const [id, state] = l.split('|'); return { id, state }; }).filter((x) => /^[0-9a-f]{6,64}$/.test(x.id));
}
async function state(inst) {
  try { const c = await ids(connOf(inst), inst); return { exists: c.length > 0, running: c.some((x) => x.state === 'running'), reason: c.length ? '' : 'The container no longer exists on the server.' }; } catch (e) { return { exists: false, running: false, reason: e.message, unknown: true }; }
}
async function act(verb, inst) {
  const v = connOf(inst); const c = await ids(v, inst);
  if (!c.length) throw new Error('The container for this instance no longer exists on the server.');
  const r = await remote(v, inst, 'docker ' + verb + ' ' + c.map((x) => x.id).join(' '), { timeout: 120000 });
  if (r.code !== 0) throw new Error('docker ' + verb + ' failed: ' + explain(r));
  return {};
}
const start = (inst) => act('start', inst);
const stop = (inst) => act('stop', inst);
const restart = (inst) => act('restart', inst);
async function logs(inst) {
  const v = connOf(inst); const c = await ids(v, inst);
  if (!c.length) return '(The container no longer exists on the server.)';
  const r = await remote(v, inst, 'docker logs --tail 200 ' + c[0].id);
  return r.code === 0 ? r.out.trim() || '(No output yet.)' : explain(r);
}
async function remove(inst) {
  const v = connOf(inst); const c = await ids(v, inst);
  if (c.length) { const r = await remote(v, inst, 'docker rm -f ' + c.map((x) => x.id).join(' '), { timeout: 120000 }); if (r.code !== 0) throw new Error('docker rm failed: ' + explain(r)); }
  const dir = remoteDir(v.folder);
  // Delete only the files this app wrote, then the folder if that leaves it empty.
  await remote(v, inst, 'rm -f ' + dir + '/compose.yaml ' + dir + '/default-map.json && rmdir ' + dir + ' 2>/dev/null; true');
  return {};
}
async function update(inst, ctx, latest) {
  const v = connOf(inst); const dir = remoteDir(v.folder);
  const tag = inst.tag === 'latest' ? 'latest' : latest;
  const cur = await remote(v, inst, 'cat ' + dir + '/compose.yaml');
  if (cur.code !== 0) throw new Error('The compose file is missing on the server.');
  const text = cur.out.replace(/(gtha-metro-map-creator:)[A-Za-z0-9_.-]+/, '$1' + tag);
  await run('ssh', sshArgs(v, 'cat > ' + dir + '/compose.yaml'), { input: text, timeout: 30000 });
  const pull = await remote(v, inst, COMPOSE(inst, dir) + ' pull', { timeout: 600000 }); if (pull.code !== 0) throw new Error('docker compose pull failed: ' + explain(pull));
  const up = await remote(v, inst, COMPOSE(inst, dir) + ' up -d --force-recreate', { timeout: 180000 }); if (up.code !== 0) throw new Error('docker compose up failed: ' + explain(up));
  const url = await verifyWeb(v, (e) => Object.assign({ timeout: 30000 }, e), ctx);
  return { links: [{ label: v.host, url, kind: 'url' }], patch: { tag, version: latest, url } };
}

module.exports = { deploy, state, start, stop, restart, logs, remove, update, validate, remoteDir, sshArgs, connOf };
