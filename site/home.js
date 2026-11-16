// Home page: feature showcase tabs, English and Cantonese, theme, menu, reveal motion.
(function () {
  'use strict';
  var FEATURES = [
    { k: 'trip', icon: 'route', img: 'assets/trip.webp', en: ['Trip planner', 'Fastest trips on your own network, with waits from your frequencies and a travel-time map.'], yue: ['行程規劃', '喺你自己嘅網絡搵最快路線，按班次計等車時間，仲有到達時間地圖。'] },
    { k: 'scenarios', icon: 'swap_horiz', img: 'assets/scenarios.webp', en: ['Scenarios and compare', 'Keep several versions of the network, swipe between them and read the change list.'], yue: ['方案同比較', '保存幾個版本嘅網絡，左右撥動比較，再睇改動清單。'] },
    { k: 'coverage', icon: 'my_location', img: 'assets/coverage.webp', en: ['Coverage', 'People within 400 m and 800 m of stations, from Statistics Canada 2021 Census data.'], yue: ['覆蓋範圍', '用加拿大統計局 2021 年人口普查，計車站 400 米同 800 米內住咗幾多人。'] },
    { k: 'simulate', icon: 'schedule', img: 'assets/simulate.webp', en: ['Live simulation', 'Watch vehicles run at your speeds and frequencies, then record a clip.'], yue: ['即時模擬', '睇住列車按你設定嘅速度同班次行，仲可以錄短片。'] },
    { k: 'schematic', icon: 'conversion_path', img: 'assets/schematic.webp', en: ['Auto-schematic', 'One click turns real positions into a clean 45-degree diagram.'], yue: ['自動示意圖', '一撳就將真實位置變成整齊嘅 45 度示意圖。'] },
    { k: 'ridership', icon: 'directions_bus', img: 'assets/ridership.webp', en: ['Ridership estimate', 'Lines drawn wider where more people would ride. An illustrative estimate, not a forecast.'], yue: ['客量估算', '多人搭嘅路段畫粗啲。只係示意估算，唔係預測。'] },
    { k: 'night', icon: 'layers', img: 'assets/night.webp', en: ['Map styles', 'Material, Classic metro, Frequent network and Night, ready for print.'], yue: ['地圖風格', 'Material、經典地鐵、高頻網絡同夜間，隨時可以列印。'] },
    { k: 'timeline', icon: 'explore', img: 'assets/timeline.webp', en: ['Network timeline', 'Slide through the years and watch the network grow since 1954.'], yue: ['網絡時間線', '拉動年份，睇住網絡由 1954 年開始點樣擴展。'] }
  ];
  var YUE = {
    skip: '跳到內容', navFeatures: '功能', navGuides: '指南', navGet: '下載', navDocs: '說明文件', navGtfs: 'GTFS 檢視器', g6b: '開 GTFS 檢視器 →', navSource: '原始碼',
    new: '新', eyebrow: '方案、模擬同覆蓋範圍', h1a: '設計大多倫多同咸美頓嘅', h1b: '交通未來',
    lead: '喺真實地圖上畫地鐵、輕鐵、GO 同巴士路線。規劃行程、比較方案、睇吓車站附近住咗幾多人，再發佈去任何地方。全部喺瀏覽器運行，你嘅地圖唔會離開你部電腦。',
    open: '打開編輯器', download: '下載 Windows 版', sStations: '個車站同站點', sRoutes: '條範本路線', sPeople: '人口普查人數', sServers: '個伺服器',
    float1: 'OpenStreetMap 真實站點', float2: 'GTFS 嘅 VIVA 班次',
    k1: '功能', featuresH: '係規劃工作室，唔只係畫圖工具', featuresP: '下面每個畫面都係而家編輯器嘅真實截圖。',
    k2: '仲有', moreH: '交通迷在意嘅細節，全部有齊',
    b1h: '真實地理或者整齊示意圖', b1p: '喺 OpenStreetMap 上面畫，再一撳拉直做 45 度線，每個站次序不變。', chip45: '45° 自動示意圖', chipShared: '共用路軌',
    b2h: '按時段嘅班次', b2p: '繁忙、日間、晚間同週末班距，快車跳站同支線。',
    b3h: 'GTFS 匯入匯出', b3p: '匯入任何營運商嘅資料，喺你部電腦處理，或者將你嘅方案匯出成有效資料。',
    b4h: '可列印向量 PDF', b4p: 'A0 至 A4，有標題、圖例同四款風格。仲有 PNG、SVG 同可架設網頁。',
    b5h: '車站設施', b5p: '無障礙、泊車、單車、機場、渡輪同巴士總站圖示，仲有比例尺同指北針。',
    b6h: '即時車輛', b6p: '桌面版可以喺你嘅地圖上顯示 TTC 同 YRT 車輛真實位置。',
    b7h: '編輯快手', b7p: '指令面板、框選、複製貼上、復原記錄、附產生器嘅正規表示式搜尋。',
    b8h: '英文、廣東話或者兩樣都要', b8p: '雙語站名同完整翻譯介面，淺色或深色，支援鍵盤同減少動畫。', chipDark: '深色主題',
    k3: '指南', tasksH: '由一件工作開始',
    g1h: '加車站', g1p: '撳地圖，或者放大後撳真實站點加入。', g1a: '真實站點指南 →',
    g2h: '畫路線', g2p: '順序撳車站；共用路軌會自動並排。', g2a: '路線指南 →',
    g3h: '規劃行程', g3p: '按你嘅班次計等車，搵最快路線，仲有到達時間地圖。', g3a: '行程指南 →',
    g4h: '比較方案', g4p: '將今日同 2031 並排，撥動比較同睇改動清單。', g4a: '方案指南 →',
    g5h: '查覆蓋範圍', g5p: '用 2021 年人口普查計每個站 400 米同 800 米內嘅人。', g5a: '覆蓋範圍指南 →',
    g6h: '匯入 GTFS', g6p: '由任何營運商帶入真實路線、站點同班距。', g6a: 'GTFS 指南 →',
    g7h: '列印', g7p: '揀風格同紙張大細，得到清晰向量 PDF。', g7a: '列印指南 →',
    g8h: '喺屋企架設', g8p: '行設定精靈，同屋企人分享一個地址。', g8a: '架設指南 →',
    k4: '下載', getH: '揀最啱你嘅用法',
    w1h: '喺瀏覽器', w1p: '唔使安裝。地圖儲存喺呢個瀏覽器，唔會上傳。',
    w2h: 'Windows 桌面版', w2p: '一個可攜檔案，原生開啟同儲存、最近地圖同即時車輛。', w2a: '最新版本',
    w3h: '你自己嘅伺服器', w3p: '用 Docker 行已發佈嘅容器，或者用設定精靈一鍵喺網絡上架設。', w3a: '架設指南', copy: '複製',
    footP: 'MIT 授權。非官方：唔係 TTC、Metrolinx 或者約克區交通嘅產品。地圖資料 © OpenStreetMap 貢獻者。人口普查資料：加拿大統計局。'
  };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var lang = store.get('gmmc-home-lang') === 'yue' ? 'yue' : 'en';
  var current = 'trip';
  var root = document.documentElement;
  var reduced = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };

  document.querySelectorAll('[data-icon]').forEach(function (el) { el.innerHTML = window.icon ? window.icon(el.dataset.icon, el.classList.contains('tile') ? 26 : 22) : ''; });
  document.querySelectorAll('[data-t]').forEach(function (el) { el.dataset.en = el.textContent; });

  var tabs = document.getElementById('tabs');
  FEATURES.forEach(function (f, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.setAttribute('role', 'tab'); b.id = 'tab-' + f.k; b.dataset.k = f.k;
    b.setAttribute('aria-controls', 'stageImg'); b.tabIndex = i ? -1 : 0;
    b.innerHTML = '<span class="tile">' + (window.icon ? window.icon(f.icon, 22) : '') + '</span><div><b></b><span></span></div>';
    b.addEventListener('click', function () { show(f.k, true); });
    tabs.appendChild(b);
  });
  tabs.addEventListener('keydown', function (e) {
    var list = Array.prototype.slice.call(tabs.children);
    var i = list.findIndex(function (b) { return b.dataset.k === current; });
    var n = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (e.key === 'Home') n = -i;
    if (e.key === 'End') n = list.length - 1 - i;
    if (n === undefined) return;
    e.preventDefault();
    var t = list[(i + n + list.length) % list.length]; show(t.dataset.k, true); t.focus();
  });
  var img = document.getElementById('stageImg'), cap = document.getElementById('stageCap');
  function show(k, animate) {
    current = k;
    var f = FEATURES.find(function (x) { return x.k === k; });
    Array.prototype.forEach.call(tabs.children, function (b) { var on = b.dataset.k === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    var txt = f[lang];
    var swap = function () { img.src = f.img; img.alt = txt[0] + ': ' + txt[1]; cap.textContent = 'GTHA Metro Map Creator · ' + txt[0]; img.classList.remove('swap'); };
    if (animate && !reduced()) { img.classList.add('swap'); setTimeout(swap, 200); } else swap();
  }
  function applyLang() {
    root.lang = lang === 'yue' ? 'zh-HK' : 'en';
    document.querySelectorAll('[data-t]').forEach(function (el) { var k = el.dataset.t; el.textContent = lang === 'yue' && YUE[k] ? YUE[k] : el.dataset.en; });
    Array.prototype.forEach.call(tabs.children, function (b) {
      var f = FEATURES.find(function (x) { return x.k === b.dataset.k; });
      b.querySelector(':scope > div > b').textContent = f[lang][0]; b.querySelector(':scope > div > span').textContent = f[lang][1];
    });
    var lb = document.getElementById('langBtn');
    lb.textContent = lang === 'yue' ? 'EN' : '粵';
    lb.setAttribute('aria-label', lang === 'yue' ? 'Language: switch to English' : 'Language: switch to Cantonese');
    show(current, false);
  }
  document.getElementById('langBtn').addEventListener('click', function () { lang = lang === 'yue' ? 'en' : 'yue'; store.set('gmmc-home-lang', lang); applyLang(); });

  var themes = ['system', 'light', 'dark'];
  var theme = themes.indexOf(store.get('gmmc-home-theme')) >= 0 ? store.get('gmmc-home-theme') : 'system';
  function applyTheme() {
    if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
    document.getElementById('themeIcon').textContent = theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐';
    document.getElementById('themeBtn').setAttribute('aria-label', 'Theme: ' + theme);
  }
  document.getElementById('themeBtn').addEventListener('click', function () { theme = themes[(themes.indexOf(theme) + 1) % 3]; store.set('gmmc-home-theme', theme); applyTheme(); });

  var menu = document.getElementById('menuBtn'), nav = document.getElementById('nav');
  menu.addEventListener('click', function () { var o = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', String(o)); });
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); } });

  var bar = document.getElementById('bar');
  addEventListener('scroll', function () { bar.classList.toggle('scrolled', scrollY > 8); }, { passive: true });

  var toast = document.getElementById('toast'), tt;
  function say(msg) { toast.textContent = msg; toast.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { toast.classList.remove('on'); }, 2200); }
  document.getElementById('copyBtn').addEventListener('click', function () {
    var cmd = document.getElementById('dockerCmd').textContent;
    var ok = function () { say(lang === 'yue' ? '已複製' : 'Copied'); };
    var fail = function () { say(lang === 'yue' ? '複製唔到，請手動揀選指令' : 'Could not copy. Select the command and copy it.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cmd).then(ok, fail); else fail();
  });

  if ('IntersectionObserver' in window && !reduced()) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el); });
  } else document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });

  applyTheme(); applyLang();
})();
