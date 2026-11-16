// Real check of the VirtualBox target's password option against the VirtualBox installed on this computer.
// Usage: node scripts/verify/vbox-signin-real.cjs <release dir> [work dir]
//   <release dir> holds a real release's gtha-metro-map-creator-appliance-<version>-x86_64.ova.zip and
//   SHA256SUMS.txt (for example: gh release download v1.7.2 -p "*x86_64.ova.zip" -p SHA256SUMS.txt).
// It serves that directory as a fake release, deploys through the real target with "Require a password" on,
// starts the machine headless and prints what the target reported. It then checks that the configuration
// disk is attached as a CD-ROM holding the hash and not the password, and removes the machine.
// An appliance older than the password option (such as 1.7.2) ignores the disk and serves the editor
// without a password: the target must report exactly that as a failure ("did not ask for a password"),
// and this script then counts the run as correct for that old image. With an appliance that has the option,
// the run must end live with the password required. The first boot can take about six minutes.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..', 'desktop');
process.env.GMMC_HIDDEN = '1';
process.env.GMMC_VM_BOOT_TIMEOUT_MS = process.env.GMMC_VM_BOOT_TIMEOUT_MS || '900000';
const { Manager } = require(path.join(root, 'deploy', 'lib', 'manager'));
const vbox = require(path.join(root, 'deploy', 'targets', 'virtualbox'));
const relDir = path.resolve(process.argv[2] || '');
const work = path.resolve(process.argv[3] || path.join(require('node:os').tmpdir(), 'gmmc-vbox-signin-check'));
const zip = fs.existsSync(relDir) ? fs.readdirSync(relDir).find((f) => /^gtha-metro-map-creator-appliance-.*-x86_64\.ova\.zip$/.test(f)) : '';
if (!zip) { console.error('No appliance .ova.zip in ' + relDir); process.exit(2); }
const version = /appliance-(.+)-x86_64/.exec(zip)[1];
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!ok) failures++; };

(async () => {
  const exe = await vbox.findExe();
  if (!exe) { console.log('VirtualBox is not installed here: nothing to check'); process.exit(0); }
  const vb = (...a) => execFileSync(exe.exe, exe.pre.concat(a), { encoding: 'utf8' });
  const srv = http.createServer((req, res) => { const f = path.join(relDir, decodeURIComponent(req.url.slice(1))); if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200); fs.createReadStream(f).pipe(res); } else { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); process.env.GMMC_RELEASE_BASE = 'http://127.0.0.1:' + srv.address().port;
  const events = [];
  const manager = new Manager({ userData: path.join(work, 'data'), siteDir: path.join(root, 'content', 'site'), appVersion: version, targets: { virtualbox: vbox }, send: (c, p) => { if (c === 'log') { events.push(p.line); console.log('  log: ' + p.line); } }, getToken: async () => null });
  const password = 'check-' + crypto.randomBytes(6).toString('hex');
  const name = 'VB Signin ' + process.pid;
  const before = vb('list', 'vms');
  const res = await manager.deploy('virtualbox', { name, netMode: 'nat', requirePassword: true, password }, null);
  console.log('deploy result: ' + JSON.stringify({ ok: res.ok, error: res.error }));
  const rec = manager.list().find((i) => i.name === name) || {};
  const full = manager.registry.get(rec.id) || {};
  check('the registry kept a hash, never the password', /^pbkdf2-sha256:\d+:/.test(full.passwordHash || '') && !JSON.stringify(full).includes(password) && !events.join('\n').includes(password) && !events.join('\n').includes(full.passwordHash || 'x'));
  if (rec.run && rec.run.uuid) {
    const info = vb('showvminfo', rec.run.uuid, '--machinereadable');
    check('the configuration disk is attached as a CD-ROM', /gmmc-config\.iso/.test(info), (info.match(/^.*gmmc-config\.iso.*$/m) || [''])[0]);
    const iso = path.join(work, 'data', 'instances', rec.id, 'config', 'gmmc-config.iso');
    const bytes = fs.existsSync(iso) ? fs.readFileSync(iso) : Buffer.alloc(0);
    check('the ISO holds the hash and not the password', bytes.includes(Buffer.from(full.passwordHash || 'x')) && !bytes.includes(Buffer.from(password)) && bytes.includes(Buffer.from('GMMCCONF')), { bytes: bytes.length });
  }
  if (res.ok) check('the machine is live and asks for the password', true, res.id);
  else check('an appliance without the password option is reported honestly', /did not ask for a password/.test(res.error || ''), res.error);
  // clean up: remove our machine
  if (rec.id) { const rm = await manager.action(rec.id, 'remove'); check('the machine is removed', rm.ok, rm.error); }
  check('every machine of this run is gone', vb('list', 'vms') === before);
  srv.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
