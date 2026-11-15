(function () {
  'use strict';
  const en = {
    appName: 'GTHA Metro Map Creator', select: 'Select', station: 'Station', drawLine: 'Draw line',
    label: 'Label', erase: 'Erase', undo: 'Undo', redo: 'Redo', export: 'Export', import: 'Import',
    lines: 'Lines', newLine: 'New line', search: 'Find station', searchPlaceholder: 'Name or pattern',
    plain: 'Plain text', regex: 'Regular expression', ignoreCase: 'Ignore case', invalidPattern: 'Invalid pattern',
    noMatches: 'No matching stations', matches: 'matches', settings: 'Settings', inspector: 'Inspector',
    name: 'Name', nameZh: 'Chinese name', labelPos: 'Label position', auto: 'Automatic',
    interchange: 'Interchange', yes: 'Yes', no: 'No', delete: 'Delete', color: 'Colour', width: 'Width',
    style: 'Style', solid: 'Solid', dashed: 'Dashed (planned)', rail: 'Regional rail', visible: 'Visible',
    fit: 'Fit map', mapCheck: 'Map check', noIssues: 'No issues found', title: 'Map title',
    language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark', system: 'Match system',
    grid: 'Show grid', snap: 'Snap to grid', fontSize: 'Label size', sound: 'Sound effects',
    legend: 'Show legend in exports', resetSettings: 'Reset settings', runSetup: 'Run setup again',
    close: 'Close', nothingSelected: 'Nothing selected. Pick a tool, then click the map.',
    servedBy: 'Served by', moveUp: 'Move up', moveDown: 'Move down', reverse: 'Reverse direction',
    stops: 'stops', bend: 'Bend', bendEarly: 'Diagonal first', bendLate: 'Straight first',
    insertStation: 'Insert station here', addToLine: 'Add to active line', alignH: 'Align horizontally',
    alignV: 'Align vertically', selected: 'selected', text: 'Text', size: 'Size', activeLine: 'Active line',
    noActiveLine: 'Choose a line in the Lines panel, or one is created when you start drawing.',
    segment: 'Segment', exportSvg: 'Download SVG', exportPng: 'Download PNG', exportJson: 'Download JSON',
    importJson: 'Open JSON file', newMap: 'New map', template: 'GTHA template', blankMap: 'Blank map',
    replaceConfirm: 'Replace the current map? You can undo this.', importFailed: 'That file is not a valid map',
    imported: 'Map imported', saved: 'Saved in this browser', tidyLabels: 'Reset all labels to automatic',
    shortcuts: 'Keyboard shortcuts', back: 'Back', next: 'Next', skip: 'Skip', finish: 'Open workspace',
    step: 'Step', of: 'of', setupTitle: 'Set up your map', setupStart: 'How do you want to start?',
    keepCurrent: 'Keep my saved map', setupLook: 'Language and theme', setupTools: 'Your tools',
    toolsHelp: 'Select (V) moves stations. Station (S) adds one. Draw line (L) connects stations in order; click empty space to add a new stop, hold Alt to add a bend point. Label (T) adds text. Erase (E) removes stations, segments and labels. Scroll to zoom, drag empty space to pan.',
    orphan: 'Station is not on any line', shortLine: 'Line has fewer than two stops', dupName: 'Name used more than once',
    overlap: 'Stations share a position', zoom: 'Zoom', stations: 'Stations', lineCount: 'Lines',
    dropHere: 'Drop a map JSON file to open it', selectLine: 'Select line', hide: 'Hide', show: 'Show',
    mode: 'Search mode', legendTitle: 'Legend', lang_en: 'English', lang_yue: 'Cantonese', lang_both: 'Bilingual'
  };
  const yue = {
    appName: '大多倫多鐵路地圖製作器', select: '選取', station: '車站', drawLine: '畫路線', label: '文字標籤',
    erase: '擦除', undo: '復原', redo: '重做', export: '匯出', import: '匯入', lines: '路線', newLine: '新增路線',
    search: '搵車站', searchPlaceholder: '名或者規則', plain: '普通文字', regex: '正規表達式', ignoreCase: '唔分大細楷',
    invalidPattern: '規則寫錯咗', noMatches: '搵唔到車站', matches: '個結果', settings: '設定', inspector: '檢視器',
    name: '名稱', nameZh: '中文名', labelPos: '標籤位置', auto: '自動', interchange: '轉車站', yes: '係', no: '唔係',
    delete: '刪除', color: '顏色', width: '闊度', style: '款式', solid: '實線', dashed: '虛線（規劃中）',
    rail: '區域鐵路', visible: '顯示', fit: '睇晒成幅圖', mapCheck: '地圖檢查', noIssues: '冇發現問題',
    title: '地圖標題', language: '語言', theme: '主題', light: '淺色', dark: '深色', system: '跟系統',
    grid: '顯示格線', snap: '對齊格線', fontSize: '標籤大細', sound: '音效', legend: '匯出時加圖例',
    resetSettings: '重設設定', runSetup: '再做一次設定', close: '關閉', nothingSelected: '未揀任何嘢。揀個工具，再撳地圖。',
    servedBy: '經過路線', moveUp: '上移', moveDown: '下移', reverse: '調轉方向', stops: '個站', bend: '轉角',
    bendEarly: '先斜後直', bendLate: '先直後斜', insertStation: '喺呢度加車站', addToLine: '加入目前路線',
    alignH: '橫向對齊', alignV: '直向對齊', selected: '個已選', text: '文字', size: '大細', activeLine: '目前路線',
    noActiveLine: '喺路線欄揀一條線，或者開始畫嗰陣自動新增一條。', segment: '路段', exportSvg: '下載 SVG',
    exportPng: '下載 PNG', exportJson: '下載 JSON', importJson: '開 JSON 檔', newMap: '新地圖', template: '大多倫多範本',
    blankMap: '空白地圖', replaceConfirm: '要取代而家呢幅圖？可以復原㗎。', importFailed: '呢個檔唔係有效嘅地圖',
    imported: '已經匯入地圖', saved: '已儲存喺呢個瀏覽器', tidyLabels: '所有標籤改返自動', shortcuts: '鍵盤快捷鍵',
    back: '返回', next: '下一步', skip: '略過', finish: '開始工作', step: '第', of: '步，共',
    setupTitle: '設定你嘅地圖', setupStart: '你想點樣開始？', keepCurrent: '用返我儲存咗嘅地圖', setupLook: '語言同主題',
    setupTools: '你嘅工具',
    toolsHelp: '選取（V）可以搬車站。車站（S）加一個站。畫路線（L）按次序連車站；撳空位會加新站，㩒住 Alt 會加轉角點。文字標籤（T）加文字。擦除（E）刪車站、路段同標籤。轆滑鼠放大縮細，拖空位移動地圖。',
    orphan: '車站唔喺任何路線', shortLine: '路線少過兩個站', dupName: '名稱用咗多過一次', overlap: '車站疊埋一齊',
    zoom: '縮放', stations: '車站', lineCount: '路線', dropHere: '放低地圖 JSON 檔就可以開', selectLine: '揀路線',
    hide: '隱藏', show: '顯示', mode: '搜尋模式', legendTitle: '圖例', lang_en: '英文', lang_yue: '廣東話', lang_both: '雙語'
  };
  let lang = 'en';
  function t(key) {
    const a = en[key] ?? key;
    const b = yue[key] ?? a;
    if (lang === 'yue') return b;
    if (lang === 'both') return a === b ? a : a + ' · ' + b;
    return a;
  }
  window.I18N = { t, setLang(l) { lang = l; }, getLang() { return lang; }, en, yue };
})();
