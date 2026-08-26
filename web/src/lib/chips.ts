export interface ChipDenom {
  value: number;
  label: string;
  color: string;
  textColor: string;
}

// Confirmed 6-denomination set (docs/dev-plan.html §11).
export const CHIP_DENOMS: ChipDenom[] = [
  { value: 1_000, label: '1K', color: '#C7CDC8', textColor: '#16211C' },
  { value: 5_000, label: '5K', color: '#B23B3B', textColor: '#fff' },
  { value: 10_000, label: '10K', color: '#2A5C99', textColor: '#fff' },
  { value: 100_000, label: '100K', color: '#20211F', textColor: '#fff' },
  { value: 1_000_000, label: '1M', color: '#C1651F', textColor: '#fff' },
  { value: 10_000_000, label: '10M', color: '#B8923D', textColor: '#16211C' }
];

// Greedy breakdown into the fewest chips — largest denomination first.
// Correct here because every denomination evenly divides the next one up.
export function breakdownChips(amount: number): { denom: ChipDenom; count: number }[] {
  let remaining = Math.max(0, Math.floor(amount));
  const out: { denom: ChipDenom; count: number }[] = [];
  for (let i = CHIP_DENOMS.length - 1; i >= 0; i--) {
    const denom = CHIP_DENOMS[i];
    const count = Math.floor(remaining / denom.value);
    if (count > 0) {
      out.push({ denom, count });
      remaining -= count * denom.value;
    }
  }
  return out;
}

export function formatKRW(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}
