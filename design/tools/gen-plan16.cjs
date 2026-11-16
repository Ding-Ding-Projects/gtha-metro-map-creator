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
let vehicles = '';
for (const l of m.lines.filter((l) => ['l1', 'l2', 'l5'].includes(l.id))) { const pts = l.path.filter((r) => r[0] !== '@' && GEO[r]).map((r) => proj(...GEO[r])); for (let i = 1; i < pts.length; i += 3) { const a = pts[i - 1], b = pts[i]; vehicles += `<circle cx="${((a[0] + b[0]) / 2).toFixed(0)}" cy="${((a[1] + b[1]) / 2).toFixed(0)}" r="4.5" fill="#fff" stroke="#16181D" stroke-width="2"/>`; } }
for (const [id, c] of [['601', '#009CDB'], ['603', '#9461A8'], ['605', '#FBAF33']]) { const pts = V[id].stops.map((s) => proj(s[1], s[2])); for (let i = 2; i < pts.length; i += 4) vehicles += `<circle cx="${pts[i][0].toFixed(0)}" cy="${pts[i][1].toFixed(0)}" r="4" fill="${c}" stroke="#fff" stroke-width="1.5"/>`; }
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
<title>GTHA Metro Map Creator 1.6: scenarios, simulation, coverage</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,400;8..144,500;8..144,600;8..144,700&amp;display=swap" rel="stylesheet">
<style>body{margin:0}</style>
</helmet>
<div style="font-family:'Roboto Flex',Roboto,'Segoe UI',system-ui,sans-serif;font-size:14px;color:${S.onSurface};background:${S.surface};width:1440px;height:900px;display:flex;flex-direction:column;overflow:hidden">
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
<svg width="720" height="836" style="position:absolute;left:0;top:0">${paths}${st}${vstops}${labels}${vehicles}</svg>
<div style="position:absolute;right:16px;bottom:40px;display:flex;flex-direction:column;gap:12px">${['my_location', 'add', 'remove', 'layers'].map((n) => `<span style="width:56px;height:56px;border-radius:16px;background:${S.surfaceContainerHigh};box-shadow:0 2px 6px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;color:${S.onSurfaceVariant}">${icon(n)}</span>`).join('')}</div>
<span style="position:absolute;left:12px;bottom:12px;font-size:11px;padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.9);color:#3A3A3A">© OpenStreetMap contributors</span>
<div style="position:absolute;top:0;bottom:0;left:52%;width:4px;background:${S.primary};box-shadow:0 0 0 1px #fff"></div>
<div style="position:absolute;left:calc(52% - 18px);top:46%;width:40px;height:40px;border-radius:20px;background:${S.primary};color:${S.onPrimary};display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,.3)">⇔</div>
<span style="position:absolute;left:16px;top:16px;height:32px;display:flex;align-items:center;padding:0 12px;border-radius:8px;background:${S.surfaceContainerHigh};font-weight:500">Today</span>
<span style="position:absolute;right:96px;top:16px;height:32px;display:flex;align-items:center;padding:0 12px;border-radius:8px;background:${S.secondaryContainer};color:${S.onSecondaryContainer};font-weight:500">2031 plan</span>
<div style="position:absolute;left:16px;right:96px;bottom:16px;height:64px;display:flex;align-items:center;gap:12px;padding:0 16px;border-radius:16px;white-space:nowrap;background:${S.surfaceContainerHigh};box-shadow:0 2px 6px rgba(0,0,0,.2)"><span style="width:40px;height:40px;flex:none;border-radius:20px;background:${S.primary};color:${S.onPrimary};display:flex;align-items:center;justify-content:center">❚❚</span><div style="display:flex;flex-direction:column"><span style="font-size:22px;font-weight:500">08:14</span><span style="font-size:12px;color:${S.onSurfaceVariant}">Weekday peak</span></div><div style="display:flex;height:32px;border:1px solid ${S.outline};border-radius:16px;overflow:hidden;font-weight:500;font-size:13px"><span style="display:flex;align-items:center;padding:0 12px;">1x</span><span style="display:flex;align-items:center;padding:0 12px;background:${S.secondaryContainer};color:${S.onSecondaryContainer};border-left:1px solid ${S.outline}">✓ 10x</span><span style="display:flex;align-items:center;padding:0 12px;border-left:1px solid ${S.outline}">60x</span></div><span style="color:${S.onSurfaceVariant}">412 vehicles</span><div style="flex:1"></div><span style="height:40px;display:flex;align-items:center;padding:0 16px;border-radius:20px;border:1px solid ${S.outline};color:${S.primary};font-weight:500">Record clip</span></div>
</main>
<aside style="width:320px;flex:none;background:${S.surfaceContainerLow};border-left:1px solid ${S.outlineVariant};padding:16px 12px;display:flex;flex-direction:column;gap:10px"><span style="font-weight:500;color:${S.onSurfaceVariant}">Scenarios</span>
<div style="display:flex;align-items:center;gap:12px;min-height:48px;padding:0 12px;border-radius:24px;"><span style="width:10px;height:10px;border-radius:50%;background:#75777F"></span><span style="flex:1;font-weight:500">Today</span><span style="font-size:12px">20 routes</span></div><div style="display:flex;align-items:center;gap:12px;min-height:48px;padding:0 12px;border-radius:24px;background:${S.secondaryContainer};color:${S.onSecondaryContainer}"><span style="width:10px;height:10px;border-radius:50%;background:#185BBB"></span><span style="flex:1;font-weight:500">2031 plan</span><span style="font-size:12px">23 routes</span></div><div style="display:flex;align-items:center;gap:12px;min-height:48px;padding:0 12px;border-radius:24px;"><span style="width:10px;height:10px;border-radius:50%;background:#9461A8"></span><span style="flex:1;font-weight:500">My plan</span><span style="font-size:12px">25 routes</span></div>
<span style="font-size:14px;font-weight:500;color:${S.onSurfaceVariant};margin-top:6px">Changes, Today to 2031 plan</span>
<div style="display:flex;gap:10px;align-items:baseline"><span style="font-weight:700;color:#1B7F3B;width:14px">+</span><span>Ontario Line, 15 stations</span></div><div style="display:flex;gap:10px;align-items:baseline"><span style="font-weight:700;color:#1B7F3B;width:14px">+</span><span>Hurontario LRT, 19 stations</span></div><div style="display:flex;gap:10px;align-items:baseline"><span style="font-weight:700;color:#9A6510;width:14px">~</span><span>Viva Blue every 11 → 8 min</span></div><div style="display:flex;gap:10px;align-items:baseline"><span style="font-weight:700;color:#B71C1C;width:14px">−</span><span>Line 3 Scarborough</span></div>
<span style="font-size:14px;font-weight:500;color:${S.onSurfaceVariant};margin-top:6px">Coverage, 800 m walk</span>
<div style="display:flex;gap:16px;padding:12px;border-radius:12px;background:${S.surfaceContainer}"><div style="display:flex;flex-direction:column"><span style="font-size:22px">2.41 M</span><span style="font-size:12px;color:${S.onSurfaceVariant}">people</span></div><div style="display:flex;flex-direction:column"><span style="font-size:22px">1.38 M</span><span style="font-size:12px;color:${S.onSurfaceVariant}">jobs</span></div><div style="display:flex;flex-direction:column"><span style="font-size:22px;color:#1B7F3B">+186 k</span><span style="font-size:12px;color:${S.onSurfaceVariant}">vs Today</span></div></div>
<span style="font-size:12px;color:${S.onSurfaceVariant}">Statistics Canada 2021 Census. Ridership widths are an illustrative estimate, not a forecast.</span>
<div style="display:flex;gap:8px;margin-top:4px"><span style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;border-radius:20px;border:1px solid ${S.outline};color:${S.primary};font-weight:500">Share link</span><span style="flex:1;height:40px;display:flex;align-items:center;justify-content:center;border-radius:20px;background:${S.secondaryContainer};color:${S.onSecondaryContainer};font-weight:500">Export GTFS</span></div>
</aside>
</div>
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
fs.writeFileSync(REPO + '/design/Plan16.dc.html', html);
console.log('bytes', html.length);
