// Target: GitHub Pages. The publishing logic lives in site/app/deploy-core.js and is shared with the web editor.
// The token comes from the GitHub CLI (when signed in) or from a token the person pasted, which this app keeps
// only through Electron safeStorage (Windows DPAPI). It is never logged or written in plain text.
'use strict';
const core = require('../../content/site/app/deploy-core.js');
const { siteFiles } = require('../lib/site');
const { run } = require('../lib/proc');

// Reads the token the GitHub CLI holds, in memory only.
async function cliToken() {
  const r = await run('gh', ['auth', 'token'], { timeout: 15000 });
  const t = r.out.trim();
  return r.code === 0 && /^[A-Za-z0-9_]{20,255}$/.test(t) ? t : null;
}
async function cliStatus() {
  const t = await cliToken(); if (!t) return { available: false };
  try { return { available: true, login: await core.whoami(t) }; } catch { return { available: false }; }
}

async function deploy(ctx) {
  core.parseRepo(ctx.settings.repo);
  ctx.emit(3, 'Signing in to GitHub');
  const token = await ctx.getToken();
  if (!token) throw new Error('Not signed in. Choose Sign in with GitHub, then deploy again.');
  const files = siteFiles(ctx.siteDir, ctx.mapText).map((f) => ({ rel: f.rel, bytes: async () => f.read() }));
  const res = await core.publishPages({ token, repo: ctx.settings.repo, files, emit: ctx.emit, log: ctx.log, signal: ctx.signal });
  const link = (res.links || []).find((l) => l.kind === 'url');
  return Object.assign({}, res, { patch: { url: link ? link.url : '', where: ctx.settings.repo, version: ctx.version, run: { repo: ctx.settings.repo } } });
}

const state = async () => ({ exists: true, running: true, reason: '' });
const remove = async () => ({}); // forgetting only: the repository and its site stay on GitHub
const logs = async (inst) => 'Published to ' + inst.run.repo + ' (the gh-pages branch).';

module.exports = { deploy, state, remove, logs, parseRepo: core.parseRepo, cliToken, cliStatus, whoami: core.whoami };
