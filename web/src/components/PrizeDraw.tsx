'use client';

import { useState } from 'react';
import { ack } from '@/lib/socket';
import type { TableState } from '@/lib/types';

export default function PrizeDraw({ state, adminToken }: { state: TableState; adminToken?: string }) {
  const [prizeName, setPrizeName] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const numbers = state.raffle.remainingNumbers;
  const slice = numbers.length ? 360 / numbers.length : 360;
  const colors = ['#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#16a34a', '#ea580c'];
  const wheel = numbers.length
    ? `conic-gradient(${numbers.map((_, index) => `${colors[index % colors.length]} ${index * slice}deg ${(index + 1) * slice}deg`).join(',')})`
    : '#27272a';

  async function addPrize() {
    const result = await ack<{ ok: boolean; error?: string }>('admin:addPrize', { adminToken, name: prizeName });
    if (result.ok) { setPrizeName(''); setMessage(null); } else setMessage(result.error || '경품을 등록하지 못했습니다');
  }

  async function stopWheel() {
    if (!spinning || stopping) return;
    setStopping(true);
    window.setTimeout(async () => {
      const result = await ack<{ ok: boolean; error?: string }>('admin:drawRaffle', { adminToken });
      setSpinning(false); setStopping(false);
      if (!result.ok) setMessage(result.error || '추첨하지 못했습니다');
    }, 2400);
  }

  if (!adminToken) return (
    <section id="prize-draw" className="w-full scroll-mt-4 rounded-3xl border border-amber-400/25 bg-[radial-gradient(circle_at_top,#4b2a0b,#100b08_70%)] p-6 text-center">
      <p className="text-xs font-bold tracking-[.3em] text-amber-300">LUCKY DRAW</p>
      <h2 className="mt-2 text-3xl font-black text-white">경품 추첨 참가</h2>
      {state.raffle.myNumber == null
        ? <button onClick={async () => { const result = await ack<{ ok: boolean; error?: string; number?: number }>('raffle:enter', {}); setMessage(result.ok ? `내 추첨 번호는 ${result.number}번입니다` : result.error || '참가하지 못했습니다'); }} className="mt-5 rounded-xl bg-amber-400 px-8 py-4 font-black text-zinc-950">추첨 신청하기</button>
        : <div className="mx-auto mt-5 flex h-28 w-28 items-center justify-center rounded-full border-4 border-amber-300 bg-black/40 text-5xl font-black text-amber-200">{state.raffle.myNumber}</div>}
      {message && <p className="mt-3 text-sm text-amber-100">{message}</p>}
      {state.raffle.winners.length > 0 && <div className="mt-5 space-y-2">{state.raffle.winners.map((winner) => <div key={winner.prizeId} className="rounded-xl bg-black/30 p-3 text-sm"><b className="text-amber-300">{winner.prizeName}</b> · {winner.number}번 {winner.nickname}</div>)}</div>}
    </section>
  );

  const nextPrize = state.raffle.prizes[state.raffle.winners.length];
  return (
    <section id="prize-draw" className="scroll-mt-4 rounded-3xl border border-amber-400/25 bg-black/30 p-6 text-center">
      <p className="text-xs font-bold tracking-[.3em] text-amber-300">LUCKY DRAW</p><h2 className="mt-2 text-4xl font-black text-white">빅휠 경품 추첨</h2>
      {state.raffle.status === 'finished' && <button onClick={async () => { const result = await ack<{ ok: boolean; error?: string }>('admin:resetRaffle', { adminToken }); setMessage(result.ok ? '새 경품 추첨 참가 접수를 시작했습니다.' : result.error || '새 추첨을 준비하지 못했습니다'); }} className="mt-4 rounded-xl bg-emerald-300 px-6 py-3 font-black text-emerald-950">새 경품 추첨 준비</button>}
      <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:items-center">
        <div className="relative mx-auto h-72 w-72"><div className={`raffle-wheel h-full w-full rounded-full border-8 border-amber-200 shadow-[0_0_45px_rgba(251,191,36,.25)] ${spinning ? (stopping ? 'raffle-wheel-stopping' : 'raffle-wheel-spinning') : ''}`} style={{ background: wheel }}>{numbers.map((number, index) => <span key={number} className="absolute left-1/2 top-1/2 font-black text-white drop-shadow" style={{ transform: `rotate(${index * slice + slice / 2}deg) translateY(-118px) rotate(-${index * slice + slice / 2}deg)` }}>{number}</span>)}</div><div className="absolute -top-3 left-1/2 -translate-x-1/2 text-3xl text-white">▼</div></div>
        <div className="space-y-4"><div className="flex gap-2"><input value={prizeName} onChange={(event) => setPrizeName(event.target.value)} placeholder="경품명 입력" className="admin-input flex-1" /><button disabled={!prizeName.trim()} onClick={addPrize} className="rounded-xl bg-amber-400 px-4 font-bold text-zinc-950 disabled:opacity-40">등록</button></div><div className="rounded-xl bg-white/5 p-4 text-left"><b className="text-amber-200">다음 경품</b><p className="mt-1 text-2xl font-black text-white">{nextPrize?.name || '경품을 등록해 주세요'}</p><p className="mt-2 text-sm text-zinc-400">신청 {state.raffle.entries.length}명 · 남은 번호 {numbers.length}개</p></div>{!spinning ? <button disabled={!nextPrize || numbers.length === 0} onClick={() => setSpinning(true)} className="w-full rounded-xl bg-emerald-400 py-4 text-lg font-black text-emerald-950 disabled:opacity-40">휠 돌리기</button> : <button disabled={stopping} onClick={stopWheel} className="w-full rounded-xl bg-red-500 py-4 text-lg font-black text-white disabled:opacity-60">{stopping ? '천천히 멈추는 중…' : '멈춤'}</button>}{message && <p className="text-sm text-red-300">{message}</p>}</div>
      </div>
      {state.raffle.winners.length > 0 && <div className="mt-6 grid gap-2 sm:grid-cols-2">{state.raffle.winners.map((winner) => <div key={winner.prizeId} className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3"><b className="text-amber-300">{winner.prizeName}</b><p className="font-bold text-white">{winner.number}번 · {winner.nickname} ({winner.employeeId})</p></div>)}</div>}
    </section>
  );
}
