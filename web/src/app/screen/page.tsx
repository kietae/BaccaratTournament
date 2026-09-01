'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import { ack, getSocket } from '@/lib/socket';
import type { CardView, TableState } from '@/lib/types';
import { formatKRW } from '@/lib/chips';
import BigRoadGrid from '@/components/BigRoadGrid';
import CardSlot, { EmptyCardSlot } from '@/components/CardSlot';
import SqueezeCanvas from '@/components/SqueezeCanvas';
import OpeningRoadGame from '@/components/OpeningRoadGame';
import RoundResultCallout from '@/components/RoundResultCallout';
import WorkshopQuizGame from '@/components/WorkshopQuizGame';
import GroupRpsGame from '@/components/GroupRpsGame';
import KeynesMiniGame from '@/components/KeynesMiniGame';
import PrizeDraw from '@/components/PrizeDraw';
import TeamOverallLeaderboard from '@/components/TeamOverallLeaderboard';
import { currentEventDisplay } from '@/lib/eventDisplay';

const PHASE: Record<TableState['phase'],string>={
  'road-seeding':'초기 게임 진행','betting-wait':'베팅 중','betting-confirmed':'베팅 마감',dealing:'카드 배분',squeeze:'카드 스퀴즈','extra-card':'추가 카드','third-card-call':'추가 카드 콜','dealer-call':'딜러 콜','result-calc':'결과 확인',payout:'정산','next-round':'다음 라운드 준비'
};

export default function BroadcastScreenPage(){
  const [state,setState]=useState<TableState|null>(null);
  const [qr,setQr]=useState<string|null>(null);
  useEffect(()=>{
    const socket=getSocket();
    const onState=(next:TableState)=>setState(next);
    const attach=()=>void ack('screen:attach',{});
    socket.on('state',onState);socket.on('connect',attach);if(socket.connected)attach();
    return()=>{socket.off('state',onState);socket.off('connect',attach);};
  },[]);
  useEffect(()=>{
    if(!state?.joinCode)return;
    QRCode.toDataURL(`${window.location.origin}/join?code=${state.joinCode}`,{margin:1,width:420}).then(setQr).catch(()=>setQr(null));
  },[state?.joinCode]);
  if(!state)return <main className="flex min-h-screen items-center justify-center bg-black text-2xl text-zinc-400">행사 화면 연결 대기 중…</main>;
  const eventDisplay=currentEventDisplay(state);
  return <main className="h-screen overflow-hidden bg-black p-5 text-white"><header className="flex h-28 items-center justify-between border-b border-amber-400/25 pb-3"><div><p className="text-sm font-bold tracking-[.35em] text-amber-400">{eventDisplay.eyebrow}</p><h1 className="mt-1 text-4xl font-black text-amber-100">{eventDisplay.title}</h1></div><div className="flex items-center gap-5"><div className="text-right"><p className="text-2xl font-black text-white">{eventDisplay.baccarat?(state.status==='finished'?'바카라 결과':PHASE[state.phase]):'행사 진행 중'}</p><p className="text-lg text-zinc-400">{eventDisplay.baccarat&&`${state.roundNo}판 · `}접속 {state.players.filter((player)=>player.connected).length}명</p></div>{qr&&<div className="flex items-center gap-3 rounded-2xl bg-white p-2 text-zinc-950"><div className="pl-2 text-right"><b className="block text-lg">중간 참가</b><span className="font-mono text-2xl font-black tracking-[.2em]">{state.joinCode}</span></div><Image src={qr} alt="참가 QR" width={96} height={96} unoptimized className="h-24 w-24" /></div>}</div></header><div className="h-[calc(100vh-7rem)] pt-4"><ScreenContent state={state} /></div><TeamOverallLeaderboard state={state} floating /></main>;
}

function ScreenContent({state}:{state:TableState}){
  if(state.workshopQuiz.status!=='idle'||(state.status!=='active'&&state.teams.length>0))return <div className="h-full overflow-auto"><WorkshopQuizGame state={state}/></div>;
  if(state.rps.status!=='idle')return <div className="mx-auto h-full max-w-6xl overflow-auto"><GroupRpsGame state={state}/></div>;
  if(state.miniGame.status==='collecting')return <section className="flex h-full flex-col items-center justify-center rounded-3xl border border-violet-400/30 bg-[radial-gradient(circle_at_top,#39205e,#100b1b_68%)] text-center"><p className="text-sm font-bold tracking-[.3em] text-violet-300">MINI GAME</p><h2 className="mt-3 text-7xl font-black">{state.miniGame.type==='lowest-unique'?'눈치 게임':'2/3 맞추기'}</h2><p className="mt-8 text-3xl text-violet-100">참가자 휴대전화에서 숫자를 제출해 주세요</p><p className="mt-5 rounded-full bg-white/10 px-8 py-3 text-2xl">제출 {state.miniGame.submittedCount} / {state.miniGame.totalPlayers}명</p></section>;
  if(state.miniGame.status==='revealed')return <div className="mx-auto max-w-6xl"><KeynesMiniGame state={state} admin/></div>;
  if(state.raffle.status!=='idle')return <div className="mx-auto max-w-6xl"><PrizeDraw state={state}/></div>;
  if(state.status==='lobby')return <div className="grid h-full grid-cols-[1fr_1.2fr] gap-5"><section className="flex flex-col items-center justify-center rounded-3xl border border-amber-400/25 bg-zinc-900/70"><p className="text-3xl font-black text-amber-100">참가 접수 중</p><p className="mt-3 text-xl text-zinc-400">화면 우측 상단 QR을 스캔하세요</p></section><PublicLeaderboard state={state}/></div>;
  if(state.phase==='road-seeding')return <OpeningRoadGame state={state} large/>;
  return <BaccaratBroadcast state={state}/>;
}

function BaccaratBroadcast({state}:{state:TableState}){
  const active=state.cards.find((card)=>card.dealt&&!card.revealed)??null;
  const resultVisible=state.result&&['result-calc','payout','next-round'].includes(state.phase);
  const liveSqueeze=active?.needsSqueeze&&(state.phase==='squeeze'||state.phase==='extra-card');
  return <div className="grid h-full grid-rows-[13rem_1fr] gap-4"><div className="grid grid-cols-[1.3fr_.7fr] gap-4"><section className="overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/70 p-4"><h2 className="mb-2 text-xl font-black">바카라 매</h2><BigRoadGrid road={state.bigRoad}/></section><PublicLeaderboard state={state} limit={5}/></div><section className="grid min-h-0 grid-cols-[1fr_1.25fr_1fr] items-center gap-5 rounded-3xl border border-emerald-600/30 bg-[radial-gradient(circle_at_top,#16543d,#08251a_70%)] p-5"><ScreenCards label="PLAYER" cards={state.cards.filter((card)=>card.side==='player')}/><div className="flex h-full min-h-0 items-center justify-center">{liveSqueeze?<SqueezerSpotlight state={state} card={active}/>:resultVisible&&state.result?<RoundResultCallout result={state.result} large/>:<div className="text-center"><p className="text-5xl font-black">{PHASE[state.phase]}</p><p className="mt-3 text-xl text-emerald-100/60">ROUND {state.roundNo}</p></div>}</div><ScreenCards label="BANKER" cards={state.cards.filter((card)=>card.side==='banker')}/></section></div>;
}

function SqueezerSpotlight({state,card}:{state:TableState;card:CardView}){
  const side=card.side==='player'?'PLAYER':'BANKER';
  const sideColor=card.side==='player'?'text-blue-200 border-blue-300/60 bg-blue-500/15':'text-red-200 border-red-300/60 bg-red-500/15';
  return <div className="flex h-full min-h-0 w-full flex-col items-center">
    <div className={`broadcast-squeezer mb-3 w-full rounded-2xl border-2 px-4 py-2 text-center shadow-2xl ${sideColor}`}>
      <p className="text-sm font-black tracking-[.28em]">{side} · 지금 스퀴즈</p>
      <p className="mt-1 truncate text-4xl font-black text-white drop-shadow-[0_0_18px_rgba(255,255,255,.38)]">{state.squeezerNickname||'딜러'}</p>
      <p className="mt-1 text-sm font-bold text-amber-200">카드를 스퀴즈해 주세요!</p>
    </div>
    <div className="min-h-0 flex-1 aspect-[11/16] overflow-hidden rounded-2xl border-2 border-amber-300/55 shadow-[0_0_35px_rgba(252,211,77,.2)]"><SqueezeCanvas mode="remote" revealed={card.revealed} rank={card.rank} suit={card.suit} remoteEdge={card.edge} remotePct={card.pct} remoteGrip={card.grip}/></div>
  </div>;
}

function ScreenCards({label,cards}:{label:'PLAYER'|'BANKER';cards:CardView[]}){const prefix=label==='PLAYER'?'P':'B';const scale=2.2;return <div className="text-center"><h3 className={`mb-3 text-3xl font-black ${label==='PLAYER'?'text-blue-200':'text-red-200'}`}>{label}</h3><div className="mx-auto grid w-fit grid-cols-[max-content_max-content] justify-items-center gap-3">{[1,2,3].map((number,index)=>{const card=cards.find((item)=>item.cardId===`${prefix}${number}`);return <div key={number} className={index===2?'col-span-2':''}>{card?.dealt?<CardSlot card={card} scale={scale}/>:<EmptyCardSlot orientation={index===2?'horizontal':'vertical'} scale={scale}/>}</div>;})}</div></div>;}

function PublicLeaderboard({state,limit}:{state:TableState;limit?:number}){const ranked=[...state.players].sort((a,b)=>b.chips-a.chips).slice(0,limit||state.players.length);return <section className="min-h-0 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900/70 p-4"><h2 className="mb-3 text-xl font-black">실시간 순위</h2><div className="space-y-2">{ranked.map((player,index)=><div key={player.id} className="grid grid-cols-[3rem_1fr_auto] rounded-xl bg-white/5 px-4 py-2 text-lg"><b className="text-amber-300">{index+1}위</b><span>{player.nickname}</span><span className="font-mono">{formatKRW(player.chips)}</span></div>)}</div></section>;}
