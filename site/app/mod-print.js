// mod-print.js: print layout dialog and vector PDF export. See docs/features/print.md.
// jsPDF and svg2pdf.js are vendored in vendor/ and loaded only when the first PDF is made.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  const hooks = (n) => (X[n] = X[n] || []);

  window.I18N.add({
    printLayout: 'Print layout', printMenu: 'Print layout (vector PDF)', paper: 'Paper', orientation: 'Orientation',
    portrait: 'Portrait', landscape: 'Landscape', marginMm: 'Margin (mm)', printTitle: 'Title', printSubtitle: 'Subtitle',
    legendPos: 'Legend', lp_br: 'Bottom right', lp_bl: 'Bottom left', lp_tr: 'Top right', lp_none: 'No legend',
    vectorNote: 'Vector PDF · labels stay sharp', cancel: 'Cancel', exportPdfBtn: 'Export PDF', printPreview: 'Page preview',
    printCjk: 'Chinese labels use the image PDF so the characters stay correct',
    printFailed: 'Could not make the PDF', printNoTiles: 'Map background tiles could not be added to the PDF'
  }, {
    printLayout: '列印版面', printMenu: '列印版面（向量 PDF）', paper: '紙張', orientation: '方向',
    portrait: '直向', landscape: '橫向', marginMm: '邊距（毫米）', printTitle: '標題', printSubtitle: '副標題',
    legendPos: '圖例', lp_br: '右下', lp_bl: '左下', lp_tr: '右上', lp_none: '唔要圖例',
    vectorNote: '向量 PDF · 文字放大都清晰', cancel: '取消', exportPdfBtn: '匯出 PDF', printPreview: '頁面預覽',
    printCjk: '有中文標籤，改用圖像 PDF 確保字形正確',
    printFailed: '做唔到 PDF', printNoTiles: '背景地圖磚加唔到入 PDF'
  });

  // Paper sizes in millimetres, portrait (width, height).
  const PAPERS = {
    A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297],
    Letter: [215.9, 279.4], Tabloid: [279.4, 431.8]
  };
  const PAPER_LABEL = { A0: 'A0, 841 x 1189 mm', A1: 'A1, 594 x 841 mm', A2: 'A2, 420 x 594 mm', A3: 'A3, 297 x 420 mm', A4: 'A4, 210 x 297 mm', Letter: 'Letter, 8.5 x 11 in', Tabloid: 'Tabloid, 11 x 17 in' };
  const LEGENDS = ['br', 'bl', 'tr', 'none'];
  const STORE = 'gmmc.print.v1';
  const CJK = /[⺀-鿿豈-﫿＀-￯]/;
  const $ = (id) => document.getElementById(id);

  let opts = { paper: 'A3', landscape: true, margin: 12, subtitle: '', legend: 'br' };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(STORE)) || {}); } catch { /* defaults */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ paper: opts.paper, landscape: opts.landscape, margin: opts.margin, subtitle: opts.subtitle, legend: opts.legend })); } catch { /* storage unavailable */ } };
  let titleText = '';

  function clean() {
    if (!PAPERS[opts.paper]) opts.paper = 'A3';
    opts.landscape = opts.landscape !== false;
    const m = +opts.margin; opts.margin = Number.isFinite(m) ? Math.min(50, Math.max(0, m)) : 12;
    if (!LEGENDS.includes(opts.legend)) opts.legend = 'br';
    opts.subtitle = String(opts.subtitle || '').slice(0, 160);
  }
  function pageSize() {
    const [a, b] = PAPERS[opts.paper];
    return opts.landscape ? [Math.max(a, b), Math.min(a, b)] : [Math.min(a, b), Math.max(a, b)];
  }
  function theme() {
    let r = null;
    for (const f of hooks('exportTheme')) { try { r = f() || r; if (r) break; } catch { /* skipped */ } }
    return Object.assign({ bg: '#FFFFFF', ink: '#16181D', halo: '#FFFFFF', sub: '#545249', tileFilter: '' }, r || {});
  }
  function lineStyled(l, m) { let ls = l; for (const f of hooks('lineStyle')) { try { ls = f(ls, m) || ls; } catch { /* skipped */ } } return ls; }

  /** The station labels get a halo drawn as a second text element underneath, which any PDF renderer handles. */
  function haloText(svg, th) {
    return svg.replace(/<text class="st-label"([^>]*)>([\s\S]*?)<\/text>/g, (all, attrs, body) => {
      const ink = (/ fill="([^"]*)"/.exec(attrs) || [])[1] || th.ink;
      const a = attrs.replace(/ fill="[^"]*"/, '').replace(/ stroke="[^"]*"/, '');
      return `<text${a} fill="${th.halo}" stroke="${th.halo}" stroke-width="4" stroke-linejoin="round">${body}</text><text${a} fill="${ink}" stroke="none">${body}</text>`;
    });
  }

  /** The whole page as SVG in millimetres: title block, map fitted inside the margins, legend. */
  function buildPage(tileData) {
    const G = window.GMMC, esc = G.esc, th = theme();
    const [W, H] = pageSize(), M = opts.margin;
    const sc = G.exportScene();
    const ts = Math.min(W, H) * 0.034, ss = ts * 0.45, lf = Math.min(5, Math.max(2.6, Math.min(W, H) * 0.0125));
    const gap = Math.min(W, H) * 0.012;
    const titleH = (titleText ? ts * 1.15 : 0) + (opts.subtitle ? ss * 1.5 : 0) + ((titleText || opts.subtitle) ? gap : 0);

    // legend metrics
    const lines = opts.legend === 'none' ? [] : sc.vis;
    const entries = lines.map((l) => {
      const f = G.freqText(l), txt = `${G.lineName(l)} · ${G.t('style_' + l.style)}${f ? ' · ' + G.t('every') + ' ' + f : ''}`;
      return { l, txt, w: txt.length * lf * 0.55 };
    });
    const entryH = lf * 1.9, sampleW = lf * 4.4;
    const colW = Math.max(0, ...entries.map((e) => e.w)) + sampleW + lf * 1.8;
    const availW = W - 2 * M;
    const cols = entries.length ? Math.max(1, Math.min(entries.length, 4, Math.floor(availW / colW))) : 0;
    const rows = cols ? Math.ceil(entries.length / cols) : 0;
    const legendH = cols ? lf * 2.2 + rows * entryH : 0, legendW = cols * colW;

    const topReserve = M + titleH + (opts.legend === 'tr' && cols ? legendH + gap : 0);
    const bottomReserve = M + (cols && opts.legend !== 'tr' ? legendH + gap : 0);
    const aw = Math.max(10, W - 2 * M), ah = Math.max(10, H - topReserve - bottomReserve);
    const pad = 80, b = sc.b;
    const rx0 = b.x0 - pad, ry0 = b.y0 - pad, rw = b.x1 - b.x0 + pad * 2, rh = b.y1 - b.y0 + pad * 2;
    const s = Math.min(aw / rw, ah / rh);
    const ox = M + (aw - rw * s) / 2, oy = topReserve + (ah - rh * s) / 2;

    let tiles = '';
    if (tileData && !th.tileFilter) for (const ti of sc.tiles) { const d = tileData.get(ti.url); if (d) tiles += `<image href="${d}" x="${ti.x.toFixed(1)}" y="${ti.y.toFixed(1)}" width="${(ti.s + 0.6).toFixed(1)}" height="${(ti.s + 0.6).toFixed(1)}" preserveAspectRatio="none" opacity="${G.getSettings().bgOpacity}"/>`; }

    let out = `<rect x="0" y="0" width="${W}" height="${H}" fill="${th.bg}"/>`;
    if (titleText) out += `<text x="${M}" y="${(M + ts * 0.9).toFixed(2)}" font-size="${ts.toFixed(2)}" font-weight="700" fill="${th.ink}">${esc(titleText)}</text>`;
    if (opts.subtitle) out += `<text x="${M}" y="${(M + (titleText ? ts * 1.15 : 0) + ss * 1.05).toFixed(2)}" font-size="${ss.toFixed(2)}" fill="${th.sub}">${esc(opts.subtitle)}</text>`;
    out += `<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${s.toFixed(5)}) translate(${(-rx0).toFixed(1)} ${(-ry0).toFixed(1)})"><clipPath id="prClip"><rect x="${rx0.toFixed(1)}" y="${ry0.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}"/></clipPath><g clip-path="url(#prClip)">${tiles}${haloText(sc.svg, th)}</g></g>`;

    if (cols) {
      const lx = opts.legend === 'bl' ? M : W - M - legendW;
      const ly = opts.legend === 'tr' ? M + titleH : H - M - legendH;
      const maxW = Math.max(1, ...entries.map((e) => lineStyled(e.l, G.getMap()).width));
      const ks = Math.min(s, (lf * 0.95) / maxW);
      out += `<text x="${lx.toFixed(2)}" y="${(ly + lf).toFixed(2)}" font-size="${(lf * 1.2).toFixed(2)}" font-weight="700" fill="${th.ink}">${esc(G.t('legendTitle'))}</text>`;
      entries.forEach((e, i) => {
        const col = Math.floor(i / rows), row = i % rows;
        const x = lx + col * colW, y = ly + lf * 2.2 + row * entryH + entryH * 0.62;
        out += `<g transform="translate(${x.toFixed(2)} ${(y - lf * 0.3).toFixed(2)}) scale(${ks.toFixed(5)})">${G.linePaths(lineStyled(e.l, G.getMap()), `M0 0L${(sampleW / ks).toFixed(1)} 0`)}</g>`;
        out += `<text x="${(x + sampleW + lf * 0.6).toFixed(2)}" y="${y.toFixed(2)}" font-size="${lf.toFixed(2)}" fill="${th.ink}">${esc(e.txt)}</text>`;
      });
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">${out}</svg>`;
    return { svg, W, H, cjk: CJK.test(out) };
  }

  // ---------- dialog ----------
  function buildDialog() {
    const dlg = document.createElement('dialog');
    dlg.id = 'printDialog'; dlg.setAttribute('aria-labelledby', 'prTitle');
    dlg.innerHTML = `<form method="dialog" class="dialog-body pr-body">
      <h2 id="prTitle" class="headline" data-pr="printLayout"></h2>
      <div class="pr-top">
        <div class="pr-prev" id="prPrev" role="img" data-pr-aria="printPreview"></div>
        <div class="pr-side">
          <label class="tf"><span class="tf-label" data-pr="paper"></span><span class="tf-select"><select id="prPaper"></select><span data-ic="arrow_drop_down"></span></span></label>
          <div class="segmented pr-seg" role="group" data-pr-aria="orientation" id="prOrient">
            <button type="button" data-o="portrait" aria-pressed="false"><span class="seg-check" data-ic="check"></span><span data-pr="portrait"></span></button>
            <button type="button" data-o="landscape" aria-pressed="true"><span class="seg-check" data-ic="check"></span><span data-pr="landscape"></span></button>
          </div>
          <label class="tf"><span class="tf-label" data-pr="marginMm"></span><input id="prMargin" type="number" min="0" max="50" step="1" inputmode="numeric"></label>
        </div>
      </div>
      <label class="tf"><span class="tf-label" data-pr="printTitle"></span><input id="prTitleIn" type="text" maxlength="120"></label>
      <div class="two">
        <label class="tf"><span class="tf-label" data-pr="printSubtitle"></span><input id="prSub" type="text" maxlength="160"></label>
        <label class="tf"><span class="tf-label" data-pr="legendPos"></span><span class="tf-select"><select id="prLegend"></select><span data-ic="arrow_drop_down"></span></span></label>
      </div>
      <div class="row pr-foot">
        <p class="supporting grow" id="prNote"></p>
        <button value="cancel" class="btn text" id="prCancel" data-pr="cancel"></button>
        <button type="button" class="btn filled" id="prExport" data-pr="exportPdfBtn"></button>
      </div></form>`;
    document.body.appendChild(dlg);
    if (window.icon) dlg.querySelectorAll('[data-ic]').forEach((n) => { n.innerHTML = window.icon(n.dataset.ic, 18); });
    return dlg;
  }
  let timer = 0;
  function labels() {
    const G = window.GMMC, dlg = $('printDialog'); if (!dlg) return;
    dlg.querySelectorAll('[data-pr]').forEach((n) => { n.textContent = G.t(n.dataset.pr); });
    dlg.querySelectorAll('[data-pr-aria]').forEach((n) => n.setAttribute('aria-label', G.t(n.dataset.prAria)));
    $('prNote').textContent = G.t('vectorNote');
    const paper = $('prPaper'); paper.innerHTML = Object.keys(PAPERS).map((k) => `<option value="${k}">${G.esc(PAPER_LABEL[k])}</option>`).join('');
    const lg = $('prLegend'); lg.innerHTML = LEGENDS.map((k) => `<option value="${k}">${G.esc(G.t('lp_' + k))}</option>`).join('');
    sync();
  }
  function sync() {
    $('prPaper').value = opts.paper; $('prLegend').value = opts.legend; $('prMargin').value = opts.margin; $('prSub').value = opts.subtitle; $('prTitleIn').value = titleText;
    $('prOrient').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.o === 'landscape') === opts.landscape)));
  }
  function preview() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        clean();
        const p = buildPage(null), box = $('prPrev');
        const [W, H] = pageSize(), k = Math.min(230 / W, 190 / H);
        box.style.width = Math.round(W * k) + 'px'; box.style.height = Math.round(H * k) + 'px';
        box.innerHTML = p.svg.replace(/ width="[^"]*" height="[^"]*" font-family/, ' width="100%" height="100%" font-family');
      } catch (err) { console.error('print preview', err); }
    }, 90);
  }
  function openDialog() {
    const G = window.GMMC, m = G.getMap(), lang = G.getSettings().lang;
    titleText = m.title + (lang !== 'en' && m.titleZh ? ' · ' + m.titleZh : '');
    clean();
    const dlg = $('printDialog') || buildDialog();
    if (!dlg.dataset.wired) { dlg.dataset.wired = '1'; wire(dlg); }
    labels(); preview();
    $('exportMenu').hidden = true;
    dlg.showModal();
  }
  function wire(dlg) {
    dlg.addEventListener('input', (e) => {
      if (e.target.id === 'prPaper') opts.paper = e.target.value;
      else if (e.target.id === 'prLegend') opts.legend = e.target.value;
      else if (e.target.id === 'prMargin') opts.margin = e.target.value === '' ? 12 : +e.target.value;
      else if (e.target.id === 'prSub') opts.subtitle = e.target.value;
      else if (e.target.id === 'prTitleIn') titleText = e.target.value;
      else return;
      clean(); save(); preview();
    });
    $('prOrient').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      opts.landscape = b.dataset.o === 'landscape'; save(); sync(); preview();
    });
    $('prExport').addEventListener('click', exportPdf);
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); exportPdf(); } });
  }

  // ---------- export ----------
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
  }
  let libs = null;
  function loadLibs() {
    if (window.jspdf && window.svg2pdf) return Promise.resolve();
    if (!libs) libs = loadScript('vendor/jspdf.umd.min.js').then(() => loadScript('vendor/svg2pdf.umd.min.js')).catch((e) => { libs = null; throw e; });
    return libs;
  }
  async function tileData(scene) {
    const out = new Map();
    await Promise.all(scene.tiles.map(async (ti) => {
      try {
        const r = await fetch(ti.url); if (!r.ok) return;
        const blob = await r.blob();
        out.set(ti.url, await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(blob); }));
      } catch { /* tile skipped */ }
    }));
    return out;
  }
  const slug = (s) => (s || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
  /** Builds the vector PDF; returns a Blob. Exposed so verification can read the bytes. */
  async function makePdf() {
    const G = window.GMMC;
    clean();
    let data = null;
    const sc = G.exportScene();
    if (sc.tiles.length && !theme().tileFilter) { data = await tileData(sc); if (data.size < sc.tiles.length) G.toast(G.t(data.size ? 'tilesPartial' : 'printNoTiles')); }
    const page = buildPage(data);
    if (page.cjk) return { fallback: true };
    await loadLibs();
    const { jsPDF } = window.jspdf;
    const [W, H] = pageSize();
    const doc = new jsPDF({ unit: 'mm', format: [Math.min(W, H), Math.max(W, H)], orientation: W >= H ? 'landscape' : 'portrait', compress: true });
    doc.setProperties({ title: titleText || G.getMap().title });
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden';
    host.innerHTML = page.svg; document.body.appendChild(host);
    try {
      const fn = window.svg2pdf.svg2pdf || window.svg2pdf;
      await fn(host.firstElementChild, doc, { x: 0, y: 0, width: W, height: H });
    } finally { host.remove(); }
    return { blob: doc.output('blob'), name: slug(G.getMap().title) + '-' + opts.paper.toLowerCase() + '.pdf' };
  }
  async function exportPdf() {
    const G = window.GMMC, btn = $('prExport');
    btn.disabled = true; $('progress').hidden = false;
    try {
      const r = await makePdf();
      if (r.fallback) { G.toast(G.t('printCjk')); $('printDialog').close(); await G.exportAct('pdf'); return; }
      G.download(r.name, r.blob); G.beep(784); G.toast(G.t('exported'));
      $('printDialog').close();
    } catch (err) { console.error('print export', err); G.toast(G.t('printFailed')); G.beep(180); }
    finally { btn.disabled = false; $('progress').hidden = true; }
  }

  hooks('click').push((e) => {
    const b = e.target.closest && e.target.closest('#printMenuBtn');
    if (!b) return false;
    openDialog(); return true;
  });
  hooks('ready').push((G) => {
    const menu = $('exportMenu');
    if (menu && !$('printMenuBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.id = 'printMenuBtn'; btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `<span data-ic="picture_as_pdf"></span><span data-t="printMenu">${G.esc(G.t('printMenu'))}</span>`;
      if (window.icon) btn.firstChild.innerHTML = window.icon('picture_as_pdf', 24);
      const pdf = menu.querySelector('[data-act="pdf"]');
      menu.insertBefore(btn, pdf ? pdf.nextSibling : null);
    }
  });
  hooks('afterRender').push(() => { const d = $('printDialog'); if (d && d.open) labels(); });
  window.GMMCPrint = { makePdf, buildPage, open: () => openDialog(), options: () => Object.assign({}, opts), setOptions: (o) => { Object.assign(opts, o); clean(); save(); } };
})();
