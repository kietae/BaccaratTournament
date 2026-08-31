'use strict';

const table = require('./table');
const { buildSnapshot } = require('./serialize');

const FIRST_DEAL_MS = 180;
const DEAL_STEP_MS = 320;
const DEAL_SETTLE_MS = 260;
const SQUEEZE_SETTLE_MS = 100;
const RESULT_CALC_MS = 1800;
const PAYOUT_MS = 2400;
const NEXT_ROUND_MS = table.NEXT_ROUND_SECONDS * 1000;
const AUTO_REVEAL_MS = 1050; // dealer peel animation before an unbacked card opens
const THIRD_CARD_CALL_MS = 1100; // call first, then slide the third card onto the table
const HAND_CALL_MS = 1500; // leave room for the spoken hand total / result
const SQUEEZE_REVEAL_FRAC = 0.94;
// Give each opening-road hand enough time for the cards and result to register
// before replacing it with the next hand.
const SEED_GAME_MS = 2100;

// Single active tournament per server process (see table.js for rationale).
let t = null;

function registerSocketServer(io) {
  const socketPlayer = new Map(); // socket.id -> playerId
  const adminSockets = new Set(); // socket.id

  function broadcastState() {
    if (!t) return;
    for (const [socketId, playerId] of socketPlayer.entries()) {
      io.to(socketId).emit('state', buildSnapshot(t, playerId));
    }
    for (const socketId of adminSockets) {
      io.to(socketId).emit('state', buildSnapshot(t, null));
    }
  }

  function clearTimers() {
    if (!t) return;
    for (const key of Object.keys(t.timers)) {
      clearTimeout(t.timers[key]);
      delete t.timers[key];
    }
  }

  function scheduleBettingTimeout() {
    clearTimers();
    const ms = Math.max(0, t.round.phaseEndsAt - Date.now());
    t.timers.betting = setTimeout(advanceFromBetting, ms);
  }

  function scheduleSeedRoad() {
    clearTimers();
    const step = () => {
      if (!t || t.status !== 'active' || t.round.phase !== 'road-seeding') return;
      const done = table.revealSeedRoadGame(t);
      broadcastState();
      t.timers.seedRoad = setTimeout(() => {
        if (!t) return;
        if (done) {
          table.startNextRound(t);
          broadcastState();
          scheduleBettingTimeout();
        } else step();
      }, SEED_GAME_MS);
    };
    t.timers.seedRoad = setTimeout(step, 700);
  }

  function advanceFromBetting() {
    if (!t || t.status !== 'active' || t.round.phase !== 'betting-wait') return;
    clearTimers();
    table.beginDealing(t);
    broadcastState();
    t.timers.dealing = setTimeout(dealNextInitialCard, FIRST_DEAL_MS);
  }

  function dealNextInitialCard() {
    if (!t || t.round.phase !== 'dealing') return;
    const finished = table.dealNextInitialCard(t);
    broadcastState();
    t.timers.dealing = setTimeout(() => {
      if (!t || t.round.phase !== 'dealing') return;
      if (!finished) {
        dealNextInitialCard();
        return;
      }
      table.beginSqueezeForCurrentCard(t);
      broadcastState();
      advanceDealerAutoReveals();
    }, finished ? DEAL_SETTLE_MS : DEAL_STEP_MS);
  }

  // Opens, one at a time with a dealer-like pace, every upcoming card that
  // nobody has a bet riding on — otherwise a card with no eligible squeezer
  // (nobody bet that side, or nobody bet at all) would hang the round
  // forever waiting for a squeeze permission nobody has. Stops as soon as
  // it reaches a card someone actually has a stake in.
  function advanceDealerAutoReveals() {
    if (!t) return;
    const current = t.round.cards[t.round.cardIndex];
    if (!current || table.cardNeedsSqueeze(t, current)) return;
    current.edge = 'right';
    current.grip = 0.5;
    current.pct = 0;
    const startedAt = Date.now();
    const animateDealerPeel = () => {
      if (!t || t.round.cards[t.round.cardIndex] !== current) return;
      const elapsed = Date.now() - startedAt;
      current.pct = Math.min(SQUEEZE_REVEAL_FRAC, (elapsed / AUTO_REVEAL_MS) * SQUEEZE_REVEAL_FRAC);
      broadcastState();
      if (current.pct < SQUEEZE_REVEAL_FRAC) {
        t.timers.autoReveal = setTimeout(animateDealerPeel, 70);
        return;
      }
      t.timers.autoReveal = setTimeout(() => {
        if (!t) return;
        const { done } = table.autoRevealCard(t);
        broadcastState();
        advanceAfterReveal(done);
      }, 140);
    };
    t.timers.autoReveal = setTimeout(animateDealerPeel, 70);
  }

  function advanceAfterReveal(done) {
    if (done) {
      finishRoundAndAdvance();
      return;
    }
    if (t.round.phase === 'dealer-call') {
      t.timers.dealerCall = setTimeout(() => {
        if (!t) return;
        delete t.timers.dealerCall;
        const completed = table.completeDealerCall(t);
        broadcastState();
        advanceAfterReveal(completed.done);
      }, HAND_CALL_MS);
      return;
    }
    if (t.round.phase === 'third-card-call') {
      t.timers.thirdCardDeal = setTimeout(() => {
        if (!t || !table.dealCalledThirdCard(t)) return;
        delete t.timers.thirdCardDeal;
        broadcastState();
        advanceDealerAutoReveals();
      }, THIRD_CARD_CALL_MS);
      return;
    }
    advanceDealerAutoReveals();
  }

  function finishRoundAndAdvance() {
    t.timers.resultCalc = setTimeout(() => {
      if (!t) return;
      table.settleRound(t);
      broadcastState();
      t.timers.payout = setTimeout(() => {
        if (!t) return;
        table.markNextRound(t);
        broadcastState();
        t.timers.nextRound = setTimeout(() => {
          if (!t) return;
          if (table.roundLimitReached(t)) {
            t.status = 'finished';
            table.recordTournamentAwards(t);
            broadcastState();
            return;
          }
          table.startNextRound(t);
          broadcastState();
          scheduleBettingTimeout();
        }, NEXT_ROUND_MS);
      }, PAYOUT_MS);
    }, RESULT_CALC_MS);
  }

  io.on('connection', (socket) => {
    let adminAuthenticated = false;

    socket.on('admin:login', (payload, ack) => {
      const expectedPassword = process.env.ADMIN_PASSWORD || 'cage123';
      if (String(payload?.password || '') !== expectedPassword) {
        ack?.({ ok: false, error: '관리자 비밀번호가 올바르지 않습니다' });
        return;
      }
      adminAuthenticated = true;
      ack?.({ ok: true });
    });

    socket.on('admin:create', (payload, ack) => {
      if (!adminAuthenticated) {
        ack?.({ ok: false, error: '관리자 인증이 필요합니다' });
        return;
      }
      if (t && t.status === 'active' && !adminSockets.has(socket.id)) {
        ack?.({ ok: false, error: '진행 중인 토너먼트는 기존 관리자만 변경할 수 있습니다' });
        return;
      }
      clearTimers();
      socketPlayer.clear();
      adminSockets.clear();
      t = table.createTournament(payload || {});
      adminSockets.add(socket.id);
      adminAuthenticated = true;
      ack?.({ ok: true, adminToken: t.adminToken, joinCode: t.joinCode });
      broadcastState();
    });

    socket.on('admin:attach', (payload, ack) => {
      if (!t || !payload || payload.adminToken !== t.adminToken) {
        ack?.({ ok: false, error: '토너먼트를 찾을 수 없습니다' });
        return;
      }
      adminSockets.add(socket.id);
      adminAuthenticated = true;
      ack?.({ ok: true });
      socket.emit('state', buildSnapshot(t, null));
    });

    socket.on('admin:start', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) {
        ack?.({ ok: false, error: '권한이 없습니다' });
        return;
      }
      if (t.status !== 'lobby') {
        ack?.({ ok: false, error: '이미 시작된 토너먼트입니다' });
        return;
      }
      table.startTournament(t);
      broadcastState();
      if (t.round.phase === 'road-seeding') scheduleSeedRoad();
      else scheduleBettingTimeout();
      ack?.({ ok: true });
    });

    socket.on('admin:returnToGameSelection', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) {
        ack?.({ ok: false, error: '권한이 없습니다' });
        return;
      }
      clearTimers();
      table.returnToGameSelection(t);
      ack?.({ ok: true });
      broadcastState();
    });

    socket.on('admin:startMiniGame', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try {
        table.startMiniGame(t, payload?.type);
        if (payload?.type === 'group-rps') {
          ack?.({ ok: true });
          broadcastState();
          return;
        }
        t.timers.miniGame = setTimeout(() => {
          if (!t || t.miniGame.status !== 'collecting') return;
          delete t.timers.miniGame;
          table.revealMiniGame(t);
          broadcastState();
        }, Math.max(0, t.miniGame.endsAt - Date.now()));
        ack?.({ ok: true });
        broadcastState();
      } catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:revealMiniGame', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try {
        if (t.timers.miniGame) { clearTimeout(t.timers.miniGame); delete t.timers.miniGame; }
        table.revealMiniGame(t);
        ack?.({ ok: true });
        broadcastState();
      } catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('join', (payload, ack) => {
      if (!t) { ack?.({ ok: false, error: '진행 중인 토너먼트가 없습니다' }); return; }
      if (!payload || String(payload.code || '').toUpperCase() !== t.joinCode) {
        ack?.({ ok: false, error: '입장 코드가 올바르지 않습니다' });
        return;
      }
      if (!String(payload.employeeId || '').trim()) { ack?.({ ok: false, error: '사번을 입력해 주세요' }); return; }
      const player = table.addPlayer(t, payload.nickname, payload.employeeId);
      player.connected = true;
      player.socketId = socket.id;
      socketPlayer.set(socket.id, player.id);
      ack?.({ ok: true, playerId: player.id, token: player.token });
      broadcastState();
    });

    socket.on('reconnect_player', (payload, ack) => {
      if (!t || !payload) { ack?.({ ok: false, error: '진행 중인 토너먼트가 없습니다' }); return; }
      const player = table.playerByToken(t, payload.token);
      if (!player) { ack?.({ ok: false, error: '세션을 복원할 수 없습니다' }); return; }
      player.connected = true;
      player.socketId = socket.id;
      socketPlayer.set(socket.id, player.id);
      ack?.({ ok: true, playerId: player.id });
      broadcastState();
    });

    socket.on('placeBet', (payload, ack) => {
      const playerId = socketPlayer.get(socket.id);
      if (!t || !playerId) { ack?.({ ok: false, error: '참가 정보가 없습니다' }); return; }
      try {
        table.placeBet(t, playerId, payload?.type, payload?.amount);
        ack?.({ ok: true });
        broadcastState();
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('confirmBets', (payload, ack) => {
      const playerId = socketPlayer.get(socket.id);
      if (!t || !playerId) { ack?.({ ok: false, error: '참가 정보가 없습니다' }); return; }
      try {
        table.confirmBets(t, playerId);
        ack?.({ ok: true });
        broadcastState();
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('submitMiniGame', (payload, ack) => {
      const playerId = socketPlayer.get(socket.id);
      if (!t || !playerId) { ack?.({ ok: false, error: '참가자 정보가 없습니다' }); return; }
      try {
        table.submitMiniGameNumber(t, playerId, payload?.value);
        ack?.({ ok: true });
        broadcastState();
      } catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('rps:submit', (payload, ack) => {
      const playerId = socketPlayer.get(socket.id);
      if (!t || !playerId) { ack?.({ ok: false, error: '참가자 정보가 없습니다' }); return; }
      try { table.submitGroupRps(t, playerId, payload?.choice); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:rpsNextRound', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.nextGroupRpsRound(t); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:rpsExcludeDisconnected', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { const excludedIds = table.excludeDisconnectedGroupRpsPlayers(t); ack?.({ ok: true, excludedCount: excludedIds.length }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:assignTeams', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.assignTeams(t, payload?.teamCount); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:startWorkshopQuiz', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.startWorkshopQuiz(t, payload?.type); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:revealWorkshopAnswer', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.revealWorkshopAnswer(t); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:awardWorkshopPoint', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.awardWorkshopPoint(t, payload?.teamId); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:nextWorkshopQuestion', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.nextWorkshopQuestion(t); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:finishWorkshopQuiz', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.finishWorkshopQuiz(t); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:resetWorkshopQuiz', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      table.resetWorkshopQuiz(t); ack?.({ ok: true }); broadcastState();
    });

    socket.on('raffle:enter', (payload, ack) => {
      const playerId = socketPlayer.get(socket.id);
      try { const number = table.enterRaffle(t, playerId); ack?.({ ok: true, number }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:addPrize', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.addRafflePrize(t, payload?.name); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:resetRaffle', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { table.resetRaffle(t); ack?.({ ok: true }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('admin:drawRaffle', (payload, ack) => {
      if (!t || !adminSockets.has(socket.id) || payload?.adminToken !== t.adminToken) { ack?.({ ok: false, error: '권한이 없습니다' }); return; }
      try { const winner = table.drawRaffleWinner(t); ack?.({ ok: true, winner }); broadcastState(); }
      catch (e) { ack?.({ ok: false, error: e.message }); }
    });

    socket.on('squeezeProgress', (payload) => {
      const playerId = socketPlayer.get(socket.id);
      if (!t || !playerId || !payload) return;
      try {
        table.squeezeProgress(t, playerId, payload.cardId, payload.edge, payload.pct, payload.grip);
        broadcastState();
      } catch {
        // Silently drop invalid/out-of-turn progress events (e.g. late frames after reveal).
      }
    });

    socket.on('squeezeRelease', (payload, ack) => {
      const playerId = socketPlayer.get(socket.id);
      if (!t || !playerId || !payload) { ack?.({ ok: false }); return; }
      try {
        if (t.timers.squeezeReveal) { ack?.({ ok: false }); return; }
        if ((Number(payload.pct) || 0) < SQUEEZE_REVEAL_FRAC) { ack?.({ ok: false, error: '카드를 94% 이상 열어야 공개됩니다' }); return; }
        // Hold the fully squeezed pose for one beat before flipping the card.
        table.squeezeProgress(t, playerId, payload.cardId, payload.edge, payload.pct, payload.grip);
        broadcastState();
        ack?.({ ok: true });
        t.timers.squeezeReveal = setTimeout(() => {
          if (!t) return;
          delete t.timers.squeezeReveal;
          try {
            const { done } = table.squeezeReveal(t, playerId, payload.cardId, payload.edge, payload.pct, payload.grip);
            broadcastState();
            advanceAfterReveal(done);
          } catch {
            // Round/card changed during the brief presentation delay.
          }
        }, SQUEEZE_SETTLE_MS);
      } catch (e) {
        ack?.({ ok: false, error: e.message });
      }
    });

    socket.on('disconnect', () => {
      adminSockets.delete(socket.id);
      const playerId = socketPlayer.get(socket.id);
      if (playerId && t) {
        const player = t.players.get(playerId);
        if (player && player.socketId === socket.id) {
          player.connected = false;
          player.socketId = null;
          broadcastState();
          if (playerId === table.activeSqueezerId(t) &&
              (t.round.phase === 'squeeze' || t.round.phase === 'extra-card')) {
            advanceDealerAutoReveals();
          }
        }
      }
      socketPlayer.delete(socket.id);
    });
  });
}

module.exports = { registerSocketServer };
