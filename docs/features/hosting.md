# Hosting with Docker

- `Dockerfile`: builds the site with Node, then serves `dist/site` from
  `nginxinc/nginx-unprivileged:1.27-alpine` on port 8080 as a non-root user. `/healthz` returns
  `ok`; the image has a `HEALTHCHECK`.
- `docker/nginx.conf`: security headers (`nosniff`, `no-referrer`, `SAMEORIGIN`), no server
  version, one-hour caching for scripts, styles and images.
- `compose.yaml`: uses the published image `ghcr.io/ding-ding-projects/gtha-metro-map-creator`,
  host port `GMMC_PORT` (default 8080), tag `GMMC_TAG` (default `latest`), read-only root file
  system with a `/tmp` tmpfs, restart unless stopped.
- `.github/workflows/image.yml`: on every push to `main` and on `v*` tags, builds and pushes
  `latest`, `sha-<short>` and the version tag to GitHub Container Registry. The package is public.

## host.bat

| Command | What it does |
| --- | --- |
| `host.bat` | Menu: detached, logs, stop or quit |
| `host.bat --detached` | Pull, start, wait up to 60 s for `/healthz`, print the local and network address, exit |
| `host.bat --logs` | The same, then a key menu: follow logs, last 50 lines, status, restart, stop, leave |
| `host.bat --stop` | `docker compose down` |

Exit codes: 2 Docker missing, 3 Docker not running, 4 Compose v2 missing, 5 pull failed, 6 start
failed, 7 health check timed out, 1 unknown option.

## Release hosting bundle

Every release attaches `gtha-metro-map-creator-server-<version>.zip`. It holds `compose.yaml` and
`host.bat` pinned to that release's image tag (`GMMC_TAG` still overrides it) and a short
`README.txt` with the requirements, the `--detached` and `--logs` modes, how to change the port and
where the network address is shown. The release notes name the image tag and its digest. The bundle is
built by `scripts/make-server-bundle.mjs`.

## Appliance virtual machine

For a dedicated server without installing Docker yourself, each release also attaches disk images for
Hyper-V, VirtualBox, VMware, Proxmox and QEMU. See [appliance.md](appliance.md).

## Security

There is no sign-in. The server only serves static files and stores nothing; maps stay in each
visitor's browser. Run it only on a network you trust and do not forward the port to the
internet.
