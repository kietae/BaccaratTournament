import type { BetType } from './types';

// Kept in sync with engine/payouts.js and web/src/server/betTypes.js.
// Duplicated on purpose — this is display data (labels/ordering), not logic.
export const BET_TYPES: { type: BetType; label: string; odds: number | string; group: 'main' | 'side' }[] = [
  { type: 'player', label: '플레이어', odds: 1, group: 'main' },
  { type: 'banker', label: '뱅커', odds: 0.95, group: 'main' },
  { type: 'tie', label: '타이', odds: 8, group: 'side' },
  { type: 'playerPair', label: '플레이어 페어', odds: 11, group: 'side' },
  { type: 'bankerPair', label: '뱅커 페어', odds: 11, group: 'side' },
  { type: 'banker6TwoCard', label: 'Small Tiger', odds: 22, group: 'side' },
  { type: 'banker6ThreeCard', label: 'Big Tiger', odds: 50, group: 'side' },
  { type: 'player7TwoCard', label: 'Small Dragon', odds: 15, group: 'side' },
  { type: 'player7ThreeCard', label: 'Big Dragon', odds: 30, group: 'side' },
  { type: 'comboP7B6', label: 'Super 7', odds: '30/40/100', group: 'side' }
];
