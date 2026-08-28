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
  const [value, setValue] = useState(game.myNumber ?? (isLowestUnique ? 25 : 50));
  const [message, setMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil(((game.endsAt ?? Date.now()) - Date.now()) / 1000)));

  useEffect(() => {
    if (game.status !== 'collecting' || !game.endsAt) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((game.endsAt! - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [game.status, game.endsAt]);

  if (game.status === 'revealed') {
    return (
      <section className="w-full rounded-3xl border border-violet-400/30 bg-[radial-gradient(circle_at_top,#39205e,#100b1b_68%)] p-5 lg:p-8 text-center">
        <p className="text-xs font-bold tracking-[0.28em] text-violet-300">MINI GAME</p>
        <h2 className="mt-2 text-3xl lg:text-5xl font-black text-white">{isLowestUnique ? 'Lowest Unique Number' : 'Beauty Contest'}</h2>
        <p className="mt-1 text-sm font-bold text-violet-200">{isLowestUnique ? '가장 낮은 유일한 숫자 결과' : '평균의 2/3 결과'}</p>
        {!isLowestUnique && <div className="mt-5 flex justify-center gap-3 text-sm"><span className="rounded-full bg-black/30 px-4 py-2 text-zinc-300">평균 <b className="text-white">{game.average?.toFixed(2)}</b></span><span className="rounded-full bg-amber-400/15 px-4 py-2 text-amber-200">목표값 <b>{game.target?.toFixed(2)}</b></span></div>}
        {game.results.length === 0 && <p className="mt-6 text-zinc-300">제출한 참가자가 없습니다.</p>}
        <div className="mx-auto mt-6 max-h-[45vh] max-w-2xl space-y-2 overflow-y-auto pr-1">
          {game.results.map((result) => <div key={result.playerId} className={`grid grid-cols-[3rem_1fr_auto_auto] items-center gap-3 rounded-xl border px-4 py-3 text-left ${result.playerId === state.me?.id ? 'border-amber-300 bg-amber-300/15' : result.rank === 1 ? 'border-violet-300/50 bg-violet-300/10' : 'border-white/10 bg-black/20'}`}><span className="text-xl font-black text-amber-300">{result.rank > 0 ? `${result.rank}위` : '중복'}</span><span className="truncate font-bold text-white">{result.nickname}</span><span className="font-mono text-lg text-violet-200">{result.value}</span><span className="text-xs text-zinc-400">{isLowestUnique ? (result.unique ? '유일함' : `${result.count}명 중복`) : `차이 ${result.distance.toFixed(2)}`}</span></div>)}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full rounded-3xl border border-violet-400/30 bg-[radial-gradient(circle_at_top,#39205e,#100b1b_68%)] p-5 lg:p-8 text-center">
      <p className="text-xs font-bold tracking-[0.28em] text-violet-300">MINI GAME</p>
      <h2 className="mt-2 text-3xl lg:text-5xl font-black text-white">{isLowestUnique ? 'Lowest Unique Number' : 'Beauty Contest'}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-300">{isLowestUnique ? '1~50 사이 숫자 하나를 적어라. 아무도 겹치지 않은 숫자 중 가장 낮은 숫자를 낸 사람이 우승.' : '0~100 사이 숫자 하나를 적어라. 전체 평균의 2/3에 가장 가까운 사람이 우승.'}</p>
      {!isLowestUnique && <p className="mx-auto mt-2 max-w-xl text-xs text-zinc-400">동점이면 최종 숫자를 먼저 제출한 사람이 우선합니다. 10명 이상 참여하면 더 재미있습니다.</p>}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3"><span className="rounded-full bg-black/30 px-4 py-2 text-violet-200">전체 {game.totalPlayers}명 중 <b className="text-white">{game.submittedCount}명 제출</b></span>{admin && <span className={`rounded-full px-4 py-2 font-mono font-black ${remaining <= 10 ? 'bg-red-500/20 text-red-300 animate-pulse' : 'bg-amber-400/15 text-amber-200'}`}>마감까지 {remaining}초</span>}</div>
      {admin ? (
        <button data-testid="reveal-mini-game" disabled={game.submittedCount === 0} onClick={onReveal} className="mt-6 rounded-xl bg-violet-300 px-8 py-3 font-black text-violet-950 disabled:opacity-40">제출 마감 · 결과 공개</button>
      ) : (
        <div className="mx-auto mt-6 flex max-w-sm flex-col items-center gap-3">
          <input aria-label="미니게임 숫자" type="number" inputMode="numeric" min={isLowestUnique ? 1 : 0} max={isLowestUnique ? 50 : 100} step={1} value={value} onChange={(event) => setValue(Number(event.target.value))} className="w-40 rounded-2xl border border-violet-300/40 bg-black/35 px-4 py-3 text-center text-4xl font-black text-white outline-none focus:border-violet-200" />
          <button data-testid="submit-mini-game" onClick={async () => { const error = await onSubmit?.(value); setMessage(error ?? '제출되었습니다. 마감 전까지 변경할 수 있습니다.'); }} className="rounded-xl bg-violet-300 px-8 py-3 font-black text-violet-950">{game.hasSubmitted ? '숫자 변경하기' : '숫자 제출하기'}</button>
          {message && <p className={`text-sm ${message.startsWith('제출') ? 'text-emerald-300' : 'text-red-300'}`}>{message}</p>}
          {game.hasSubmitted && <p className="text-sm text-zinc-400">현재 제출 숫자: <b className="text-white">{game.myNumber}</b></p>}
        </div>
      )}
    </section>
  );
}
