'use client';

import { useEffect, useState } from 'react';
import type { TableState } from '@/lib/types';

export default function KeynesMiniGame({ state, admin = false, onSubmit, onReveal }: {
  state: TableState;
  admin?: boolean;
  onSubmit?: (value: number) => Promise<string | null>;
  onReveal?: () => void;
}) {
  const game = state.miniGame;
  const isLowestUnique = game.type === 'lowest-unique';
  const [value, setValue] = useState(() => game.myNumber == null ? '' : String(game.myNumber));
  const [message, setMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil(((game.endsAt ?? Date.now()) - Date.now()) / 1000)));
  const topResults = game.results.slice(0, 8);
  const myResult = game.results.find((result) => result.playerId === state.me?.id);
  const participantResults = admin
    ? game.results
    : myResult && !topResults.includes(myResult) ? [...game.results.slice(0, 7), myResult] : topResults;

  useEffect(() => {
    if (game.status !== 'collecting' || !game.endsAt) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((game.endsAt! - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [game.status, game.endsAt]);

  if (game.status === 'revealed') {
    return (
      <section className={`w-full rounded-3xl border border-violet-400/30 bg-[radial-gradient(circle_at_top,#39205e,#100b1b_68%)] text-center ${admin ? 'p-5 lg:p-8' : 'h-full min-h-0 p-2.5 flex flex-col'}`}>
        <p className="text-xs font-bold tracking-[0.28em] text-violet-300">MINI GAME</p>
        <h2 className={`${admin ? 'mt-2 text-3xl lg:text-5xl' : 'mt-0.5 text-xl'} font-black text-white`}>{isLowestUnique ? '눈치 게임' : '2/3 맞추기'}</h2>
        <p className="text-xs font-bold text-violet-200">{isLowestUnique ? '가장 낮은 유일한 숫자 결과' : '평균의 2/3 결과'}</p>
        {!isLowestUnique && <div className={`${admin ? 'mt-5' : 'mt-1'} flex justify-center gap-2 text-xs`}><span className="rounded-full bg-black/30 px-3 py-1 text-zinc-300">평균 <b className="text-white">{game.average?.toFixed(2)}</b></span><span className="rounded-full bg-amber-400/15 px-3 py-1 text-amber-200">목표값 <b>{game.target?.toFixed(2)}</b></span></div>}
        {game.results.length === 0 && <p className="mt-6 text-zinc-300">제출한 참가자가 없습니다.</p>}
        <div className={`mx-auto max-w-4xl ${admin ? 'mt-6 max-h-[45vh] space-y-2 overflow-y-auto pr-1' : 'mt-1.5 grid w-full flex-1 min-h-0 grid-cols-2 gap-1.5 overflow-hidden content-start'}`}>
          {participantResults.map((result) => <div key={result.playerId} className={`grid items-center rounded-lg border text-left ${admin ? 'grid-cols-[3rem_1fr_auto_auto] gap-3 px-4 py-3' : 'grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-1.5 px-2 py-1'} ${result.playerId === state.me?.id ? 'border-amber-300 bg-amber-300/15' : result.rank === 1 ? 'border-violet-300/50 bg-violet-300/10' : 'border-white/10 bg-black/20'}`}><span className={`${admin ? 'text-xl' : 'text-sm'} font-black text-amber-300`}>{result.rank > 0 ? `${result.rank}위` : '중복'}</span><span className="truncate text-sm font-bold text-white">{result.nickname}</span><span className={`font-mono text-violet-200 ${admin ? 'text-lg' : 'text-sm'}`}>{result.value}</span>{admin && <span className="text-xs text-zinc-400">{isLowestUnique ? (result.unique ? '유일함' : `${result.count}명 중복`) : `차이 ${result.distance.toFixed(2)}`}</span>}</div>)}
        </div>
        {!admin && game.results.length > participantResults.length && <p className="mt-1 text-[10px] text-zinc-500">상위 {participantResults.length}명까지 표시</p>}
      </section>
    );
  }

  return (
    <section className={`w-full rounded-3xl border border-violet-400/30 bg-[radial-gradient(circle_at_top,#39205e,#100b1b_68%)] text-center ${admin ? 'p-5 lg:p-8' : 'h-full p-3'}`}>
      <p className="text-xs font-bold tracking-[0.28em] text-violet-300">MINI GAME</p>
      <h2 className={`${admin ? 'mt-2 text-3xl lg:text-5xl' : 'mt-0.5 text-2xl'} font-black text-white`}>{isLowestUnique ? '눈치 게임' : '2/3 맞추기'}</h2>
      <p className={`mx-auto max-w-xl text-sm text-zinc-300 ${admin ? 'mt-3' : 'mt-1'}`}>{isLowestUnique ? '1~50 사이 숫자 하나를 적어라. 아무도 겹치지 않은 숫자 중 가장 낮은 숫자를 낸 사람이 우승.' : '0~100 사이 숫자 하나를 적어라. 전체 평균의 2/3에 가장 가까운 사람이 우승.'}</p>
      {!isLowestUnique && <p className={`mx-auto max-w-xl text-xs text-zinc-400 ${admin ? 'mt-2' : 'mt-0.5'}`}>동점이면 최종 숫자를 먼저 제출한 사람이 우선합니다. 10명 이상 참여하면 더 재미있습니다.</p>}
      <div className={`${admin ? 'mt-5' : 'mt-2'} flex flex-wrap items-center justify-center gap-3`}><span className="rounded-full bg-black/30 px-3 py-1 text-sm text-violet-200">전체 {game.totalPlayers}명 중 <b className="text-white">{game.submittedCount}명 제출</b></span>{admin && <span className={`rounded-full px-4 py-2 font-mono font-black ${remaining <= 10 ? 'bg-red-500/20 text-red-300 animate-pulse' : 'bg-amber-400/15 text-amber-200'}`}>마감까지 {remaining}초</span>}</div>
      {admin ? (
        <button data-testid="reveal-mini-game" disabled={game.submittedCount === 0} onClick={onReveal} className="mt-6 rounded-xl bg-violet-300 px-8 py-3 font-black text-violet-950 disabled:opacity-40">제출 마감 · 결과 공개</button>
      ) : (
        <div className="mx-auto mt-2 flex max-w-sm flex-col items-center gap-1.5">
          <input aria-label="미니게임 숫자" placeholder="숫자 입력" type="number" inputMode="numeric" min={isLowestUnique ? 1 : 0} max={isLowestUnique ? 50 : 100} step={1} value={value} onChange={(event) => setValue(event.target.value)} className="w-36 rounded-xl border border-violet-300/40 bg-black/35 px-3 py-1.5 text-center text-3xl font-black text-white outline-none placeholder:text-sm placeholder:font-medium placeholder:text-zinc-500 focus:border-violet-200" />
          <button data-testid="submit-mini-game" disabled={value === ''} onClick={async () => { if (value === '') return; const error = await onSubmit?.(Number(value)); setMessage(error ?? '제출되었습니다. 마감 전까지 변경할 수 있습니다.'); }} className="rounded-xl bg-violet-300 px-8 py-3 font-black text-violet-950 disabled:opacity-40">{game.hasSubmitted ? '숫자 변경하기' : '숫자 제출하기'}</button>
          {message && <p className={`text-sm ${message.startsWith('제출') ? 'text-emerald-300' : 'text-red-300'}`}>{message}</p>}
          {game.hasSubmitted && <p className="text-sm text-zinc-400">현재 제출 숫자: <b className="text-white">{game.myNumber}</b></p>}
        </div>
      )}
    </section>
  );
}

export function MiniGameRules() {
  return (
    <section className="w-full rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4 text-left">
      <p className="text-xs font-bold tracking-[0.2em] text-violet-300">MINI GAME RULES</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div><h3 className="font-bold text-white">2/3 맞추기</h3><p className="mt-1 text-sm leading-6 text-zinc-300">0~100 중 숫자 하나를 제출합니다. 모든 참가자가 낸 숫자의 평균에 2/3를 곱한 값과 가장 가까운 사람이 우승합니다. 동점이면 먼저 제출한 사람이 앞섭니다.</p></div>
        <div><h3 className="font-bold text-white">눈치 게임</h3><p className="mt-1 text-sm leading-6 text-zinc-300">1~50 중 숫자 하나를 제출합니다. 다른 사람과 겹치지 않은 숫자 가운데 가장 낮은 숫자를 낸 사람이 우승합니다.</p></div>
        <div><h3 className="font-bold text-white">단체 가위바위보</h3><p className="mt-1 text-sm leading-6 text-zinc-300">모두 가위·바위·보를 선택하면 컴퓨터의 손이 공개됩니다. 컴퓨터를 이긴 사람만 다음 라운드로 진출하며, 마지막 한 사람이 우승합니다.</p></div>
      </div>
    </section>
  );
}
