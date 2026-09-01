'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ack } from '@/lib/socket';
import type { TableState } from '@/lib/types';

type QuizType = Exclude<TableState['workshopQuiz']['type'], null>;

export default function WorkshopQuizGame({ state, adminToken }: { state: TableState; adminToken?: string }) {
  const quiz = state.workshopQuiz;
  const [error, setError] = useState<string | null>(null);
  const myTeam = state.teams.find((team) => team.id === quiz.myTeamId);

  async function command(event: string, payload: Record<string, unknown> = {}) {
    setError(null);
    const result = await ack<{ ok: boolean; error?: string }>(event, { adminToken, ...payload });
    if (!result.ok) setError(result.error || '요청을 처리하지 못했습니다');
  }

  if (quiz.status === 'idle') return <TeamBoard state={state} adminToken={adminToken} onCommand={command} error={error} />;
  if (quiz.status === 'instructions') return <GameInstructions state={state} adminToken={adminToken} onCommand={command} error={error} />;
  if (quiz.status === 'scoring') return <OfflineScoring state={state} adminToken={adminToken} onCommand={command} error={error} />;

  const question = quiz.question;
  return (
    <section className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-4 rounded-3xl border border-violet-400/25 bg-[radial-gradient(circle_at_top,#31205c,#0b0a12_72%)] p-4 shadow-2xl lg:p-7">
      <header className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[.25em] text-violet-300">TEAM WORKSHOP QUIZ</p><h2 className="text-2xl font-black text-white lg:text-4xl">{quiz.title}</h2></div>
        <div className="rounded-full bg-white/10 px-4 py-2 font-mono text-sm text-violet-100">{quiz.type === 'ox' ? `${quiz.questionIndex + 1}번째 문제` : `${quiz.questionIndex + 1} / ${quiz.totalQuestions}`}</div>
      </header>

      {quiz.status === 'finished' ? (quiz.type === 'ox' ? <OxFinished state={state} adminToken={adminToken} onCommand={command} /> : <FinalScores state={state} adminToken={adminToken} onCommand={command} />) : <>
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,.6fr)]">
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/25 p-5 text-center">
            <p className="text-sm font-bold tracking-[.2em] text-amber-300">{question?.category}</p>
            {(question?.answerImage || question?.image) && <Image src={question.answerImage || question.image!} alt={question.answerImage ? '퀴즈 정답 이미지' : '퀴즈 문제'} width={1200} height={800} sizes="(max-width: 1024px) 90vw, 60vw" className="mt-4 h-auto max-h-[48vh] w-auto max-w-full rounded-2xl object-contain" />}
            <p className={`mt-4 font-black text-white ${quiz.type === 'initial' ? 'text-5xl tracking-[.25em] lg:text-7xl' : 'text-2xl leading-relaxed lg:text-4xl'}`}>{question?.prompt}</p>
            {quiz.status === 'revealed' && <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-6 py-4"><p className="text-xs font-bold tracking-[.2em] text-emerald-300">정답</p><p className="mt-1 text-3xl font-black text-white lg:text-5xl">{question?.answer}</p>{question?.explanation && <p className="mt-2 max-w-2xl text-sm text-emerald-100/80">{question.explanation}</p>}</div>}
          </div>
          <div className="flex flex-col gap-3">
            {quiz.type === 'ox' ? <OxControls state={state} adminToken={adminToken} onCommand={command} /> : <>
              <ScoreList state={state} awardedTeamId={quiz.awardedTeamId} />
              {adminToken ? <div className="grid gap-2">
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-3"><p className="mb-2 text-center text-xs font-bold tracking-[.15em] text-amber-200">가장 먼저 맞힌 조 선택</p><div className="grid grid-cols-2 gap-2">{state.teams.map((team) => <button key={team.id} onClick={() => command('admin:awardWorkshopPoint', { teamId: team.id })} className={`rounded-xl px-3 py-2 font-black transition ${quiz.awardedTeamId === team.id ? 'bg-amber-300 text-amber-950 ring-2 ring-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>{team.name} +1점</button>)}</div></div>
              {quiz.status === 'question' && <button onClick={() => command('admin:revealWorkshopAnswer')} className="rounded-xl bg-emerald-300 py-3 font-black text-emerald-950">정답 공개</button>}
              {quiz.status === 'revealed' && <button onClick={() => command('admin:nextWorkshopQuestion')} className="rounded-xl bg-amber-300 py-3 font-black text-amber-950">{quiz.questionIndex + 1 >= quiz.totalQuestions ? '최종 결과 보기' : '다음 문제'}</button>}
              </div> : <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-center"><div className="text-5xl">🙋</div><p className="mt-3 text-lg font-black text-violet-100">정답을 알면 먼저 손을 드세요!</p><p className="mt-2 text-sm text-zinc-400">{myTeam?.name || '조 편성 대기'} · 진행자가 지목하면 정답을 말해 주세요.</p>{quiz.awardedTeamId && <p className="mt-4 rounded-xl bg-amber-300/10 px-3 py-2 font-bold text-amber-300">이번 문제 득점: {state.teams.find((team) => team.id === quiz.awardedTeamId)?.name}</p>}</div>}
            </>}
          </div>
        </div>
      </>}
      {error && <p className="text-center text-sm text-red-300">{error}</p>}
    </section>
  );
}

function OxControls({ state, adminToken, onCommand }: { state: TableState; adminToken?: string; onCommand: (event: string, payload?: Record<string, unknown>) => void }) {
  const quiz = state.workshopQuiz;
  if (!adminToken) return <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/25 p-5 text-center"><div className="text-6xl">⭕❌</div><p className="mt-4 text-xl font-black text-violet-100">정답이라고 생각하는 구역으로 이동하세요!</p><p className="mt-2 text-sm text-zinc-400">틀린 참가자는 탈락하고, 최후의 1인이 남을 때까지 진행합니다.</p></div>;
  return <div className="flex flex-1 flex-col justify-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-center"><div className="text-5xl">⭕❌</div><p className="mt-3 font-black text-white">현장에서 생존자를 확인해 주세요</p><p className="mt-1 text-sm text-zinc-400">최후의 1인이 결정될 때까지 준비된 문제를 계속 진행합니다.</p></div>{quiz.status === 'question' && <button onClick={() => onCommand('admin:revealWorkshopAnswer')} className="rounded-xl bg-emerald-300 py-3 font-black text-emerald-950">정답 공개</button>}{quiz.status === 'revealed' && <button onClick={() => onCommand('admin:nextWorkshopQuestion')} className="rounded-xl bg-amber-300 py-3 font-black text-amber-950">{quiz.questionIndex + 1 >= quiz.totalQuestions ? '준비된 문제 종료' : '다음 문제'}</button>}<button onClick={() => { if (window.confirm('최후의 1인이 결정되었나요? OX 퀴즈를 종료합니다.')) onCommand('admin:finishWorkshopQuiz'); }} className="rounded-xl border border-red-300/40 bg-red-400/10 py-3 font-black text-red-200">최후 1인 확정 · 종료</button></div>;
}

function OxFinished({ state, adminToken, onCommand }: { state: TableState; adminToken?: string; onCommand: (event: string, payload?: Record<string, unknown>) => void }) {
  const players=state.teams.flatMap((team)=>team.members).sort((a,b)=>a.nickname.localeCompare(b.nickname,'ko'));
  const [winners,setWinners]=useState<string[]>(state.workshopQuiz.winnerPlayerIds || []);
  const prizes=state.gamePrizes.ox || [];
  return <div className="flex flex-1 flex-col items-center justify-center py-12 text-center"><div className="text-8xl">🏆</div><p className="mt-5 text-sm font-bold tracking-[.3em] text-amber-300">LAST PERSON STANDING</p><h3 className="mt-2 text-4xl font-black text-white">OX 퀴즈 최종 순위</h3>{adminToken ? <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-3">{['1등','2등','3등'].map((label,index)=><label key={label} className="text-left text-xs text-zinc-400">{label}{prizes[index] && ` · ${prizes[index]}`}<select value={winners[index] || ''} onChange={(event)=>setWinners((current)=>{const next=[...current];next[index]=event.target.value;return next;})} className="admin-input mt-1 w-full"><option value="">선택</option>{players.map((player)=><option key={player.playerId} value={player.playerId}>{player.nickname}</option>)}</select></label>)}<button onClick={()=>onCommand('admin:setWorkshopPlayerWinners',{playerIds:winners.filter(Boolean)})} className="rounded-xl bg-amber-300 py-3 font-black text-amber-950 sm:col-span-3">수상자와 경품 확정</button></div> : <div className="mt-5 space-y-2">{state.workshopQuiz.winnerPlayerIds.map((playerId,index)=><p key={playerId} className="rounded-xl bg-white/10 px-5 py-2 font-bold text-white">{index+1}위 · {players.find((player)=>player.playerId===playerId)?.nickname}{prizes[index] && ` · ${prizes[index]}`}</p>)}</div>}{adminToken && <button onClick={() => onCommand('admin:resetWorkshopQuiz')} className="mt-7 rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-zinc-200">행사 선택으로 돌아가기</button>}</div>;
}

function TeamBoard({ state, adminToken, onCommand, error }: { state: TableState; adminToken?: string; onCommand: (event: string, payload?: Record<string, unknown>) => void; error: string | null }) {
  const myTeamId = state.workshopQuiz.myTeamId;
  const recommendedCount = Math.max(1, Math.round(state.playerCount / 4.5));
  const [selectedTeamCount, setSelectedTeamCount] = useState<number | null>(null);
  const teamCount = Math.min(Math.max(1, (selectedTeamCount ?? state.teams.length) || recommendedCount), Math.max(1, state.playerCount));
  const averageSize = state.playerCount > 0 ? state.playerCount / Math.max(1, teamCount) : 0;
  return <section className="mx-auto w-full max-w-6xl rounded-3xl border border-violet-400/25 bg-zinc-900/80 p-5 lg:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-[.25em] text-violet-300">RANDOM TEAM</p><h2 className="text-3xl font-black text-white">조 편성</h2></div>{adminToken && <div className="flex flex-wrap items-end justify-end gap-2"><label className="text-left text-xs font-bold text-zinc-400"><span className="mb-1 block">몇 조로 나눌까요?</span><select value={teamCount} onChange={(event) => setSelectedTeamCount(Number(event.target.value))} disabled={!state.playerCount} className="rounded-xl border border-violet-300/30 bg-zinc-950 px-4 py-3 text-base font-black text-white outline-none">{Array.from({ length: Math.max(1, state.playerCount) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}조{count === recommendedCount ? ' · 추천' : ''}</option>)}</select></label><div className="pb-3 text-xs text-zinc-500">조당 평균 {averageSize.toFixed(1)}명</div><button onClick={() => onCommand('admin:assignTeams', { teamCount })} disabled={!state.playerCount} className="rounded-xl bg-violet-300 px-5 py-3 font-black text-violet-950 disabled:opacity-40">{state.teams.length ? '선택한 조 수로 다시 섞기' : '랜덤 조 편성'}</button></div>}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{state.teams.map((team) => <div key={team.id} className={`rounded-2xl border p-4 ${team.id === myTeamId ? 'border-amber-300 bg-amber-300/10' : 'border-white/10 bg-black/20'}`}><div className="flex items-center justify-between"><h3 className="text-xl font-black text-white">{team.name}</h3><span className="text-sm text-zinc-400">{team.members.length}명</span></div><div className="mt-3 space-y-2">{team.members.map((member) => <div key={member.playerId} className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-zinc-200"><span>{member.nickname}</span>{adminToken && <select aria-label={`${member.nickname} 조 이동`} value={team.id} onChange={(event) => onCommand('admin:movePlayerTeam', { playerId: member.playerId, teamId: event.target.value })} className="rounded bg-black/40 px-2 py-1 text-xs">{state.teams.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select>}</div>)}</div></div>)}{!state.teams.length && <p className="col-span-full py-10 text-center text-zinc-500">관리자가 참가자를 랜덤으로 편성합니다.</p>}</div>
    {adminToken && state.teams.length > 0 && <div className="mt-6 grid grid-cols-2 gap-2 lg:grid-cols-3">{([['initial','초성 퀴즈'],['ox','OX 퀴즈'],['faces','눈·코·입'],['brands','브랜드 맞추기'],['spiderman','버텨줘! 스파이더맨'],['moneyhunter','찰싹 머니헌터']] as [QuizType,string][]).map(([type,label]) => <button key={type} onClick={() => onCommand('admin:startWorkshopQuiz', { type })} className="rounded-xl border border-violet-300/30 bg-violet-300/10 py-3 font-bold text-violet-100 hover:bg-violet-300/20">{label}</button>)}</div>}
    {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}
  </section>;
}

function GameInstructions({ state, adminToken, onCommand, error }: { state: TableState; adminToken?: string; onCommand: (event: string, payload?: Record<string, unknown>) => void; error: string | null }) {
  const quiz = state.workshopQuiz;
  return <section className="mx-auto w-full max-w-5xl rounded-3xl border border-violet-400/25 bg-[radial-gradient(circle_at_top,#31205c,#0b0a12_72%)] p-6 lg:p-10"><p className="text-xs font-bold tracking-[.25em] text-violet-300">HOW TO PLAY</p><h2 className="mt-2 text-4xl font-black text-white">{quiz.title}</h2><div className="mt-7 grid gap-3">{quiz.rules.map((rule, index) => <div key={rule} className="flex gap-4 rounded-2xl bg-white/8 p-4"><span className="font-mono text-xl font-black text-amber-300">{String(index + 1).padStart(2, '0')}</span><p className="text-lg text-zinc-100">{rule}</p></div>)}</div>{adminToken ? <button onClick={()=>onCommand('admin:beginWorkshopGame')} className="mt-7 w-full rounded-xl bg-amber-300 py-3 font-black text-amber-950">설명 확인 · 게임 시작</button> : <p className="mt-7 text-center text-zinc-400">관리자가 게임을 시작할 때까지 기다려 주세요.</p>}{error && <p className="mt-3 text-center text-red-300">{error}</p>}</section>;
}

function OfflineScoring({ state, adminToken, onCommand, error }: { state: TableState; adminToken?: string; onCommand: (event: string, payload?: Record<string, unknown>) => void; error: string | null }) {
  return <section className="mx-auto w-full max-w-5xl rounded-3xl border border-emerald-400/25 bg-zinc-900/90 p-6"><p className="text-xs font-bold tracking-[.25em] text-emerald-300">OFFLINE TEAM GAME</p><h2 className="mt-2 text-4xl font-black text-white">{state.workshopQuiz.title}</h2><p className="mt-2 text-zinc-400">{state.workshopQuiz.type === 'moneyhunter' ? '끌어온 모형 지폐의 총액을 입력하세요.' : '먼저 떨어진 조는 낮은 점수, 오래 버틴 조는 높은 점수를 입력하세요.'}</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{state.teams.map((team)=><div key={team.id} className="flex items-center justify-between rounded-2xl bg-white/5 p-4"><div><b className="text-xl text-white">{team.name}</b><p className="text-xs text-zinc-500">{team.members.map((member)=>member.nickname).join(', ')}</p></div>{adminToken ? <input type="number" min={0} defaultValue={team.gameScore} onBlur={(event)=>onCommand('admin:setWorkshopTeamScore',{teamId:team.id,value:Number(event.target.value)})} className="admin-input w-32 text-right text-xl font-black" /> : <span className="text-2xl font-black text-amber-300">{team.gameScore.toLocaleString('ko-KR')}</span>}</div>)}</div>{adminToken && <button onClick={()=>onCommand('admin:finishWorkshopQuiz')} className="mt-6 w-full rounded-xl bg-emerald-300 py-3 font-black text-emerald-950">점수 확정 · 최종 순위</button>}{error && <p className="mt-3 text-center text-red-300">{error}</p>}</section>;
}

function ScoreList({ state, awardedTeamId }: { state: TableState; awardedTeamId: string | null }) {
  return <div className="flex-1 rounded-2xl border border-white/10 bg-black/25 p-3"><p className="mb-2 text-xs font-bold tracking-[.18em] text-zinc-400">이번 게임 실시간 순위</p>{[...state.teams].sort((a,b) => b.gameScore-a.gameScore || a.name.localeCompare(b.name, 'ko')).map((team, index) => <div key={team.id} className={`mb-2 flex items-center justify-between rounded-xl px-3 py-2 ${team.id === awardedTeamId ? 'bg-amber-300/20 ring-1 ring-amber-300/50' : 'bg-white/5'}`}><div><span className="mr-2 font-mono text-sm text-zinc-500">{index + 1}위</span><span className="font-bold text-white">{team.name}</span>{team.id === awardedTeamId && <span className="ml-2 text-xs font-bold text-amber-300">이번 문제 득점</span>}</div><span className="font-mono font-black text-amber-300">{team.gameScore}점</span></div>)}</div>;
}

function FinalScores({ state, adminToken, onCommand }: { state: TableState; adminToken?: string; onCommand: (event: string, payload?: Record<string, unknown>) => void }) {
  const ranked=[...state.teams].sort((a,b)=>b.gameScore-a.gameScore || a.name.localeCompare(b.name, 'ko'));
  const prizes=state.gamePrizes[state.workshopQuiz.type!] || [];
  return <div className="flex flex-1 flex-col items-center justify-center py-10 text-center"><p className="text-sm font-bold tracking-[.3em] text-amber-300">FINAL SCORE</p><h3 className="mt-2 text-4xl font-black text-white">게임 최종 순위</h3><div className="mt-6 w-full max-w-xl space-y-2">{ranked.map((team,index)=><div key={team.id} className={`flex items-center justify-between rounded-2xl px-5 py-4 ${index===0?'bg-amber-300 text-amber-950':'bg-white/10 text-white'}`}><span className="text-left text-xl font-black">{index+1}위 · {team.name}{index < 3 && prizes[index] && <small className="mt-1 block text-xs font-bold opacity-75">경품: {prizes[index]}</small>}</span><span className="text-2xl font-black">{team.gameScore}점</span></div>)}</div>{adminToken && <><div className="mt-6 grid w-full max-w-xl grid-cols-2 gap-2 lg:grid-cols-3">{([['initial','초성'],['ox','OX'],['faces','눈·코·입'],['brands','브랜드'],['spiderman','스파이더맨'],['moneyhunter','머니헌터']] as [QuizType,string][]).map(([type,label])=><button key={type} onClick={()=>onCommand('admin:startWorkshopQuiz',{type})} className="rounded-xl bg-violet-300 px-3 py-3 font-black text-violet-950">{label}</button>)}</div><button onClick={()=>onCommand('admin:resetWorkshopQuiz')} className="mt-3 rounded-xl border border-white/20 px-5 py-2 text-sm font-bold text-zinc-200">행사 선택으로 돌아가기</button></>}</div>;
}
