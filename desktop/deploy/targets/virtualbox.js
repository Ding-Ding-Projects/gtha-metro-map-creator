// Target: a VirtualBox virtual machine made from the release's appliance image. The app finds
// VBoxManage, downloads the .ova.zip of the app's version, checks it against the release checksums,
// imports it under a unique name, connects it to the network, starts it without a window and waits
// for the web app to answer. A machine is only touched again when its stored "instance" value matches
// the instance recorded by this app.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { lanAddresses, INSTANCE_LABEL, findFreePort } = require('../../shared/common');
const { run } = require('../lib/proc');
const { downloadRelease, applianceName } = require('../lib/download');
const { unzipOne } = require('../lib/archive');
const { addressFromSerialLog, addressFromNeighbours, waitForAppliance, sleep, tail } = require('../lib/vm-common');
const { writeConfigIso } = require('../lib/config-disk');

const DOWNLOAD_PAGE = 'https://www.virtualbox.org/wiki/Downloads';

// In hidden test runs GMMC_VBOXMANAGE may be a JSON array [program, ...leading arguments] (a stand-in program).
function command() {
  if (process.env.GMMC_HIDDEN === '1' && process.env.GMMC_VBOXMANAGE) { try { const a = JSON.parse(process.env.GMMC_VBOXMANAGE); if (Array.isArray(a) && a.length) return { exe: a[0], pre: a.slice(1) }; } catch { /* a plain path */ } return { exe: process.env.GMMC_VBOXMANAGE, pre: [] }; }
  return null;
}
async function findExe() {
  const t = command(); if (t) return t;
  const candidates = [];
  const reg = await run('reg', ['query', 'HKLM\\SOFTWARE\\Oracle\\VirtualBox', '/v', 'InstallDir'], { timeout: 8000 });
  const m = /InstallDir\s+REG_SZ\s+(.+)/.exec(reg.out); if (m) candidates.push(path.join(m[1].trim(), 'VBoxManage.exe'));
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files']) if (base) candidates.push(path.join(base, 'Oracle', 'VirtualBox', 'VBoxManage.exe'));
  for (const c of candidates) if (fs.existsSync(c)) return { exe: c, pre: [] };
  return null;
}
async function vbox(exe, args, opts) { return run(exe.exe, exe.pre.concat(args), opts || { timeout: 120000 }); }

const missing = () => new Error('VirtualBox was not found on this computer. Install it from ' + DOWNLOAD_PAGE + ' and try again.');
const kv = (text) => { const o = {}; for (const l of text.split(/\r?\n/)) { const m = /^([A-Za-z0-9_]+)="?(.*?)"?$/.exec(l.trim()); if (m) o[m[1]] = m[2]; } return o; };

// Reads VM information by UUID, and checks the stored instance value. Returns { info } or throws when the VM is not ours.
async function owned(exe, inst) {
  if (!inst.run.uuid) throw new Error('This instance has no recorded virtual machine.');
  const ed = await vbox(exe, ['getextradata', inst.run.uuid, INSTANCE_LABEL], { timeout: 20000 });
  if (ed.code !== 0 || !new RegExp('Value:\\s*' + inst.id + '\\s*$', 'm').test(ed.out)) throw new Error('The virtual machine "' + inst.run.vm + '" is not marked as created by this app, so it was left alone.');
  const info = await vbox(exe, ['showvminfo', inst.run.uuid, '--machinereadable'], { timeout: 20000 });
  if (info.code !== 0) throw new Error('The virtual machine "' + inst.run.vm + '" no longer exists.');
  return kv(info.out);
}

async function activeBridgeAdapter(exe) {
  const r = await vbox(exe, ['list', 'bridgedifs'], { timeout: 20000 });
  const blocks = r.out.split(/\r?\n\r?\n/).map((b) => { const f = {}; for (const l of b.split(/\r?\n/)) { const m = /^(\w+):\s+(.*)$/.exec(l.trim()); if (m) f[m[1]] = m[2]; } return f; }).filter((f) => f.Name);
  const ips = lanAddresses();
  const up = blocks.filter((b) => /up/i.test(b.Status || '') && !/host-only|vethernet|wsl|hyper-v|virtual/i.test(b.Name));
  return (up.find((b) => ips.includes(b.IPAddress)) || up[0] || {}).Name || '';
}

function lanIp() { return lanAddresses()[0] || ''; }

// Gives the machine the small configuration disk that carries the sign-in hash: an ISO attached as a CD-ROM on
// the second IDE channel. Only the hash is on it, never the password. Returns the ISO's path.
async function attachConfigDisk(exe, uuid, inst, ctx) {
  const dir = path.join(ctx.instDir, 'config'); fs.mkdirSync(dir, { recursive: true });
  const iso = path.join(dir, 'gmmc-config.iso');
  writeConfigIso(iso, inst.passwordHash);
  const info = kv((await vbox(exe, ['showvminfo', uuid, '--machinereadable'], { timeout: 20000 })).out);
  let ctl = '';
  for (let i = 0; info['storagecontrollername' + i]; i++) if (/PIIX|ICH6/i.test(info['storagecontrollertype' + i] || '')) { ctl = info['storagecontrollername' + i]; break; }
  if (!ctl) {
    ctl = 'IDE Controller';
    const add = await vbox(exe, ['storagectl', uuid, '--name', ctl, '--add', 'ide', '--controller', 'PIIX4'], { timeout: 30000 });
    if (add.code !== 0) throw new Error('VirtualBox could not add a drive for the password: ' + tail(add.out, 2).slice(0, 300));
  }
  const att = await vbox(exe, ['storageattach', uuid, '--storagectl', ctl, '--port', '1', '--device', '0', '--type', 'dvddrive', '--medium', iso], { timeout: 30000 });
  if (att.code !== 0) throw new Error('VirtualBox could not attach the password disk: ' + tail(att.out, 2).slice(0, 300));
  return iso;
}

async function bootAndFind(exe, inst, ctx, port) {
  const serial = path.join(ctx.instDir, 'serial.log');
  const start = await vbox(exe, ['startvm', inst.run.uuid, '--type', 'headless'], { timeout: 120000 });
  if (start.code !== 0) throw new Error('VirtualBox could not start the machine: ' + tail(start.out, 2).slice(0, 300));
  ctx.emit(72, 'Starting the machine');
  const nat = inst.run.netMode === 'nat';
  const find = nat ? async () => '127.0.0.1' : async () => addressFromSerialLog(serial) || (await addressFromNeighbours(inst.run.mac));
  const hostPort = nat ? port : 8080;
  const r = await waitForAppliance({ find, port: hostPort, signal: ctx.signal, emit: ctx.emit, label: 'Waiting for the web app', signin: !!inst.passwordHash });
  if (nat) { const ip = lanIp(); return { url: 'http://' + (ip || '127.0.0.1') + ':' + port + '/', checked: r.url }; }
  return { url: r.url, checked: r.url };
}

async function deploy(ctx) {
  const inst = ctx.inst; const s = ctx.settings;
  ctx.emit(3, 'Looking for VirtualBox');
  const exe = await findExe(); if (!exe) throw missing();
  const ver = await vbox(exe, ['--version'], { timeout: 20000 });
  if (ver.code !== 0) throw new Error('VBoxManage did not run: ' + tail(ver.out, 1));
  ctx.log('VirtualBox ' + ver.out.trim());

  const zipName = applianceName(ctx.version, 'x86_64') + '.ova.zip';
  const dl = await downloadRelease({ version: ctx.version, name: zipName, cacheDir: path.join(ctx.userData, 'images'), signal: ctx.signal, log: ctx.log, onProgress: (f) => ctx.emit(5 + Math.round(f * 40), 'Downloading ' + zipName) });
  ctx.emit(48, 'Unpacking the appliance');
  const ova = await unzipOne(dl.file, path.join(ctx.userData, 'images', 'ova-' + ctx.version), '.ova');

  const vmName = 'gmmc-' + inst.slug + '-' + inst.id.slice(0, 6);
  const exists = await vbox(exe, ['showvminfo', vmName, '--machinereadable'], { timeout: 20000 });
  if (exists.code === 0) throw new Error('A virtual machine named "' + vmName + '" already exists and was not created by this instance, so nothing was changed.');
  ctx.emit(52, 'Importing the machine');
  const imp = await vbox(exe, ['import', ova, '--vsys', '0', '--vmname', vmName], { timeout: 900000, signal: ctx.signal, onLine: (l) => ctx.log(l) });
  if (imp.code !== 0) throw new Error('VirtualBox could not import the appliance: ' + tail(imp.out, 2).slice(0, 300));
  const info = kv((await vbox(exe, ['showvminfo', vmName, '--machinereadable'], { timeout: 20000 })).out);
  const uuid = info.UUID; if (!uuid) throw new Error('VirtualBox imported the machine but did not report its identity.');
  const patch = { run: Object.assign({}, inst.run, { vm: vmName, uuid }), version: ctx.version, where: 'VirtualBox' };
  Object.assign(inst, patch); ctx.persist(inst); // recorded now, so a failure below can still be removed from the manager
  await vbox(exe, ['setextradata', uuid, INSTANCE_LABEL, inst.id], { timeout: 20000 });

  ctx.emit(58, 'Setting up the network');
  const serial = path.join(ctx.instDir, 'serial.log'); fs.mkdirSync(ctx.instDir, { recursive: true }); fs.rmSync(serial, { force: true });
  let mode = s.netMode === 'nat' ? 'nat' : 'bridged'; let note = '';
  let adapter = '';
  if (mode === 'bridged') { adapter = await activeBridgeAdapter(exe); if (!adapter) { mode = 'nat'; note = 'No active network adapter was found for bridging, so the machine uses NAT with a forwarded port instead.'; } }
  const mod = ['modifyvm', uuid, '--uart1', '0x3F8', '4', '--uartmode1', 'file', serial];
  if (mode === 'bridged') mod.push('--nic1', 'bridged', '--bridgeadapter1', adapter);
  else {
    const port = inst.port || (await findFreePort(8080, ctx.usedPorts));
    inst.port = port;
    mod.push('--nic1', 'nat'); await vbox(exe, ['modifyvm', uuid, '--natpf1', 'delete', 'gmmc'], { timeout: 20000 }).catch(() => {});
    mod.push('--natpf1', 'gmmc,tcp,,' + port + ',,8080');
  }
  const m = await vbox(exe, mod, { timeout: 30000 });
  if (m.code !== 0) throw new Error('VirtualBox could not configure the machine: ' + tail(m.out, 2).slice(0, 300));
  if (inst.passwordHash) { ctx.emit(62, 'Attaching the password disk'); await attachConfigDisk(exe, uuid, inst, ctx); }
  const mac = (kv((await vbox(exe, ['showvminfo', uuid, '--machinereadable'], { timeout: 20000 })).out).macaddress1 || '').toLowerCase();
  inst.run = Object.assign({}, inst.run, { mac, netMode: mode });

  const up = await bootAndFind(exe, inst, ctx, inst.port);
  inst.url = up.url;
  const verified = inst.passwordHash ? 'Verified: /healthz answered and /app/ asks for the password.' : 'Verified: /healthz and /app/ answered.';
  return { links: [{ label: inst.run.vm, url: up.url, kind: 'url' }], note: note || (mode === 'bridged' ? 'Bridged to ' + adapter + '. ' + verified : 'NAT with port ' + inst.port + ' forwarded. ' + verified), patch: { url: up.url, port: inst.port, run: inst.run, version: ctx.version, where: 'VirtualBox' } };
}

async function state(inst) {
  const exe = await findExe(); if (!exe) return { exists: false, running: false, reason: 'VirtualBox is not installed.' };
  try { const info = await owned(exe, inst); return { exists: true, running: info.VMState === 'running' }; } catch (e) { return { exists: false, running: false, reason: e.message }; }
}
async function start(inst, ctx) {
  const exe = await findExe(); if (!exe) throw missing();
  const info = await owned(exe, inst);
  if (info.VMState === 'running') return { patch: {} };
  const r = await bootAndFind(exe, inst, ctx, inst.port);
  return { patch: { url: r.url } };
}
async function waitStopped(exe, inst) { for (let i = 0; i < 30; i++) { const info = await owned(exe, inst); if (info.VMState !== 'running') return true; await sleep(1000); } return false; }
async function stop(inst) {
  const exe = await findExe(); if (!exe) throw missing();
  const info = await owned(exe, inst);
  if (info.VMState !== 'running') return {};
  await vbox(exe, ['controlvm', inst.run.uuid, 'acpipowerbutton'], { timeout: 20000 });
  if (!(await waitStopped(exe, inst))) await vbox(exe, ['controlvm', inst.run.uuid, 'poweroff'], { timeout: 30000 });
  await waitStopped(exe, inst);
  return {};
}
async function restart(inst, ctx) { await stop(inst, ctx); return start(inst, ctx); }
async function logs(inst, ctx) {
  const f = path.join(ctx.instDir, 'serial.log');
  try { return tail(fs.readFileSync(f, 'utf8'), 200) || '(The serial log is empty.)'; } catch { return '(There is no serial log yet.)'; }
}
async function remove(inst, ctx) {
  const exe = await findExe(); if (!exe) throw missing();
  await owned(exe, inst); // refuses anything not marked as ours
  await stop(inst, ctx);
  const r = await vbox(exe, ['unregistervm', inst.run.uuid, '--delete'], { timeout: 120000 });
  if (r.code !== 0) throw new Error('VirtualBox could not remove the machine: ' + tail(r.out, 2).slice(0, 300));
  return {};
}
// Replaces the machine with one made from the newest appliance image. The old one is removed only after the new one answers.
async function update(inst, ctx, latest) {
  const exe = await findExe(); if (!exe) throw missing();
  await owned(exe, inst);
  const old = Object.assign({}, inst, { run: Object.assign({}, inst.run) });
  await stop(old, ctx);
  const draft = { id: inst.id, slug: inst.slug, run: { netMode: inst.run.netMode }, port: inst.port, passwordHash: inst.passwordHash || '' };
  // A second machine with a different name, so the old one stays until the new one is verified.
  draft.slug = inst.slug + '-n' + latest.replace(/\./g, '');
  const res = await deploy(Object.assign({}, ctx, { inst: draft, version: latest, settings: { netMode: inst.run.netMode }, persist: () => {} }));
  await vbox(exe, ['setextradata', draft.run.uuid, INSTANCE_LABEL, inst.id], { timeout: 20000 });
  await vbox(exe, ['unregistervm', old.run.uuid, '--delete'], { timeout: 120000 });
  return { links: res.links, patch: Object.assign({}, res.patch, { run: draft.run }) };
}

module.exports = { deploy, state, start, stop, restart, logs, remove, update, findExe, kv };
