// Target: a folder or a ZIP file holding the static website. The manager can open it and forget it,
// but never deletes anything: the files may already be in use by a web host.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { writeFolder, writeZip } = require('../lib/site');

async function deploy(ctx) {
  const s = ctx.settings;
  const dest = String(s.path || '').trim();
  if (!dest) throw new Error('Choose a folder or a ZIP file name in Settings.');
  if (!path.isAbsolute(dest)) throw new Error('Choose a full path, for example C:\\Users\\you\\Documents\\gtha-map.');
  const zip = s.mode === 'zip';
  ctx.emit(30, zip ? 'Writing the ZIP file' : 'Copying the website');
  let count;
  try {
    if (zip) { const file = /\.zip$/i.test(dest) ? dest : dest + '.zip'; count = await writeZip(ctx.siteDir, ctx.mapText, file); const bytes = fs.statSync(file).size; ctx.log('Wrote ' + count + ' files, ' + bytes + ' bytes, to ' + file); return { links: [{ label: file, url: file, kind: 'path' }], patch: { url: file, where: 'ZIP file', version: ctx.version, run: { path: file } } }; }
    count = writeFolder(ctx.siteDir, ctx.mapText, dest);
  } catch (e) { throw new Error('Could not write there: ' + e.message); }
  if (!fs.existsSync(path.join(dest, 'app', 'index.html'))) throw new Error('The copy finished but app/index.html is missing in the folder.');
  ctx.log('Copied ' + count + ' files to ' + dest);
  return { links: [{ label: dest, url: dest, kind: 'path' }], patch: { url: dest, where: 'Folder', version: ctx.version, run: { path: dest } } };
}

const state = async (inst) => ({ exists: !!inst.run.path && fs.existsSync(inst.run.path), running: !!inst.run.path && fs.existsSync(inst.run.path), reason: 'The folder or file is no longer there.' });
const remove = async () => ({}); // forgetting only: the files stay where they are
const logs = async (inst) => 'Written to ' + inst.run.path + '. A folder or ZIP file has no log.';

module.exports = { deploy, state, remove, logs };
