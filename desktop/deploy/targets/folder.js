// Target 5: a folder or a ZIP file holding the static website.
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
    if (zip) { const file = /\.zip$/i.test(dest) ? dest : dest + '.zip'; count = await writeZip(ctx.siteDir, ctx.mapText, file); const bytes = fs.statSync(file).size; ctx.log('Wrote ' + count + ' files, ' + bytes + ' bytes, to ' + file); return { links: [{ label: file, url: file, kind: 'path' }] }; }
    count = writeFolder(ctx.siteDir, ctx.mapText, dest);
  } catch (e) { throw new Error('Could not write there: ' + e.message); }
  if (!fs.existsSync(path.join(dest, 'app', 'index.html'))) throw new Error('The copy finished but app/index.html is missing in the folder.');
  ctx.log('Copied ' + count + ' files to ' + dest);
  return { links: [{ label: dest, url: dest, kind: 'path' }] };
}

module.exports = { deploy };
