// The instance registry: a JSON file in the app's user data folder listing every instance this app
// created. The manager only ever acts on entries found here, and checks the recorded identity of the
// container or virtual machine again before touching it.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KINDS = ['docker', 'builtin', 'ssh', 'virtualbox', 'vmware', 'folder', 'pages'];
const { hashOk } = require('../../shared/password');
const newId = () => crypto.randomBytes(6).toString('hex');

// Keeps only known fields of the right type, so a damaged or hand-edited file cannot inject anything.
function clean(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = KINDS.includes(raw.kind) ? raw.kind : null;
  const id = typeof raw.id === 'string' && /^[0-9a-f]{12}$/.test(raw.id) ? raw.id : null;
  if (!kind || !id) return null;
  const str = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '');
  const num = (v) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : 0);
  const run = raw.run && typeof raw.run === 'object' ? raw.run : {};
  return {
    id, kind, name: str(raw.name, 80) || 'Untitled', slug: str(raw.slug, 40), created: str(raw.created, 40), version: str(raw.version, 40),
    port: num(raw.port), passwordHash: hashOk(raw.passwordHash) ? raw.passwordHash : '', url: str(raw.url, 400), map: str(raw.map, 200), tag: str(raw.tag, 128), where: str(raw.where, 200),
    run: {
      project: str(run.project, 80), dir: str(run.dir, 400), vm: str(run.vm, 120), uuid: str(run.uuid, 80), vmx: str(run.vmx, 400),
      host: str(run.host, 253), user: str(run.user, 40), sshPort: num(run.sshPort), key: str(run.key, 400), remoteDir: str(run.remoteDir, 200),
      path: str(run.path, 400), repo: str(run.repo, 200), mac: str(run.mac, 40), netMode: str(run.netMode, 20)
    },
    check: { at: num(raw.check && raw.check.at), state: str(raw.check && raw.check.state, 20) }
  };
}

class Registry {
  constructor(file) { this.file = file; this.items = null; }
  load() {
    if (this.items) return this.items;
    let raw = [];
    try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8')); raw = Array.isArray(j.instances) ? j.instances : []; } catch { raw = []; }
    this.items = raw.map(clean).filter(Boolean);
    return this.items;
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, instances: this.items }, null, 2));
    fs.renameSync(tmp, this.file);
  }
  list() { return this.load().map((x) => JSON.parse(JSON.stringify(x))); }
  get(id) { return this.load().find((x) => x.id === id) || null; }
  // The slug is unique inside a kind: it names the Compose project, the virtual machine and the data folder.
  uniqueSlug(kind, base) {
    const used = new Set(this.load().filter((x) => x.kind === kind).map((x) => x.slug));
    let s = base || 'map'; let n = 2;
    while (used.has(s)) s = (base || 'map') + '-' + n++;
    return s;
  }
  findByName(kind, name) { return this.load().find((x) => x.kind === kind && x.name.toLowerCase() === String(name).toLowerCase()) || null; }
  usedPorts(exceptId) { return this.load().filter((x) => x.port && x.id !== exceptId && ['docker', 'builtin', 'virtualbox', 'vmware'].includes(x.kind)).map((x) => x.port); }
  upsert(inst) {
    const c = clean(inst); if (!c) throw new Error('Invalid instance record.');
    const i = this.load().findIndex((x) => x.id === c.id);
    if (i >= 0) this.items[i] = c; else this.items.push(c);
    this.save(); return c;
  }
  remove(id) { this.load(); this.items = this.items.filter((x) => x.id !== id); this.save(); }
}

module.exports = { Registry, newId, KINDS, clean };
