'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ack, getSocket, ADMIN_TOKEN_KEY } from '@/lib/socket';
import type { TableState } from '@/lib/types';
import { formatKRW } from '@/lib/chips';

export default function AdminPage() {
  const [state, setState] = useState<TableState | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [name, setName] = useState('바카라 토너먼트');
  const [initialChips, setInitialChips] = useState(30_000_000);
  const [roundLimit, setRoundLimit] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Source of truth for "which token to (re-)attach with" — a ref, not
  // state, because it must be read fresh every time the socket reconnects
  // (screen lock, weak wifi, tab backgrounding all cause this on mobile),
  // not just once at mount.
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = localStorage.getItem(ADMIN_TOKEN_KEY);
    const socket = getSocket();
    function onState(s: TableState) { setState(s); }
    socket.on('state', onState);

    // Re-runs on every (re)connect, not just the first — otherwise a
    // dropped connection silently un-registers this socket as the admin,
    // and the next admin action fails with "권한이 없습니다".
    function attemptAttach() {
      const tok = tokenRef.current;
      if (!tok) { setAttaching(false); return; }
      ack<{ ok: boolean }>('admin:attach', { adminToken: tok }).then((res) => {
        if (res.ok) setAdminToken(tok);
        else { localStorage.removeItem(ADMIN_TOKEN_KEY); tokenRef.current = null; }
        setAttaching(false);
      });
    }
    socket.on('connect', attemptAttach);
    if (socket.connected) attemptAttach();

    return () => { socket.off('state', onState); socket.off('connect', attemptAttach); };
  }, []);

  useEffect(() => {
    if (!state?.joinCode) return;
    const url = `${window.location.origin}/join?code=${state.joinCode}`;
    QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [state?.joinCode]);

  async function createTournament() {
    setError(null);
    const res = await ack<{ ok: boolean; error?: string; adminToken?: string }>('admin:create', {
      name, initialChips, roundLimit: roundLimit > 0 ? roundLimit : null
    });
    if (!res.ok || !res.adminToken) { setError(res.error || '생성 실패'); return; }
    localStorage.setItem(ADMIN_TOKEN_KEY, res.adminToken);
    tokenRef.current = res.adminToken;
    setAdminToken(res.adminToken);
  }

  async function startTournament() {
    if (!adminToken) return;
    const res = await ack<{ ok: boolean; error?: string }>('admin:start', { adminToken });
    if (!res.ok) setError(res.error || '시작 실패');
  }

  if (attaching) return <main className="flex-1 flex items-center justify-center text-zinc-500">불러오는 중...</main>;

  if (!adminToken || !state) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-xl font-bold text-amber-300">토너먼트 생성</h1>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <label className="flex flex-col gap-1 text-sm text-zinc-400">
            이름
            <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-zinc-100" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-400">
            초기 지급 칩
            <input type="number" value={initialChips} onChange={(e) => setInitialChips(Number(e.target.value))} className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-zinc-100" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-400">
            라운드 수 제한 (0 = 무제한)
            <input type="number" value={roundLimit} onChange={(e) => setRoundLimit(Number(e.target.value))} className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-zinc-100" />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button data-testid="create-tournament" onClick={createTournament} className="rounded-lg bg-amber-500 text-zinc-950 font-bold py-3 active:scale-[0.98] transition">
            생성
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col gap-5 p-5 max-w-lg mx-auto w-full">
      <h1 className="text-xl font-bold text-amber-300">{state.tournamentName}</h1>
      <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- runtime-generated data: URI, not a static/remote asset next/image can optimize
          <img src={qr} alt="입장 QR 코드" className="rounded-lg bg-white p-2 w-[180px] h-[180px]" />
        )}
        <div className="text-sm text-zinc-300 flex flex-col gap-1">
          <div>입장 코드: <span data-testid="join-code" className="font-mono text-lg text-amber-200 tracking-widest">{state.joinCode}</span></div>
          <div>상태: {state.status}</div>
          <div>Round {state.roundNo}{state.roundLimit ? ` / ${state.roundLimit}` : ''} · {state.phase}</div>
          <div>초기 칩: {formatKRW(state.initialChips)}</div>
          {state.status === 'lobby' && (
            <button data-testid="start-tournament" onClick={startTournament} className="mt-2 rounded-lg bg-amber-500 text-zinc-950 font-bold py-2 px-4 active:scale-[0.98] transition self-start">
              토너먼트 시작
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div>
        <h2 className="text-sm text-zinc-400 mb-2">참가자 ({state.playerCount})</h2>
        <div className="flex flex-col gap-1">
          {state.players.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border-b border-zinc-800 py-1.5">
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                {p.nickname}
              </span>
              <span className="text-zinc-300">{formatKRW(p.chips)}</span>
            </div>
          ))}
          {state.players.length === 0 && <p className="text-zinc-600 text-sm">아직 참가자가 없습니다</p>}
        </div>
      </div>
    </main>
  );
}
