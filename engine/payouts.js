'use strict';

const { isPair } = require('./cards');

// Payout odds, expressed as "to 1" (a winning 1-unit bet returns 1 + odds units).
// Player/Banker/Tie are the researched-and-approved main-bet odds; Banker carries
// the standard 5% commission. Side-bet odds are the figures signed off on earlier
// (comboP7B6 is a rough estimate pending a final actuarial pass).
const PAYOUTS = {
  player: 1,
  banker: 0.95,
  tie: 8,
  playerPair: 11,
  bankerPair: 11,
  banker6TwoCard: 22,
  banker6ThreeCard: 50,
  player7TwoCard: 15,
  player7ThreeCard: 30,
  comboP7B6: 30
};

const BET_TYPES = Object.keys(PAYOUTS);

function evaluateSideBets(result) {
  const bankerWonWith6 = result.outcome === 'banker' && result.bankerTotal === 6;
  const playerWonWith7 = result.outcome === 'player' && result.playerTotal === 7;

  return {
    playerPair: isPair(result.playerCards),
    bankerPair: isPair(result.bankerCards),
    banker6TwoCard: bankerWonWith6 && result.bankerCards.length === 2,
    banker6ThreeCard: bankerWonWith6 && result.bankerCards.length === 3,
    player7TwoCard: playerWonWith7 && result.playerCards.length === 2,
    player7ThreeCard: playerWonWith7 && result.playerCards.length === 3,
    comboP7B6: result.outcome === 'player' && result.playerTotal === 7 && result.bankerTotal === 6
  };
}

// bets: [{ type, amount }]. Returns each bet annotated with result/payout/net.
// payout = total chips returned to the player (0 on a loss); net = payout - amount.
function settleBets(bets, result, payoutMode = 'no-commission') {
  if (payoutMode !== 'commission' && payoutMode !== 'no-commission') {
    throw new Error('Unknown payout mode: ' + payoutMode);
  }
  const side = evaluateSideBets(result);
  const hit = {
    player: result.outcome === 'player',
    banker: result.outcome === 'banker',
    tie: result.outcome === 'tie',
    ...side
  };

  return bets.map((bet) => {
    if (!BET_TYPES.includes(bet.type)) {
      throw new Error('Unknown bet type: ' + bet.type);
    }

    // Player/Banker bets push (stake returned, no win/loss) when the round ties.
    if ((bet.type === 'player' || bet.type === 'banker') && result.outcome === 'tie') {
      return { ...bet, result: 'push', payout: bet.amount, net: 0 };
    }

    if (hit[bet.type]) {
      const cardCount = result.playerCards.length + result.bankerCards.length;
      let odds;
      if (bet.type === 'banker') {
        odds = payoutMode === 'commission' ? PAYOUTS.banker : result.bankerTotal === 6 ? 0.5 : 1;
      } else {
        odds = bet.type === 'comboP7B6'
          ? ({ 4: 30, 5: 40, 6: 100 }[cardCount] || PAYOUTS.comboP7B6)
          : PAYOUTS[bet.type];
      }
      const net = bet.amount * odds;
      return { ...bet, result: 'win', payout: bet.amount + net, net };
    }

    return { ...bet, result: 'lose', payout: 0, net: -bet.amount };
  });
}

module.exports = { PAYOUTS, BET_TYPES, evaluateSideBets, settleBets };
