'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { makeCard } = require('../cards');
const { evaluateSideBets, settleBets, PAYOUTS } = require('../payouts');

function baseResult(overrides) {
  return Object.assign({
    playerCards: [makeCard('9', '♠'), makeCard('K', '♥')],
    bankerCards: [makeCard('8', '♠'), makeCard('K', '♥')],
    playerTotal: 9,
    bankerTotal: 8,
    playerNatural: true,
    bankerNatural: true,
    outcome: 'player'
  }, overrides);
}

test('main bet win: player bet on a player-win round pays 1:1', () => {
  const result = baseResult();
  const [settled] = settleBets([{ type: 'player', amount: 1000 }], result);
  assert.equal(settled.result, 'win');
  assert.equal(settled.net, 1000);
  assert.equal(settled.payout, 2000);
});

test('main bet loss: banker bet on a player-win round loses the stake', () => {
  const result = baseResult();
  const [settled] = settleBets([{ type: 'banker', amount: 1000 }], result);
  assert.equal(settled.result, 'lose');
  assert.equal(settled.net, -1000);
  assert.equal(settled.payout, 0);
});

test('banker win pays 0.95:1 (5% commission)', () => {
  const result = baseResult({ outcome: 'banker' });
  const [settled] = settleBets([{ type: 'banker', amount: 1000 }], result);
  assert.equal(settled.net, 950);
  assert.equal(settled.payout, 1950);
});

test('tie: player/banker bets push (stake returned, no win/loss)', () => {
  const result = baseResult({ outcome: 'tie' });
  const bets = [{ type: 'player', amount: 1000 }, { type: 'banker', amount: 500 }];
  const [p, b] = settleBets(bets, result);
  assert.equal(p.result, 'push');
  assert.equal(p.net, 0);
  assert.equal(p.payout, 1000);
  assert.equal(b.result, 'push');
  assert.equal(b.payout, 500);
});

test('tie bet wins 8:1 when the round ties, loses otherwise', () => {
  const tieResult = baseResult({ outcome: 'tie' });
  const [win] = settleBets([{ type: 'tie', amount: 100 }], tieResult);
  assert.equal(win.result, 'win');
  assert.equal(win.net, 800);

  const nonTie = baseResult();
  const [lose] = settleBets([{ type: 'tie', amount: 100 }], nonTie);
  assert.equal(lose.result, 'lose');
});

test('evaluateSideBets: player pair detected from matching ranks', () => {
  const result = baseResult({ playerCards: [makeCard('7', '♠'), makeCard('7', '♥')] });
  const side = evaluateSideBets(result);
  assert.equal(side.playerPair, true);
  assert.equal(side.bankerPair, false);
});

test('evaluateSideBets: banker-6 two-card vs three-card are mutually exclusive', () => {
  const twoCard = baseResult({
    outcome: 'banker', bankerTotal: 6,
    bankerCards: [makeCard('4', '♠'), makeCard('2', '♥')]
  });
  const threeCard = baseResult({
    outcome: 'banker', bankerTotal: 6,
    bankerCards: [makeCard('4', '♠'), makeCard('A', '♥'), makeCard('A', '♦')]
  });
  assert.deepEqual(evaluateSideBets(twoCard).banker6TwoCard, true);
  assert.deepEqual(evaluateSideBets(twoCard).banker6ThreeCard, false);
  assert.deepEqual(evaluateSideBets(threeCard).banker6TwoCard, false);
  assert.deepEqual(evaluateSideBets(threeCard).banker6ThreeCard, true);
});

test('evaluateSideBets: player-7 two-card and three-card', () => {
  const twoCard = baseResult({
    outcome: 'player', playerTotal: 7,
    playerCards: [makeCard('4', '♠'), makeCard('3', '♥')]
  });
  assert.equal(evaluateSideBets(twoCard).player7TwoCard, true);
  assert.equal(evaluateSideBets(twoCard).player7ThreeCard, false);
});

test('evaluateSideBets: combo Player7 & Banker6 requires both exact totals', () => {
  const hit = baseResult({ outcome: 'player', playerTotal: 7, bankerTotal: 6 });
  const miss = baseResult({ outcome: 'player', playerTotal: 7, bankerTotal: 5 });
  assert.equal(evaluateSideBets(hit).comboP7B6, true);
  assert.equal(evaluateSideBets(miss).comboP7B6, false);
});

test('side bet settlement pays configured odds on a hit', () => {
  const result = baseResult({ playerCards: [makeCard('7', '♠'), makeCard('7', '♥')] });
  const [settled] = settleBets([{ type: 'playerPair', amount: 100 }], result);
  assert.equal(settled.result, 'win');
  assert.equal(settled.net, 100 * PAYOUTS.playerPair);
});

test('unknown bet type throws', () => {
  const result = baseResult();
  assert.throws(() => settleBets([{ type: 'nonsense', amount: 10 }], result));
});
