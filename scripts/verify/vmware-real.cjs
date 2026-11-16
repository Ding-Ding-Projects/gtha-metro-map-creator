// Real check of the VMware target against the VMware Workstation installed on this computer.
// Usage: node scripts/verify/vmware-real.cjs <work dir>
// The appliance image cannot be built on Windows, so a tiny empty machine is exported with VirtualBox as a
// stand-in .ova and served as a fake release. The real OVF Tool (or vdiskmanager) converts it; a wrapper
// refuses vmrun "start", so no machine is ever started and the deployment ends with a clear failure.
// Then the manager checks, refuses a folder that is not ours, and removes the machine with the real vmrun.
// This proves conversion, files, markers and removal, not that the appliance boots in VMware.
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
const vmware = require(path.join(root, 'deploy', 'targets', 'vmware'));
const vbox = require(path.join(root, 'deploy', 'targets', 'virtualbox'));
const core = require(path.join(root, 'content', 'site', 'app', 'deploy-core.js'));
const version = require(path.join(root, 'package.json')).version;
const work = path.resolve(process.argv[2] || path.join(require('node:os').tmpdir(), 'gmmc-vmware-check'));
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!ok) failures++; };

(async () => {
  const t = vmware.tools();
  if (!t.vmrun) { console.log('VMware is not installed here: nothing to check'); process.exit(0); }
  check('VMware tools found', true, { vmrun: t.vmrun[0], ovftool: t.ovftool, vdisk: t.vdisk });
  const vbx = await vbox.findExe();
  if (!vbx) { console.log('VirtualBox is needed here only to make the stand-in .ova; it is not installed'); process.exit(0); }
  const vb = (...a) => execFileSync(vbx.exe, vbx.pre.concat(a), { encoding: 'utf8' });
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
  const wrapper = path.join(work, 'vmrun-wrapper.cjs');
  fs.writeFileSync(wrapper, `const { spawnSync } = require('node:child_process'); const a = process.argv.slice(2); const i = a.indexOf('start'); if (i >= 0 && i === a.indexOf('-T') + 2) { console.log('refused by the test wrapper: no machine is started'); process.exit(1); } const r = spawnSync(${JSON.stringify(t.vmrun[0])}, a, { encoding: 'utf8' }); process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); process.exit(r.status === null ? 1 : r.status);`);
  process.env.GMMC_VMRUN = JSON.stringify([process.execPath, wrapper]);

  const manager = new Manager({ userData: path.join(work, 'data'), siteDir: path.join(root, 'content', 'site'), appVersion: version, targets: { vmware }, send: () => {}, getToken: async () => null });
  const res = await manager.deploy('vmware', { name: 'VMW Test' }, null);
  check('deployment converts the appliance and stops at the blocked start', !res.ok && /could not start the machine|refused by the test wrapper/i.test(res.error), res.error);
  const rec = manager.list().find((i) => i.name === 'VMW Test');
  check('the converted machine is recorded', !!rec && /\.vmx$/i.test(rec.run.vmx) && fs.existsSync(rec.run.vmx), rec && rec.run.vmx);
  const vmx = fs.readFileSync(rec.run.vmx, 'utf8');
  check('the machine file has bridged networking and a serial log', /ethernet0\.connectionType\s*=\s*"bridged"/i.test(vmx) && /serial0\.fileName/i.test(vmx));
  check('the folder holds the ownership marker', JSON.parse(fs.readFileSync(path.join(manager.instDir(rec.id), 'vm', 'gmmc-instance.json'), 'utf8')).id === rec.id);
  const st = await manager.checkOne(manager.registry.get(rec.id));
  check('the manager sees the machine as stopped', st.state === 'stopped', st);
  // the same with "Require a password": the machine file must carry the configuration disk, which holds only the hash
  const pw = 'check-' + crypto.randomBytes(6).toString('hex');
  const res2 = await manager.deploy('vmware', { name: 'VMW Pw', requirePassword: true, password: pw }, null);
  check('a deployment with a password also stops at the blocked start', !res2.ok && /could not start the machine|refused by the test wrapper/i.test(res2.error), res2.error);
  const rec2 = manager.list().find((i) => i.name === 'VMW Pw');
  const full2 = manager.registry.get(rec2.id);
  const vmx2 = fs.readFileSync(rec2.run.vmx, 'utf8');
  const iso2 = path.join(manager.instDir(rec2.id), 'config', 'gmmc-config.iso');
  const isoBytes = fs.existsSync(iso2) ? fs.readFileSync(iso2) : Buffer.alloc(0);
  check('the machine file attaches the configuration ISO as a CD-ROM', /ide1:0\.deviceType\s*=\s*"cdrom-image"/i.test(vmx2) && vmx2.includes('gmmc-config.iso') && /ide1:0\.startConnected\s*=\s*"TRUE"/i.test(vmx2), (vmx2.match(/^ide1:0.*$/gm) || []).join(' | '));
  check('the ISO holds the hash and not the password', /^pbkdf2-sha256:/.test(full2.passwordHash) && isoBytes.includes(Buffer.from(full2.passwordHash)) && !isoBytes.includes(Buffer.from(pw)) && isoBytes.includes(Buffer.from('GMMCCONF')));
  check('the password itself is not in the registry or the machine file', !JSON.stringify(full2).includes(pw) && !vmx2.includes(pw));
  const rm2 = await manager.action(rec2.id, 'remove');
  check('the machine with a password is removed too', rm2.ok && !fs.existsSync(rec2.run.vmx), rm2);
  // a record whose machine file is somewhere else is refused
  const stray = path.join(work, 'stray'); fs.mkdirSync(stray); fs.writeFileSync(path.join(stray, 'x.vmx'), '.encoding = "UTF-8"\n');
  manager.registry.upsert({ id: 'cccccccccccc', kind: 'vmware', name: 'Stray', slug: 'stray', run: { vm: 'x', vmx: path.join(stray, 'x.vmx') } });
  const refuse = await manager.action('cccccccccccc', 'remove');
  check('a machine outside the instance folder is refused', !refuse.ok && /not marked as created|not inside/.test(refuse.error) && fs.existsSync(path.join(stray, 'x.vmx')), refuse);
  const rm = await manager.action(rec.id, 'remove');
  check('our machine is removed with its folder', rm.ok && !fs.existsSync(rec.run.vmx) && !manager.registry.get(rec.id), rm);
  check('the stray file is untouched', fs.existsSync(path.join(stray, 'x.vmx')));
  srv.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('ERROR', (e && e.stack) || e); process.exit(2); });
