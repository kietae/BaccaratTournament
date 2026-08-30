import Link from 'next/link';

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden p-6 text-center bg-[radial-gradient(circle_at_50%_20%,#6b3d12_0%,#18110a_32%,#050505_72%)]">
      <div className="pointer-events-none absolute inset-0 opacity-30 bg-[linear-gradient(120deg,transparent_35%,rgba(251,191,36,.25)_50%,transparent_65%)]" />
      <div className="relative">
        <p className="text-xs font-bold tracking-[0.45em] text-amber-400">2026 CAGE WORKSHOP</p>
        <h1 className="mt-4 text-4xl font-black text-white sm:text-6xl">PLAY. WIN. CELEBRATE.</h1>
        <p className="mt-4 text-lg text-amber-100/80">바카라 · 미니게임 · 럭키 드로우</p>
      </div>
      <div className="relative flex flex-col gap-3 w-full max-w-xs rounded-3xl border border-amber-400/25 bg-black/35 p-5 shadow-[0_0_80px_rgba(245,158,11,.18)] backdrop-blur">
        <Link
          href="/join"
          className="rounded-lg bg-amber-500 text-zinc-950 font-bold py-3 active:scale-[0.98] transition"
        >
          참가하기
        </Link>
        <Link
          href="/admin"
          className="rounded-lg border border-zinc-700 text-zinc-300 font-medium py-3 active:scale-[0.98] transition"
        >
          관리자
        </Link>
      </div>
    </main>
  );
}
