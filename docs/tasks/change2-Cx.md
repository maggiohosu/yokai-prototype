저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. 너는 디자인 담당(Codex)이다. docs/plan.md 맨 아래 '변경 이력 2'와 '공유 API 계약'을 먼저 읽어라.
다른 에이전트 2명이 동시에 다른 파일을 고치고 있다. 아래 파일만 고친다. git commit 금지. 끝나면 바꾼 파일과 사용법을 한국어로 짧게 보고.
고쳐도 되는 파일: src/art/creature.js, 새 파일 src/art/marks.js, src/game/hud.js, index.html의 HUD(.hud) 부분, src/style.css의 HUD·게이지 규칙, src/scenes/GalleryScene.js(미물 변형을 도감에 보여줄 때만).
1) 방위 색 미물: drawCreature(scene, 'mimul', { dir }) — dir이 east/west/south/north면 그 방위 색 몸통의 미물을 그린 텍스처(키 'creature-mimul-' + dir)를 한 번만 구워 반환. dir이 없으면 기존 미물. 기존 부품·귀여운 스타일 유지, 방위 색은 다른 형태와 같은 팔레트.
2) 단계 표시: src/art/marks.js에 export function drawStageMark(g, actor, playerStage, t) — 적 머리 위에 단계 수만큼 작은 점(●, ●●, ●●●). 플레이어보다 상위 단계면 붉은색, 같으면 크림색, 하위면 초록색. 크기에 비례해 작게, 화면 줌에서도 읽히게. 성능: Graphics 한 장에 매 프레임 그려도 가볍게.
3) HUD 게이지: hud.setGauge(current, target, label) — HUD 아래 얇은 막대(요력 → 다음 성장 멈춤까지). label 예: '다음 성장까지'. 꽉 차면 살짝 빛나게. 360px에서 HUD와 겹치지 않게.
4) 디자인 톤: 지금 화면(크림색 종이, 짙은 녹색, 굵은 외곽선)과 맞춘다. 기존 캐릭터와 닮게 만들지 말 것.
끝나기 전 node --check와 node --test "tests/*.test.mjs" 통과 확인.