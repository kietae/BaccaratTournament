'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ack, getSocket, ADMIN_TOKEN_KEY } from '@/lib/socket';
import type { CardView, TableState } from '@/lib/types';
import { formatKRW } from '@/lib/chips';
import BigRoadGrid from '@/components/BigRoadGrid';
import CardSlot, { EmptyCardSlot } from '@/components/CardSlot';
import SqueezeCanvas from '@/components/SqueezeCanvas';

const PHASE_LABEL: Record<TableState['phase'], string> = {
  'betting-wait': '베팅 중', 'betting-confirmed': '베팅 마감', dealing: '카드 배분',
  squeeze: '카드 스퀴즈', 'extra-card': '추가 카드', 'result-calc': '결과 확인',
  payout: '정산', 'next-round': '다음 라운드 준비'
};

export default function AdminPage() {
  const [state, setState] = useState<TableState | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [name, setName] = useState('바카라 토너먼트');
  const [initialChips, setInitialChips] = useState(30_000_000);
  const [roundLimit, setRoundLimit] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [presentation, setPresentation] = useState(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = localStorage.getItem(ADMIN_TOKEN_KEY);
    const socket = getSocket();
    function onState(s: TableState) { setState(s); }
    socket.on('state', onState);
    function attemptAttach() {
      const tok = tokenRef.current;
      if (!tok) { setAttaching(false); return; }
      ack<{ ok: boolean }>('admin:attach', { adminToken: tok }).then((res) => {
        if (res.ok) setAdminToken(tok);
        else { localStorage.removeItem(ADMIN_TOKEN_KEY); tokenRef.current = null; }
        setAttaching(false);
      });
    }
    socket.on('connect', attemptAttach);
    if (socket.connected) attemptAttach();
    return () => { socket.off('state', onState); socket.off('connect', attemptAttach); };
  }, []);

  useEffect(() => {
    if (!state?.joinCode) return;
    QRCode.toDataURL(`${window.location.origin}/join?code=${state.joinCode}`, { margin: 1, width: 320 }).then(setQr).catch(() => setQr(null));
  }, [state?.joinCode]);

  async function createTournament() {
    setError(null);
    const res = await ack<{ ok: boolean; error?: string; adminToken?: string }>('admin:create', { name, initialChips, roundLimit: roundLimit > 0 ? roundLimit : null });
    if (!res.ok || !res.adminToken) { setError(res.error || '생성 실패'); return; }
    localStorage.setItem(ADMIN_TOKEN_KEY, res.adminToken);
    tokenRef.current = res.adminToken;
    setAdminToken(res.adminToken);
  }

  async function startTournament() {
    if (!adminToken) return;
    const res = await ack<{ ok: boolean; error?: string }>('admin:start', { adminToken });
    if (!res.ok) setError(res.error || '시작 실패');
  }

  async function togglePresentation() {
    setPresentation((value) => !value);
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
    else await document.exitFullscreen().catch(() => undefined);
  }

  if (attaching) return <main className="flex-1 flex items-center justify-center text-zinc-500">불러오는 중...</main>;
  if (!adminToken || !state) return (
    <main className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
      <div className="text-center"><p className="text-xs tracking-[0.28em] text-amber-500 uppercase">Workshop Event</p><h1 className="mt-2 text-2xl font-bold text-amber-200">바카라 토너먼트 생성</h1></div>
      <div className="flex flex-col gap-3 w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} className="admin-input" /></Field>
        <Field label="초기 지급 칩"><input type="number" value={initialChips} onChange={(e) => setInitialChips(Number(e.target.value))} className="admin-input" /></Field>
        <Field label="라운드 수 제한 (0 = 무제한)"><input type="number" min={0} value={roundLimit} onChange={(e) => setRoundLimit(Number(e.target.value))} className="admin-input" /></Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button data-testid="create-tournament" onClick={createTournament} className="rounded-xl bg-amber-500 text-zinc-950 font-bold py-3 active:scale-[0.98] transition">생성</button>
      </div>
    </main>
  );

  return <main className={`flex-1 w-full mx-auto p-4 lg:p-6 ${presentation ? 'max-w-none' : 'max-w-7xl'}`}>
    <header className="flex items-center justify-between gap-4 border-b border-amber-500/20 pb-4 mb-5">
      <div><p className="text-xs tracking-[0.24em] text-amber-500 uppercase">Live Tournament</p><h1 className="text-xl lg:text-3xl font-bold text-amber-100">{state.tournamentName}</h1></div>
      <div className="flex items-center gap-3"><div className="text-right"><div className="font-mono text-amber-300">ROUND {state.roundNo}{state.roundLimit ? ` / ${state.roundLimit}` : ''}</div><div data-testid="admin-phase" className="text-sm text-zinc-400">{state.status === 'finished' ? '토너먼트 종료' : PHASE_LABEL[state.phase]}</div></div><button onClick={togglePresentation} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-amber-500/60">{presentation ? '전체화면 종료' : '전체화면'}</button></div>
    </header>
    {state.status === 'lobby' ? <Lobby state={state} qr={qr} onStart={startTournament} error={error} /> : state.status === 'finished' ? <FinalLeaderboard state={state} /> : <LiveDashboard state={state} />}
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1 text-sm text-zinc-400">{label}{children}</label>; }

function Lobby({ state, qr, onStart, error }: { state: TableState; qr: string | null; onStart: () => void; error: string | null }) {
  return <div className="grid lg:grid-cols-[minmax(320px,0.8fr)_1.2fr] gap-6 items-stretch">
    <section className="rounded-3xl border border-amber-500/20 bg-gradient-to-br from-zinc-900 to-black p-7 flex flex-col items-center justify-center text-center">
      <p className="text-zinc-400 mb-3">휴대전화 카메라로 QR을 스캔하세요</p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element -- QR is a runtime-generated data URI.
        <img src={qr} alt="입장 QR 코드" className="rounded-2xl bg-white p-3 w-[260px] h-[260px]" />
      )}
      <div className="mt-5 text-sm text-zinc-500">입장 코드</div><div data-testid="join-code" className="font-mono text-4xl lg:text-5xl font-black text-amber-300 tracking-[0.2em] pl-[0.2em]">{state.joinCode}</div>
      <button data-testid="start-tournament" onClick={onStart} disabled={state.playerCount === 0} className="mt-7 w-full max-w-sm rounded-xl bg-amber-500 text-zinc-950 font-black py-4 text-lg disabled:opacity-40">토너먼트 시작</button>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section><Leaderboard state={state} title={`참가자 ${state.playerCount}명`} />
  </div>;
}

function LiveDashboard({ state }: { state: TableState }) {
  const activeCard = state.cards.find((card) => !card.revealed) ?? null;
  return <div className="grid xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.75fr)] gap-5"><div className="flex flex-col gap-5 min-w-0">
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:p-5"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-zinc-200">바카라 매</h2><span className="text-sm text-zinc-500">총 베팅 {formatKRW(state.totalPot)}</span></div><BigRoadGrid road={state.bigRoad} /></section>
    <TableStage state={state} activeCard={activeCard} />
  </div><Leaderboard state={state} title="실시간 리더보드" /></div>;
}

function TableStage({ state, activeCard }: { state: TableState; activeCard: CardView | null }) {
  const resultVisible = state.result && ['result-calc', 'payout', 'next-round'].includes(state.phase);
  const squeezeVisible = activeCard && (state.phase === 'squeeze' || state.phase === 'extra-card');
  return <section className="rounded-3xl border border-emerald-700/30 bg-[radial-gradient(circle_at_top,#16543d,#08251a_70%)] p-5 lg:p-8 min-h-[520px] shadow-2xl flex flex-col">
    <div className="flex justify-center gap-10 lg:gap-20"><AdminCardRow label="PLAYER" cards={state.cards.filter((c) => c.side === 'player')} activeId={activeCard?.cardId} /><AdminCardRow label="BANKER" cards={state.cards.filter((c) => c.side === 'banker')} activeId={activeCard?.cardId} /></div>
    <div className="flex-1 flex items-center justify-center py-5">{squeezeVisible ? <div className="flex flex-col items-center gap-3"><div className="text-center"><p className="text-xs tracking-[0.2em] text-amber-400 uppercase">Live Squeeze</p><p className="text-lg font-bold text-white">{state.squeezerNickname ?? '딜러'} · {activeCard.side === 'player' ? '플레이어' : '뱅커'} {activeCard.cardId.slice(-1)}번째 카드</p></div><div data-testid="admin-squeeze-stage" className="w-[240px] h-[350px] lg:w-[280px] lg:h-[405px] rounded-2xl overflow-hidden border border-amber-400/40 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"><SqueezeCanvas key={activeCard.cardId} mode="remote" revealed={activeCard.revealed} rank={activeCard.rank} suit={activeCard.suit} remoteEdge={activeCard.edge} remotePct={activeCard.pct} remoteGrip={activeCard.grip} /></div></div> : resultVisible && state.result ? <div className="text-center" data-testid="admin-round-result"><p className="text-sm tracking-[0.25em] text-amber-400 uppercase">Round Result</p><div className="mt-2 text-5xl lg:text-7xl font-black text-white">{state.result.outcome === 'tie' ? '타이' : state.result.outcome === 'player' ? '플레이어 승' : '뱅커 승'}</div><div className="mt-4 text-2xl text-emerald-100">PLAYER {state.result.playerTotal} <span className="mx-3 text-zinc-500">:</span> {state.result.bankerTotal} BANKER</div></div> : <div className="text-center text-emerald-100/70"><div className="text-3xl font-bold">{PHASE_LABEL[state.phase]}</div><p className="mt-2 text-sm">참가자 {state.playerCount}명 · 연결 {state.players.filter((p) => p.connected).length}명</p></div>}</div>
  </section>;
}

function AdminCardRow({ label, cards, activeId }: { label: string; cards: CardView[]; activeId?: string }) {
  const prefix = label === 'BANKER' ? 'B' : 'P';
  const slots = [1, 2, 3].map((number) => cards.find((card) => card.cardId === `${prefix}${number}`));
  return <div className="flex flex-col items-center gap-2"><span className="text-xs font-bold tracking-[0.2em] text-amber-200">{label}</span><div className="flex gap-2 items-center">{slots.map((card, index) => card?.dealt ? <CardSlot key={card.cardId} card={card} dim={card.cardId === activeId} /> : <EmptyCardSlot key={`${prefix}${index + 1}-empty`} orientation={index === 2 ? 'horizontal' : 'vertical'} />)}</div></div>;
}

function Leaderboard({ state, title }: { state: TableState; title: string }) {
  const ranked = useMemo(() => [...state.players].sort((a, b) => b.chips - a.chips || a.nickname.localeCompare(b.nickname, 'ko')), [state.players]);
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 lg:p-5 min-h-0"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-zinc-200">{title}</h2><span className="text-xs text-zinc-500">연결 {state.players.filter((p) => p.connected).length}/{state.playerCount}</span></div><div data-testid="leaderboard" className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">{ranked.map((player, index) => <div key={player.id} className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-2 ${index < 3 ? 'bg-amber-400/10 border border-amber-400/15' : 'bg-black/20'}`}><span className={`font-mono font-black ${index === 0 ? 'text-amber-300' : 'text-zinc-500'}`}>{index + 1}</span><span className="truncate text-zinc-100"><span className={`inline-block w-2 h-2 rounded-full mr-2 ${player.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />{player.nickname}</span><span className="font-mono text-sm text-zinc-300 tabular-nums">{formatKRW(player.chips)}</span></div>)}{ranked.length === 0 && <p className="py-10 text-center text-zinc-600">참가자를 기다리는 중입니다</p>}</div></section>;
}

function FinalLeaderboard({ state }: { state: TableState }) {
  const ranked = [...state.players].sort((a, b) => b.chips - a.chips || a.nickname.localeCompare(b.nickname, 'ko'));
  const podium = [ranked[1], ranked[0], ranked[2]];
  return <div className="flex flex-col gap-7"><section className="rounded-3xl border border-amber-400/30 bg-[radial-gradient(circle_at_top,#4b3810,#100d08_68%)] p-8 lg:p-12 text-center"><p className="text-sm tracking-[0.3em] uppercase text-amber-400">Tournament Complete</p><h2 className="mt-2 text-4xl lg:text-6xl font-black text-amber-100">최종 결과</h2><div className="mt-10 flex items-end justify-center gap-3 lg:gap-8">{podium.map((player, i) => { const rank = [2, 1, 3][i]; const height = rank === 1 ? 'h-56' : rank === 2 ? 'h-44' : 'h-36'; return <div key={player?.id ?? rank} className={`w-28 lg:w-44 ${height} rounded-t-2xl bg-amber-300/10 border border-amber-300/25 flex flex-col justify-end p-4`}><div className="text-3xl">{rank === 1 ? '🏆' : rank === 2 ? '🥈' : '🥉'}</div><div className="font-bold text-white truncate">{player?.nickname ?? '-'}</div><div className="text-xs lg:text-sm text-amber-300">{player ? formatKRW(player.chips) : ''}</div><div className="mt-3 text-2xl font-black text-amber-200">{rank}</div></div>; })}</div></section><Leaderboard state={state} title="전체 순위" /></div>;
}
