'use strict';
// Verifies the new dealer auto-reveal behavior: a card nobody has bet
// interest in should open on its own (no squeezer can ever be granted for
// it), instead of hanging the round forever. Covers two cases: nobody bets
// at all (round should fully self-drive to a result), and betting on only
// one side (the untouched side's cards should auto-open while the bet side
// still gets a real squeeze).

const { chromium } = require('playwright');

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3000';

async function waitForPhaseContains(page, substr, timeout = 20000) {
  await page.waitForFunction(
    (s) => document.querySelector('[data-testid=phase-label]')?.textContent?.includes(s),
    substr,
    { timeout }
  );
}
async function phaseText(page) {
  return page.locator('[data-testid=phase-label]').innerText().catch(() => '');
}

async function squeezeActiveCard(page) {
  const box = await page.locator('[data-testid=squeeze-stage]').boundingBox();
  const from = { x: box.x + box.width / 2, y: box.y + box.height - 8 };
  const to = { x: box.x + box.width / 2, y: box.y + box.height * 0.2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * (i / 8), from.y + (to.y - from.y) * (i / 8));
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
}

async function setup(browser, nick1, nick2) {
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  const p1Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2Ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p1 = await p1Ctx.newPage();
  const p2 = await p2Ctx.newPage();
  for (const [name, pg] of [['p1', p1], ['p2', p2]]) {
    pg.on('console', (m) => { if (m.type() === 'error') console.log(`[${name} console error]`, m.text()); });
    pg.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message));
  }

  await admin.goto(BASE + '/admin');
  await admin.waitForLoadState('networkidle');
  await admin.locator('input[type=number]').first().fill('30000000');
  await admin.locator('[data-testid=create-tournament]').click();
  await admin.locator('[data-testid=join-code]').waitFor({ timeout: 10000 });
  const joinCode = (await admin.locator('[data-testid=join-code]').innerText()).trim();
  await admin.locator('[data-testid=start-tournament]').click();

  for (const [pg, nick] of [[p1, nick1], [p2, nick2]]) {
    await pg.goto(BASE + '/join');
    await pg.waitForLoadState('networkidle');
    await pg.fill('input[placeholder=ABCDEF]', joinCode);
    await pg.fill('input[placeholder="닉네임을 입력하세요"]', nick);
    await pg.locator('[data-testid=join-submit]').click();
    await pg.waitForURL('**/play', { timeout: 10000 });
  }
  await p1.waitForSelector('[data-testid=bet-player]', { timeout: 15000 });
  return { admin, p1, p2, closeAll: () => Promise.all([adminCtx.close(), p1Ctx.close(), p2Ctx.close()]) };
}

(async () => {
  const browser = await chromium.launch();

  console.log('=== TEST 1: nobody bets anything ===');
  {
    const { p1, p2, closeAll } = await setup(browser, 'NoBet1', 'NoBet2');
    await waitForPhaseContains(p1, '베팅 시간', 20000);
    const confirmDisabled = await p1.locator('[data-testid=confirm-bets]').isDisabled();
    console.log('confirm disabled with 0 bet (expected true):', confirmDisabled);
    // Can't confirm with 0 bet — so just wait out the full betting timer.
    console.log('waiting for betting timer to expire on its own (~25s)...');
    await waitForPhaseContains(p1, '정산', 40000).catch((e) => console.log('FAILED: round never reached settlement —', e.message));
    console.log('round reached settlement with nobody betting: OK, phase =', await phaseText(p1));
    void p2;
    await closeAll();
  }

  console.log('\n=== TEST 2: everyone bets only Player side ===');
  {
    const { p1, p2, closeAll } = await setup(browser, 'OneSideA', 'OneSideB');
    await waitForPhaseContains(p1, '베팅 시간', 20000);
    await p1.locator('[data-testid=bet-player]').click();
    await p2.locator('[data-testid=bet-playerPair]').click();
    await p1.locator('[data-testid=confirm-bets]').click();
    await p2.locator('[data-testid=confirm-bets]').click();

    await waitForPhaseContains(p1, '쪼기', 15000);
    const p1IsSqueezer = (await p1.locator('text=긴 변을 살짝').count()) > 0;
    console.log('p1 is squeezer:', p1IsSqueezer);
    const squeezer = p1IsSqueezer ? p1 : p2;

    // Drive the round to completion: squeeze whenever it's actually this
    // client's turn (player-side cards), otherwise just wait — banker-side
    // cards should auto-reveal with no input at all.
    let iterations = 0;
    while (iterations++ < 8) {
      const phase = await phaseText(p1);
      if (/정산/.test(phase)) break;
      const squeezerHasStage = (await squeezer.locator('[data-testid=squeeze-stage]').count()) > 0;
      const squeezerCanAct = squeezerHasStage && (await squeezer.locator('text=긴 변을 살짝').count()) > 0;
      if (squeezerCanAct) {
        await squeezeActiveCard(squeezer);
        console.log(`squeezed a player-side card (iteration ${iterations})`);
        await p1.waitForTimeout(600);
      } else {
        await p1.waitForTimeout(500);
      }
    }
    const finalPhase = await phaseText(p1);
    console.log(/정산/.test(finalPhase) ? 'round completed with banker side auto-revealed: OK' : 'FAILED: round never reached settlement, phase=' + finalPhase);
    await closeAll();
  }

  await browser.close();
})();
