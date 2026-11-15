'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const S = window.setup;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = { step: 0, port: 8080, tag: 'latest', lang: 'en', done: [false, false, false, false, false] };
  let busy = false, result = {}, resumedNote = false;
  const t = (k) => { const en = window.WI18N.en[k] ?? k, yue = window.WI18N.yue[k] ?? en; return st.lang === 'yue' ? yue : st.lang === 'both' ? (en === yue ? en : en + ' · ' + yue) : en; };
  const save = () => S.saveState({ step: st.step, port: st.port, tag: st.tag, lang: st.lang });
  const log = $('log');
  S.onLog((s) => { log.hidden = false; log.textContent = (log.textContent + s).slice(-8000); log.scrollTop = log.scrollHeight; });
  const check = (ok, text, extra) => `<li class="${ok ? 'ok' : 'bad'}"><span class="dot" aria-hidden="true">${ok ? '&#10003;' : '!'}</span><span>${esc(text)}${extra || ''}</span></li>`;
  const spinner = (text) => `<div class="row"><span class="spin" aria-hidden="true"></span><span>${esc(text)}</span></div>`;

  const steps = [
    { key: 's0', async run() {
      setPane(spinner(t('checking')));
      const r = await S.check(); result.check = r;
      st.done[0] = !!(r.engine && r.compose);
      let h = '<ul class="checks">' + check(r.cli, t('dockerCli')) + check(!!r.engine, t('dockerEngine') + (r.engine ? ' ' + r.engine : '')) + check(!!r.compose, t('dockerCompose') + (r.compose ? ' ' + r.compose : '')) + '</ul>';
      if (!r.cli) h += `<p class="err">${esc(t('dockerCli'))}: ${esc(t('notFound'))}</p><div class="row"><button type="button" data-act="getDocker">${esc(t('getDocker'))}</button></div>`;
      else if (!r.engine) h += `<p class="err">${esc(t('startDocker'))}</p>`;
      h += `<div class="row"><button type="button" data-act="recheck">${esc(t('checkAgain'))}</button></div>`;
      setPane(h);
    } },
    { key: 's1', async run() {
      setPane(`<label class="field"><span>${esc(t('port'))}</span><input id="port" type="number" min="1024" max="65535" step="1" value="${st.port}" inputmode="numeric"></label>
        <label class="field"><span>${esc(t('tag'))}</span><input id="tag" type="text" maxlength="128" value="${esc(st.tag)}" spellcheck="false"></label>
        <p class="hint" id="portMsg" role="status"></p>`);
      const validate = async () => {
        const n = Number($('port').value); const msg = $('portMsg'); msg.classList.remove('err');
        st.port = n; st.tag = $('tag').value.trim() || 'latest'; save();
        if (!Number.isInteger(n) || n < 1024 || n > 65535) { msg.textContent = t('portRange'); msg.classList.add('err'); st.done[1] = false; return render(false); }
        const free = await S.portFree(n);
        if (free.ok) { msg.textContent = t('portOk'); st.done[1] = true; }
        else { const ours = await S.existing(); if (ours.includes(':' + n + '->')) { msg.textContent = t('portOurs'); st.done[1] = true; } else { msg.textContent = t('portBusy'); msg.classList.add('err'); st.done[1] = false; } }
        render(false);
      };
      $('port').addEventListener('input', validate); $('tag').addEventListener('input', validate);
      await validate();
    } },
    { key: 's2', async run() {
      log.textContent = ''; setPane(spinner(t('downloading')));
      const r = await S.pull(st.tag); st.done[2] = r.ok;
      setPane(r.ok ? '<ul class="checks">' + check(true, t('downloaded')) + '</ul>' + (r.digest ? `<p class="hint">${esc(t('digest'))}: <code>${esc(r.digest)}</code></p>` : '')
        : `<p class="err">${esc(t('downloadFailed'))}</p><div class="row"><button type="button" data-act="rerun">${esc(t('retry'))}</button></div>`);
    } },
    { key: 's3', async run() {
      log.textContent = ''; setPane(spinner(t('starting')));
      const r = await S.start(st.port, st.tag);
      if (!r.ok) { st.done[3] = false; setPane(`<p class="err">${esc(t('startFailed'))}</p><div class="row"><button type="button" data-act="rerun">${esc(t('retry'))}</button></div>`); return; }
      setPane('<ul class="checks">' + check(true, t('started')) + '</ul>' + spinner(t('checking')));
      const h = await S.health(st.port); result.health = h; st.done[3] = h.ok;
      setPane(h.ok ? '<ul class="checks">' + check(true, t('started')) + check(true, `${t('healthy')} ${h.seconds} ${t('seconds')}`) + '</ul>'
        : `<p class="err">${esc(t('healthFailed'))}</p><div class="row"><button type="button" data-act="rerun">${esc(t('retry'))}</button></div>`);
    } },
    { key: 's4', title: 's4title', async run() {
      st.done[4] = true;
      const h = result.health || (await S.health(st.port)); result.health = h;
      const reach = (h && h.reach) || []; const best = reach.find((r) => r.ok) || reach[0];
      const url = best ? `http://${best.ip}:${st.port}/` : '';
      const local = `http://127.0.0.1:${st.port}/`;
      let html = '<div class="card">';
      if (url) html += `<span class="hint">${esc(t('address'))}</span><span class="addr" id="addr">${esc(url)}</span>`;
      else html += `<p class="hint">${esc(t('noLan'))}</p>`;
      html += `<span class="hint">${esc(t('thisComputer'))}: ${esc(local)}</span><div class="row"><button type="button" class="primary" data-act="open" data-url="${esc(url || local)}">${esc(t('openBrowser'))}</button><button type="button" data-act="copy" data-url="${esc(url || local)}">${esc(t('copy'))}</button></div></div>`;
      html += '<ul class="checks">' + check(true, t('dockerEngine')) + check(true, t('downloaded')) + check(!!(h && h.ok), `${t('healthy')} ${h && h.seconds != null ? h.seconds : '-'} ${t('seconds')}`)
        + reach.map((r) => check(r.ok, r.ok ? `${t('reachable')}: ${r.ip}` : `${t('notReachable')} ${st.port} (${r.ip})`)).join('') + '</ul>';
      html += `<p class="hint">${esc(t('hostBat'))}</p><div class="row"><button type="button" data-act="stop">${esc(t('stop'))}</button></div><p class="hint" id="stopMsg" role="status"></p>`;
      setPane(html);
    } }
  ];

  function setPane(html) { $('pane').innerHTML = html; }
  function render(runStep) {
    document.documentElement.lang = st.lang === 'yue' ? 'yue-Hant' : 'en';
    document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = t(n.dataset.t); });
    const s = steps[st.step];
    $('steps').innerHTML = steps.map((x, i) => `<li class="${i === st.step ? 'on' : st.done[i] && i < st.step ? 'done' : ''}"${i === st.step ? ' aria-current="step"' : ''}><span class="dot" aria-hidden="true">${st.done[i] && i < st.step ? '&#10003;' : i + 1}</span><span class="t">${esc(t(x.key))}</span></li>`).join('');
    $('title').textContent = t(s.title || s.key);
    $('lead').textContent = (resumedNote ? t('resumed') + ' ' : '') + t(s.key + 'lead');
    $('stepOf').textContent = st.lang === 'en' ? `${t('step')} ${st.step + 1} ${t('of')} ${steps.length}` : `${t('step')} ${st.step + 1} ${t('of')} ${steps.length}`;
    $('back').disabled = busy || st.step === 0;
    $('next').disabled = busy || !st.done[st.step];
    $('next').textContent = st.step === steps.length - 1 ? t('finish') : t('next');
    if (runStep) runCurrent();
  }
  async function runCurrent() {
    busy = true; render(false);
    try { await steps[st.step].run(); } finally { busy = false; render(false); }
  }
  function go(i) { st.step = Math.max(0, Math.min(steps.length - 1, i)); resumedNote = false; save(); log.hidden = true; render(true); $('title').focus(); }

  $('next').addEventListener('click', () => { if (st.step === steps.length - 1) S.quit(); else go(st.step + 1); });
  $('back').addEventListener('click', () => go(st.step - 1));
  $('cancel').addEventListener('click', async () => { if (!busy || confirm(t('confirmCancel'))) { await S.cancelRun(); S.quit(); } });
  $('lang').addEventListener('change', (e) => { st.lang = e.target.value; save(); render(false); });
  $('pane').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'recheck' || a === 'rerun') runCurrent();
    else if (a === 'getDocker') S.open('https://www.docker.com/products/docker-desktop/');
    else if (a === 'open') S.open(b.dataset.url);
    else if (a === 'copy') { await S.copy(b.dataset.url); b.textContent = t('copied'); }
    else if (a === 'stop') { b.disabled = true; const r = await S.stop(st.port, st.tag); $('stopMsg').textContent = r.ok ? t('stopped') : t('startFailed'); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('cancel').click(); });

  (async () => {
    const saved = await S.loadState();
    if (saved) { st.port = saved.port || 8080; st.tag = saved.tag || 'latest'; st.lang = saved.lang || 'en'; resumedNote = (saved.step || 0) > 0; }
    $('lang').value = st.lang;
    $('ver').textContent = 'Version ' + (await S.version());
    // Steps after the first need a fresh Docker check, so resume always re-checks first, then
    // moves on to the saved step once each earlier step passes again.
    const target = Math.min((saved && saved.step) || 0, 1);
    st.step = 0; render(false); await runCurrent();
    if (target > 0 && st.done[0]) go(target);
  })();
})();
