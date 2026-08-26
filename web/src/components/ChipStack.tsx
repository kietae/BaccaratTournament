'use client';

import { breakdownChips, formatKRW } from '@/lib/chips';

export default function ChipStack({ amount, compact }: { amount: number; compact?: boolean }) {
  if (amount <= 0) return null;
  const parts = breakdownChips(amount);
  const size = compact ? 22 : 30;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center -space-x-1">
        {parts.map(({ denom, count }) => (
          <div key={denom.value} className="relative" title={`${denom.label} x ${count}`}>
            <div
              className="rounded-full flex items-center justify-center font-bold border-2 border-white/20 shadow"
              style={{ width: size, height: size, background: denom.color, color: denom.textColor, fontSize: size * 0.34 }}
            >
              {denom.label}
            </div>
            {count > 1 && (
              <span className="absolute -bottom-1 -right-1 bg-black/80 text-white rounded-full text-[9px] leading-none px-1 py-0.5">
                {count}
              </span>
            )}
          </div>
        ))}
      </div>
      {!compact && <span className="text-xs text-zinc-400">{formatKRW(amount)}</span>}
    </div>
  );
}
