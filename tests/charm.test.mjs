import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CONFIG } from '../src/config.js';
import { Enemy } from '../src/game/enemy.js';
import { buildGrid, findMeals, intentDirection, pickIntent } from '../src/game/enemyAI.js';
import { attachSession, mealYoryeok } from '../src/game/session.js';
import { cannotEatPlayer, initStatus, inGrace, isAlly, isShielded, simSeconds, tryCharm } from '../src/game/status.js';
import { createProgress } from '../src/systems/progress.js';
import { preyInfoOf, preyValue } from '../src/systems/rules.js';
import { fakeEnemy, fakePlayer, makeWorld, shotDamage } from './fixtures-abilities.mjs';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const cfg = CONFIG.hunt;
const E = (x, y, size = 30, stage = 2, extra = {}) => fakeEnemy(x, y, size, { stage, ...extra });
const sim = (w, sec) => simSeconds(sec, w.scene);

// AI 시험용 단순 개체(플레이어 포함)
const A = (x, y, size, extra = {}) => initStatus({ x, y, size, stage: 1, sprite: { active: true }, ...extra });
const ally = (x, y, size, extra = {}) => A(x, y, size, { charmUntil: 1e9, charmDur: 1e9, charmGraceUntil: 1e9 + 100, ...extra });

// ---- 걸기 ----
test('매혹: 맞은 적이 지속 T(2단계 2.5초) 동안 내 편이 되고 역전이 지워진다. 특수 적도 걸린다', () => {
  const a = E(1010, 1000, 40, 2, { reversed: true, special: true });
  const w = makeWorld({ formId: 'juyu', level: 0, enemies: [a] });
  const S = shotDamage(w);
  w.shoot(1);
  assert.ok(isAlly(a, w.scene.simTime));
  assert.ok(close(a.charmUntil - w.scene.simTime, sim(w, 2.5), 1e-9));
  assert.equal(a.reversed, false);
  assert.ok(close(a.size, 40 - S), '그 구슬의 피해는 그대로 들어간다');
  assert.ok(close(a.charmGraceUntil - a.charmUntil, sim(w, 1.0), 1e-9), '풀린 뒤 유예 1.0초');
  assert.ok(close(a.charmImmuneUntil - a.charmUntil, sim(w, 1.5), 1e-9), '풀린 뒤 면역 1.5초');
  assert.equal(w.combat.counters.charm, 1);
});

test('매혹 지속: 레벨 15는 ×1.6, 상위 단계 적은 단계 차마다 절반', () => {
  const dur = (level, enemyStage) => {
    const a = E(1010, 1000, 400, enemyStage);
    const w = makeWorld({ formId: 'juyu', level, enemies: [a] });
    w.combat.cooldown = 0;
    w.shoot(1);
    return (a.charmUntil - w.scene.simTime) / sim(w, 1);
  };
  assert.ok(close(dur(0, 2), 2.5, 1e-9));
  assert.ok(close(dur(15, 2), 4.0, 1e-9), '2.5 × 1.6');
  assert.ok(close(dur(0, 3), 1.25, 1e-9), 'Δ=1');
  assert.ok(close(dur(0, 4), 0.625, 1e-9), 'Δ=2');
  assert.ok(close(dur(0, 5), 0.3125, 1e-9), 'Δ=3');
});

test('매혹 재사용 대기·동시 아군 상한: 대기 중이거나 상한이면 걸지 않고, 상한일 때는 대기도 쓰지 않는다', () => {
  const a = E(1010, 1000, 100, 3), b = E(1010, 1000, 100, 3), c = E(1010, 1000, 100, 3);
  const w = makeWorld({ formId: 'hillFox', level: 0, enemies: [a, b, c] }); // 3단계: 아군 2, 대기 2.2초
  w.combat.refreshAbility();
  assert.equal(w.combat.ab.allies, 2);
  const ab = w.combat.ab;
  const now = () => w.scene.simTime;
  assert.equal(w.combat.tryCharmEnemy(a, ab, 0, now()), true);
  assert.equal(w.combat.tryCharmEnemy(b, ab, 0, now()), false, '대기 중');
  assert.equal(b.charmUntil, 0);
  w.scene.simTime += sim(w, 2.3);
  assert.equal(w.combat.tryCharmEnemy(b, ab, 0, now()), true);
  a.charmUntil = b.charmUntil = 1e9; // 둘 다 아직 아군이다
  const ready = w.combat.charmReadyAt;
  w.scene.simTime += sim(w, 2.3);
  assert.equal(w.combat.tryCharmEnemy(c, ab, 0, now()), false, '아군 2마리가 상한');
  assert.equal(w.combat.charmReadyAt, ready, '상한이면 대기도 쓰지 않는다');
  a.charmUntil = 0; // 한 마리가 풀리면 다시 걸 수 있다
  assert.equal(w.combat.tryCharmEnemy(c, ab, 0, now()), true);
});

test('매혹: 면역(풀린 뒤 1.5초)인 적은 다시 안 걸리고 대기도 쓰지 않는다', () => {
  const a = E(1010, 1000, 100, 2);
  const w = makeWorld({ formId: 'juyu', level: 0, enemies: [a] });
  w.shoot(1);
  const end = a.charmUntil;
  w.scene.simTime = end + sim(w, 1.2);
  const ready = w.combat.charmReadyAt;
  w.combat.charmReadyAt = 0;
  w.shoot(1);
  assert.equal(a.charmUntil, end, '유예(1.0초)가 끝나도 면역 1.5초 안에는 안 걸린다');
  assert.equal(w.combat.charmReadyAt, 0, '못 걸었으면 대기도 안 쓴다');
  assert.ok(ready > 0);
  w.scene.simTime = end + sim(w, 1.6);
  w.shoot(1);
  assert.ok(a.charmUntil > end, '면역이 끝나면 다시 걸린다');
});

test('상위 단계 적에게 매혹 지속이 너무 짧아지면(0.15초 미만) 걸지 않는다', () => {
  // 1단계 매혹은 없으므로 표를 직접: 2단계 2.5 × 0.5^3 = 0.3125 ≥ 0.15(걸림), 상한까지 가도 4단계 차는 없다.
  const a = E(1010, 1000, 400, 5);
  const w = makeWorld({ formId: 'juyu', level: 0, enemies: [a] });
  w.shoot(1);
  assert.ok(a.charmUntil > 0, 'Δ=3은 0.3125초라 걸린다');
});

// ---- AI ----
test('아군은 플레이어를 위협으로도 먹이로도 보지 않는다(플레이어가 아주 작아도 쫓지 않고, 아주 커도 도망가지 않는다)', () => {
  const me = ally(500, 500, 40);
  const tiny = A(540, 500, 10), huge = A(540, 500, 400);
  for (const p of [tiny, huge]) {
    const i = pickIntent(me, p, buildGrid([me], 64), cfg, 1, 0);
    assert.notEqual(i.target, p, '플레이어를 대상으로 삼지 않는다 ' + p.size);
    assert.equal(i.mode, 'wander');
  }
});

test('아군은 감지 거리 × 1.2 안에서 자기가 먹을 수 있는 가장 가까운 적을 쫓는다', () => {
  const me = ally(500, 500, 40);
  const near = A(600, 500, 15), far = A(800, 500, 15), tooFar = A(500 + cfg.detect * 1.2 + 50, 500, 10);
  const player = A(500, 520, 28);
  const intent = pickIntent(me, player, buildGrid([me, near, far, tooFar], 64), cfg, 1, 0);
  assert.equal(intent.mode, 'chase');
  assert.strictEqual(intent.target, near);
  assert.ok(intentDirection(me, intent).x > 0);
  const lonely = ally(500, 500, 40);
  const none = pickIntent(lonely, player, buildGrid([lonely, tooFar], 64), cfg, 1, 0);
  assert.equal(none.mode, 'wander', '감지 거리 밖은 안 본다');
});

test('아군은 자기를 먹을 수 있는 적에게서 도망한다(먹이보다 우선)', () => {
  const me = ally(500, 500, 30);
  const big = A(580, 500, 80), small = A(430, 500, 10);
  const intent = pickIntent(me, A(0, 0, 28), buildGrid([me, big, small], 64), cfg, 1, 0);
  assert.equal(intent.mode, 'flee');
  assert.strictEqual(intent.target, big);
});

test('아군은 쫓을 것이 없고 플레이어와 260 이상 떨어지면 플레이어 쪽으로 돌아온다(목줄)', () => {
  const player = A(1000, 500, 28);
  const far = ally(500, 500, 40);
  const back = pickIntent(far, player, buildGrid([far], 64), cfg, 1, 0);
  assert.equal(back.mode, 'follow');
  assert.strictEqual(back.target, player);
  assert.ok(intentDirection(far, back).x > 0, '플레이어 쪽으로');
  const close1 = ally(900, 500, 40);
  assert.equal(pickIntent(close1, player, buildGrid([close1], 64), cfg, 1, 0).mode, 'wander');
});

test('아군은 다른 아군을 먹이로 보지 않는다. 다른 적은 아군을 평범한 요괴로 본다', () => {
  const a = ally(500, 500, 40), b = ally(560, 500, 15);
  const player = A(500, 540, 28); // 가까이 있으니 목줄도 없다
  assert.equal(pickIntent(a, player, buildGrid([a, b], 64), cfg, 1, 0).mode, 'wander', '아군끼리는 안 쫓는다');
  const hunter = A(500, 500, 60), pet = ally(560, 500, 15);
  const intent = pickIntent(hunter, A(3000, 3000, 28), buildGrid([hunter, pet], 64), cfg, 1, 0);
  assert.equal(intent.mode, 'chase');
  assert.strictEqual(intent.target, pet, '큰 적이 아군을 쫓는다');
});

test('아군은 닿은 작은 적을 먹고, 얼거나 겁먹은 사냥꾼은 못 먹는다(findMeals)', () => {
  const me = ally(100, 100, 40), prey = A(120, 100, 10);
  const meals = findMeals(buildGrid([me, prey], 64), undefined, 0);
  assert.equal(meals.length, 1);
  assert.strictEqual(meals[0][0], me);
});

test('풀리면 유예 1.0초 동안 플레이어에게서 도망 의도로 있고, 끝나면 평소 AI로 돌아간다', () => {
  const player = A(540, 500, 28);
  const e = A(500, 500, 40, { charmUntil: 10, charmGraceUntil: 20, charmImmuneUntil: 30, stage: 2 });
  // 아군 동안: 플레이어를 보지 않는다
  assert.notEqual(pickIntent(e, player, buildGrid([e], 64), cfg, 0.5, 5).target, player);
  // 유예 동안: 가까워도 멀어도 플레이어에게서 도망
  const grace = pickIntent(e, player, buildGrid([e], 64), cfg, 0.5, 12);
  assert.equal(grace.mode, 'flee');
  assert.strictEqual(grace.target, player);
  assert.ok(intentDirection(e, grace).x < 0, '플레이어 반대쪽');
  assert.ok(inGrace(e, 12));
  assert.equal(isShielded(e, 12), true);
  const farPlayer = A(3000, 3000, 28);
  assert.equal(pickIntent(e, farPlayer, buildGrid([e], 64), cfg, 0.5, 15).mode, 'flee', '멀어도 도망(거리와 상관없이)');
  // 유예가 끝나면 예전 의도를 버리고 평소처럼(플레이어가 먹이면 쫓는다)
  const after = pickIntent(e, player, buildGrid([e], 64), cfg, 0.01, 21);
  assert.equal(after.mode, 'chase', '크기 40 > 28 × 1.1이라 평소처럼 플레이어를 먹으러 온다');
  assert.equal(after.forced, undefined);
});

test('위협(겁먹음) 중인 적은 거리와 상관없이 플레이어에게서 도망한다', () => {
  const player = A(540, 500, 28);
  const e = A(500, 500, 100, { stage: 2, fearUntil: 10 });
  const intent = pickIntent(e, player, buildGrid([e], 64), cfg, 0.5, 5);
  assert.equal(intent.mode, 'flee');
  assert.strictEqual(intent.target, player);
  const next = pickIntent(e, A(3000, 3000, 28), buildGrid([e], 64), cfg, 0.5, 6);
  assert.equal(next.mode, 'flee');
  assert.equal(pickIntent(e, player, buildGrid([e], 64), cfg, 0.5, 11).mode, 'chase', '풀리면 평소대로');
});

test('3단계 이상 파사인이 찍힌 요괴는 점수 × 0.6이라 더 먼 먹이도 먼저 사냥당한다', () => {
  const hunter = A(500, 500, 60);
  const player = A(3000, 3000, 28);
  const plain = A(580, 500, 15), marked = A(620, 500, 15, { markLure: true, markUntil: 100 });
  // 거리 80 vs 120 × 0.6 = 72 → 찍힌 쪽
  const lured = pickIntent(hunter, player, buildGrid([hunter, plain, marked], 64), cfg, 1, 10);
  assert.strictEqual(lured.target, marked);
  // 효과가 끝났거나(now ≥ markUntil) 3단계 미만(markLure 없음)이면 가까운 쪽
  const h2 = A(500, 500, 60), plain2 = A(580, 500, 15), expired = A(620, 500, 15, { markLure: true, markUntil: 5 });
  assert.strictEqual(pickIntent(h2, player, buildGrid([h2, plain2, expired], 64), cfg, 1, 10).target, plain2);
  const h3 = A(500, 500, 60), plain3 = A(580, 500, 15), weak = A(620, 500, 15, { markLure: false, markUntil: 100 });
  assert.strictEqual(pickIntent(h3, player, buildGrid([h3, plain3, weak], 64), cfg, 1, 10).target, plain3);
});

// ---- 먹기와 요력 ----
function fakeScene(simTime = 0) {
  const sprite = (x, y, key) => {
    const sp = {
      x, y, key, active: true, scaleX: 1, setOrigin: () => sp, setFlipX: () => sp,
      setDisplaySize(w) { sp.scaleX = w; return sp; },
      setTexture(k) { sp.key = k; return sp; },
      destroy() { sp.active = false; },
    };
    return sp;
  };
  return { simTime, pace: 1, textures: { exists: () => true }, add: { image: (x, y, key) => sprite(x, y, key) } };
}

test('아군이 먹으면 크기만 자라고 요력·식성·진화·몸집 강화는 없다. 풀린 뒤에는 평소처럼 쌓인다', () => {
  const scene = fakeScene(0);
  // 크기는 몸집 상한(growthCap) 안에서 고른다(시작 크기가 달라져도 시험이 깨지지 않게 CONFIG 기준).
  const start = CONFIG.player.startSize;
  const pet = new Enemy(scene, { x: 500, y: 500 }, start * 1.5, 'east', 2);
  tryCharm(pet, 0, 10, 1, 1.5);
  pet.yoryeok = 999999; // 진화·몸집 강화를 할 수 있을 만큼 쌓여 있어도
  const before = pet.size;
  const meal = { x: 0, y: 0, size: start * 0.9, dir: 'west', stage: 1, grade: 'C', special: false };
  const result = pet.eat(meal);
  assert.equal(result, null, '진화·강화 없음');
  assert.ok(pet.size > before, '크기는 자란다');
  assert.equal(pet.yoryeok, 999999, '요력 불변');
  assert.deepEqual(pet.diet, { east: 0, west: 0, south: 0, north: 0 }, '식성 불변');
  assert.equal(pet.stage, 2);
  scene.simTime = 11.5; // 풀림(유예까지 지남)
  pet.eat({ ...meal });
  assert.notEqual(pet.yoryeok, 999999, '풀린 뒤에는 평소처럼(요력·진화)');
});

test('아군이 먹은 먹이의 요력 100%가 플레이어에게 간다: 요력만, 식성·성향·보물 드롭은 없다', () => {
  const scene = { events: new EventEmitter() };
  const progress = createProgress();
  progress.diet.east = 5;
  progress.alignment = -12;
  let saves = 0;
  const run = attachSession(scene, progress, () => 0, () => { saves++; }); // rng 0 = 일반 먹기라면 드롭이 났을 값
  const prey = fakeEnemy(0, 0, 30, { stage: 2, dir: 'north', special: false });
  const w = makeWorld({ formId: 'juyu', level: 0, enemies: [prey] });
  const pet = fakeEnemy(10, 0, 60, { stage: 3 });
  const meal = w.combat.allyMeal(prey, pet);
  assert.equal(meal.byAlly, true);
  assert.equal(meal.x, 10);
  scene.events.emit('eat', meal);
  const expected = preyValue({ size: 30, stage: 2, grade: 'C', special: false, killedByTreasure: false });
  assert.equal(mealYoryeok(meal), expected);
  assert.equal(progress.yoryeok, expected, '요력 100%');
  assert.equal(run.yoryeok, expected);
  assert.equal(run.allyYoryeok, expected, '결과 화면에 따로 적는 값');
  assert.deepEqual(progress.diet, { east: 5, west: 0, south: 0, north: 0 }, '식성 불변');
  assert.equal(progress.alignment, -12, '성향 불변');
  assert.equal(run.drops, 0, '드롭 없음');
  assert.equal(saves, 1);
  // 내가 직접 먹으면 식성이 쌓인다(대조)
  scene.events.emit('eat', { dir: 'north', preySize: 30, stage: 2, grade: 'C' });
  assert.equal(progress.diet.north, 30);
  assert.equal(run.allyYoryeok, expected, '내가 먹은 건 아군 요력에 안 들어간다');
});

test('특수 적을 아군이 먹어도 요력 대박(×8)이 그대로 적용된다', () => {
  const w = makeWorld({ formId: 'juyu', level: 0, enemies: [] });
  const prey = fakeEnemy(0, 0, 30, { stage: 3, special: true });
  const meal = w.combat.allyMeal(prey, fakeEnemy(0, 0, 60));
  assert.equal(meal.special, true);
  assert.equal(mealYoryeok(meal), preyValue({ size: 30, stage: 3, grade: 'C', special: true }));
  assert.equal(preyInfoOf(prey).special, true);
});

test('아군과 플레이어는 서로 먹지 않는다(아군·유예 모두): 플레이어를 못 먹고 플레이어에게 안 먹힌다', () => {
  const now = 5;
  const petOn = initStatus({ charmUntil: 10, charmGraceUntil: 11 });
  const petGrace = initStatus({ charmUntil: 3, charmGraceUntil: 8 });
  const freed = initStatus({ charmUntil: 3, charmGraceUntil: 4 });
  assert.equal(isShielded(petOn, now), true);
  assert.equal(isShielded(petGrace, now), true);
  assert.equal(isShielded(freed, now), false);
  assert.equal(cannotEatPlayer(petOn, now), true);
  assert.equal(cannotEatPlayer(petGrace, now), true);
  assert.equal(cannotEatPlayer(freed, now), false);
});

test('진화해 줄기가 바뀌어도 이미 걸린 매혹은 끝까지 가고, 새 줄기는 새로 걸지 않는다', () => {
  const a = E(1010, 1000, 400, 2);
  const w = makeWorld({ formId: 'juyu', level: 0, enemies: [a] });
  w.shoot(1);
  const until = a.charmUntil;
  const b = E(1010, 1000, 400, 2);
  w.enemies.push(b);
  w.progress.formId = 'danggang'; // E3(학익 추적)로 진화
  w.progress.stage = 2;
  w.combat.cooldown = 0;
  w.step(3);
  assert.equal(a.charmUntil, until, '이미 걸린 매혹은 그대로');
  w.shoot(3);
  assert.equal(b.charmUntil, 0, '새 줄기로는 새로 걸리지 않는다');
});

test('플레이어(1000,1000) 구슬은 아군을 통과해 뒤의 적을 맞힌다', () => {
  const pet = E(1100, 1000, 40, 2, { charmUntil: 1e9, charmDur: 1e9, charmGraceUntil: 1e9 + 1 });
  const behind = E(1200, 1000, 40, 2);
  const w = makeWorld({ formId: 'mimul', level: 0, enemies: [pet, behind], player: fakePlayer('mimul') });
  w.shoot(120);
  assert.equal(pet.size, 40);
  assert.ok(behind.size < 40);
});

// ---- PlayScene.resolveMeals 규칙(씬 전체가 아니라 그 메서드만 가짜 this로 돌린다) ----
globalThis.Phaser ??= { Scene: class {} };
const { PlayScene } = await import('../src/scenes/PlayScene.js');
const { createVitality } = await import('../src/systems/vitality.js');

function mealWorld({ enemies, now = 0, formId = 'juyu' }) {
  const player = fakePlayer(formId, { x: 1000, y: 1000, size: CONFIG.player.startSize, stage: 2, eat(prey) { this.ate = (this.ate ?? 0) + 1; this.eatenSize = prey.size; } });
  const w = makeWorld({ formId, level: 0, enemies, player });
  w.scene.simTime = now;
  const ended = [];
  const ctx = {
    simTime: now, enemies, player, combat: w.combat, events: w.scene.events, stress: null,
    fx: { eatPop() {}, burst() {} },
    hunger: createVitality(10), playerStats: { vitalityMax: 10 },
    endRun(killer) { ended.push(killer); },
  };
  const run = () => PlayScene.prototype.resolveMeals.call(ctx, buildGrid(enemies, CONFIG.hunt.detect));
  return { w, ctx, ended, run, player };
}
const biter = (extra = {}) => fakeEnemy(1000, 1000, CONFIG.player.startSize * 3, { stage: 3, eat() {}, ...extra }); // 나를 먹을 수 있는 큰 적

test('resolveMeals: 생명력이 +10으로 가득 차도 먹을 수 있는 적과 닿자마자 먹힌다', () => {
  const e = biter();
  const { run, ended, ctx } = mealWorld({ enemies: [e] });
  run();
  assert.equal(ctx.hunger.value, 10);
  assert.equal(ended.length, 1, '평소에는 먹힌다');
});

test('resolveMeals: 얼거나 경직되거나 겁먹은 적은 나를 먹지 못한다', () => {
  for (const status of [{ frozenUntil: 99 }, { stunUntil: 99 }, { fearUntil: 99 }]) {
    const e = biter(status);
    const { run, ended, ctx } = mealWorld({ enemies: [e] });
    run();
    assert.equal(ended.length, 0, JSON.stringify(status));
    assert.equal(ctx.hunger.value, 10);
  }
});

test('resolveMeals: 아군(매혹)·유예 중인 적과는 서로 먹지 않는다(충돌 무시)', () => {
  for (const status of [{ charmUntil: 99, charmGraceUntil: 100 }, { charmUntil: 0, charmGraceUntil: 99 }]) {
    const big = biter(status);
    const a = mealWorld({ enemies: [big] });
    a.run();
    assert.equal(a.ended.length, 0, '나를 먹지 않는다');
    const small = fakeEnemy(1000, 1000, CONFIG.player.startSize * 0.3, { stage: 1, ...status });
    const b = mealWorld({ enemies: [small] });
    b.run();
    assert.equal(small.sprite.active, true, '내가 먹지 않는다');
    assert.equal(b.player.ate ?? 0, 0);
    assert.equal(b.w.log.eat.length, 0);
  }
});

test('resolveMeals: 내가 직접 먹으면 예전 식사 기록(byAlly 없음)이 나간다', () => {
  const small = fakeEnemy(1000, 1000, CONFIG.player.startSize * 0.3, { stage: 1 });
  const { run, w, player, ctx } = mealWorld({ enemies: [small] });
  Object.assign(ctx.hunger, { state: 'starving', value: 0, sinceMeal: 16 });
  run();
  assert.equal(ctx.hunger.value, 2.5);
  assert.equal(ctx.hunger.sinceMeal, 0);
  assert.equal(small.sprite.active, false);
  assert.equal(player.ate, 1);
  assert.equal(w.log.eat.length, 1);
  assert.equal(w.log.eat[0].byAlly, undefined);
});

test('resolveMeals: 아군이 닿은 작은 적을 먹으면 byAlly 식사가 나가고(아군 위치 포함), 빙결·위협 중인 아군은 못 먹는다', () => {
  const size = CONFIG.player.startSize;
  const mk = (extra = {}) => {
    const pet = fakeEnemy(3000, 3000, size * 2, { stage: 2, charmUntil: 99, charmDur: 99, charmGraceUntil: 100, eat(prey) { this.ate = prey.size; }, ...extra });
    const prey = fakeEnemy(3010, 3000, size * 0.5, { stage: 1, dir: 'north' });
    return { pet, prey };
  };
  const { pet, prey } = mk();
  const a = mealWorld({ enemies: [pet, prey] });
  a.ctx.hunger.sinceMeal = 3;
  a.run();
  assert.equal(a.ctx.hunger.sinceMeal, 3);
  assert.equal(prey.sprite.active, false);
  assert.equal(pet.ate, size * 0.5, '아군이 먹었다');
  assert.equal(a.w.log.eat.length, 1);
  const meal = a.w.log.eat[0];
  assert.equal(meal.byAlly, true);
  assert.equal(meal.x, 3000);
  assert.equal(meal.dir, 'north');
  assert.equal(meal.killedByTreasure, false);
  // 얼어 있으면 못 먹는다
  const frozen = mk({ frozenUntil: 99 });
  const b = mealWorld({ enemies: [frozen.pet, frozen.prey] });
  b.run();
  assert.equal(frozen.prey.sprite.active, true);
  assert.equal(b.w.log.eat.length, 0);
});

test('resolveMeals: 시험 판(?stress)에서는 먹혀도 판이 끝나지 않는다', () => {
  const e = biter();
  const { run, ended, ctx } = mealWorld({ enemies: [e] });
  ctx.stress = {};
  run();
  assert.equal(ended.length, 0);
});
