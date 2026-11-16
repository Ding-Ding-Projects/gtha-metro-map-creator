// Target 2: this computer without Docker. A web server inside this app serves the bundled site.
'use strict';
const { portNum, lanAddresses, get } = require('../../shared/common');
const { createServer } = require('../lib/site');

let server = null; let serverPort = 0;
const state = { mapText: null };

function stop() {
  return new Promise((resolve) => { if (!server) { resolve(); return; } const s = server; server = null; serverPort = 0; s.closeAllConnections?.(); s.close(() => resolve()); });
}
const isRunning = () => !!server;

const RULE = (port) => 'netsh advfirewall firewall add rule name="GTHA Metro Map ' + port + '" dir=in action=allow protocol=TCP localport=' + port;
function firewallHelp(port) {
  return 'Windows Firewall may be blocking port ' + port + ' for other devices. To allow it, run this once in an administrator Command Prompt: ' + RULE(port);
}

async function deploy(ctx) {
  const port = portNum(ctx.settings.port);
  if (!port) throw new Error('The port must be a whole number from 1024 to 65535.');
  state.mapText = ctx.mapText || null;
  if (server && serverPort !== port) await stop();
  if (!server) {
    ctx.emit(20, 'Starting the built-in web server');
    await new Promise((resolve, reject) => {
      const s = createServer(ctx.siteDir, () => state.mapText);
      s.once('error', (e) => reject(new Error(e.code === 'EADDRINUSE' ? 'Port ' + port + ' is already in use. Choose another port in Settings.' : 'The server could not start: ' + e.message)));
      s.listen(port, '0.0.0.0', () => { server = s; serverPort = port; resolve(); });
    });
    ctx.log('Listening on 0.0.0.0:' + port);
  } else ctx.log('The built-in server is already running on port ' + port + '; its starting map was updated.');
  ctx.emit(70, 'Checking your network address');
  const links = [];
  for (const ip of lanAddresses().slice(0, 4)) {
    const url = 'http://' + ip + ':' + port + '/';
    if ((await get(url)) === 200 && (await get(url + 'app/index.html')) === 200) links.push({ label: ip, url, kind: 'url' });
  }
  if (!links.length) {
    if ((await get('http://127.0.0.1:' + port + '/')) === 200) throw new Error('The server runs on this computer, but no network address answered. ' + firewallHelp(port));
    throw new Error('The built-in server did not answer.');
  }
  return { links, note: 'Verified from this computer. If another device cannot open it, ' + firewallHelp(port) };
}

module.exports = { deploy, stop, isRunning, firewallHelp };
