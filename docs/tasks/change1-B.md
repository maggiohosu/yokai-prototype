저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md, docs/plan.md(특히 맨 아래 '변경 이력')를 먼저 읽고 관련 코드를 파악하라.
다른 Sonnet 에이전트 2명이 동시에 다른 부분을 고치고 있다. 아래 '고쳐도 되는 파일'만 고쳐라. **src/scenes/PlayScene.js는 절대 고치지 마라**(Opus가 마지막에 연결한다). PlayScene에서 바뀌어야 할 호출이 있으면 보고에 정확한 코드로 적어라.
src/config.js는 지정된 섹션만, 작은 Edit로 고친다(동시 수정 충돌 시 다시 읽고 재시도).
원칙: 수치는 설정값에 둔다. 확률·결과를 먼저 정하고 연출은 보여주기만 한다. 휴대폰 60fps.
끝나면 node --test "tests/*.test.mjs" 전부 통과 확인, 모든 src 모듈 node --check. git commit 금지. 바꾼 파일·새 API·PlayScene에 필요한 변경·한계를 한국어로 짧게 보고.

담당 B: 발사체 성장(처음엔 이동 방향만, 강화할수록 수·방향·속도·파워)
고쳐도 되는 파일: src/game/combat.js, src/systems/treasure.js, src/systems/tuning-upgrade.js, src/config.js의 combat 섹션, src/ui/HubView.js의 여의주 패널 부분, tests/treasure.test.mjs(필요 시 새 테스트 파일).
- docs/plan.md '보물 레벨 표'를 tuning-upgrade.js에 그대로 넣고 treasureStats(level) → { damage, ways, perWay, speedMult, homing, ...기존 필드 유지 } 로 확장. 0~15 모든 레벨 행이 있는지 테스트.
- combat.js: 자동 조준 제거. 발사 방향 = 마지막 이동 방향(heading). ways개 방향을 heading 기준 360/ways 간격으로, 방향마다 perWay개를 나란히(shotSpacing) 발사. 속도 = orbSpeed × speedMult, 데미지 = damage × 등급 배율 × 대표 효과(기존 곱 유지). homing>0이면 날아가는 동안 진행 방향 앞 부채꼴의 '나보다 큰' 가장 가까운 적 쪽으로 homing×turnRate만큼 회전(config). homing=0이면 직진. 조준 링 표시는 homing>0일 때 유도 대상에만.
- 구슬 수가 많아도 성능 유지(구슬 상한 config, 예 120개).
- 여의주를 장착하지 않았으면 레벨 0 성능.
- HubView 여의주 패널: 현재→다음 레벨 성능을 한 줄로('방향 2→3 · 방향당 2개 · 속도 ×1.20→×1.25 · 파워 ×1.50→×1.65 · 유도 없음→있음'). 최대 레벨이면 현재만.