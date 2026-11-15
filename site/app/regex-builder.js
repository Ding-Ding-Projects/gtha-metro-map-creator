// Regular expression builder for the station search.
// It edits the same search field and mode as the plain search, so query, pattern,
// flags, validation and mode stay in one place. Engine: this browser's JavaScript RegExp
// with the u flag always on.
(function () {
  'use strict';
  const MAX_PATTERN = 200, MAX_TEXT = 5000, MAX_MATCHES = 500;
  const STORE = 'gmmc.regex.v1';
  const $ = (id) => document.getElementById(id);
  const t = (k) => window.I18N.t(k);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TOKENS = [
    ['^', 'rxStart'], ['$', 'rxEnd'], ['.', 'rxAny'], ['\\d', 'rxDigit'], ['\\w', 'rxWord'], ['\\s', 'rxSpace'],
    ['\\b', 'rxBoundary'], ['\\p{L}', 'rxLetter'], ['[]', 'rxSet', 1], ['[^]', 'rxNotSet', 2], ['()', 'rxGroup', 1],
    ['(?:)', 'rxNonCap', 3], ['(?<name>)', 'rxNamed', 8], ['|', 'rxOr'], ['*', 'rxZeroMore'], ['+', 'rxOneMore'],
    ['?', 'rxOptional'], ['{2,4}', 'rxCount'], ['(?=)', 'rxAhead', 3], ['(?!)', 'rxNotAhead', 3], ['(?<=)', 'rxBehind', 4],
    ['(?<!)', 'rxNotBehind', 4], ['\\1', 'rxBackref']
  ];
  const LIBRARY = [
    ['^St ', 'rxLibSaint'], ['\\bGO\\b', 'rxLibGo'], ['(?:North|South|East|West)', 'rxLibCompass'],
    ['^[A-M]', 'rxLibAtoM'], ['\\d', 'rxLibDigit'], ['(?<word>\\w+) \\k<word>', 'rxLibRepeat']
  ];
  const DESCRIBE = [
    [/^\\[dDwWsSbB]/, (m) => ({ '\\d': 'rxDigit', '\\D': 'rxNotDigit', '\\w': 'rxWord', '\\W': 'rxNotWord', '\\s': 'rxSpace', '\\S': 'rxNotSpace', '\\b': 'rxBoundary', '\\B': 'rxNotBoundary' }[m])],
    [/^\\[pP]\{[^}]*\}/, () => 'rxProperty'], [/^\\k<[^>]*>/, () => 'rxNamedRef'], [/^\\[1-9]\d*/, () => 'rxBackref'],
    [/^\\u\{[0-9a-fA-F]+\}|^\\u[0-9a-fA-F]{4}|^\\x[0-9a-fA-F]{2}/, () => 'rxCodePoint'], [/^\\./, () => 'rxEscaped'],
    [/^\[\^(?:\\.|[^\]])*\]/, () => 'rxNotSet'], [/^\[(?:\\.|[^\]])*\]/, () => 'rxSet'],
    [/^\(\?<=/, () => 'rxBehind'], [/^\(\?<!/, () => 'rxNotBehind'], [/^\(\?<[A-Za-z_]\w*>/, () => 'rxNamed'],
    [/^\(\?:/, () => 'rxNonCap'], [/^\(\?=/, () => 'rxAhead'], [/^\(\?!/, () => 'rxNotAhead'], [/^\(/, () => 'rxGroup'],
    [/^\)/, () => 'rxGroupEnd'], [/^\{\d+(?:,\d*)?\}\??/, () => 'rxCount'], [/^[*+?]\?/, () => 'rxLazy'],
    [/^\*/, () => 'rxZeroMore'], [/^\+/, () => 'rxOneMore'], [/^\?/, () => 'rxOptional'], [/^\|/, () => 'rxOr'],
    [/^\^/, () => 'rxStart'], [/^\$/, () => 'rxEnd'], [/^\./, () => 'rxAny'], [/^[^\\[\](){}*+?|^$.]+/, () => 'rxLiteral']
  ];

  let state = { flags: { m: true, s: false }, text: '', replace: '', saved: [] };
  try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && typeof s === 'object') state = Object.assign(state, s, { flags: Object.assign(state.flags, s.flags || {}) }); } catch { /* storage blocked */ }
  if (!Array.isArray(state.saved)) state.saved = [];
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* storage blocked */ } };

  function flags() {
    const ic = $('searchCase') && $('searchCase').checked;
    return (ic ? 'i' : '') + (state.flags.m ? 'm' : '') + (state.flags.s ? 's' : '') + 'u';
  }
  function compile(pattern, extra) {
    if (pattern.length > MAX_PATTERN) return { error: t('rxTooLong') };
    try { return { re: new RegExp(pattern, flags() + (extra || '')) }; } catch (e) { return { error: e.message }; }
  }
  function explain(p) {
    const out = []; let i = 0, guard = 0;
    while (i < p.length && guard++ < 400) {
      const rest = p.slice(i); let hit = null;
      for (const [re, key] of DESCRIBE) { const m = rest.match(re); if (m) { hit = [m[0], key(m[0])]; break; } }
      if (!hit) hit = [rest[0], 'rxLiteral'];
      out.push(hit); i += hit[0].length;
    }
    return out;
  }
  function stationNames() {
    const m = window.GMMC && window.GMMC.getMap ? window.GMMC.getMap() : null;
    return m ? Object.values(m.stations).map((s) => s.name).join('\n') : '';
  }
  function insert(token, back) {
    const inp = $('searchInput');
    const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a;
    const sel = inp.value.slice(a, b);
    let ins = token;
    if (back && sel) ins = token.slice(0, token.length - back) + sel + token.slice(token.length - back);
    inp.value = inp.value.slice(0, a) + ins + inp.value.slice(b);
    const caret = a + ins.length - (back && !sel ? back : 0);
    $('searchMode').value = 'regex';
    inp.focus(); inp.setSelectionRange(caret, caret);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function render() {
    if (!$('rxBuilder')) return;
    const p = $('searchInput').value, isRegex = $('searchMode').value === 'regex';
    $('rxFlagM').checked = state.flags.m; $('rxFlagS').checked = state.flags.s;
    $('rxFlagsOut').textContent = '/' + p + '/' + flags();
    $('rxModeNote').textContent = isRegex ? '' : t('rxPlainNote');
    // explanation
    $('rxExplain').innerHTML = p ? explain(p).map(([tok, key]) => `<li><code>${esc(tok)}</code> <span>${esc(t(key))}</span></li>`).join('') : `<li class="hint">${esc(t('rxEmpty'))}</li>`;
    // test text
    const ta = $('rxText');
    if (document.activeElement !== ta) ta.value = state.text;
    const text = (state.text || stationNames()).slice(0, MAX_TEXT);
    const out = $('rxPreview'), groups = $('rxGroups'), status = $('rxStatus'), rep = $('rxReplaceOut');
    status.classList.remove('err');
    if (!p) { out.textContent = text; groups.innerHTML = ''; status.textContent = ''; rep.textContent = ''; return; }
    const c = compile(isRegex ? p : p.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'g');
    if (c.error) { status.textContent = t('invalidPattern') + ': ' + c.error; status.classList.add('err'); out.textContent = text; groups.innerHTML = ''; rep.textContent = ''; return; }
    let html = '', last = 0, count = 0, first = null;
    for (const m of text.matchAll(c.re)) {
      if (count >= MAX_MATCHES) break;
      if (!first) first = m;
      html += esc(text.slice(last, m.index)) + `<mark>${esc(m[0]) || '&#8203;'}</mark>`;
      last = m.index + m[0].length; count++;
    }
    html += esc(text.slice(last));
    out.innerHTML = html;
    status.textContent = count + ' ' + t('rxMatchCount') + (count >= MAX_MATCHES ? ' (' + t('rxCapped') + ')' : '');
    if (first && first.length > 1) {
      const named = first.groups ? Object.keys(first.groups) : [];
      groups.innerHTML = first.slice(1).map((g, i) => `<li><code>$${i + 1}</code> ${esc(g ?? t('rxUnset'))}</li>`).join('') +
        named.map((n) => `<li><code>&lt;${esc(n)}&gt;</code> ${esc(first.groups[n] ?? t('rxUnset'))}</li>`).join('');
    } else groups.innerHTML = `<li class="hint">${esc(t('rxNoGroups'))}</li>`;
    try { rep.textContent = state.replace ? text.replace(c.re, state.replace).split('\n').slice(0, 40).join('\n') : ''; } catch { rep.textContent = ''; }
  }
  function renderSaved() {
    const sel = $('rxSaved');
    sel.innerHTML = `<option value="">${esc(t('rxChoose'))}</option>` +
      LIBRARY.map(([p, k], i) => `<option value="lib:${i}">${esc(t(k))}: ${esc(p)}</option>`).join('') +
      state.saved.map((s, i) => `<option value="my:${i}">${esc(s.name)}: ${esc(s.pattern)}</option>`).join('');
  }
  function buildTokens() {
    $('rxTokens').innerHTML = TOKENS.map(([tok, key, back], i) => `<button type="button" data-rx="${i}" title="${esc(t(key))}"><code>${esc(tok)}</code></button>`).join('');
  }

  function init() {
    if (!$('rxBuilder')) return;
    buildTokens(); renderSaved();
    $('rxTokens').addEventListener('click', (e) => { const b = e.target.closest('[data-rx]'); if (!b) return; const [tok, , back] = TOKENS[+b.dataset.rx]; insert(tok, back || 0); });
    $('rxEscape').addEventListener('click', () => { const inp = $('searchInput'); inp.value = inp.value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'); $('searchMode').value = 'regex'; inp.dispatchEvent(new Event('input', { bubbles: true })); });
    $('rxFlagM').addEventListener('change', (e) => { state.flags.m = e.target.checked; save(); $('searchInput').dispatchEvent(new Event('input', { bubbles: true })); });
    $('rxFlagS').addEventListener('change', (e) => { state.flags.s = e.target.checked; save(); $('searchInput').dispatchEvent(new Event('input', { bubbles: true })); });
    $('rxText').addEventListener('input', (e) => { state.text = e.target.value.slice(0, MAX_TEXT); save(); render(); });
    $('rxReplace').value = state.replace;
    $('rxReplace').addEventListener('input', (e) => { state.replace = e.target.value.slice(0, 200); save(); render(); });
    $('rxUseStations').addEventListener('click', () => { state.text = ''; save(); $('rxText').value = ''; render(); });
    $('rxSaved').addEventListener('change', (e) => {
      const v = e.target.value; if (!v) return;
      const [kind, i] = v.split(':'); const p = kind === 'lib' ? LIBRARY[+i][0] : state.saved[+i].pattern;
      $('searchInput').value = p; $('searchMode').value = 'regex'; e.target.value = '';
      $('searchInput').dispatchEvent(new Event('input', { bubbles: true }));
    });
    $('rxSave').addEventListener('click', () => {
      const p = $('searchInput').value; if (!p || compile(p).error) { $('rxStatus').textContent = t('invalidPattern'); $('rxStatus').classList.add('err'); return; }
      const name = ($('rxName').value || p).slice(0, 40);
      state.saved = state.saved.filter((s) => s.name !== name).concat([{ name, pattern: p }]).slice(-30);
      $('rxName').value = ''; save(); renderSaved(); $('rxStatus').textContent = t('rxSavedOk');
    });
    $('rxDelete').addEventListener('click', () => { const name = $('rxName').value; state.saved = state.saved.filter((s) => s.name !== name); save(); renderSaved(); });
    $('rxBuilder').addEventListener('toggle', render);
  }
  window.RxBuilder = { flags, render, relabel() { if ($('rxTokens')) { buildTokens(); renderSaved(); render(); } }, explain, init };
})();
