'use client';

import { useEffect, useRef } from 'react';
import { drawCardBack, drawCardFront } from './cardFace';
import type { CardView } from '@/lib/types';

// Static (non-interactive) card display for table-layout slots — anything
// that isn't the one card currently being squeezed. Face down until
// `card.revealed`; no drag surface here, that's SqueezeCanvas's job.
export default function CardSlot({ card, dim }: { card: CardView; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (card.revealed && card.rank && card.suit) drawCardFront(ctx, w, h, card.rank, card.suit);
    else drawCardBack(ctx, w, h);
  }, [card.revealed, card.rank, card.suit]);

  const rotated = card.orientation === 'horizontal';
  return (
    <div
      className="relative rounded-md overflow-visible"
      style={{ width: rotated ? 64 : 44, height: rotated ? 44 : 64, opacity: dim ? 0.4 : 1, transition: 'opacity 0.2s' }}
    >
      <div
        className="absolute rounded-md overflow-hidden shadow-md"
        style={{
          width: 44,
          height: 64,
          top: '50%',
          left: '50%',
          transform: rotated ? 'translate(-50%, -50%) rotate(90deg)' : 'translate(-50%, -50%)'
        }}
      >
        <canvas ref={ref} style={{ width: 44, height: 64, display: 'block' }} />
      </div>
    </div>
  );
}
