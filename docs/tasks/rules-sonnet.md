저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md(기획)와 docs/plan.md(설계)를 먼저 읽어라. 다른 에이전트가 동시에 index.html, src/config.js, src/data/, src/art/, src/game/, src/scenes/ 를 만들고 있다. 그 파일들은 절대 만들거나 고치지 마라. 아래에 지정한 파일만 만든다.
규칙:
- 순수 ES 모듈(브라우저와 node 둘 다 동작). DOM·Phaser 사용 금지.
- 무작위는 모두 rng 인자(기본 Math.random)로 주입받아 테스트에서 고정할 수 있게.
- 기획 원칙 5: 확률 결과를 먼저 정하고 반환한다(연출용 '아깝게 보이기' 값 금지).
- 수치는 지정된 tuning 파일에만 둔다(나중에 Opus가 src/config.js로 합친다).
- 테스트는 node:test로 tests/ 아래에, 'node --test tests/' 로 통과해야 함. 확률은 고정 rng와 10만 회 몬테카를로로 기대값 ±1%p 확인.
- git commit 하지 마라. 끝나면 만든 파일, 공개 함수 시그니처, 테스트 결과를 한국어로 짧게 보고.

담당 파일: src/systems/tuning-evolution.js, src/systems/evolution.js, src/systems/progress.js, src/state/save.js, tests/evolution.test.mjs, tests/save.test.mjs

형태 데이터는 다른 에이전트가 src/data/forms.js에 만들고 있으니 import하지 말고, 함수 인자로 forms 배열을 받는다. 각 form: {id, name, stage(1~3), dir('east'|'west'|'south'|'north'|'none'), branch('yo'|'seon'|'none'), from?: [이전 단계 id들]}. 테스트용 17종 고정 데이터는 tests/fixtures-forms.mjs에 직접 작성(기획 9절: 미물 → 새끼 뱀(동)/범(서)/새(남)/거북(북) → 방위마다 요2·선1).

1) progress.js — 판 안팎 기록
- createProgress() → {yoryeok, diet:{east,west,south,north}, alignment(-100 요기 ~ +100 선기), formId:'mimul', stage:1, grade:'C', enh:{growth,speed,signature}, protect:0, shards:0, treasure:null, inventory:[], pity:0, discovered:[]} 
- recordEat(p, {dir, preySize, myOriginalSizeAtEngage, killedByTreasure}) → 식성에 preySize만큼 더함, 성향: 직접 먹으면 요기 쪽(-), 원래 나보다 컸던 요괴면 크게(×3), killedByTreasure면 선기 쪽(+). 보물 강화 성공 시 recordTreasureSuccess(p) 선기 +.
- 요력 획득 yoryeokFor(preySize, killedByTreasure) (크기×1, 보물 처치 ×1.5, tuning).
2) evolution.js — 기획 5·6절
- evolutionCost(nextStage) (2단계 100, 3단계 400, tuning). canEvolve(p).
- buildChoices(p, forms, {rng}) → 3개: ① 정규 진화(현재 형태의 다음 단계 중 식성 1위 방위·성향에 가장 맞는 것) ② 두 번째로 맞는 것(정규 진화 후보가 1개뿐이면 같은 단계 전체에서 식성·성향 점수 2위) ③ {unknown:true} 미지의 진화(실제 형태는 선택 시 같은 단계 무작위로 결정). 점수 = 방위 일치(식성 비중) + 갈래 일치(성향 부호·크기). 1→2단계는 방위만, 2→3단계는 방위+갈래.
- evolve(p, choice, forms, {rng}) → 형태 확정, 등급 굴림, 식성 초기화, stage+1, discovered 갱신(최초 발견이면 보호권 +1). 결과 {form, grade, firstDiscovery}.
- rollGrade(enhSum, {rng}) — 기본 S+1 S4 A10 B20 C25 D20 E12 F8. 보정: 강화 합계 1당 F·E·D에서 합계 0.5%p를(F부터 차례로, 0 아래로는 안 내림) 빼서 S+:S:A:B=1:2:3:4 비율로 더함, 합계 최대 30. gradeOdds(enhSum)로 표시용 확률표 반환(합 100).
- gradeMultiplier: S+ 2.0, S 1.6, A 1.3, B 1.1, C 1.0, D 0.85, E 0.7, F 0.5.
- devolve(p, forms, {rng}) — 역진화: 강화 유지, stage-1(1단계 불가), 해당 단계의 형태로 돌아가 새 선택지로 재진화할 수 있게 상태 반환.
3) save.js — localStorage 저장/불러오기(키 'yokai-proto-v1', 버전 필드, 손상 시 새로 시작, storage 객체 주입 가능해 node 테스트에서 가짜 저장소 사용).