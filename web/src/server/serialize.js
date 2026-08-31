'use strict';

const { bigRoadSnapshot, currentBetTotal, cardNeedsSqueeze, activeSqueezerId } = require('./table');
const { QUIZZES } = require('./workshopQuizData');

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
  return { id: p.id, nickname: p.nickname, employeeId: p.employeeId, chips: p.chips, connected: p.connected };
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
  const squeezeAuthorities = Object.fromEntries(['player', 'banker'].map((side) => {
    const playerId = round.squeezers[side];
    const player = playerId ? t.players.get(playerId) : null;
    return [side, { playerId: playerId || null, nickname: player?.nickname || null }];
  }));
  // Everyone watches the same live peel for the active card. Cards that have
  // not reached the squeeze position remain hidden from every client.
  const canWatchActiveCard = round.phase === 'squeeze' || round.phase === 'extra-card';
  const miniGame = {
    type: t.miniGame.type,
    status: t.miniGame.status,
    submittedCount: t.miniGame.submissions.size,
    totalPlayers: t.players.size,
    endsAt: t.miniGame.endsAt,
    hasSubmitted: forPlayerId != null && t.miniGame.submissions.has(forPlayerId),
    myNumber: forPlayerId != null ? (t.miniGame.submissions.get(forPlayerId) ?? null) : null,
    average: t.miniGame.status === 'revealed' ? t.miniGame.average : null,
    target: t.miniGame.status === 'revealed' ? t.miniGame.target : null,
    results: t.miniGame.status === 'revealed' ? t.miniGame.results : []
  };
  const raffleEntries = [...t.raffle.entries.entries()].map(([playerId, number]) => ({ playerId, number, nickname: t.players.get(playerId)?.nickname || '-' }));
  const raffle = {
    status: t.raffle.status,
    entries: raffleEntries,
    myNumber: forPlayerId ? (t.raffle.entries.get(forPlayerId) ?? null) : null,
    prizes: t.raffle.prizes,
    winners: t.raffle.winners,
    remainingNumbers: raffleEntries.filter((entry) => !t.raffle.winners.some((winner) => winner.playerId === entry.playerId)).map((entry) => entry.number)
  };
  const rpsWinner = t.rps.winnerId ? t.players.get(t.rps.winnerId) : null;
  const rps = {
    status: t.rps.status,
    roundNo: t.rps.roundNo,
    aliveIds: [...t.rps.alive],
    alivePlayers: [...t.rps.alive].map((playerId) => ({ playerId, nickname: t.players.get(playerId)?.nickname || '-' })),
    submittedCount: t.rps.choices.size,
    myChoice: forPlayerId ? (t.rps.choices.get(forPlayerId) ?? null) : null,
    computerChoice: t.rps.status === 'selecting' ? null : t.rps.computerChoice,
    roundWinnerIds: t.rps.status === 'selecting' ? [] : t.rps.roundWinners,
    roundChoices: t.rps.status === 'selecting' ? [] : [...t.rps.choices].map(([playerId, choice]) => ({
      playerId,
      nickname: t.players.get(playerId)?.nickname || '-',
      choice
    })),
    winner: rpsWinner ? { playerId: rpsWinner.id, nickname: rpsWinner.nickname, employeeId: rpsWinner.employeeId } : null
  };
  const myTeam = forPlayerId ? t.teams.find((team) => team.playerIds.includes(forPlayerId)) : null;
  const quizDefinition = t.workshopQuiz.type ? QUIZZES[t.workshopQuiz.type] : null;
  const sourceQuestionIndex = t.workshopQuiz.questionOrder?.[t.workshopQuiz.questionIndex] ?? t.workshopQuiz.questionIndex;
  const currentQuestion = quizDefinition?.questions[sourceQuestionIndex] || null;
  const teams = t.teams.map((team) => ({
    id: team.id,
    name: team.name,
    score: team.score,
    members: team.playerIds.map((playerId) => ({ playerId, nickname: t.players.get(playerId)?.nickname || '-' }))
  }));
  const workshopQuiz = {
    type: t.workshopQuiz.type,
    title: quizDefinition?.title || null,
    input: quizDefinition?.input || null,
    status: t.workshopQuiz.status,
    questionIndex: t.workshopQuiz.questionIndex,
    totalQuestions: t.workshopQuiz.questionOrder?.length || 0,
    question: currentQuestion ? {
      category: currentQuestion.category,
      prompt: currentQuestion.prompt,
      image: currentQuestion.image || null,
      answerImage: t.workshopQuiz.status === 'revealed' || t.workshopQuiz.status === 'finished' ? (currentQuestion.answerImage || null) : null,
      answer: t.workshopQuiz.status === 'revealed' || t.workshopQuiz.status === 'finished' ? currentQuestion.answer : null,
      explanation: t.workshopQuiz.status === 'revealed' || t.workshopQuiz.status === 'finished' ? (currentQuestion.explanation || null) : null
    } : null,
    myTeamId: myTeam?.id || null,
    awardedTeamId: t.workshopQuiz.awardedTeamId || null
  };

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
    miniGameSeconds: t.miniGameSeconds,
    betLimits: t.betLimits,
    payoutMode: t.payoutMode,
    initialRoadGames: t.initialRoadGames,
    seedProgress: t.seedProgress,
    seedPreview: t.seedPreview,
    miniGame,
    raffle,
    rps,
    teams,
    workshopQuiz,
    awards: t.awards,
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
    squeezeAuthorities,
    cards: round.cards.map((entry, i) =>
      cardView(entry, canWatchActiveCard && i === round.cardIndex, cardNeedsSqueeze(t, entry), i <= round.dealIndex)
    ),
    result: round.result && round.cards.every((c) => c.revealed)
      ? {
          outcome: round.result.outcome,
          playerTotal: round.result.playerTotal,
          bankerTotal: round.result.bankerTotal,
          playerNatural: round.result.playerNatural,
          bankerNatural: round.result.bankerNatural,
          sideBetHits: Object.entries(round.result.sideBets || {}).filter(([, hit]) => hit).map(([type]) => type)
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
