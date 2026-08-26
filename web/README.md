# 바카라 토너먼트 — 웹 앱

Next.js(App Router) + Socket.io 실시간 서버. 게임 규칙/사이드벳 정산은 루트의
[`../engine`](../engine) 모듈(순수 함수, 자동화된 테스트 포함)을 그대로 사용한다.

## 개발 서버 실행

Socket.io를 Next.js와 같은 HTTP 서버에 붙이는 커스텀 서버(`server.js`)를 쓰므로
`next dev`가 아니라 아래 스크립트로 실행한다.

```bash
npm install
npm run dev      # http://localhost:3000, 개발 모드
npm run build    # 프로덕션 빌드
npm start        # 프로덕션 서버 실행
npm run lint
```

## 사용 흐름

1. `/admin` — 토너먼트 생성(초기 칩, 라운드 수) → 입장 코드/QR 발급 → "토너먼트 시작". 행사 중에는 노트북/프로젝터용 바카라 매, 실시간 스퀴즈 중계, 리더보드가 표시되고 마지막 라운드 뒤에는 최종 시상 화면으로 전환된다.
2. `/join?code=...` — 참가자가 QR을 스캔하거나 코드를 입력하고 닉네임으로 입장
3. `/play` — 베팅 → 딜링 → 쪼기(최고 배팅자만 조작, 나머지는 관전) → 정산 → 다음 라운드가
   자동으로 반복된다

재접속은 `localStorage`에 저장된 참가자 토큰으로 복원된다(서버 프로세스가 살아있는 동안
칩 잔액·베팅·라운드 진행 상태가 그대로 유지됨 — 인메모리 상태이므로 서버 재시작 시에는
복원되지 않는다).

## 워크샵 운영 권장안

- 권장 규모는 30~50명이며 최대 100명 이내를 목표로 한다.
- 행사 10분 전 관리자 노트북에서 `/admin`을 열어 Render 서비스를 깨우고 전체화면으로 전환한다.
- 관리자 화면을 프로젝터에 복제하면 QR 입장, 매판 바카라 매, 카드 스퀴즈, 실시간 순위와 최종 1~3위를 한 화면에서 진행할 수 있다.
- 관리자 노트북은 행사 내내 전원과 안정적인 네트워크에 연결하고, 브라우저 탭을 닫거나 Render 재배포를 하지 않는다. 현재 서버 상태는 인메모리이므로 서버 재시작 시 복구되지 않는다.

## 배포 (Render)

라이브: https://baccarat-tournament.onrender.com. 저장소 루트의 `../render.yaml`로
설정되며, `main`에 push하면 자동 재배포된다. Vercel 같은 서버리스 플랫폼은 못 쓴다 —
Socket.io가 계속 켜져 있는 Node 프로세스를 필요로 하기 때문(자세한 이유는
`docs/dev-plan.html` §12 참고).

빌드 커맨드가 `npm ci --include=dev`인 이유: Render는 빌드 단계에도
`NODE_ENV=production`을 주입하는데, npm은 이 값이면 devDependencies를 통째로
건너뛴다(`@tailwindcss/postcss` 등 빌드에 실제로 필요한 패키지 포함) — `--include=dev`로
강제로 덮어써야 한다.

## 디렉터리

- `server.js` — Node HTTP 서버 + Socket.io + Next 요청 핸들러
- `src/server/` — 게임 테이블 상태 머신(순수 CommonJS, Next 번들러를 거치지 않음)
- `src/app/` — 페이지(admin/join/play)
- `src/components/SqueezeCanvas.tsx` — 쪼기 제스처 렌더링 엔진(Canvas 2D, 정확 반사 기하)
