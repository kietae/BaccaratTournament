'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { makeCard, handValue, cardValue, createShoe, shuffle, freshDeck } = require('../cards');
const { resolveRound } = require('../rules');

function noDraw() {
  throw new Error('draw() should not be called for this hand');
}
function queueDraw(cards) {
  let i = 0;
  return () => {
    if (i >= cards.length) throw new Error('draw queue exhausted');
    return cards[i++];
  };
}

test('cardValue: A=1, number cards face value, 10/J/Q/K=0', () => {
  assert.equal(cardValue('A'), 1);
  assert.equal(cardValue('7'), 7);
  assert.equal(cardValue('9'), 9);
  assert.equal(cardValue('10'), 0);
  assert.equal(cardValue('J'), 0);
  assert.equal(cardValue('Q'), 0);
  assert.equal(cardValue('K'), 0);
});

test('handValue takes the ones digit of the sum', () => {
  const h = [makeCard('9', '♠'), makeCard('9', '♥')]; // 18 -> 8
  assert.equal(handValue(h), 8);
});

test('player natural 9 vs banker natural 8: no draws, player wins', () => {
  const player = [makeCard('9', '♠'), makeCard('K', '♥')]; // 9
  const banker = [makeCard('8', '♠'), makeCard('K', '♥')]; // 8
  const r = resolveRound(player, banker, noDraw);
  assert.equal(r.playerNatural, true);
  assert.equal(r.bankerNatural, true);
  assert.equal(r.playerCards.length, 2);
  assert.equal(r.bankerCards.length, 2);
  assert.equal(r.outcome, 'player');
});

test('both naturals equal totals -> tie, no draws', () => {
  const player = [makeCard('9', '♠'), makeCard('K', '♥')]; // 9
  const banker = [makeCard('4', '♠'), makeCard('5', '♥')]; // 9
  const r = resolveRound(player, banker, noDraw);
  assert.equal(r.outcome, 'tie');
});

test('player total 0-5 draws a third card', () => {
  const player = [makeCard('2', '♠'), makeCard('3', '♥')]; // 5
  const banker = [makeCard('7', '♠'), makeCard('K', '♥')]; // 7, no natural
  const draw = queueDraw([makeCard('4', '♦')]); // player 3rd only (banker stands on 7)
  const r = resolveRound(player, banker, draw);
  assert.equal(r.playerCards.length, 3);
  assert.equal(r.bankerCards.length, 2);
  assert.equal(r.playerTotal, 9); // 5 + 4
  assert.equal(r.outcome, 'player');
});

test('player total 6-7 stands, banker draws on <=5 when player stands', () => {
  const player = [makeCard('4', '♠'), makeCard('2', '♥')]; // 6, stands
  const banker = [makeCard('2', '♠'), makeCard('2', '♥')]; // 4, draws (player stood)
  const draw = queueDraw([makeCard('K', '♦')]);
  const r = resolveRound(player, banker, draw);
  assert.equal(r.playerCards.length, 2);
  assert.equal(r.bankerCards.length, 3);
  assert.equal(r.bankerTotal, 4); // 4 + 0
});

test('banker tableau: banker 3, player third=8 -> banker does NOT draw', () => {
  const player = [makeCard('2', '♠'), makeCard('A', '♥')]; // total 3, low, will draw
  const banker = [makeCard('2', '♠'), makeCard('A', '♥')]; // 3
  const draw = queueDraw([makeCard('8', '♦')]); // player third card value 8
  const r = resolveRound(player, banker, draw);
  assert.equal(r.playerCards.length, 3);
  assert.equal(r.bankerCards.length, 2); // banker stands
  assert.equal(r.bankerTotal, 3);
});

test('banker tableau: banker 3, player third != 8 -> banker draws', () => {
  const player = [makeCard('2', '♠'), makeCard('A', '♥')]; // 3, draws
  const banker = [makeCard('2', '♠'), makeCard('A', '♥')]; // 3
  const draw = queueDraw([makeCard('5', '♦'), makeCard('K', '♣')]);
  const r = resolveRound(player, banker, draw);
  assert.equal(r.bankerCards.length, 3);
});

test('banker tableau: banker 6, player third=6 -> banker draws', () => {
  const player = [makeCard('3', '♠'), makeCard('2', '♥')]; // 5, draws
  const banker = [makeCard('4', '♠'), makeCard('2', '♥')]; // 6
  const draw = queueDraw([makeCard('6', '♦'), makeCard('3', '♣')]);
  const r = resolveRound(player, banker, draw);
  assert.equal(r.bankerCards.length, 3);
});

test('banker tableau: banker 6, player third=5 -> banker stands', () => {
  const player = [makeCard('3', '♠'), makeCard('2', '♥')]; // 5, draws
  const banker = [makeCard('4', '♠'), makeCard('2', '♥')]; // 6
  const draw = queueDraw([makeCard('5', '♦')]);
  const r = resolveRound(player, banker, draw);
  assert.equal(r.bankerCards.length, 2);
});

test('banker tableau: banker <=2 always draws regardless of player third', () => {
  const player = [makeCard('3', '♠'), makeCard('2', '♥')]; // 5, draws
  const banker = [makeCard('A', '♠'), makeCard('A', '♥')]; // 2
  const draw = queueDraw([makeCard('9', '♦'), makeCard('3', '♣')]);
  const r = resolveRound(player, banker, draw);
  assert.equal(r.bankerCards.length, 3);
});

test('banker tableau: banker 7 always stands', () => {
  const player = [makeCard('3', '♠'), makeCard('2', '♥')]; // 5, draws
  const banker = [makeCard('4', '♠'), makeCard('3', '♥')]; // 7
  const draw = queueDraw([makeCard('9', '♦')]);
  const r = resolveRound(player, banker, draw);
  assert.equal(r.bankerCards.length, 2);
});

test('createShoe(8) has 416 cards with correct rank distribution', () => {
  const shoe = createShoe(8, () => 0.5);
  assert.equal(shoe.length, 416);
  const nines = shoe.filter((c) => c.rank === '9');
  assert.equal(nines.length, 8 * 4); // 8 decks * 4 suits
});

test('shuffle is a permutation (same cards, injectable rng)', () => {
  const deck = freshDeck();
  const shuffled = shuffle(deck, () => 0.999999);
  assert.equal(shuffled.length, deck.length);
  const sortKey = (c) => c.rank + c.suit;
  assert.deepEqual(shuffled.map(sortKey).sort(), deck.map(sortKey).sort());
});
