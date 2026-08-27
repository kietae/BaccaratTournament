export type Phase =
  | 'betting-wait'
  | 'betting-confirmed'
  | 'dealing'
  | 'squeeze'
  | 'extra-card'
  | 'third-card-call'
  | 'dealer-call'
  | 'result-calc'
  | 'payout'
  | 'next-round';

export type BetType =
  | 'player'
  | 'banker'
  | 'tie'
  | 'playerPair'
  | 'bankerPair'
  | 'banker6TwoCard'
  | 'banker6ThreeCard'
  | 'player7TwoCard'
  | 'player7ThreeCard'
  | 'comboP7B6';

export type Edge = 'left' | 'right' | 'top' | 'bottom';

export interface CardView {
  cardId: string;
  side: 'player' | 'banker';
  orientation: 'vertical' | 'horizontal';
  dealt: boolean;
  revealed: boolean;
  edge: Edge | null;
  pct: number;
  grip: number;
  needsSqueeze: boolean;
  rank?: string;
  suit?: string;
}

export interface PlayerView {
  id: string;
  nickname: string;
  chips: number;
  connected: boolean;
}

export interface BigRoadCell {
  col: number;
  row: number;
  result: 'player' | 'banker';
  ties: number;
}

export interface BigRoad {
  cells: BigRoadCell[];
  cols: number;
  maxRows: number;
  leadingTies: number;
}

export interface SettledBet {
  type: BetType;
  amount: number;
  result: 'win' | 'lose' | 'push';
  payout: number;
  net: number;
}

export interface RoundResultView {
  outcome: 'player' | 'banker' | 'tie';
  playerTotal: number;
  bankerTotal: number;
  playerNatural: boolean;
  bankerNatural: boolean;
}

export interface LogEntry {
  type: 'call';
  text: string;
  at: number;
  tone?: 'winner';
}

export interface MeView {
  id: string;
  nickname: string;
  chips: number;
  bets: { type: BetType; amount: number }[];
  confirmed: boolean;
  betTotal: number;
  settlement: SettledBet[] | null;
}

export interface TableState {
  tournamentId: string;
  tournamentName: string;
  joinCode: string;
  status: 'lobby' | 'active' | 'finished';
  initialChips: number;
  roundLimit: number | null;
  roundNo: number;
  phase: Phase;
  phaseEndsAt: number | null;
  players: PlayerView[];
  playerCount: number;
  bigRoad: BigRoad;
  totalPot: number;
  mainBetSummary: {
    player: { bettors: number; amount: number };
    banker: { bettors: number; amount: number };
  };
  squeezerId: string | null;
  squeezerNickname: string | null;
  isSqueezer: boolean;
  cards: CardView[];
  result: RoundResultView | null;
  log: LogEntry[];
  me: MeView | null;
}
