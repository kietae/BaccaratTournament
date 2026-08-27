'use client';

import type { RoundResultView } from '@/lib/types';

export default function RoundResultCallout({ result, large = false }: { result: RoundResultView; large?: boolean }) {
  const winner = result.outcome === 'tie' ? '타이' : result.outcome === 'player' ? '플레이어 승' : '뱅커 승';
  const tone = result.outcome === 'player' ? 'result-player' : result.outcome === 'banker' ? 'result-banker' : 'result-tie';
  return (
    <div data-testid="round-result-callout" className={`result-callout ${tone} ${large ? 'result-callout-large' : ''}`}>
      <div className="result-burst" aria-hidden="true" />
      <div className="result-sweep" aria-hidden="true" />
      <p className="relative text-[10px] sm:text-xs font-bold tracking-[0.28em] text-white/65 uppercase">Round Result</p>
      <div className={`relative font-black text-white drop-shadow-lg ${large ? 'text-5xl lg:text-7xl' : 'text-3xl'}`}>{winner}</div>
      <div className={`relative mt-2 font-mono font-black text-white/90 ${large ? 'text-2xl' : 'text-lg'}`}>
        PLAYER {result.playerTotal}<span className="mx-3 text-white/35">:</span>{result.bankerTotal} BANKER
      </div>
      {(result.playerNatural || result.bankerNatural) && <div className="relative mt-2 text-xs font-bold tracking-[0.18em] text-amber-200">NATURAL</div>}
    </div>
  );
}
