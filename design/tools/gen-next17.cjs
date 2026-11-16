// Generates design/Next17.dc.html: per-line station markers, shared bends, docs search with a regex
// builder, and the optional sign-in for the hosted server.
const fs = require('fs');
const SP = process.env.SP, REPO = process.env.REPO;
const S = JSON.parse(fs.readFileSync(SP + '/m3/scheme.json')).light;
const IC = JSON.parse(fs.readFileSync(SP + '/m3/icons.json'));
const icon = (n, c = 'currentColor', sz = 20) => `<svg width="${sz}" height="${sz}" viewBox="0 -960 960 960" aria-hidden="true"><path fill="${c}" d="${IC[n] || ''}"/></svg>`;
const panel = (title, body, w) => `<section style="width:${w}px;box-sizing:border-box;flex:none;display:flex;flex-direction:column;gap:12px;padding:18px;border-radius:24px;background:${S.surfaceContainerLow};border:1px solid ${S.outlineVariant}"><span style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${S.primary}">${title}</span>${body}</section>`;
const seg = (items, on) => `<div style="display:flex;height:40px;border:1px solid ${S.outline};border-radius:20px;overflow:hidden;font-weight:500;font-size:13px">${items.map((t, i) => `<span style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;${i ? `border-left:1px solid ${S.outline};` : ''}${i === on ? `background:${S.secondaryContainer};color:${S.onSecondaryContainer}` : ''}">${i === on ? '✓ ' : ''}${t}</span>`).join('')}</div>`;
const sw = (label, sub, on) => `<div style="display:flex;align-items:center;gap:12px"><div style="flex:1;display:flex;flex-direction:column"><span style="font-weight:500">${label}</span><span style="font-size:12px;color:${S.onSurfaceVariant}">${sub}</span></div><span style="width:52px;height:32px;border-radius:16px;position:relative;${on ? `background:${S.primary}` : `border:2px solid ${S.outline};box-sizing:border-box;background:${S.surfaceContainerHighest}`}"><span style="position:absolute;top:${on ? 4 : 6}px;${on ? 'right:4px;width:24px;height:24px' : 'left:6px;width:16px;height:16px'};border-radius:50%;background:${on ? S.onPrimary : S.outline}"></span></span></div>`;
// markers preview: one line with four marker styles
const mk = (kind, x) => kind === 'ring' ? `<circle cx="${x}" cy="40" r="8" fill="#fff" stroke="#16181D" stroke-width="3"/>` : kind === 'tick' ? `<path d="M${x} 40 v14" stroke="#F8C300" stroke-width="6" stroke-linecap="butt"/>` : kind === 'pill' ? `<rect x="${x - 6}" y="28" width="12" height="24" rx="6" fill="#fff" stroke="#16181D" stroke-width="3"/>` : `<circle cx="${x}" cy="40" r="5" fill="#fff"/>`;
const preview = (kind) => `<svg width="100%" height="80" viewBox="0 0 440 80" style="background:#fff;border-radius:12px;border:1px solid ${S.outlineVariant}"><path d="M20 40 H420" stroke="#F8C300" stroke-width="10" stroke-linecap="round"/>${[80, 180, 280, 380].map((x) => mk(kind, x)).join('')}<g font-family="Inter,sans-serif" font-size="12" fill="#16181D">${['St Clair', 'Summerhill', 'Rosedale', 'Bloor-Yonge'].map((n, i) => `<text x="${80 + i * 100}" y="${kind === 'tick' ? 20 : 68}" text-anchor="middle">${n}</text>`).join('')}</g></svg>`;
const editor = panel('Editor · line inspector', `
<div style="display:flex;align-items:center;gap:10px"><span style="width:28px;height:8px;border-radius:4px;background:#F8C300"></span><span style="font-size:18px;font-weight:600">Line 1 Yonge-University</span></div>
<span style="font-weight:500">Station markers</span>
${seg(['Auto', 'Ring', 'Tick', 'Pill', 'Dot'], 2)}
${preview('tick')}
<span style="font-size:12px;color:${S.onSurfaceVariant}">Interchanges keep a ring so changes stay easy to spot. The map style sets the default; this line overrides it.</span>
<div style="height:1px;background:${S.outlineVariant};margin:4px 0"></div>
<span style="font-weight:500">Segment Bloor-Yonge → Wellesley</span>
${seg(['Diagonal first', 'Straight first'], 0)}
${sw('Same bend for every line here', 'Line 1 and the Ontario Line share this segment', true)}
`, 460);
const hl = (t, m) => t.replace(m, `<mark style="background:${S.tertiaryContainer};color:${S.onTertiaryContainer};border-radius:3px;padding:0 2px">${m}</mark>`);
const docs = panel('Documentation · search', `
<div style="display:flex;gap:8px"><div style="flex:1;height:48px;display:flex;align-items:center;gap:10px;padding:0 14px;border-radius:24px;background:${S.surfaceContainerHighest}">${icon('search', S.onSurfaceVariant)}<span style="font-family:Consolas,monospace">fre(quen|q)</span><span style="margin-left:auto;font-size:12px;color:${S.onSurfaceVariant}">12 matches · 5 articles</span></div><span style="height:48px;display:flex;align-items:center;gap:6px;padding:0 14px;border-radius:24px;background:${S.secondaryContainer};color:${S.onSecondaryContainer};font-weight:600;font-family:Consolas,monospace">.*</span></div>
<div style="display:flex;flex-wrap:wrap;gap:6px;padding:10px;border-radius:16px;background:${S.surfaceContainer}"><span style="font-size:12px;font-weight:600;width:100%;color:${S.onSurfaceVariant}">Regex builder</span>${['fre', '( )', 'quen', '|', 'q', '+ any char', '+ digit', '+ word', 'i ignore case'].map((t, i) => `<span style="height:30px;display:flex;align-items:center;padding:0 10px;border-radius:8px;font-family:Consolas,monospace;font-size:13px;${i < 5 ? `background:${S.primaryContainer};color:${S.onPrimaryContainer}` : `border:1px solid ${S.outlineVariant}`}">${t}</span>`).join('')}<span style="width:100%;font-size:12px;color:${S.onSurfaceVariant}">"fre", then either "quen" or "q". Case is ignored.</span></div>
${[['Express, branches, frequencies', 'Give each route its peak, midday, evening and weekend frequency…', 'frequen'], ['Trips and travel times', 'Boarding wait is half the headway for the chosen time band; set the freq…', 'freq'], ['Simulation', 'Vehicles run at the speed and frequency of each route, spaced by…', 'frequen']].map(([h, b, m]) => `<div style="display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:14px;background:${S.surfaceContainerLowest}"><span style="font-weight:600;color:${S.primary}">${h}</span><span style="font-size:13px;color:${S.onSurfaceVariant}">${hl(b, m)}</span></div>`).join('')}
`, 470);
const signin = panel('Hosted server · optional sign-in', `
<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px;border-radius:20px;background:${S.surfaceContainerLowest};box-shadow:0 2px 6px rgba(0,0,0,.12)">
<span style="width:48px;height:48px;border-radius:16px;background:${S.primary};display:flex;align-items:center;justify-content:center">${icon('map', S.onPrimary, 26)}</span>
<span style="font-size:20px;font-weight:600">GTHA Metro Map Creator</span><span style="font-size:13px;color:${S.onSurfaceVariant}">This map server needs a password</span>
<div style="width:100%;display:flex;flex-direction:column;gap:4px"><span style="font-size:12px;color:${S.onSurfaceVariant}">Password</span><span style="height:44px;display:flex;align-items:center;padding:0 12px;border-radius:4px 4px 0 0;background:${S.surfaceContainerHighest};border-bottom:2px solid ${S.primary};letter-spacing:4px">••••••••••</span></div>
<span style="width:100%;height:44px;display:flex;align-items:center;justify-content:center;border-radius:22px;background:${S.primary};color:${S.onPrimary};font-weight:600">Sign in</span></div>
<span style="font-weight:500;margin-top:4px">In the deploy app and setup wizard</span>
${sw('Require a password', 'Everyone on the network must sign in', true)}
<div style="display:flex;flex-direction:column;gap:4px"><span style="font-size:12px;color:${S.onSurfaceVariant}">Password (stored hashed, never shown again)</span><span style="height:40px;display:flex;align-items:center;padding:0 12px;border-radius:4px 4px 0 0;background:${S.surfaceContainerHighest};border-bottom:1px solid ${S.onSurfaceVariant};letter-spacing:4px">••••••••••</span></div>
<span style="font-size:12px;color:${S.onSurfaceVariant}">Off by default. The health check stays open so monitors keep working.</span>
`, 420);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GTHA Metro Map Creator 1.7: markers, shared bends, docs search, sign-in</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>body{margin:0}</style>
</helmet>
<div style="font-family:Inter,'Segoe UI',system-ui,sans-serif;font-size:14px;color:${S.onSurface};background:${S.surface};width:1440px;height:900px;display:flex;flex-direction:column;gap:16px;padding:24px;box-sizing:border-box;overflow:hidden">
<div style="display:flex;align-items:baseline;gap:12px"><span style="font-size:28px;font-weight:600">Release 1.7</span><span style="color:${S.onSurfaceVariant}">Per-line station markers · one bend for shared track · documentation search · optional sign-in</span></div>
<div style="display:flex;gap:16px;align-items:flex-start">${editor}${docs}${signin}</div>
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
fs.writeFileSync(REPO + '/design/Next17.dc.html', html);
console.log('bytes', html.length);
