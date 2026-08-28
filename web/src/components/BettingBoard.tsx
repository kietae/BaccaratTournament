'use client';

import { useState } from 'react';
import { BET_TYPES } from '@/lib/betTypes';
import { CHIP_DENOMS, formatKRW } from '@/lib/chips';
import ChipStack from './ChipStack';
import type { BetType, MeView, TableState } from '@/lib/types';

const PLAYER_OPTIONS: BetType[] = ['playerPair', 'player7TwoCard', 'player7ThreeCard', 'comboP7B6'];
const BANKER_OPTIONS: BetType[] = ['bankerPair', 'banker6TwoCard', 'banker6ThreeCard'];

export default function BettingBoard({ me, locked, betLimits, onPlaceBet, onClearBet, onConfirm }: {
  me: MeView;
  locked: boolean;
  betLimits: TableState['betLimits'];
  onPlaceBet: (type: BetType, amount: number) => void;
  onClearBet: (type: BetType) => void;
  onConfirm: () => void;
}) {
  const [chipValue, setChipValue] = useState(CHIP_DENOMS[2].value);
  const betsByType = new Map(me.bets.map((bet) => [bet.type, bet.amount]));
  const remaining = me.chips - me.betTotal;

  function addChip(type: BetType) {
    if (locked || remaining <= 0) return;
    const current = betsByType.get(type) || 0;
    const isMain = type === 'player' || type === 'banker';
    const min = isMain ? betLimits.mainMin : betLimits.sideMin;
    const max = isMain ? betLimits.mainMax : betLimits.sideMax;
    const addition = Math.min(chipValue, remaining, Math.max(0, max - current));
    if (addition <= 0) return;
    const next = current + addition;
    // A balance smaller than the zone minimum may still go all-in.
    if (current === 0 && next < min && addition < remaining) return;
    onPlaceBet(type, next);
  }

  function clearBet(type: BetType) {
    if (!locked) onClearBet(type);
  }

  function betButton(type: BetType, main = false) {
    const definition = BET_TYPES.find((bet) => bet.type === type)!;
    const amount = betsByType.get(type) || 0;
    return (
      <div key={type} className="relative min-w-0">
        <button type="button" data-testid={`bet-${type}`} disabled={locked} onClick={() => addChip(type)} className={`${main ? 'bet-main-button' : 'bet-option-button'} bet-type-${type} w-full active:scale-[0.97] transition disabled:opacity-45`}>
          <span className={main ? 'bet-main-label' : 'bet-option-label'}>{definition.label}</span>
          <span className="bet-odds">{definition.odds}:1</span>
          <span className="bet-chip-space">{amount > 0 && <ChipStack amount={amount} compact />}</span>
        </button>
        {amount > 0 && !locked && <button type="button" aria-label={`${definition.label} 베팅 취소`} data-testid={`clear-${type}`} onClick={() => clearBet(type)} className="bet-clear">×</button>}
      </div>
    );
  }

  function clearAll() {
    if (!locked) for (const bet of me.bets) onClearBet(bet.type);
  }

  return (
    <div className="betting-board flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1 text-sm text-zinc-300"><span>보유 칩 {formatKRW(remaining)}</span><span>베팅 합계 {formatKRW(me.betTotal)}</span></div>
      <div className="betting-zones grid grid-cols-[1fr_0.72fr_1fr] gap-1.5">
        <section className="bet-zone bet-zone-player">{betButton('player', true)}<div className="bet-options-grid">{PLAYER_OPTIONS.map((type) => betButton(type))}</div></section>
        <section className="bet-zone bet-zone-center">{betButton('tie', true)}</section>
        <section className="bet-zone bet-zone-banker">{betButton('banker', true)}<div className="bet-options-grid">{BANKER_OPTIONS.map((type) => betButton(type))}</div></section>
      </div>
      <p className="text-[10px] text-center text-amber-100/60">메인 {formatKRW(betLimits.mainMin)}~{formatKRW(betLimits.mainMax)} · 옵션 {formatKRW(betLimits.sideMin)}~{formatKRW(betLimits.sideMax)}</p>
      <div className="bet-controls flex items-center gap-2">
        <div className="chip-rail flex flex-1 items-center justify-center gap-2">{CHIP_DENOMS.map((denom) => <button key={denom.value} type="button" onClick={() => setChipValue(denom.value)} className="bet-chip rounded-full flex items-center justify-center font-bold border-2 transition" style={{ background: denom.color, color: denom.textColor, borderColor: chipValue === denom.value ? '#fff' : 'transparent', transform: chipValue === denom.value ? 'translateY(-3px)' : undefined }}>{denom.label}</button>)}</div>
        <div className="bet-actions flex gap-2"><button type="button" data-testid="clear-all-bets" disabled={locked || me.confirmed || me.betTotal <= 0} onClick={clearAll} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 disabled:opacity-40">전체 취소</button><button type="button" data-testid="confirm-bets" disabled={locked || me.confirmed || me.betTotal <= 0} onClick={onConfirm} className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:bg-zinc-700 disabled:text-zinc-400">{me.confirmed ? '확정됨' : '베팅 확정'}</button></div>
      </div>
    </div>
  );
}
