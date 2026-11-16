// The instance manager: creates instances through the targets, records them, checks their health and
// runs start, stop, restart, logs, update, duplicate and remove on them. It only ever acts on the
// instances in its registry, and each target re-checks the identity of the container, virtual machine
// or folder it was recorded with before touching it.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { portNum, findFreePort, slugify, get } = require('../../shared/common');
const { Registry, newId } = require('./registry');
const { latestReleaseVersion, cmpVersion } = require('./download');
const { hashPasswordAsync } = require('../../shared/password');

const SERVER_KINDS = ['docker', 'builtin', 'ssh', 'virtualbox', 'vmware']; // targets that keep something running
const PORT_KINDS = ['docker', 'builtin'];

class Manager {
  // opts: { userData, siteDir, appVersion, targets, send(channel, payload), getToken, readMap() }
  constructor(opts) {
    Object.assign(this, opts);
    this.registry = new Registry(path.join(opts.userData, 'instances.json'));
    this.busy = new Map(); // instance id -> AbortController
    this.kindOf = new Map(); // instance id -> deploy card kind, while a deployment from a card runs
    this.latest = { at: 0, version: '' };
  }

  instDir(id) { return path.join(this.userData, 'instances', id); }
  status(id, patch) {
    this.send('inst-status', Object.assign({ id }, patch));
    const kind = this.kindOf.get(id); // a deploy card also follows the instance it is deploying
    if (kind) this.send('status', Object.assign({}, patch, { id: kind }));
  }
  changed() { this.send('instances-changed', this.list()); }

  ctx(inst, extra) {
    const ctl = (extra && extra.ctl) || new AbortController();
    return Object.assign({
      inst, settings: {}, siteDir: this.siteDir, userData: this.userData, instDir: this.instDir(inst.id), version: this.appVersion, signal: ctl.signal,
      usedPorts: this.registry.usedPorts(inst.id), getToken: this.getToken,
      persist: (i) => { try { this.registry.upsert(i); } catch { /* not fatal */ } },
      emit: (pct, msg) => this.status(inst.id, { state: 'running', pct, msg }),
      log: (line) => this.send('log', { id: inst.id, line: String(line).slice(0, 400) })
    }, extra || {});
  }

  // ---- listing and health ----
  async latestVersion() {
    if (Date.now() - this.latest.at > 3600000) { this.latest = { at: Date.now(), version: await latestReleaseVersion() }; }
    return this.latest.version;
  }
  latestFor(inst, released) {
    if (['docker', 'ssh', 'virtualbox', 'vmware'].includes(inst.kind) && released && cmpVersion(released, this.appVersion) > 0) return released;
    return this.appVersion;
  }
  list(released) {
    return this.registry.list().map((i) => {
      // The renderer is told whether sign-in is on, never the hash itself.
      const signin = !!i.passwordHash; delete i.passwordHash;
      const latest = this.latestFor(i, released || this.latest.version);
      const canUpdate = ['docker', 'builtin', 'ssh', 'virtualbox', 'vmware'].includes(i.kind);
      return Object.assign({}, i, {
        signin, busy: this.busy.has(i.id), latest, updateAvailable: canUpdate && !!i.version && /^\d/.test(i.version) && cmpVersion(i.version, latest) < 0,
        canRun: SERVER_KINDS.includes(i.kind), canDuplicate: SERVER_KINDS.includes(i.kind)
      });
    });
  }

  async checkOne(inst) {
    const t = this.targets[inst.kind];
    let state = 'unknown'; let reason = '';
    try {
      const s = await t.state(inst, this.ctx(inst));
      if (!s.exists) { state = s.unknown ? 'unknown' : 'missing'; reason = s.reason || ''; }
      else if (!SERVER_KINDS.includes(inst.kind)) state = 'healthy';
      else if (!s.running) state = 'stopped';
      else {
        const probe = inst.kind === 'builtin' ? inst.url : inst.url ? inst.url + 'healthz' : '';
        const code = probe ? await get(probe.replace('localhost', '127.0.0.1'), 3000) : 0;
        state = code === 200 ? 'healthy' : 'unhealthy';
        if (state === 'unhealthy') reason = probe ? 'No answer from ' + inst.url : 'No address is recorded.';
      }
    } catch (e) { state = 'unknown'; reason = String(e.message || e).slice(0, 300); }
    const cur = this.registry.get(inst.id); if (!cur) return null;
    cur.check = { at: Date.now(), state };
    this.registry.upsert(cur);
    return Object.assign({ id: inst.id, state, reason, at: cur.check.at });
  }
  async checkAll() {
    const released = await this.latestVersion();
    const results = [];
    await Promise.all(this.registry.list().filter((i) => !this.busy.has(i.id)).map(async (i) => { const r = await this.checkOne(i); if (r) results.push(r); }));
    this.latest.version = released;
    this.changed();
    return results;
  }

  // ---- creating and redeploying ----
  async deploy(kind, settings, mapInfo) {
    const t = this.targets[kind];
    if (!t) throw new Error('Unknown target');
    const s = settings || {};
    const name = String(s.name || '').trim().slice(0, 60) || (mapInfo && mapInfo.name ? mapInfo.name.replace(/\.(gmmc\.)?json$/i, '') : '') || 'Metro map';
    const existing = this.registry.findByName(kind, name);
    if (existing && this.busy.has(existing.id)) throw new Error('"' + name + '" is busy. Wait for it to finish.');
    const fresh = !existing;
    const inst = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: newId(), kind, name, slug: this.registry.uniqueSlug(kind, slugify(name)), created: new Date().toISOString(), version: '', port: 0, passwordHash: '', url: '', map: '', tag: '', where: '',
      run: { project: '', dir: '', vm: '', uuid: '', vmx: '', host: '', user: '', sshPort: 0, key: '', remoteDir: '', path: '', repo: '', mac: '', netMode: '' }, check: { at: 0, state: '' }
    };
    inst.name = name; inst.map = mapInfo && mapInfo.name ? mapInfo.name : '';
    const ctl = new AbortController(); this.busy.set(inst.id, ctl); this.kindOf.set(inst.id, kind);
    const log = (line) => this.send('log', { id: inst.id, line: String(line).slice(0, 400) });
    try {
      if (PORT_KINDS.includes(kind) || (kind === 'ssh')) await this.choosePort(inst, s, kind, fresh, log);
      if (kind === 'docker' || kind === 'ssh') { inst.tag = String(s.tag || 'latest').trim() || 'latest'; await this.applyPassword(inst, s); }
      if (kind === 'virtualbox') inst.run.netMode = s.netMode === 'nat' ? 'nat' : 'bridged';
      if (kind === 'ssh') inst.run = Object.assign({}, inst.run, { host: String(s.host || '').trim(), user: String(s.user || '').trim(), sshPort: Number(s.sshPort || 22), key: String(s.key || '').trim(), remoteDir: String(s.folder || '~/gtha-map').trim() });
      if (kind === 'folder' || kind === 'pages') inst.slug = inst.slug || slugify(name);
      if (fresh || kind === 'virtualbox' || kind === 'vmware') { inst.where = inst.where || ''; }
      this.registry.upsert(inst); this.changed();
      this.status(inst.id, { state: 'running', pct: 2, msg: 'Starting', links: [], error: '', note: '' });
      const ctx = this.ctx(inst, { ctl, settings: s, mapText: mapInfo ? mapInfo.text : null, known: !fresh });
      const res = await t.deploy(ctx);
      if (ctl.signal.aborted) throw new Error('Cancelled.');
      const done = Object.assign(inst, res.patch || {});
      if (res.patch && res.patch.run) done.run = Object.assign({}, inst.run, res.patch.run);
      done.check = { at: Date.now(), state: 'healthy' };
      this.registry.upsert(done);
      this.status(inst.id, { state: 'live', pct: 100, msg: done.passwordHash ? 'Live, password required' : 'Live', links: res.links, note: res.note || '', signin: !!done.passwordHash });
      this.changed();
      return { ok: true, id: inst.id };
    } catch (e) {
      const msg = ctl.signal.aborted ? 'Cancelled.' : String((e && e.message) || e).slice(0, 600);
      log('Failed: ' + msg);
      // A new instance that left nothing behind is not worth a registry entry.
      if (fresh) {
        let left = false; try { const st = await t.state(Object.assign({}, this.registry.get(inst.id) || inst), this.ctx(inst)); left = !!st.exists && SERVER_KINDS.includes(kind) && kind !== 'builtin'; } catch { left = false; }
        if (!left) { this.registry.remove(inst.id); try { fs.rmSync(this.instDir(inst.id), { recursive: true, force: true }); } catch { /* nothing */ } }
      }
      this.status(inst.id, { state: 'failed', pct: 0, msg: '', error: msg });
      this.changed();
      return { ok: false, error: msg, id: inst.id };
    } finally { this.busy.delete(inst.id); this.kindOf.delete(inst.id); }
  }

  // Sign-in: the password is hashed here and only the hash is kept (in the registry and in the instance's .env).
  // With sign-in on and no new password typed, the hash already recorded for the instance is kept.
  async applyPassword(inst, s) {
    if (!s.requirePassword) { inst.passwordHash = ''; return; }
    if (s.password) inst.passwordHash = await hashPasswordAsync(String(s.password));
    else if (s.inheritHash) inst.passwordHash = String(s.inheritHash);
    else if (!inst.passwordHash) throw new Error('Enter a password, or turn off "Require a password".');
  }

  // New instances get the requested port, or the next free one when it is taken by another instance or by something else.
  async choosePort(inst, s, kind, fresh, log) {
    const want = portNum(s.port) || (kind === 'builtin' ? 8090 : 8080);
    const others = this.registry.usedPorts(inst.id);
    if (!fresh && (inst.port === want || !s.port)) return;
    if (kind === 'ssh') { inst.port = want; return; } // the port lives on the remote server
    const free = await findFreePort(want, others);
    if (!free) throw new Error('No free port was found from ' + want + ' upward.');
    if (free !== want) log('Port ' + want + ' is taken, so port ' + free + ' is used for "' + inst.name + '".');
    inst.port = free;
  }

  cancel(id) { const c = this.busy.get(id); if (c) c.abort(); }
  cancelKind(kind) { for (const [id, k] of this.kindOf) if (k === kind) this.cancel(id); }

  // ---- actions on recorded instances ----
  async action(id, action, opts) {
    const inst = this.registry.get(id);
    if (!inst) return { ok: false, error: 'That instance is not in the registry.' };
    const t = this.targets[inst.kind];
    if (this.busy.has(id)) return { ok: false, error: '"' + inst.name + '" is busy. Wait for it to finish.' };
    const ctl = new AbortController(); this.busy.set(id, ctl); this.changed();
    const ctx = this.ctx(inst, { ctl });
    try {
      let out = {};
      if (action === 'logs') { out.text = await t.logs(inst, ctx); return Object.assign({ ok: true }, out); }
      this.status(id, { state: 'running', pct: 10, msg: action });
      if (action === 'start' || action === 'stop' || action === 'restart') {
        const r = await t[action](inst, ctx); const cur = this.registry.get(id); Object.assign(cur, r && r.patch ? r.patch : {}); this.registry.upsert(cur);
      } else if (action === 'update') {
        const released = await this.latestVersion(); const latest = this.latestFor(inst, released);
        let mapText = null;
        const r = await t.update(inst, Object.assign(ctx, { mapText }), latest); const cur = this.registry.get(id); Object.assign(cur, r.patch || {}); if (r.patch && r.patch.run) cur.run = Object.assign({}, cur.run, r.patch.run); this.registry.upsert(cur);
        out.links = r.links;
      } else if (action === 'remove') {
        await t.remove(inst, ctx);
        if (inst.kind !== 'docker' && inst.kind !== 'builtin') { try { fs.rmSync(this.instDir(id), { recursive: true, force: true }); } catch { /* not there */ } }
        this.registry.remove(id);
        this.status(id, { state: 'removed' });
      } else return { ok: false, error: 'Unknown action.' };
      const after = this.registry.get(id); if (after) await this.checkOne(after);
      this.status(id, { state: action === 'remove' ? 'removed' : 'idle' });
      return Object.assign({ ok: true }, out);
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 600);
      this.send('log', { id, line: 'Failed: ' + msg });
      this.status(id, { state: 'idle' });
      return { ok: false, error: msg };
    } finally { this.busy.delete(id); this.changed(); }
  }

  // A copy: same kind and settings, new name, next free port, same starting map.
  async duplicate(id, name, mapInfo) {
    const src = this.registry.get(id);
    if (!src) return { ok: false, error: 'That instance is not in the registry.' };
    if (!SERVER_KINDS.includes(src.kind)) return { ok: false, error: 'This kind of instance cannot be duplicated.' };
    const copyName = String(name || '').trim() || src.name + ' copy';
    if (this.registry.findByName(src.kind, copyName)) return { ok: false, error: 'There is already an instance named "' + copyName + '".' };
    const s = { name: copyName, port: src.port ? src.port + 1 : 0, tag: src.tag, requirePassword: !!src.passwordHash, inheritHash: src.passwordHash, netMode: src.run.netMode, host: src.run.host, user: src.run.user, sshPort: src.run.sshPort, key: src.run.key, folder: src.run.remoteDir.replace(/\/[^/]+$/, '') };
    let map = mapInfo || null;
    const f = path.join(this.instDir(id), 'default-map.json');
    if (!map && fs.existsSync(f)) map = { name: src.map, text: fs.readFileSync(f, 'utf8') };
    return this.deploy(src.kind, s, map);
  }
}

module.exports = { Manager, SERVER_KINDS };
