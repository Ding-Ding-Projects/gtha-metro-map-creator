// Generates design/Deploy16b.dc.html: the deploy app with every hosting target, and the disk-write confirmation.
const fs = require('fs');
const SP = process.env.SP, REPO = process.env.REPO;
const S = JSON.parse(fs.readFileSync(SP + '/m3/scheme.json')).light;
const IC = JSON.parse(fs.readFileSync(SP + '/m3/icons.json'));
const icon = (n, c = 'currentColor', sz = 22) => `<svg width="${sz}" height="${sz}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="${c}" d="${IC[n] || ''}"/></svg>`;
const chip = (t, bg, fg) => `<span style="height:26px;display:flex;align-items:center;padding:0 10px;border-radius:8px;background:${bg};color:${fg};font-size:12px;font-weight:600;white-space:nowrap">${t}</span>`;
const LIVE = chip('✓ Live', '#C8F0D2', '#0B5A26'), RUN = chip('Starting VM 70%', S.secondaryContainer, S.onSecondaryContainer), READY = chip('Ready', S.surfaceContainerHighest, S.onSurfaceVariant), NEED = chip('Needs sign-in', S.tertiaryContainer, S.onTertiaryContainer), FLASH = chip('Verified', '#C8F0D2', '#0B5A26');
const btn = (t, filled) => `<span style="height:32px;display:flex;align-items:center;padding:0 14px;border-radius:16px;font-weight:500;white-space:nowrap;${filled ? `background:${S.primary};color:${S.onPrimary}` : `border:1px solid ${S.outline};color:${S.primary}`}">${t}</span>`;
const link = (u) => `<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;min-width:0;height:34px;display:flex;align-items:center;padding:0 10px;border-radius:8px;background:${S.surfaceContainerHighest};font-family:Consolas,monospace;font-size:13px;color:${S.primary};overflow:hidden;white-space:nowrap">${u}</span>${btn('Copy')}${btn('Open', true)}</div>`;
const bar = (p) => `<div style="height:4px;border-radius:2px;background:${S.secondaryContainer};position:relative"><div style="position:absolute;left:0;top:0;bottom:0;width:${p}%;border-radius:2px;background:${S.primary}"></div></div>`;
const T = [
  ['hub', 'Docker on this computer', 'Hosted web app · port 8080', true, LIVE, link('http://192.168.1.20:8080/')],
  ['public', 'Built-in server', 'No Docker needed · port 8090', false, READY, ''],
  ['layers', 'VirtualBox', 'Appliance VM · bridged network', true, LIVE, link('http://192.168.1.41:8080/')],
  ['layers', 'VMware', 'Workstation or Player · appliance VM', true, RUN, bar(70)],
  ['sync_alt', 'Remote server over SSH', 'docker@192.168.1.50 · Compose', false, READY, ''],
  ['download', 'USB drive for a spare PC', 'SanDisk Ultra 32 GB · removable', true, FLASH, `<span style="font-size:12px;color:${S.onSurfaceVariant}">Written and read back. Boot the PC from USB, then open the address on its screen.</span>`],
  ['tram', 'Raspberry Pi', 'SD card or USB · Pi 4 and Pi 5 · arm64', false, READY, `<span style="font-size:12px;color:${S.onSurfaceVariant}">Choose a card. Everything on it will be erased.</span>`],
  ['public', 'GitHub Pages', 'your-name/my-metro-map', false, NEED, ''],
  ['folder_open', 'Folder or ZIP', 'Static site for any web host', false, READY, ''],
];
const card = ([ic, n, d, on, st, extra]) => `<div style="display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:16px;background:${S.surfaceContainerLow};border:1px solid ${on ? S.primary : S.outlineVariant}">
<div style="display:flex;align-items:center;gap:12px"><span style="width:20px;height:20px;flex:none;border-radius:6px;${on ? `background:${S.primary}` : `border:2px solid ${S.onSurfaceVariant};box-sizing:border-box`};display:flex;align-items:center;justify-content:center">${on ? icon('check', S.onPrimary, 16) : ''}</span><span style="width:36px;height:36px;flex:none;border-radius:12px;background:${S.secondaryContainer};display:flex;align-items:center;justify-content:center">${icon(ic, S.onSecondaryContainer, 20)}</span><div style="flex:1;min-width:0;display:flex;flex-direction:column"><span style="font-weight:600">${n}</span><span style="font-size:12px;color:${S.onSurfaceVariant};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d}</span></div>${st}</div>${extra}</div>`;
const dialog = `<div style="position:absolute;inset:0;background:rgba(0,0,0,.36)"></div>
<div style="position:absolute;left:50%;top:150px;transform:translateX(-50%);width:520px;border-radius:28px;background:${S.surfaceContainerHigh};box-shadow:0 12px 32px rgba(0,0,0,.3);padding:24px;display:flex;flex-direction:column;gap:14px">
<span style="width:48px;height:48px;border-radius:16px;background:${S.errorContainer};display:flex;align-items:center;justify-content:center;align-self:center">${icon('delete', S.onErrorContainer, 26)}</span>
<span style="font-size:24px;text-align:center">Erase this card and write the Pi image?</span>
<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:${S.surfaceContainerLowest}"><span style="width:40px;height:40px;border-radius:12px;background:${S.secondaryContainer};display:flex;align-items:center;justify-content:center">${icon('tram', S.onSecondaryContainer, 22)}</span><div style="flex:1;display:flex;flex-direction:column"><span style="font-weight:600">Generic SD/MMC reader · 64 GB</span><span style="font-size:12px;color:${S.onSurfaceVariant}">Disk 3 · removable · 2 partitions · not the Windows disk</span></div></div>
<span style="color:${S.onSurfaceVariant}">Everything on Disk 3 will be erased. The image is gtha-metro-map-creator-appliance-1.6.0-arm64-rpi.img (1.1 GB). After writing, every byte is read back and checked.</span>
<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid ${S.outline}"><span style="width:20px;height:20px;border-radius:6px;background:${S.primary};display:flex;align-items:center;justify-content:center">${icon('check', S.onPrimary, 16)}</span><span>I understand Disk 3 will be erased</span></div>
<span style="font-size:12px;color:${S.onSurfaceVariant}">Windows will ask for permission to write to the disk.</span>
<div style="display:flex;gap:8px;justify-content:flex-end"><span style="height:40px;display:flex;align-items:center;padding:0 16px;color:${S.primary};font-weight:500">Cancel</span><span style="height:40px;display:flex;align-items:center;padding:0 22px;border-radius:20px;background:${S.error};color:${S.onError};font-weight:600">Erase and write</span></div>
</div>`;
function page(withDialog, file, title, w, h) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>body{margin:0}</style>
</helmet>
<div style="font-family:Inter,'Segoe UI',system-ui,sans-serif;font-size:14px;color:${S.onSurface};background:${S.surface};width:${w}px;height:${h}px;display:flex;flex-direction:column;overflow:hidden;position:relative">
<div style="height:40px;flex:none;display:flex;align-items:center;padding:0 16px;gap:10px;border-bottom:1px solid ${S.outlineVariant}"><span style="width:20px;height:20px;border-radius:6px;background:${S.primary}"></span><span style="font-weight:600">Deploy your map</span><div style="flex:1"></div><span style="color:${S.onSurfaceVariant}">English ▾</span><span style="width:46px;text-align:center">✕</span></div>
<div style="flex:1;display:flex;flex-direction:column;gap:12px;padding:18px 24px 20px;min-height:0">
<div style="display:flex;align-items:center;gap:16px"><div style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:24px;line-height:32px">Put your map online, everywhere at once</span><span style="color:${S.onSurfaceVariant}">Map: <b>2031 plan.gmmc.json</b> · version 1.6.0 · tick the places, then press Deploy</span></div><span style="height:40px;display:flex;align-items:center;padding:0 16px;border-radius:20px;border:1px solid ${S.outline};color:${S.primary};font-weight:500">Choose map</span></div>
<div style="display:flex;gap:8px">${[['All', 1], ['On this computer', 0], ['Virtual machines', 0], ['Flash a drive', 0], ['Online', 0]].map(([t, on]) => `<span style="height:32px;display:flex;align-items:center;padding:0 12px;border-radius:8px;font-weight:500;font-size:13px;${on ? `background:${S.secondaryContainer};color:${S.onSecondaryContainer}` : `border:1px solid ${S.outlineVariant}`}">${on ? '✓ ' : ''}${t}</span>`).join('')}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start">${T.map(card).join('\n')}</div>
<div style="flex:1"></div>
<div style="display:flex;align-items:center;gap:12px"><span style="color:${S.onSurfaceVariant}">2 live · 1 starting · 1 drive written</span><div style="flex:1"></div><span style="height:40px;display:flex;align-items:center;padding:0 16px;color:${S.primary};font-weight:500">Copy all links</span><span style="height:56px;display:flex;align-items:center;gap:10px;padding:0 28px;border-radius:16px;background:${S.primaryContainer};color:${S.onPrimaryContainer};font-weight:600;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.2)">▶ Deploy to 4 places</span></div>
</div>
${withDialog ? dialog : ''}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
  fs.writeFileSync(REPO + '/design/' + file, html);
  console.log(file, html.length);
}
page(false, 'Deploy16b.dc.html', 'Deploy app: every hosting target', 1120, 900);
page(true, 'Flash16.dc.html', 'Deploy app: erase-and-write confirmation', 1120, 900);
