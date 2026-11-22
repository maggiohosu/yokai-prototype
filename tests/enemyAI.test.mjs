import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { buildGrid, queryGrid, pickIntent, intentDirection, findMeals } from '../src/game/enemyAI.js';
import { EnemyFire, rollSpecial, isFatal } from '../src/game/enemyFire.js';

const A = (x, y, size, extra = {}) => ({ x, y, size, ...extra });
const cfg = CONFIG.hunt;

test('queryGrid는 반경 안의 액터만 돌려준다', () => {
  const list = [A(10, 10, 5), A(100, 100, 5), A(-30, 20, 5), A(3900, 3900, 5)];
  const grid = buildGrid(list, 64);
  assert.equal(queryGrid(grid, 0, 0, 40).length, 2);
  assert.equal(queryGrid(grid, 3900, 3900, 1).length, 1);
});

test('나를 먹을 수 있는 상대가 있으면 도망, 없으면 작은 상대 추격', () => {
  const me = A(500, 500, 30);
  const big = A(560, 500, 60), small = A(440, 500, 15);
  const player = A(2000, 2000, 28);
  let grid = buildGrid([me, big, small], 64);
  assert.equal(pickIntent(me, player, grid, cfg).mode, 'flee');
  const me2 = A(500, 500, 30);
  grid = buildGrid([me2, small], 64);
  const intent = pickIntent(me2, player, grid, cfg);
  assert.equal(intent.mode, 'chase');
  assert.equal(intent.target, small);
  assert.ok(intentDirection(me2, intent).x < 0);
});

test('플레이어는 먹을 수 있으면 추격 대상이 되고 playerBias가 우선순위를 정한다', () => {
  const me = A(500, 500, 40);
  const player = A(600, 500, 20);
  const small = A(500, 580, 20);
  const grid = buildGrid([me, small], 64);
  assert.equal(pickIntent(me, player, grid, { ...cfg, playerBias: 0.5 }).target, player);
  const me2 = A(500, 500, 40);
  assert.equal(pickIntent(me2, player, grid, { ...cfg, playerBias: 3 }).target, small);
});

test('비슷한 크기와 감지 거리 밖은 배회, 역전 중이면 플레이어에게서 도망', () => {
  const me = A(500, 500, 30), peer = A(540, 500, 31);
  const far = A(2500, 2500, 5);
  const grid = buildGrid([me, peer], 64);
  assert.equal(pickIntent(me, far, grid, cfg).mode, 'wander');
  const rev = A(500, 500, 10, { reversed: true, fleeTime: 1 });
  const p = A(520, 500, 30);
  const g2 = buildGrid([rev], 64);
  const intent = pickIntent(rev, p, g2, cfg);
  assert.equal(intent.mode, 'flee');
  assert.equal(intent.target, p);
});

test('표적은 retargetSeconds 동안 유지된다', () => {
  const me = A(500, 500, 30), small = A(450, 500, 10);
  const grid = buildGrid([me, small], 64);
  const player = A(3000, 3000, 5);
  const first = pickIntent(me, player, grid, cfg, 0);
  small.x = 420;
  assert.equal(pickIntent(me, player, grid, cfg, 0.01), first);
});

test('findMeals는 닿은 큰 적이 작은 적을 한 번만 먹는다', () => {
  const big = A(100, 100, 40), s1 = A(120, 100, 10), s2 = A(2000, 2000, 10), peer = A(110, 110, 38);
  const meals = findMeals(buildGrid([big, s1, s2, peer], 64));
  assert.ok(meals.some(([e, p]) => e === big && p === s1));
  assert.ok(!meals.some(([, p]) => p === s2 || p === big));
});

test('특수 적은 사거리 안에서 쿨타임마다 쏘고, 맞으면 피해를 준다', () => {
  const fire = new EnemyFire(null);
  const enemy = A(0, 0, 40, { special: true, fireCd: 0 });
  const player = A(200, 0, 28);
  assert.equal(fire.tryFire(enemy, player, 0.1), true);
  assert.equal(fire.tryFire(enemy, player, 0.1), false);
  assert.equal(fire.tryFire(A(0, 0, 40), player, 0.1), false);
  let hits = [];
  for (let i = 0; i < 100 && !hits.length; i++) hits = fire.step(0.02, player);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].damage, Math.max(CONFIG.special.minDamage, 28 * CONFIG.special.damageRatio));
  assert.equal(fire.orbs.length, 0);
  const far = A(5000, 0, 28);
  assert.equal(fire.tryFire(A(0, 0, 40, { special: true, fireCd: 0 }), far, 0.1), false);
});

test('빠른 구슬도 통과하지 않고, 상한을 지킨다', () => {
  const fire = new EnemyFire(null);
  fire.orbs.push({ x: 0, y: 0, vx: 5000, vy: 0, life: 5 });
  assert.equal(fire.step(0.5, A(1000, 0, 10)).length, 1);
  for (let i = 0; i < CONFIG.special.maxOrbs + 5; i++) fire.tryFire(A(0, 0, 40, { special: true, fireCd: 0 }), A(100, 0, 10), 0);
  assert.ok(fire.orbs.length <= CONFIG.special.maxOrbs);
});

test('rollSpecial과 isFatal', () => {
  assert.equal(rollSpecial(50, 3, () => 0), true);
  assert.equal(rollSpecial(50, 2, () => 0), false);
  assert.equal(rollSpecial(50, 3, () => 0.99), false);
  assert.equal(isFatal(CONFIG.special.deathSize - 1), true);
  assert.equal(isFatal(CONFIG.special.deathSize), false);
});
