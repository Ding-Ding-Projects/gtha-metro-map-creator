// Runs a program with an argument array (never through a shell) and collects its output.
'use strict';
const { spawn } = require('node:child_process');

// opts: env, input (written to stdin), timeout (ms), onLine (called per output line), signal.
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    let timer = null;
    let timedOut = false;
    try {
      child = spawn(cmd, args, { windowsHide: true, env: Object.assign({}, process.env, opts.env || {}), stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { resolve({ code: -1, out: String(e.message), timedOut: false }); return; }
    let pending = '';
    const feed = (d) => {
      const s = d.toString(); out += s;
      if (opts.onLine) { pending += s; const lines = pending.split(/\r?\n|\r/); pending = lines.pop(); for (const l of lines) if (l.trim()) opts.onLine(l); }
    };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    child.stdin.on('error', () => { /* the program closed its input early */ });
    if (opts.input !== undefined) child.stdin.end(opts.input); else child.stdin.end();
    if (opts.timeout) timer = setTimeout(() => { timedOut = true; try { child.kill(); } catch { /* gone */ } }, opts.timeout);
    if (opts.signal) opts.signal.addEventListener('abort', () => { try { child.kill(); } catch { /* gone */ } }, { once: true });
    child.on('error', (e) => { if (timer) clearTimeout(timer); resolve({ code: -1, out: out + String(e.message), timedOut }); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); if (opts.onLine && pending.trim()) opts.onLine(pending); resolve({ code, out, timedOut }); });
  });
}

module.exports = { run };
