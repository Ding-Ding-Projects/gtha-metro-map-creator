// mod-gtfs-viewer.js: connects the editor to the GTFS viewer. See docs/features/gtfs-viewer.md.
// Adds "View this map as GTFS" to the export menu and receives routes sent back with "Add to map".
// The feed travels through IndexedDB in this browser only; nothing is uploaded.
(function () {
  'use strict';
  const X = window.GMMCX = window.GMMCX || {};
  X.ready = X.ready || [];
  window.I18N.add({ gtfsViewerItem: 'View this map as GTFS', gtfsViewerEmpty: 'Draw at least one route first', gtfsViewerFailed: 'Could not open the GTFS viewer', gtfsViewerBack: 'Opening the routes you chose in the import window' },
    { gtfsViewerItem: '用 GTFS 檢視器睇呢幅地圖', gtfsViewerEmpty: '請先畫最少一條路線', gtfsViewerFailed: '開唔到 GTFS 檢視器', gtfsViewerBack: '喺匯入視窗入面開你揀嘅路線' });
  const tr = (k) => window.I18N.t(k);
  const DB = 'gmmc-gtfs', STORE = 'handoff';
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const put = async (key, v) => { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); };
  const take = async (key) => { try { const db = await idb(); return await new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'), s = tx.objectStore(STORE), g = s.get(key); g.onsuccess = () => { const v = g.result; if (v) s.delete(key); res(v || null); }; g.onerror = () => res(null); }); } catch { return null; } };

  X.ready.push((G) => {
    const menu = document.getElementById('exportMenu'), anchor = menu && (menu.querySelector('#gtfsExportItem') || menu.querySelector('#gtfsImportItem') || menu.querySelector('[data-act="json"]'));
    if (menu && anchor && window.GMMCGtfsExport) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.id = 'gtfsViewerItem';
      b.innerHTML = `${window.icon('train', 24)}<span data-t="gtfsViewerItem">${G.esc(tr('gtfsViewerItem'))}</span>`;
      b.addEventListener('click', async () => {
        menu.hidden = true; const eb = document.getElementById('exportBtn'); if (eb) eb.setAttribute('aria-expanded', 'false');
        try {
          const f = window.GMMCGtfsExport.files();
          if (f['routes.txt'].split('\r\n').length - 2 < 1) { G.toast(tr('gtfsViewerEmpty')); return; }
          const blob = await window.GMMCGtfsExport.build();
          await put('viewer', { blob, name: (G.getMap().title || 'map').replace(/[^\w.-]+/g, '-') + '-gtfs.zip', time: Date.now() });
          if (!window.open('../gtfs/', '_blank')) location.href = '../gtfs/';
        } catch (err) { console.error('gtfs viewer', err); G.toast(tr('gtfsViewerFailed')); }
      });
      anchor.after(b); if (G.applyI18n) G.applyI18n();
    }
    // Routes sent back from the viewer: open the importer on the same feed with those routes ticked.
    take('editor').then((h) => {
      if (!h || !h.blob || !window.GMMCGtfs) return;
      const file = new File([h.blob], h.name || 'feed.zip', { type: 'application/zip' }); window.GMMCGtfs.open(file);
      const want = new Set(h.routes || []); if (!want.size) return;
      G.toast(tr('gtfsViewerBack'));
      let n = 0; const iv = setInterval(() => {
        const boxes = document.querySelectorAll('#gtfsList input[data-id]');
        if (boxes.length || ++n > 400) { clearInterval(iv); boxes.forEach((cb) => { if (cb.checked !== want.has(cb.dataset.id)) { cb.checked = want.has(cb.dataset.id); cb.dispatchEvent(new Event('change', { bubbles: true })); } }); }
      }, 250);
    });
  });
})();
