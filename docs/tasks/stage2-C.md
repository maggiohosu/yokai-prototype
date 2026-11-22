저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md, docs/plan.md, docs/research.md를 먼저 읽고, 현재 코드(src/)를 파악하라. 규칙 모듈(src/systems/*.js, src/state/save.js)은 테스트가 끝난 확정본이니 고치지 말고 import해서 써라. 다른 에이전트가 동시에 작업 중이니 지정 파일 외에는 만들거나 고치지 마라. git commit 금지. 끝나면 바꾼 파일과 한계를 한국어로 짧게 보고.

담당: 휴대폰 화면 다듬기. 고쳐도 되는 파일: src/style.css, src/scenes/GalleryScene.js, index.html(헤더 부분만).
문제: 폭 390px 화면에서 ① 도감 카드 격자가 2열로 오른쪽이 잘림 → 폭에 맞게 자동 열 수(작은 폰 2열, 카드 폭이 화면 안에 들어오게) ② 헤더 오른쪽 '들판으로' 버튼이 잘림 → 작은 화면에서 아이콘만 또는 줄바꿈 없이 들어오게. 360px 폭까지 확인. 놀이 화면 HUD와 겹치지 않게.