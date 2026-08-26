'use strict';

const { cardValue, handValue } = require('./cards');

// Standard Punto Banco tableau. `draw` is a () => Card callback so callers
// (and tests) can control exactly which card gets dealt third.
function resolveRound(initialPlayerCards, initialBankerCards, draw) {
  let playerCards = initialPlayerCards.slice();
  let bankerCards = initialBankerCards.slice();
  let playerTotal = handValue(playerCards);
  let bankerTotal = handValue(bankerCards);

  const playerNatural = playerTotal >= 8;
  const bankerNatural = bankerTotal >= 8;

  let playerThird = null;
  let bankerThird = null;

  if (!playerNatural && !bankerNatural) {
    if (playerTotal <= 5) {
      playerThird = draw();
      playerCards = playerCards.concat([playerThird]);
      playerTotal = handValue(playerCards);
    }

    let bankerDraws;
    if (playerThird === null) {
      bankerDraws = bankerTotal <= 5;
    } else {
      const pv = cardValue(playerThird.rank);
      if (bankerTotal <= 2) bankerDraws = true;
      else if (bankerTotal === 3) bankerDraws = pv !== 8;
      else if (bankerTotal === 4) bankerDraws = pv >= 2 && pv <= 7;
      else if (bankerTotal === 5) bankerDraws = pv >= 4 && pv <= 7;
      else if (bankerTotal === 6) bankerDraws = pv === 6 || pv === 7;
      else bankerDraws = false; // bankerTotal === 7
    }

    if (bankerDraws) {
      bankerThird = draw();
      bankerCards = bankerCards.concat([bankerThird]);
      bankerTotal = handValue(bankerCards);
    }
  }

  let outcome;
  if (playerTotal > bankerTotal) outcome = 'player';
  else if (bankerTotal > playerTotal) outcome = 'banker';
  else outcome = 'tie';

  return {
    playerCards, bankerCards,
    playerTotal, bankerTotal,
    playerNatural, bankerNatural,
    playerThird, bankerThird,
    outcome
  };
}

module.exports = { resolveRound };
