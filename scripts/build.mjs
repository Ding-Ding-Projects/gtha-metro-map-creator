// Validates the static site and copies it to dist/site.
// Checks: JavaScript syntax, template integrity (every path ref resolves), and local links.
import { readFile, readdir, rm, cp, mkdir } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const root = resolve('site');
const errors = [];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

const files = await walk(root);
for (const f of files.filter((f) => extname(f) === '.js')) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { errors.push(`syntax: ${f}\n${e.stderr}`); }
}

// Template integrity
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(await readFile(join(root, 'app', 'gtha-template.js'), 'utf8'), ctx);
const m = ctx.window.GTHATemplates.gtha();
const ids = new Set(Object.keys(m.stations));
for (const l of m.lines) {
  for (const r of l.path) if (r[0] !== '@' && !ids.has(r)) errors.push(`template: line ${l.id} references missing station ${r}`);
  if (l.path.length < 2) errors.push(`template: line ${l.id} has fewer than two nodes`);
}
const used = new Set(m.lines.flatMap((l) => l.path));
for (const id of ids) if (!used.has(id)) errors.push(`template: station ${id} is on no line`);

// Local links in HTML
for (const f of files.filter((f) => extname(f) === '.html')) {
  const html = await readFile(f, 'utf8');
  for (const [, href] of html.matchAll(/(?:href|src)="([^"#:]+)(?:#[^"]*)?"/g)) {
    let target = resolve(dirname(f), href);
    if (href.endsWith('/')) target = join(target, 'index.html');
    if (!files.includes(target)) errors.push(`link: ${f} -> ${href}`);
  }
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp(root, join('dist', 'site'), { recursive: true });
console.log(`OK: ${files.length} files, ${ids.size} template stations, ${m.lines.length} template lines. Output: dist/site`);
