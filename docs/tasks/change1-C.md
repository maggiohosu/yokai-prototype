저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md, docs/plan.md(특히 맨 아래 '변경 이력')를 먼저 읽고 관련 코드를 파악하라.
다른 Sonnet 에이전트 2명이 동시에 다른 부분을 고치고 있다. 아래 '고쳐도 되는 파일'만 고쳐라. **src/scenes/PlayScene.js는 절대 고치지 마라**(Opus가 마지막에 연결한다). PlayScene에서 바뀌어야 할 호출이 있으면 보고에 정확한 코드로 적어라.
src/config.js는 지정된 섹션만, 작은 Edit로 고친다(동시 수정 충돌 시 다시 읽고 재시도).
원칙: 수치는 설정값에 둔다. 확률·결과를 먼저 정하고 연출은 보여주기만 한다. 휴대폰 60fps.
끝나면 node --test "tests/*.test.mjs" 전부 통과 확인, 모든 src 모듈 node --check. git commit 금지. 바꾼 파일·새 API·PlayScene에 필요한 변경·한계를 한국어로 짧게 보고.

담당 C: 초반 큰 적 증가 + 먹히면 즉시 종료·다음 판 버튼
고쳐도 되는 파일: src/game/world.js, src/config.js의 enemy·world 섹션, src/game/hud.js, index.html의 #result 영역, src/style.css의 결과 창 규칙, src/game/enemy.js(필요할 때만).
- 적 크기 분포: 플레이어가 작을 때(시작 크기~config.enemy.earlyUntilSize, 예 70) '나보다 큰 적'이 훨씬 많게. 예: 초반 가중치 작은 적 0.35 / 비슷 0.15 / 큰 적 0.50 → 커질수록 기존 분포(0.67/0.13/0.20)로 선형 전환(config). 시작 직후 바로 옆에 작은 먹이 하나는 지금처럼 유지(시작하자마자 못 움직이는 일이 없게). 큰 적은 시작 안전 거리 밖에 생성.
- 먹히면: 즉시 판 종료(지금처럼), 결과 창에 버튼 2개. [다음 판 시작](주 버튼, 크게) = 같은 진행 상태로 바로 새 판. [강화·진화](보조 버튼) = 판 사이 화면. 결과 창에 이번 판 요력·먹은 수·최대 크기 표시 유지.
- hud.end(player, killer, { onRestart, onHub }, run) 로 시그니처 변경. PlayScene에서 쓸 호출 예시를 보고에 적어라(예: onRestart: () => this.scene.restart({ progress: this.progress }), onHub: () => this.openHub()).
- 결과 창은 엄지로 누르기 쉬운 크기, 360px 폭에서 잘리지 않게.