'use client';

import type { CardView, TableState } from '@/lib/types';
import CardSlot from './CardSlot';

const DEAL_STEP_MS = 180;

export default function OpeningRoadGame({ state, large = false }: { state: TableState; large?: boolean }) {
  const preview = state.seedPreview;
  if (!preview) {
    return <div data-testid="seed-preview" className="text-center"><p className="text-xs font-bold tracking-[0.28em] text-amber-300">OPENING ROAD</p><p className="mt-4 text-3xl font-black text-emerald-100 animate-pulse">READY</p></div>;
  }

  const label = preview.outcome === 'player' ? 'PLAYER WIN' : preview.outcome === 'banker' ? 'BANKER WIN' : 'TIE';
  const color = preview.outcome === 'player' ? 'text-blue-300' : preview.outcome === 'banker' ? 'text-red-300' : 'text-emerald-300';
  const resultDelay = preview.cards.length * DEAL_STEP_MS + 120;
  const cards: CardView[] = preview.cards.map((card, index) => ({
    ...card,
    orientation: index >= 4 ? 'horizontal' : 'vertical',
    dealt: true,
    revealed: true,
    edge: null,
    pct: 1,
    grip: 0.5,
    needsSqueeze: false
  }));

  return (
    <div data-testid="seed-preview" className="w-full text-center">
      <p className="text-xs font-bold tracking-[0.28em] text-amber-300">OPENING ROAD</p>
      <p className={`${large ? 'mt-2 text-xl' : 'mt-1 text-sm'} text-white`}>자동 게임 {preview.index} / {state.initialRoadGames}</p>
      <div key={preview.index} className={`mx-auto mt-3 grid grid-cols-2 ${large ? 'max-w-2xl gap-8' : 'max-w-sm gap-4'}`}>
        {(['player', 'banker'] as const).map((side) => (
          <section key={side}>
            <p className={`mb-2 text-xs font-black tracking-[0.2em] ${side === 'player' ? 'text-blue-200' : 'text-red-200'}`}>{side.toUpperCase()}</p>
            <div className="flex min-h-20 items-center justify-center gap-2">
              {cards.filter((card) => card.side === side).map((card) => {
                const dealIndex = cards.findIndex((item) => item.cardId === card.cardId);
                return <div key={card.cardId} className="seed-card-deal" style={{ animationDelay: `${dealIndex * DEAL_STEP_MS}ms` }}><CardSlot card={card} scale={large ? 1.55 : 1.05} /></div>;
              })}
            </div>
          </section>
        ))}
      </div>
      <div key={`result-${preview.index}`} className="seed-result-call" style={{ animationDelay: `${resultDelay}ms` }}>
        <div className={`${large ? 'mt-3 text-5xl' : 'mt-2 text-3xl'} font-black ${color}`}>{label}</div>
        <p className={`${large ? 'text-lg' : 'text-sm'} font-mono text-white/80`}>PLAYER {preview.playerTotal} : {preview.bankerTotal} BANKER</p>
      </div>
    </div>
  );
}
