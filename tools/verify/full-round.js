'use strict';
// Full end-to-end verification: two real browser contexts (admin + two
// players) drive an actual tournament through several rounds over the live
// dev server, exercising betting, dealing, the real squeeze gesture (both
// long-edge capped peek and short-edge confirm-and-reveal), settlement, and
// the automatic next-round loop. Screenshots are written to tools/verify/shots
// and read back by the agent to visually confirm correctness.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });
let shotN = 0;
async function shot(page, label) {
  shotN += 1;
  const file = path.join(SHOT_DIR, `${String(shotN).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file });
  console.log('shot:', file);
}

async function dragSqueeze(page, from, to, steps = 14) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * (i / steps);
    const y = from.y + (to.y - from.y) * (i / steps);
    await page.mouse.move(x, y);
    await page.waitForTimeout(16);
  }
}
async function release(page) {
  await page.mouse.up();
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

async function squeezeOneCard(page, { doLongPeek }) {
  const box = await stageBox(page);
  if (doLongPeek) {
    // Long edge (right): a capped peek that must ALWAYS spring back.
    const from = { x: box.x + box.width - 8, y: box.y + box.height / 2 };
    const to = { x: box.x + box.width * 0.55, y: box.y + box.height / 2 };
    await dragSqueeze(page, from, to);
    await shot(page, 'squeeze-long-edge-peek-mid-drag');
    await release(page);
    await page.waitForTimeout(500);
    await shot(page, 'squeeze-long-edge-sprung-back');
  }
  // Short edge (bottom): unbounded, releasing past ~55% reveals for real.
  const box2 = await stageBox(page);
  const from2 = { x: box2.x + box2.width / 2, y: box2.y + box2.height - 8 };
  const to2 = { x: box2.x + box2.width / 2, y: box2.y + box2.height * 0.25 };
  await dragSqueeze(page, from2, to2);
  await shot(page, 'squeeze-short-edge-mid-drag');
  await release(page);
  await page.waitForTimeout(700);
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
    pg.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[${name}] ${msg.text()}`);
    });
    pg.on('pageerror', (err) => consoleErrors.push(`[${name}] pageerror: ${err.message}`));
  }

  console.log('--- admin: create + start tournament ---');
  await admin.goto(BASE + '/admin');
  await admin.waitForLoadState('networkidle');
  await admin.locator('input[type=number]').first().fill('30000000');
  await admin.locator('[data-testid=create-tournament]').click();
  await admin.locator('[data-testid=join-code]').waitFor({ timeout: 10000 });
  const joinCode = (await admin.locator('[data-testid=join-code]').innerText()).trim();
  console.log('join code:', joinCode);
  await shot(admin, 'admin-lobby');
  await admin.click('[data-testid=start-tournament]');

  console.log('--- players join ---');
  for (const [pg, nick] of [[p1, 'Squeezer'], [p2, 'Spectator']]) {
    await pg.goto(BASE + '/join');
    await pg.waitForLoadState('networkidle');
    await pg.fill('input[placeholder=ABCDEF]', joinCode);
    await pg.fill('input[placeholder="닉네임을 입력하세요"]', nick);
    await pg.locator('[data-testid=join-submit]').click();
    await pg.waitForURL('**/play', { timeout: 10000 });
  }
  await p1.waitForSelector('[data-testid=bet-player]', { timeout: 15000 });
  await shot(p1, 'betting-board-main-and-side-bets');

  const ROUNDS = 3;
  const outcomes = [];
  for (let r = 0; r < ROUNDS; r++) {
    console.log(`\n=== round ${r + 1} ===`);
    await waitForPhaseContains(p1, '베팅 시간', 20000);
    await p1.click('[data-testid=bet-player]');
    await p1.click('[data-testid=bet-playerPair]');
    await p2.click('[data-testid=bet-banker]');
    if (r === 0) await shot(p1, 'bets-placed-before-confirm');
    await p1.click('[data-testid=confirm-bets]');
    await p2.click('[data-testid=confirm-bets]');

    await waitForPhaseContains(p1, '딜링', 15000).catch(() => {});
    if (r === 0) await shot(p1, 'dealing');
    await waitForPhaseContains(p1, '쪼기', 8000);

    // Squeeze every dealt card in this round (count varies: 4-6 cards).
    let cardCount = 0;
    while (true) {
      const phase = await phaseText(p1);
      if (!/쪼기|추가 카드/.test(phase)) break;
      const p1IsSqueezer = await isSqueezerView(p1);
      const activePage = p1IsSqueezer ? p1 : p2;
      const spectatorPage = p1IsSqueezer ? p2 : p1;
      if (r === 0 && cardCount === 0) await shot(spectatorPage, 'spectator-waiting');
      await squeezeOneCard(activePage, { doLongPeek: cardCount === 0 });
      if (r === 0 && cardCount === 0) await shot(spectatorPage, 'spectator-sees-remote-progress');
      cardCount += 1;
      await p1.waitForTimeout(300);
      if (cardCount > 8) throw new Error('squeeze loop did not terminate');
    }
    console.log('cards squeezed:', cardCount);
    if (r === 0) await shot(p1, 'all-cards-revealed');

    await waitForPhaseContains(p1, '정산', 8000).catch(() => {});
    if (r === 0) { await shot(p1, 'result-payout-p1'); await shot(p2, 'result-payout-p2'); }
    const resultText = await p1.locator('text=/승|타이/').first().innerText().catch(() => '(결과 텍스트 없음)');
    const natural = (await p1.locator('text=내추럴').count()) > 0;
    outcomes.push({ round: r + 1, resultText, natural, cardCount });

    await waitForPhaseContains(p1, '베팅 시간', 20000);
    if (r === 0) await shot(p1, 'next-round-big-road-updated');
  }

  console.log('\nround outcomes:', JSON.stringify(outcomes, null, 2));
  console.log('\nconsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
  if (consoleErrors.length) process.exit(1);
})();
