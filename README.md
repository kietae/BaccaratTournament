# 바카라 토너먼트 앱

사내 직원 이벤트용 실시간 모바일 바카라 토너먼트. QR로 접속해 닉네임만으로 참가하고,
정해진 판수 동안 베팅하며, 최고 배팅자가 직접 카드를 드래그해 쪼는(스퀴즈) 모바일 앱.

**라이브**: https://baccarat-tournament.onrender.com (Render 무료 플랜 — 15분간 요청이
없으면 슬립되므로, 행사 시작 5~10분 전에 관리자 페이지를 한 번 열어 예열할 것)

## 앱 실행

실제 동작하는 앱은 [`web/`](web)에 있다 (Next.js + Socket.io). 실행 방법은
[`web/README.md`](web/README.md) 참고.

게임 규칙 엔진(바카라 판정 · 메인/사이드벳 정산)은 [`engine/`](engine)에 프레임워크
의존 없이 분리되어 있고, 자동화된 테스트가 있다:

```bash
npm test   # 루트에서 실행 — engine/test/*.test.js (node:test)
```

## 문서

- [`docs/dev-plan.html`](docs/dev-plan.html) — 개발 계획서(게임 흐름, 아키텍처, 데이터 모델, 사이드 베팅 배당, 로드맵)
- [`docs/ui-mockup.html`](docs/ui-mockup.html) — 카드 뒷면 · 베팅 화면 UI 목업(초기 정적 목업; 실제 동작은 `web/`)
- [`docs/squeeze-prototype.html`](docs/squeeze-prototype.html) — 카드 쪼기 인터랙션 기하 검증용 단독 프로토타입

각 문서를 브라우저로 열면 확인할 수 있습니다.

## 현재 단계

핵심 플레이 루프(베팅 → 딜링 → 쪼기 → 정산 → 다음 라운드)가 실제로 동작한다. 관리자
패널, 참가자 입장/재접속, 게임 규칙 엔진과 자동화 테스트, 실시간 동기화까지 구현 완료.
남은 항목은 `web/README.md`와 최근 커밋 메시지 참고.
