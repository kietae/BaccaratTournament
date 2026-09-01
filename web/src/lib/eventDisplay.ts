import type { TableState } from './types';

export function currentEventDisplay(state: TableState): { title: string; eyebrow: string; baccarat: boolean } {
  if (state.workshopQuiz.status !== 'idle') return { title: state.workshopQuiz.title || '조별 워크숍 게임', eyebrow: 'TEAM WORKSHOP GAME', baccarat: false };
  if (state.rps.status !== 'idle') return { title: '단체 가위바위보', eyebrow: 'GROUP ROCK PAPER SCISSORS', baccarat: false };
  if (state.miniGame.status !== 'idle') return { title: state.miniGame.type === 'lowest-unique' ? '눈치 게임' : '2/3 맞추기', eyebrow: 'MINI GAME', baccarat: false };
  if (state.raffle.status !== 'idle') return { title: '경품 추첨', eyebrow: 'LUCKY DRAW', baccarat: false };
  if (state.status === 'active' || state.status === 'finished') return { title: '바카라 토너먼트', eyebrow: 'LIVE BACCARAT TOURNAMENT', baccarat: true };
  return { title: '2026 CAGE 워크숍', eyebrow: 'CAGE WORKSHOP', baccarat: false };
}
