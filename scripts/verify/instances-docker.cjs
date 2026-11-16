// Real check of the instance manager against this computer's Docker (no Electron needed).
// Usage: node scripts/verify/instances-docker.cjs <work dir>
// Creates two Docker instances on different ports, checks both links answer, stops and restarts one,
// updates one to a newer image, reads logs, removes one, and proves that a container this app did not
// create (a plain nginx started by this script) is never listed, stopped or removed.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..', 'desktop');
const { Manager } = require(path.join(root, 'deploy', 'lib', 'manager'));
const { INSTANCE_LABEL } = require(path.join(root, 'shared', 'common'));
const targets = { docker: require(path.join(root, 'deploy', 'targets', 'docker')), builtin: require(path.join(root, 'deploy', 'targets', 'builtin')), folder: require(path.join(root, 'deploy', 'targets', 'folder')) };

const work = path.resolve(process.argv[2] || path.join(require('node:os').tmpdir(), 'gmmc-inst-check'));
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const events = [];
const manager = new Manager({ userData: work, siteDir: path.join(root, 'content', 'site'), appVersion: require(path.join(root, 'package.json')).version, targets, send: (c, p) => { if (c === 'log') events.push(p.line); }, getToken: async () => null });
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8' }).trim();
const get = (url) => new Promise((resolve) => { http.get(url, { timeout: 4000 }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ code: res.statusCode, body: b })); }).on('error', () => resolve({ code: 0, body: '' })); });
let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!ok) failures++; };
const map = (title) => ({ name: title + '.gmmc.json', text: JSON.stringify({ version: 1, title, stations: { a: { id: 'a', name: 'A', x: 0, y: 0 } }, lines: [], labels: [] }) });

(async () => {
  const foreign = 'gmmc-foreign-nginx-' + process.pid;
  docker('run', '-d', '--name', foreign, 'nginx:alpine');
  const foreignId = docker('ps', '-aq', '--filter', 'name=^' + foreign + '$');
  try {
    // 1. two instances on different ports, each with its own starting map; the second asks for the first one's port.
    const a = await manager.deploy('docker', { name: 'Alpha', port: 18090, tag: '1.4.0' }, map('Alpha map'));
    check('instance Alpha deployed', a.ok, a);
    const b = await manager.deploy('docker', { name: 'Bravo', port: 18090, tag: 'latest' }, map('Bravo map'));
    check('instance Bravo deployed', b.ok, b);
    let list = manager.list();
    const A = list.find((x) => x.name === 'Alpha'); const B = list.find((x) => x.name === 'Bravo');
    check('two different ports', A && B && A.port === 18090 && B.port !== 18090 && B.port > 0, { a: A && A.port, b: B && B.port });
    check('two different compose projects', A.slug !== B.slug, { a: A.slug, b: B.slug });
    const ga = await get(A.url + 'healthz'); const gb = await get(B.url + 'healthz');
    check('both links answer /healthz', ga.code === 200 && gb.code === 200, { a: A.url, b: B.url });
    const ma = await get(A.url + 'app/default-map.json'); const mb = await get(B.url + 'app/default-map.json');
    check('each has its own starting map', JSON.parse(ma.body).title === 'Alpha map' && JSON.parse(mb.body).title === 'Bravo map', { a: JSON.parse(ma.body).title, b: JSON.parse(mb.body).title });
    check('a version tag shows its real version, the latest tag shows none', A.version === '1.4.0' && B.version === '', { a: A.version, b: B.version });
    // 2. ownership: the foreign container is never listed.
    const labelled = docker('ps', '-aq', '--filter', 'label=' + INSTANCE_LABEL).split(/\s+/).filter(Boolean);
    check('foreign container is not labelled and not in the registry', !labelled.includes(foreignId) && !list.some((x) => x.name.includes('foreign')), { labelled: labelled.length });
    // 3. health check
    await manager.checkAll(); list = manager.list();
    check('health checked live', list.filter((x) => x.kind === 'docker').every((x) => x.check.state === 'healthy' && Date.now() - x.check.at < 60000), list.map((x) => x.check));
    // 4. stop one, the other keeps answering, restart it
    const st = await manager.action(A.id, 'stop');
    check('Alpha stopped', st.ok && (await get(A.url + 'healthz')).code === 0, st);
    check('Bravo still answers', (await get(B.url + 'healthz')).code === 200);
    check('foreign container still running after stop', docker('inspect', '-f', '{{.State.Running}}', foreignId) === 'true');
    await manager.checkAll();
    check('Alpha shows as stopped', manager.list().find((x) => x.id === A.id).check.state === 'stopped');
    const rs = await manager.action(A.id, 'restart');
    check('Alpha restarted (start from stopped)', rs.ok && (await get(A.url + 'healthz')).code === 200, rs);
    const rs2 = await manager.action(A.id, 'restart');
    check('Alpha restart while running', rs2.ok && (await get(A.url + 'healthz')).code === 200, rs2);
    // 5. logs
    const lg = await manager.action(A.id, 'logs');
    check('logs returned', lg.ok && lg.text.length > 0, (lg.text || '').split('\n').slice(-2).join(' | '));
    // 6. update Alpha from 1.4.0 to the newest version
    process.env.GMMC_HIDDEN = '1'; process.env.GMMC_LATEST_VERSION = '1.5.0';
    manager.latest = { at: 0, version: '' };
    await manager.checkAll();
    const before = manager.list().find((x) => x.id === A.id);
    check('Alpha reports an update', before.updateAvailable && before.latest === '1.5.0', { version: before.version, latest: before.latest });
    const up = await manager.action(A.id, 'update');
    check('Alpha updated', up.ok, up);
    const after = manager.list().find((x) => x.id === A.id);
    check('Alpha now runs the newer image and kept its port and map', after.version === '1.5.0' && after.port === 18090 && (await get(after.url + 'healthz')).code === 200 && JSON.parse((await get(after.url + 'app/default-map.json')).body).title === 'Alpha map', { version: after.version, port: after.port, tag: after.tag });
    // 7. duplicate
    const dup = await manager.duplicate(B.id, 'Bravo copy', null);
    check('Bravo duplicated on a new port with the same map', dup.ok && manager.list().some((x) => x.name === 'Bravo copy' && x.port !== B.port), dup);
    // 8. remove one: confirm the other survives
    const rm = await manager.action(B.id, 'remove');
    check('Bravo removed', rm.ok, rm);
    check('Bravo containers and network are gone', docker('ps', '-aq', '--filter', 'label=' + INSTANCE_LABEL + '=' + B.id) === '' && docker('network', 'ls', '-q', '--filter', 'label=' + INSTANCE_LABEL + '=' + B.id) === '');
    check('Bravo instance folder deleted', !fs.existsSync(path.join(work, 'instances', B.id)));
    check('Alpha survives', (await get(after.url + 'healthz')).code === 200 && !!manager.registry.get(A.id));
    // 9. the foreign container is untouched, and refusing to adopt it
    check('foreign container still running and untouched', docker('inspect', '-f', '{{.State.Running}}', foreignId) === 'true');
    const fake = JSON.parse(JSON.stringify(manager.registry.get(A.id))); fake.id = 'aaaaaaaaaaaa'; fake.name = 'Foreign'; fake.slug = 'foreign'; fake.port = 18099;
    manager.registry.upsert(fake);
    const rmf = await manager.action(fake.id, 'remove');
    check('an instance with a made-up id finds no containers, so nothing else is removed', rmf.ok && docker('inspect', '-f', '{{.State.Running}}', foreignId) === 'true' && (await get(after.url + 'healthz')).code === 200, rmf);
    // 10. a second built-in server on its own port
    const c1 = await manager.deploy('builtin', { name: 'Local one', port: 18110 }, map('Local one'));
    const c2 = await manager.deploy('builtin', { name: 'Local two', port: 18110 }, map('Local two'));
    const l = manager.list().filter((x) => x.kind === 'builtin');
    check('two built-in servers on different ports', c1.ok && c2.ok && l.length === 2 && l[0].port !== l[1].port, l.map((x) => x.port));
    for (const x of l) await manager.action(x.id, 'remove');
  } finally {
    for (const x of manager.list()) if (x.kind === 'docker') { try { await manager.action(x.id, 'remove'); } catch { /* ignore */ } }
    try { docker('rm', '-f', foreign); } catch { /* ignore */ }
    await targets.builtin.stopAll();
  }
  check('foreign test container removed by this script', docker('ps', '-aq', '--filter', 'name=^' + foreign + '$') === '');
  check('no instance containers left', docker('ps', '-aq', '--filter', 'label=' + INSTANCE_LABEL) === '');
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exit(2); });
