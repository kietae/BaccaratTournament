const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = 'file://' + path.resolve(__dirname, '../../docs/squeeze-prototype.html');
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
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto(FILE);
  await page.waitForTimeout(150);
  const box = await page.$eval('canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

  async function shot(name) { await page.screenshot({ path: path.join(OUT, name) }); console.log('shot:', name); }
  async function readout() { return await page.$eval('#edgeReadout', (el) => el.textContent); }
  async function resetAll() { await page.click('#resetBtn'); await page.waitForTimeout(80); }

  // ---- BOTTOM edge ----
  const botX = box.x + box.w / 2, botY0 = box.y + box.h - 15;
  await dragTo(page, botX, botY0, botX, botY0 - box.h * 0.45, 14);
  await page.waitForTimeout(80);
  await shot('20-bottom-45pct.png');
  console.log('bottom @45%:', await readout());
  await page.mouse.up();
  await page.waitForTimeout(700);
  await shot('21-bottom-returned.png');
  console.log('bottom after release:', await readout());
  await resetAll();

  // ---- TOP edge ----
  const topX = box.x + box.w / 2, topY0 = box.y + 15;
  await dragTo(page, topX, topY0, topX, topY0 + box.h * 0.7, 16);
  await page.waitForTimeout(80);
  await shot('22-top-70pct.png');
  console.log('top @70%:', await readout());
  await page.mouse.up();
  await page.waitForTimeout(120);
  await shot('23-top-releasing.png');
  await page.waitForTimeout(900);
  await shot('24-top-full-reveal.png');
  console.log('top after release (should be full if >62%):', await readout());
  await resetAll();

  // ---- LEFT edge ----
  const leftX0 = box.x + 15, leftY = box.y + box.h / 2;
  await dragTo(page, leftX0, leftY, leftX0 + box.w * 0.4, leftY, 14);
  await page.waitForTimeout(80);
  await shot('25-left-40pct.png');
  console.log('left @40%:', await readout());
  await page.mouse.up();
  await page.waitForTimeout(700);
  await resetAll();

  // ---- Rapid/fast drag stress test on right edge ----
  const rightX0 = box.x + box.w - 15, midY = box.y + box.h / 2;
  await dragTo(page, rightX0, midY, rightX0 - box.w * 0.5, midY, 2); // very few steps = fast
  await page.waitForTimeout(60);
  await shot('26-fast-drag.png');
  console.log('fast drag readout:', await readout());
  await page.mouse.up();
  await page.waitForTimeout(700);

  // ---- Outward drag (should show depth 0%, flat) ----
  await resetAll();
  await dragTo(page, rightX0, midY, rightX0 + 40, midY + 5, 8); // dragging further right = outward
  await page.waitForTimeout(80);
  await shot('27-outward-drag.png');
  console.log('outward drag readout (should be 대기 중):', await readout());
  await page.mouse.up();
  await page.waitForTimeout(300);

  // ---- pointercancel mid-drag ----
  await resetAll();
  await page.mouse.move(rightX0, midY);
  await page.mouse.down();
  await page.mouse.move(rightX0 - 80, midY);
  await page.waitForTimeout(60);
  await page.evaluate(() => {
    const c = document.getElementById('cardCanvas');
    c.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  await shot('28-after-pointercancel.png');
  console.log('after pointercancel:', await readout());
  await page.mouse.up();

  console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
})();
