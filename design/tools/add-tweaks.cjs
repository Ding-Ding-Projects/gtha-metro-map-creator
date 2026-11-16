// Adds the shared Tweaks to every design board (.dc.html), so each board has the same levers
// with the same names and defaults:
//   accent  colour of buttons, selection and links (default #185BBB, the Material primary)
//   motion  switch; off stills every animation and transition on the board
// Usage: node design/tools/add-tweaks.cjs <board.dc.html> [...]
// Safe to run again: boards that already carry the motion lever are left as they are.
'use strict';
const fs = require('fs');

const ACCENT = '#185BBB';
const PROPS = {
  accent: { editor: 'color', default: ACCENT, options: [ACCENT, '#0B6E4F', '#9461A8', '#16181D'] },
  motion: { editor: 'boolean', default: true }
};
const MOTION_CSS = '[data-motion="off"] *, [data-motion="off"] *::before, [data-motion="off"] *::after { animation: none !important; transition: none !important; }';
const PRIMARY = /#185bbb|#1f5fbf/gi;

function addTweaks(file) {
  let s = fs.readFileSync(file, 'utf8');
  if (s.includes('"motion":{"editor":"boolean"')) return 'unchanged';
  const a = s.indexOf('<x-dc>'), b = s.indexOf('</x-dc>');
  if (a < 0 || b < 0) throw new Error(file + ': no <x-dc> block');
  let block = s.slice(a, b);
  // Helmet keeps literal colours; only the board markup reads {{accent}}.
  const hEnd = block.indexOf('</helmet>');
  let helmet = hEnd >= 0 ? block.slice(0, hEnd) : '';
  let body = hEnd >= 0 ? block.slice(hEnd) : block;
  helmet = hEnd >= 0 ? helmet.replace('</style>', MOTION_CSS + '\n</style>') : helmet;
  if (hEnd >= 0 && !helmet.includes(MOTION_CSS)) helmet += '<style>' + MOTION_CSS + '</style>\n';
  body = body.replace(PRIMARY, '{{accent}}');
  // The board root is the first element after the helmet: mark it and feed --primary from the lever.
  body = body.replace(/<div style="/, '<div data-motion="{{motionAttr}}" style="--primary: {{accent}}; ');
  if (hEnd < 0) body = body.replace('<x-dc>', '<x-dc>\n<helmet><style>' + MOTION_CSS + '</style></helmet>');
  s = s.slice(0, a) + helmet + body + s.slice(b);

  const sm = s.match(/<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/);
  const w = (s.match(/width:\s*(\d+)px;\s*height:\s*(\d+)px/) || [, 1440, 900]);
  if (!sm) {
    const props = Object.assign({}, PROPS, { $preview: { width: +w[1], height: +w[2] } });
    s = s.replace('</x-dc>', '</x-dc>\n<script type="text/x-dc" data-dc-script data-props=\'' + JSON.stringify(props) + '\'>\nclass Component extends DCLogic {\n  renderVals() { return {}; }\n}\n</script>');
  }
  s = s.replace(/<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/, (all, json, code) => {
    const old = JSON.parse(json);
    const props = Object.assign({}, old, PROPS);
    delete props.$preview; props.$preview = old.$preview || { width: +w[1], height: +w[2] };
    code = code.replace(/#1F5FBF/gi, ACCENT).replace('renderVals()', '_baseVals()');
    code = code.replace(/\n\}\s*$/, `
  renderVals() {
    const base = this._baseVals() || {};
    return Object.assign({}, base, { accent: this.props.accent ?? '${ACCENT}', motionAttr: (this.props.motion ?? true) ? 'on' : 'off' });
  }
}
`);
    return `<script type="text/x-dc" data-dc-script data-props='${JSON.stringify(props)}'>${code}</script>`;
  });
  fs.writeFileSync(file, s);
  return 'tweaked';
}

for (const f of process.argv.slice(2)) console.log(addTweaks(f), f);
