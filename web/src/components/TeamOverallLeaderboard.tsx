import type { TableState } from '@/lib/types';

export default function TeamOverallLeaderboard({ state, floating = false }: { state: TableState; floating?: boolean }) {
  if (!state.teams.length) return null;
  const ranked=[...state.teams].sort((a,b)=>b.overallScore-a.overallScore||a.name.localeCompare(b.name,'ko'));
  return <section className={`${floating?'fixed bottom-4 right-4 z-40 w-72 shadow-2xl':'w-full'} rounded-2xl border border-amber-300/30 bg-zinc-950/95 p-3 backdrop-blur`}><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-black text-amber-200">6개 조 게임 종합 순위</h2><span className="text-[10px] text-zinc-500">게임별 3·2·1점</span></div><div className="space-y-1">{ranked.map((team,index)=><div key={team.id} className={`grid grid-cols-[2.5rem_1fr_auto] items-center rounded-lg px-3 py-1.5 ${index===0?'bg-amber-300/15':'bg-white/5'}`}><b className={index===0?'text-amber-300':'text-zinc-500'}>{index+1}위</b><span className="font-bold text-white">{team.name}</span><span className="font-mono font-black text-amber-200">{team.overallScore}점</span></div>)}</div></section>;
}
