'use strict';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

function cardValue(rank) {
  if (rank === 'A') return 1;
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0;
  return Number(rank);
}

function makeCard(rank, suit) {
  return { rank, suit };
}

function handValue(cards) {
  const sum = cards.reduce((total, c) => total + cardValue(c.rank), 0);
  return sum % 10;
}

function isPair(cards) {
  return cards.length >= 2 && cards[0].rank === cards[1].rank;
}

function freshDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(makeCard(rank, suit));
  }
  return deck;
}

function shuffle(array, rng) {
  const random = rng || Math.random;
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// An 8-deck shoe, shuffled. `rng` is injectable for deterministic tests.
function createShoe(deckCount, rng) {
  const decks = deckCount == null ? 8 : deckCount;
  let cards = [];
  for (let i = 0; i < decks; i++) cards = cards.concat(freshDeck());
  return shuffle(cards, rng);
}

// Simple stateful shoe with a draw() cursor and a low-card cut warning.
function makeDealer(shoe) {
  let cursor = 0;
  return {
    draw() {
      if (cursor >= shoe.length) throw new Error('Shoe exhausted');
      return shoe[cursor++];
    },
    remaining() {
      return shoe.length - cursor;
    },
    needsReshuffle(cutCardDepth) {
      const depth = cutCardDepth == null ? 14 : cutCardDepth; // cards left before reshuffle is needed
      return shoe.length - cursor <= depth;
    }
  };
}

module.exports = {
  RANKS, SUITS,
  cardValue, makeCard, handValue, isPair,
  freshDeck, shuffle, createShoe, makeDealer
};
