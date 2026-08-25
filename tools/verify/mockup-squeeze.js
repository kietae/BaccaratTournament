const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file://' + path.resolve(__dirname, '../../docs/ui-mockup.html');
const OUT = path.resolve(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

async function dragTo(page, x0, y0, x1, y1, steps) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    await page.waitForTimeout(16);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto(FILE);
  await page.locator('#squeezeCanvas').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const box = await page.$eval('#squeezeCanvas', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  console.log('canvas box:', box);

  const rightX = box.x + box.w - 8, midY = box.y + box.h / 2;
  await page.screenshot({ path: path.join(OUT, '30-mockup-idle.png') });

  await dragTo(page, rightX, midY, rightX - box.w * 0.55, midY, 14);
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(OUT, '31-mockup-squeeze-55pct.png') });
  console.log('readout:', await page.$eval('#squeezeReadout', el => el.textContent));
  await page.mouse.up();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, '32-mockup-full-reveal.png') });
  console.log('readout after release:', await page.$eval('#squeezeReadout', el => el.textContent));

  console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
})();
