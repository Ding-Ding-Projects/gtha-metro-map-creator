// Generates design/Editor2.dc.html from real station and VIVA stop coordinates.
const fs = require('fs');
const SP = process.env.SP, REPO = process.env.REPO;
const GEO = JSON.parse(fs.readFileSync(SP + '/osm/geo.json'));
const V = JSON.parse(fs.readFileSync(SP + '/gtfs/viva.json'));
const S = JSON.parse(fs.readFileSync(SP + '/m3/scheme.json')).light;
const IC = JSON.parse(fs.readFileSync(SP + '/m3/icons.json'));
global.window = {}; require(REPO + '/site/app/gtha-template.js'); const m = window.GTHATemplates.gtha();
const Z = 11, X0 = 570.78, Y0 = 745.55;
const proj = (lat, lon) => { const x = (lon + 180) / 360 * 2 ** Z; const r = lat * Math.PI / 180; const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** Z; return [(x - X0) * 256, (y - Y0) * 256]; };
const d = (pts) => 'M' + pts.map((p) => p[0].toFixed(0) + ' ' + p[1].toFixed(0)).join('L');
let paths = '';
for (const l of m.lines.filter((l) => ['l1', 'l2', 'l4', 'l5', 'lsw', 'lse', 'rh', 'stf'].includes(l.id))) {
  const pts = l.path.filter((r) => r[0] !== '@' && GEO[r]).map((r) => proj(...GEO[r]));
  paths += `<path d="${d(pts)}" stroke="${l.color}" stroke-width="${l.style === 'rail' ? 5 : 6}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
let vstops = '';
for (const [id, c] of [['601', '#009CDB'], ['603', '#9461A8'], ['605', '#FBAF33']]) {
  const pts = V[id].stops.map((s) => proj(s[1], s[2]));
  paths += `<path d="${d(pts)}" stroke="#FFFFFF" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="${d(pts)}" stroke="${c}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const p of pts) vstops += `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="2.6" fill="#FFFFFF" stroke="${c}" stroke-width="1.6"/>`;
}
let st = '';
for (const id of ['union', 'bloor_yonge', 'st_george', 'spadina', 'kennedy', 'kipling', 'finch', 'vmc', 'sheppard_yonge', 'eglinton', 'langstaff', 'unionville', 'don_mills']) {
  const [x, y] = proj(...GEO[id]); st += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="5.5" fill="#FFFFFF" stroke="#1B1B1F" stroke-width="2.5"/>`;
}
let labels = '';
for (const [id, t, dx, dy, a] of [['union', 'Union', 8, 16], ['finch', 'Finch', 9, -7], ['vmc', 'Vaughan Metropolitan Centre', -8, -10, 'end'], ['kennedy', 'Kennedy', 8, 16], ['kipling', 'Kipling', -8, 16, 'end'], ['langstaff', 'Richmond Hill Centre', 9, -9]]) {
  const [x, y] = proj(...GEO[id]);
  labels += `<text x="${(x + dx).toFixed(0)}" y="${(y + dy).toFixed(0)}" font-size="13" font-weight="600" fill="#1B1B1F" stroke="#FFFFFF" stroke-width="3.5" paint-order="stroke" text-anchor="${a || 'start'}">${t}</text>`;
}
const badge = (id, c, txt, idx) => { const s = V[id].stops[idx]; const [x, y] = proj(s[1], s[2]); return `<g transform="translate(${(x - 38).toFixed(0)} ${(y - 11).toFixed(0)})"><rect width="76" height="22" rx="11" fill="${c}"/><text x="38" y="15" font-size="12" font-weight="700" fill="#FFFFFF" text-anchor="middle">${txt}</text></g>`; };
labels += badge('601', '#0079AB', '11/15 min', 3) + badge('603', '#7A4A8C', '17/21 min', 12) + badge('605', '#9A6510', '13/18 min', 9);
let tiles = '';
for (let tx = 570; tx <= 575; tx++) for (let ty = 745; ty <= 750; ty++) tiles += `<img src="https://tile.openstreetmap.org/11/${tx}/${ty}.png" alt="" style="position:absolute;left:${((tx - X0) * 256).toFixed(0)}px;top:${((ty - Y0) * 256).toFixed(0)}px;width:256px;height:256px">`;
const icon = (n, c = 'currentColor', sz = 24) => `<svg width="${sz}" height="${sz}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="${c}" d="${IC[n]}"/></svg>`;
const rail = [['arrow_selector_tool', 'Select', 1], ['add_location_alt', 'Station', 0], ['conversion_path', 'Route', 0], ['title', 'Label', 0], ['ink_eraser', 'Erase', 0]]
  .map(([i, t, on]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;font-weight:500;color:${S.onSurfaceVariant}"><span style="width:56px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:${on ? S.secondaryContainer : 'transparent'};color:${on ? S.onSecondaryContainer : S.onSurfaceVariant}">${icon(i)}</span>${t}</div>`).join('');
const lineRows = [['#F8C300', 'Line 1 Yonge-University', 'Subway or metro · 38 stops', ''], ['#00923F', 'Line 2 Bloor-Danforth', 'Subway or metro · 31 stops', ''], ['#F28C28', 'Line 5 Eglinton', 'Subway or metro · 25 stops', ''], ['#009CDB', 'Viva Blue', 'Rapid bus · 27 stops', '11/15 min'], ['#9461A8', 'Viva Purple', 'Rapid bus · 23 stops', '17/21 min'], ['#FBAF33', 'Viva Orange', 'Rapid bus · 17 stops', '13/18 min'], ['#FFDD00', 'Viva Yellow', 'Rapid bus · 7 stops', '13/15 min'], ['#7FA0C2', 'Lakeshore East', 'Regional rail · 10 stops', ''], ['#00853F', 'Kitchener', 'Regional rail · 12 stops', ''], ['#8B4AA0', 'UP Express', 'Regional rail · 4 stops', ''], ['#7F2A2E', 'Lakeshore West', 'Regional rail · 12 stops', '']]
  .map(([c, n, k, f], i) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:${i === 3 ? S.secondaryContainer : 'transparent'}"><span style="width:28px;height:8px;border-radius:4px;background:${c};flex:none"></span><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n}</span><span style="font-size:12px;color:${S.onSurfaceVariant}">${k}</span></div>${f ? `<span style="font-size:12px;font-weight:600;padding:4px 8px;border-radius:8px;border:1px solid ${S.outlineVariant};color:${S.onSurfaceVariant}">${f}</span>` : ''}</div>`).join('');
const iconBtn = (n) => `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:${S.onSurfaceVariant}">${icon(n)}</span>`;
const field = (label, value, focus) => `<div style="flex:1;display:flex;flex-direction:column;gap:4px"><span style="font-size:12px;color:${S.onSurfaceVariant}">${label}</span><span style="height:40px;display:flex;align-items:center;padding:0 12px;border-radius:4px 4px 0 0;background:${S.surfaceContainerHighest};border-bottom:${focus ? '2px solid ' + S.primary : '1px solid ' + S.onSurfaceVariant}">${value}</span></div>`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GTHA Metro Map Creator 1.3: patterns, facilities, timeline, command palette</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,400;8..144,500;8..144,600;8..144,700&amp;display=swap" rel="stylesheet">
<style>body{margin:0}</style>
</helmet>
<div style="font-family:'Roboto Flex',Roboto,'Segoe UI',system-ui,sans-serif;font-size:14px;color:${S.onSurface};background:${S.surface};width:1440px;height:900px;display:flex;flex-direction:column;overflow:hidden;position:relative">
<div style="height:64px;flex:none;display:flex;align-items:center;gap:8px;padding:0 16px;background:${S.surfaceContainer}">
${icon('route', S.primary, 28)}<span style="font-size:22px;font-weight:500;margin-left:4px">GTHA Metro Map Creator</span>
<span style="margin-left:16px;height:40px;width:240px;display:flex;align-items:center;padding:0 16px;border-radius:20px;background:${S.surfaceContainerHighest}">GTHA Rapid Transit</span>
<div style="flex:1"></div>
<div style="display:flex;height:40px;border:1px solid ${S.outline};border-radius:20px;overflow:hidden;font-weight:500;margin-right:8px"><span style="display:flex;align-items:center;padding:0 16px">Schematic</span><span style="display:flex;align-items:center;gap:6px;padding:0 16px;background:${S.secondaryContainer};color:${S.onSecondaryContainer};border-left:1px solid ${S.outline}">${icon('check', S.onSecondaryContainer, 18)}Geographic</span></div>
${iconBtn('undo')}${iconBtn('redo')}
<span style="height:40px;display:flex;align-items:center;gap:8px;padding:0 24px 0 16px;border-radius:20px;background:${S.primary};color:${S.onPrimary};font-weight:500;margin:0 4px">${icon('download', S.onPrimary, 18)}Export</span>
${iconBtn('settings')}
</div>
<div style="flex:1;display:flex;min-height:0">
<nav style="width:80px;flex:none;background:${S.surfaceContainer};display:flex;flex-direction:column;align-items:center;gap:12px;padding-top:12px">${rail}</nav>
<aside style="width:320px;flex:none;background:${S.surfaceContainerLow};padding:12px;display:flex;flex-direction:column;gap:8px">
<div style="height:48px;display:flex;align-items:center;gap:12px;padding:0 16px;border-radius:24px;background:${S.surfaceContainerHigh};color:${S.onSurfaceVariant}">${icon('search')}<span>Find a station or stop</span><span style="margin-left:auto;font-weight:600;font-size:12px;padding:4px 8px;border-radius:8px;background:${S.surfaceContainerHighest}">.*</span></div>
<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px 4px"><span style="font-weight:500;color:${S.onSurfaceVariant}">Routes</span><span style="height:32px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:8px;background:${S.secondaryContainer};color:${S.onSecondaryContainer};font-weight:500">${icon('add', S.onSecondaryContainer, 18)}New route</span></div>
${lineRows}
</aside>
<main style="flex:1;position:relative;overflow:hidden;background:#E8E4DC">
<div style="position:absolute;inset:0;filter:saturate(.5) brightness(1.05)">${tiles}</div>
<svg width="720" height="836" style="position:absolute;left:0;top:0">${paths}${st}${vstops}${labels}</svg>
<div style="position:absolute;right:16px;bottom:96px;display:flex;flex-direction:column;gap:12px">${['my_location', 'add', 'remove', 'layers'].map((n) => `<span style="width:56px;height:56px;border-radius:16px;background:${S.surfaceContainerHigh};box-shadow:0 2px 6px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;color:${S.onSurfaceVariant}">${icon(n)}</span>`).join('')}</div>
<span style="position:absolute;left:12px;bottom:12px;font-size:11px;padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.9);color:#3A3A3A">© OpenStreetMap contributors</span>
<div style="position:absolute;left:16px;right:96px;bottom:16px;height:64px;display:flex;align-items:center;gap:16px;padding:0 16px;border-radius:16px;background:${S.surfaceContainerHigh};box-shadow:0 2px 6px rgba(0,0,0,.2)"><span style="width:40px;height:40px;border-radius:20px;background:${S.primary};color:${S.onPrimary};display:flex;align-items:center;justify-content:center;font-size:16px">▶</span><span style="font-size:22px;font-weight:500;width:56px">2031</span><div style="flex:1;position:relative;height:24px"><div style="position:absolute;left:0;right:0;top:10px;height:4px;border-radius:2px;background:${S.secondaryContainer}"></div><div style="position:absolute;left:0;width:86%;top:10px;height:4px;border-radius:2px;background:${S.primary}"></div><div style="position:absolute;left:calc(86% - 2px);top:0;width:4px;height:24px;border-radius:2px;background:${S.primary}"></div>${['1954', '1966', '2002', '2025', '2031'].map((y, i) => `<span style="position:absolute;top:28px;left:${[0, 15, 62, 83, 86][i]}%;font-size:11px;color:${S.onSurfaceVariant};transform:translateX(${i === 4 ? '4px' : '-50%'})">${i === 3 ? '' : y}</span>`).join('')}</div><span style="font-size:12px;color:${S.onSurfaceVariant};width:120px">18 lines open</span></div>

</main>
<aside style="width:320px;flex:none;background:${S.surfaceContainerLow};border-left:1px solid ${S.outlineVariant};padding:16px 12px;display:flex;flex-direction:column;gap:10px;overflow:hidden"><span style="font-weight:500;color:${S.onSurfaceVariant}">Inspector</span>
<div style="display:flex;align-items:center;gap:10px"><span style="width:28px;height:8px;border-radius:4px;background:#009CDB"></span><span style="font-size:16px;font-weight:500">Viva Blue</span><span style="margin-left:auto;font-size:12px;color:${S.onSurfaceVariant}">27 stops · 2 branches</span></div>
<span style="font-size:14px;font-weight:500;color:${S.onSurfaceVariant};margin-top:4px">Frequency by time of day</span>
<div style="display:flex;gap:8px">${field('Peak', '11 min', true)}${field('Midday', '15 min')}</div>
<div style="display:flex;gap:8px">${field('Evening', '16 min')}${field('Weekend', '15 min')}</div>
<span style="font-size:14px;font-weight:500;color:${S.onSurfaceVariant};margin-top:4px">Stops</span>
${[['Finch', 1], ['Yonge / Steeles', 1], ['Yonge / Clark', 0], ['Yonge / Centre', 0], ['Richmond Hill Centre', 1]].map(([n, on]) => `<div style="display:flex;align-items:center;gap:12px;min-height:40px;padding:0 4px"><span style="width:10px;height:10px;border-radius:50%;border:2px ${on ? 'solid #009CDB' : 'dashed ' + S.outline};background:${on ? '#fff' : 'transparent'}"></span><span style="flex:1">${n}</span><span style="height:32px;display:flex;align-items:center;padding:0 12px;border-radius:8px;font-size:13px;font-weight:500;${on ? `background:${S.secondaryContainer};color:${S.onSecondaryContainer}` : `border:1px solid ${S.outlineVariant};color:${S.onSurfaceVariant}`}">${on ? 'Stops' : 'Passes'}</span></div>`).join('')}
<span style="font-size:14px;font-weight:500;color:${S.onSurfaceVariant};margin-top:4px">Branches</span>
<div style="display:flex;align-items:center;gap:12px;min-height:48px;padding:0 4px"><span style="width:20px;height:4px;border-radius:2px;background:#009CDB"></span><span style="flex:1">Viva Blue B to Bernard Terminal</span><span style="font-size:12px;color:${S.onSurfaceVariant}">13 stops</span></div>
<span style="font-size:14px;font-weight:500;color:${S.onSurfaceVariant};margin-top:4px">Station facilities · Finch</span>
<div style="display:flex;flex-wrap:wrap;gap:8px">${[['Accessible', 1], ['Parking', 1], ['Bike', 0], ['Bus terminal', 1]].map(([n, on]) => `<span style="height:32px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:8px;font-weight:500;${on ? `background:${S.secondaryContainer};color:${S.onSecondaryContainer}` : `border:1px solid ${S.outlineVariant}`}">${on ? '✓ ' : ''}${n}</span>`).join('')}</div>
</aside>
</div>
<div style="position:absolute;inset:0;background:rgba(0,0,0,.32)"></div>
<div style="position:absolute;left:50%;top:120px;transform:translateX(-50%);width:560px;border-radius:28px;background:${S.surfaceContainerHigh};box-shadow:0 8px 24px rgba(0,0,0,.25);overflow:hidden"><div style="height:56px;display:flex;align-items:center;gap:12px;padding:0 20px;border-bottom:1px solid ${S.outlineVariant}">${icon('search')}<span style="font-size:16px">exp</span><span style="margin-left:auto;font-size:12px;padding:2px 6px;border-radius:4px;border:1px solid ${S.outlineVariant};color:${S.onSurfaceVariant}">Ctrl K</span></div>${[['download', 'Export PNG image', 'Export', 1], ['picture_as_pdf', 'Export PDF document', 'Export', 0], ['public', 'Export website to host', 'Export', 0], ['route', 'Set service type: Express', 'Route', 0], ['schedule', 'Show frequencies on the map', 'Setting', 0]].map(([ic, n, k, on]) => `<div style="height:48px;display:flex;align-items:center;gap:16px;padding:0 20px;${on ? `background:${S.secondaryContainer};color:${S.onSecondaryContainer}` : ''}">${icon(ic)}<span style="flex:1">${n}</span><span style="font-size:12px;color:${S.onSurfaceVariant}">${k}</span></div>`).join('')}</div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
fs.writeFileSync(REPO + '/design/Editor13.dc.html', html);
console.log('bytes', html.length);
