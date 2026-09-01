'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ack, PLAYER_TOKEN_KEY } from '@/lib/socket';

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState((params.get('code') || '').slice(0, 3).toUpperCase());
  const [nickname, setNickname] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().length !== 3) { setError('관리자 화면에 표시된 영문 3자리 입장 코드를 입력해 주세요.'); return; }
    if (!employeeId.trim()) { setError('본인의 사번을 입력해 주세요.'); return; }
    if (!nickname.trim()) { setError('행사에서 사용할 이름을 입력해 주세요.'); return; }
    setBusy(true);
    setError(null);
    const result = await ack<{ ok: boolean; error?: string; playerId?: string; token?: string }>('join', {
      code: code.trim(), nickname: nickname.trim(), employeeId: employeeId.trim()
    });
    setBusy(false);
    if (!result.ok || !result.token) { setError(result.error || '입장에 실패했습니다. 입력 내용을 확인해 주세요.'); return; }
    localStorage.setItem(PLAYER_TOKEN_KEY, result.token);
    router.push('/play');
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <p className="text-xs font-bold tracking-[0.28em] text-amber-500">2026 CAGE WORKSHOP</p>
        <h1 className="mt-2 text-2xl font-bold text-amber-300">워크숍 행사 참가</h1>
        <p className="mt-2 text-sm text-zinc-400">아래 정보를 모두 입력해 주세요.</p>
      </div>
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-300">
          사번 <span className="font-normal text-zinc-500">본인의 사번을 입력하세요</span>
          <input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} maxLength={20} inputMode="numeric" autoComplete="off" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-zinc-100 focus:border-amber-400 focus:outline-none" placeholder="예: 123456" aria-describedby="employee-help" />
          <span id="employee-help" className="text-xs font-normal text-amber-200/70">이름이나 닉네임이 아닌 회사 사번을 입력해 주세요.</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-300">
          입장 코드 <span className="font-normal text-zinc-500">영문 3자리</span>
          <input value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase())} maxLength={3} autoCapitalize="characters" autoComplete="off" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-center text-lg uppercase tracking-[0.35em] text-amber-200 focus:border-amber-400 focus:outline-none" placeholder="ABC" aria-describedby="code-help" />
          <span id="code-help" className="text-xs font-normal text-amber-200/70">관리자 화면에 표시된 영문 3자리를 입력해 주세요.</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-300">
          참가자 이름
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-base text-zinc-100 focus:border-amber-400 focus:outline-none" placeholder="행사에서 표시할 이름" />
        </label>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-300">{error}</p>}
        <button type="submit" data-testid="join-submit" disabled={busy || code.trim().length !== 3 || !nickname.trim() || !employeeId.trim()} className="rounded-lg bg-amber-500 py-3 font-bold text-zinc-950 transition active:scale-[0.98] disabled:opacity-40">
          {busy ? '입장 중…' : '참가하기'}
        </button>
      </form>
    </main>
  );
}

export default function JoinPage() {
  return <Suspense><JoinForm /></Suspense>;
}
