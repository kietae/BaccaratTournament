'use client';

import { useState } from 'react';
import { BET_TYPES } from '@/lib/betTypes';
import { CHIP_DENOMS, formatKRW } from '@/lib/chips';
import ChipStack from './ChipStack';
import type { BetType, MeView } from '@/lib/types';

export default function BettingBoard({
  me,
  locked,
  onPlaceBet,
  onClearBet,
  onConfirm
}: {
  me: MeView;
  locked: boolean;
  onPlaceBet: (type: BetType, amount: number) => void;
  onClearBet: (type: BetType) => void;
  onConfirm: () => void;
}) {
  const [chipValue, setChipValue] = useState(CHIP_DENOMS[2].value);
  const betsByType = new Map(me.bets.map((b) => [b.type, b.amount]));
  const remaining = me.chips - me.betTotal;

  function addChip(type: BetType) {
    if (locked) return;
    const current = betsByType.get(type) || 0;
    if (chipValue > remaining) return;
    onPlaceBet(type, current + chipValue);
  }

  function clearBet(type: BetType) {
    if (locked) return;
    onClearBet(type);
  }

  function clearAll() {
    if (locked) return;
    for (const b of me.bets) onClearBet(b.type);
  }

  const mainTypes = BET_TYPES.filter((b) => b.group === 'main');
  const sideTypes = BET_TYPES.filter((b) => b.group === 'side');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-zinc-300">
        <span>보유 칩 {formatKRW(remaining)}</span>
        <span>베팅 합계 {formatKRW(me.betTotal)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {mainTypes.map((bt) => {
          const amt = betsByType.get(bt.type) || 0;
          return (
            <div key={bt.type} className="relative">
              <button
                type="button"
                data-testid={`bet-${bt.type}`}
                disabled={locked}
                onClick={() => addChip(bt.type)}
                className="w-full flex flex-col items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-zinc-900/60 py-3 px-1 active:scale-95 transition disabled:opacity-50"
              >
                <span className="text-sm font-semibold text-amber-200">{bt.label}</span>
                <span className="text-[10px] text-zinc-500">{bt.odds}:1</span>
                <div className="h-6 flex items-center">{amt > 0 && <ChipStack amount={amt} compact />}</div>
              </button>
              {amt > 0 && !locked && (
                <button
                  type="button"
                  aria-label={`${bt.label} 베팅 취소`}
                  data-testid={`clear-${bt.type}`}
                  onClick={() => clearBet(bt.type)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[11px] leading-none flex items-center justify-center shadow"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {sideTypes.map((bt) => {
          const amt = betsByType.get(bt.type) || 0;
          return (
            <div key={bt.type} className="relative">
              <button
                type="button"
                data-testid={`bet-${bt.type}`}
                disabled={locked}
                onClick={() => addChip(bt.type)}
                className="w-full flex items-center justify-between gap-1 rounded-lg border border-zinc-700 bg-zinc-900/40 py-2 px-2.5 active:scale-95 transition disabled:opacity-50"
              >
                <span className="text-left">
                  <span className="block text-xs text-zinc-200">{bt.label}</span>
                  <span className="block text-[10px] text-zinc-500">{bt.odds}:1</span>
                </span>
                {amt > 0 && <ChipStack amount={amt} compact />}
              </button>
              {amt > 0 && !locked && (
                <button
                  type="button"
                  aria-label={`${bt.label} 베팅 취소`}
                  data-testid={`clear-${bt.type}`}
                  onClick={() => clearBet(bt.type)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[11px] leading-none flex items-center justify-center shadow"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 py-1">
        {CHIP_DENOMS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => setChipValue(d.value)}
            className="rounded-full flex items-center justify-center font-bold border-2 transition"
            style={{
              width: 38,
              height: 38,
              background: d.color,
              color: d.textColor,
              borderColor: chipValue === d.value ? '#fff' : 'transparent',
              fontSize: 11,
              transform: chipValue === d.value ? 'translateY(-4px)' : undefined
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="clear-all-bets"
          disabled={locked || me.confirmed || me.betTotal <= 0}
          onClick={clearAll}
          className="rounded-lg border border-zinc-700 text-zinc-300 font-medium px-4 disabled:opacity-40 active:scale-[0.98] transition"
        >
          전체 취소
        </button>
        <button
          type="button"
          data-testid="confirm-bets"
          disabled={locked || me.confirmed || me.betTotal <= 0}
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-amber-500 text-zinc-950 font-bold py-3 disabled:opacity-40 disabled:bg-zinc-700 disabled:text-zinc-400 active:scale-[0.98] transition"
        >
          {me.confirmed ? '확정됨 · 대기 중' : '베팅 확정'}
        </button>
      </div>
      <p className="text-center text-[11px] text-zinc-500">칩을 눌러 베팅 · 빨간 × 로 개별 취소 · 전체 취소로 한 번에</p>
    </div>
  );
}
