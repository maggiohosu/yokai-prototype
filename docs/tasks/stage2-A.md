저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md, docs/plan.md, docs/research.md를 먼저 읽고, 현재 코드(src/)를 파악하라. 규칙 모듈(src/systems/*.js, src/state/save.js)은 테스트가 끝난 확정본이니 고치지 말고 import해서 써라. 다른 에이전트가 동시에 작업 중이니 지정 파일 외에는 만들거나 고치지 마라. git commit 금지. 끝나면 바꾼 파일과 한계를 한국어로 짧게 보고.

담당: 2단계 전투. 고쳐도 되는 파일: src/scenes/PlayScene.js, src/game/*.js(새 파일 추가 가능: src/game/combat.js, src/game/fireButton.js 등), src/config.js(전투 수치 섹션 추가만).
- 오른쪽 아래 발사 버튼(엄지 크기, 쿨타임 원형 게이지 표시). 버튼은 수동.
- 조준: 이동 방향 앞쪽 부채꼴(config, 예 ±35°, 사거리) 안에서 '나보다 큰' 요괴 중 가장 가까운 것을 자동 조준(조준 대상에 표시). 없으면 이동 방향으로 발사.
- 여의주 구슬: 유도 구슬. 맞으면 상대 크기 감소(데미지 = treasureStats(level).damage × 등급 배율 자리, 지금은 장착 여의주가 없으면 기본 +0 여의주로 시작). shots만큼 발사.
- 크기 깎기로 적이 나보다 작아지면 "역전!" 큰 글씨 연출(짧게) + 그 적 AI는 즉시 도망. 상대가 사라질 만큼 작아지면 쓰러짐(killedByTreasure=true로 기록할 수 있게 이벤트 발생).
- 이벤트 훅: scene.events.emit('eat', {dir, preySize, myOriginalSizeAtEngage, killedByTreasure}), emit('runEnd', {...}) — 3·4단계 연결용. '원래 나보다 컸는지'는 적이 처음 조준/피격될 때의 크기 비교로 기록.
- 키보드 테스트용: 스페이스 = 발사.
- 휴대폰에서는 키보드 안내 문구(WASD) 숨기고 '왼쪽을 끌어 이동 · 오른쪽 버튼 발사' 안내.