// Documentation search with an adjacent regular expression builder.
// One field is the source of truth: the builder, the explanation, the flags read-out and the
// sample line all read from it, and every builder token writes back into it.
// Regular expressions run in a Web Worker that is terminated after a time cap, so a
// pathological pattern such as (a+)+$ can never freeze the page.
(function () {
  'use strict';
  var MAX_PATTERN = 200, MAX_MATCHES = 500, TIME_CAP = 400, MAX_SAMPLE = 2000, SNIPPETS = 3, MAX_MARKS = 300;
  var STORE = 'gtha.docsearch.v1';
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var STR = {
    en: {
      label: 'Search the documentation', placeholder: 'Search every article', toggleRegex: 'Regular expression mode', toggleLang: 'Switch search language',
      langBtn: '粵', clear: 'Clear search',
      results: 'Results', none: 'No matches.', empty: 'Type to search every article. Press Escape to clear.',
      count: function (m, a) { return m + (m === 1 ? ' match' : ' matches') + ' in ' + a + (a === 1 ? ' article' : ' articles'); },
      more: function (n) { return '+' + n + ' more in this article'; },
      capped: function (n) { return 'Stopped at ' + n + ' matches.'; },
      timeCut: 'This search took too long and was cut short. Simplify the pattern.',
      tooLong: 'The pattern is longer than 200 characters.', invalid: 'Invalid pattern',
      builder: 'Regex builder', flagsTitle: 'Flags', ic: 'Ignore case', word: 'Whole word',
      tokens: 'Pattern tokens', gText: 'Escapes', gGroups: 'Groups', gChars: 'Characters', gCount: 'Repeats', gAnchor: 'Anchors',
      escapeAll: 'Escape as literal text',
      explainTitle: 'What the pattern means', explainEmpty: 'Type a pattern, or add tokens above.', explainFail: 'No explanation for this pattern.',
      sampleTitle: 'Test against a sample line', sampleMatches: function (n) { return n + (n === 1 ? ' match' : ' matches') + ' in the sample'; },
      sampleCut: 'The sample test was cut short.', engine: 'Engine: JavaScript RegExp in this browser, Unicode mode',
      tk: {
        any: 'Any character', digit: 'A digit', word: 'A letter, digit or underscore', space: 'A space or tab', set: 'A custom set of characters', nset: 'Any character except a custom set',
        group: 'Capture group', ncgroup: 'Group without capture', alt: 'Alternation: this or that', opt: 'Optional (0 or 1)', star: 'Zero or more', plus: 'One or more', range: 'Between n and m times',
        start: 'Start of a line', end: 'End of a line', bound: 'Word boundary', dot: 'A literal dot', par: 'A literal opening bracket', bs: 'A literal backslash', slash: 'A literal slash'
      },
      p: {
        lit: function (s) { return '"' + s + '"'; }, join: ', then ', either2: function (a, b) { return 'either ' + a + ' or ' + b; }, oneOf: function (l) { return 'one of: ' + l.slice(0, -1).join(', ') + ' or ' + l[l.length - 1]; },
        any: 'any character', digit: 'a digit', ndigit: 'a non-digit', word: 'a letter, digit or underscore', nword: 'a non-word character', space: 'a space or tab', nspace: 'a non-space',
        bound: 'a word boundary', nbound: 'not a word boundary', start: 'the start of a line', end: 'the end of a line', prop: function (s) { return 'a character of type ' + s; }, ref: 'the same text as an earlier group',
        set: function (s) { return 'one of "' + s + '"'; }, nset: function (s) { return 'none of "' + s + '"'; }, opt: function (x) { return x + ' (optional)'; },
        star: function (x) { return x + ', any number of times'; }, plus: function (x) { return x + ', one or more times'; }, exact: function (x, n) { return x + ', exactly ' + n + (n === 1 ? ' time' : ' times'); },
        between: function (x, a, b) { return x + ', ' + a + ' to ' + b + ' times'; }, atleast: function (x, a) { return x + ', ' + a + ' or more times'; }, lazy: ', as few as possible',
        group: function (x) { return '(' + x + ')'; }, ahead: function (x) { return 'followed by ' + x; }, nahead: function (x) { return 'not followed by ' + x; }, behind: function (x) { return 'preceded by ' + x; }, nbehind: function (x) { return 'not preceded by ' + x; },
        icOn: 'Case is ignored.', icOff: 'Case matters.', wordOn: 'Whole words only.', end1: '.', sep: ' '
      }
    },
    yue: {
      label: '搜尋文件', placeholder: '搜尋每一篇文章', toggleRegex: '正規表達式模式', toggleLang: '切換搜尋語言',
      langBtn: 'EN', clear: '清除搜尋',
      results: '結果', none: '搵唔到。', empty: '輸入文字就會搜尋每一篇文章。撳 Escape 清除。',
      count: function (m, a) { return a + ' 篇文章共 ' + m + ' 個結果'; },
      more: function (n) { return '呢篇文章仲有 ' + n + ' 個'; },
      capped: function (n) { return '去到 ' + n + ' 個結果就停咗。'; },
      timeCut: '呢個搜尋用咗太耐，已經中途停咗。請簡化規則。',
      tooLong: '規則長過 200 個字。', invalid: '規則無效',
      builder: '正規表達式產生器', flagsTitle: '選項', ic: '唔分大細楷', word: '成個字',
      tokens: '規則符號', gText: '跳脫', gGroups: '分組', gChars: '字元', gCount: '重複', gAnchor: '位置',
      escapeAll: '當普通文字處理',
      explainTitle: '規則意思', explainEmpty: '打規則，或者喺上面加符號。', explainFail: '呢個規則暫時冇解釋。',
      sampleTitle: '用一行文字試下', sampleMatches: function (n) { return '樣本有 ' + n + ' 個結果'; },
      sampleCut: '樣本測試中途停咗。', engine: '引擎：呢個瀏覽器嘅 JavaScript RegExp，Unicode 模式',
      tk: {
        any: '任何字元', digit: '一個數字', word: '字母、數字或者底線', space: '空格或者 Tab', set: '自訂字元組合', nset: '自訂組合以外嘅字元',
        group: '擷取分組', ncgroup: '唔擷取嘅分組', alt: '二揀一', opt: '可有可無（0 或 1 次）', star: '零個或者多個', plus: '一個或者多個', range: '重複 n 至 m 次',
        start: '一行開頭', end: '一行結尾', bound: '字詞邊界', dot: '一個句點', par: '一個左括號', bs: '一個反斜線', slash: '一個斜線'
      },
      p: {
        lit: function (s) { return '「' + s + '」'; }, join: '，跟住', either2: function (a, b) { return a + '或者' + b; }, oneOf: function (l) { return '其中一個：' + l.slice(0, -1).join('、') + '或者' + l[l.length - 1]; },
        any: '任何字元', digit: '一個數字', ndigit: '一個唔係數字嘅字元', word: '字母、數字或者底線', nword: '一個唔係文字嘅字元', space: '空格或者 Tab', nspace: '一個唔係空格嘅字元',
        bound: '字詞邊界', nbound: '唔係字詞邊界', start: '一行開頭', end: '一行結尾', prop: function (s) { return '類型係 ' + s + ' 嘅字元'; }, ref: '同前面分組一樣嘅文字',
        set: function (s) { return '「' + s + '」其中一個'; }, nset: function (s) { return '唔係「' + s + '」入面任何一個'; }, opt: function (x) { return x + '（可有可無）'; },
        star: function (x) { return x + '，出現任何次數'; }, plus: function (x) { return x + '，出現一次或者以上'; }, exact: function (x, n) { return x + '，剛好 ' + n + ' 次'; },
        between: function (x, a, b) { return x + '，' + a + ' 至 ' + b + ' 次'; }, atleast: function (x, a) { return x + '，' + a + ' 次或者以上'; }, lazy: '，越少越好',
        group: function (x) { return '（' + x + '）'; }, ahead: function (x) { return '後面跟住' + x; }, nahead: function (x) { return '後面唔跟住' + x; }, behind: function (x) { return '前面係' + x; }, nbehind: function (x) { return '前面唔係' + x; },
        icOn: '唔分大細楷。', icOff: '要分大細楷。', wordOn: '只配對成個字。', end1: '。', sep: ''
      }
    }
  };

  var state = { mode: 'plain', ic: true, word: false, lang: 'en', sample: 'Frequent service, freq. and frequency.' };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && typeof saved === 'object') {
      if (saved.lang === 'en' || saved.lang === 'yue') state.lang = saved.lang;
      if (typeof saved.sample === 'string') state.sample = saved.sample.slice(0, MAX_SAMPLE);
    } else if (/^(yue|zh)/.test((navigator.language || 'en').toLowerCase())) state.lang = 'yue';
  } catch (e) { /* storage blocked */ }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify({ lang: state.lang, sample: state.sample })); } catch (e) { /* storage blocked */ } }

  function S() { return STR[state.lang]; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function escRe(s) { return s.replace(/[\\^$.*+?()[\]{}|\/]/g, '\\$&'); }

  // ---------- bounded matching ----------
  var WORKER_SRC = 'self.onmessage=function(e){var d=e.data,t0=Date.now(),out=[],total=0,trunc=false;try{var re=new RegExp(d.src,d.flags);for(var i=0;i<d.items.length;i++){var s=d.items[i],ms=[],m;re.lastIndex=0;if(!trunc){while((m=re.exec(s))!==null){if(m[0].length===0){re.lastIndex++;if(re.lastIndex>s.length)break;continue}ms.push([m.index,m[0].length]);total++;if(total>=d.max||Date.now()-t0>d.budget){trunc=true;break}}}out.push(ms)}}catch(err){self.postMessage({id:d.id,error:String(err.message||err)});return}self.postMessage({id:d.id,out:out,total:total,trunc:trunc,capped:total>=d.max})}';
  var workerUrl = null, seq = 0;
  function getWorkerUrl() {
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
    return workerUrl;
  }
  // Runs one bounded match job and returns a cancel function.
  function runJob(src, flags, items, done) {
    var id = ++seq, finished = false, w = null, timer = null;
    function kill() { clearTimeout(timer); if (w) { try { w.terminate(); } catch (e) { /* ignore */ } } }
    function finish(res) { if (finished) return; finished = true; kill(); done(res); }
    try {
      w = new Worker(getWorkerUrl());
      w.onmessage = function (e) { if (e.data.id === id) finish(e.data.error ? { error: e.data.error } : e.data); };
      w.onerror = function () { finish({ error: 'worker' }); };
      timer = setTimeout(function () { finish({ cut: true, out: items.map(function () { return []; }), total: 0 }); }, TIME_CAP + 150);
      w.postMessage({ id: id, src: src, flags: flags, items: items, max: MAX_MATCHES, budget: TIME_CAP });
    } catch (e) {
      // No worker support: run inline with the same match and time caps.
      setTimeout(function () {
        var out = [], total = 0, trunc = false, t0 = Date.now();
        try {
          var re = new RegExp(src, flags);
          items.forEach(function (s) {
            var ms = [], m; re.lastIndex = 0;
            while (!trunc && (m = re.exec(s)) !== null) {
              if (m[0].length === 0) { re.lastIndex++; if (re.lastIndex > s.length) break; continue; }
              ms.push([m.index, m[0].length]); total++;
              if (total >= MAX_MATCHES || Date.now() - t0 > TIME_CAP) trunc = true;
            }
            out.push(ms);
          });
          finish({ out: out, total: total, trunc: trunc, capped: total >= MAX_MATCHES });
        } catch (err) { finish({ error: String(err.message || err) }); }
      }, 0);
    }
    return function () { finished = true; kill(); };
  }

  function compileSource(q) {
    var src = state.mode === 'regex' ? q : escRe(q);
    if (state.word) src = '(?<![\\p{L}\\p{N}_])(?:' + src + ')(?![\\p{L}\\p{N}_])';
    return { src: src, flags: 'g' + (state.ic ? 'i' : '') + 'u' };
  }
  function validate(q) {
    if (!q) return { ok: true };
    if (q.length > MAX_PATTERN) return { error: S().tooLong };
    var c = compileSource(q);
    try { new RegExp(c.src, c.flags); } catch (e) { return { error: e.message }; }
    return { ok: true, c: c };
  }
  function flagsText() { return (state.ic ? 'i' : '') + (state.word ? 'w' : '') + 'u'; }

  // ---------- plain-language explanation ----------
  function parse(src) {
    var i = 0;
    function fail() { throw new Error('parse'); }
    function alt() { var b = [seqP()]; while (src[i] === '|') { i++; b.push(seqP()); } return { t: 'alt', b: b }; }
    function seqP() {
      var items = [];
      while (i < src.length && src[i] !== '|' && src[i] !== ')') {
        var a = atom(), q = quant(); items.push(q ? { t: 'q', a: a, q: q } : a);
      }
      return items;
    }
    function quant() {
      var c = src[i], q = null;
      if (c === '*') q = { min: 0, max: Infinity };
      else if (c === '+') q = { min: 1, max: Infinity };
      else if (c === '?') q = { min: 0, max: 1 };
      else if (c === '{') {
        var m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i));
        if (!m) return null;
        q = { min: +m[1], max: m[2] === undefined ? +m[1] : (m[3] === '' ? Infinity : +m[3]) };
        i += m[0].length - 1;
      } else return null;
      i++;
      if (src[i] === '?') { q.lazy = true; i++; }
      return q;
    }
    function atom() {
      var c = src[i];
      if (c === '(') {
        var kind = 'cap', rest = src.slice(i);
        if (/^\(\?:/.test(rest)) { kind = 'nc'; i += 3; } else if (/^\(\?=/.test(rest)) { kind = 'ahead'; i += 3; } else if (/^\(\?!/.test(rest)) { kind = 'nahead'; i += 3; }
        else if (/^\(\?<=/.test(rest)) { kind = 'behind'; i += 4; } else if (/^\(\?<!/.test(rest)) { kind = 'nbehind'; i += 4; }
        else { var nm = /^\(\?<[A-Za-z_]\w*>/.exec(rest); if (nm) i += nm[0].length; else i++; }
        var inner = alt(); if (src[i] !== ')') fail(); i++;
        return { t: 'grp', kind: kind, a: inner };
      }
      if (c === '[') {
        var j = i + 1, neg = false; if (src[j] === '^') { neg = true; j++; }
        var start = j; while (j < src.length && src[j] !== ']') { if (src[j] === '\\') j++; j++; }
        if (j >= src.length) fail();
        var body = src.slice(start, j); i = j + 1; return { t: 'set', neg: neg, body: body };
      }
      if (c === '\\') {
        var n = src[i + 1]; if (n === undefined) fail();
        if ('dDwWsSbB'.indexOf(n) >= 0) { i += 2; return { t: 'cls', k: n }; }
        if ((n === 'p' || n === 'P') && src[i + 2] === '{') { var e = src.indexOf('}', i); if (e < 0) fail(); var pr = src.slice(i + 3, e); i = e + 1; return { t: 'prop', v: pr }; }
        if (/[1-9k]/.test(n)) { if (n === 'k') { var e2 = src.indexOf('>', i); if (e2 < 0) fail(); i = e2 + 1; } else { i += 2; while (/\d/.test(src[i] || '')) i++; } return { t: 'ref' }; }
        i += 2; return { t: 'lit', c: n };
      }
      if (c === '.' || c === '^' || c === '$') { i++; return { t: 'cls', k: c }; }
      if (c === '*' || c === '+' || c === '?') fail();
      i++; return { t: 'lit', c: c };
    }
    var tree = alt(); if (i < src.length) fail();
    return tree;
  }
  function explain(src) {
    var P = S().p, tree;
    try { tree = parse(src); } catch (e) { return null; }
    var CLS = { '.': P.any, d: P.digit, D: P.ndigit, w: P.word, W: P.nword, s: P.space, S: P.nspace, b: P.bound, B: P.nbound, '^': P.start, '$': P.end };
    function renderAlt(n) {
      var parts = n.b.map(renderSeq);
      if (parts.length === 1) return parts[0];
      if (parts.length === 2) return P.either2(parts[0], parts[1]);
      return P.oneOf(parts);
    }
    function renderSeq(items) {
      var out = [], run = '';
      function flush() { if (run) { out.push(P.lit(run)); run = ''; } }
      items.forEach(function (it) { if (it.t === 'lit') run += it.c; else { flush(); out.push(renderItem(it)); } });
      flush();
      return out.join(P.join);
    }
    function renderItem(it) {
      switch (it.t) {
        case 'lit': return P.lit(it.c);
        case 'cls': return CLS[it.k];
        case 'prop': return P.prop(it.v);
        case 'ref': return P.ref;
        case 'set': return it.neg ? P.nset(it.body) : P.set(it.body);
        case 'grp': {
          var inner = renderAlt(it.a);
          if (it.kind === 'ahead') return P.ahead(inner);
          if (it.kind === 'nahead') return P.nahead(inner);
          if (it.kind === 'behind') return P.behind(inner);
          if (it.kind === 'nbehind') return P.nbehind(inner);
          return inner;
        }
        case 'q': {
          var x = it.a.t === 'grp' && it.a.a.b.length > 1 ? P.group(renderItem(it.a)) : renderItem(it.a), q = it.q, r;
          if (q.min === 0 && q.max === 1) r = P.opt(x);
          else if (q.min === 0 && q.max === Infinity) r = P.star(x);
          else if (q.min === 1 && q.max === Infinity) r = P.plus(x);
          else if (q.max === Infinity) r = P.atleast(x, q.min);
          else if (q.min === q.max) r = P.exact(x, q.min);
          else r = P.between(x, q.min, q.max);
          return q.lazy ? r + P.lazy : r;
        }
      }
      return '';
    }
    return renderAlt(tree);
  }
  function explainSentence(q) {
    var P = S().p;
    var body = state.mode === 'regex' ? explain(q) : P.lit(q);
    if (body === null) return null;
    body = body.charAt(0).toUpperCase() + body.slice(1);
    return body + P.end1 + P.sep + (state.ic ? P.icOn : P.icOff) + (state.word ? P.sep + P.wordOn : '');
  }

  // ---------- DOM ----------
  var sections = [], texts = [], titles = [];
  var field, bar, panel, resultsEl, status, regexBtn, clearBtn, builderEl;
  var cancelMain = null, cancelSample = null, debounce = null, last = null, current = null;

  var TOKENS = [
    ['gGroups', [['()', 'group', 1], ['(?:)', 'ncgroup', 1], ['|', 'alt', 0]]],
    ['gChars', [['.', 'any', 0], ['\\d', 'digit', 0], ['\\w', 'word', 0], ['\\s', 'space', 0], ['[]', 'set', 1], ['[^]', 'nset', 1]]],
    ['gCount', [['?', 'opt', 0], ['*', 'star', 0], ['+', 'plus', 0], ['{2,4}', 'range', 0]]],
    ['gAnchor', [['^', 'start', 0], ['$', 'end', 0], ['\\b', 'bound', 0]]],
    ['gText', [['\\.', 'dot', 0], ['\\(', 'par', 0], ['\\\\', 'bs', 0], ['\\/', 'slash', 0]]]
  ];

  function buildChrome() {
    bar.innerHTML =
      '<div class="wrap ds-row">' +
      '<div class="ds-field"><svg class="ds-ico" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>' +
      '<input id="dsField" type="search" autocomplete="off" spellcheck="false" maxlength="' + MAX_PATTERN + '" aria-controls="dsPanel">' +
      '<button type="button" class="ds-clear" id="dsClear" hidden>×</button></div>' +
      '<button type="button" class="ds-btn" id="dsRegex" aria-pressed="false" aria-controls="dsBuilder"><code>.*</code></button>' +
      '<button type="button" class="ds-btn ds-lang" id="dsLang"></button></div>';
    panel.innerHTML =
      '<div class="wrap ds-grid">' +
      '<section class="ds-card ds-builder" id="dsBuilder" hidden><h2 id="dsBTitle"></h2>' +
      '<p class="ds-note" id="dsEngine"></p>' +
      '<div class="ds-flags" role="group" id="dsFlagsGrp"><label class="ds-chk"><input type="checkbox" id="dsIc"> <span id="dsIcL"></span></label><label class="ds-chk"><input type="checkbox" id="dsWord"> <span id="dsWordL"></span></label><code id="dsFlagOut" class="ds-out"></code></div>' +
      '<div id="dsTokens" role="group"></div>' +
      '<div class="ds-row2"><button type="button" class="ds-tbtn ds-wide" id="dsEscape"></button></div>' +
      '<h3 id="dsExT"></h3><p class="ds-explain" id="dsExplain" role="status" aria-live="polite"></p>' +
      '<h3 id="dsSampT"></h3><label class="ds-vh" for="dsSample" id="dsSampL"></label><textarea id="dsSample" rows="2" maxlength="' + MAX_SAMPLE + '"></textarea>' +
      '<pre class="ds-prev" id="dsPrev"></pre><p class="ds-note" id="dsSampStat" role="status" aria-live="polite"></p>' +
      '<p class="ds-err" id="dsErr" role="alert" hidden></p></section>' +
      '<section class="ds-card ds-results" id="dsResultsCard"><h2 id="dsRTitle"></h2><p class="ds-summary" id="dsStatus" role="status" aria-live="polite"></p><div id="dsResults"></div></section></div>';
    field = $('dsField'); resultsEl = $('dsResults'); status = $('dsStatus'); regexBtn = $('dsRegex'); clearBtn = $('dsClear'); builderEl = $('dsBuilder');
    $('dsSample').value = state.sample;
    labelChrome();
  }
  function labelChrome() {
    var s = S();
    bar.lang = panel.lang = state.lang === 'yue' ? 'zh-HK' : 'en';
    field.placeholder = s.placeholder; field.setAttribute('aria-label', s.label);
    clearBtn.setAttribute('aria-label', s.clear); clearBtn.title = s.clear;
    regexBtn.setAttribute('aria-label', s.toggleRegex); regexBtn.title = s.toggleRegex;
    var lb = $('dsLang'); lb.textContent = s.langBtn; lb.setAttribute('aria-label', s.toggleLang); lb.title = s.toggleLang;
    $('dsBTitle').textContent = s.builder; $('dsEngine').textContent = s.engine;
    $('dsFlagsGrp').setAttribute('aria-label', s.flagsTitle); $('dsIcL').textContent = s.ic; $('dsWordL').textContent = s.word;
    $('dsEscape').textContent = s.escapeAll; $('dsExT').textContent = s.explainTitle; $('dsSampT').textContent = s.sampleTitle; $('dsSampL').textContent = s.sampleTitle;
    $('dsRTitle').textContent = s.results;
    var tk = $('dsTokens'); tk.setAttribute('aria-label', s.tokens);
    tk.innerHTML = TOKENS.map(function (g, gi) {
      return '<div class="ds-tgrp"><span class="ds-tlab">' + esc(s[g[0]]) + '</span>' + g[1].map(function (t, ti) {
        return '<button type="button" class="ds-tbtn" data-g="' + gi + '" data-t="' + ti + '" title="' + esc(s.tk[t[1]]) + '" aria-label="' + esc(s.tk[t[1]] + ': ' + t[0]) + '"><code>' + esc(t[0]) + '</code></button>';
      }).join('') + '</div>';
    }).join('');
  }

  function insertToken(tok, back) {
    var a = field.selectionStart == null ? field.value.length : field.selectionStart, b = field.selectionEnd == null ? a : field.selectionEnd;
    var sel = field.value.slice(a, b), ins = tok;
    if (back && sel) ins = tok.slice(0, tok.length - back) + sel + tok.slice(tok.length - back);
    var v = field.value.slice(0, a) + ins + field.value.slice(b);
    if (v.length > MAX_PATTERN) return;
    field.value = v;
    var caret = a + ins.length - (back && !sel ? back : 0);
    setMode('regex', true);
    field.focus(); field.setSelectionRange(caret, caret);
    onChange();
  }

  function setMode(m, silent) {
    state.mode = m;
    regexBtn.setAttribute('aria-pressed', m === 'regex' ? 'true' : 'false');
    regexBtn.classList.toggle('on', m === 'regex');
    builderEl.hidden = m !== 'regex';
    panel.classList.toggle('ds-has-builder', m === 'regex');
    if (!silent) onChange();
  }

  // ---------- search ----------
  function onChange() {
    clearBtn.hidden = !field.value;
    clearTimeout(debounce);
    renderBuilder();
    debounce = setTimeout(runSearch, 110);
  }

  function renderBuilder() {
    if (state.mode !== 'regex') return;
    var q = field.value, v = validate(q), s = S();
    $('dsFlagOut').textContent = '/' + q + '/' + flagsText();
    $('dsIc').checked = state.ic; $('dsWord').checked = state.word;
    var ex = $('dsExplain');
    if (!q) ex.textContent = s.explainEmpty;
    else if (v.error) ex.textContent = s.explainFail;
    else { var t = explainSentence(q); ex.textContent = t === null ? s.explainFail : t; }
    var err = $('dsErr');
    if (v.error) { err.hidden = false; err.textContent = s.invalid + ': ' + v.error; field.setAttribute('aria-invalid', 'true'); field.classList.add('bad'); }
    else { err.hidden = true; err.textContent = ''; field.removeAttribute('aria-invalid'); field.classList.remove('bad'); }
    runSample(q, v);
  }
  function runSample(q, v) {
    if (cancelSample) { cancelSample(); cancelSample = null; }
    var text = $('dsSample').value.slice(0, MAX_SAMPLE), prev = $('dsPrev'), stat = $('dsSampStat'), s = S();
    prev.textContent = text; stat.textContent = '';
    if (!q || v.error) return;
    cancelSample = runJob(v.c.src, v.c.flags, [text], function (res) {
      cancelSample = null;
      if (res.error) return;
      var ms = res.out[0] || [], html = '', pos = 0;
      ms.forEach(function (m) { html += esc(text.slice(pos, m[0])) + '<mark>' + esc(text.substr(m[0], m[1])) + '</mark>'; pos = m[0] + m[1]; });
      prev.innerHTML = html + esc(text.slice(pos));
      stat.textContent = res.cut ? s.sampleCut : s.sampleMatches(ms.length);
    });
  }

  function runSearch() {
    if (cancelMain) { cancelMain(); cancelMain = null; }
    var q = field.value, s = S();
    clearMarks(); current = null; last = null; markToc(null);
    status.classList.remove('ds-warn');
    applyPanelVisibility();
    if (!q) { resultsEl.innerHTML = ''; status.textContent = s.empty; return; }
    var v = validate(q);
    if (v.error) { resultsEl.innerHTML = ''; status.textContent = s.invalid + ': ' + v.error; return; }
    status.textContent = '…';
    cancelMain = runJob(v.c.src, v.c.flags, texts, function (res) {
      cancelMain = null;
      if (field.value !== q) return;
      if (res.error) { resultsEl.innerHTML = ''; status.textContent = S().invalid + ': ' + res.error; return; }
      last = { q: q, res: res };
      renderResults();
    });
  }
  function applyPanelVisibility() {
    panel.hidden = !(field.value || state.mode === 'regex');
    $('dsResultsCard').hidden = !field.value;
  }

  function snippet(text, ms, from) {
    var m = ms[from], a = Math.max(0, m[0] - 46), b = Math.min(text.length, m[0] + m[1] + 70);
    var html = a > 0 ? '…' : '', pos = a;
    for (var i = from; i < ms.length && ms[i][0] < b; i++) {
      var s0 = Math.max(ms[i][0], pos), e0 = Math.min(ms[i][0] + ms[i][1], b);
      if (e0 <= s0) continue;
      html += esc(text.slice(pos, s0).replace(/\s+/g, ' ')) + '<mark>' + esc(text.slice(s0, e0).replace(/\s+/g, ' ')) + '</mark>'; pos = e0;
    }
    return html + esc(text.slice(pos, b).replace(/\s+/g, ' ')) + (b < text.length ? '…' : '');
  }
  function renderResults() {
    var s = S(), res = last.res, groups = [], total = 0;
    res.out.forEach(function (ms, i) { if (ms.length) { groups.push(i); total += ms.length; } });
    markToc(res.out);
    var html = '';
    groups.forEach(function (i) {
      var ms = res.out[i], idx = [];
      for (var k = 0; k < ms.length && idx.length < SNIPPETS; k++) {
        if (!idx.length || ms[k][0] > ms[idx[idx.length - 1]][0] + 120) idx.push(k);
      }
      html += '<article class="ds-group"><h3><button type="button" class="ds-res ds-title" data-sec="' + i + '" data-m="0">' + esc(titles[i]) + ' <span class="ds-n">' + ms.length + '</span></button></h3><ul>' +
        idx.map(function (k) { return '<li><button type="button" class="ds-res" data-sec="' + i + '" data-m="' + k + '">' + snippet(texts[i], ms, k) + '</button></li>'; }).join('') + '</ul>' +
        (ms.length > idx.length ? '<p class="ds-more">' + esc(s.more(ms.length - idx.length)) + '</p>' : '') + '</article>';
    });
    resultsEl.innerHTML = html || '<p class="ds-none">' + esc(s.none) + '</p>';
    var msg = total ? s.count(total, groups.length) : s.none;
    var cutShort = !!(res.cut || res.trunc);
    if (cutShort) msg = msg.replace(/[.。]$/, '') + s.p.end1 + s.p.sep + (res.cut || !res.capped ? s.timeCut : s.capped(MAX_MATCHES));
    status.textContent = msg;
    status.classList.toggle('ds-warn', cutShort);
  }
  function markToc(out) {
    document.querySelectorAll('#tocList a').forEach(function (a) { a.removeAttribute('data-n'); a.classList.remove('ds-dim'); });
    if (!out) return;
    out.forEach(function (ms, i) {
      var a = document.querySelector('#tocList a[href="#' + sections[i].id + '"]');
      if (!a) return;
      if (ms.length) a.setAttribute('data-n', ms.length); else a.classList.add('ds-dim');
    });
  }

  // ---------- highlighting in the article ----------
  function clearMarks() {
    document.querySelectorAll('mark.ds-hit').forEach(function (m) {
      var p = m.parentNode; if (!p) return;
      p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
    });
  }
  function highlight(sec, ms, cur) {
    var walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT, null), nodes = [], n, off = 0;
    while ((n = walker.nextNode())) { nodes.push({ node: n, start: off, len: n.nodeValue.length }); off += n.nodeValue.length; }
    var list = ms.slice(0, MAX_MARKS), curIndex = cur;
    if (cur >= MAX_MARKS) { list = ms.slice(0, MAX_MARKS - 1).concat([ms[cur]]); curIndex = list.length - 1; }
    var curMark = null;
    nodes.forEach(function (nd) {
      var ranges = [];
      list.forEach(function (m, mi) {
        var a = Math.max(m[0], nd.start), b = Math.min(m[0] + m[1], nd.start + nd.len);
        if (a < b) ranges.push([a - nd.start, b - nd.start, mi]);
      });
      ranges.sort(function (x, y) { return y[0] - x[0]; });
      var node = nd.node;
      ranges.forEach(function (r) {
        if (r[1] < node.nodeValue.length) node.splitText(r[1]);
        var mid = r[0] > 0 ? node.splitText(r[0]) : node;
        var mk = document.createElement('mark'); mk.className = 'ds-hit'; mk.setAttribute('data-i', r[2]);
        mid.parentNode.replaceChild(mk, mid); mk.appendChild(mid);
        if (r[2] === curIndex) { mk.classList.add('ds-cur'); curMark = mk; }
      });
    });
    return curMark;
  }
  function openResult(si, mi) {
    if (!last) return;
    var sec = sections[si], ms = last.res.out[si];
    clearMarks();
    var mk = highlight(sec, ms, mi);
    var secTop = sec.getBoundingClientRect().top + window.pageYOffset, top = secTop;
    if (mk) {
      var mTop = mk.getBoundingClientRect().top + window.pageYOffset;
      if (mTop - secTop > window.innerHeight * 0.45) top = mTop - window.innerHeight * 0.3;
    }
    var offset = bar.getBoundingClientRect().height + 12;
    window.scrollTo({ top: Math.max(0, top - offset), behavior: reduced ? 'auto' : 'smooth' });
    current = { si: si, mi: mi };
  }

  // ---------- wiring ----------
  function clearAll() {
    field.value = ''; clearBtn.hidden = true;
    clearTimeout(debounce);
    if (cancelMain) { cancelMain(); cancelMain = null; }
    clearMarks(); markToc(null); last = null; current = null;
    resultsEl.innerHTML = ''; status.textContent = S().empty; status.classList.remove('ds-warn');
    renderBuilder(); applyPanelVisibility();
  }
  function moveFocus(dir) {
    var list = Array.prototype.slice.call(resultsEl.querySelectorAll('.ds-res'));
    if (!list.length) return false;
    var i = list.indexOf(document.activeElement);
    if (i === 0 && dir < 0) { field.focus(); return true; }
    if (i < 0) i = dir > 0 ? -1 : list.length;
    list[Math.min(list.length - 1, Math.max(0, i + dir))].focus();
    return true;
  }

  function init() {
    sections = Array.prototype.slice.call(document.querySelectorAll('#articles section'));
    texts = sections.map(function (s) { return s.textContent; });
    titles = sections.map(function (s) { var h = s.querySelector('h2'); return h ? h.textContent : s.id; });
    bar = $('dsBar'); panel = $('dsPanel');
    buildChrome();
    status.textContent = S().empty;

    field.addEventListener('input', onChange);
    clearBtn.addEventListener('click', function () { clearAll(); field.focus(); });
    regexBtn.addEventListener('click', function () { setMode(state.mode === 'regex' ? 'plain' : 'regex'); applyPanelVisibility(); });
    $('dsLang').addEventListener('click', function () {
      state.lang = state.lang === 'en' ? 'yue' : 'en'; persist(); labelChrome();
      if (last) renderResults(); else status.textContent = S().empty;
      renderBuilder();
    });
    $('dsIc').addEventListener('change', function (e) { state.ic = e.target.checked; onChange(); });
    $('dsWord').addEventListener('change', function (e) { state.word = e.target.checked; onChange(); });
    $('dsTokens').addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]'); if (!b) return;
      var t = TOKENS[+b.dataset.g][1][+b.dataset.t]; insertToken(t[0], t[2] || 0);
    });
    $('dsEscape').addEventListener('click', function () { field.value = escRe(field.value).slice(0, MAX_PATTERN); onChange(); field.focus(); });
    $('dsSample').addEventListener('input', function (e) { state.sample = e.target.value.slice(0, MAX_SAMPLE); persist(); renderBuilder(); });
    resultsEl.addEventListener('click', function (e) { var b = e.target.closest('.ds-res'); if (b) openResult(+b.dataset.sec, +b.dataset.m); });
    document.addEventListener('keydown', function (e) {
      var inRes = resultsEl.contains(e.target);
      if (e.key === 'Escape' && (bar.contains(e.target) || panel.contains(e.target))) {
        if (field.value || current) { e.preventDefault(); clearAll(); field.focus(); }
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (e.target === field || inRes)) {
        if (moveFocus(e.key === 'ArrowDown' ? 1 : -1)) e.preventDefault();
      } else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName || '') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); field.focus(); }
    });
    setMode('plain', true);
    applyPanelVisibility();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
