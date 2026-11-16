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
    mode: 'Search mode', legendTitle: 'Legend', lang_en: 'English', lang_yue: 'Cantonese', lang_both: 'Bilingual',
    rxTitle: "Regex builder", rxEngine: "Engine: JavaScript RegExp in this browser, Unicode mode", rxEscapeBtn: "Escape as literal text", rxFlagMulti: "Multiline (m)", rxFlagDot: "Dot matches newline (s)", rxExplainTitle: "What the pattern means", rxTestTitle: "Test text", rxUseStations: "Use station names", rxGroupsTitle: "Groups in the first match", rxReplaceLabel: "Replace with ($1, $<name>)", rxLibraryTitle: "Pattern library", rxNameLabel: "Name", rxSaveBtn: "Save pattern", rxDeleteBtn: "Delete by name", rxChoose: "Choose a pattern", rxSavedOk: "Pattern saved", rxTooLong: "Pattern is longer than 200 characters", rxPlainNote: "Plain text mode: the pattern is matched literally. Insert a token to switch to regular expression mode.", rxEmpty: "Type a pattern or insert tokens above.", rxMatchCount: "matches in test text", rxCapped: "stopped at 500", rxUnset: "(not matched)", rxNoGroups: "No capture groups", rxStart: "Start of text", rxEnd: "End of text", rxAny: "Any character", rxDigit: "A digit", rxNotDigit: "Not a digit", rxWord: "A letter, digit or underscore", rxNotWord: "Not a word character", rxSpace: "A space or tab", rxNotSpace: "Not a space", rxBoundary: "Word boundary", rxNotBoundary: "Not a word boundary", rxLetter: "Any letter (Unicode)", rxSet: "One of these characters", rxNotSet: "None of these characters", rxGroup: "Capture group", rxGroupEnd: "End of group", rxNonCap: "Group without capture", rxNamed: "Named capture group", rxOr: "Or", rxZeroMore: "Zero or more of the previous", rxOneMore: "One or more of the previous", rxOptional: "Previous is optional", rxLazy: "As few as possible", rxCount: "Repeat a set number of times", rxAhead: "Followed by", rxNotAhead: "Not followed by", rxBehind: "Preceded by", rxNotBehind: "Not preceded by", rxBackref: "Same text as a numbered group", rxNamedRef: "Same text as a named group", rxProperty: "Unicode property class", rxCodePoint: "Character by code", rxEscaped: "Literal character", rxLiteral: "Literal text", rxLibSaint: "Starts with St", rxLibGo: "Contains GO", rxLibCompass: "Compass direction", rxLibAtoM: "Starts A to M", rxLibDigit: "Contains a digit", rxLibRepeat: "Repeated word",
    bgOff: "Map background off", bgOn: "Map background on", chooseStation: "Choose a nearby station", deleted: "Station deleted", every: "every", exportFailed: "Export failed", exported: "Exported", findStation: "Find a station", frequency: "Frequency", kind_station: "Station", kind_stop: "Bus stop", layout: "Layout", layout_geographic: "Geographic", layout_schematic: "Schematic", linkTransfer: "Link a walking transfer", liveStopsFailed: "Could not load real stops from OpenStreetMap", madeWith: "Made with GTHA Metro Map Creator. Map data © OpenStreetMap contributors.", minShort: "min", noCoords: "No real coordinates", noLines: "Not on any route", noTransfers: "No walking transfers", offpeakEvery: "Off-peak, every", osmStopHint: "choose Station or Draw route, then click to add it", peakEvery: "Peak, every", projectSaved: "Project saved", segmentErased: "Segment erased", serviceType: "Service type", showFreqLine: "Show frequency on the map", siteExported: "Website saved. Upload the HTML file to any web host.", stopAdded: "Stop added", stopKind: "Type", tilesPartial: "Some map tiles could not be downloaded", transfers: "Walking transfers", unlink: "Remove transfer to", unnamedStop: "Unnamed stop", exportPdf: "PDF document", exportSite: "Website to host", saveProject: "Save project", openFile: "Open project or map", mapSection: "Map", background: "Map background", bg_osm: "OpenStreetMap", bg_none: "None", bgOpacity: "Background strength", showFreq: "Show frequencies on the map", liveStops: "Show real stops when zoomed in", appSection: "App", style_solid: "Subway or metro", style_dashed: "Planned", style_rail: "Regional rail", style_brt: "Rapid bus", style_bus: "Bus", style_express: "Express", style_superExpress: "Super express", zoomIn: "Zoom in", zoomOut: "Zoom out", exportPng: "PNG image", exportSvg: "SVG vector", exportJson: "Map data (JSON)", lines: "Routes", newLine: "New route", dropHere: "Drop a project or map file to open it", drawLine: "Route",
    retry: 'Retry', overpassUrl: 'Stop data server (optional Overpass API address)'
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
    hide: '隱藏', show: '顯示', mode: '搜尋模式', legendTitle: '圖例', lang_en: '英文', lang_yue: '廣東話', lang_both: '雙語',
    rxTitle: "正規表達式產生器", rxEngine: "引擎：呢個瀏覽器嘅 JavaScript RegExp，Unicode 模式", rxEscapeBtn: "當普通文字處理", rxFlagMulti: "多行（m）", rxFlagDot: "點號配對換行（s）", rxExplainTitle: "規則意思", rxTestTitle: "測試文字", rxUseStations: "用車站名", rxGroupsTitle: "第一個結果嘅分組", rxReplaceLabel: "取代做（$1、$<name>）", rxLibraryTitle: "規則庫", rxNameLabel: "名稱", rxSaveBtn: "儲存規則", rxDeleteBtn: "按名刪除", rxChoose: "揀一個規則", rxSavedOk: "已儲存規則", rxTooLong: "規則長過 200 個字", rxPlainNote: "普通文字模式：規則會照字面配對。加一個符號就會轉做正規表達式模式。", rxEmpty: "打規則，或者喺上面加符號。", rxMatchCount: "個測試文字結果", rxCapped: "去到 500 個停咗", rxUnset: "（冇配對）", rxNoGroups: "冇分組", rxStart: "文字開頭", rxEnd: "文字結尾", rxAny: "任何字元", rxDigit: "一個數字", rxNotDigit: "唔係數字", rxWord: "字母、數字或者底線", rxNotWord: "唔係文字字元", rxSpace: "空格或者 Tab", rxNotSpace: "唔係空格", rxBoundary: "字詞邊界", rxNotBoundary: "唔係字詞邊界", rxLetter: "任何字母（Unicode）", rxSet: "呢啲字元其中一個", rxNotSet: "唔係呢啲字元", rxGroup: "擷取分組", rxGroupEnd: "分組結束", rxNonCap: "唔擷取嘅分組", rxNamed: "有名擷取分組", rxOr: "或者", rxZeroMore: "前面嘅零個或者多個", rxOneMore: "前面嘅一個或者多個", rxOptional: "前面可有可無", rxLazy: "越少越好", rxCount: "重複指定次數", rxAhead: "後面跟住", rxNotAhead: "後面唔跟住", rxBehind: "前面係", rxNotBehind: "前面唔係", rxBackref: "同編號分組一樣嘅文字", rxNamedRef: "同有名分組一樣嘅文字", rxProperty: "Unicode 屬性類別", rxCodePoint: "用編碼指定字元", rxEscaped: "普通字元", rxLiteral: "普通文字", rxLibSaint: "St 開頭", rxLibGo: "有 GO", rxLibCompass: "方向", rxLibAtoM: "A 至 M 開頭", rxLibDigit: "有數字", rxLibRepeat: "重複字詞",
    bgOff: "已關閉地圖底圖", bgOn: "已開啟地圖底圖", chooseStation: "揀附近一個站", deleted: "已刪除車站", every: "每", exportFailed: "匯出失敗", exported: "已匯出", findStation: "搵車站", frequency: "班次", kind_station: "車站", kind_stop: "巴士站", layout: "版面", layout_geographic: "地理", layout_schematic: "示意", linkTransfer: "連接步行轉乘", liveStopsFailed: "未能由 OpenStreetMap 載入真實車站", madeWith: "用大多倫多鐵路地圖製作器製作。地圖資料 © OpenStreetMap 貢獻者。", minShort: "分鐘", noCoords: "冇真實座標", noLines: "唔喺任何路線", noTransfers: "冇步行轉乘", offpeakEvery: "非繁忙時間，每", osmStopHint: "揀「車站」或者「路線」，再撳一下加入", peakEvery: "繁忙時間，每", projectSaved: "已儲存專案", segmentErased: "已擦除路段", serviceType: "服務類型", showFreqLine: "喺地圖顯示班次", siteExported: "網站已儲存。將 HTML 檔上載到任何網站主機就得。", stopAdded: "已加車站", stopKind: "類型", tilesPartial: "有啲地圖圖塊下載唔到", transfers: "步行轉乘", unlink: "移除轉乘去", unnamedStop: "冇名車站", exportPdf: "PDF 文件", exportSite: "可以放上網嘅網站", saveProject: "儲存專案", openFile: "開專案或者地圖", mapSection: "地圖", background: "地圖底圖", bg_osm: "OpenStreetMap", bg_none: "冇", bgOpacity: "底圖深淺", showFreq: "喺地圖顯示班次", liveStops: "放大時顯示真實車站", appSection: "程式", style_solid: "地鐵", style_dashed: "規劃中", style_rail: "區域鐵路", style_brt: "快速巴士", style_bus: "巴士", style_express: "快線", style_superExpress: "特快線", zoomIn: "放大", zoomOut: "縮細", exportPng: "PNG 圖片", exportSvg: "SVG 向量圖", exportJson: "地圖資料（JSON）", lines: "路線", newLine: "新增路線", dropHere: "放低專案或者地圖檔就可以開", drawLine: "路線",
    retry: '再試', overpassUrl: '車站資料伺服器（可選，Overpass API 地址）'
  };
  let lang = 'en';
  function t(key) {
    const a = en[key] ?? key;
    const b = yue[key] ?? a;
    if (lang === 'yue') return b;
    if (lang === 'both') return a === b ? a : a + ' · ' + b;
    return a;
  }
  /** Feature modules add their own strings: I18N.add({ key: 'English' }, { key: '廣東話' }). */
  function add(e, y) { Object.assign(en, e || {}); Object.assign(yue, y || {}); }
  window.I18N = { t, add, setLang(l) { lang = l; }, getLang() { return lang; }, en, yue };
})();
