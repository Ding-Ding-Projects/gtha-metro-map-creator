// Usage: npm i playwright && npx playwright install firefox webkit && node scripts/verify/cross-browser.cjs [firefox|webkit] [base-url]
// On Windows the Playwright Firefox build may not start; run it in mcr.microsoft.com/playwright instead.
'use strict';
const { firefox, webkit } = require('playwright');
const B = process.argv[3] || 'https://ding-ding-projects.github.io/gtha-metro-map-creator/';
const OUT = process.env.OUT_DIR || require('os').tmpdir();

async function run(name, type) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  const r = { browser: name };
  try {
    await page.goto(B, { waitUntil: 'load' });
    r.home = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent.trim(), tabs: document.querySelectorAll('.tab').length, overflow: document.documentElement.scrollWidth > innerWidth }));
    await page.screenshot({ path: OUT + '/' + name + '-home.png' });

    await page.goto(B + 'app/', { waitUntil: 'load' });
    await page.waitForTimeout(4000);
    await page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
    r.editor = await page.evaluate(() => ({ stations: Object.keys(GMMC.getMap().stations).length, lines: GMMC.getMap().lines.length, svgPaths: document.querySelectorAll('svg path').length, overflow: document.documentElement.scrollWidth > innerWidth }));
    await page.screenshot({ path: OUT + '/' + name + '-editor.png' });

    await page.goto(B + 'docs/', { waitUntil: 'load' });
    const box = page.locator('input[type=search]').first();
    await box.fill('frequen');
    await page.waitForTimeout(1200);
    r.docs = await page.evaluate(() => ({ marks: document.querySelectorAll('mark').length, status: (document.querySelector('[role=status], .ds-status, #dsStatus') || {}).textContent }));

    await page.goto(B + 'gtfs/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    r.gtfs = await page.evaluate(() => ({ title: document.title, buttons: document.querySelectorAll('button').length, overflow: document.documentElement.scrollWidth > innerWidth }));
    await page.screenshot({ path: OUT + '/' + name + '-gtfs.png' });
  } catch (e) { r.failure = String(e.message || e).slice(0, 300); }
  r.pageErrors = errors.slice(0, 5);
  await browser.close();
  return r;
}

(async () => {
  for (const [n, t] of [['firefox', firefox], ['webkit', webkit]].filter(([n]) => !process.argv[2] || process.argv[2] === n)) console.log(JSON.stringify(await run(n, t)));
})();
