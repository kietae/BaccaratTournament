'use strict';

const { bigRoadSnapshot, currentBetTotal, cardNeedsSqueeze, activeSqueezerId } = require('./table');

// The squeezer sees the true rank/suit of ONLY the card currently under
// their thumb, the instant it becomes active — that's what makes the peel
// meaningful (they're rendering real pips as they drag). The admin view also
// receives that one active face so it can act as the trusted projector feed.
// Every other card and every ordinary spectator stay blind until
// `entry.revealed` flips server-side (a genuine ≥94%-and-released
// squeeze), never from watching the raw squeeze-progress broadcast.
function cardView(entry, canSeeActiveCard, needsSqueeze, dealt) {
  const base = {
    cardId: entry.cardId,
    side: entry.side,
    orientation: entry.orientation,
    dealt,
    revealed: entry.revealed,
    edge: entry.edge,
    pct: entry.pct,
    grip: entry.grip,
    needsSqueeze
  };
  if (entry.revealed || canSeeActiveCard) {
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

  // A socket can end up asking for a playerId that isn't in *this*
  // tournament (e.g. a stale connection left over from a tournament that
  // was replaced) — treat that exactly like "no player", never build a
  // half-populated `me` with missing fields.
  const mePlayer = forPlayerId ? t.players.get(forPlayerId) : null;
  if (forPlayerId && !mePlayer) forPlayerId = null;

  const myBetEntry = forPlayerId ? round.bets.get(forPlayerId) : null;
  const myBets = myBetEntry ? [...myBetEntry.items.entries()].map(([type, amount]) => ({ type, amount })) : [];
  const mySettlement = forPlayerId && round.settlements ? (round.settlements.get(forPlayerId) || []) : null;

  const currentSqueezerId = activeSqueezerId(t);
  const squeezer = currentSqueezerId ? t.players.get(currentSqueezerId) : null;
  const iAmSqueezingNow =
    forPlayerId != null &&
    forPlayerId === currentSqueezerId &&
    (round.phase === 'squeeze' || round.phase === 'extra-card');
  const adminCanPresentActiveCard =
    forPlayerId == null &&
    (round.phase === 'squeeze' || round.phase === 'extra-card');

  let totalPot = 0;
  const mainBetSummary = {
    player: { bettors: 0, amount: 0 },
    banker: { bettors: 0, amount: 0 }
  };
  for (const bet of round.bets.values()) {
    for (const amt of bet.items.values()) totalPot += amt;
    for (const side of ['player', 'banker']) {
      const amount = Number(bet.items.get(side)) || 0;
      if (amount > 0) {
        mainBetSummary[side].bettors += 1;
        mainBetSummary[side].amount += amount;
      }
    }
  }

  return {
    tournamentId: t.id,
    tournamentName: t.name,
    joinCode: t.joinCode,
    status: t.status,
    initialChips: t.initialChips,
    roundLimit: t.roundLimit,
    bettingSeconds: t.bettingSeconds,
    betLimits: t.betLimits,
    roundNo: t.roundNo,
    phase: round.phase,
    phaseEndsAt: round.phaseEndsAt,
    players,
    playerCount: players.length,
    bigRoad: bigRoadSnapshot(t),
    totalPot,
    mainBetSummary,
    squeezerId: currentSqueezerId,
    squeezerNickname: squeezer ? squeezer.nickname : null,
    isSqueezer: forPlayerId != null && forPlayerId === currentSqueezerId,
    cards: round.cards.map((entry, i) =>
      cardView(entry, (iAmSqueezingNow || adminCanPresentActiveCard) && i === round.cardIndex, cardNeedsSqueeze(t, entry), i <= round.dealIndex)
    ),
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
    me: mePlayer
      ? {
          id: forPlayerId,
          nickname: mePlayer.nickname,
          chips: mePlayer.chips,
          bets: myBets,
          confirmed: !!(myBetEntry && myBetEntry.confirmed),
          betTotal: currentBetTotal(t, forPlayerId),
          settlement: mySettlement
        }
      : null
  };
}

module.exports = { buildSnapshot };
