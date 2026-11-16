// The bundled static site: staging it with an optional starting map, a ZIP writer and a small web server.
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const core = require('../../content/site/app/deploy-core.js');

const MAX_MAP = 5 * 1024 * 1024;
const MAP_NAME = 'app/default-map.json';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json', '.md': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };

// Reads and checks a map or project file. Returns the text, or throws an Error with a plain reason.
function readMapFile(file) {
  const st = fs.statSync(file);
  if (st.size > MAX_MAP) throw new Error('The map file is larger than 5 MB.');
  const text = fs.readFileSync(file, 'utf8');
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('The map file is not valid JSON.'); }
  const m = obj && obj.format ? obj.map : obj;
  if (!m || typeof m !== 'object' || m.version !== 1 || !m.stations || typeof m.stations !== 'object' || !Array.isArray(m.lines)) throw new Error('That file is not a GTHA Metro Map Creator map.');
  return text;
}

function listFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r); else if (e.isFile()) out.push(r);
    }
  };
  walk(root, '');
  return out.sort();
}

// Every file of the deployed site as { rel, read() }, with the starting map added when given.
function siteFiles(siteDir, mapText) {
  const files = listFiles(siteDir).filter((r) => r !== MAP_NAME).map((rel) => ({ rel, read: () => fs.readFileSync(path.join(siteDir, ...rel.split('/'))) }));
  if (mapText) files.push({ rel: MAP_NAME, read: () => Buffer.from(mapText, 'utf8') });
  return files;
}

function writeFolder(siteDir, mapText, dest) {
  const files = siteFiles(siteDir, mapText);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of files) {
    const to = path.join(dest, ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, f.read());
  }
  return files.length;
}

const deflateRaw = promisify(zlib.deflateRaw);

// The ZIP writer is shared with the web editor (site/app/deploy-core.js).
async function writeZip(siteDir, mapText, dest) {
  const files = siteFiles(siteDir, mapText).map((f) => ({ rel: f.rel, bytes: async () => f.read() }));
  const zip = await core.buildZip(files, async (u8) => deflateRaw(u8));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, zip);
  return files.length;
}

// Serves the bundled site. The starting map, when set, answers /app/default-map.json from memory.
function createServer(siteDir, getMapText) {
  const root = path.resolve(siteDir);
  return http.createServer((req, res) => {
    const send = (code, body, type) => {
      res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(405, 'Method not allowed'); return; }
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { send(400, 'Bad request'); return; }
    if (rel === '/healthz') { send(200, 'ok\n'); return; }
    if (rel === '/' + MAP_NAME) { const m = getMapText(); if (m) { send(200, m, MIME['.json']); return; } }
    if (rel.endsWith('/')) rel += 'index.html';
    const full = path.resolve(root, '.' + rel);
    if (full !== root && !full.startsWith(root + path.sep)) { send(404, 'Not found'); return; }
    let target = full;
    try { if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html'); } catch { send(404, 'Not found'); return; }
    try { send(200, fs.readFileSync(target), MIME[path.extname(target).toLowerCase()] || 'application/octet-stream'); } catch { send(404, 'Not found'); }
  });
}

module.exports = { MAP_NAME, readMapFile, siteFiles, writeFolder, writeZip, createServer, listFiles };
