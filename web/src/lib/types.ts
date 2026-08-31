export type Phase =
  | 'road-seeding'
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
export type PayoutMode = 'commission' | 'no-commission';

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
  employeeId: string;
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
  sideBetHits: BetType[];
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
  bettingSeconds: number;
  miniGameSeconds: number;
  betLimits: { mainMin: number; mainMax: number; sideMin: number; sideMax: number };
  payoutMode: PayoutMode;
  initialRoadGames: number;
  seedProgress: number;
  seedPreview: {
    index: number;
    total: number;
    outcome: 'player' | 'banker' | 'tie';
    playerTotal: number;
    bankerTotal: number;
    cards: { cardId: string; side: 'player' | 'banker'; rank: string; suit: string }[];
  } | null;
  miniGame: {
    type: 'beauty-contest' | 'lowest-unique' | null;
    status: 'idle' | 'collecting' | 'revealed';
    submittedCount: number;
    totalPlayers: number;
    endsAt: number | null;
    hasSubmitted: boolean;
    myNumber: number | null;
    average: number | null;
    target: number | null;
    results: { playerId: string; nickname: string; value: number; distance: number; rank: number; unique?: boolean; count?: number }[];
  };
  raffle: {
    status: 'idle' | 'collecting' | 'finished';
    entries: { playerId: string; number: number; nickname: string }[];
    myNumber: number | null;
    prizes: { id: string; name: string }[];
    winners: { prizeId: string; prizeName: string; playerId: string; number: number; nickname: string; employeeId: string; at: number }[];
    remainingNumbers: number[];
  };
  rps: {
    status: 'idle' | 'selecting' | 'round-result' | 'finished';
    roundNo: number;
    aliveIds: string[];
    alivePlayers: { playerId: string; nickname: string }[];
    submittedCount: number;
    myChoice: 'rock' | 'paper' | 'scissors' | null;
    computerChoice: 'rock' | 'paper' | 'scissors' | null;
    roundWinnerIds: string[];
    winner: { playerId: string; nickname: string; employeeId: string } | null;
  };
  teams: {
    id: string;
    name: string;
    score: number;
    members: { playerId: string; nickname: string }[];
  }[];
  workshopQuiz: {
    type: 'initial' | 'ox' | 'faces' | 'brands' | null;
    title: string | null;
    input: 'text' | 'ox' | null;
    status: 'idle' | 'question' | 'revealed' | 'finished';
    questionIndex: number;
    totalQuestions: number;
    question: { category: string; prompt: string; image: string | null; answerImage: string | null; answer: string | null; explanation: string | null } | null;
    myTeamId: string | null;
    awardedTeamId: string | null;
  };
  awards: { category: string; title: string; playerId: string; nickname: string; employeeId: string; at: number }[];
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
  squeezeAuthorities: {
    player: { playerId: string | null; nickname: string | null };
    banker: { playerId: string | null; nickname: string | null };
  };
  cards: CardView[];
  result: RoundResultView | null;
  log: LogEntry[];
  me: MeView | null;
}
