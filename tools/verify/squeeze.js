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
  const rightEdgeX = box.x + box.w - 15; // inside the 48px start zone
  const midY = box.y + box.h / 2;

  async function shot(name) {
    await page.screenshot({ path: path.join(OUT, name) });
    console.log('shot:', name);
  }
  async function readout() {
    return await page.$eval('#edgeReadout', (el) => el.textContent);
  }

  await shot('01-before-touch.png');

  // 10px small drag
  await dragTo(page, rightEdgeX, midY, rightEdgeX - 10, midY, 6);
  await page.waitForTimeout(80);
  await shot('02-small-drag-10px.png');
  console.log('readout @10px:', await readout());
  await page.mouse.up();
  await page.waitForTimeout(600); // let it spring back
  await shot('03-after-small-release.png');
  console.log('readout after small release:', await readout());

  // 25% squeeze (of card width, roughly)
  const depth25 = box.w * 0.25 * 0.62; // FULL_REVEAL_DEPTH_FRAC=0.62 means 100% readout at 0.62*W depth
  await dragTo(page, rightEdgeX, midY, rightEdgeX - depth25, midY, 12);
  await page.waitForTimeout(80);
  await shot('04-squeeze-25pct.png');
  console.log('readout @25%:', await readout());

  // continue to 50%
  const depth50 = box.w * 0.5 * 0.62;
  await dragTo(page, rightEdgeX - depth25, midY, rightEdgeX - depth50, midY, 12);
  await page.waitForTimeout(80);
  await shot('05-squeeze-50pct.png');
  console.log('readout @50%:', await readout());

  // release mid-way (below full-reveal threshold) -> should spring back
  await page.mouse.up();
  await page.waitForTimeout(120);
  await shot('06-releasing-midway.png');
  await page.waitForTimeout(600);
  await shot('07-fully-returned.png');
  console.log('readout after mid release:', await readout());

  // max long-edge squeeze then release past threshold -> full reveal
  await dragTo(page, rightEdgeX, midY, rightEdgeX - box.w * 0.75, midY, 16);
  await page.waitForTimeout(80);
  await shot('08-squeeze-max.png');
  console.log('readout @max:', await readout());
  await page.mouse.up();
  await page.waitForTimeout(120);
  await shot('09-releasing-full.png');
  await page.waitForTimeout(900);
  await shot('10-full-reveal.png');
  console.log('readout after full release:', await readout());

  // reset, then test an off-center (diagonal) grab near top of the zone
  await page.click('#resetBtn');
  await page.waitForTimeout(100);
  const topY = box.y + box.h * 0.2;
  await dragTo(page, rightEdgeX, topY, rightEdgeX - 120, topY + 60, 14);
  await page.waitForTimeout(80);
  await shot('11-diagonal-drag.png');
  console.log('readout diagonal:', await readout());
  await page.mouse.up();
  await page.waitForTimeout(700);

  // debug off view for a "production look" check
  await page.click('#resetBtn');
  await page.click('#debugBtn');
  await dragTo(page, rightEdgeX, midY, rightEdgeX - box.w * 0.35, midY, 12);
  await page.waitForTimeout(80);
  await shot('12-debug-off-35pct.png');
  await page.mouse.up();
  await page.waitForTimeout(600);

  console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
})();
