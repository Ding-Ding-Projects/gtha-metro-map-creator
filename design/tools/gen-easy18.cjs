// Generates design/Easy18.dc.html: the editor made easier to start with. Adding things is a labelled
// toolbar on the map, every tool says what to do next, the right panel opens on what is selected (or a
// getting-started checklist) with analysis in its own tab, and on a phone the tools sit in a bottom bar.
// Usage: SP=<scratch with m3/> REPO=<repo> node design/tools/gen-easy18.cjs
const fs = require('fs');
const path = require('path');
const SP = process.env.SP, REPO = process.env.REPO;
const S = JSON.parse(fs.readFileSync(SP + '/m3/scheme.json')).light;
const SYM = path.join(SP, 'm3/node_modules/@material-symbols/svg-400/rounded');
const pathOf = (n) => { const svg = fs.readFileSync(path.join(SYM, n + '.svg'), 'utf8'); return svg.match(/ d="([^"]+)"/)[1]; };
const icon = (n, c = 'currentColor', sz = 20) => `<svg width="${sz}" height="${sz}" viewBox="0 -960 960 960" aria-hidden="true" style="flex:none"><path fill="${c}" d="${pathOf(n)}"/></svg>`;
const F = "font-family:Inter,'Segoe UI',system-ui,sans-serif";

// a labelled tool button for the on-map toolbar
const tool = (glyph, label, key, on, sz = 'lg') => `<span style="display:flex;align-items:center;gap:8px;height:${sz === 'lg' ? 44 : 40}px;padding:0 ${sz === 'lg' ? 16 : 12}px;border-radius:22px;font-weight:600;font-size:14px;white-space:nowrap;${on ? `background:${S.secondaryContainer};color:${S.onSecondaryContainer}` : `color:${S.onSurface}`}">${icon(glyph, on ? S.onSecondaryContainer : S.onSurfaceVariant)}${label}${key ? `<span style="font-size:11px;font-weight:600;padding:1px 6px;border-radius:6px;border:1px solid ${S.outlineVariant};color:${S.onSurfaceVariant}">${key}</span>` : ''}</span>`;

// map background: a simple stylised network so the mock reads as the editor
const mapSvg = (w, h, opts = {}) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">
<rect width="${w}" height="${h}" fill="#EEF0E8"/>
<path d="M0 ${h * .72} C ${w * .3} ${h * .62}, ${w * .55} ${h * .84}, ${w} ${h * .66} L ${w} ${h} L 0 ${h} Z" fill="#CFE3F3"/>
<g stroke="#DADCD3" stroke-width="2" fill="none"><path d="M0 ${h * .3} H${w}"/><path d="M${w * .3} 0 V${h}"/><path d="M${w * .62} 0 V${h}"/><path d="M0 ${h * .5} L${w} ${h * .44}"/></g>
<path d="M${w * .5} ${h * .08} V${h * .6}" stroke="#F8C300" stroke-width="8" stroke-linecap="round"/>
<path d="M${w * .18} ${h * .42} H${w * .82}" stroke="#00923F" stroke-width="8" stroke-linecap="round"/>
${opts.drawing ? `<path d="M${w * .3} ${h * .22} L${w * .42} ${h * .3} L${w * .5} ${h * .42}" stroke="#1F5FBF" stroke-width="8" stroke-linecap="round" fill="none"/><path d="M${w * .5} ${h * .42} L${w * .62} ${h * .52}" stroke="#1F5FBF" stroke-width="5" stroke-dasharray="10 8" stroke-linecap="round" opacity=".7"/>` : ''}
${[[.5, .08], [.5, .25], [.5, .42], [.5, .6], [.18, .42], [.34, .42], [.66, .42], [.82, .42]].map(([x, y]) => `<circle cx="${w * x}" cy="${h * y}" r="9" fill="#fff" stroke="#16181D" stroke-width="3"/>`).join('')}
${opts.drawing ? [[.3, .22], [.42, .3]].map(([x, y]) => `<circle cx="${w * x}" cy="${h * y}" r="9" fill="#fff" stroke="#1F5FBF" stroke-width="3"/>`).join('') + `<circle cx="${w * .62}" cy="${h * .52}" r="11" fill="none" stroke="#1F5FBF" stroke-width="2" stroke-dasharray="4 3"/>` : ''}
<g font-size="13" font-weight="600" fill="#16181D" style="${F}"><text x="${w * .5 + 16}" y="${h * .08 + 5}">Finch</text><text x="${w * .5 + 16}" y="${h * .25 + 5}">Eglinton</text><text x="${w * .5 + 16}" y="${h * .42 - 10}">Bloor-Yonge</text><text x="${w * .5 + 16}" y="${h * .6 + 5}">Union</text><text x="${w * .18 - 20}" y="${h * .42 + 26}">Kipling</text><text x="${w * .82 - 30}" y="${h * .42 + 26}">Kennedy</text></g>
</svg>`;

const check = (done, label, sub, act) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:${done ? S.surfaceContainer : S.surfaceContainerLowest};border:1px solid ${done ? 'transparent' : S.outlineVariant}">
<span style="width:24px;height:24px;border-radius:12px;display:flex;align-items:center;justify-content:center;${done ? `background:${S.primary}` : `border:2px solid ${S.outline};box-sizing:border-box`}">${done ? icon('check', S.onPrimary, 16) : ''}</span>
<span style="flex:1;display:flex;flex-direction:column"><span style="font-weight:600;${done ? `color:${S.onSurfaceVariant};text-decoration:line-through` : ''}">${label}</span><span style="font-size:12px;color:${S.onSurfaceVariant}">${sub}</span></span>
${act ? `<span style="height:32px;display:flex;align-items:center;padding:0 14px;border-radius:16px;background:${S.primary};color:${S.onPrimary};font-weight:600;font-size:13px">${act}</span>` : ''}</div>`;

const tabs = (items, on) => `<div style="display:flex;border-bottom:1px solid ${S.outlineVariant}">${items.map(([g, t], i) => `<span style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 0 0;font-weight:600;font-size:13px;color:${i === on ? S.primary : S.onSurfaceVariant}">${icon(g, i === on ? S.primary : S.onSurfaceVariant)}${t}<span style="height:3px;width:56px;border-radius:3px 3px 0 0;background:${i === on ? S.primary : 'transparent'}"></span></span>`).join('')}</div>`;

const routeRow = (c, n, sub, dashed) => `<div style="display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:14px"><span style="width:28px;height:8px;border-radius:4px;background:${dashed ? `repeating-linear-gradient(90deg,${c} 0 7px,transparent 7px 11px)` : c}"></span><span style="flex:1;display:flex;flex-direction:column"><span style="font-weight:600">${n}</span><span style="font-size:12px;color:${S.onSurfaceVariant}">${sub}</span></span>${icon('visibility', S.onSurfaceVariant)}</div>`;

// ---------- desktop ----------
const W = 1400, H = 880;
const appbar = `<div style="height:64px;display:flex;align-items:center;gap:14px;padding:0 16px;background:${S.surface};border-bottom:1px solid ${S.outlineVariant}">
${icon('route', S.primary, 26)}<span style="font-size:20px;font-weight:500">GTHA Metro Map Creator</span>
<span style="height:40px;display:flex;align-items:center;padding:0 14px;border-radius:20px;background:${S.surfaceContainerHigh};width:220px">My transit plan</span>
<span style="flex:1"></span>
<span style="display:flex;height:40px;border:1px solid ${S.outline};border-radius:20px;overflow:hidden;font-weight:500;font-size:13px"><span style="display:flex;align-items:center;padding:0 16px">Schematic</span><span style="display:flex;align-items:center;gap:6px;padding:0 16px;border-left:1px solid ${S.outline};background:${S.secondaryContainer}">${icon('check', S.onSecondaryContainer, 16)}Geographic</span></span>
${icon('undo', S.onSurfaceVariant)}${icon('redo', S.onSurfaceVariant)}
<span style="height:40px;display:flex;align-items:center;gap:8px;padding:0 16px;border-radius:20px;border:1px solid ${S.outline};font-weight:600">${icon('help', S.primary)}Help</span>
<span style="height:40px;display:flex;align-items:center;gap:8px;padding:0 18px;border-radius:20px;background:${S.primary};color:${S.onPrimary};font-weight:600">${icon('download', S.onPrimary)}Export</span>
${icon('settings', S.onSurfaceVariant)}</div>`;

const left = `<div style="width:280px;flex:none;display:flex;flex-direction:column;gap:12px;padding:14px;background:${S.surfaceContainerLow};border-right:1px solid ${S.outlineVariant}">
<div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:16px;font-weight:600">Routes</span><span style="height:36px;display:flex;align-items:center;gap:6px;padding:0 14px;border-radius:18px;background:${S.primary};color:${S.onPrimary};font-weight:600;font-size:13px">${icon('add', S.onPrimary, 18)}New route</span></div>
${routeRow('#F8C300', 'Line 1 Yonge-University', 'Subway · 38 stops · every 3 min')}
${routeRow('#00923F', 'Line 2 Bloor-Danforth', 'Subway · 31 stops · every 4 min')}
${routeRow('#1F5FBF', 'New route 3', 'Drawing · 2 stops', true)}
<div style="height:1px;background:${S.outlineVariant}"></div>
<div style="display:flex;gap:8px"><span style="flex:1;height:44px;display:flex;align-items:center;gap:8px;padding:0 14px;border-radius:22px;background:${S.surfaceContainerHighest};color:${S.onSurfaceVariant}">${icon('search', S.onSurfaceVariant)}Find a station</span><span title="Regex builder" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:22px;border:1px solid ${S.outlineVariant};font-family:Consolas,monospace;font-weight:700;color:${S.primary}">.*</span></div>
<span style="font-size:12px;color:${S.onSurfaceVariant}">The regex builder opens from the .* button beside the search box, with mode, flags, test text and saved patterns.</span>
</div>`;

const toolbar = `<div style="position:absolute;left:50%;top:16px;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:6px;border-radius:28px;background:${S.surfaceContainerLowest};box-shadow:0 4px 14px rgba(0,0,0,.16)">
${tool('arrow_selector_tool', 'Select', '', false, 'md')}${tool('add_location_alt', 'Station', '', false, 'md')}${tool('conversion_path', 'Route', '', true, 'md')}${tool('directions_bus', 'Bus route', '', false, 'md')}${tool('title', 'Label', '', false, 'md')}${tool('ink_eraser', 'Erase', '', false, 'md')}
<span style="width:1px;height:28px;background:${S.outlineVariant};margin:0 4px"></span>${tool('more_horiz', 'More', '', false, 'md')}</div>`;

const hint = `<div style="position:absolute;left:50%;top:84px;transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-radius:16px;background:${S.inverseSurface};color:${S.inverseOnSurface};box-shadow:0 4px 14px rgba(0,0,0,.2);font-size:14px">
${icon('touch_app', S.inversePrimary)}<span style="white-space:nowrap"><b>New route 3 · 2 stops.</b> Click the map or a station.</span>
<span style="height:32px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:16px;background:${S.inversePrimary};color:${S.onPrimaryContainer};font-weight:600">${icon('check', S.onPrimaryContainer, 18)}Finish</span>
<span style="height:32px;display:flex;align-items:center;padding:0 10px;border-radius:16px;color:${S.inversePrimary};font-weight:600;white-space:nowrap">Undo stop</span></div>`;

const more = `<div style="position:absolute;right:12px;top:150px;width:250px;display:flex;flex-direction:column;padding:8px 0;border-radius:12px;background:${S.surfaceContainer};box-shadow:0 6px 18px rgba(0,0,0,.18);opacity:.97">
<span style="padding:6px 16px;font-size:12px;font-weight:600;color:${S.onSurfaceVariant}">More ways to add</span>
${[['upload_file', 'Import a GTFS feed'], ['content_paste', 'Paste stations (Ctrl+V)'], ['swap_horiz', 'Link two stations as a transfer'], ['map', 'Start from the GTHA template'], ['keyboard_command_key', 'All commands (Ctrl+K)']].map(([g, t]) => `<span style="display:flex;align-items:center;gap:12px;height:44px;padding:0 16px">${icon(g, S.onSurfaceVariant)}${t}</span>`).join('')}</div>`;

const right = `<div style="width:320px;flex:none;display:flex;flex-direction:column;background:${S.surfaceContainerLow};border-left:1px solid ${S.outlineVariant}">
${tabs([['ads_click', 'Selected'], ['analytics', 'Analyse'], ['palette', 'Style']], 0)}
<div style="display:flex;flex-direction:column;gap:10px;padding:14px">
<div style="display:flex;align-items:center;gap:10px"><span style="font-size:16px;font-weight:600;flex:1">Get started</span><span style="font-size:12px;font-weight:600;color:${S.primary}">2 of 5 done</span></div>
<div style="height:6px;border-radius:3px;background:${S.surfaceContainerHighest}"><div style="width:40%;height:100%;border-radius:3px;background:${S.primary}"></div></div>
${check(true, 'Add a station', 'Pick Station, then click the map')}
${check(true, 'Start a route', 'Pick Route, then click stations in order')}
${check(false, 'Set how often it runs', 'Peak, midday, evening, weekend', 'Set')}
${check(false, 'Name and colour the route', 'Shown in the legend and exports', 'Open')}
${check(false, 'Export or share', 'PNG, PDF, website or a link', 'Export')}
<span style="font-size:12px;color:${S.onSurfaceVariant}">Select anything on the map to edit it here. Trip planner, auto-schematic, coverage and ridership are under Analyse.</span>
</div></div>`;

const desktop = `<div style="width:${W}px;height:${H}px;flex:none;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;border:1px solid ${S.outlineVariant};background:${S.surface}">
${appbar}<div style="flex:1;display:flex;min-height:0">${left}<div style="flex:1;position:relative;overflow:hidden">${mapSvg(W - 600, H - 64, { drawing: true })}${toolbar}${hint}${more}
<div style="position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;gap:10px">${['fit_screen', 'add', 'remove', 'layers'].map((g) => `<span style="width:52px;height:52px;border-radius:16px;background:${S.surfaceContainerHigh};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.12)">${icon(g, S.onSurface)}</span>`).join('')}</div></div>${right}</div></div>`;

// ---------- phone ----------
const PW = 390, PH = 844;
const phone = `<div style="width:${PW}px;height:${PH}px;flex:none;position:relative;border-radius:36px;overflow:hidden;border:8px solid #1b1b1f;background:${S.surface};box-sizing:content-box">
<div style="height:56px;display:flex;align-items:center;gap:10px;padding:0 12px;background:${S.surface}">${icon('route', S.primary, 24)}<span style="font-weight:600;flex:1">My transit plan</span>${icon('help', S.primary)}<span style="height:36px;display:flex;align-items:center;gap:6px;padding:0 12px;border-radius:18px;background:${S.primary};color:${S.onPrimary};font-weight:600;font-size:13px">${icon('download', S.onPrimary, 18)}Export</span></div>
<div style="position:absolute;top:56px;left:0;right:0;bottom:0;overflow:hidden">${mapSvg(PW, PH - 56, { drawing: true })}</div>
<div style="position:absolute;left:12px;right:12px;top:72px;display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:16px;background:${S.inverseSurface};color:${S.inverseOnSurface};font-size:13px">${icon('touch_app', S.inversePrimary)}<span style="flex:1">Tap the map or a station to add the next stop. <b>2 stops</b></span><span style="height:30px;display:flex;align-items:center;padding:0 12px;border-radius:15px;background:${S.inversePrimary};color:${S.onPrimaryContainer};font-weight:600">Finish</span></div>
<div style="position:absolute;left:0;right:0;bottom:80px;height:250px;border-radius:28px 28px 0 0;background:${S.surfaceContainerLow};box-shadow:0 -4px 14px rgba(0,0,0,.14);display:flex;flex-direction:column">
<span style="align-self:center;width:32px;height:4px;border-radius:2px;background:${S.outline};margin:10px 0 4px"></span>
${tabs([['route', 'Routes'], ['ads_click', 'Selected'], ['analytics', 'Analyse']], 0)}
<div style="display:flex;flex-direction:column;padding:6px 8px">${routeRow('#F8C300', 'Line 1 Yonge-University', 'Subway · 38 stops')}${routeRow('#1F5FBF', 'New route 3', 'Drawing · 2 stops', true)}</div></div>
<div style="position:absolute;left:0;right:0;bottom:0;height:80px;display:flex;align-items:center;justify-content:space-around;background:${S.surfaceContainer};border-top:1px solid ${S.outlineVariant}">
${[['arrow_selector_tool', 'Select'], ['add_location_alt', 'Station'], ['conversion_path', 'Route'], ['directions_bus', 'Bus'], ['more_horiz', 'More']].map(([g, t], i) => `<span style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;font-weight:600;color:${i === 2 ? S.onSurface : S.onSurfaceVariant}"><span style="width:56px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;${i === 2 ? `background:${S.secondaryContainer}` : ''}">${icon(g, i === 2 ? S.onSecondaryContainer : S.onSurfaceVariant)}</span>${t}</span>`).join('')}</div></div>`;

// ---------- blank map ----------
const blank = `<div style="width:${PW + 16}px;flex:none;display:flex;flex-direction:column;gap:12px;padding:20px;box-sizing:border-box;border-radius:28px;background:${S.surfaceContainerLowest};box-shadow:0 6px 18px rgba(0,0,0,.14)">
<span style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${S.primary}">Blank map, shown on the map itself</span>
<span style="font-size:22px;font-weight:600">Start your map</span><span style="color:${S.onSurfaceVariant}">Pick one. You can change everything later.</span>
${[['add_location_alt', 'Add your first station', 'Click anywhere on the map'], ['conversion_path', 'Draw a route', 'Click stops in order; Enter finishes'], ['upload_file', 'Import a GTFS feed', 'Real routes, stops and frequencies'], ['map', 'Use the GTHA template', '238 stations, 20 routes']].map(([g, t, s], i) => `<span style="display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;${i === 0 ? `background:${S.primaryContainer};color:${S.onPrimaryContainer}` : `border:1px solid ${S.outlineVariant}`}">${icon(g, i === 0 ? S.onPrimaryContainer : S.primary, 24)}<span style="display:flex;flex-direction:column"><span style="font-weight:600">${t}</span><span style="font-size:12px;opacity:.8">${s}</span></span></span>`).join('')}
<span style="display:flex;align-items:center;gap:8px;font-size:13px;color:${S.onSurfaceVariant}">${icon('school', S.primary)}Take the 1-minute tour</span></div>`;

const notes = `<div style="width:${PW + 16}px;flex:none;display:flex;flex-direction:column;gap:8px;padding:18px;box-sizing:border-box;border-radius:24px;background:${S.surfaceContainerLow};border:1px solid ${S.outlineVariant};font-size:13px">
<span style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${S.primary}">What changes</span>
${['Adding is a labelled toolbar on top of the map, with each shortcut key in its tooltip, not five small icons in a side rail.', 'Every tool says what to do next. While drawing, the hint shows the stop count with Finish and Undo stop.', 'Bus route is its own tool: it starts a route already set to bus service.', 'The right panel opens on what you selected, or a getting-started checklist. Analysis tools move to an Analyse tab and map styles to Style.', 'Search keeps its regex builder, one tap away beside the box.', 'On a phone the tools are a bottom bar that is always visible, and routes, selection and analysis sit in a sheet above it.', 'Nothing is removed: every existing tool, panel and shortcut is still there.'].map((x) => `<span style="display:flex;gap:8px">${icon('check', S.primary, 18)}<span>${x}</span></span>`).join('')}</div>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GTHA Metro Map Creator 1.9: easier to start, easier to add</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>body{margin:0}</style>
</helmet>
<div style="${F};font-size:14px;color:${S.onSurface};background:${S.surface};width:2300px;height:1000px;display:flex;flex-direction:column;gap:16px;padding:24px;box-sizing:border-box;overflow:hidden">
<div style="display:flex;align-items:baseline;gap:12px"><span style="font-size:28px;font-weight:600">Release 1.9: easier to use</span><span style="color:${S.onSurfaceVariant}">Labelled tools on the map · a hint for every tool · getting-started checklist · phone tool bar</span></div>
<div style="display:flex;gap:24px;align-items:flex-start">${desktop}${phone}<div style="display:flex;flex-direction:column;gap:16px">${blank}${notes}</div></div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":2300,"height":1000}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(REPO, 'design', 'Easy18.dc.html'), html);
console.log('wrote design/Easy18.dc.html', html.length, 'bytes');
