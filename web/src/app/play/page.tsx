'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ack, getSocket, PLAYER_TOKEN_KEY } from '@/lib/socket';
import type { BetType, CardView, Edge, TableState } from '@/lib/types';
import BettingBoard from '@/components/BettingBoard';
import BigRoadGrid from '@/components/BigRoadGrid';
import CardSlot, { EmptyCardSlot } from '@/components/CardSlot';
import SqueezeCanvas from '@/components/SqueezeCanvas';
import ResultHands from '@/components/ResultHands';
import RoundResultCallout from '@/components/RoundResultCallout';
import OpeningRoadGame from '@/components/OpeningRoadGame';
import KeynesMiniGame, { MiniGameRules } from '@/components/KeynesMiniGame';
import PrizeDraw from '@/components/PrizeDraw';
import GroupRpsGame from '@/components/GroupRpsGame';
import { BET_TYPES } from '@/lib/betTypes';
import { formatKRW } from '@/lib/chips';

const PHASE_LABEL: Record<TableState['phase'], string> = {
  'road-seeding': '초기 게임 진행',
  'betting-wait': '베팅 시간',
  'betting-confirmed': '베팅 마감',
  dealing: '딜링 중',
  squeeze: '카드 쪼기',
  'extra-card': '추가 카드',
  'third-card-call': '추가 카드 콜',
  'dealer-call': '딜러 콜',
  'result-calc': '결과 계산 중',
  payout: '정산',
  'next-round': '다음 라운드 준비'
};

function useCountdown(endsAt: number | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt ? remaining : 0;
}

export default function PlayPage() {
  const router = useRouter();
  const [state, setState] = useState<TableState | null>(null);
  const [connError, setConnError] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const lastLogAt = useRef(0);
  const wakeLockRef = useRef<{ released: boolean; release: () => Promise<void> } | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (document.visibilityState !== 'visible' || wakeLockRef.current?.released === false) return;
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ released: boolean; release: () => Promise<void> }> };
    }).wakeLock;
    if (!wakeLock) return;
    try {
      wakeLockRef.current = await wakeLock.request('screen');
    } catch {
      // Low-power mode and browser policy may deny the request; gameplay
      // remains usable and the next visibility/user action retries it.
    }
  }, []);

  useEffect(() => {
    void requestWakeLock();
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void requestWakeLock();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, [requestWakeLock]);

  useEffect(() => {
    const token = localStorage.getItem(PLAYER_TOKEN_KEY);
    if (!token) { router.replace('/join'); return; }
    const socket = getSocket();

    function onConnectError() { setConnError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'); }
    socket.on('connect_error', onConnectError);

    function onState(s: TableState) {
      setConnError(null);
      setState(s);
      const latest = s.log[s.log.length - 1];
      if (latest && latest.at > lastLogAt.current) {
        lastLogAt.current = latest.at;
        setCaption(latest.text);
        setTimeout(() => setCaption((c) => (c === latest.text ? null : c)), 2200);
      }
    }
    socket.on('state', onState);

    // Re-runs on every (re)connect, not just the first — a dropped
    // connection (screen lock, weak wifi, backgrounding the tab) otherwise
    // silently un-registers this socket server-side, and this player stops
    // receiving state updates until they manually reload.
    function attemptReconnect() {
      ack<{ ok: boolean; error?: string }>('reconnect_player', { token }).then((res) => {
        if (!res.ok) {
          localStorage.removeItem(PLAYER_TOKEN_KEY);
          router.replace('/join');
        }
      });
    }
    socket.on('connect', attemptReconnect);
    if (socket.connected) attemptReconnect();

    return () => {
      socket.off('state', onState);
      socket.off('connect_error', onConnectError);
      socket.off('connect', attemptReconnect);
    };
  }, [router]);

  if (connError) return <main className="flex-1 flex items-center justify-center p-6 text-red-400">{connError}</main>;
  if (!state) return <main className="flex-1 flex items-center justify-center p-6 text-zinc-500">연결 중...</main>;

  const { me } = state;
  if (!me) return <main className="flex-1 flex items-center justify-center p-6 text-zinc-500">참가 정보를 불러오는 중...</main>;

  function joinNewTournament() {
    localStorage.removeItem(PLAYER_TOKEN_KEY);
    router.replace('/join');
  }

  async function enterLandscape() {
    await document.documentElement.requestFullscreen?.().catch(() => undefined);
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: 'landscape') => Promise<void> };
    await orientation.lock?.('landscape').catch(() => undefined);
    await requestWakeLock();
  }

  const activeCard = state.cards.find((c) => c.dealt && !c.revealed) || null;
  const isSqueezingPhase = state.phase === 'squeeze' || state.phase === 'extra-card';
  const isCardCallPhase = state.phase === 'dealer-call' || state.phase === 'third-card-call';

  async function submitMiniGame(value: number) {
    const response = await ack<{ ok: boolean; error?: string }>('submitMiniGame', { value });
    return response.ok ? null : (response.error || '제출하지 못했습니다');
  }

  if (state.rps.status !== 'idle') return (
    <main className="min-h-[100svh] flex items-center justify-center p-2 lg:p-5">
      <div className="w-full max-w-4xl"><GroupRpsGame state={state} /></div>
    </main>
  );

  if (state.miniGame.status !== 'idle') return (
    <main className="h-[100svh] overflow-hidden flex flex-col gap-1.5 p-2 max-w-3xl mx-auto w-full">
      <TopBar state={state} />
      <div className="flex-1 min-h-0 flex items-center justify-center"><KeynesMiniGame state={state} onSubmit={submitMiniGame} /></div>
    </main>
  );

  return (
    <>
    <div className="landscape-gate fixed inset-0 z-50 flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_top,#34204e,#0b0a12_68%)] p-8 text-center">
      <div className="rotate-phone" aria-hidden="true">📱</div>
      <div><h1 className="text-2xl font-black text-amber-100">휴대폰을 가로로 돌려주세요</h1><p className="mt-2 text-sm text-zinc-400">토너먼트 게임은 가로모드 전용입니다.</p></div>
      <button type="button" onClick={enterLandscape} className="rounded-xl bg-amber-400 px-6 py-3 font-black text-zinc-950 active:scale-[0.98]">가로모드로 전환</button>
    </div>
    <main className="play-shell h-[100svh] overflow-hidden flex flex-col gap-3 p-3 max-w-md mx-auto w-full">
      <TopBar state={state} />
      <BettingCountdown state={state} />
      <div className="play-road"><BigRoadGrid road={state.bigRoad} /></div>

      {caption && (
        <div className="text-center text-sm text-amber-200 bg-black/50 rounded-full py-1 px-3 mx-auto">{caption}</div>
      )}

      {state.status === 'lobby' && (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
          <p className="font-semibold text-amber-200">관리자가 토너먼트를 시작하기를 기다리는 중</p>
          <p className="text-xs text-zinc-500">이 화면을 그대로 유지해 주세요.</p>
          <div className="mt-2 w-full"><MiniGameRules /></div>
          <div className="mt-2 w-full"><PrizeDraw state={state} /></div>
        </div>
      )}

      {state.status === 'active' && state.phase === 'betting-wait' && <BettingPhase state={state} me={me} />}

      {state.phase === 'road-seeding' && <PlayerSeedPreview state={state} />}

      {state.phase === 'betting-confirmed' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <p className="text-sm">{PHASE_LABEL[state.phase]}...</p>
          <div className="flex gap-2">
            {['P1', 'B1', 'P2', 'B2'].map((id) => (
              <div key={id} className="w-11 h-16 rounded-md bg-gradient-to-br from-purple-950 to-black border border-amber-600/40" />
            ))}
          </div>
        </div>
      )}

      {state.phase === 'dealing' && (
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(92px,1fr)_minmax(190px,280px)_minmax(92px,1fr)] items-center gap-2 text-zinc-400">
          <CardRow label="PLAYER" cards={state.cards.filter((c) => c.side === 'player')} scale={1.5} showTotal />
          <div className="text-center"><SqueezeAuthorityBanner state={state} /><p className="mt-2 text-sm">플레이어 → 뱅커 순서로 카드를 배분합니다</p></div>
          <CardRow label="BANKER" cards={state.cards.filter((c) => c.side === 'banker')} scale={1.5} showTotal />
        </div>
      )}

      {isSqueezingPhase && (
        <SqueezePhase key={activeCard?.cardId ?? 'no-active-card'} state={state} activeCard={activeCard} />
      )}

      {isCardCallPhase && <CardCallPhase state={state} />}

      {(state.phase === 'result-calc' || state.phase === 'payout' || state.phase === 'next-round') && (
        <ResultPhase state={state} me={me} onJoinNew={joinNewTournament} />
      )}
    </main>
    </>
  );
}

function TopBar({ state }: { state: TableState }) {
  const remaining = useCountdown(state.phaseEndsAt);
  return (
    <div className="flex items-center justify-between text-xs text-zinc-400 border-b border-zinc-800 pb-2">
      <div>
        <div className="text-amber-300 font-semibold">{state.tournamentName}</div>
        <div data-testid="phase-label">Round {state.roundNo}{state.roundLimit ? ` / ${state.roundLimit}` : ''} · {PHASE_LABEL[state.phase]}</div>
      </div>
      <div className="text-right">
        <div className="text-zinc-200 font-medium">{state.me ? formatKRW(state.me.chips) : ''}</div>
        {state.phase === 'betting-wait' && remaining > 0 && <div className="text-amber-400">{remaining}s</div>}
      </div>
    </div>
  );
}

function BettingPhase({ state, me }: { state: TableState; me: NonNullable<TableState['me']> }) {
  async function placeBet(type: BetType, amount: number) {
    await ack('placeBet', { type, amount });
  }
  async function clearBet(type: BetType) {
    await ack('placeBet', { type, amount: 0 });
  }
  async function confirmBets() {
    await ack('confirmBets', {});
  }
  return (
    <BettingBoard
      me={me}
      locked={state.phase !== 'betting-wait'}
      betLimits={state.betLimits}
      payoutMode={state.payoutMode}
      onPlaceBet={placeBet}
      onClearBet={clearBet}
      onConfirm={confirmBets}
    />
  );
}

const SIDE_LABEL: Record<CardView['side'], string> = { player: '플레이어', banker: '뱅커' };

function SqueezePhase({ state, activeCard }: { state: TableState; activeCard: CardView | null }) {
  const [controlPeel, setControlPeel] = useState<{ edge: Edge; pct: number; grip: number } | null>(null);
  const lastControlSent = useRef(0);

  function controlProgress(edge: Edge, pct: number, grip: number) {
    setControlPeel({ edge, pct, grip });
    if (performance.now() - lastControlSent.current < 55) return;
    lastControlSent.current = performance.now();
    getSocket().emit('squeezeProgress', { cardId: activeCard?.cardId, edge, pct, grip });
  }

  function controlRelease(edge: Edge, pct: number, willReveal: boolean, grip: number) {
    if (!activeCard) return;
    if (willReveal) ack('squeezeRelease', { cardId: activeCard.cardId, edge, pct, grip });
    else {
      setControlPeel(null);
      getSocket().emit('squeezeProgress', { cardId: activeCard.cardId, edge, pct: 0, grip });
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1">
      <p className="text-center text-sm text-zinc-400">
        {state.squeezerNickname && activeCard
          ? `${SIDE_LABEL[activeCard.side]} 최대 베팅: ${state.squeezerNickname}`
          : '최대 베팅 참가자 없음'}
      </p>

      {activeCard && (() => {
        const iCanSqueezeThisCard = state.isSqueezer && activeCard.needsSqueeze;
        return (
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(92px,1fr)_minmax(190px,280px)_minmax(92px,1fr)] items-center gap-2">
          <CardRow label="PLAYER" cards={state.cards.filter((c) => c.side === 'player')} activeId={activeCard?.cardId} scale={1.5} showTotal />
          <div className="flex flex-col items-center gap-1 min-h-0">
          {activeCard.needsSqueeze ? <div className="flex items-center justify-center gap-2 w-full">
            {iCanSqueezeThisCard && <SwipeControl axis="vertical" onProgress={controlProgress} onRelease={controlRelease} />}
            <div data-testid="squeeze-stage" className="squeeze-stage rounded-xl overflow-hidden shadow-2xl border border-amber-600/30 aspect-[11/16] max-h-[calc(100svh-6.5rem)]">
              <SqueezeCanvas
                key={activeCard.cardId}
                mode="remote"
                revealed={activeCard.revealed}
                rank={activeCard.rank}
                suit={activeCard.suit}
                remoteEdge={controlPeel?.edge ?? activeCard.edge}
                remotePct={controlPeel?.pct ?? activeCard.pct}
                remoteGrip={controlPeel?.grip ?? activeCard.grip}
                showThumbs
              />
            </div>
            {iCanSqueezeThisCard && <SwipeControl axis="horizontal" onProgress={controlProgress} onRelease={controlRelease} />}
          </div> : <div className="text-center text-sm text-amber-100/70">딜러 오픈</div>}
          </div>
          <CardRow label="BANKER" cards={state.cards.filter((c) => c.side === 'banker')} activeId={activeCard?.cardId} scale={1.5} showTotal />
        </div>
        );
      })()}
    </div>
  );
}

function PlayerSeedPreview({ state }: { state: TableState }) {
  return <div className="flex-1 flex flex-col items-center justify-center text-center"><OpeningRoadGame state={state} /><div className="mt-4 w-full"><BigRoadGrid road={state.bigRoad} /></div></div>;
}

function SqueezeAuthorityBanner({ state }: { state: TableState }) {
  const me = state.me?.id;
  return <div data-testid="squeeze-authorities" className="flex flex-col gap-1 text-xs"><div className={`rounded-lg border px-2 py-1 ${state.squeezeAuthorities.player.playerId === me ? 'border-blue-300 bg-blue-400/20 text-blue-100 font-black' : 'border-blue-500/25 text-blue-200'}`}>PLAYER 스퀴즈 · {state.squeezeAuthorities.player.nickname ?? '딜러 공개'}{state.squeezeAuthorities.player.playerId === me ? ' (나)' : ''}</div><div className={`rounded-lg border px-2 py-1 ${state.squeezeAuthorities.banker.playerId === me ? 'border-red-300 bg-red-400/20 text-red-100 font-black' : 'border-red-500/25 text-red-200'}`}>BANKER 스퀴즈 · {state.squeezeAuthorities.banker.nickname ?? '딜러 공개'}{state.squeezeAuthorities.banker.playerId === me ? ' (나)' : ''}</div></div>;
}

function BettingCountdown({ state }: { state: TableState }) {
  const remaining = useCountdown(state.phaseEndsAt);
  const lastBeep = useRef<number | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    function unlockAudio() {
      const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const audio = audioRef.current ?? new AudioCtor();
      audioRef.current = audio;
      void audio.resume();
    }
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (state.phase !== 'betting-wait' || remaining < 1 || remaining > 10 || lastBeep.current === remaining) return;
    lastBeep.current = remaining;
    const audio = audioRef.current;
    if (!audio) return;
    const play = () => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = remaining === 1 ? 1050 : 760;
      gain.gain.setValueAtTime(0.2, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.15);
      osc.connect(gain).connect(audio.destination);
      osc.start(); osc.stop(audio.currentTime + 0.15);
    };
    if (audio.state === 'suspended') void audio.resume().then(play).catch(() => undefined);
    else play();
  }, [remaining, state.phase]);
  if (state.phase !== 'betting-wait' || remaining < 1 || remaining > 10) return null;
  return <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center" aria-live="assertive"><div className="countdown-pop text-8xl font-black text-amber-300 drop-shadow-[0_0_35px_rgba(251,191,36,0.8)]">{remaining}</div></div>;
}

function SwipeControl({ axis, onProgress, onRelease }: {
  axis: 'vertical' | 'horizontal';
  onProgress: (edge: Edge, pct: number, grip: number) => void;
  onRelease: (edge: Edge, pct: number, willReveal: boolean, grip: number) => void;
}) {
  const drag = useRef<{ pointerId: number; x: number; y: number; edge: Edge; pct: number; released: boolean } | null>(null);

  function update(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.released) return;
    const delta = axis === 'vertical' ? event.clientY - current.y : event.clientX - current.x;
    const edge: Edge = axis === 'vertical'
      ? (delta >= 0 ? 'top' : 'bottom')
      : (delta >= 0 ? 'left' : 'right');
    const pct = Math.min(1, Math.abs(delta) / Math.max(110, window.innerWidth * 0.2));
    current.edge = edge;
    current.pct = pct;
    onProgress(edge, pct, 0.5);
    if (pct >= 0.94) {
      current.released = true;
      onRelease(edge, pct, true, 0.5);
      try { navigator.vibrate?.(28); } catch { /* unsupported */ }
    }
  }

  function finish() {
    const current = drag.current;
    if (!current || current.released) { drag.current = null; return; }
    onRelease(current.edge, current.pct, current.pct >= 0.94, 0.5);
    drag.current = null;
  }

  return <div
    role="application"
    aria-label={axis === 'vertical' ? '위아래 스퀴즈 조작' : '좌우 스퀴즈 조작'}
    className={`squeeze-control shrink-0 rounded-full border border-amber-300/35 bg-black/45 text-amber-200 flex items-center justify-center select-none ${axis === 'vertical' ? 'h-36 w-9' : 'h-12 w-12'}`}
    style={{ touchAction: 'none' }}
    onPointerDown={(event) => {
      const edge: Edge = axis === 'vertical' ? 'top' : 'left';
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, edge, pct: 0, released: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={update}
    onPointerUp={finish}
    onPointerCancel={finish}
  >
    <span className={`font-black text-lg ${axis === 'horizontal' ? 'whitespace-nowrap' : 'leading-5 text-center'}`}>{axis === 'vertical' ? <>↑<br />↓</> : '←→'}</span>
  </div>;
}

function CardRow({ label, cards, activeId, scale = 1, showTotal = false }: { label: string; cards: CardView[]; activeId?: string; scale?: number; showTotal?: boolean }) {
  const side = cards[0]?.side;
  const prefix = side === 'banker' ? 'B' : 'P';
  const slots = [1, 2, 3].map((number) => cards.find((card) => card.cardId === `${prefix}${number}`));
  const revealed = cards.filter((card) => card.dealt && card.revealed && card.rank);
  const total = revealed.length > 0
    ? revealed.reduce((sum, card) => sum + (card.rank === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(card.rank!) ? 0 : Number(card.rank)), 0) % 10
    : null;
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <div className="grid grid-cols-2 gap-1.5 items-center justify-items-center">
        {slots.map((card, index) => <div key={`${prefix}-slot-${index}`} className={index === 2 ? 'col-span-2' : ''}>{card?.dealt
          ? <CardSlot key={card.cardId} card={card} dim={card.cardId === activeId && card.needsSqueeze} scale={scale} />
          : <EmptyCardSlot key={`${prefix}${index + 1}-empty`} orientation={index === 2 ? 'horizontal' : 'vertical'} scale={scale} />
        }</div>)}
      </div>
      {showTotal && <div className="text-4xl font-black tabular-nums text-white drop-shadow-[0_0_18px_rgba(251,191,36,0.45)]">{total ?? '–'}</div>}
    </div>
  );
}

function CardCallPhase({ state }: { state: TableState }) {
  const latestCall = state.log[state.log.length - 1]?.text;
  return (
    <div className="flex-1 min-h-0 grid grid-cols-[minmax(92px,1fr)_minmax(190px,280px)_minmax(92px,1fr)] items-center gap-2">
      <CardRow label="PLAYER" cards={state.cards.filter((card) => card.side === 'player')} scale={1.5} showTotal />
      <div className="rounded-full border border-amber-300/25 bg-black/35 px-4 py-2 text-center text-lg font-black text-amber-100">
        {latestCall}
      </div>
      <CardRow label="BANKER" cards={state.cards.filter((card) => card.side === 'banker')} scale={1.5} showTotal />
    </div>
  );
}

function ResultPhase({ state, me, onJoinNew }: { state: TableState; me: NonNullable<TableState['me']>; onJoinNew: () => void }) {
  const result = state.result;
  async function submitMiniGame(value: number) {
    const response = await ack<{ ok: boolean; error?: string }>('submitMiniGame', { value });
    return response.ok ? null : (response.error || '제출하지 못했습니다');
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
      {state.miniGame.status !== 'idle' && <KeynesMiniGame state={state} onSubmit={submitMiniGame} />}
      {state.miniGame.status === 'idle' && result && (
        <div className="flex flex-col gap-4">
          <ResultHands cards={state.cards} result={result} scale={1.15} />
          <RoundResultCallout result={result} />
        </div>
      )}
      {state.miniGame.status === 'idle' && me.settlement && me.settlement.length > 0 && (
        <div className="w-full max-w-xs flex flex-col gap-1.5">
          {me.settlement.map((s, i) => {
            const label = BET_TYPES.find((b) => b.type === s.type)?.label ?? s.type;
            const color = s.result === 'win' ? 'text-emerald-400' : s.result === 'push' ? 'text-zinc-400' : 'text-red-400';
            const sign = s.net > 0 ? '+' : '';
            return (
              <div key={i} className="flex justify-between text-sm border-b border-zinc-800 pb-1">
                <span className="text-zinc-300">{label}</span>
                <span className={color}>{sign}{formatKRW(s.net)}</span>
              </div>
            );
          })}
        </div>
      )}
      {state.status === 'finished' && (
        <button
          data-testid="join-new-tournament"
          onClick={onJoinNew}
          className="mt-4 w-full max-w-xs rounded-xl bg-amber-400 px-6 py-4 text-base font-black text-zinc-950 shadow-[0_12px_30px_rgba(251,191,36,0.22)] transition hover:bg-amber-300 active:scale-[0.98]"
        >
          새 토너먼트 참가
        </button>
      )}
      {state.phase === 'next-round' && <p className="text-xs text-zinc-500">잠시 후 다음 라운드가 시작됩니다...</p>}
    </div>
  );
}
