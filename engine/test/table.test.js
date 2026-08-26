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
    cardId: 'P1', side: 'player', card: makeCard('7', '♠'), orientation: 'vertical',
    revealed: false, edge: null, pct: 0, grip: 0.5
  }];
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
  const card = table.squeezeProgress(tournament, player.id, 'P1', 'left', 0.25, 0.8);
  assert.equal(card.pct, 0.25);
  assert.equal(card.grip, 0.8);
});

test('short-edge reveal requires 55% of the full card extent', () => {
  const { tournament, player } = activeTable();
  assert.throws(() => table.squeezeReveal(tournament, player.id, 'P1', 'bottom', 0.549, 0.5));
  const revealed = table.squeezeReveal(tournament, player.id, 'P1', 'bottom', 0.55, 0.5);
  assert.equal(revealed.current.revealed, true);
  assert.equal(revealed.done, true);
});

test('a disconnected squeezer no longer blocks dealer auto-reveal', () => {
  const { tournament, player } = activeTable();
  assert.equal(table.cardNeedsSqueeze(tournament, tournament.round.cards[0]), true);
  player.connected = false;
  assert.equal(table.cardNeedsSqueeze(tournament, tournament.round.cards[0]), false);
});

test('snapshot only marks cards through the current deal position as dealt', () => {
  const { tournament } = activeTable();
  tournament.round.cards.push(
    { cardId: 'B1', side: 'banker', card: makeCard('6', 'â™£'), orientation: 'vertical', revealed: false, edge: null, pct: 0, grip: 0.5 },
    { cardId: 'P2', side: 'player', card: makeCard('K', 'â™¥'), orientation: 'vertical', revealed: false, edge: null, pct: 0, grip: 0.5 },
    { cardId: 'P3', side: 'player', card: makeCard('3', 'â™ '), orientation: 'horizontal', revealed: false, edge: null, pct: 0, grip: 0.5 }
  );
  tournament.round.cardIndex = 1;
  const snapshot = buildSnapshot(tournament, null);
  assert.deepEqual(snapshot.cards.map((card) => card.dealt), [true, true, false, false]);
});
