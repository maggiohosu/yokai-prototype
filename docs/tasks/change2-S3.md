저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md와 docs/plan.md(특히 맨 아래 '변경 이력 2'와 '공유 API 계약')를 먼저 읽고 관련 코드를 파악하라.
다른 에이전트(Sonnet 1명, Codex 1명)가 동시에 다른 파일을 고치고 있다. 아래 '고쳐도 되는 파일'만 고쳐라. **src/scenes/PlayScene.js와 src/config.js는 고치지 마라**(설정값 섹션은 Opus가 이미 만들어 두었다: eating.stageOverride, score, levelUp, enemy.stageWeights, enemy.evolveJitter. 값이 더 필요하면 보고에 적어라).
공유 API 계약의 함수 이름·인자를 정확히 지켜라. 원칙: 확률 결과를 먼저 정하고 연출은 보여주기만, 수치는 설정값, 화폐는 요력 하나, 휴대폰 60fps.
끝나면 node --test "tests/*.test.mjs" 전부 통과, 모든 src 모듈 node --check. git commit 금지. 바꾼 파일·API·PlayScene에 필요한 연결(정확한 코드)·한계를 한국어로 짧게 보고.

담당 S3: 먹기 규칙·점수 + 적의 성장/진화/강화 + 단계별 적 생성
고쳐도 되는 파일: 새 파일 src/systems/rules.js, tests/rules.test.mjs, src/game/enemy.js, src/game/enemyAI.js, src/game/world.js, src/game/actor.js(필요할 때만), tests/enemyAI.test.mjs.
1) rules.js (Phaser 의존 없음)
- stageOf(actor) = actor.stage ?? 1.
- canEat(a, b, { reversed=false }): 같은 단계면 a.size >= b.size × (reversed ? 1 : CONFIG.eating.ratio). a가 상위면 b.size < a.size × stageOverride일 때 true(하위가 2배 이상 크면 상위는 못 먹음). a가 하위면 a.size >= b.size × stageOverride일 때만 true.
- eatPair(a, b, opts): 두 원이 겹치고 한쪽이 다른 쪽을 먹을 수 있으면 [먹는 쪽, 먹히는 쪽], 아니면 null. 둘 다 먹을 수 없으면 null.
- preyValue({ size, stage, grade, special, killedByTreasure }): CONFIG.score 공식(base × (size/sizeRef)^sizeExp × stageMult[stage] × gradeMultiplier(grade) × treasureMult(보물 처치 시) × special.rewardMult(특수 시)), 반올림, 최소 1.
- 테스트: 규칙 표(같은 단계/상위/하위 2배 경계), 그리고 '크기 60 3단계 하나 > 크기 20 1단계 10개' 같은 점수 성질.
2) 적 = 플레이어와 같은 구조 (enemy.js)
- 생성자 Enemy(scene, pos, size, dir, stage): stage 1이면 형태 'mimul'에 방위 색 텍스처(drawCreature(scene, 'mimul', { dir }) — Codex가 creature.js에 구현 중. 아직 없으면 기본 미물로 보여도 동작은 해야 한다), 2·3이면 해당 단계·방위 형태 중 무작위. 필드: stage, grade(evolution.rollGrade(0)), yoryeok=0, diet={east,west,south,north}, bodyLevel=0, special(3단계만 rollSpecial).
- 적이 먹을 때(eat): 면적 성장(기존) + yoryeok += preyValue(먹힌 쪽 정보) + diet[먹힌 쪽 dir] += 크기. 그 뒤 autoProgress():
  · stage<3이고 yoryeok >= evolutionCost(stage+1)이면 진화: 다음 단계 형태 중(1→2는 식성 1위 방위의 새끼, 2→3은 같은 방위의 3단계 3종 중 식성/무작위) 선택, 텍스처 교체, 크기 = levelUp.evolveResetSize × evolveJitter 범위, yoryeok에서 비용 차감, diet 초기화, grade 다시 굴림, 3단계가 되면 special 다시 굴림. dir은 새 형태의 방위.
  · 아니면 yoryeok >= levelUp 몸집 비용(bodyBaseCost × bodyCostGrowth^bodyLevel)이면 크기 × bodyMult, bodyLevel++, 비용 차감.
- step의 추격/도망 판단, 먹기 판정은 rules.canEat/eatPair로 바꾼다(enemyAI.js의 choose·stillValid·findMeals 포함). 플레이어도 actor로 같은 규칙(플레이어 객체에 stage가 있다고 가정, Opus가 player.stage를 설정한다).
3) world.js: export function spawnStage(playerStage, rng) — config.enemy.stageWeights[playerStage]로 1·2·3단계 선택. 기존 spawnSize는 그대로(크기). PlayScene의 spawn에서 쓸 호출을 보고에 적어라(예: new Enemy(this, pos, size, dir, spawnStage(this.player.stage))).
- 성능: 적 72마리 × 템포 3배 × 프레임 분할. 매 단계 O(n) 위주로.