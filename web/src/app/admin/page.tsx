'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ack, getSocket, ADMIN_TOKEN_KEY } from '@/lib/socket';
import type { CardView, TableState } from '@/lib/types';
import { formatKRW } from '@/lib/chips';
import BigRoadGrid from '@/components/BigRoadGrid';
import CardSlot, { EmptyCardSlot } from '@/components/CardSlot';
import SqueezeCanvas from '@/components/SqueezeCanvas';
import RoundResultCallout from '@/components/RoundResultCallout';

const PHASE_LABEL: Record<TableState['phase'], string> = {
  'betting-wait': '베팅 중', 'betting-confirmed': '베팅 마감', dealing: '카드 배분',
  squeeze: '카드 스퀴즈', 'extra-card': '추가 카드', 'third-card-call': '추가 카드 콜', 'dealer-call': '딜러 콜', 'result-calc': '결과 확인',
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
  const lastSpokenAt = useRef(0);
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const lastDealtCount = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  function getAudioContext() {
    const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    const audio = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = audio;
    return audio;
  }

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

  useEffect(() => {
    const latest = state?.log[state.log.length - 1];
    if (!latest || latest.at <= lastSpokenAt.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    lastSpokenAt.current = latest.at;
    const spoken = latest.text
      .replace('플레이어 원 모어 카드', 'Player, one more card')
      .replace('뱅커 원 모어 카드', 'Banker, one more card')
      .replace('플레이어 윈', 'Player wins')
      .replace('뱅커 윈', 'Banker wins')
      .replace(/^타이$/, 'Tie');
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = 'en-US';
    utterance.rate = 0.92;
    utterance.pitch = 1;
    const englishVoices = window.speechSynthesis.getVoices().filter((voice) => /^en(?:-|_)/i.test(voice.lang));
    utterance.voice = englishVoices.find((voice) => /aria|jenny|samantha|zira/i.test(voice.name)) ?? englishVoices[0] ?? null;
    activeUtterance.current = utterance;
    utterance.onend = () => { if (activeUtterance.current === utterance) activeUtterance.current = null; };
    utterance.onerror = () => { if (activeUtterance.current === utterance) activeUtterance.current = null; };
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.setTimeout(() => {
      if (activeUtterance.current === utterance) window.speechSynthesis.speak(utterance);
    }, 60);
  }, [state?.log]);

  useEffect(() => {
    if (!state) return;
    if (state.phase === 'betting-wait') lastDealtCount.current = 0;
    const dealtCount = state.cards.filter((card) => card.dealt).length;
    if (state.phase !== 'dealing' || dealtCount <= lastDealtCount.current) return;
    lastDealtCount.current = dealtCount;
    const audio = getAudioContext();
    if (!audio) return;
    function playWhoosh() {
      const duration = 0.18;
      const buffer = audio!.createBuffer(1, Math.floor(audio!.sampleRate * duration), audio!.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        const envelope = Math.sin(Math.PI * i / data.length) * (1 - i / data.length * 0.35);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
      const source = audio!.createBufferSource();
      const filter = audio!.createBiquadFilter();
      const gain = audio!.createGain();
      filter.type = 'bandpass';
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(2400, audio!.currentTime);
      filter.frequency.exponentialRampToValueAtTime(650, audio!.currentTime + duration);
      gain.gain.setValueAtTime(0.24, audio!.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio!.currentTime + duration);
      source.buffer = buffer;
      source.connect(filter).connect(gain).connect(audio!.destination);
      source.start();
    }
    if (audio.state === 'suspended') void audio.resume().then(playWhoosh);
    else playWhoosh();
  }, [state]);

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
    // Unlock Web Audio inside the button gesture before the first deal begins.
    const audio = getAudioContext();
    if (audio?.state === 'suspended') await audio.resume().catch(() => undefined);
    const res = await ack<{ ok: boolean; error?: string }>('admin:start', { adminToken });
    if (!res.ok) setError(res.error || '시작 실패');
  }

  async function togglePresentation() {
    setPresentation((value) => !value);
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
    else await document.exitFullscreen().catch(() => undefined);
  }

  function prepareNewTournament() {
    window.speechSynthesis?.cancel();
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    tokenRef.current = null;
    setAdminToken(null);
    setError(null);
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

  const roundsRemaining = state.roundLimit == null ? null : Math.max(0, state.roundLimit - state.roundNo);
  return <main className={`flex-1 w-full mx-auto p-3 lg:p-4 ${state.status === 'active' ? 'h-[100dvh] overflow-hidden flex flex-col' : ''} ${presentation ? 'max-w-none' : 'max-w-7xl'}`}>
    <header className="flex items-center justify-between gap-4 border-b border-amber-500/20 pb-2 mb-3 shrink-0">
      <div><p className="text-xs tracking-[0.24em] text-amber-500 uppercase">Live Tournament</p><h1 className="text-xl lg:text-3xl font-bold text-amber-100">{state.tournamentName}</h1></div>
      <div className="flex items-center gap-3"><div className="text-right"><div className="font-mono text-amber-300">현재 {state.roundNo}판{roundsRemaining == null ? '' : ` · 남은 ${roundsRemaining}판`}</div><div data-testid="admin-phase" className="text-sm text-zinc-400">{state.status === 'finished' ? '토너먼트 종료' : PHASE_LABEL[state.phase]}</div></div><button onClick={togglePresentation} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-amber-500/60">{presentation ? '전체화면 종료' : '전체화면'}</button></div>
    </header>
    {state.status === 'lobby' ? <Lobby state={state} qr={qr} onStart={startTournament} error={error} /> : state.status === 'finished' ? <FinalLeaderboard state={state} onPrepareNew={prepareNewTournament} /> : <LiveDashboard state={state} />}
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
  const activeCard = state.cards.find((card) => card.dealt && !card.revealed) ?? null;
  const mainBets = state.mainBetSummary ?? { player: { bettors: 0, amount: 0 }, banker: { bettors: 0, amount: 0 } };
  return <div className="flex-1 min-h-0 grid grid-rows-[minmax(130px,30vh)_minmax(0,1fr)] gap-3">
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-3 min-h-0">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 min-w-0 overflow-hidden"><div className="flex items-center justify-between gap-3 mb-2"><h2 className="font-semibold text-zinc-200 shrink-0">바카라 매</h2><div className="flex items-center gap-2 text-xs tabular-nums"><span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-2.5 py-1 text-blue-200">PLAYER {mainBets.player.bettors}명 · {formatKRW(mainBets.player.amount)}</span><span className="rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-red-200">BANKER {mainBets.banker.bettors}명 · {formatKRW(mainBets.banker.amount)}</span><span className="text-zinc-500">총 {formatKRW(state.totalPot)}</span></div></div><BigRoadGrid road={state.bigRoad} /></section>
      <Leaderboard state={state} title="실시간 리더보드" limit={5} hideNames />
    </div>
    <TableStage state={state} activeCard={activeCard} />
  </div>;
}

function TableStage({ state, activeCard }: { state: TableState; activeCard: CardView | null }) {
  const resultVisible = state.result && ['result-calc', 'payout', 'next-round'].includes(state.phase);
  const squeezeVisible = activeCard && activeCard.needsSqueeze && (state.phase === 'squeeze' || state.phase === 'extra-card');
  return <section className="rounded-3xl border border-emerald-700/30 bg-[radial-gradient(circle_at_top,#16543d,#08251a_70%)] p-3 min-h-0 overflow-hidden shadow-2xl grid grid-cols-[minmax(150px,1fr)_minmax(220px,1.25fr)_minmax(150px,1fr)] items-center gap-4">
    <AdminCardRow label="PLAYER" cards={state.cards.filter((c) => c.side === 'player')} activeId={activeCard?.cardId} scale={1.5} />
    <div data-testid={resultVisible ? 'result-hands' : undefined} className="min-h-0 h-full flex items-center justify-center">{state.phase === 'third-card-call' || state.phase === 'dealer-call' ? <div className="text-center animate-pulse"><p className="text-sm tracking-[0.3em] text-amber-300">DEALER CALL</p><p className="mt-3 text-4xl lg:text-5xl font-black text-white drop-shadow-[0_0_24px_rgba(251,191,36,0.55)]">{state.log[state.log.length - 1]?.text}</p></div> : squeezeVisible ? <div className="h-full flex flex-col items-center justify-center gap-2"><div className="text-center"><p className="text-xs tracking-[0.2em] text-amber-400 uppercase">Live Squeeze</p><p className="text-sm font-bold text-white">{state.squeezerNickname ?? '딜러'} · {activeCard.side === 'player' ? '플레이어' : '뱅커'} {activeCard.cardId.slice(-1)}번째 카드</p></div><div data-testid="admin-squeeze-stage" className="h-[calc(100%-3rem)] max-h-[43vh] aspect-[11/16] rounded-2xl overflow-hidden border border-amber-400/40 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"><SqueezeCanvas key={activeCard.cardId} mode="remote" revealed={activeCard.revealed} rank={activeCard.rank} suit={activeCard.suit} remoteEdge={activeCard.edge} remotePct={activeCard.pct} remoteGrip={activeCard.grip} /></div></div> : resultVisible && state.result ? <div data-testid="admin-round-result"><RoundResultCallout result={state.result} large /></div> : <div className="text-center text-emerald-100/70"><div className="text-3xl font-bold">{PHASE_LABEL[state.phase]}</div><p className="mt-2 text-sm">참가자 {state.playerCount}명 · 연결 {state.players.filter((p) => p.connected).length}명</p></div>}</div>
    <AdminCardRow label="BANKER" cards={state.cards.filter((c) => c.side === 'banker')} activeId={activeCard?.cardId} scale={1.5} />
  </section>;
}

function AdminCardRow({ label, cards, activeId, scale = 1 }: { label: string; cards: CardView[]; activeId?: string; scale?: number }) {
  const prefix = label === 'BANKER' ? 'B' : 'P';
  const slots = [1, 2, 3].map((number) => cards.find((card) => card.cardId === `${prefix}${number}`));
  const revealed = cards.filter((card) => card.dealt && card.revealed && card.rank);
  const total = revealed.length > 0
    ? revealed.reduce((sum, card) => sum + (card.rank === 'A' ? 1 : ['10', 'J', 'Q', 'K'].includes(card.rank!) ? 0 : Number(card.rank)), 0) % 10
    : null;
  return <div className="flex flex-col items-center gap-2"><div className="text-center"><div className="text-3xl lg:text-4xl font-black tabular-nums text-white drop-shadow-[0_0_18px_rgba(251,191,36,0.35)]">{total ?? '–'}</div><span className="text-xs font-bold tracking-[0.2em] text-amber-200">{label}</span></div><div className="grid grid-cols-2 gap-2 items-center justify-items-center">{slots.map((card, index) => <div key={`${prefix}-admin-${index}`} className={index === 2 ? 'col-span-2' : ''}>{card?.dealt ? <CardSlot card={card} dim={card.cardId === activeId && card.needsSqueeze} scale={scale} /> : <EmptyCardSlot orientation={index === 2 ? 'horizontal' : 'vertical'} scale={scale} />}</div>)}</div></div>;
}

function Leaderboard({ state, title, limit, hideNames = false }: { state: TableState; title: string; limit?: number; hideNames?: boolean }) {
  const ranked = useMemo(() => state.players
    .map((player, joinedOrder) => ({ player, joinedOrder }))
    .sort((a, b) => b.player.chips - a.player.chips || a.joinedOrder - b.joinedOrder)
    .slice(0, limit ?? state.players.length)
    .map(({ player }) => player), [state.players, limit]);
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 lg:p-5 min-h-0"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-zinc-200">{title}</h2><span className="text-xs text-zinc-500">연결 {state.players.filter((p) => p.connected).length}/{state.playerCount}</span></div><div data-testid="leaderboard" className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">{ranked.map((player, index) => <div key={player.id} className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-2 ${index < 3 ? 'bg-amber-400/10 border border-amber-400/15' : 'bg-black/20'}`}><span className={`font-mono font-black ${index === 0 ? 'text-amber-300' : 'text-zinc-500'}`}>{index + 1}</span><span className="truncate text-zinc-100" aria-label={player.connected ? '접속 중' : '연결 끊김'}><span className={`inline-block w-2 h-2 rounded-full mr-2 ${player.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />{hideNames ? null : player.nickname}</span><span className="font-mono text-sm text-zinc-300 tabular-nums">{formatKRW(player.chips)}</span></div>)}{ranked.length === 0 && <p className="py-10 text-center text-zinc-600">참가자를 기다리는 중입니다</p>}</div></section>;
}

function FinalLeaderboard({ state, onPrepareNew }: { state: TableState; onPrepareNew: () => void }) {
  const ranked = [...state.players].sort((a, b) => b.chips - a.chips || a.nickname.localeCompare(b.nickname, 'ko'));
  const podium = [ranked[1], ranked[0], ranked[2]];
  return <div className="flex flex-col gap-7"><section className="rounded-3xl border border-amber-400/30 bg-[radial-gradient(circle_at_top,#4b3810,#100d08_68%)] p-8 lg:p-12 text-center"><p className="text-sm tracking-[0.3em] uppercase text-amber-400">Tournament Complete</p><h2 className="mt-2 text-4xl lg:text-6xl font-black text-amber-100">최종 결과</h2><div className="mt-10 flex items-end justify-center gap-3 lg:gap-8">{podium.map((player, i) => { const rank = [2, 1, 3][i]; const height = rank === 1 ? 'h-56' : rank === 2 ? 'h-44' : 'h-36'; return <div key={player?.id ?? rank} className={`w-28 lg:w-44 ${height} rounded-t-2xl bg-amber-300/10 border border-amber-300/25 flex flex-col justify-end p-4`}><div className="text-3xl">{rank === 1 ? '🏆' : rank === 2 ? '🥈' : '🥉'}</div><div className="font-bold text-white truncate">{player?.nickname ?? '-'}</div><div className="text-xs lg:text-sm text-amber-300">{player ? formatKRW(player.chips) : ''}</div><div className="mt-3 text-2xl font-black text-amber-200">{rank}</div></div>; })}</div><button data-testid="prepare-new-tournament" onClick={onPrepareNew} className="mt-10 rounded-xl bg-amber-400 px-8 py-4 text-lg font-black text-zinc-950 shadow-[0_12px_35px_rgba(251,191,36,0.25)] transition hover:bg-amber-300 active:scale-[0.98]">새 토너먼트 준비</button></section><Leaderboard state={state} title="전체 순위" /></div>;
}
