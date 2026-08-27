'use strict';

const crypto = require('crypto');
const path = require('path');
const engine = require(path.join(__dirname, '..', '..', '..', 'engine'));
const { buildBigRoad } = require('./bigroad');
const { BET_TYPE_SET } = require('./betTypes');

const BETTING_SECONDS = 25;
const NEXT_ROUND_SECONDS = 6;
const DEFAULT_INITIAL_CHIPS = 30000000;

function id() {
  return crypto.randomBytes(8).toString('hex');
}
function token() {
  return crypto.randomBytes(24).toString('hex');
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
function joinCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

// One Tournament = one shared table. Simplified on purpose: this is an
// internal staff-event tool, not a multi-tenant product, so a single active
// table per server process is enough. Everything is in-memory; a player's
// reconnect token is the durability mechanism (survives refresh/disconnect
// for the lifetime of the server process, not a server restart).
function createTournament({ name, initialChips, roundLimit }) {
  return {
    id: id(),
    name: name || '바카라 토너먼트',
    initialChips: initialChips > 0 ? initialChips : DEFAULT_INITIAL_CHIPS,
    roundLimit: roundLimit > 0 ? roundLimit : null,
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
    timers: {}
  };
}

function freshRound(roundNo) {
  return {
    roundNo,
    phase: 'betting-wait',
    phaseEndsAt: null,
    bets: new Map(), // playerId -> { items: Map<type, amount>, confirmed, confirmedAt }
    squeezerId: null,
    cards: [], // ordered list of card descriptors for this round
    cardIndex: 0, // pointer into cards[] for the one currently squeezable
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
  if (t.round.phase !== 'betting-wait') throw new GameError('베팅 시간이 아닙니다');
  if (!BET_TYPE_SET.has(type)) throw new GameError('알 수 없는 베팅 종류');
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  const player = t.players.get(playerId);
  if (!player) throw new GameError('참가자를 찾을 수 없습니다');

  const bet = ensureBetEntry(t, playerId);
  if (bet.confirmed) throw new GameError('이미 베팅을 확정했습니다');

  const currentForType = bet.items.get(type) || 0;
  const otherTotal = currentBetTotal(t, playerId) - currentForType;
  if (otherTotal + amt > player.chips) throw new GameError('보유 칩을 초과했습니다');

  if (amt === 0) bet.items.delete(type);
  else bet.items.set(type, amt);
  return bet;
}

function confirmBets(t, playerId) {
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

function pickSqueezer(t) {
  let best = null;
  for (const [playerId, bet] of t.round.bets.entries()) {
    let total = 0;
    for (const amt of bet.items.values()) total += amt;
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
  t.round.squeezerId = pickSqueezer(t);

  const draw = () => t.shoe.draw();
  const p1 = draw(), b1 = draw(), p2 = draw(), b2 = draw();
  const result = engine.resolveRound([p1, p2], [b1, b2], draw);
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
  t.round.cardIndex = 0;
}

function beginSqueezeForCurrentCard(t) {
  const i = t.round.cardIndex;
  t.round.phase = i < 4 ? 'squeeze' : 'extra-card';
}

// Every edge can be squeezed through its full extent. Crossing half of the
// relevant card dimension confirms the reveal immediately.
const LONG_EDGES = new Set(['left', 'right']);
const SHORT_EDGES = new Set(['top', 'bottom']);

const PLAYER_SIDE_BET_TYPES = new Set(['player', 'playerPair', 'player7TwoCard', 'player7ThreeCard']);
const BANKER_SIDE_BET_TYPES = new Set(['banker', 'bankerPair', 'banker6TwoCard', 'banker6ThreeCard']);
// tie / the combo bet depend on both hands, so either counts as "interest"
// in both sides.
const BOTH_SIDE_BET_TYPES = new Set(['tie', 'comboP7B6']);

// Nobody has a stake in a card if nobody bet on that card's side (and
// nobody bet a both-sides type like tie). If squeezerId is null, this is
// necessarily true for every card, since pickSqueezer only returns null
// when every bet total is 0.
function cardNeedsSqueeze(t, cardEntry) {
  if (!t.round.squeezerId) return false;
  const squeezer = t.players.get(t.round.squeezerId);
  if (!squeezer || !squeezer.connected) return false;
  const sideTypes = cardEntry.side === 'player' ? PLAYER_SIDE_BET_TYPES : BANKER_SIDE_BET_TYPES;
  for (const bet of t.round.bets.values()) {
    for (const [type, amt] of bet.items.entries()) {
      if (amt <= 0) continue;
      if (sideTypes.has(type) || BOTH_SIDE_BET_TYPES.has(type)) return true;
    }
  }
  return false;
}

function advancePastCard(t) {
  t.round.cardIndex += 1;
  const next = t.round.cards[t.round.cardIndex];
  if (next) beginSqueezeForCurrentCard(t);
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
  const callText = callTextFor(current);
  t.round.log.push({ type: 'call', text: callText, at: Date.now() });
  const done = advancePastCard(t);
  return { current, callText, done };
}

function squeezeProgress(t, playerId, cardId, edge, pct, grip) {
  if (t.round.squeezerId !== playerId) throw new GameError('쪼기 권한이 없습니다');
  const current = t.round.cards[t.round.cardIndex];
  if (!current || current.cardId !== cardId) throw new GameError('지금 쪼길 수 있는 카드가 아닙니다');
  if (t.round.phase !== 'squeeze' && t.round.phase !== 'extra-card') throw new GameError('쪼기 단계가 아닙니다');
  // Nobody bet this side — the dealer is auto-revealing it on a timer, not
  // waiting on a drag. Reject rather than race the auto-reveal's own advance.
  if (!cardNeedsSqueeze(t, current)) throw new GameError('이 카드는 딜러가 공개합니다');
  if (!LONG_EDGES.has(edge) && !SHORT_EDGES.has(edge)) throw new GameError('알 수 없는 변');
  current.edge = edge;
  current.pct = Math.max(0, Math.min(1, Number(pct) || 0));
  current.grip = Math.max(0.08, Math.min(0.92, Number(grip) || 0.5));
  return current;
}

// `edge`/`pct` are the releasing client's own final measurement — passed
// explicitly rather than trusting the last throttled squeezeProgress
// broadcast, which can lag a fast release by a frame or two and reject an
// otherwise-valid reveal.
function squeezeReveal(t, playerId, cardId, edge, pct, grip) {
  if (t.round.squeezerId !== playerId) throw new GameError('쪼기 권한이 없습니다');
  const current = t.round.cards[t.round.cardIndex];
  if (!current || current.cardId !== cardId) throw new GameError('지금 쪼길 수 있는 카드가 아닙니다');
  if (!cardNeedsSqueeze(t, current)) throw new GameError('이 카드는 딜러가 공개합니다');
  if (!LONG_EDGES.has(edge) && !SHORT_EDGES.has(edge)) throw new GameError('알 수 없는 변');
  if ((Number(pct) || 0) < 0.5) {
    throw new GameError('카드를 절반 이상 열어야 공개됩니다');
  }
  current.edge = edge;
  current.pct = Math.max(0, Math.min(1, Number(pct) || 0));
  current.grip = Math.max(0.08, Math.min(0.92, Number(grip) || 0.5));
  current.revealed = true;

  const callText = callTextFor(current);
  t.round.log.push({ type: 'call', text: callText, at: Date.now() });

  const done = advancePastCard(t);
  return { current, callText, done };
}

function callTextFor(cardEntry) {
  const rankLabel = { A: '에이스', J: '잭', Q: '퀸', K: '킹' }[cardEntry.card.rank] || cardEntry.card.rank;
  const sideLabel = cardEntry.side === 'player' ? '플레이어' : '뱅커';
  return `${sideLabel} ${rankLabel}`;
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
    const settled = engine.settleBets(items, result);
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
  t.round.phaseEndsAt = Date.now() + BETTING_SECONDS * 1000;
}

function startTournament(t) {
  t.status = 'active';
  startNextRound(t);
}

function roundLimitReached(t) {
  return t.roundLimit != null && t.roundNo >= t.roundLimit;
}

module.exports = {
  BETTING_SECONDS, NEXT_ROUND_SECONDS, DEFAULT_INITIAL_CHIPS,
  GameError,
  createTournament, addPlayer, playerByToken,
  placeBet, confirmBets, allActivePlayersConfirmed,
  beginDealing, beginSqueezeForCurrentCard,
  cardNeedsSqueeze, autoRevealCard,
  squeezeProgress, squeezeReveal, settleRound,
  bigRoadSnapshot, markNextRound, startNextRound, startTournament, roundLimitReached,
  currentBetTotal
};
