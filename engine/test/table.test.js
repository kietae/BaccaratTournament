'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const table = require('../../web/src/server/table');
const { buildSnapshot } = require('../../web/src/server/serialize');
const { makeCard } = require('../cards');

function activeTable() {
  const tournament = table.createTournament({ name: 'test', initialChips: 10000, roundLimit: 1 });
  const player = table.addPlayer(tournament, 'squeezer');
  player.connected = true;
  tournament.round.phase = 'squeeze';
  tournament.round.squeezerId = player.id;
  tournament.round.bets.set(player.id, {
    items: new Map([['player', 1000]]), confirmed: true, confirmedAt: 1
  });
  tournament.round.cards = [{
    cardId: 'P2', side: 'player', card: makeCard('7', '♠'), orientation: 'vertical',
    revealed: false, edge: null, pct: 0, grip: 0.5
  }];
  tournament.round.dealIndex = 0;
  tournament.round.cardIndex = 0;
  tournament.round.result = {
    playerCards: [makeCard('7', '♠'), makeCard('K', '♥')],
    bankerCards: [makeCard('6', '♣'), makeCard('K', '♦')],
    playerTotal: 7, bankerTotal: 6, playerNatural: false, bankerNatural: false,
    playerThird: null, bankerThird: null, outcome: 'player'
  };
  return { tournament, player };
}

test('squeeze progress stores card-relative depth and grip safely', () => {
  const { tournament, player } = activeTable();
  const card = table.squeezeProgress(tournament, player.id, 'P2', 'left', 0.25, 0.8);
  assert.equal(card.pct, 0.25);
  assert.equal(card.grip, 0.8);
});

test('any edge reveals only at the practical end stop', () => {
  const { tournament, player } = activeTable();
  assert.throws(() => table.squeezeReveal(tournament, player.id, 'P2', 'left', 1.279, 0.5));
  const revealed = table.squeezeReveal(tournament, player.id, 'P2', 'left', 1.28, 0.5);
  assert.equal(revealed.current.revealed, true);
  assert.equal(revealed.done, false);
  assert.equal(table.completeDealerCall(tournament).done, true);
});

test('a disconnected squeezer no longer blocks dealer auto-reveal', () => {
  const { tournament, player } = activeTable();
  assert.equal(table.cardNeedsSqueeze(tournament, tournament.round.cards[0]), true);
  player.connected = false;
  assert.equal(table.cardNeedsSqueeze(tournament, tournament.round.cards[0]), false);
});

test('players cannot bet or confirm before the admin starts the tournament', () => {
  const tournament = table.createTournament({ name: 'lobby', initialChips: 10000, roundLimit: 1 });
  const player = table.addPlayer(tournament, 'waiting');
  assert.throws(() => table.placeBet(tournament, player.id, 'player', 1000));
  assert.throws(() => table.confirmBets(tournament, player.id));
  assert.equal(tournament.status, 'lobby');
});

test('starting seeds three road games without consuming tournament rounds or chips', () => {
  const tournament = table.createTournament({ name: 'seeded', initialChips: 10000, roundLimit: 2 });
  const player = table.addPlayer(tournament, 'player');
  table.startTournament(tournament);
  assert.equal(tournament.status, 'active');
  assert.equal(tournament.roundNo, 1);
  assert.equal(tournament.roundHistory.length, 3);
  assert.equal(tournament.roundHistory.every((round) => round.seeded === true), true);
  assert.equal(player.chips, 10000);
  assert.equal(table.roundLimitReached(tournament), false);
});

test('snapshot only marks cards through the current deal position as dealt', () => {
  const { tournament } = activeTable();
  tournament.round.cards.push(
    { cardId: 'B1', side: 'banker', card: makeCard('6', 'â™£'), orientation: 'vertical', revealed: false, edge: null, pct: 0, grip: 0.5 },
    { cardId: 'P2', side: 'player', card: makeCard('K', 'â™¥'), orientation: 'vertical', revealed: false, edge: null, pct: 0, grip: 0.5 },
    { cardId: 'P3', side: 'player', card: makeCard('3', 'â™ '), orientation: 'horizontal', revealed: false, edge: null, pct: 0, grip: 0.5 }
  );
  tournament.round.cardIndex = 1;
  tournament.round.dealIndex = 1;
  const snapshot = buildSnapshot(tournament, null);
  assert.deepEqual(snapshot.cards.map((card) => card.dealt), [true, true, false, false]);
});

test('initial deal places P1, B1, P2, B2 before squeeze begins', () => {
  const { tournament } = activeTable();
  tournament.round.cards = [
    { cardId: 'P1' }, { cardId: 'B1' }, { cardId: 'P2' }, { cardId: 'B2' }
  ];
  tournament.round.phase = 'dealing';
  tournament.round.dealIndex = -1;
  const order = [];
  for (let i = 0; i < 4; i++) {
    const finished = table.dealNextInitialCard(tournament);
    order.push(tournament.round.cards[tournament.round.dealIndex].cardId);
    assert.equal(finished, i === 3);
  }
  assert.deepEqual(order, ['P1', 'B1', 'P2', 'B2']);
});

test('third cards are called, paused, and dealt in player then banker order', () => {
  const { tournament, player } = activeTable();
  tournament.round.bets.set(player.id, {
    items: new Map([['tie', 1000]]), confirmed: true, confirmedAt: 1
  });
  const entry = (cardId, side, rank) => ({
    cardId, side, card: makeCard(rank, '♠'),
    orientation: cardId.endsWith('3') ? 'horizontal' : 'vertical',
    revealed: false, edge: null, pct: 0, grip: 0.5
  });
  tournament.round.cards = [
    entry('P1', 'player', 'A'), entry('B1', 'banker', '2'),
    entry('P2', 'player', 'A'), entry('B2', 'banker', '3'),
    entry('P3', 'player', '6'), entry('B3', 'banker', '4')
  ];
  tournament.round.cardIndex = 3;
  tournament.round.dealIndex = 3;

  table.squeezeReveal(tournament, player.id, 'B2', 'left', 1.28, 0.5);
  assert.equal(tournament.round.phase, 'dealer-call');
  assert.equal(tournament.round.log.at(-1).text, 'BANKER 6');
  table.completeDealerCall(tournament);
  assert.equal(tournament.round.phase, 'third-card-call');
  assert.equal(tournament.round.dealIndex, 3);
  assert.equal(tournament.round.log.at(-1).text, 'ONE MORE PLAYER');

  assert.equal(table.dealCalledThirdCard(tournament), true);
  assert.equal(tournament.round.phase, 'extra-card');
  assert.equal(tournament.round.dealIndex, 4);

  table.squeezeReveal(tournament, player.id, 'P3', 'top', 1.28, 0.5);
  assert.equal(tournament.round.phase, 'third-card-call');
  assert.equal(tournament.round.dealIndex, 4);
  assert.equal(tournament.round.log.at(-1).text, 'ONE MORE BANKER');

  assert.equal(table.dealCalledThirdCard(tournament), true);
  assert.equal(tournament.round.dealIndex, 5);
});

test('hands open player-first and natural/result calls pause the reveal flow', () => {
  const { tournament, player } = activeTable();
  tournament.round.bets.set(player.id, {
    items: new Map([['tie', 1000]]), confirmed: true, confirmedAt: 1
  });
  tournament.round.cards = [
    { cardId: 'P1' }, { cardId: 'B1' }, { cardId: 'P2' }, { cardId: 'B2' }
  ];
  tournament.round.cardIndex = 0;
  tournament.round.dealIndex = 3;
  tournament.round.result = {
    playerCards: [makeCard('4', '♠'), makeCard('5', '♥')],
    bankerCards: [makeCard('5', '♣'), makeCard('3', '♦')],
    playerTotal: 9, bankerTotal: 8, outcome: 'player'
  };

  table.beginSqueezeForCurrentCard(tournament);
  assert.deepEqual(tournament.round.cards.map((card) => card.cardId), ['P1', 'P2', 'B1', 'B2']);
  tournament.round.cardIndex = 1;
  tournament.round.cards[1].card = makeCard('5', '♥');
  tournament.round.cards[1].revealed = false;
  const playerCall = table.autoRevealCard(tournament);
  assert.equal(playerCall.done, false);
  assert.equal(tournament.round.phase, 'dealer-call');
  assert.equal(tournament.round.log.at(-1).text, 'PLAYER NATURAL 9');
  table.completeDealerCall(tournament);
  assert.equal(tournament.round.phase, 'squeeze');

  tournament.round.cardIndex = 3;
  tournament.round.cards[3].card = makeCard('3', '♦');
  tournament.round.cards[3].revealed = false;
  table.autoRevealCard(tournament);
  assert.equal(tournament.round.log.at(-1).text, 'BANKER NATURAL 8 · PLAYER WINS');
  assert.equal(table.completeDealerCall(tournament).done, true);
});

test('a single-side bet opens the other hand first and squeezes only card two', () => {
  const { tournament, player } = activeTable();
  tournament.round.cards = [
    { cardId: 'P1', side: 'player' }, { cardId: 'B1', side: 'banker' },
    { cardId: 'P2', side: 'player' }, { cardId: 'B2', side: 'banker' }
  ];
  tournament.round.cardIndex = 0;
  tournament.round.dealIndex = 3;
  table.beginSqueezeForCurrentCard(tournament);

  assert.deepEqual(tournament.round.cards.map((card) => card.cardId), ['B1', 'B2', 'P1', 'P2']);
  assert.equal(table.cardNeedsSqueeze(tournament, tournament.round.cards[0]), false);
  assert.equal(table.cardNeedsSqueeze(tournament, tournament.round.cards[1]), false);
  assert.equal(table.cardNeedsSqueeze(tournament, tournament.round.cards[2]), false);
  assert.equal(table.cardNeedsSqueeze(tournament, tournament.round.cards[3]), true);
});
