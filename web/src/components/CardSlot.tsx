'use client';

import { useEffect, useRef } from 'react';
import { drawCardBack, drawCardFront } from './cardFace';
import type { CardView } from '@/lib/types';

// Static (non-interactive) card display for table-layout slots — anything
// that isn't the one card currently being squeezed. Face down until
// `card.revealed`; no drag surface here, that's SqueezeCanvas's job.
export default function CardSlot({ card, dim, scale = 1 }: { card: CardView; dim?: boolean; scale?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rotated = card.orientation === 'horizontal';
  const cardWidth = 44 * scale;
  const cardHeight = 64 * scale;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // A card being flipped reaches rotateY(90deg), where its bounding box can
    // measure nearly zero. Always paint at the card's logical dimensions so
    // the front texture remains intact when the flip finishes.
    const w = cardWidth, h = cardHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ctx = context;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    function paint() {
      ctx.clearRect(0, 0, w, h);
      if (card.revealed && card.rank && card.suit) drawCardFront(ctx, w, h, card.rank, card.suit, paint);
      else drawCardBack(ctx, w, h, paint);
    }
    paint();
  }, [card.revealed, card.rank, card.suit, cardWidth, cardHeight]);
  const autoFlip = !card.needsSqueeze && !card.revealed && (card.pct ?? 0) > 0;
  const flipAngle = autoFlip ? Math.min(90, ((card.pct ?? 0) / 0.94) * 90) : 0;
  return (
    <div
      className="relative rounded-md overflow-visible card-deal-in"
      style={{ width: rotated ? cardHeight : cardWidth, height: rotated ? cardWidth : cardHeight, opacity: dim ? 0.4 : 1, transition: 'opacity 0.2s' }}
    >
      <div
        className="absolute rounded-md overflow-hidden shadow-md"
        style={{
          width: cardWidth,
          height: cardHeight,
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) ${rotated ? 'rotate(90deg)' : ''} rotateY(${flipAngle}deg)`,
          transformStyle: 'preserve-3d',
          transition: 'transform 140ms linear'
        }}
      >
        <canvas ref={ref} style={{ width: cardWidth, height: cardHeight, display: 'block' }} />
      </div>
    </div>
  );
}

export function EmptyCardSlot({ orientation = 'vertical', scale = 1 }: { orientation?: CardView['orientation']; scale?: number }) {
  const rotated = orientation === 'horizontal';
  return (
    <div
      aria-hidden="true"
      className="rounded-md border border-dashed border-emerald-100/20 bg-black/10 shadow-inner"
      style={{ width: (rotated ? 64 : 44) * scale, height: (rotated ? 44 : 64) * scale }}
    />
  );
}
