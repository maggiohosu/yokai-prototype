import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Enemy } from '../src/game/enemy.js';
import { buildGrid, findMeals } from '../src/game/enemyAI.js';
import { EnemyFire } from '../src/game/enemyFire.js';
import {
  STATUS_FIELDS, applyBurn, applyMark, applySlow, burnDamage, cannotEatPlayer, createRateGate, eatBlocked, fireBlocked, initStatus,
  inGrace, isAlly, isDisabled, isFeared, isFrozen, isShielded, isStunned, nowOf, simSeconds, slowFactor, takeRate, tryCharm,
  tryFear, tryFreeze, tryKnock,
} from '../src/game/status.js';

// Phaser 없이 Enemy를 만드는 가짜 scene. simTime·pace는 시험이 직접 만진다.
function fakeScene(extra = {}) {
  const sprite = (x, y, key) => {
    const sp = {
      x, y, key, active: true, scaleX: 1, setOrigin: () => sp, setFlipX: () => sp,
      setDisplaySize(w) { sp.scaleX = w; return sp; },
      setTexture(k) { sp.key = k; return sp; },
      destroy() { sp.active = false; },
    };
    return sp;
  };
  return { simTime: 0, pace: 1, textures: { exists: () => true }, add: { image: (x, y, key) => sprite(x, y, key) }, ...extra };
}
const makeEnemy = (scene, size = 40, dir = 'east', stage = 2, x = 500, y = 500) => new Enemy(scene, { x, y }, size, dir, stage);
const player = (x, y, size = 28, stage = 1) => ({ x, y, size, stage, sprite: { active: true } });

test('적을 만들면 상태 필드가 모두 숫자·불리언으로 채워진다(프레임마다 새 속성이 생기지 않는다)', () => {
  const e = makeEnemy(fakeScene());
  for (const [key, value] of Object.entries(STATUS_FIELDS)) assert.strictEqual(e[key], value, key);
  assert.equal(typeof e.frozenUntil, 'number');
  assert.equal(e.slowMult, 1);
  assert.ok(Object.isFrozen(STATUS_FIELDS));
  const plain = initStatus({});
  assert.equal(plain.charmUntil, 0);
});

test('simSeconds: 화면 초를 템포 × 속도 곡선으로 바꾼다. 가짜 씬은 pace 1', () => {
  assert.equal(simSeconds(2, { pace: 1.5 }), 2 * CONFIG.tempo * 1.5);
  assert.equal(simSeconds(1, {}), CONFIG.tempo);
  assert.equal(simSeconds(1, null), CONFIG.tempo);
  assert.equal(nowOf({ simTime: 7 }), 7);
  assert.equal(nowOf(undefined), 0);
});

test('속도 곡선이 1/3~1.5로 달라도 눈에 보이는 지속은 같다', () => {
  for (const pace of [1 / 3, 1, 1.5]) {
    const scene = { pace };
    const duration = simSeconds(1.6, scene);
    // 한 프레임(1/60초 화면 시간)의 시뮬레이션 시간 = (1/60) × 템포 × pace
    const frameSim = (1 / 60) * CONFIG.tempo * pace;
    assert.ok(Math.abs(duration / frameSim - 96) < 1e-9, '1.6초 = 96프레임, pace ' + pace);
  }
});

test('빙결: 걸리면 지속 동안 얼고, 끝난 뒤 면역 동안 다시 안 걸리며, 지속 중 다시 맞아도 늘어나지 않는다', () => {
  const e = initStatus({});
  assert.equal(tryFreeze(e, 10, 2, 4), true);
  assert.equal(isFrozen(e, 10), true);
  assert.equal(isFrozen(e, 11.9), true);
  assert.equal(isFrozen(e, 12), false);
  assert.equal(tryFreeze(e, 11, 2, 4), false, '지속 중 다시 맞아도 안 늘어난다');
  assert.equal(e.frozenUntil, 12);
  assert.equal(tryFreeze(e, 15.9, 2, 4), false, '끝난 뒤 면역(12~16) 동안은 안 걸린다');
  assert.equal(tryFreeze(e, 16, 2, 4), true);
  assert.equal(e.frozenUntil, 18);
});

test('위협: 지속·면역이 빙결과 같은 규칙, 겁먹은 동안 아무것도 먹지 못한다', () => {
  const e = initStatus({});
  assert.equal(tryFear(e, 0, 1, 2), true);
  assert.equal(isFeared(e, 0.5), true);
  assert.equal(eatBlocked(e, 0.5), true);
  assert.equal(eatBlocked(e, 1.01), false);
  assert.equal(tryFear(e, 2.9, 1, 2), false);
  assert.equal(tryFear(e, 3, 1, 2), true);
  assert.equal(isDisabled(e, 3.5), false, '겁먹은 적은 움직인다(도망)');
});

test('빙결·경직·위협은 먹기를 막고, 아군·유예는 나를 먹지 못한다', () => {
  const e = initStatus({});
  tryFreeze(e, 0, 5, 1);
  assert.equal(isDisabled(e, 1), true);
  assert.equal(eatBlocked(e, 1), true);
  assert.equal(cannotEatPlayer(e, 1), true);
  assert.equal(fireBlocked(e, 1), true);
  const stunned = initStatus({});
  tryKnock(stunned, 0, 1, 0, 0.5, 2, 1);
  assert.equal(isStunned(stunned, 1), true);
  assert.equal(isDisabled(stunned, 1), true);
  assert.equal(eatBlocked(stunned, 1), true);
  const ally = initStatus({});
  tryCharm(ally, 0, 2, 1, 1.5);
  assert.equal(cannotEatPlayer(ally, 1), true);
  assert.equal(fireBlocked(ally, 1), true, '매혹된 특수 적은 쏘지 않는다');
  assert.equal(eatBlocked(ally, 1), false, '아군은 다른 요괴를 먹는다');
  const free = initStatus({});
  assert.equal(cannotEatPlayer(free, 1), false);
  assert.equal(fireBlocked(free, 1), false);
});

test('작열: 다시 맞으면 시간은 새로 고치고 초당 피해는 큰 값', () => {
  const e = initStatus({});
  applyBurn(e, 0, 3, 2);
  assert.equal(burnDamage(e, 1, 0.5), 1, '초당 2 × 0.5초');
  applyBurn(e, 1, 3, 1);
  assert.equal(e.burnUntil, 4);
  assert.equal(e.burnDps, 2, '작은 값으로는 줄지 않는다');
  applyBurn(e, 2, 3, 5);
  assert.equal(e.burnDps, 5);
  assert.equal(burnDamage(e, 5.01, 1), 0, '끝나면 피해 없음');
  applyBurn(e, 10, 1, 1);
  assert.equal(e.burnDps, 1, '다 꺼진 뒤 새로 걸면 새 값');
});

test('파사인: 중첩 없이 시간만 새로 고친다', () => {
  const e = initStatus({});
  applyMark(e, 0, 2, 0.2, false);
  applyMark(e, 1, 2, 0.2, true);
  assert.equal(e.markUntil, 3);
  assert.equal(e.markAmp, 0.2, '+20%가 두 번 쌓이지 않는다');
  assert.equal(e.markLure, true);
});

test('선무 둔화: 겹치면 더 센 쪽, 구름을 벗어나면 풀린다', () => {
  const e = initStatus({});
  assert.equal(slowFactor(e, 0), 1);
  applySlow(e, 0, 1, 0.8);
  applySlow(e, 0.1, 1, 0.6);
  applySlow(e, 0.2, 1, 0.9);
  assert.equal(slowFactor(e, 0.5), 0.6);
  assert.equal(slowFactor(e, 1.3), 1, '구름 밖에서 시간이 지나면 풀린다');
});

test('대풍 밀림: 재밀기 대기 동안은 안 밀리고, 경직이 겹치면 긴 쪽', () => {
  const e = initStatus({});
  assert.equal(tryKnock(e, 0, 100, 0, 0.5, 1, 2), true);
  assert.equal(e.knockUntil, 0.5);
  assert.equal(e.stunUntil, 1);
  assert.equal(tryKnock(e, 1.9, 100, 0, 0.5, 1, 2), false);
  assert.equal(tryKnock(e, 2, 100, 0, 0.5, 0.2, 2), true);
  assert.equal(e.stunUntil, 2.2);
});

test('매혹 상태: 아군 → 풀린 뒤 유예 → 면역 순서, 이미 아군·유예·면역이면 못 건다', () => {
  const e = initStatus({ reversed: true });
  assert.equal(tryCharm(e, 0, 2, 1, 1.5), true);
  assert.equal(e.reversed, false, '걸 때 역전을 지운다');
  assert.equal(isAlly(e, 1), true);
  assert.equal(isShielded(e, 1), true);
  assert.equal(inGrace(e, 1), false);
  assert.equal(tryCharm(e, 1, 2, 1, 1.5), false, '아군은 다시 걸지 않는다');
  assert.equal(isAlly(e, 2), false);
  assert.equal(inGrace(e, 2.5), true);
  assert.equal(isShielded(e, 2.5), true, '유예 동안은 서로 먹지 않는다');
  assert.equal(inGrace(e, 3), false);
  assert.equal(isShielded(e, 3.01), false);
  assert.equal(tryCharm(e, 3.4, 2, 1, 1.5), false, '풀린 뒤 1.5초 동안 다시 매혹되지 않는다');
  assert.equal(tryCharm(e, 3.5, 2, 1, 1.5), true);
});

test('초당 횟수 상한: 한 칸 안에서 limit번까지, 칸이 지나면 다시', () => {
  const gate = createRateGate(3);
  assert.equal(takeRate(gate, 0, 1), true);
  assert.equal(takeRate(gate, 0.1, 1), true);
  assert.equal(takeRate(gate, 0.2, 1), true);
  assert.equal(takeRate(gate, 0.3, 1), false);
  assert.equal(takeRate(gate, 0.99, 1), false);
  assert.equal(takeRate(gate, 1.0, 1), true);
});

test('카드로 멈춘 동안 시뮬레이션 시계가 서면 효과도 서 있다', () => {
  const e = initStatus({});
  tryFreeze(e, 100, 2, 1);
  applyBurn(e, 100, 2, 1);
  // 시계가 100에 멈춘 채로 실제 시간이 아무리 지나도(= isFrozen에 같은 now를 계속 넣어도) 효과는 그대로다.
  for (let i = 0; i < 1000; i++) {
    assert.equal(isFrozen(e, 100), true);
    assert.equal(e.burnUntil > 100, true);
  }
  assert.equal(isFrozen(e, 102.001), false, '시계가 다시 흐르면 정해진 시간 뒤에 풀린다');
});

test('Enemy.step: 얼면 안 움직이고 녹으면 다시 움직인다', () => {
  const scene = fakeScene();
  const e = makeEnemy(scene, 30, 'east', 2, 500, 500);
  const me = player(2000, 2000);
  const grid = buildGrid([e], CONFIG.hunt.detect);
  tryFreeze(e, 0, 1, 0);
  const x0 = e.x, y0 = e.y;
  for (let i = 0; i < 30; i++) { scene.simTime += 1 / 60; e.step(me, 1 / 60, grid); }
  assert.equal(e.x, x0);
  assert.equal(e.y, y0);
  assert.equal(e.vx, 0);
  scene.simTime = 5;
  e.wanderAngle = 0;
  e.wanderTime = 10;
  for (let i = 0; i < 30; i++) { scene.simTime += 1 / 60; e.step(me, 1 / 60, grid); }
  assert.notEqual(e.x, x0, '녹으면 움직인다');
});

test('Enemy.step: 빙결 중에도 대풍에는 밀리고, 경직 중에는 스스로 못 움직인다', () => {
  const scene = fakeScene();
  const e = makeEnemy(scene, 30, 'east', 2, 500, 500);
  const me = player(2000, 2000);
  const grid = buildGrid([e], CONFIG.hunt.detect);
  tryKnock(e, 0, 200, 0, 0.5, 1, 0);
  const x0 = e.x;
  for (let i = 0; i < 30; i++) { scene.simTime += 1 / 60; e.step(me, 1 / 60, grid); }
  assert.ok(Math.abs(e.x - (x0 + 100)) < 5, '0.5초 × 200 = 약 100만큼 밀린다: ' + (e.x - x0));
  assert.equal(e.vx, 0);
  // 경직은 0~1초. 밀림(0.5초) 뒤 남은 0.5초 동안은 스스로 움직이지 않는다(위 루프가 이미 0.5초를 썼으므로 0.4초만 더 본다).
  const stopped = e.x;
  for (let i = 0; i < 24; i++) { scene.simTime += 1 / 60; e.step(me, 1 / 60, grid); }
  assert.ok(Math.abs(e.x - stopped) < 1e-9, '경직 중에는 움직이지 않는다: ' + (e.x - stopped));
});

test('Enemy.step: 선무 둔화는 속도를 줄인다', () => {
  const run = (slow) => {
    const scene = fakeScene();
    const e = makeEnemy(scene, 30, 'east', 2, 500, 500);
    e.wanderAngle = 0;
    e.wanderTime = 100;
    e.vx = 0;
    const me = player(3000, 3000);
    const grid = buildGrid([e], CONFIG.hunt.detect);
    if (slow) applySlow(e, 0, 100, 0.5);
    for (let i = 0; i < 60; i++) { scene.simTime += 1 / 60; e.step(me, 1 / 60, grid); }
    return e.x - 500;
  };
  const fast = run(false), slowed = run(true);
  assert.ok(slowed > 0 && slowed < fast * 0.6, `둔화 ${slowed} < 보통 ${fast}의 60%`);
});

test('Enemy.push: 방향 뒤집기 없이 월드 안에서만 움직인다', () => {
  const e = makeEnemy(fakeScene(), 30, 'east', 2, 500, 500);
  e.push(10, -5);
  assert.equal(e.x, 510);
  assert.equal(e.y, 495);
  e.push(-1e6, 1e6);
  assert.equal(e.x, 30);
  assert.equal(e.y, CONFIG.world.size - 30);
});

test('빙결·위협 중인 사냥꾼은 다른 요괴를 먹지 못한다(findMeals)', () => {
  const A = (x, y, size, extra = {}) => initStatus({ x, y, size, stage: 1, sprite: { active: true }, ...extra });
  const big = A(100, 100, 40), small = A(120, 100, 10);
  assert.equal(findMeals(buildGrid([big, small], 64), undefined, 0).length, 1);
  tryFreeze(big, 0, 5, 0);
  assert.equal(findMeals(buildGrid([big, small], 64), undefined, 1).length, 0, '얼면 못 먹는다');
  const big2 = A(100, 100, 40), small2 = A(120, 100, 10);
  tryFear(big2, 0, 5, 0);
  assert.equal(findMeals(buildGrid([big2, small2], 64), undefined, 1).length, 0, '겁먹으면 못 먹는다');
  assert.equal(findMeals(buildGrid([big2, small2], 64), undefined, 6).length, 1, '풀리면 먹는다');
  assert.equal(findMeals(buildGrid([big2, small2], 64)).length, 1, 'now를 안 주면 예전과 같다');
});

test('빙결·경직·아군인 특수 적은 쏘지 않고 쿨타임도 줄지 않는다', () => {
  const fire = new EnemyFire(null);
  const target = player(200, 0);
  const sp = initStatus({ x: 0, y: 0, size: 40, special: true, fireCd: 0, stage: 3, sprite: { active: true } });
  tryFreeze(sp, 0, 5, 0);
  assert.equal(fire.tryFire(sp, target, 0.1, 1), false);
  assert.equal(sp.fireCd, 0, '얼어 있는 동안 쿨타임이 줄지 않는다');
  assert.equal(fire.tryFire(sp, target, 0.1, 6), true, '녹으면 쏜다');
  const ally = initStatus({ x: 0, y: 0, size: 40, special: true, fireCd: 0, stage: 3, sprite: { active: true } });
  tryCharm(ally, 0, 5, 1, 1.5);
  assert.equal(fire.tryFire(ally, target, 0.1, 1), false, '매혹된 특수 적은 안 쏜다');
});

test('4·5단계 특수 적 구슬은 그 줄기의 모양 키를 달고, 3단계는 예전 그대로', () => {
  const fire = new EnemyFire(null);
  const target = player(200, 0);
  const five = initStatus({ x: 0, y: 0, size: 40, special: true, fireCd: 0, stage: 5, formId: 'cheongnyong', sprite: { active: true } });
  fire.tryFire(five, target, 0, 0);
  assert.equal(fire.orbs[0].style, 'E1');
  assert.equal(fire.orbs[0].tier, 5);
  const four = initStatus({ x: 0, y: 0, size: 40, special: true, fireCd: 0, stage: 4, formId: 'gumiho', sprite: { active: true } });
  fire.tryFire(four, target, 0, 0);
  assert.equal(fire.orbs[1].style, 'E2');
  const three = initStatus({ x: 0, y: 0, size: 40, special: true, fireCd: 0, stage: 3, formId: 'imugi', sprite: { active: true } });
  fire.tryFire(three, target, 0, 0);
  assert.equal(fire.orbs[2].style, null);
});

test('EnemyFire.step: 방패가 막은 구슬은 사라져 플레이어를 맞히지 못한다', () => {
  const fire = new EnemyFire(null);
  fire.orbs.push({ x: 0, y: 0, vx: 1000, vy: 0, life: 5, style: null });
  let blocks = 0;
  const shield = { block: () => { blocks++; return true; } };
  const hits = fire.step(0.1, player(60, 0), shield);
  assert.equal(hits.length, 0);
  assert.equal(blocks, 1);
  assert.equal(fire.orbs.length, 0);
  fire.orbs.push({ x: 0, y: 0, vx: 1000, vy: 0, life: 5, style: null });
  assert.equal(fire.step(0.1, player(60, 0), { block: () => false }).length, 1, '못 막으면 맞는다');
});

// ---- PlayScene: 시뮬레이션 시계(simTime)는 계산 단계가 돌 때만 흐르고, 카드로 멈춘 동안에는 선다 ----
globalThis.Phaser ??= { Scene: class {} };
const { PlayScene } = await import('../src/scenes/PlayScene.js');
const { createBooster } = await import('../src/game/booster.js');

function sceneCtx(extra = {}) {
  const calls = { combat: 0, tryFire: [] };
  const ctx = {
    simTime: 0, pace: 1, ended: false, paused: false, stress: null, preview: true, fireRequested: false,
    booster: createBooster(), boostHeld: false, boostSec: 0, boostMult: 1, boostFx: { active: false, clock: 0 },
    enemies: [],
    player: { x: 0, y: 0, size: 10, stage: 1, step() {} },
    combat: { step(_d, _h, _fire, grid) { calls.combat++; calls.grid = grid; }, cooldown: 0 },
    enemyFire: { step: () => [], tryFire: (_e, _p, _h, now) => { calls.tryFire.push(now); } },
    resolveMeals() {}, applyEnemyHits() {},
    ...extra,
  };
  return { ctx, calls };
}

test('simulate: 계산 단계마다 simTime이 단계 길이만큼 흐르고 combat에 격자를 넘긴다', () => {
  const { ctx, calls } = sceneCtx();
  const sim = 0.0975;
  PlayScene.prototype.simulate.call(ctx, sim, { x: 0, y: 0 });
  assert.ok(Math.abs(ctx.simTime - sim) < 1e-12, '프레임 한 번의 시뮬레이션 시간만큼');
  assert.equal(calls.combat, Math.ceil(sim / CONFIG.render.maxStep));
  assert.ok(calls.grid?.buckets, '격자 조회용 grid를 넘긴다');
});

test('simulate: 특수 적 발사에 지금 시뮬레이션 시각을 넘긴다(빙결·매혹 중 발사 정지에 쓰인다)', () => {
  const sp = initStatus({ special: true, x: 0, y: 0, size: 5, stage: 3, sprite: { active: true }, step() {} });
  const { ctx, calls } = sceneCtx({ enemies: [sp] });
  PlayScene.prototype.simulate.call(ctx, 0.02, { x: 0, y: 0 });
  assert.ok(calls.tryFire.length > 0);
  assert.equal(calls.tryFire.at(-1), ctx.simTime);
});

test('tick: 카드로 멈춘 동안(paused)에는 계산이 돌지 않아 simTime이 서고 효과 타이머도 서 있다', () => {
  const e = initStatus({});
  const { ctx } = sceneCtx({ paused: true });
  tryFreeze(e, ctx.simTime, 2, 0); // 지금부터 시뮬레이션 2초 동안 얼음
  ctx.simulate = () => { throw new Error('멈춘 동안에는 simulate가 불리면 안 된다'); };
  for (let i = 0; i < 100; i++) PlayScene.prototype.tick.call(ctx, 16); // 실제 시간이 아무리 흘러도
  assert.equal(ctx.simTime, 0);
  assert.equal(isFrozen(e, ctx.simTime), true, '시계가 서 있으면 얼음도 그대로');
});
