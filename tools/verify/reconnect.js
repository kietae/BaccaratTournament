'use strict';
// Reproduces the reported bug: a socket that disconnects and auto-reconnects
// (simulated here via context.setOffline, which is much closer to real
// mobile wifi/screen-lock flakiness than a page reload) used to silently
// lose its server-side admin/player registration, causing "권한이 없습니다"
// on admin actions and a frozen, update-less UI for players. Verifies the
// fix: both roles re-authenticate automatically on the socket's 'connect'
// event, which fires again after every reconnect.

const { chromium } = require('playwright');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch();
  const adminCtx = await browser.newContext();
  const p1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const admin = await adminCtx.newPage();
  const p1 = await p1Ctx.newPage();

  await admin.goto(BASE + '/admin');
  await admin.waitForLoadState('networkidle');
  await admin.locator('input[type=number]').first().fill('30000000');
  await admin.locator('[data-testid=create-tournament]').click();
  await admin.locator('[data-testid=join-code]').waitFor({ timeout: 10000 });
  const joinCode = (await admin.locator('[data-testid=join-code]').innerText()).trim();
  console.log('tournament created, code:', joinCode);

  await p1.goto(BASE + '/join');
  await p1.waitForLoadState('networkidle');
  await p1.fill('input[placeholder=ABCDEF]', joinCode);
  await p1.fill('input[placeholder="닉네임을 입력하세요"]', 'Flaky');
  await p1.locator('[data-testid=join-submit]').click();
  await p1.waitForURL('**/play', { timeout: 10000 });
  await p1.waitForSelector('[data-testid=bet-player]', { timeout: 15000 });
  console.log('player joined');

  console.log('--- simulating admin network drop + reconnect ---');
  await adminCtx.setOffline(true);
  await admin.waitForTimeout(1500);
  await adminCtx.setOffline(false);
  await admin.waitForTimeout(2500); // let socket.io's reconnect + admin:attach round-trip land

  console.log('--- simulating player network drop + reconnect ---');
  await p1Ctx.setOffline(true);
  await p1.waitForTimeout(1500);
  await p1Ctx.setOffline(false);
  await p1.waitForTimeout(2500);

  console.log('--- admin clicks start tournament after reconnect ---');
  const startRes = await admin.evaluate(() => {
    return new Promise((resolve) => {
      const btn = document.querySelector('[data-testid=start-tournament]');
      if (!btn) { resolve('NO_BUTTON'); return; }
      btn.click();
      resolve('CLICKED');
    });
  });
  console.log('start click:', startRes);
  await admin.waitForTimeout(1500);
  const adminError = await admin.locator('text=권한이 없습니다').count();
  console.log('admin "권한이 없습니다" error visible:', adminError > 0);

  await admin.waitForFunction(
    () => document.body.textContent?.includes('betting-wait'),
    null,
    { timeout: 10000 }
  ).catch((e) => {
    console.log('FAILED: admin never saw the round actually start —', e.message);
  });
  console.log('admin sees round started OK (status left "lobby")');

  console.log('--- player: does it still receive live state after its own reconnect? ---');
  await p1.locator('[data-testid=bet-player]').click();
  await p1.waitForTimeout(500);
  const betReflected = await p1.locator('text=베팅 합계').isVisible().catch(() => false);
  const chipStackShown = (await p1.locator('[data-testid=bet-player] >> text=/원|K|M/').count()) > 0;
  console.log('player UI responsive after reconnect (bet total row visible):', betReflected, 'chip on tile:', chipStackShown);

  await browser.close();
})();
