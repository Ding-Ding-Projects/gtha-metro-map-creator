// Builds the hosting bundle staged for a release: a Compose file and host.bat pinned to one
// version, plus a short README. Usage: node scripts/make-server-bundle.mjs <version> <output-dir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [version, outDir] = process.argv.slice(2);
if (!version || !outDir || !/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/.test(version)) {
  console.error('Usage: node scripts/make-server-bundle.mjs <version like 1.5.0> <output-dir>');
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const crlf = (text) => text.replace(/\r?\n/g, '\r\n');
const replaceOnce = (text, from, to, what) => {
  if (!text.includes(from)) throw new Error(`Could not find ${what} to pin: ${from}`);
  return text.replace(from, to);
};

let compose = readFileSync(join(root, 'compose.yaml'), 'utf8');
compose = replaceOnce(compose, '${GMMC_TAG:-latest}', `\${GMMC_TAG:-${version}}`, 'the image tag in compose.yaml');
compose = compose.replace(/\r\n/g, '\n').replace('# Run the published image.', `# Run version ${version} of the published image.`);
if (compose.includes(':latest')) throw new Error('compose.yaml still refers to the latest tag');

let host = readFileSync(join(root, 'host.bat'), 'utf8');
host = replaceOnce(host, 'if not defined GMMC_TAG set "GMMC_TAG=latest"', `if not defined GMMC_TAG set "GMMC_TAG=${version}"`, 'the default tag in host.bat');
host = host.replace('GMMC_TAG (default latest)', `GMMC_TAG (default ${version})`);

const readme = `GTHA Metro Map Creator ${version}: hosting bundle
=====================================================

This folder starts the editor as a small web server so other devices on your network can open it.

Requirements
  - Windows with Docker Desktop installed and running (Docker Compose v2 is included).
  - Internet access the first time, to download the container image
    ghcr.io/ding-ding-projects/gtha-metro-map-creator:${version}
  On Linux or macOS use the compose file directly: docker compose up -d

Start it
  host.bat --detached   Download the image, start the server in the background, wait for the
                        health check and print the addresses, then exit.
  host.bat --logs       The same, then a menu to follow logs, show status, restart or stop.
  host.bat --stop       Stop the server.
  host.bat              Choose a mode from a menu.

The addresses
  When the server is healthy the script prints this computer's address and your network
  address, for example http://192.168.1.20:8080/ . Open the network address on a phone or
  another computer on the same network. The editor is at /app/ and the documentation at /docs/.

Change the port or the version
  Set GMMC_PORT before running, for example:  set GMMC_PORT=9090 && host.bat --detached
  GMMC_TAG chooses another image tag. This bundle defaults to ${version}.

Security
  There is no sign-in. The server only serves static files and stores nothing; maps stay in each
  visitor's browser. Use it on a network you trust and do not forward the port to the internet.
  If other devices cannot connect, allow the port through Windows Firewall.

More: https://github.com/Ding-Ding-Projects/gtha-metro-map-creator/blob/main/docs/features/hosting.md
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'compose.yaml'), compose);
writeFileSync(join(outDir, 'host.bat'), crlf(host));
writeFileSync(join(outDir, 'README.txt'), crlf(readme));
console.log(`Hosting bundle for ${version} written to ${outDir}`);
