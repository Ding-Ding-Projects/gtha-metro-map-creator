// Minimal offline renderer for .dc.html artboards: evaluates renderVals and expands sc-for and {{}}.
import fs from 'node:fs';
const [src, out] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const body = html.match(/<x-dc>([\s\S]*)<\/x-dc>/)[1];
const helmet = (body.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
let tpl = body.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
const code = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
class DCLogic { constructor() { this.props = {}; } }
const Component = new Function('DCLogic', code + '\nreturn Component;')(DCLogic);
const vals = new Component().renderVals();
const get = (scope, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), scope);
function expand(t, scope) {
  t = t.replace(/<sc-for list="\{\{(\w+(?:\.\w+)*)\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g, (_, list, as, inner) =>
    (get(scope, list) || []).map((item) => expand(inner, Object.assign({}, scope, { [as]: item }))).join(''));
  return t.replace(/\{\{([\w.]+)\}\}/g, (_, p) => { const v = get(scope, p); return v == null ? '' : String(v); });
}
fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8">${helmet}</head><body>${expand(tpl, vals)}</body></html>`);
