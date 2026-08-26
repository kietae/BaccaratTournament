'use strict';
const { chromium } = require('playwright');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const admin = await browser.newPage();
  const p1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p1 = await p1Ctx.newPage();
  p1.on('console', (m) => { if (m.type() === 'error') console.log('[console error]', m.text()); });
  p1.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await admin.goto(BASE + '/admin');
  await admin.waitForLoadState('networkidle');
  await admin.locator('input[type=number]').first().fill('30000000');
  await admin.locator('[data-testid=create-tournament]').click();
  await admin.locator('[data-testid=join-code]').waitFor({ timeout: 10000 });
  const joinCode = (await admin.locator('[data-testid=join-code]').innerText()).trim();
  await admin.locator('[data-testid=start-tournament]').click();

  await p1.goto(BASE + '/join');
  await p1.waitForLoadState('networkidle');
  await p1.fill('input[placeholder=ABCDEF]', joinCode);
  await p1.fill('input[placeholder="닉네임을 입력하세요"]', 'Canceler');
  await p1.locator('[data-testid=join-submit]').click();
  await p1.waitForURL('**/play', { timeout: 10000 });
  await p1.waitForSelector('[data-testid=bet-player]', { timeout: 15000 });

  console.log('--- place player + playerPair bets ---');
  await p1.click('[data-testid=bet-player]');
  await p1.click('[data-testid=bet-playerPair]');
  await p1.waitForTimeout(300);
  let total = await p1.locator('text=베팅 합계').innerText();
  console.log('after placing:', total);

  console.log('--- individual clear (×) on playerPair ---');
  const clearBtnVisible = await p1.locator('[data-testid=clear-playerPair]').isVisible();
  console.log('clear-playerPair button visible:', clearBtnVisible);
  await p1.locator('[data-testid=clear-playerPair]').click();
  await p1.waitForTimeout(300);
  const playerPairChipGone = (await p1.locator('[data-testid=bet-playerPair]').locator('text=/원|K$/').count()) === 0;
  total = await p1.locator('text=베팅 합계').innerText();
  console.log('after individual clear:', total, '| playerPair chip gone:', playerPairChipGone);

  console.log('--- add a few more bets then clear-all ---');
  await p1.click('[data-testid=bet-banker]');
  await p1.click('[data-testid=bet-tie]');
  await p1.waitForTimeout(300);
  total = await p1.locator('text=베팅 합계').innerText();
  console.log('before clear-all:', total);
  await p1.locator('[data-testid=clear-all-bets]').click();
  await p1.waitForTimeout(400);
  total = await p1.locator('text=베팅 합계').innerText();
  console.log('after clear-all:', total);
  const confirmDisabled = await p1.locator('[data-testid=confirm-bets]').isDisabled();
  console.log('confirm button disabled after clear-all (expected true, betTotal=0):', confirmDisabled);

  await browser.close();
})();
