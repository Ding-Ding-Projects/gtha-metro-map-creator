// Generates design/Deploy16.dc.html: the one-click deploy app for every hosting type.
const fs = require('fs');
const SP = process.env.SP, REPO = process.env.REPO;
const S = JSON.parse(fs.readFileSync(SP + '/m3/scheme.json')).light;
const chip = (t, bg, fg) => `<span style="height:28px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:8px;background:${bg};color:${fg};font-size:12px;font-weight:600">${t}</span>`;
const done = chip('✓ Live', '#C8F0D2', '#0B5A26'), run = chip('Uploading 62%', S.secondaryContainer, S.onSecondaryContainer), need = chip('Needs sign-in', S.tertiaryContainer, S.onTertiaryContainer), off = chip('Skipped', S.surfaceContainerHighest, S.onSurfaceVariant);
const btn = (t, filled) => `<span style="height:32px;display:flex;align-items:center;padding:0 14px;border-radius:16px;font-weight:500;${filled ? `background:${S.primary};color:${S.onPrimary}` : `border:1px solid ${S.outline};color:${S.primary}`}">${t}</span>`;
const targets = [
  ['This computer with Docker', 'Container image from GitHub, port 8080, your home network', true, done, 'http://192.168.1.20:8080/'],
  ['This computer, no Docker', 'Built-in web server, port 8090, starts with Windows', true, done, 'http://192.168.1.20:8090/'],
  ['Remote server over SSH', 'docker@192.168.1.50, Docker Compose in ~/gtha-map', true, run, ''],
  ['GitHub Pages', 'your-name/my-metro-map, public website', true, need, ''],
  ['Folder or ZIP', 'Static website for any web host', false, off, ''],
];
const rows = targets.map(([n, d, on, st, url]) => `<div style="display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:16px;background:${S.surfaceContainerLow};border:1px solid ${S.outlineVariant}">
<div style="display:flex;align-items:center;gap:14px"><span style="width:18px;height:18px;border-radius:2px;${on ? `background:${S.primary}` : `border:2px solid ${S.onSurfaceVariant}`};color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center">${on ? '✓' : ''}</span><div style="flex:1;display:flex;flex-direction:column"><span style="font-weight:600">${n}</span><span style="font-size:12px;color:${S.onSurfaceVariant}">${d}</span></div>${st}</div>
${url ? `<div style="display:flex;align-items:center;gap:8px;padding-left:32px"><span style="flex:1;height:36px;display:flex;align-items:center;padding:0 12px;border-radius:8px;background:${S.surfaceContainerHighest};font-family:Consolas,monospace;color:${S.primary}">${url}</span>${btn('Copy')}${btn('Open', true)}</div>` : ''}
${st === run ? `<div style="margin-left:32px;height:4px;border-radius:2px;background:${S.secondaryContainer};position:relative"><div style="position:absolute;left:0;top:0;bottom:0;width:62%;border-radius:2px;background:${S.primary}"></div></div>` : ''}
${st === need ? `<div style="display:flex;align-items:center;gap:8px;padding-left:32px"><span style="flex:1;font-size:12px;color:${S.onSurfaceVariant}">Sign in once with your GitHub account. The key is kept by Windows, never in a file.</span>${btn('Sign in with GitHub', true)}</div>` : ''}
</div>`).join('\n');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GTHA Metro Map Creator deploy</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>body{margin:0}</style>
</helmet>
<div style="font-family:Inter,'Segoe UI',system-ui,sans-serif;font-size:14px;color:${S.onSurface};background:${S.surface};width:960px;height:760px;display:flex;flex-direction:column;overflow:hidden">
<div style="height:40px;display:flex;align-items:center;padding:0 16px;gap:10px;border-bottom:1px solid ${S.outlineVariant}"><span style="width:20px;height:20px;border-radius:6px;background:${S.primary}"></span><span style="font-weight:600">Deploy your map</span><div style="flex:1"></div><span style="color:${S.onSurfaceVariant}">English ▾</span><span style="width:46px;text-align:center">✕</span></div>
<div style="flex:1;display:flex;flex-direction:column;gap:12px;padding:20px 28px 24px;min-height:0">
<div style="display:flex;align-items:center;gap:16px"><div style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:24px;line-height:32px">Put your map online, everywhere at once</span><span style="color:${S.onSurfaceVariant}">Map: <b>2031 plan.gmmc.json</b> · version 1.6.0 · pick where it goes, then press Deploy</span></div><span style="height:40px;display:flex;align-items:center;padding:0 16px;border-radius:20px;border:1px solid ${S.outline};color:${S.primary};font-weight:500">Choose map</span></div>
${rows}
<div style="flex:1"></div>
<div style="display:flex;align-items:center;gap:12px"><span style="color:${S.onSurfaceVariant}">2 live · 1 uploading · 1 waiting for you</span><div style="flex:1"></div><span style="height:40px;display:flex;align-items:center;padding:0 16px;color:${S.primary};font-weight:500">Copy all links</span><span style="height:56px;display:flex;align-items:center;gap:10px;padding:0 28px;border-radius:16px;background:${S.primaryContainer};color:${S.onPrimaryContainer};font-weight:600;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,.2)">▶ Deploy to 4 places</span></div>
</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":960,"height":760}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
fs.writeFileSync(REPO + '/design/Deploy16.dc.html', html);
console.log('bytes', html.length);
