저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md, docs/plan.md, docs/research.md를 먼저 읽고, 현재 코드(src/)를 파악하라. 규칙 모듈(src/systems/*.js, src/state/save.js)은 테스트가 끝난 확정본이니 고치지 말고 import해서 써라. 다른 에이전트가 동시에 작업 중이니 지정 파일 외에는 만들거나 고치지 마라. git commit 금지. 끝나면 바꾼 파일과 한계를 한국어로 짧게 보고.

담당: 진화 화면과 판 사이 화면 UI. 새 파일만 만든다: src/ui/overlay.css, src/ui/EvolveView.js, src/ui/HubView.js, src/ui/OddsTable.js (DOM 오버레이 방식, Phaser 씬 위에 띄우는 HTML. 닫으면 콜백). index.html·PlayScene은 Opus가 연결하니 건드리지 마라. 대신 각 View 사용법을 파일 맨 위 주석 3~5줄로.
- 공통: 세로 휴대폰(360~430px 폭) 기준, 큰 버튼, 쉬운 한국어. 확률은 모두 화면에 표시(OddsTable). 캐릭터 그림은 src/art/creature.js의 텍스처를 canvas로 그려 넣거나, Phaser 게임 인스턴스의 textures에서 base64로 얻는 헬퍼를 받아 쓴다(인자로 getFormImage(formId, grade) 함수를 주입받아라).
- EvolveView(progress, forms, {onDone}): 요력·진화 비용, 식성 4색 막대, 음양(요기↔선기) 게이지, 선택지 3장(①②는 형태 그림+이름, ③은 ??? 카드). 선택 → evolution.evolve 결과를 먼저 받고 그 결과를 보여줌(원칙 5). 결과 화면: 이름 — 한 줄 설명 크게, 등급(빛/테두리 색), 최초 발견이면 '보호권 +1'. 등급 확률표 보기 버튼(gradeOdds).
- HubView(progress, forms, {onPlay, onEvolve, save}): 판 사이 화면. 탭 2개.
  ① 본체 강화: 능력치 3종 카드(레벨, 다음 성공/대성공/실패/퇴화 확률, 비용), [강화] 버튼, [연속 강화: 목표 +n] 버튼(autoEnhance, 결과 기록을 빠르게 흘려 보여줌). 퇴화 결과면 A/B 선택 모달(1단계면 B 비활성, B 선택 시 onEvolve로 역진화 흐름 요청). 보호권 수 표시.
  ② 여의주: 장착 여의주 칭호(treasureTitle)·레벨, 강화(성공/실패/깨짐 확률, 비용), 판매(판매가), 보관함 5칸(장착 바꾸기·판매), 파편 수와 보호권 교환 버튼. 강화 성공 시 progress.recordTreasureSuccess 호출(선기 상승).
  하단: [다음 판 시작] [진화하기(가능할 때)] 버튼. 모든 변경 뒤 save(progress) 호출.
- 연출은 짧고 단순하게(화려한 연출은 이번 범위 밖). 결과를 먼저 정하고 보여주기만 한다.