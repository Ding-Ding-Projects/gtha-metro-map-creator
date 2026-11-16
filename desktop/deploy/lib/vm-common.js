// Helpers shared by the VirtualBox and VMware targets: find the appliance's address and wait until it answers.
'use strict';
const fs = require('node:fs');
const { get } = require('../../shared/common');
const { run } = require('./proc');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MARKER_NAME = 'gmmc-instance.json';

// The appliance prints "... is ready at: http://<ip>:8080/" on its serial console whenever its address changes.
function addressFromSerialLog(file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return ''; }
  const all = Array.from(text.matchAll(/ready at: http:\/\/(\d{1,3}(?:\.\d{1,3}){3}):8080\//g));
  return all.length ? all[all.length - 1][1] : '';
}

// The IPv4 address the host's neighbour table has for a MAC address ("08:00:27:aa:bb:cc"), or ''.
async function addressFromNeighbours(mac) {
  if (!mac) return '';
  const want = mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  const r = await run('arp', ['-a'], { timeout: 10000 });
  for (const line of r.out.split(/\r?\n/)) {
    const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})\s/i.exec(line);
    if (m && m[2].toLowerCase().replace(/[^0-9a-f]/g, '') === want && !m[1].endsWith('.255')) return m[1];
  }
  return '';
}

// Waits until the appliance answers, then returns { ip, url }. `find` is an async function returning an address or ''.
async function waitForAppliance({ find, port = 8080, timeoutMs = 240000, signal, emit, label }) {
  const t0 = Date.now(); let ip = '';
  while (Date.now() - t0 < timeoutMs) {
    if (signal && signal.aborted) throw new Error('Cancelled.');
    ip = (await find()) || ip;
    if (ip && (await get('http://' + ip + ':' + port + '/healthz', 3000)) === 200 && (await get('http://' + ip + ':' + port + '/app/', 3000)) === 200) return { ip, url: 'http://' + ip + ':' + port + '/' };
    if (emit) emit(Math.min(95, 70 + Math.round(((Date.now() - t0) / timeoutMs) * 25)), label + (ip ? ' (' + ip + ' not answering yet)' : ' (waiting for an address)'));
    await sleep(3000);
  }
  throw new Error(ip ? 'The machine has the address ' + ip + ' but the web app did not answer within ' + Math.round(timeoutMs / 1000) + ' seconds.' : 'The machine did not report a network address within ' + Math.round(timeoutMs / 1000) + ' seconds. Check that its network adapter is connected to your network.');
}

const tail = (text, n) => String(text).split(/\r?\n/).slice(-n).join('\n');

module.exports = { addressFromSerialLog, addressFromNeighbours, waitForAppliance, sleep, tail, MARKER_NAME };
