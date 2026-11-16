// Real check of the VirtualBox target against the VirtualBox installed on this computer.
// Usage: node scripts/verify/vbox-real.cjs <work dir>
// The appliance image cannot be built on Windows, so this script exports a tiny empty machine as a stand-in
// .ova, serves it as a fake release (with SHA256SUMS.txt), and runs the real VBoxManage through the target:
// download, checksum, unzip, import, network and serial setup, ownership mark. The machine is NEVER started:
// a wrapper refuses "startvm", so the deployment ends with a clear failure while the imported machine stays.
// Then it proves the manager can find, check and remove that machine, and that it refuses a machine it did
// not create. Nothing here proves the appliance boots in VirtualBox.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..', 'desktop');
process.env.GMMC_HIDDEN = '1';
const { Manager } = require(path.join(root, 'deploy', 'lib', 'manager'));
const vbox = require(path.join(root, 'deploy', 'targets', 'virtualbox'));
const core = require(path.join(root, 'content', 'site', 'app', 'deploy-core.js'));
const version = require(path.join(root, 'package.json')).version;
const work = path.resolve(process.argv[2] || path.join(require('node:os').tmpdir(), 'gmmc-vbox-check'));
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!ok) failures++; };

(async () => {
  const exe = await vbox.findExe();
  if (!exe) { console.log('VirtualBox is not installed here: nothing to check'); process.exit(0); }
  const vb = (...a) => execFileSync(exe.exe, exe.pre.concat(a), { encoding: 'utf8' });
  const names = () => vb('list', 'vms');
  check('VBoxManage found', true, exe.exe + ' ' + vb('--version').trim());

  // a stand-in .ova from a tiny empty machine
  const rel = path.join(work, 'release'); fs.mkdirSync(rel);
  const src = 'gmmc-test-src-' + process.pid;
  vb('createvm', '--name', src, '--ostype', 'Linux_64', '--register'); vb('modifyvm', src, '--memory', '64');
  const ova = path.join(rel, 'standin.ova'); vb('export', src, '-o', ova); vb('unregistervm', src, '--delete');
  const zipName = 'gtha-metro-map-creator-appliance-' + version + '-x86_64.ova.zip';
  const zip = await core.buildZip([{ rel: 'gtha-metro-map-creator-appliance-' + version + '-x86_64.ova', bytes: async () => new Uint8Array(fs.readFileSync(ova)) }], async (u8) => new Uint8Array(zlib.deflateRawSync(u8)));
  fs.writeFileSync(path.join(rel, zipName), zip); fs.rmSync(ova);
  fs.writeFileSync(path.join(rel, 'SHA256SUMS.txt'), crypto.createHash('sha256').update(zip).digest('hex') + '  ' + zipName + '\n');
  const srv = http.createServer((req, res) => { const f = path.join(rel, decodeURIComponent(req.url.slice(1))); if (fs.existsSync(f)) { res.writeHead(200); fs.createReadStream(f).pipe(res); } else { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); process.env.GMMC_RELEASE_BASE = 'http://127.0.0.1:' + srv.address().port;
  // wrapper: the real VBoxManage, except that it never starts a machine
  const wrapper = path.join(work, 'vbox-wrapper.cjs');
  fs.writeFileSync(wrapper, `const { spawnSync } = require('node:child_process'); const a = process.argv.slice(2); if (a[0] === 'startvm') { console.log('refused by the test wrapper: no machine is started'); process.exit(1); } const r = spawnSync(${JSON.stringify(exe.exe)}, a, { encoding: 'utf8' }); process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); process.exit(r.status === null ? 1 : r.status);`);
  process.env.GMMC_VBOXMANAGE = JSON.stringify([process.execPath, wrapper]);

  const events = [];
  const manager = new Manager({ userData: path.join(work, 'data'), siteDir: path.join(root, 'content', 'site'), appVersion: version, targets: { virtualbox: vbox }, send: (c, p) => { if (c === 'log') events.push(p.line); }, getToken: async () => null });
  const before = names();
  const res = await manager.deploy('virtualbox', { name: 'VB Test', netMode: 'nat' }, null);
  check('deployment stops at the blocked start with a clear message', !res.ok && /could not start|refused by the test wrapper/i.test(res.error), res.error);
  const rec = manager.list().find((i) => i.name === 'VB Test');
  check('the imported machine is kept in the registry so it can be removed', !!rec && !!rec.run.uuid && /^gmmc-vb-test-/.test(rec.run.vm), rec && rec.run);
  check('the machine exists in VirtualBox with the instance mark', names().includes(rec.run.uuid) && vb('getextradata', rec.run.uuid, 'io.github.dingdingprojects.gmmc.instance').includes(rec.id));
  const info = vb('showvminfo', rec.run.uuid, '--machinereadable');
  check('NAT port forward and serial log are configured', /Forwarding\(0\)="gmmc,tcp,,\d+,,8080"/.test(info) && /uartmode1="file,/.test(info), (info.match(/Forwarding\(0\)=.*|uartmode1=.*/g) || []).join(' | '));
  const st = await manager.checkOne(manager.registry.get(rec.id));
  check('the manager sees the machine as stopped', st.state === 'stopped', st);
  // a machine this app did not create
  const foreignVm = 'gmmc-foreign-vm-' + process.pid;
  vb('createvm', '--name', foreignVm, '--ostype', 'Linux_64', '--register');
  const foreignUuid = /UUID="([^"]+)"/.exec(vb('showvminfo', foreignVm, '--machinereadable'))[1];
  manager.registry.upsert({ id: 'bbbbbbbbbbbb', kind: 'virtualbox', name: 'Foreign', slug: 'foreign', run: { vm: foreignVm, uuid: foreignUuid } });
  const refuse = await manager.action('bbbbbbbbbbbb', 'remove');
  check('removing a machine that is not marked as ours is refused', !refuse.ok && /not marked as created by this app/.test(refuse.error) && names().includes(foreignUuid), refuse);
  const refuse2 = await manager.action('bbbbbbbbbbbb', 'stop');
  check('stopping it is refused too', !refuse2.ok && /not marked as created/.test(refuse2.error));
  // remove ours
  const rm = await manager.action(rec.id, 'remove');
  check('our machine is removed with its files', rm.ok && !names().includes(rec.run.uuid) && !manager.registry.get(rec.id), rm);
  check('the foreign machine is untouched', names().includes(foreignUuid));
  // clean up
  vb('unregistervm', foreignUuid, '--delete'); manager.registry.remove('bbbbbbbbbbbb');
  check('every machine of this run is gone', names() === before);
  srv.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('ERROR', (e && e.stack) || e); process.exit(2); });
