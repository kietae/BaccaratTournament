'use strict';
// Fast-forward many rounds (short-edge-only squeezing, minimal screenshots)
// hunting specifically for a TIE outcome and a winning side bet — both
// probabilistically rare enough that the earlier 6-round full-round.js pass
// didn't happen to hit them. Screenshots only the moments that matter.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
let shotN = 100;
async function shot(page, label) {
  shotN += 1;
  const file = path.join(SHOT_DIR, `${shotN}-${label}.png`);
  await page.screenshot({ path: file });
  console.log('shot:', file);
}

async function stageBox(page) {
  const el = page.locator('[data-testid=squeeze-stage]');
  await el.waitFor({ state: 'visible', timeout: 8000 });
  return el.boundingBox();
}
async function phaseText(page) {
  return page.locator('[data-testid=phase-label]').innerText().catch(() => '');
}
async function waitForPhaseContains(page, substr, timeout = 30000) {
  await page.waitForFunction(
    (s) => document.querySelector('[data-testid=phase-label]')?.textContent?.includes(s),
    substr,
    { timeout }
  );
}
async function isSqueezerView(page) {
  return (await page.locator('text=긴 변을 살짝').count()) > 0;
}
async function quickReveal(page) {
  const box = await stageBox(page);
  const from = { x: box.x + box.width / 2, y: box.y + box.height - 8 };
  const to = { x: box.x + box.width / 2, y: box.y + box.height * 0.2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * (i / 8), from.y + (to.y - from.y) * (i / 8));
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch();
  const adminCtx = await browser.newContext();
  const p1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const admin = await adminCtx.newPage();
  const p1 = await p1Ctx.newPage();
  const p2 = await p2Ctx.newPage();

  const consoleErrors = [];
  for (const [name, pg] of [['admin', admin], ['p1', p1], ['p2', p2]]) {
    pg.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`[${name}] ${msg.text()}`); });
    pg.on('pageerror', (err) => consoleErrors.push(`[${name}] pageerror: ${err.message}`));
  }

  await admin.goto(BASE + '/admin');
  await admin.waitForLoadState('networkidle');
  await admin.locator('input[type=number]').first().fill('30000000');
  await admin.locator('[data-testid=create-tournament]').click();
  await admin.locator('[data-testid=join-code]').waitFor({ timeout: 10000 });
  const joinCode = (await admin.locator('[data-testid=join-code]').innerText()).trim();
  await admin.locator('[data-testid=start-tournament]').click();

  for (const [pg, nick] of [[p1, 'Hunter1'], [p2, 'Hunter2']]) {
    await pg.goto(BASE + '/join');
    await pg.waitForLoadState('networkidle');
    await pg.fill('input[placeholder=ABCDEF]', joinCode);
    await pg.fill('input[placeholder="닉네임을 입력하세요"]', nick);
    await pg.locator('[data-testid=join-submit]').click();
    await pg.waitForURL('**/play', { timeout: 10000 });
  }
  await p1.waitForSelector('[data-testid=bet-player]', { timeout: 15000 });

  let sawTie = false, sawSideBetWin = false;
  const MAX_ROUNDS = 25;
  for (let r = 0; r < MAX_ROUNDS && !(sawTie && sawSideBetWin); r++) {
    await waitForPhaseContains(p1, '베팅 시간', 20000);
    // Bet on tie every round (9.5%/hand) and both pairs (~7.5%/hand each) to raise hit odds.
    await p1.click('[data-testid=bet-tie]');
    await p1.click('[data-testid=bet-playerPair]');
    await p1.click('[data-testid=bet-bankerPair]');
    await p2.click('[data-testid=bet-player]');
    await p1.click('[data-testid=confirm-bets]');
    await p2.click('[data-testid=confirm-bets]');

    await waitForPhaseContains(p1, '쪼기', 15000);
    let cardCount = 0;
    while (true) {
      const phase = await phaseText(p1);
      if (!/쪼기|추가 카드/.test(phase)) break;
      const p1IsSqueezer = await isSqueezerView(p1);
      await quickReveal(p1IsSqueezer ? p1 : p2);
      cardCount += 1;
      await p1.waitForTimeout(200);
      if (cardCount > 8) throw new Error('squeeze loop did not terminate');
    }

    await waitForPhaseContains(p1, '정산', 8000).catch(() => {});
    const resultText = await p1.locator('text=/승|타이/').first().innerText().catch(() => '');
    const isTie = resultText.includes('타이');
    const settlementRows = await p1.locator('main >> text=/원$/').allInnerTexts().catch(() => []);
    const hadWinRow = (await p1.locator('span.text-emerald-400').count()) > 0;
    console.log(`round ${r + 1}: ${resultText} | win-row=${hadWinRow}`);

    if (isTie && !sawTie) { sawTie = true; await shot(p1, `TIE-round${r + 1}`); }
    if (hadWinRow && !sawSideBetWin) { sawSideBetWin = true; await shot(p1, `SIDEBET-WIN-round${r + 1}`); }

    await waitForPhaseContains(p1, '베팅 시간', 20000);
  }

  console.log('\nsawTie:', sawTie, 'sawSideBetWin:', sawSideBetWin);
  console.log('console errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
})();
