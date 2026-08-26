'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ack, PLAYER_TOKEN_KEY } from '@/lib/socket';

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !nickname.trim()) return;
    setBusy(true);
    setError(null);
    const res = await ack<{ ok: boolean; error?: string; playerId?: string; token?: string }>('join', {
      code: code.trim(),
      nickname: nickname.trim()
    });
    setBusy(false);
    if (!res.ok || !res.token) {
      setError(res.error || '입장에 실패했습니다');
      return;
    }
    localStorage.setItem(PLAYER_TOKEN_KEY, res.token);
    router.push('/play');
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-xl font-bold text-amber-300">참가하기</h1>
      <form onSubmit={submit} className="flex flex-col gap-3 w-full max-w-xs">
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          입장 코드
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-3 text-lg tracking-widest text-center text-amber-200 uppercase"
            placeholder="ABCDEF"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          닉네임
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-3 text-base text-zinc-100"
            placeholder="닉네임을 입력하세요"
          />
        </label>
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        <button
          type="submit"
          data-testid="join-submit"
          disabled={busy || !code.trim() || !nickname.trim()}
          className="rounded-lg bg-amber-500 text-zinc-950 font-bold py-3 disabled:opacity-40 active:scale-[0.98] transition"
        >
          {busy ? '입장 중...' : '입장'}
        </button>
      </form>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
