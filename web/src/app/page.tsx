import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-amber-300">바카라 토너먼트</h1>
        <p className="mt-2 text-sm text-zinc-400">사내 이벤트용 실시간 바카라</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
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
