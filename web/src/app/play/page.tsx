'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ack, getSocket, PLAYER_TOKEN_KEY } from '@/lib/socket';
import type { BetType, CardView, Edge, TableState } from '@/lib/types';
import BettingBoard from '@/components/BettingBoard';
import BigRoadGrid from '@/components/BigRoadGrid';
import CardSlot from '@/components/CardSlot';
import SqueezeCanvas from '@/components/SqueezeCanvas';
import { BET_TYPES } from '@/lib/betTypes';
import { formatKRW } from '@/lib/chips';

const PHASE_LABEL: Record<TableState['phase'], string> = {
  'betting-wait': '베팅 시간',
  'betting-confirmed': '베팅 마감',
  dealing: '딜링 중',
  squeeze: '카드 쪼기',
  'extra-card': '추가 카드',
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

  const activeCard = state.cards.find((c) => !c.revealed) || null;
  const isSqueezingPhase = state.phase === 'squeeze' || state.phase === 'extra-card';

  return (
    <main className="flex-1 flex flex-col gap-3 p-3 pb-6 max-w-md mx-auto w-full">
      <TopBar state={state} />
      <BigRoadGrid road={state.bigRoad} />

      {caption && (
        <div className="text-center text-sm text-amber-200 bg-black/50 rounded-full py-1 px-3 mx-auto">{caption}</div>
      )}

      {state.phase === 'betting-wait' && <BettingPhase state={state} me={me} />}

      {(state.phase === 'betting-confirmed' || state.phase === 'dealing') && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <p className="text-sm">{PHASE_LABEL[state.phase]}...</p>
          <div className="flex gap-2">
            {['P1', 'B1', 'P2', 'B2'].map((id) => (
              <div key={id} className="w-11 h-16 rounded-md bg-gradient-to-br from-purple-950 to-black border border-amber-600/40" />
            ))}
          </div>
        </div>
      )}

      {isSqueezingPhase && (
        <SqueezePhase state={state} activeCard={activeCard} />
      )}

      {(state.phase === 'result-calc' || state.phase === 'payout' || state.phase === 'next-round') && (
        <ResultPhase state={state} me={me} />
      )}
    </main>
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
      onPlaceBet={placeBet}
      onClearBet={clearBet}
      onConfirm={confirmBets}
    />
  );
}

const SIDE_LABEL: Record<CardView['side'], string> = { player: '플레이어', banker: '뱅커' };

function SqueezePhase({ state, activeCard }: { state: TableState; activeCard: CardView | null }) {
  return (
    <div className="flex-1 flex flex-col gap-4">
      <p className="text-center text-sm text-zinc-400">
        {state.squeezerNickname ? `이번 판 쪼기: ${state.squeezerNickname}` : '쪼기 대상 없음'}
      </p>

      <div className="flex justify-center gap-6">
        <CardRow label="플레이어" cards={state.cards.filter((c) => c.side === 'player')} activeId={activeCard?.cardId} />
        <CardRow label="뱅커" cards={state.cards.filter((c) => c.side === 'banker')} activeId={activeCard?.cardId} />
      </div>

      {activeCard && (
        <div className="flex flex-col items-center gap-2 mt-2">
          <p className="text-xs text-zinc-500">
            {SIDE_LABEL[activeCard.side]} 카드 {state.isSqueezer ? '— 긴 변을 살짝, 짧은 변을 끝까지' : '쪼기 관전 중'}
          </p>
          <div data-testid="squeeze-stage" className="rounded-xl overflow-hidden shadow-2xl border border-amber-600/30" style={{ width: 220, height: 320 }}>
            {state.isSqueezer ? (
              <SqueezeCanvas
                mode="interactive"
                revealed={activeCard.revealed}
                rank={activeCard.rank}
                suit={activeCard.suit}
                onProgress={(edge: Edge, pct: number) => {
                  getSocket().emit('squeezeProgress', { cardId: activeCard.cardId, edge, pct });
                }}
                onRelease={(edge: Edge, pct: number, willReveal: boolean) => {
                  if (willReveal) ack('squeezeRelease', { cardId: activeCard.cardId, edge, pct });
                }}
              />
            ) : (
              <SqueezeCanvas
                mode="remote"
                revealed={activeCard.revealed}
                rank={activeCard.rank}
                suit={activeCard.suit}
                remoteEdge={activeCard.edge}
                remotePct={activeCard.pct}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardRow({ label, cards, activeId }: { label: string; cards: CardView[]; activeId?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <div className="flex gap-1.5">
        {cards.map((c) => (
          <CardSlot key={c.cardId} card={c} dim={c.cardId === activeId} />
        ))}
      </div>
    </div>
  );
}

function ResultPhase({ state, me }: { state: TableState; me: NonNullable<TableState['me']> }) {
  const result = state.result;
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
      {result && (
        <div>
          <div className="text-2xl font-bold text-amber-300">
            {result.outcome === 'tie' ? '타이' : result.outcome === 'player' ? '플레이어 승' : '뱅커 승'}
            {(result.playerNatural || result.bankerNatural) && <span className="ml-2 text-sm text-emerald-400">내추럴</span>}
          </div>
          <div className="text-sm text-zinc-400 mt-1">
            플레이어 {result.playerTotal} : 뱅커 {result.bankerTotal}
          </div>
        </div>
      )}
      {me.settlement && me.settlement.length > 0 && (
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
      {state.phase === 'next-round' && <p className="text-xs text-zinc-500">잠시 후 다음 라운드가 시작됩니다...</p>}
    </div>
  );
}
