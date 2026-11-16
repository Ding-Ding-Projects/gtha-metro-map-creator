// Target 3: a remote server over SSH. Uses the system OpenSSH client with key or agent login only.
'use strict';
const fs = require('node:fs');
const { portNum, tagOk, get } = require('../../shared/common');
const { run } = require('../lib/proc');

const HOST_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const USER_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/;
const FOLDER_RE = /^(?!-)(?:~\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

// Returns { host, user, sshPort, folder, key } with every value checked, or throws an Error with a plain reason.
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

async function deploy(ctx) {
  const v = validate(ctx.settings);
  const dir = remoteDir(v.folder);
  const opts = (extra) => Object.assign({ timeout: 30000, signal: ctx.signal, onLine: (l) => ctx.log(l) }, extra);
  ctx.emit(8, 'Connecting to ' + v.host);
  const probe = await run('ssh', sshArgs(v, 'docker compose version --short'), opts());
  if (probe.code !== 0) {
    if (/command not found|not found/i.test(probe.out) && probe.code !== 255) throw new Error('Docker Compose v2 is not installed on the server.');
    throw new Error(explain(probe));
  }
  ctx.log('Remote Docker Compose ' + probe.out.trim().split(/\r?\n/).pop());

  ctx.emit(20, 'Uploading compose.yaml');
  const compose = fs.readFileSync(ctx.composeSrc, 'utf8');
  const upC = await run('ssh', sshArgs(v, 'mkdir -p ' + dir + ' && cat > ' + dir + '/compose.yaml'), opts({ input: ctx.mapText ? require('./docker').composeWithMap(compose) : compose }));
  if (upC.code !== 0) throw new Error('Could not write to the remote folder: ' + explain(upC));
  if (ctx.mapText) {
    const upM = await run('ssh', sshArgs(v, 'cat > ' + dir + '/default-map.json'), opts({ input: ctx.mapText }));
    if (upM.code !== 0) throw new Error('Could not upload the starting map: ' + explain(upM));
  } else {
    await run('ssh', sshArgs(v, 'rm -f ' + dir + '/default-map.json'), opts());
  }

  ctx.emit(35, 'Downloading the image on the server');
  const env = 'GMMC_PORT=' + v.webPort + ' GMMC_TAG=' + v.tag;
  const pull = await run('ssh', sshArgs(v, 'cd ' + dir + ' && ' + env + ' docker compose pull'), opts({ timeout: 600000 }));
  if (pull.code !== 0) throw new Error('docker compose pull failed: ' + explain(pull));
  ctx.emit(65, 'Starting the server');
  const up = await run('ssh', sshArgs(v, 'cd ' + dir + ' && ' + env + ' docker compose up -d --force-recreate'), opts({ timeout: 180000 }));
  if (up.code !== 0) throw new Error('docker compose up failed: ' + explain(up));

  ctx.emit(85, 'Checking the website');
  const url = 'http://' + v.host + ':' + v.webPort + '/';
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) { ok = (await get(url, 4000)) === 200; if (!ok) await new Promise((r) => setTimeout(r, 2000)); }
  if (!ok) {
    const inside = await run('ssh', sshArgs(v, 'curl -fsS -o /dev/null http://127.0.0.1:' + v.webPort + '/healthz && echo healthy'), opts({ timeout: 20000 }));
    if (inside.code === 0 && /healthy/.test(inside.out)) throw new Error('The server runs, but ' + url + ' does not answer from this computer. Open port ' + v.webPort + ' in the server\'s firewall.');
    throw new Error('The server was started but the website did not answer at ' + url + '.');
  }
  return { links: [{ label: v.host, url, kind: 'url' }] };
}

module.exports = { deploy, validate, remoteDir, sshArgs };
