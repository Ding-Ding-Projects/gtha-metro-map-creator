// Build the static site and copy it, with the Compose file, into desktop/content.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const content = path.resolve(here, '..', 'content');
execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { stdio: 'inherit', cwd: root });
fs.rmSync(content, { recursive: true, force: true });
fs.cpSync(path.join(root, 'dist', 'site'), path.join(content, 'site'), { recursive: true });
fs.copyFileSync(path.join(root, 'compose.yaml'), path.join(content, 'compose.yaml'));
console.log('Prepared', content);
