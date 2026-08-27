'use client';

import CardSlot from './CardSlot';
import type { CardView, RoundResultView } from '@/lib/types';

export default function ResultHands({
  cards,
  result,
  scale = 1.25
}: {
  cards: CardView[];
  result: RoundResultView;
  scale?: number;
}) {
  return (
    <div data-testid="result-hands" className="flex flex-col sm:flex-row items-center sm:items-start justify-center gap-3 sm:gap-5 lg:gap-10">
      <ResultHand
        label="PLAYER"
        cards={cards.filter((card) => card.side === 'player')}
        total={result.playerTotal}
        winner={result.outcome === 'player'}
        scale={scale}
      />
      <ResultHand
        label="BANKER"
        cards={cards.filter((card) => card.side === 'banker')}
        total={result.bankerTotal}
        winner={result.outcome === 'banker'}
        scale={scale}
      />
    </div>
  );
}

function ResultHand({
  label,
  cards,
  total,
  winner,
  scale
}: {
  label: string;
  cards: CardView[];
  total: number;
  winner: boolean;
  scale: number;
}) {
  return (
    <div className={`rounded-2xl border px-3 py-3 transition ${winner ? 'border-amber-300/70 bg-amber-300/10 shadow-[0_0_32px_rgba(251,191,36,0.16)]' : 'border-white/10 bg-black/15'}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={`text-xs font-black tracking-[0.16em] ${winner ? 'text-amber-200' : 'text-zinc-400'}`}>{label}</span>
        <span className={`rounded-full px-2 py-0.5 font-mono text-sm font-black ${winner ? 'bg-amber-300 text-zinc-950' : 'bg-zinc-800 text-zinc-200'}`}>{total}</span>
      </div>
      <div className="flex min-h-16 items-center gap-1.5">
        {cards.map((card) => <CardSlot key={`result-${card.cardId}`} card={card} scale={scale} />)}
      </div>
    </div>
  );
}
