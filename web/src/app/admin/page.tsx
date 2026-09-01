'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';
import { ack, getSocket, ADMIN_TOKEN_KEY } from '@/lib/socket';
import type { CardView, PayoutMode, TableState } from '@/lib/types';
import { formatKRW } from '@/lib/chips';
import BigRoadGrid from '@/components/BigRoadGrid';
import CardSlot, { EmptyCardSlot } from '@/components/CardSlot';
import SqueezeCanvas from '@/components/SqueezeCanvas';
import RoundResultCallout from '@/components/RoundResultCallout';
import OpeningRoadGame from '@/components/OpeningRoadGame';
import KeynesMiniGame, { MiniGameRules } from '@/components/KeynesMiniGame';
import PrizeDraw from '@/components/PrizeDraw';
import GroupRpsGame from '@/components/GroupRpsGame';
import WorkshopQuizGame from '@/components/WorkshopQuizGame';
import TeamOverallLeaderboard from '@/components/TeamOverallLeaderboard';
import { currentEventDisplay } from '@/lib/eventDisplay';

const PHASE_LABEL: Record<TableState['phase'], string> = {
  'road-seeding': '초기 게임 진행',
  'betting-wait': '베팅 중', 'betting-confirmed': '베팅 마감', dealing: '카드 배분',
  squeeze: '카드 스퀴즈', 'extra-card': '추가 카드', 'third-card-call': '추가 카드 콜', 'dealer-call': '딜러 콜', 'result-calc': '결과 확인',
  payout: '정산', 'next-round': '다음 라운드 준비'
};

export default function AdminPage() {
  const [state, setState] = useState<TableState | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [setupView, setSetupView] = useState<'menu' | 'options'>('menu');
  const [useBroadcastScreen, setUseBroadcastScreen] = useState(false);
  const [giftRegistryOpen, setGiftRegistryOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [name, setName] = useState('2026 CAGE 워크숍');
  const [initialChips, setInitialChips] = useState(30_000_000);
  const [roundLimit, setRoundLimit] = useState(7);
  const [bettingSeconds, setBettingSeconds] = useState(30);
  const [miniGameSeconds, setMiniGameSeconds] = useState(60);
  const [initialRoadGames, setInitialRoadGames] = useState(5);
  const [mainMin, setMainMin] = useState(1_000_000);
  const [mainMax, setMainMax] = useState(30_000_000);
  const [sideMin, setSideMin] = useState(100_000);
  const [sideMax, setSideMax] = useState(3_000_000);
  const [payoutMode, setPayoutMode] = useState<PayoutMode>('no-commission');
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
        if (res.ok) { setAdminToken(tok); setAuthenticated(true); }
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
    const broadcastWindow = useBroadcastScreen ? window.open('', 'cage-broadcast-screen') : null;
    const res = await ack<{ ok: boolean; error?: string; adminToken?: string }>('admin:create', { name, initialChips, roundLimit: roundLimit > 0 ? roundLimit : null, bettingSeconds, miniGameSeconds, initialRoadGames, payoutMode, betLimits: { mainMin, mainMax, sideMin, sideMax } });
    if (!res.ok || !res.adminToken) { broadcastWindow?.close(); setError(res.error || '생성 실패'); return; }
    localStorage.setItem(ADMIN_TOKEN_KEY, res.adminToken);
    tokenRef.current = res.adminToken;
    setAdminToken(res.adminToken);
    if (broadcastWindow) broadcastWindow.location.href='/screen';
  }

  async function startTournament() {
    if (!adminToken) return;
    // Unlock Web Audio inside the button gesture before the first deal begins.
    const audio = getAudioContext();
    if (audio?.state === 'suspended') await audio.resume().catch(() => undefined);
    const res = await ack<{ ok: boolean; error?: string }>('admin:start', { adminToken });
    if (!res.ok) setError(res.error || '시작 실패');
  }

  async function loginAdmin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const res = await ack<{ ok: boolean; error?: string }>('admin:login', { password });
    if (!res.ok) { setError(res.error || '관리자 인증에 실패했습니다'); return; }
    setAuthenticated(true);
    setPassword('');
  }

  async function startMiniGame(type: 'beauty-contest' | 'lowest-unique' | 'group-rps') {
    if (!adminToken) return;
    const res = await ack<{ ok: boolean; error?: string }>('admin:startMiniGame', { adminToken, type });
    if (!res.ok) setError(res.error || '미니게임을 시작하지 못했습니다');
  }

  async function revealMiniGame() {
    if (!adminToken) return;
    const res = await ack<{ ok: boolean; error?: string }>('admin:revealMiniGame', { adminToken });
    if (!res.ok) setError(res.error || '미니게임 결과를 공개하지 못했습니다');
  }

  async function togglePresentation() {
    setPresentation((value) => !value);
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
    else await document.exitFullscreen().catch(() => undefined);
  }

  async function returnToGameSelection() {
    if (!state || !adminToken) return;
    const gameInProgress = state.status === 'active'
      || state.miniGame.status === 'collecting'
      || state.rps.status === 'selecting'
      || state.rps.status === 'round-result'
      || state.workshopQuiz.status === 'question'
      || state.workshopQuiz.status === 'revealed'
      || state.workshopQuiz.status === 'instructions'
      || state.workshopQuiz.status === 'scoring'
      || state.raffle.status === 'collecting';
    if (gameInProgress && !window.confirm('현재 진행 중인 게임을 종료하고 게임 선택 화면으로 돌아갈까요?')) return;
    setError(null);
    window.speechSynthesis?.cancel();
    const result = await ack<{ ok: boolean; error?: string }>('admin:returnToGameSelection', { adminToken });
    if (!result.ok) setError(result.error || '게임 선택 화면으로 돌아가지 못했습니다');
  }

  function prepareNewTournament() {
    window.speechSynthesis?.cancel();
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    tokenRef.current = null;
    setAdminToken(null);
    setError(null);
  }

  if (attaching) return <main className="flex-1 flex items-center justify-center text-zinc-500">불러오는 중...</main>;
  if (!authenticated) return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={loginAdmin} className="w-full max-w-sm rounded-3xl border border-amber-400/20 bg-zinc-900/80 p-7 text-center shadow-2xl">
        <p className="text-xs font-bold tracking-[.3em] text-amber-400">2026 CAGE WORKSHOP</p>
        <h1 className="mt-3 text-3xl font-black text-white">관리자 로그인</h1>
        <p className="mt-2 text-sm text-zinc-400">관리자 비밀번호를 입력해 주세요.</p>
        <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="관리자 비밀번호" className="admin-input mt-6 w-full text-center" />
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button disabled={!password} className="mt-4 w-full rounded-xl bg-amber-400 py-3 font-black text-zinc-950 disabled:opacity-40">관리자 화면 입장</button>
      </form>
    </main>
  );
  if (!adminToken || !state) return (
    <main className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
      {setupView === 'menu' ? <div className="w-full max-w-4xl text-center"><p className="text-xs font-bold tracking-[.3em] text-amber-400">ADMIN CONSOLE</p><h1 className="mt-3 text-4xl font-black text-white">행사 관리</h1><p className="mt-2 text-zinc-400">옵션을 확인한 뒤 참가 접수를 시작하세요. 선물 수령 기록은 참가자가 접수된 뒤 등록할 수 있습니다.</p><div className="mt-6 flex items-center justify-between rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-4 text-left"><div><b className="text-cyan-100">중계용 대형 스크린</b><p className="text-sm text-zinc-400">연결된 보조 모니터나 프로젝터에 관객용 화면을 새 창으로 엽니다.</p></div><button type="button" onClick={()=>setUseBroadcastScreen((value)=>!value)} className={`rounded-xl px-5 py-3 font-black ${useBroadcastScreen?'bg-cyan-300 text-cyan-950':'bg-zinc-800 text-zinc-300'}`}>{useBroadcastScreen?'사용함':'사용 안 함'}</button></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><button onClick={() => setSetupView('options')} className="rounded-3xl border border-violet-400/30 bg-violet-400/10 p-7 text-left transition hover:bg-violet-400/20"><span className="text-4xl">⚙️</span><h2 className="mt-4 text-2xl font-black text-white">옵션 변경</h2><p className="mt-2 text-sm text-zinc-400">칩, 라운드, 시간과 베팅 한도를 설정합니다.</p></button><button onClick={createTournament} className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-7 text-left transition hover:bg-amber-400/20"><span className="text-4xl">🎪</span><h2 className="mt-4 text-2xl font-black text-white">참가 접수 시작</h2><p className="mt-2 text-sm text-zinc-400">입장 코드와 QR을 만들고 행사를 시작합니다.</p></button></div>{error && <p className="mt-4 text-sm text-red-300">{error}</p>}</div> : <>
      <div className="text-center"><p className="text-xs tracking-[0.28em] text-amber-500 uppercase">Game Settings</p><h1 className="mt-2 text-2xl font-bold text-amber-200">게임 옵션 변경</h1></div>
      <div className="flex flex-col gap-3 w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} className="admin-input" /></Field>
        <Field label="초기 지급 칩"><FormattedNumberInput value={initialChips} onChange={setInitialChips} /></Field>
        <Field label="라운드 수 제한 (0 = 무제한)"><FormattedNumberInput value={roundLimit} onChange={setRoundLimit} min={0} /></Field>
        <Field label="베팅 대기 시간(초)"><FormattedNumberInput value={bettingSeconds} onChange={setBettingSeconds} min={5} /></Field>
        <Field label="2/3 맞추기 · 눈치 게임 제한 시간(초)"><FormattedNumberInput value={miniGameSeconds} onChange={setMiniGameSeconds} min={10} max={300} /></Field>
        <Field label="시작 전 자동 게임 수"><FormattedNumberInput value={initialRoadGames} onChange={setInitialRoadGames} min={0} max={50} /></Field>
        <Field label="뱅커 정산 방식">
          <select value={payoutMode} onChange={(event) => setPayoutMode(event.target.value as PayoutMode)} className="admin-input">
            <option value="no-commission">노커미션 (뱅커 6 승리 시 0.5배)</option>
            <option value="commission">커미션 (뱅커 승리 시 0.95배)</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="메인벳 최소"><FormattedNumberInput value={mainMin} onChange={setMainMin} min={1} /></Field>
          <Field label="메인벳 최대"><FormattedNumberInput value={mainMax} onChange={setMainMax} min={1} /></Field>
          <Field label="옵션벳 최소"><FormattedNumberInput value={sideMin} onChange={setSideMin} min={1} /></Field>
          <Field label="옵션벳 최대"><FormattedNumberInput value={sideMax} onChange={setSideMax} min={1} /></Field>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="button" onClick={() => setSetupView('menu')} className="rounded-xl bg-amber-500 text-zinc-950 font-bold py-3 active:scale-[0.98] transition">옵션 저장</button>
      </div>
      </>}
    </main>
  );

  const roundsRemaining = state.roundLimit == null ? null : Math.max(0, state.roundLimit - state.roundNo);
  const eventDisplay = currentEventDisplay(state);
  return <main className={`flex-1 w-full mx-auto p-3 lg:p-4 ${state.status === 'active' ? 'h-[100dvh] overflow-hidden flex flex-col' : ''} ${presentation ? 'max-w-none' : 'max-w-7xl'}`}>
    <header className="relative flex min-h-28 items-center justify-between gap-4 border-b border-amber-500/20 pb-2 mb-3 pr-36 shrink-0">
      {qr && <Image src={qr} alt="상시 참가 QR" width={128} height={128} unoptimized className="absolute right-0 top-0 h-28 w-28 rounded-xl bg-white p-1.5" />}
      <div><p className="text-xs tracking-[0.24em] text-amber-500 uppercase">{eventDisplay.eyebrow}</p><h1 className="text-xl lg:text-3xl font-bold text-amber-100">{eventDisplay.title}</h1></div>
      <div className="flex items-center gap-2">{eventDisplay.baccarat&&<div className="text-right"><div className="font-mono text-amber-300">현재 {state.roundNo}판{roundsRemaining == null ? '' : ` · 남은 ${roundsRemaining}판`}</div><div data-testid="admin-phase" className="text-sm text-zinc-400">{state.status === 'finished' ? '바카라 종료' : PHASE_LABEL[state.phase]}</div></div>}<button onClick={()=>setGiftRegistryOpen(true)} className="rounded-lg border border-emerald-500/50 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-200">선물 수령 등록</button><button data-testid="return-to-game-selection" onClick={returnToGameSelection} className="rounded-lg border border-amber-500/50 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-400/20">게임 선택</button><button onClick={()=>window.open('/screen','cage-broadcast-screen')} className="rounded-lg border border-cyan-500/50 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-200">중계 화면 열기</button><button onClick={togglePresentation} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-amber-500/60">{presentation ? '전체화면 종료' : '전체화면'}</button></div>
    </header>
    {state.status !== 'active' && (state.status === 'lobby' || state.miniGame.status !== 'idle' || state.rps.status !== 'idle' || state.workshopQuiz.status !== 'idle') ? <Lobby state={state} qr={qr} adminToken={adminToken} onStart={startTournament} onStartMiniGame={startMiniGame} onRevealMiniGame={revealMiniGame} error={error} /> : state.status === 'finished' ? <div className="flex flex-col gap-5"><FinalLeaderboard state={state} onPrepareNew={prepareNewTournament} error={error} /><GameSelectionActions state={state} onStart={startTournament} onStartMiniGame={startMiniGame} /><WorkshopQuizGame state={state} adminToken={adminToken} /><PrizeDraw state={state} adminToken={adminToken} /></div> : <LiveDashboard state={state} />}
    <TeamOverallLeaderboard state={state} floating />
    {giftRegistryOpen && <GiftRegistry state={state} adminToken={adminToken} onClose={()=>setGiftRegistryOpen(false)} />}
  </main>;
}

function GiftRegistry({state,adminToken,onClose}:{state:TableState;adminToken:string;onClose:()=>void}){
  const [gameType,setGameType]=useState('초성 퀴즈');
  const [playerId,setPlayerId]=useState('');
  const [giftName,setGiftName]=useState('');
  const [editingCategory,setEditingCategory]=useState<string|null>(null);
  const [message,setMessage]=useState<string|null>(null);
  const giftAwards=state.awards.filter((award)=>award.category.startsWith('gift:'));
  function clearForm(){setEditingCategory(null);setPlayerId('');setGiftName('');setGameType('초성 퀴즈');}
  async function save(){const event=editingCategory?'admin:updateGiftRecipient':'admin:registerGiftRecipient';const result=await ack<{ok:boolean;error?:string}>(event,{adminToken,awardCategory:editingCategory,gameType,playerId,giftName});if(result.ok){clearForm();setMessage(editingCategory?'선물 수령 기록을 수정했습니다.':'선물 수령을 기록했습니다. 해당 참가자는 추첨 대상에서 제외됩니다.');}else setMessage(result.error||'저장하지 못했습니다');}
  function edit(award:TableState['awards'][number]){const [category,...giftParts]=award.title.split(' · ');setEditingCategory(award.category);setGameType(category||'기타');setGiftName(giftParts.join(' · '));setPlayerId(award.playerId);setMessage(null);}
  async function remove(category:string){if(!window.confirm('이 선물 수령 기록을 삭제할까요? 다른 수령 기록이 없다면 해당 참가자는 다시 추첨 대상이 됩니다.'))return;const result=await ack<{ok:boolean;error?:string}>('admin:deleteGiftRecipient',{adminToken,awardCategory:category});if(result.ok){if(editingCategory===category)clearForm();setMessage('선물 수령 기록을 삭제했습니다.');}else setMessage(result.error||'삭제하지 못했습니다');}
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"><section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-emerald-300/30 bg-zinc-950 p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold tracking-[.25em] text-emerald-300">GIFT RECIPIENTS</p><h2 className="mt-2 text-3xl font-black text-white">선물 수령 등록</h2><p className="mt-2 text-sm text-zinc-400">등록된 참가자는 이후 모든 경품 추첨에서 자동 제외됩니다.</p></div><button onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2 text-zinc-300">닫기</button></div><div className={`mt-6 rounded-2xl p-4 ${editingCategory?'border border-amber-300/30 bg-amber-300/5':'bg-white/[.03]'}`}><p className="mb-3 text-sm font-black text-white">{editingCategory?'선물 기록 수정':'새 선물 수령 등록'}</p><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm text-zinc-400">게임 종류<select value={gameType} onChange={(event)=>setGameType(event.target.value)} className="admin-input mt-1 w-full">{['초성 퀴즈','OX 퀴즈','눈·코·입','브랜드 맞추기','버텨줘! 스파이더맨','찰싹 머니헌터','바카라 토너먼트','2/3 맞추기','눈치 게임','가위바위보','기타'].map((name)=><option key={name}>{name}</option>)}</select></label><label className="text-sm text-zinc-400">받은 사람<select value={playerId} onChange={(event)=>setPlayerId(event.target.value)} className="admin-input mt-1 w-full"><option value="">참가자 선택</option>{[...state.players].sort((a,b)=>a.nickname.localeCompare(b.nickname,'ko')).map((player)=><option key={player.id} value={player.id}>{player.nickname} ({player.employeeId})</option>)}</select></label><label className="text-sm text-zinc-400">선물명<input value={giftName} onChange={(event)=>setGiftName(event.target.value)} placeholder="선물 이름" className="admin-input mt-1 w-full" /></label></div><div className="mt-4 flex gap-2"><button disabled={!playerId||!giftName.trim()} onClick={save} className="flex-1 rounded-xl bg-emerald-300 py-3 font-black text-emerald-950 disabled:opacity-40">{editingCategory?'수정 저장':'수령 기록 등록'}</button>{editingCategory&&<button onClick={clearForm} className="rounded-xl border border-zinc-600 px-5 font-bold text-zinc-300">수정 취소</button>}</div></div>{message&&<p className="mt-3 text-center text-sm text-emerald-200">{message}</p>}<div className="mt-6"><h3 className="font-black text-white">등록 내역 {giftAwards.length}건</h3><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{[...giftAwards].reverse().map((award)=><div key={award.category} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-white/5 px-4 py-2"><div><span className="font-bold text-white">{award.nickname}</span><span className="ml-3 text-sm text-zinc-300">{award.title}</span></div><div className="flex gap-1"><button onClick={()=>edit(award)} className="rounded-lg bg-amber-300/15 px-3 py-1.5 text-xs font-bold text-amber-200">수정</button><button onClick={()=>remove(award.category)} className="rounded-lg bg-red-400/15 px-3 py-1.5 text-xs font-bold text-red-200">삭제</button></div></div>)}{!giftAwards.length&&<p className="rounded-xl bg-white/5 p-4 text-center text-zinc-500">아직 등록된 수령자가 없습니다.</p>}</div></div></section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1 text-sm text-zinc-400">{label}{children}</label>; }

function FormattedNumberInput({ value, onChange, min, max }: { value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value.toLocaleString('ko-KR')}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '');
        onChange(digits ? Number(digits) : 0);
      }}
      min={min}
      max={max}
      className="admin-input"
    />
  );
}

function Lobby({ state, qr, adminToken, onStart, onStartMiniGame, onRevealMiniGame, error }: { state: TableState; qr: string | null; adminToken: string; onStart: () => void; onStartMiniGame: (type: 'beauty-contest' | 'lowest-unique' | 'group-rps') => void; onRevealMiniGame: () => void; error: string | null }) {
  if (state.workshopQuiz.status !== 'idle') return <WorkshopQuizGame state={state} adminToken={adminToken} />;
  if (state.rps.status !== 'idle') return <div className="flex flex-col gap-5"><GroupRpsGame state={state} adminToken={adminToken} />{state.rps.status === 'finished' && <><GameSelectionActions state={state} onStart={onStart} onStartMiniGame={onStartMiniGame} /><PrizeDraw state={state} adminToken={adminToken} /></>} {error && <p className="text-center text-sm text-red-400">{error}</p>}</div>;
  if (state.miniGame.status !== 'idle') return <div className="flex flex-col gap-5"><KeynesMiniGame state={state} admin onReveal={onRevealMiniGame} />{state.miniGame.status === 'revealed' && <><GameSelectionActions state={state} onStart={onStart} onStartMiniGame={onStartMiniGame} /><PrizeDraw state={state} adminToken={adminToken} /></>}{error && <p className="text-center text-sm text-red-400">{error}</p>}</div>;
  return <div className="grid lg:grid-cols-[minmax(320px,0.8fr)_1.2fr] gap-6 items-stretch">
    <section className="rounded-3xl border border-amber-500/20 bg-gradient-to-br from-zinc-900 to-black p-7 flex flex-col items-center justify-center text-center">
      <p className="text-zinc-400 mb-3">휴대전화 카메라로 QR을 스캔하세요</p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element -- QR is a runtime-generated data URI.
        <img src={qr} alt="입장 QR 코드" className="rounded-2xl bg-white p-3 w-[260px] h-[260px]" />
      )}
      <div className="mt-5 text-sm text-zinc-500">입장 코드</div><div data-testid="join-code" className="font-mono text-4xl lg:text-5xl font-black text-amber-300 tracking-[0.2em] pl-[0.2em]">{state.joinCode}</div>
      <GameSelectionActions state={state} onStart={onStart} onStartMiniGame={onStartMiniGame} />
      <div className="mt-5 w-full max-w-xl"><MiniGameRules /></div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section><div className="flex flex-col gap-5"><Leaderboard state={state} title={`참가자 ${state.playerCount}명`} /><WorkshopQuizGame state={state} adminToken={adminToken} /><PrizeDraw state={state} adminToken={adminToken} /></div>
  </div>;
}

function LiveDashboard({ state }: { state: TableState }) {
  const activeCard = state.cards.find((card) => card.dealt && !card.revealed) ?? null;
  const mainBets = state.mainBetSummary ?? { player: { bettors: 0, amount: 0 }, banker: { bettors: 0, amount: 0 } };
  return <div className="flex-1 min-h-0 grid grid-rows-[minmax(130px,30vh)_minmax(0,1fr)] gap-3">
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-3 min-h-0">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 min-w-0 overflow-hidden"><div className="flex items-center justify-between gap-3 mb-2"><h2 className="font-semibold text-zinc-200 shrink-0">바카라 매</h2>{!state.isFinalRound && <div className="flex items-center gap-2 text-xs tabular-nums"><span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-2.5 py-1 text-blue-200">PLAYER {mainBets.player.bettors}명 · {formatKRW(mainBets.player.amount)}</span><span className="rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-red-200">BANKER {mainBets.banker.bettors}명 · {formatKRW(mainBets.banker.amount)}</span><span className="text-zinc-500">총 {formatKRW(state.totalPot)}</span></div>}</div><BigRoadGrid road={state.bigRoad} /></section>
      <Leaderboard state={state} title="실시간 리더보드" limit={5} hideNames />
    </div>
    <TableStage state={state} activeCard={activeCard} />
  </div>;
}

function GameSelectionActions({ state, onStart, onStartMiniGame }: { state: TableState; onStart: () => void; onStartMiniGame: (type: 'beauty-contest' | 'lowest-unique' | 'group-rps') => void }) {
  return <section className="mx-auto w-full max-w-2xl rounded-2xl border border-amber-400/20 bg-black/25 p-4 text-center"><p className="text-xs font-bold tracking-[.25em] text-amber-400">{state.miniGame.status === 'revealed' || state.rps.status === 'finished' || state.raffle.status === 'finished' ? '게임 종료 · 다음 게임 선택' : '행사 선택'}</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"><button data-testid="start-tournament" onClick={onStart} disabled={state.playerCount === 0} className="rounded-xl bg-amber-400 px-2 py-3 text-sm font-black text-zinc-950 disabled:opacity-40">바카라</button><button data-testid="start-beauty-contest" onClick={() => onStartMiniGame('beauty-contest')} disabled={state.playerCount === 0} className="rounded-xl bg-violet-300 px-2 py-3 text-sm font-black text-violet-950 disabled:opacity-40">2/3 맞추기</button><button data-testid="start-lowest-unique" onClick={() => onStartMiniGame('lowest-unique')} disabled={state.playerCount === 0} className="rounded-xl bg-cyan-300 px-2 py-3 text-sm font-black text-cyan-950 disabled:opacity-40">눈치 게임</button><button type="button" onClick={() => onStartMiniGame('group-rps')} disabled={state.playerCount < 2} className="rounded-xl bg-fuchsia-300 px-2 py-3 text-sm font-black text-fuchsia-950 disabled:opacity-40">가위바위보</button><button type="button" onClick={() => document.getElementById('prize-draw')?.scrollIntoView({ behavior: 'smooth' })} className="col-span-2 rounded-xl bg-emerald-300 px-2 py-3 text-sm font-black text-emerald-950 sm:col-span-1">경품 추첨</button></div></section>;
}

function TableStage({ state, activeCard }: { state: TableState; activeCard: CardView | null }) {
  const resultVisible = state.result && ['result-calc', 'payout', 'next-round'].includes(state.phase);
  const squeezeVisible = activeCard && activeCard.needsSqueeze && (state.phase === 'squeeze' || state.phase === 'extra-card');
  if (state.phase === 'road-seeding') return <section className="rounded-3xl border border-emerald-700/30 bg-[radial-gradient(circle_at_top,#16543d,#08251a_70%)] p-3 min-h-0 overflow-hidden shadow-2xl flex items-center justify-center"><SeedPreview state={state} /></section>;
  return <section className="rounded-3xl border border-emerald-700/30 bg-[radial-gradient(circle_at_top,#16543d,#08251a_70%)] p-3 min-h-0 overflow-hidden shadow-2xl grid grid-cols-[minmax(150px,1fr)_minmax(220px,1.25fr)_minmax(150px,1fr)] items-center gap-4">
    <AdminCardRow label="PLAYER" cards={state.cards.filter((c) => c.side === 'player')} activeId={activeCard?.cardId} scale={1.5} />
    <div data-testid={resultVisible ? 'result-hands' : undefined} className="min-h-0 h-full flex items-center justify-center">{state.phase === 'third-card-call' || state.phase === 'dealer-call' ? <div className="text-center animate-pulse"><p className="text-sm tracking-[0.3em] text-amber-300">DEALER CALL</p><p className="mt-3 text-4xl lg:text-5xl font-black text-white drop-shadow-[0_0_24px_rgba(251,191,36,0.55)]">{state.log[state.log.length - 1]?.text}</p></div> : squeezeVisible ? <div className="h-full flex flex-col items-center justify-center gap-2"><div className="text-center"><p className="text-xs tracking-[0.2em] text-amber-400 uppercase">Live Squeeze</p><p className="text-sm font-bold text-white">{state.squeezerNickname ?? '딜러'} · {activeCard.side === 'player' ? '플레이어' : '뱅커'} {activeCard.cardId.slice(-1)}번째 카드</p></div><div data-testid="admin-squeeze-stage" className="h-[calc(100%-3rem)] max-h-[43vh] aspect-[11/16] rounded-2xl overflow-hidden border border-amber-400/40 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"><SqueezeCanvas key={activeCard.cardId} mode="remote" revealed={activeCard.revealed} rank={activeCard.rank} suit={activeCard.suit} remoteEdge={activeCard.edge} remotePct={activeCard.pct} remoteGrip={activeCard.grip} /></div></div> : resultVisible && state.result ? <div data-testid="admin-round-result"><RoundResultCallout result={state.result} large /></div> : <div className="text-center text-emerald-100/70"><div className="text-3xl font-bold">{PHASE_LABEL[state.phase]}</div><p className="mt-2 text-sm">참가자 {state.playerCount}명 · 연결 {state.players.filter((p) => p.connected).length}명</p></div>}</div>
    <AdminCardRow label="BANKER" cards={state.cards.filter((c) => c.side === 'banker')} activeId={activeCard?.cardId} scale={1.5} />
  </section>;
}

function SeedPreview({ state }: { state: TableState }) {
  return <OpeningRoadGame state={state} large />;
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

function FinalLeaderboard({ state, onPrepareNew, error }: { state: TableState; onPrepareNew: () => void; error: string | null }) {
  const ranked = [...state.players].sort((a, b) => b.chips - a.chips || a.nickname.localeCompare(b.nickname, 'ko'));
  const podium = [ranked[1], ranked[0], ranked[2]];
  return <div className="flex flex-col gap-7"><section className="rounded-3xl border border-amber-400/30 bg-[radial-gradient(circle_at_top,#4b3810,#100d08_68%)] p-8 lg:p-12 text-center"><p className="text-sm tracking-[0.3em] uppercase text-amber-400">Tournament Complete</p><h2 className="mt-2 text-4xl lg:text-6xl font-black text-amber-100">최종 결과</h2><div className="mt-10 flex items-end justify-center gap-3 lg:gap-8">{podium.map((player, i) => { const rank = [2, 1, 3][i]; const height = rank === 1 ? 'h-56' : rank === 2 ? 'h-44' : 'h-36'; return <div key={player?.id ?? rank} className={`w-28 lg:w-44 ${height} rounded-t-2xl bg-amber-300/10 border border-amber-300/25 flex flex-col justify-end p-4`}><div className="text-3xl">{rank === 1 ? '🏆' : rank === 2 ? '🥈' : '🥉'}</div><div className="font-bold text-white truncate">{player?.nickname ?? '-'}</div><div className="text-xs lg:text-sm text-amber-300">{player ? formatKRW(player.chips) : ''}</div><div className="mt-3 text-2xl font-black text-amber-200">{rank}</div></div>; })}</div><div className="mt-10 flex justify-center"><button data-testid="prepare-new-tournament" onClick={onPrepareNew} className="rounded-xl bg-amber-400 px-8 py-4 text-lg font-black text-zinc-950 shadow-[0_12px_35px_rgba(251,191,36,0.25)] transition hover:bg-amber-300 active:scale-[0.98]">새 토너먼트 준비</button></div>{error && <p className="mt-3 text-sm text-red-400">{error}</p>}</section><Leaderboard state={state} title="전체 순위" /></div>;
}
