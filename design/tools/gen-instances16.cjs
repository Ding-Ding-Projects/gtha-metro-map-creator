// Generates design/Instances16.dc.html: the deploy app's instance manager.
const fs = require('fs');
const SP = process.env.SP, REPO = process.env.REPO;
const S = JSON.parse(fs.readFileSync(SP + '/m3/scheme.json')).light;
const IC = JSON.parse(fs.readFileSync(SP + '/m3/icons.json'));
const icon = (n, c = 'currentColor', sz = 20) => `<svg width="${sz}" height="${sz}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="${c}" d="${IC[n] || ''}"/></svg>`;
const ok = ['#C8F0D2', '#0B5A26'], warn = ['#FFDEA6', '#3D2E00'], off = [S.surfaceContainerHighest, S.onSurfaceVariant];
const rows = [
  ['Today', 'hub', 'Docker on this computer', '1.6.0', ok, 'Healthy · checked 12 s ago', 'http://192.168.1.20:8080/', 1],
  ['2031 plan', 'hub', 'Docker on this computer', '1.6.0', ok, 'Healthy · checked 12 s ago', 'http://192.168.1.20:8081/', 0],
  ['Club demo', 'layers', 'VirtualBox VM gmmc-club-demo', '1.6.0', ok, 'Healthy · checked 20 s ago', 'http://192.168.1.41:8080/', 0],
  ['Workshop', 'layers', 'VMware VM gmmc-workshop', '1.5.0', warn, 'Update available · 1.6.0', 'http://192.168.1.44:8080/', 0],
  ['Home server', 'sync_alt', 'SSH docker@192.168.1.50', '1.6.0', ok, 'Healthy · checked 31 s ago', 'http://192.168.1.50:8080/', 0],
  ['Old test', 'hub', 'Docker on this computer', '1.4.0', off, 'Stopped', 'http://192.168.1.20:8082/', 0],
];
const chip = ([bg, fg], t) => `<span style="height:24px;display:inline-flex;align-items:center;padding:0 10px;border-radius:8px;background:${bg};color:${fg};font-size:12px;font-weight:600;white-space:nowrap">${t}</span>`;
const ib = (n, label) => `<span title="${label}" style="width:36px;height:36px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:${S.onSurfaceVariant}">${icon(n)}</span>`;
const row = ([name, ic, where, ver, st, health, url, sel]) => `<div style="display:grid;grid-template-columns:28px 1.3fr 1.6fr 70px 1.5fr 2fr 150px;align-items:center;gap:12px;min-height:60px;padding:0 14px;border-radius:16px;${sel ? `background:${S.secondaryContainer}` : ''}">
<span style="width:20px;height:20px;border-radius:6px;${sel ? `background:${S.primary}` : `border:2px solid ${S.onSurfaceVariant};box-sizing:border-box`};display:flex;align-items:center;justify-content:center">${sel ? icon('check', S.onPrimary, 16) : ''}</span>
<span style="font-weight:600">${name}</span>
<span style="display:flex;align-items:center;gap:8px;font-size:13px;color:${S.onSurfaceVariant}">${icon(ic, S.onSurfaceVariant, 18)}${where}</span>
<span style="font-variant-numeric:tabular-nums">${ver}</span>
<span>${chip(st, health)}</span>
<span style="font-family:Consolas,monospace;font-size:13px;color:${st === off ? S.onSurfaceVariant : S.primary}">${url}</span>
<span style="display:flex;justify-content:flex-end">${st === off ? ib('add', 'Start') : ib('remove', 'Stop')}${ib('public', 'Open')}${ib('more_vert', 'More')}</span>
</div>`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Deploy app: instance manager</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>body{margin:0}</style>
</helmet>
<div style="font-family:Inter,'Segoe UI',system-ui,sans-serif;font-size:14px;color:${S.onSurface};background:${S.surface};width:1280px;height:820px;display:flex;flex-direction:column;overflow:hidden;position:relative">
<div style="height:40px;flex:none;display:flex;align-items:center;padding:0 16px;gap:10px;border-bottom:1px solid ${S.outlineVariant}"><span style="width:20px;height:20px;border-radius:6px;background:${S.primary}"></span><span style="font-weight:600">Deploy your map</span><div style="flex:1"></div><span style="color:${S.onSurfaceVariant}">English ▾</span><span style="width:46px;text-align:center">✕</span></div>
<div style="display:flex;gap:4px;padding:8px 20px 0;border-bottom:1px solid ${S.outlineVariant}">${[['Deploy', 0], ['Instances 6', 1]].map(([t, on]) => `<span style="height:44px;display:flex;align-items:center;padding:0 18px;font-weight:600;${on ? `color:${S.primary};border-bottom:3px solid ${S.primary}` : `color:${S.onSurfaceVariant}`}">${t}</span>`).join('')}</div>
<div style="flex:1;display:flex;flex-direction:column;gap:14px;padding:18px 24px;min-height:0">
<div style="display:flex;align-items:center;gap:12px"><div style="flex:1;display:flex;flex-direction:column"><span style="font-size:24px;line-height:32px">Your instances</span><span style="color:${S.onSurfaceVariant}">Every copy this app deployed, with its own name, port, map and link. Health is checked live.</span></div>
<span style="height:40px;display:flex;align-items:center;gap:8px;padding:0 16px;border-radius:20px;border:1px solid ${S.outline};color:${S.primary};font-weight:500">${icon('sync_alt', S.primary)}Check all now</span>
<span style="height:40px;display:flex;align-items:center;gap:8px;padding:0 20px;border-radius:20px;background:${S.primary};color:${S.onPrimary};font-weight:500">${icon('add', S.onPrimary)}New instance</span></div>
<div style="display:flex;gap:8px;align-items:center"><div style="height:44px;width:300px;display:flex;align-items:center;gap:10px;padding:0 14px;border-radius:22px;background:${S.surfaceContainerHighest};color:${S.onSurfaceVariant}">${icon('search')}Search instances</div>${[['✓ All 6', 1], ['Running 5', 0], ['Stopped 1', 0], ['Updates 1', 0]].map(([t, on]) => `<span style="height:32px;display:flex;align-items:center;padding:0 12px;border-radius:8px;font-weight:500;font-size:13px;${on ? `background:${S.secondaryContainer};color:${S.onSecondaryContainer}` : `border:1px solid ${S.outlineVariant}`}">${t}</span>`).join('')}</div>
<div style="display:grid;grid-template-columns:28px 1.3fr 1.6fr 70px 1.5fr 2fr 150px;gap:12px;padding:0 14px;font-size:12px;font-weight:600;color:${S.onSurfaceVariant}"><span></span><span>Name</span><span>Where</span><span>Version</span><span>Health</span><span>Link</span><span style="text-align:right">Actions</span></div>
<div style="display:flex;flex-direction:column;gap:4px">${rows.map(row).join('\n')}</div>
<div style="flex:1"></div>
<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:16px;background:${S.surfaceContainer}"><span style="font-weight:600">1 selected</span><span style="color:${S.onSurfaceVariant}">Today · Docker · port 8080</span><div style="flex:1"></div>${['Restart', 'View logs', 'Update', 'Duplicate'].map((t) => `<span style="height:36px;display:flex;align-items:center;padding:0 14px;border-radius:18px;border:1px solid ${S.outline};color:${S.primary};font-weight:500">${t}</span>`).join('')}<span style="height:36px;display:flex;align-items:center;padding:0 14px;border-radius:18px;color:${S.error};font-weight:600">Remove…</span></div>
</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1280,"height":820}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
fs.writeFileSync(REPO + '/design/Instances16.dc.html', html);
console.log('bytes', html.length);
