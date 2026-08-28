'use client';

import type { RoundResultView } from '@/lib/types';
import { BET_TYPES } from '@/lib/betTypes';

export default function RoundResultCallout({ result, large = false }: { result: RoundResultView; large?: boolean }) {
  const winner = result.outcome === 'tie' ? 'Tie!' : result.outcome === 'player' ? 'Player Wins!' : 'Banker Wins!';
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
      {(result.sideBetHits ?? []).length > 0 && <div data-testid="side-bet-results" className="relative mt-3 flex flex-wrap justify-center gap-1.5">{result.sideBetHits.map((type) => { const bet = BET_TYPES.find((item) => item.type === type); return <span key={type} className="rounded-full border border-amber-200/35 bg-black/25 px-2.5 py-1 text-xs font-black text-amber-100">{bet?.label ?? type} · {bet?.odds}:1</span>; })}</div>}
    </div>
  );
}
