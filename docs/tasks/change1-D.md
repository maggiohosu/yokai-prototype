저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md, docs/plan.md(특히 맨 아래 '변경 이력')를 먼저 읽고 관련 코드를 파악하라.
다른 Sonnet 에이전트 2명이 동시에 다른 부분을 고치고 있다. 아래 '고쳐도 되는 파일'만 고쳐라. **src/scenes/PlayScene.js는 절대 고치지 마라**(Opus가 마지막에 연결한다). PlayScene에서 바뀌어야 할 호출이 있으면 보고에 정확한 코드로 적어라.
src/config.js는 지정된 섹션만, 작은 Edit로 고친다(동시 수정 충돌 시 다시 읽고 재시도).
원칙: 수치는 설정값에 둔다. 확률·결과를 먼저 정하고 연출은 보여주기만 한다. 휴대폰 60fps.
끝나면 node --test "tests/*.test.mjs" 전부 통과 확인, 모든 src 모듈 node --check. git commit 금지. 바꾼 파일·새 API·PlayScene에 필요한 변경·한계를 한국어로 짧게 보고.

담당 D: 적이 자기보다 작은 적을 쫓아가 먹기 + 특수 적의 발사체
**새 파일만** 만든다: src/game/enemyAI.js, src/game/enemyFire.js, tests/enemyAI.test.mjs(가능하면). src/config.js에는 enemy 섹션 '안에' 넣지 말고 새 최상위 섹션 hunt와 special만 추가한다. src/game/enemy.js·PlayScene.js·world.js는 다른 에이전트/Opus 담당이니 고치지 마라(연결 방법을 보고에 정확히 적어라).
1) enemyAI.js
- export function buildGrid(actors, cell) / queryGrid(grid, x, y, r): 간단한 공간 해시(적 70~80마리, 매 프레임 여러 번 호출해도 가볍게).
- export function pickIntent(enemy, player, grid, cfg) → { mode: 'flee'|'chase'|'wander', target } :
  감지 거리(cfg.detect) 안에서 '나를 먹을 수 있는' 상대(플레이어 포함, 크기 비율 CONFIG.eating.ratio 이상 큰 것)가 있으면 가장 가까운 것에게서 도망(flee).
  없으면 '내가 먹을 수 있는' 상대(플레이어 포함) 중 가장 가까운 것을 추격(chase). 플레이어를 우선할지 가중치(cfg.playerBias)로 조절.
  둘 다 없으면 배회. 표적 재선택은 cfg.retargetSeconds마다(떨림 방지). 역전(enemy.reversed && fleeTime>0)이면 플레이어에게서 도망 유지.
- 순수 함수에 가깝게(Phaser 의존 없음) → node 테스트 가능.
2) enemyFire.js — 특수 적
- export function rollSpecial(size, stage, rng) → bool: 3단계(큰) 적 중 config.special.chance(예 0.3)만 특수.
- export class EnemyFire { constructor(scene); tryFire(enemy, player, dt) — 특수 적이 사거리(config.special.range) 안에 플레이어가 있으면 config.special.cooldown마다 플레이어 쪽으로 구슬 1발(약간 예측 조준 가능). step(dt, player) → 이번 프레임에 플레이어를 맞힌 피해 목록 반환(피해 = 플레이어 크기 × config.special.damageRatio, 최소 config.special.minDamage). draw(graphics) — 적 구슬은 붉은 보랏빛(플레이어 구슬과 확실히 구분), 꼬리. 구슬 상한 config. destroy(). }
- 특수 적 표시: export function drawSpecialMark(graphics, enemy, t) — 적 둘레에 붉은 점선 고리(돌아가는). 
- 플레이어가 맞으면 크기가 줄고, config.special.deathSize(시작 크기의 절반 등) 아래로 줄면 판 종료가 되도록 Opus가 연결한다 — 그 판단 함수 export function isFatal(playerSize) 제공.
3) config.hunt: { detect, playerBias, retargetSeconds }, config.special: { chance, range, cooldown, orbSpeed, orbRadius, damageRatio, minDamage, maxOrbs, deathSize } — 속도·쿨타임은 '템포 1배' 기준 값으로 쓴다(Opus가 전역 tempo 3을 곱한다).