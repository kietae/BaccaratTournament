'use strict';

const { chromium } = require('playwright');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const EXECUTABLE = process.env.PLAYWRIGHT_BROWSER_PATH;

async function join(page, code, nickname) {
  await page.goto(`${BASE}/join`);
  await page.fill('input[placeholder=ABCDEF]', code);
  await page.fill('input[placeholder="닉네임을 입력하세요"]', nickname);
  await page.locator('[data-testid=join-submit]').click();
  await page.waitForURL('**/play');
  await page.locator('[data-testid=bet-player]').waitFor();
}

async function squeeze(page, admin, capture) {
  const stage = page.locator('[data-testid=squeeze-stage]');
  await stage.waitFor();
  const box = await stage.boundingBox();
  if (!box) throw new Error('squeeze stage has no bounding box');
  const from = { x: box.x + box.width / 2, y: box.y + box.height - 6 };
  const to = { x: from.x, y: box.y + box.height * 0.02 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(from.x, from.y + (to.y - from.y) * i / 10);
    await page.waitForTimeout(20);
    if (capture && i === 7) {
      await admin.waitForTimeout(100);
      await admin.screenshot({ path: '../../.tools/admin-live-squeeze.png', fullPage: true });
    }
  }
  await page.mouse.up();
}

(async () => {
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1440, height: 900 } }),
    browser.newContext({ viewport: { width: 390, height: 844 } }),
    browser.newContext({ viewport: { width: 390, height: 844 } })
  ]);
  const [admin, playerA, playerB] = await Promise.all(contexts.map((context) => context.newPage()));
  const errors = [];
  for (const page of [admin, playerA, playerB]) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  }

  await admin.goto(`${BASE}/admin`);
  await admin.locator('input[type=number]').nth(1).fill('1');
  await admin.locator('[data-testid=create-tournament]').click();
  const code = (await admin.locator('[data-testid=join-code]').innerText()).trim();
  await Promise.all([join(playerA, code, '스퀴저'), join(playerB, code, '관전자')]);
  if (await admin.locator('[data-testid=leaderboard] > div').count() !== 2) throw new Error('lobby leaderboard did not show both players');
  await admin.locator('[data-testid=start-tournament]').click();
  await playerA.locator('[data-testid=bet-player]').click();
  await playerB.locator('[data-testid=bet-player]').click();
  await playerA.locator('[data-testid=confirm-bets]').click();
  await playerB.locator('[data-testid=confirm-bets]').click();

  await Promise.any([
    playerA.getByText('긴 변을 살짝').waitFor({ timeout: 10000 }),
    playerB.getByText('긴 변을 살짝').waitFor({ timeout: 10000 })
  ]);
  const squeezer = await playerA.getByText('긴 변을 살짝').count() ? playerA : playerB;
  let squeezed = 0;
  while (squeezed < 6) {
    if (await admin.getByText('토너먼트 종료').count()) break;
    if (await squeezer.getByText('긴 변을 살짝').count()) {
      await admin.locator('[data-testid=admin-squeeze-stage]').waitFor();
      await squeeze(squeezer, admin, squeezed === 0);
      squeezed += 1;
    }
    await admin.waitForTimeout(350);
  }
  await admin.getByText('토너먼트 종료').waitFor({ timeout: 25000 });
  await admin.getByText('최종 결과').waitFor();
  await admin.locator('[data-testid=result-hands]').waitFor();
  await admin.screenshot({ path: '../../.tools/admin-final.png', fullPage: true });
  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
  console.log(`OK: lobby, live squeeze broadcast, leaderboard and final podium (${squeezed} cards)`);
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
