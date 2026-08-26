'use strict';

const { bigRoadSnapshot, currentBetTotal } = require('./table');

// The squeezer sees the true rank/suit of ONLY the card currently under
// their thumb, the instant it becomes active — that's what makes the peel
// meaningful (they're rendering real pips as they drag). Every other card,
// for every other viewer including the squeezer themself, stays blind until
// `entry.revealed` flips server-side (a genuine ≥55%-and-released short-edge
// squeeze), never from watching the raw squeeze-progress broadcast.
function cardView(entry, isActiveForSqueezer) {
  const base = {
    cardId: entry.cardId,
    side: entry.side,
    orientation: entry.orientation,
    revealed: entry.revealed,
    edge: entry.edge,
    pct: entry.pct
  };
  if (entry.revealed || isActiveForSqueezer) {
    base.rank = entry.card.rank;
    base.suit = entry.card.suit;
  }
  return base;
}

function playerPublicView(p) {
  return { id: p.id, nickname: p.nickname, chips: p.chips, connected: p.connected };
}

// Full snapshot sent to `forPlayerId` (or the admin view when null/omitted).
// Other players' individual bet line-items are never exposed — only totals.
function buildSnapshot(t, forPlayerId) {
  const round = t.round;
  const players = [...t.players.values()].map(playerPublicView);

  const myBetEntry = forPlayerId ? round.bets.get(forPlayerId) : null;
  const myBets = myBetEntry ? [...myBetEntry.items.entries()].map(([type, amount]) => ({ type, amount })) : [];
  const mySettlement = forPlayerId && round.settlements ? (round.settlements.get(forPlayerId) || []) : null;

  const squeezer = round.squeezerId ? t.players.get(round.squeezerId) : null;
  const iAmSqueezingNow =
    forPlayerId != null &&
    forPlayerId === round.squeezerId &&
    (round.phase === 'squeeze' || round.phase === 'extra-card');

  let totalPot = 0;
  for (const bet of round.bets.values()) {
    for (const amt of bet.items.values()) totalPot += amt;
  }

  return {
    tournamentId: t.id,
    tournamentName: t.name,
    joinCode: t.joinCode,
    status: t.status,
    initialChips: t.initialChips,
    roundLimit: t.roundLimit,
    roundNo: t.roundNo,
    phase: round.phase,
    phaseEndsAt: round.phaseEndsAt,
    players,
    playerCount: players.length,
    bigRoad: bigRoadSnapshot(t),
    totalPot,
    squeezerId: round.squeezerId,
    squeezerNickname: squeezer ? squeezer.nickname : null,
    isSqueezer: forPlayerId != null && forPlayerId === round.squeezerId,
    cards: round.cards.map((entry, i) => cardView(entry, iAmSqueezingNow && i === round.cardIndex)),
    result: round.result && round.cards.every((c) => c.revealed)
      ? {
          outcome: round.result.outcome,
          playerTotal: round.result.playerTotal,
          bankerTotal: round.result.bankerTotal,
          playerNatural: round.result.playerNatural,
          bankerNatural: round.result.bankerNatural
        }
      : null,
    log: round.log,
    me: forPlayerId
      ? {
          id: forPlayerId,
          nickname: t.players.get(forPlayerId)?.nickname,
          chips: t.players.get(forPlayerId)?.chips,
          bets: myBets,
          confirmed: !!(myBetEntry && myBetEntry.confirmed),
          betTotal: currentBetTotal(t, forPlayerId),
          settlement: mySettlement
        }
      : null
  };
}

module.exports = { buildSnapshot };
