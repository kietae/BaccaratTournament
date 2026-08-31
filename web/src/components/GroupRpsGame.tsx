'use client';

import { useState } from 'react';
import { ack } from '@/lib/socket';
import type { TableState } from '@/lib/types';

type Choice = 'rock' | 'paper' | 'scissors';
const CHOICES: { id: Choice; label: string; emoji: string; color: string }[] = [
  { id: 'scissors', label: '가위', emoji: '✌️', color: 'from-cyan-400 to-blue-600' },
  { id: 'rock', label: '바위', emoji: '✊', color: 'from-amber-400 to-orange-600' },
  { id: 'paper', label: '보', emoji: '✋', color: 'from-pink-400 to-violet-600' }
];

function choiceInfo(choice: Choice | null) {
  return CHOICES.find((item) => item.id === choice) ?? { id: 'rock', label: '선택 중', emoji: '❔', color: 'from-zinc-500 to-zinc-700' };
}

export default function GroupRpsGame({ state, adminToken }: { state: TableState; adminToken?: string }) {
  const game = state.rps;
  const [message, setMessage] = useState<string | null>(null);
  const me = state.me;
  const alive = me ? game.aliveIds.includes(me.id) : false;
  const survived = me ? game.roundWinnerIds.includes(me.id) : false;
  const computer = choiceInfo(game.computerChoice);
  const disconnectedBlockers = game.alivePlayers.filter((player) => !player.connected && !player.hasSubmitted);

  async function choose(choice: Choice) {
    const result = await ack<{ ok: boolean; error?: string }>('rps:submit', { choice });
    setMessage(result.ok ? `${choiceInfo(choice).label} 선택 완료!` : result.error || '선택하지 못했습니다');
  }

  return (
    <section className="relative w-full overflow-hidden rounded-3xl border border-fuchsia-400/30 bg-[radial-gradient(circle_at_top,#4c1d61,#160b24_62%,#07050c)] p-5 text-center shadow-[0_0_70px_rgba(217,70,239,.16)] lg:p-9">
      <div className="pointer-events-none absolute inset-0 rps-rays opacity-20" />
      <div className="relative">
        <p className="text-xs font-black tracking-[.35em] text-fuchsia-300">GROUP BATTLE</p>
        <h2 className="mt-2 text-3xl font-black text-white lg:text-5xl">단체 가위바위보</h2>
        <div className="mt-3 flex justify-center gap-2 text-sm"><span className="rounded-full bg-white/10 px-4 py-1.5 text-fuchsia-100">ROUND {game.roundNo}</span><span className="rounded-full bg-white/10 px-4 py-1.5 text-fuchsia-100">생존 {game.aliveIds.length}명</span>{game.status === 'selecting' && <span className="rounded-full bg-emerald-400/15 px-4 py-1.5 text-emerald-200">선택 {game.submittedCount}/{game.aliveIds.length}</span>}</div>

        {game.status === 'selecting' && (
          <div className="mt-7">
            <p className="text-lg font-bold text-white">컴퓨터를 이길 손을 선택하세요!</p>
            <p className="mt-1 text-sm text-zinc-300">모든 생존자가 선택하면 동시에 공개됩니다.</p>
            {adminToken ? (
              <div className="mx-auto mt-7 max-w-2xl"><div className="rps-thinking text-8xl">✊</div><p className="mt-5 animate-pulse text-xl font-black text-fuchsia-200">참가자 선택을 기다리는 중…</p><div className="mt-5 flex flex-wrap justify-center gap-2">{game.alivePlayers.map((player) => <span key={player.playerId} className={`rounded-full border px-3 py-1 text-sm ${!player.connected ? 'border-red-400/40 bg-red-400/10 text-red-200' : player.hasSubmitted ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-black/25 text-white'}`}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />{player.nickname}{player.hasSubmitted ? ' · 제출' : !player.connected ? ' · 미접속' : ''}</span>)}</div>{disconnectedBlockers.length > 0 && <button onClick={async () => { if (!window.confirm(`미접속 미제출자 ${disconnectedBlockers.length}명을 이번 게임에서 제외할까요?`)) return; const result = await ack<{ ok: boolean; error?: string; excludedCount?: number }>('admin:rpsExcludeDisconnected', { adminToken }); setMessage(result.ok ? `${result.excludedCount}명을 제외했습니다.` : result.error || '미접속자를 제외하지 못했습니다'); }} className="mt-6 rounded-xl border border-red-300/40 bg-red-400/10 px-6 py-3 font-black text-red-200">미접속 미제출자 {disconnectedBlockers.length}명 제외</button>}</div>
            ) : alive ? (
              <div className="mx-auto mt-7 grid max-w-xl grid-cols-3 gap-3">{CHOICES.map((choice) => <button key={choice.id} onClick={() => choose(choice.id)} className={`group rounded-2xl border p-3 transition active:scale-95 ${game.myChoice === choice.id ? 'border-white bg-white/20 shadow-[0_0_30px_rgba(255,255,255,.25)]' : 'border-white/10 bg-black/25 hover:bg-white/10'}`}><span className="block text-6xl transition group-hover:-translate-y-1 group-hover:scale-110">{choice.emoji}</span><span className={`mt-2 block rounded-lg bg-gradient-to-r ${choice.color} py-2 font-black text-white`}>{choice.label}</span></button>)}</div>
            ) : <div className="mt-8 rounded-2xl bg-black/30 p-7 text-zinc-300"><div className="text-5xl">👏</div><p className="mt-3 font-bold">다른 생존자들의 대결을 응원해 주세요!</p></div>}
            {!adminToken && game.myChoice && <p className="mt-4 text-emerald-300">선택 완료 · 공개 전까지 변경할 수 있습니다.</p>}
          </div>
        )}

        {game.status === 'round-result' && (
          <div className="mt-7">
            <p className="text-sm font-bold tracking-[.25em] text-fuchsia-200">COMPUTER&apos;S PICK</p>
            <div className="rps-reveal mt-2 text-9xl">{computer.emoji}</div>
            <p className="mt-2 text-3xl font-black text-white">컴퓨터는 {computer.label}!</p>
            <div className="mx-auto mt-6 grid max-w-3xl gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {game.roundChoices.map((player) => {
                const picked = choiceInfo(player.choice);
                const won = game.roundWinnerIds.includes(player.playerId);
                return <div key={player.playerId} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${won ? 'border-emerald-300/60 bg-emerald-400/15' : 'border-white/10 bg-black/25'}`}>
                  <span className="text-4xl">{picked.emoji}</span>
                  <span className="min-w-0"><b className="block truncate text-white">{player.nickname}</b><span className={won ? 'text-emerald-300' : 'text-zinc-400'}>{picked.label} · {won ? '승리' : '탈락'}</span></span>
                </div>;
              })}
            </div>
            {game.roundWinnerIds.length === 0 ? <div className="mt-5 rounded-2xl bg-amber-400/10 p-4 text-amber-200"><b>승자가 없습니다!</b> 현재 생존자 전원이 다시 대결합니다.</div> : <div className="mt-5"><p className="text-xl font-black text-emerald-300">{game.roundWinnerIds.length === 1 ? '최종 우승자가 결정되었습니다!' : `${game.roundWinnerIds.length}명 생존!`}</p><div className="mt-3 flex flex-wrap justify-center gap-2">{game.alivePlayers.filter((player) => game.roundWinnerIds.includes(player.playerId)).map((player) => <span key={player.playerId} className="rps-survivor rounded-full bg-emerald-400 px-4 py-2 font-black text-emerald-950">✨ {player.nickname}</span>)}</div></div>}
            {!adminToken && <p className={`mt-5 text-lg font-black ${survived ? 'text-emerald-300' : 'text-zinc-400'}`}>{alive ? (survived ? (game.roundWinnerIds.length === 1 ? '우승자 발표를 기다려 주세요!' : '다음 라운드 진출!') : '아쉽지만 탈락했습니다') : '대결 진행 중'}</p>}
            {adminToken && <button onClick={async () => { const result = await ack<{ ok: boolean; error?: string }>('admin:rpsNextRound', { adminToken }); if (!result.ok) setMessage(result.error || '다음 화면으로 이동하지 못했습니다'); }} className="mt-7 rounded-xl bg-fuchsia-300 px-8 py-4 text-lg font-black text-fuchsia-950">{game.roundWinnerIds.length === 1 ? '우승자 보기' : '다음 라운드 시작'}</button>}
          </div>
        )}

        {game.status === 'finished' && <div className="mt-8"><div className="rps-winner text-8xl">🏆</div><p className="mt-3 text-lg font-bold text-amber-300">단체 가위바위보 최종 우승</p><h3 className="mt-2 text-5xl font-black text-white">{game.winner?.nickname}</h3>{game.winner?.employeeId && <p className="mt-2 text-zinc-400">사번 {game.winner.employeeId}</p>}<div className="mx-auto mt-7 h-1 w-48 rounded-full bg-gradient-to-r from-transparent via-amber-300 to-transparent" /></div>}
        {message && <p className="mt-4 text-sm text-amber-100">{message}</p>}
      </div>
    </section>
  );
}
