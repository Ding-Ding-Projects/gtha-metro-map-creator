// Target: a VMware Workstation or Player virtual machine made from the release's appliance image.
// The machine is stored in this instance's own folder under the app's data folder. The folder holds a
// marker file naming the instance, and the machine is only started, stopped or deleted when the
// marker matches the recorded instance.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { run } = require('../lib/proc');
const { downloadRelease, applianceName } = require('../lib/download');
const { unzipOne, untarOne } = require('../lib/archive');
const { addressFromSerialLog, addressFromNeighbours, waitForAppliance, sleep, tail, MARKER_NAME } = require('../lib/vm-common');

const NEED = 'VMware Workstation (or Workstation Player) was not found. Install it, or install VMware OVF Tool, and try again.';

function tools() {
  if (process.env.GMMC_HIDDEN === '1' && process.env.GMMC_VMRUN) { try { const a = JSON.parse(process.env.GMMC_VMRUN); return { vmrun: a, ovftool: null, vdisk: null, product: 'ws' }; } catch { /* plain */ } }
  const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, 'C:\\Program Files (x86)', 'C:\\Program Files'].filter(Boolean);
  const first = (rel) => { for (const r of roots) { const p = path.join(r, rel); if (fs.existsSync(p)) return p; } return null; };
  const ws = first('VMware\\VMware Workstation\\vmrun.exe'); const pl = first('VMware\\VMware Player\\vmrun.exe');
  const vmrun = ws || pl;
  return { vmrun: vmrun ? [vmrun] : null, product: ws ? 'ws' : 'player', ovftool: first('VMware\\VMware Workstation\\OVFTool\\ovftool.exe') || first('VMware\\VMware OVF Tool\\ovftool.exe'), vdisk: first('VMware\\VMware Workstation\\vmware-vdiskmanager.exe') || first('VMware\\VMware Player\\vmware-vdiskmanager.exe') };
}
const vm = (t, args, opts) => run(t.vmrun[0], t.vmrun.slice(1).concat(['-T', t.product]).concat(args), opts || { timeout: 120000 });

function vmxText(name, vmdk, serial) {
  const mac = '00:0c:29:' + crypto.randomBytes(3).toString('hex').match(/../g).join(':');
  return [
    '.encoding = "UTF-8"', 'config.version = "8"', 'virtualHW.version = "14"', 'displayName = "' + name + '"', 'guestOS = "other4xlinux-64"',
    'memsize = "1024"', 'numvcpus = "2"', 'firmware = "bios"',
    'scsi0.present = "TRUE"', 'scsi0.virtualDev = "lsilogic"', 'scsi0:0.present = "TRUE"', 'scsi0:0.fileName = "' + vmdk + '"',
    'ethernet0.present = "TRUE"', 'ethernet0.connectionType = "bridged"', 'ethernet0.virtualDev = "e1000"', 'ethernet0.addressType = "static"', 'ethernet0.address = "' + mac + '"',
    'serial0.present = "TRUE"', 'serial0.fileType = "file"', 'serial0.fileName = "' + serial.replace(/\\/g, '/') + '"', 'serial0.yieldOnMsrRead = "TRUE"',
    'tools.syncTime = "FALSE"', 'mks.enable3d = "FALSE"'
  ].join('\n') + '\n';
}
const macOf = (vmxFile) => { try { const m = /ethernet0\.(?:address|generatedAddress)\s*=\s*"([^"]+)"/.exec(fs.readFileSync(vmxFile, 'utf8')); return m ? m[1].toLowerCase() : ''; } catch { return ''; } };

// The machine folder is ours only when it lies inside this instance's folder and holds a matching marker.
function ownedDir(inst, ctx) {
  const dir = path.join(ctx.instDir, 'vm');
  const marker = path.join(dir, MARKER_NAME);
  let id = ''; try { id = JSON.parse(fs.readFileSync(marker, 'utf8')).id; } catch { /* no marker */ }
  if (id !== inst.id) throw new Error('The machine folder is not marked as created by this app, so it was left alone.');
  const vmx = inst.run.vmx;
  if (!vmx || path.dirname(path.resolve(vmx)).toLowerCase() !== path.resolve(dir).toLowerCase()) throw new Error('The recorded machine file is not inside this instance\'s folder.');
  if (!fs.existsSync(vmx)) throw new Error('The machine file no longer exists.');
  return { dir, vmx };
}

async function bootAndFind(t, inst, ctx) {
  const serial = path.join(ctx.instDir, 'serial.log'); fs.rmSync(serial, { force: true });
  const r = await vm(t, ['start', inst.run.vmx, 'nogui'], { timeout: 120000 });
  if (r.code !== 0) throw new Error('VMware could not start the machine: ' + tail(r.out, 2).slice(0, 300));
  ctx.emit(72, 'Starting the machine');
  const mac = inst.run.mac || macOf(inst.run.vmx);
  return waitForAppliance({ find: async () => addressFromSerialLog(serial) || (await addressFromNeighbours(mac)), signal: ctx.signal, emit: ctx.emit, label: 'Waiting for the web app' });
}

async function deploy(ctx) {
  const inst = ctx.inst;
  ctx.emit(3, 'Looking for VMware');
  const t = tools(); if (!t.vmrun) throw new Error(NEED);
  if (!t.ovftool && !t.vdisk) throw new Error('VMware was found, but neither VMware OVF Tool nor vmware-vdiskmanager is installed, so the appliance disk cannot be converted. Install VMware OVF Tool (free from VMware) and try again.');
  const zipName = applianceName(ctx.version, 'x86_64') + '.ova.zip';
  const dl = await downloadRelease({ version: ctx.version, name: zipName, cacheDir: path.join(ctx.userData, 'images'), signal: ctx.signal, log: ctx.log, onProgress: (f) => ctx.emit(5 + Math.round(f * 40), 'Downloading ' + zipName) });
  ctx.emit(48, 'Unpacking the appliance');
  const ova = await unzipOne(dl.file, path.join(ctx.userData, 'images', 'ova-' + ctx.version), '.ova');

  const dir = path.join(ctx.instDir, 'vm'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER_NAME), JSON.stringify({ id: inst.id, created: new Date().toISOString() }));
  const name = 'gmmc-' + inst.slug + '-' + inst.id.slice(0, 6);
  const serial = path.join(ctx.instDir, 'serial.log');
  ctx.emit(52, 'Converting the machine');
  let vmx = path.join(dir, name + '.vmx');
  if (t.ovftool) {
    const o = await run(t.ovftool, ['--acceptAllEulas', '--name=' + name, '--lax', ova, dir], { timeout: 900000, signal: ctx.signal, onLine: (l) => ctx.log(l) });
    if (o.code !== 0) throw new Error('OVF Tool could not convert the appliance: ' + tail(o.out, 2).slice(0, 300));
    const found = fs.readdirSync(dir, { recursive: true }).map(String).find((f) => f.toLowerCase().endsWith('.vmx'));
    if (!found) throw new Error('OVF Tool finished but produced no .vmx file.');
    vmx = path.join(dir, found);
    let text = fs.readFileSync(vmx, 'utf8').split(/\r?\n/).filter((l) => !/^(ethernet0\.(connectionType|networkName)|serial0\.)/i.test(l)).join('\n');
    text += '\nethernet0.connectionType = "bridged"\nserial0.present = "TRUE"\nserial0.fileType = "file"\nserial0.fileName = "' + serial.replace(/\\/g, '/') + '"\n';
    fs.writeFileSync(vmx, text);
  } else {
    const raw = await untarOne(ova, dir, '.vmdk');
    const out = path.join(dir, name + '.vmdk');
    const c = await run(t.vdisk, ['-r', raw, '-t', '0', out], { timeout: 900000, signal: ctx.signal, onLine: (l) => ctx.log(l) });
    if (c.code !== 0) throw new Error('vmware-vdiskmanager could not convert the disk: ' + tail(c.out, 2).slice(0, 300));
    fs.rmSync(raw, { force: true });
    fs.writeFileSync(vmx, vmxText(name, path.basename(out), serial));
  }
  inst.run = Object.assign({}, inst.run, { vm: name, vmx, mac: macOf(vmx) }); inst.version = ctx.version; inst.where = 'VMware'; ctx.persist(inst);
  const up = await bootAndFind(t, inst, ctx);
  inst.url = up.url;
  return { links: [{ label: name, url: up.url, kind: 'url' }], note: 'Bridged network. Verified: /healthz and /app/ answered.', patch: { url: up.url, run: inst.run, version: ctx.version, where: 'VMware' } };
}

const isRunning = async (t, inst) => { const r = await vm(t, ['list'], { timeout: 30000 }); return r.out.split(/\r?\n/).some((l) => l.trim().toLowerCase() === path.resolve(inst.run.vmx).toLowerCase() || l.trim().toLowerCase() === inst.run.vmx.toLowerCase()); };

async function state(inst, ctx) {
  const t = tools(); if (!t.vmrun) return { exists: false, running: false, reason: NEED };
  try { ownedDir(inst, ctx); return { exists: true, running: await isRunning(t, inst) }; } catch (e) { return { exists: false, running: false, reason: e.message }; }
}
async function start(inst, ctx) {
  const t = tools(); if (!t.vmrun) throw new Error(NEED); ownedDir(inst, ctx);
  if (await isRunning(t, inst)) return { patch: {} };
  const r = await bootAndFind(t, inst, ctx); return { patch: { url: r.url } };
}
async function stop(inst, ctx) {
  const t = tools(); if (!t.vmrun) throw new Error(NEED); ownedDir(inst, ctx);
  if (!(await isRunning(t, inst))) return {};
  const soft = await vm(t, ['stop', inst.run.vmx, 'soft'], { timeout: 90000 });
  for (let i = 0; i < 10 && (await isRunning(t, inst)); i++) await sleep(1000);
  if (await isRunning(t, inst)) await vm(t, ['stop', inst.run.vmx, 'hard'], { timeout: 60000 });
  void soft; return {};
}
async function restart(inst, ctx) { await stop(inst, ctx); return start(inst, ctx); }
async function logs(inst, ctx) { try { return tail(fs.readFileSync(path.join(ctx.instDir, 'serial.log'), 'utf8'), 200) || '(The serial log is empty.)'; } catch { return '(There is no serial log yet.)'; } }
async function remove(inst, ctx) {
  const t = tools(); if (!t.vmrun) throw new Error(NEED);
  const { dir } = ownedDir(inst, ctx);
  await stop(inst, ctx);
  await vm(t, ['deleteVM', inst.run.vmx], { timeout: 120000 });
  fs.rmSync(dir, { recursive: true, force: true });
  return {};
}
async function update(inst, ctx, latest) {
  const t = tools(); if (!t.vmrun) throw new Error(NEED); ownedDir(inst, ctx);
  await stop(inst, ctx);
  // Keep the old machine until the new one answers: move it aside, build the new one, then delete the old.
  const oldDir = path.join(ctx.instDir, 'vm'); const asideDir = path.join(ctx.instDir, 'vm-old');
  fs.rmSync(asideDir, { recursive: true, force: true }); fs.renameSync(oldDir, asideDir);
  try {
    const res = await deploy(Object.assign({}, ctx, { inst: { id: inst.id, slug: inst.slug, run: {} }, version: latest, persist: () => {} }));
    fs.rmSync(asideDir, { recursive: true, force: true });
    return res;
  } catch (e) { fs.rmSync(oldDir, { recursive: true, force: true }); fs.renameSync(asideDir, oldDir); throw e; }
}

module.exports = { deploy, state, start, stop, restart, logs, remove, update, tools, vmxText };
