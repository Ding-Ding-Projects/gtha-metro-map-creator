// Generates design/Times16.dc.html: travel-time pills on the zoomed-in map, the inspector "Travel times" list and the "Vehicles" section.
// Self-contained: node design/tools/gen-times16.cjs (reads the built-in template and the icon paths from site/app).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const REPO = path.resolve(__dirname, '..', '..');
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['gtha-transit-data.js', 'gtha-template.js']) vm.runInContext(fs.readFileSync(path.join(REPO, 'site/app', f), 'utf8'), ctx);
const m = ctx.window.GTHATemplates.gtha();
const iconSrc = fs.readFileSync(path.join(REPO, 'site/app/icons.js'), 'utf8');
const IC = JSON.parse(/const P = (\{.*?\});/s.exec(iconSrc)[1]);
// Material Design 3 light scheme, the same tokens as site/app/app.css
const S = { primary: '#185bbb', onPrimary: '#ffffff', secondaryContainer: '#dbe2f9', onSecondaryContainer: '#141b2c', surface: '#fefbff', onSurface: '#1b1b1f', onSurfaceVariant: '#44474f', outline: '#75777f', outlineVariant: '#c4c6d0', container: '#efedf1', containerLow: '#f5f3f7', containerHigh: '#e9e7ec', mapBg: '#eef0e8' };
const icon = (n, c = 'currentColor', sz = 24) => `<svg width="${sz}" height="${sz}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="${c}" d="${IC[n]}"/></svg>`;

// ---- map: Line 1 and Line 2 around Bloor-Yonge, Web Mercator zoom 14, 840 x 760 px ----
const Z = 15, W = 700, H = 836, C = m.stations.wellesley;
const merc = (lat, lon) => { const n = 256 * 2 ** Z, r = lat * Math.PI / 180; return { x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n }; };
const c0 = merc(C.lat, C.lon);
const proj = (s) => { const p = merc(s.lat, s.lon); return { x: p.x - c0.x + W / 2 - 40, y: p.y - c0.y + H / 2 - 120 }; };
const line = (id) => m.lines.find((l) => l.id === id);
const stops = (l) => l.path.filter((r) => r[0] !== '@').map((r) => m.stations[r]);
let tracks = '', dots = '', labels = '', pills = '';
for (const id of ['l1', 'l2']) {
  const l = line(id), pts = stops(l).map(proj);
  const d = 'M' + pts.map((p) => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('L');
  tracks += `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${l.color}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
}
const shown = ['rosedale', 'bloor_yonge', 'wellesley', 'college', 'tmu', 'bay', 'sherbourne', 'castle_frank'];
for (const id of shown) {
  const p = proj(m.stations[id]), inter = id === 'bloor_yonge';
  dots += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${inter ? 9 : 7}" fill="#FFFFFF" stroke="#16181D" stroke-width="${inter ? 4 : 3}"/>`;
  const left = ['bay', 'sherbourne', 'castle_frank'].includes(id) ? false : true;
  labels += `<text x="${(p.x + (left ? 16 : 14)).toFixed(1)}" y="${(p.y + (left ? 5 : -12)).toFixed(1)}" font-size="13" font-weight="${inter ? 700 : 500}" fill="${S.onSurface}" stroke="#FFFFFF" stroke-width="3.5" paint-order="stroke">${m.stations[id].name}</text>`;
}
// pills at the middle of consecutive segments. times: estimates carry "~", the one set by the user is solid.
const pillAt = (a, b, text, set, color, dy = 0, dx = 0) => {
  const A = proj(m.stations[a]), B = proj(m.stations[b]), x = (A.x + B.x) / 2 + dx, y = (A.y + B.y) / 2 + dy, w = Math.round(text.length * 6.4 + 18);
  return set
    ? `<g transform="translate(${(x - w / 2).toFixed(1)} ${(y - 10).toFixed(1)})"><rect width="${w}" height="20" rx="10" fill="${color}" stroke="#FFFFFF" stroke-width="2"/><text x="${w / 2}" y="14" font-size="11" font-weight="700" text-anchor="middle" fill="#16181D">${text}</text></g>`
    : `<g transform="translate(${(x - w / 2).toFixed(1)} ${(y - 10).toFixed(1)})"><rect width="${w}" height="20" rx="10" fill="#FFFFFF" fill-opacity=".92" stroke="${color}" stroke-width="2" stroke-dasharray="3 2"/><text x="${w / 2}" y="14" font-size="11" font-style="italic" font-weight="500" text-anchor="middle" fill="${S.onSurfaceVariant}">${text}</text></g>`;
};
const Y = line('l1').color, G = line('l2').color;
pills += pillAt('rosedale', 'bloor_yonge', '~2 min', false, Y, 0, 12);
pills += pillAt('bloor_yonge', 'wellesley', '9 min', true, Y, 0, 14);
pills += pillAt('wellesley', 'college', '~1 min', false, Y, 0, 14);
pills += pillAt('college', 'tmu', '~1 min', false, Y, 0, 14);
pills += pillAt('bay', 'bloor_yonge', '~1 min', false, G, 6, 0);
pills += pillAt('bloor_yonge', 'sherbourne', '~1 min', false, G, -6, 4);
pills += pillAt('sherbourne', 'castle_frank', '~2 min', false, G, -6);
const stepper = (val, set) => `<span style="display:inline-flex;align-items:center;border:1px solid ${S.outline};border-radius:20px;height:40px;padding:0 2px"><span style="width:40px;display:flex;justify-content:center">${icon('remove', 'currentColor', 20)}</span><span style="min-width:44px;text-align:center;${set ? '' : `color:${S.onSurfaceVariant};font-style:italic`}">${val}</span><span style="font-size:12px;color:${S.onSurfaceVariant};margin-right:2px">min</span><span style="width:40px;display:flex;justify-content:center">${icon('add', 'currentColor', 20)}</span></span>`;
const sel = proj(m.stations.wellesley), sel2 = proj(m.stations.bloor_yonge);
const popX = (sel.x + sel2.x) / 2 + 60, popY = (sel.y + sel2.y) / 2 + 20;
const popover = `<div style="position:absolute;left:${popX.toFixed(0)}px;top:${popY.toFixed(0)}px;width:248px;padding:12px 16px 8px;border-radius:16px;background:${S.containerHigh};box-shadow:0 4px 8px 3px rgba(0,0,0,.15),0 1px 3px rgba(0,0,0,.3)">
<div style="font-weight:500;font-size:13px;margin-bottom:8px">Bloor-Yonge &rarr; Wellesley</div>
${stepper('9', true)}<div style="font-size:12px;font-style:italic;color:${S.onSurfaceVariant};margin-top:4px">Estimate: ~2 min</div>
<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><span style="height:32px;display:flex;align-items:center;padding:0 12px;color:${S.primary};font-weight:500">Use the estimate</span><span style="height:32px;display:flex;align-items:center;padding:0 16px;border-radius:16px;background:${S.secondaryContainer};color:${S.onSecondaryContainer};font-weight:500">Done</span></div></div>`;

// ---- inspector ----
const field = (label, value, w = '100%') => `<div style="width:${w};border-radius:4px 4px 0 0;border-bottom:1px solid ${S.outline};background:#e3e2e6;padding:5px 12px;box-sizing:border-box"><div style="font-size:11px;color:${S.onSurfaceVariant}">${label}</div><div style="font-size:14px;min-height:20px">${value}</div></div>`;
const trow = (a, b, val, set) => `<div style="padding:6px 0 8px;border-bottom:1px solid ${S.outlineVariant}"><div style="font-size:13px;line-height:18px">${a} <span style="color:${S.onSurfaceVariant}">&rarr;</span> ${b}</div>
<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px">${stepper(val, set)}<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:${S.onSurfaceVariant};opacity:${set ? 1 : .35}">${icon('undo', 'currentColor', 20)}</span></div>
<div style="font-size:12px;font-style:italic;color:${S.onSurfaceVariant}">Estimate: ~${set ? '2' : val.replace('~', '')} min</div></div>`;
const times = [['Summerhill', 'Rosedale', '~2', 0], ['Rosedale', 'Bloor-Yonge', '~2', 0], ['Bloor-Yonge', 'Wellesley', '9', 1], ['Wellesley', 'College', '~1', 0], ['College', 'TMU', '~1', 0]].map(([a, b, v, s]) => trow(a, b, v, s)).join('');
const vcard = (ic, title, maker, model, kind, count, open) => `<div style="padding:4px 8px 8px;border:1px solid ${open ? S.primary : S.outlineVariant};border-radius:12px;background:${S.containerLow};display:flex;flex-direction:column;gap:8px">
<div style="display:flex;align-items:center;gap:2px"><span style="width:32px;height:40px;display:flex;align-items:center;justify-content:center;color:${S.onSurfaceVariant}">${icon('drag_indicator', 'currentColor', 20)}</span><span style="color:${S.primary};display:flex;margin:0 6px 0 2px">${icon(ic, 'currentColor', 20)}</span><span style="flex:1;min-width:0"><div style="font-weight:500">${title}</div><div style="font-size:12px;color:${S.onSurfaceVariant}">${kind}${count ? ' · ' + count + ' vehicles' : ''}</div></span><span style="width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;color:${open ? S.primary : S.onSurfaceVariant};background:${open ? S.secondaryContainer : 'transparent'}">${icon('edit', 'currentColor', 20)}</span><span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:${S.onSurfaceVariant}">${icon('delete', 'currentColor', 20)}</span></div>
${open ? `<div style="display:flex;flex-direction:column;gap:8px;padding:0 4px">${field('Maker', maker)}${field('Model', model)}
<div style="border-radius:4px 4px 0 0;border-bottom:1px solid ${S.outline};background:#e3e2e6;padding:5px 12px"><div style="font-size:11px;color:${S.onSurfaceVariant}">Type</div><div style="display:flex;align-items:center;gap:8px;min-height:28px">${icon(ic, 'currentColor', 20)}<span style="flex:1">${kind}</span>${icon('arrow_drop_down', 'currentColor', 24)}</div></div>
<div><div style="font-size:11px;color:${S.onSurfaceVariant};margin-bottom:2px">Number of vehicles</div>${stepper(count || '-', !!count)}</div></div>` : ''}</div>`;
const inspector = `<div style="padding:12px 16px;overflow:hidden;height:100%;box-sizing:border-box">
<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="width:28px;height:8px;border-radius:4px;background:${Y}"></span><span style="font-weight:500;font-size:16px">Line 1 Yonge-University</span></div>
<div style="display:flex;align-items:center;gap:8px;margin:14px 0 4px;color:${S.onSurfaceVariant};font-weight:500">${icon('schedule', 'currentColor', 18)} Travel times<span style="margin-left:auto;font-size:12px;font-weight:400">1 set</span></div>
<div style="font-size:12px;line-height:16px;color:${S.onSurfaceVariant};margin-bottom:4px">Leave a field empty to use the estimate (shown with ~). A time includes the stop at its start.</div>
<div>${times}</div>
<div style="display:flex;align-items:center;gap:8px;margin:16px 0 8px;color:${S.onSurfaceVariant};font-weight:500">${icon('directions_bus', 'currentColor', 18)} Vehicles<span style="margin-left:auto;font-size:12px;font-weight:400">2</span></div>
<div style="display:flex;flex-direction:column;gap:10px">${vcard('train', 'Bombardier Toronto Rocket', 'Bombardier', 'Toronto Rocket', 'Subway car', '', false)}${vcard('directions_bus', 'New Flyer Xcelsior XD60', 'New Flyer', 'Xcelsior XD60', 'Articulated bus', '3', true)}</div></div>`;

const rail = [['arrow_selector_tool', 'Select', 1], ['add_location_alt', 'Station', 0], ['conversion_path', 'Route', 0], ['title', 'Label', 0], ['ink_eraser', 'Erase', 0]]
  .map(([i, t, on]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;font-weight:500;color:${S.onSurfaceVariant}"><span style="width:56px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:${on ? S.secondaryContainer : 'transparent'};color:${on ? S.onSecondaryContainer : 'inherit'}">${icon(i)}</span>${t}</div>`).join('');
const rows = [[Y, 'Line 1 Yonge-University', 'Subway or metro · 38 stops', 'Bombardier Toronto Rocket +1', 'train', 1], [G, 'Line 2 Bloor-Danforth', 'Subway or metro · 31 stops', 'Bombardier Toronto Rocket', 'train', 0], ['#F28C28', 'Line 5 Eglinton', 'Subway or metro · 25 stops', 'Alstom (Bombardier) Flexity Outlook', 'tram', 0], ['#009CDB', 'Viva Blue', 'Rapid bus · 27 stops', 'New Flyer Xcelsior XD60', 'directions_bus', 0]]
  .map(([c, n, k, v, ic, on]) => `<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:12px;background:${on ? S.secondaryContainer : 'transparent'}"><span style="width:28px;height:8px;border-radius:4px;background:${c};flex:none"></span><span style="flex:1;min-width:0"><div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n}</div><div style="font-size:12px;color:${S.onSurfaceVariant}">${k}</div><div style="font-size:12px;color:${S.onSurfaceVariant};display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden">${icon(ic, 'currentColor', 14)}<span style="overflow:hidden;text-overflow:ellipsis">${v}</span></div></span><span style="color:${S.onSurfaceVariant}">${icon('visibility')}</span></div>`).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GTHA Metro Map Creator 1.7: travel times and vehicles</title>
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
<div style="height:64px;flex:none;display:flex;align-items:center;gap:8px;padding:0 16px;background:${S.container}">
${icon('route', S.primary, 28)}<span style="font-size:22px;margin-right:12px">GTHA Metro Map Creator</span><span style="height:40px;display:flex;align-items:center;padding:0 16px;border-radius:20px;background:#e3e2e6;width:208px">GTHA Rapid Transit</span><span style="flex:1"></span>
<span style="height:40px;display:flex;align-items:center;padding:0 22px;border-radius:20px;background:${S.primary};color:${S.onPrimary};font-weight:500">Export</span><span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center">${icon('settings')}</span></div>
<div style="flex:1;display:flex;min-height:0">
<div style="width:80px;flex:none;background:${S.container};display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0">${rail}</div>
<div style="width:300px;flex:none;padding:12px 12px;overflow:hidden"><div style="font-weight:500;color:${S.onSurfaceVariant};margin:8px 8px 12px">Routes</div>${rows}</div>
<div style="flex:1;position:relative;overflow:hidden;background:${S.mapBg}">
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0"><defs><pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#dfe3d6" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${tracks}${dots}${labels}${pills}</svg>
<div style="position:absolute;left:12px;top:12px;padding:6px 12px;border-radius:12px;background:rgba(255,255,255,.86);font-size:12px">Stations: 238 · Lines: 20 · Zoom: 300%</div>
<div style="position:absolute;left:12px;bottom:12px;padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.9);font-size:12px;line-height:18px"><b>~2 min</b> estimated from distance and speed &nbsp; <b>9 min</b> set by you. Click a time to change it.</div>
${popover}
</div>
<div style="width:360px;flex:none;background:${S.surface};border-left:1px solid ${S.outlineVariant}">${inspector}</div>
</div></div>
</x-dc>
</body>
</html>
`;
fs.writeFileSync(path.join(REPO, 'design', 'Times16.dc.html'), html);
// register the board on the canvas
const cp = path.join(REPO, 'design', 'canvas.json');
const canvas = JSON.parse(fs.readFileSync(cp, 'utf8'));
if (!canvas.boards['Times16.dc.html']) {
  canvas.boards['Times16.dc.html'] = { x: 0, y: 6400, w: 1440, h: 900, title: 'Release 1.7: travel times between stops and vehicle types', expand: 'fill' };
  canvas.order.push('Times16.dc.html');
  fs.writeFileSync(cp, JSON.stringify(canvas));
}
console.log('wrote design/Times16.dc.html', html.length, 'bytes');
