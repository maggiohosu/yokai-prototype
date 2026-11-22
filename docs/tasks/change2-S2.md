저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md와 docs/plan.md(특히 맨 아래 '변경 이력 2'와 '공유 API 계약')를 먼저 읽고 관련 코드를 파악하라.
다른 에이전트(Sonnet 1명, Codex 1명)가 동시에 다른 파일을 고치고 있다. 아래 '고쳐도 되는 파일'만 고쳐라. **src/scenes/PlayScene.js와 src/config.js는 고치지 마라**(설정값 섹션은 Opus가 이미 만들어 두었다: eating.stageOverride, score, levelUp, enemy.stageWeights, enemy.evolveJitter. 값이 더 필요하면 보고에 적어라).
공유 API 계약의 함수 이름·인자를 정확히 지켜라. 원칙: 확률 결과를 먼저 정하고 연출은 보여주기만, 수치는 설정값, 화폐는 요력 하나, 휴대폰 60fps.
끝나면 node --test "tests/*.test.mjs" 전부 통과, 모든 src 모듈 node --check. git commit 금지. 바꾼 파일·API·PlayScene에 필요한 연결(정확한 코드)·한계를 한국어로 짧게 보고.

담당 S2: 판 안 성장(잠깐 멈춤 + 3장 선택)
고쳐도 되는 파일: 새 파일 src/systems/levelup.js, src/ui/LevelUpView.js, tests/levelup.test.mjs, src/ui/overlay.css(새 규칙 추가만, 기존 규칙 수정 금지), src/ui/HubView.js(퇴화 A/B 대화상자를 export해서 재사용할 때만 최소 수정), src/ui/EvolveView.js(판 안에서 열 때 필요한 옵션만 추가).
1) levelup.js (Phaser·DOM 의존 없음)
- bodyCost(n) = round(levelUp.bodyBaseCost × bodyCostGrowth^n).
- createRunLevel() → { bodyLevel: 0, nextPauseAt: null, lastPauseSec: -Infinity }.
- pauseOptions(progress, run) → [{ kind:'evolve', cost: evolutionCost(stage+1), available: stage<3 }, { kind:'body', cost: bodyCost(run.bodyLevel), mult }, { kind:'ability', stats: [{ stat, level, cost: enhanceCost(level), odds: getEnhanceOdds(progress, stat) }] }] (enhance.js·evolution.js 재사용).
- shouldPause(progress, run, nowSec): nextPauseAt가 없으면 '가장 싼 선택지 비용'으로 정한다. progress.yoryeok >= nextPauseAt이고 nowSec - lastPauseSec >= pauseCooldownSec이면 true.
- afterPause(progress, run, nowSec): lastPauseSec=nowSec, nextPauseAt = max(가장 싼 비용, progress.yoryeok + 가장 싼 비용 × minGapRatio).
- applyBody(progress, run) → { cost, mult }: 요력 차감, run.bodyLevel++. 요력 부족이면 null.
- 테스트: 멈춤 조건·간격·비용 증가·요력 부족.
2) LevelUpView(progress, forms, run, { getFormImage, save, onEvolve, onBody, onAbility, onResume }) — 게임 위 모달(openOverlay 재사용, 기존 overlay.css 스타일·카드 모양을 따른다).
- 제목 '성장할 때!' + 보유 요력. 카드 3장: [진화](비용, 다음 단계 표시, 3단계면 비활성 '최고 단계') / [몸집 강화](비용, '크기 ×1.2 확정, 이번 판만') / [능력 강화](세 능력치 버튼: 이름·레벨·비용·성공/대성공/실패/퇴화 확률). 요력이 부족한 카드는 비활성. 하단 [계속하기].
- 진화 카드: 닫고 onEvolve() 호출(Opus가 EvolveView를 열고, 끝나면 크기 초기화·형태 교체). 몸집: applyBody → onBody(mult) 후 닫기. 능력: tryEnhance로 결과를 먼저 정해 보여주고(결과 문구 색은 HubView와 같은 tone 규칙), 퇴화면 A/B 선택(1단계면 B 비활성, B면 progress.pendingDevolve=true 후 onEvolve()). 능력 강화 뒤에는 화면을 갱신해 연속으로 더 고를 수 있게 하고 [계속하기]로 닫는다. 끝날 때마다 save(progress), 닫을 때 onResume().
- 모든 변경 뒤 save(progress). 엄지로 누르기 쉬운 크기, 360px 폭.