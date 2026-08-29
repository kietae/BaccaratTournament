'use strict';

const crypto = require('crypto');
const path = require('path');
const engine = require(path.join(__dirname, '..', '..', '..', 'engine'));
const { buildBigRoad } = require('./bigroad');
const { BET_TYPE_SET } = require('./betTypes');

const BETTING_SECONDS = 25;
const NEXT_ROUND_SECONDS = 6;
const DEFAULT_INITIAL_CHIPS = 30000000;
const DEFAULT_BET_LIMITS = { mainMin: 100000, mainMax: 10000000, sideMin: 10000, sideMax: 1000000 };

function id() {
  return crypto.randomBytes(8).toString('hex');
}
function token() {
  return crypto.randomBytes(24).toString('hex');
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no O/I
function joinCode() {
  let s = '';
  for (let i = 0; i < 3; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

// One Tournament = one shared table. Simplified on purpose: this is an
// internal staff-event tool, not a multi-tenant product, so a single active
// table per server process is enough. Everything is in-memory; a player's
// reconnect token is the durability mechanism (survives refresh/disconnect
// for the lifetime of the server process, not a server restart).
function positiveNumber(value, fallback) {
  const n = Math.floor(Number(value));
  return n > 0 ? n : fallback;
}

function createTournament({ name, initialChips, roundLimit, bettingSeconds, initialRoadGames, betLimits, payoutMode } = {}) {
  const limits = {
    mainMin: positiveNumber(betLimits?.mainMin, DEFAULT_BET_LIMITS.mainMin),
    mainMax: positiveNumber(betLimits?.mainMax, DEFAULT_BET_LIMITS.mainMax),
    sideMin: positiveNumber(betLimits?.sideMin, DEFAULT_BET_LIMITS.sideMin),
    sideMax: positiveNumber(betLimits?.sideMax, DEFAULT_BET_LIMITS.sideMax)
  };
  if (limits.mainMax < limits.mainMin) limits.mainMax = limits.mainMin;
  if (limits.sideMax < limits.sideMin) limits.sideMax = limits.sideMin;
  return {
    id: id(),
    name: name || '바카라 토너먼트',
    initialChips: initialChips > 0 ? initialChips : DEFAULT_INITIAL_CHIPS,
    roundLimit: roundLimit > 0 ? roundLimit : null,
    bettingSeconds: positiveNumber(bettingSeconds, BETTING_SECONDS),
    initialRoadGames: Math.max(0, Math.min(50, Math.floor(Number(initialRoadGames ?? 3)) || 0)),
    seedProgress: 0,
    seedPreview: null,
    betLimits: limits,
    payoutMode: payoutMode === 'commission' ? 'commission' : 'no-commission',
    adminToken: token(),
    joinCode: joinCode(),
    status: 'lobby', // lobby | active | finished
    createdAt: Date.now(),
    players: new Map(), // playerId -> player
    tokenIndex: new Map(), // token -> playerId
    shoe: engine.makeDealer(engine.createShoe(8)),
    roundNo: 0,
    roundHistory: [], // { roundNo, outcome, playerTotal, bankerTotal }
    round: freshRound(0),
    miniGame: { type: null, status: 'idle', submissions: new Map(), submissionOrder: new Map(), nextSubmissionOrder: 1, average: null, target: null, results: [], endsAt: null },
    timers: {}
  };
}

function freshRound(roundNo) {
  return {
    roundNo,
    phase: 'betting-wait',
    phaseEndsAt: null,
    bets: new Map(), // playerId -> { items: Map<type, amount>, confirmed, confirmedAt }
    squeezers: { player: null, banker: null },
    cards: [], // ordered list of card descriptors for this round
    dealIndex: -1, // last card physically placed on the table
    cardIndex: 0, // pointer into cards[] for the one currently squeezable
    callNextAction: 'continue', // continue | finish
    result: null, // full engine.resolveRound() output (server-authoritative, hidden from clients until revealed)
    settlements: null, // Map<playerId, settledBet[]>
    log: [] // { type, text, at } caption/call log for this round
  };
}

function addPlayer(t, nickname) {
  const player = {
    id: id(),
    token: token(),
    nickname: String(nickname || '').trim().slice(0, 20) || '플레이어',
    chips: t.initialChips,
    connected: false,
    socketId: null,
    joinedAt: Date.now()
  };
  t.players.set(player.id, player);
  t.tokenIndex.set(player.token, player.id);
  return player;
}

function playerByToken(t, tok) {
  const pid = t.tokenIndex.get(tok);
  return pid ? t.players.get(pid) : null;
}

function currentBetTotal(t, playerId) {
  const b = t.round.bets.get(playerId);
  if (!b) return 0;
  let sum = 0;
  for (const amt of b.items.values()) sum += amt;
  return sum;
}

function ensureBetEntry(t, playerId) {
  let b = t.round.bets.get(playerId);
  if (!b) {
    b = { items: new Map(), confirmed: false, confirmedAt: null };
    t.round.bets.set(playerId, b);
  }
  return b;
}

class GameError extends Error {}

function placeBet(t, playerId, type, amount) {
  if (t.status !== 'active') throw new GameError('관리자가 토너먼트를 시작하지 않았습니다');
  if (t.round.phase !== 'betting-wait') throw new GameError('베팅 시간이 아닙니다');
  if (!BET_TYPE_SET.has(type)) throw new GameError('알 수 없는 베팅 종류');
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  const player = t.players.get(playerId);
  if (!player) throw new GameError('참가자를 찾을 수 없습니다');
  const isMain = type === 'player' || type === 'banker';
  const min = isMain ? t.betLimits.mainMin : t.betLimits.sideMin;
  const max = isMain ? t.betLimits.mainMax : t.betLimits.sideMax;
  if (amt > 0 && amt < min) throw new GameError(`최소 베팅금액은 ${min.toLocaleString('ko-KR')}원입니다`);
  if (amt > max) throw new GameError(`최대 베팅금액은 ${max.toLocaleString('ko-KR')}원입니다`);

  const bet = ensureBetEntry(t, playerId);
  if (bet.confirmed) throw new GameError('이미 베팅을 확정했습니다');

  const currentForType = bet.items.get(type) || 0;
  const oppositeMain = type === 'player' ? 'banker' : type === 'banker' ? 'player' : null;
  const oppositeAmount = oppositeMain ? (bet.items.get(oppositeMain) || 0) : 0;
  const otherTotal = currentBetTotal(t, playerId) - currentForType - oppositeAmount;
  if (otherTotal + amt > player.chips) throw new GameError('보유 칩을 초과했습니다');

  if (oppositeMain && amt > 0) bet.items.delete(oppositeMain);
  if (amt === 0) bet.items.delete(type);
  else bet.items.set(type, amt);
  return bet;
}

function confirmBets(t, playerId) {
  if (t.status !== 'active') throw new GameError('관리자가 토너먼트를 시작하지 않았습니다');
  if (t.round.phase !== 'betting-wait') throw new GameError('베팅 시간이 아닙니다');
  const bet = ensureBetEntry(t, playerId);
  if (!bet.confirmed) {
    bet.confirmed = true;
    bet.confirmedAt = Date.now();
  }
  return bet;
}

function allActivePlayersConfirmed(t) {
  const active = [...t.players.values()].filter((p) => p.connected);
  if (active.length === 0) return false;
  return active.every((p) => {
    const b = t.round.bets.get(p.id);
    return b && b.confirmed;
  });
}

function pickSqueezer(t, side) {
  let best = null;
  for (const [playerId, bet] of t.round.bets.entries()) {
    const total = bet.items.get(side) || 0;
    if (total <= 0) continue;
    if (!best || total > best.total || (total === best.total && bet.confirmedAt < best.confirmedAt)) {
      best = { playerId, total, confirmedAt: bet.confirmedAt || Infinity };
    }
  }
  return best ? best.playerId : null;
}

function cardOrientation(idx) {
  return idx < 4 ? 'vertical' : 'horizontal';
}

function beginDealing(t) {
  t.round.phase = 'dealing';
  t.round.phaseEndsAt = null;
  t.round.squeezers = { player: pickSqueezer(t, 'player'), banker: pickSqueezer(t, 'banker') };

  const draw = () => t.shoe.draw();
  const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
  const result = engine.resolveRound([p1, p2], [b1, b2], draw);
  result.sideBets = engine.evaluateSideBets(result);
  t.round.result = result;

  const cards = [
    { cardId: 'P1', side: 'player', card: result.playerCards[0] },
    { cardId: 'B1', side: 'banker', card: result.bankerCards[0] },
    { cardId: 'P2', side: 'player', card: result.playerCards[1] },
    { cardId: 'B2', side: 'banker', card: result.bankerCards[1] }
  ];
  if (result.playerThird) cards.push({ cardId: 'P3', side: 'player', card: result.playerCards[2] });
  if (result.bankerThird) {
    cards.push({ cardId: 'B3', side: 'banker', card: result.bankerCards[2] });
  }
  cards.forEach((c, i) => {
    c.orientation = cardOrientation(i);
    c.revealed = false;
    c.edge = null;
    c.pct = 0;
    c.grip = 0.5;
  });
  t.round.cards = cards;
  t.round.dealIndex = -1;
  t.round.cardIndex = 0;
}

function dealNextInitialCard(t) {
  if (t.round.phase !== 'dealing') return true;
  t.round.dealIndex = Math.min(3, t.round.dealIndex + 1);
  return t.round.dealIndex >= 3;
}

function beginSqueezeForCurrentCard(t) {
  // Deal order is alternating. If bets exist on only one side, expose the
  // unbacked hand first; otherwise use the usual player-first reveal order.
  if (t.round.cardIndex === 0 && t.round.cards[1]?.cardId === 'B1') {
    const byId = new Map(t.round.cards.map((card) => [card.cardId, card]));
    const playerInterest = sideHasInterest(t, 'player');
    const bankerInterest = sideHasInterest(t, 'banker');
    const initialOrder = playerInterest && !bankerInterest
      ? ['B1', 'B2', 'P1', 'P2']
      : ['P1', 'P2', 'B1', 'B2'];
    t.round.cards = [...initialOrder, 'P3', 'B3'].map((id) => byId.get(id)).filter(Boolean);
  }
  const i = t.round.cardIndex;
  t.round.phase = i < 4 ? 'squeeze' : 'extra-card';
}

function initialTotal(t, side) {
  const cards = t.round.result[side === 'player' ? 'playerCards' : 'bankerCards'];
  return engine.handValue(cards.slice(0, 2));
}

function outcomeCall(result) {
  return result.outcome === 'player' ? 'Player wins' : result.outcome === 'banker' ? 'Banker wins' : 'Tie';
}

function beginHandCall(t, side, finishesRound = false) {
  const total = initialTotal(t, side);
  const sideLabel = side === 'player' ? 'Player' : 'Banker';
  const qualifier = total >= 8 ? ' natural' : side === 'player' && total >= 6 ? ' stands on' : side === 'banker' && total === 7 ? ' stands on' : '';
  t.round.phase = 'dealer-call';
  t.round.callNextAction = finishesRound ? 'finish' : 'continue';
  const resultCall = finishesRound ? `. ${outcomeCall(t.round.result)}` : '';
  t.round.log.push({ type: 'call', text: `${sideLabel}${qualifier} ${total}${resultCall}`, tone: finishesRound ? 'winner' : undefined, at: Date.now() });
}

function beginThirdTotalCall(t, side, finishesRound) {
  const total = t.round.result[side === 'player' ? 'playerTotal' : 'bankerTotal'];
  const sideLabel = side === 'player' ? 'Player' : 'Banker';
  t.round.phase = 'dealer-call';
  t.round.callNextAction = finishesRound ? 'finish' : 'continue';
  const resultCall = finishesRound ? `. ${outcomeCall(t.round.result)}` : '';
  t.round.log.push({ type: 'call', text: `${sideLabel} ${total}${resultCall}`, tone: finishesRound ? 'winner' : undefined, at: Date.now() });
}

function completeDealerCall(t) {
  if (t.round.phase !== 'dealer-call') return { done: false };
  if (t.round.callNextAction === 'finish') {
    t.round.callNextAction = 'continue';
    t.round.phase = 'result-calc';
    return { done: true };
  }
  const next = t.round.cards[t.round.cardIndex];
  if (!next) return { done: true };
  if (t.round.cardIndex >= 4) callThirdCard(t, next);
  else beginSqueezeForCurrentCard(t);
  return { done: false };
}

function callThirdCard(t, cardEntry) {
  const sideLabel = cardEntry.side === 'player' ? 'Player' : 'Banker';
  t.round.phase = 'third-card-call';
  t.round.log.push({ type: 'call', text: `${sideLabel}, one more card`, at: Date.now() });
}

function dealCalledThirdCard(t) {
  if (t.round.phase !== 'third-card-call') return false;
  const current = t.round.cards[t.round.cardIndex];
  if (!current || t.round.cardIndex < 4) return false;
  t.round.dealIndex = t.round.cardIndex;
  beginSqueezeForCurrentCard(t);
  return true;
}

// The renderer maps a 94% edge pull to a roughly 72-75% crease depth.
const SQUEEZE_REVEAL_FRAC = 0.94;
const MAX_SQUEEZE_FRAC = 1;
const LONG_EDGES = new Set(['left', 'right']);
const SHORT_EDGES = new Set(['top', 'bottom']);

function sideHasInterest(t, side) {
  for (const bet of t.round.bets.values()) {
    if ((bet.items.get(side) || 0) > 0) return true;
  }
  return false;
}

// Nobody has a stake in a card if nobody bet on that card's side (and
// nobody bet a both-sides type like tie). Option bets do not grant authority.
function cardNeedsSqueeze(t, cardEntry) {
  const squeezerId = t.round.squeezers[cardEntry.side];
  if (!squeezerId) return false;
  const squeezer = t.players.get(squeezerId);
  if (!squeezer || !squeezer.connected) return false;
  // Option bets never grant a squeeze. The chosen squeezer may reveal only
  // cards on the player/banker main side they personally backed.
  if (cardEntry.cardId === 'P1' || cardEntry.cardId === 'B1') return false;
  return (squeezerBetAmount(t, squeezerId, cardEntry.side) > 0);
}

function activeSqueezerId(t) {
  const current = t.round.cards[t.round.cardIndex];
  return current ? t.round.squeezers[current.side] : null;
}

function squeezerBetAmount(t, playerId, side) {
  return t.round.bets.get(playerId)?.items.get(side) || 0;
}

function advancePastCard(t) {
  const opened = t.round.cards[t.round.cardIndex];
  t.round.cardIndex += 1;
  const next = t.round.cards[t.round.cardIndex];
  if (opened?.cardId === 'P2') {
    beginHandCall(t, 'player', !next);
    return false;
  }
  if (opened?.cardId === 'B2') {
    beginHandCall(t, 'banker', !next);
    return false;
  }
  if (opened?.cardId === 'P3') {
    beginThirdTotalCall(t, 'player', !next);
    return false;
  }
  if (opened?.cardId === 'B3') {
    beginThirdTotalCall(t, 'banker', true);
    return false;
  }
  if (next) {
    if (t.round.cardIndex >= 4) callThirdCard(t, next);
    else {
      t.round.dealIndex = Math.max(t.round.dealIndex, t.round.cardIndex);
      beginSqueezeForCurrentCard(t);
    }
  }
  else t.round.phase = 'result-calc';
  return !next;
}

// The dealer opens a card directly (no squeeze) when nobody at the table
// has a bet riding on that side — there's no one to hand the squeeze to,
// and forcing a squeeze phase with no eligible squeezer would just hang
// the round forever.
function autoRevealCard(t) {
  const current = t.round.cards[t.round.cardIndex];
  current.revealed = true;
  current.edge = null;
  current.pct = 1;
  const done = advancePastCard(t);
  return { current, done };
}

function squeezeProgress(t, playerId, cardId, edge, pct, grip) {
  if (activeSqueezerId(t) !== playerId) throw new GameError('쪼기 권한이 없습니다');
  const current = t.round.cards[t.round.cardIndex];
  if (!current || current.cardId !== cardId) throw new GameError('지금 쪼길 수 있는 카드가 아닙니다');
  if (t.round.phase !== 'squeeze' && t.round.phase !== 'extra-card') throw new GameError('쪼기 단계가 아닙니다');
  // Nobody bet this side — the dealer is auto-revealing it on a timer, not
  // waiting on a drag. Reject rather than race the auto-reveal's own advance.
  if (!cardNeedsSqueeze(t, current)) throw new GameError('이 카드는 딜러가 공개합니다');
  if (!LONG_EDGES.has(edge) && !SHORT_EDGES.has(edge)) throw new GameError('알 수 없는 변');
  current.edge = edge;
  current.pct = Math.max(0, Math.min(MAX_SQUEEZE_FRAC, Number(pct) || 0));
  current.grip = Math.max(0.08, Math.min(0.92, Number(grip) || 0.5));
  return current;
}

// `edge`/`pct` are the releasing client's own final measurement — passed
// explicitly rather than trusting the last throttled squeezeProgress
// broadcast, which can lag a fast release by a frame or two and reject an
// otherwise-valid reveal.
function squeezeReveal(t, playerId, cardId, edge, pct, grip) {
  if (activeSqueezerId(t) !== playerId) throw new GameError('쪼기 권한이 없습니다');
  const current = t.round.cards[t.round.cardIndex];
  if (!current || current.cardId !== cardId) throw new GameError('지금 쪼길 수 있는 카드가 아닙니다');
  if (!cardNeedsSqueeze(t, current)) throw new GameError('이 카드는 딜러가 공개합니다');
  if (!LONG_EDGES.has(edge) && !SHORT_EDGES.has(edge)) throw new GameError('알 수 없는 변');
  if ((Number(pct) || 0) < SQUEEZE_REVEAL_FRAC) {
    throw new GameError('카드를 70% 이상 열어야 공개됩니다');
  }
  current.edge = edge;
  current.pct = Math.max(0, Math.min(MAX_SQUEEZE_FRAC, Number(pct) || 0));
  current.grip = Math.max(0.08, Math.min(0.92, Number(grip) || 0.5));
  current.revealed = true;

  const done = advancePastCard(t);
  return { current, done };
}

function settleRound(t) {
  const result = t.round.result;
  const settlements = new Map();
  for (const [playerId, bet] of t.round.bets.entries()) {
    const player = t.players.get(playerId);
    if (!player) continue;
    const items = [...bet.items.entries()].map(([type, amount]) => ({ type, amount }));
    if (items.length === 0) {
      settlements.set(playerId, []);
      continue;
    }
    const settled = engine.settleBets(items, result, t.payoutMode);
    let delta = 0;
    for (const s of settled) delta += s.net;
    player.chips += delta;
    settlements.set(playerId, settled);
  }
  t.round.settlements = settlements;
  t.round.phase = 'payout';

  t.roundHistory.push({
    roundNo: t.round.roundNo,
    outcome: result.outcome,
    playerTotal: result.playerTotal,
    bankerTotal: result.bankerTotal
  });
}

function bigRoadSnapshot(t) {
  return buildBigRoad(t.roundHistory.map((r) => r.outcome));
}

function markNextRound(t) {
  t.round.phase = 'next-round';
}

function startNextRound(t) {
  t.roundNo += 1;
  t.round = freshRound(t.roundNo);
  t.round.phaseEndsAt = Date.now() + t.bettingSeconds * 1000;
  t.round.log.push({ type: 'call', text: 'BET DOWN PLEASE', at: Date.now() });
}

function seedRoad(t, count = 3) {
  const draw = () => t.shoe.draw();
  for (let i = 0; i < count; i++) {
    const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
    const result = engine.resolveRound([p1, p2], [b1, b2], draw);
    t.roundHistory.push({
      roundNo: i - count + 1,
      outcome: result.outcome,
      playerTotal: result.playerTotal,
      bankerTotal: result.bankerTotal,
      seeded: true
    });
  }
}

function revealSeedRoadGame(t) {
  if (t.round.phase !== 'road-seeding' || t.seedProgress >= t.initialRoadGames) return true;
  const draw = () => t.shoe.draw();
  const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
  const result = engine.resolveRound([p1, p2], [b1, b2], draw);
  t.seedProgress += 1;
  t.seedPreview = {
    index: t.seedProgress,
    total: t.initialRoadGames,
    outcome: result.outcome,
    playerTotal: result.playerTotal,
    bankerTotal: result.bankerTotal,
    cards: [
      { cardId: 'P1', side: 'player', ...result.playerCards[0] },
      { cardId: 'B1', side: 'banker', ...result.bankerCards[0] },
      { cardId: 'P2', side: 'player', ...result.playerCards[1] },
      { cardId: 'B2', side: 'banker', ...result.bankerCards[1] },
      ...(result.playerCards[2] ? [{ cardId: 'P3', side: 'player', ...result.playerCards[2] }] : []),
      ...(result.bankerCards[2] ? [{ cardId: 'B3', side: 'banker', ...result.bankerCards[2] }] : [])
    ]
  };
  t.roundHistory.push({
    roundNo: t.seedProgress - t.initialRoadGames,
    outcome: result.outcome,
    playerTotal: result.playerTotal,
    bankerTotal: result.bankerTotal,
    seeded: true
  });
  return t.seedProgress >= t.initialRoadGames;
}

function startTournament(t) {
  if (t.miniGame.status === 'collecting') throw new GameError('진행 중인 미니게임을 먼저 마감해 주세요');
  t.miniGame = { type: null, status: 'idle', submissions: new Map(), submissionOrder: new Map(), nextSubmissionOrder: 1, average: null, target: null, results: [], endsAt: null };
  t.status = 'active';
  if (t.initialRoadGames > 0) {
    t.round.phase = 'road-seeding';
    t.round.phaseEndsAt = null;
  } else startNextRound(t);
}

function roundLimitReached(t) {
  return t.roundLimit != null && t.roundNo >= t.roundLimit;
}

function startMiniGame(t, type = 'beauty-contest', durationSeconds = 60) {
  if (t.status === 'active') throw new GameError('바카라 토너먼트 진행 중에는 미니게임을 시작할 수 없습니다');
  if (t.miniGame.status === 'collecting') throw new GameError('이미 미니게임이 진행 중입니다');
  if (type !== 'beauty-contest' && type !== 'lowest-unique') throw new GameError('지원하지 않는 미니게임입니다');
  const seconds = Math.max(10, Math.min(300, Math.floor(Number(durationSeconds)) || 60));
  t.miniGame = { type, status: 'collecting', submissions: new Map(), submissionOrder: new Map(), nextSubmissionOrder: 1, average: null, target: null, results: [], endsAt: Date.now() + seconds * 1000 };
  return t.miniGame;
}

function submitMiniGameNumber(t, playerId, value) {
  if (t.status === 'active' || t.miniGame.status !== 'collecting') throw new GameError('현재 숫자를 제출할 수 없습니다');
  if (!t.players.has(playerId)) throw new GameError('참가자 정보를 찾을 수 없습니다');
  const number = Number(value);
  const min = t.miniGame.type === 'lowest-unique' ? 1 : 0;
  const max = t.miniGame.type === 'lowest-unique' ? 50 : 100;
  if (!Number.isInteger(number) || number < min || number > max) throw new GameError(`${min}부터 ${max}까지의 정수를 입력해 주세요`);
  t.miniGame.submissions.set(playerId, number);
  // Changing a number is a new final submission, so it moves behind players
  // who already submitted the same-distance answer.
  t.miniGame.submissionOrder.set(playerId, t.miniGame.nextSubmissionOrder++);
  return number;
}

function revealMiniGame(t) {
  if (t.status === 'active' || t.miniGame.status !== 'collecting') throw new GameError('마감할 미니게임이 없습니다');
  const entries = [...t.miniGame.submissions.entries()];
  if (entries.length === 0) {
    t.miniGame = { ...t.miniGame, status: 'revealed', average: null, target: null, results: [], endsAt: null };
    return t.miniGame;
  }
  let average = null;
  let target = null;
  let results;
  if (t.miniGame.type === 'lowest-unique') {
    const counts = new Map();
    for (const [, value] of entries) counts.set(value, (counts.get(value) || 0) + 1);
    results = entries
      .map(([playerId, value]) => ({ playerId, nickname: t.players.get(playerId)?.nickname || '-', value, count: counts.get(value), unique: counts.get(value) === 1 }))
      .sort((a, b) => Number(b.unique) - Number(a.unique) || a.value - b.value || a.nickname.localeCompare(b.nickname, 'ko'));
    let uniqueRank = 0;
    results = results.map((entry) => ({ ...entry, distance: 0, rank: entry.unique ? ++uniqueRank : 0 }));
  } else {
    average = entries.reduce((sum, [, value]) => sum + value, 0) / entries.length;
    target = average * 2 / 3;
    results = entries
      .map(([playerId, value]) => ({ playerId, nickname: t.players.get(playerId)?.nickname || '-', value, distance: Math.abs(value - target), submittedOrder: t.miniGame.submissionOrder.get(playerId) || Infinity }))
      .sort((a, b) => a.distance - b.distance || a.submittedOrder - b.submittedOrder)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }
  t.miniGame = { ...t.miniGame, status: 'revealed', average, target, results, endsAt: null };
  return t.miniGame;
}

module.exports = {
  BETTING_SECONDS, NEXT_ROUND_SECONDS, DEFAULT_INITIAL_CHIPS, DEFAULT_BET_LIMITS,
  GameError,
  createTournament, addPlayer, playerByToken,
  placeBet, confirmBets, allActivePlayersConfirmed,
  beginDealing, dealNextInitialCard, beginSqueezeForCurrentCard, dealCalledThirdCard, completeDealerCall,
  cardNeedsSqueeze, activeSqueezerId, autoRevealCard,
  squeezeProgress, squeezeReveal, settleRound,
  bigRoadSnapshot, markNextRound, startNextRound, seedRoad, revealSeedRoadGame, startTournament, roundLimitReached,
  startMiniGame, submitMiniGameNumber, revealMiniGame, currentBetTotal
};
