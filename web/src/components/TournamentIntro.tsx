'use client';

import { useEffect, useState } from 'react';
import SqueezeCanvas from './SqueezeCanvas';

export default function TournamentIntro({ step, onNext, onFinish }: {
  step: 1 | 2;
  onNext: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="tournament-intro fixed inset-0 z-40 flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm">
      <section className="w-full max-w-3xl overflow-hidden rounded-3xl border border-amber-300/35 bg-[radial-gradient(circle_at_top,#243f35,#0d1512_72%)] p-4 text-white shadow-2xl sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <div><p className="text-[10px] font-bold tracking-[.28em] text-amber-300">HOW TO PLAY</p><h2 className="text-xl font-black sm:text-2xl">바카라 토너먼트 안내</h2></div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-300">{step} / 2</span>
        </div>

        {step === 1 ? <BettingGuide /> : <SqueezeGuide />}

        <div className="mt-4 flex justify-end">
          {step === 1
            ? <button type="button" onClick={onNext} className="rounded-xl bg-amber-300 px-6 py-3 text-sm font-black text-zinc-950">다음 · 스퀴즈 방법</button>
            : <button type="button" onClick={onFinish} className="rounded-xl bg-amber-300 px-8 py-3 text-sm font-black text-zinc-950">확인하고 게임 시작</button>}
        </div>
      </section>
    </div>
  );
}

function BettingGuide() {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[1.05fr_.95fr]">
      <div className="grid grid-cols-[1fr_.65fr_1fr] gap-1.5 rounded-2xl bg-emerald-950/65 p-2">
        <GuideZone color="bg-blue-800" title="PLAYER" options="페어 · Dragon · Super 7" />
        <GuideZone color="bg-emerald-700" title="TIE" options="8 : 1" />
        <GuideZone color="bg-red-800" title="BANKER" options="페어 · Tiger" />
        <div className="col-span-3 flex items-center justify-between rounded-lg bg-black/35 px-3 py-2 text-[10px] text-zinc-300"><span>칩 선택</span><span className="flex gap-1"><i className="h-5 w-5 rounded-full bg-rose-500"/><i className="h-5 w-5 rounded-full bg-amber-400"/><i className="h-5 w-5 rounded-full bg-sky-400"/></span><b className="rounded bg-amber-300 px-2 py-1 text-zinc-950">베팅 확정</b></div>
      </div>
      <div className="space-y-2 text-sm text-zinc-200">
        <GuideLine number="1" text="사용할 칩을 고르고 원하는 베팅존을 누르세요." />
        <GuideLine number="2" text="잘못 놓은 칩은 개별 × 또는 전체 취소로 되돌릴 수 있습니다." />
        <GuideLine number="3" text="마지막에 반드시 ‘베팅 확정’을 눌러주세요." />
        <div className="rounded-xl border border-amber-300/35 bg-amber-300/10 p-3 font-bold text-amber-100">PLAYER 또는 BANKER에 가장 많이 베팅한 참가자가 그쪽 카드의 스퀴즈를 직접 합니다.</div>
        <p className="text-xs text-zinc-400">옵션 베팅은 스퀴즈 권한에 포함되지 않으며, 최고 베팅자가 없으면 딜러가 공개합니다.</p>
      </div>
    </div>
  );
}

function SqueezeGuide() {
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[.8fr_1.2fr]">
      <div className="mx-auto flex items-center gap-2">
        <DemoControl axis="vertical" active />
        <div className="h-[12rem] aspect-[11/16] overflow-hidden rounded-2xl border border-amber-300/45 bg-black shadow-xl sm:h-[14rem]">
          <AnimatedSqueeze />
        </div>
        <DemoControl axis="horizontal" />
      </div>
      <div className="space-y-3">
        <GuideLine number="1" text="카드가 아니라, 카드 양옆의 ↑↓ 또는 ←→ 조작 바를 누르세요." />
        <GuideLine number="2" text="세로 바는 위·아래로, 가로 바는 왼쪽·오른쪽으로 천천히 밀어주세요." />
        <GuideLine number="3" text="끝까지 당기면 카드가 공개됩니다. 중간에 놓으면 원래대로 돌아갑니다." />
        <div className="rounded-xl bg-blue-500/10 p-3 text-sm font-semibold text-blue-100">내가 최고 베팅자라면 화면에 스퀴즈 안내가 나타납니다. 안내가 보이면 직접 카드를 열어주세요.</div>
      </div>
    </div>
  );
}

function DemoControl({ axis, active = false }: { axis: 'vertical' | 'horizontal'; active?: boolean }) {
  return <div className={`${active ? 'animate-pulse border-amber-200 bg-amber-300/20' : 'border-amber-300/35 bg-black/45'} flex shrink-0 items-center justify-center rounded-full border text-sm font-black text-amber-200 ${axis === 'vertical' ? 'h-24 w-7 leading-4' : 'h-10 w-10'}`}>{axis === 'vertical' ? <span className="text-center">↑<br/>↓</span> : '←→'}</div>;
}

function AnimatedSqueeze() {
  const [progress, setProgress] = useState(0.02);
  useEffect(() => {
    let frame = 0;
    let started = performance.now();
    const animate = (now: number) => {
      const elapsed = (now - started) % 3600;
      const next = elapsed < 2600 ? 0.02 + (elapsed / 2600) * 0.88 : 0.9;
      setProgress(next);
      if (elapsed < 20 && now - started > 3600) started = now;
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <SqueezeCanvas mode="remote" revealed={false} rank="7" suit="♥" remoteEdge="bottom" remotePct={progress} remoteGrip={0.5} />;
}

function GuideZone({ color, title, options }: { color: string; title: string; options: string }) {
  return <div className={`${color} flex min-h-24 flex-col items-center justify-center rounded-xl p-2 text-center shadow-inner`}><b className="text-sm">{title}</b><span className="mt-2 text-[9px] text-white/70">{options}</span></div>;
}

function GuideLine({ number, text }: { number: string; text: string }) {
  return <div className="flex items-start gap-2"><b className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-300 text-xs text-zinc-950">{number}</b><p className="pt-0.5">{text}</p></div>;
}
