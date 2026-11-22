import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { buildGrid, queryGrid, pickIntent, intentDirection, findMeals } from '../src/game/enemyAI.js';
import { EnemyFire, rollSpecial, isFatal } from '../src/game/enemyFire.js';
import { Enemy } from '../src/game/enemy.js';
import { FORM_BY_ID } from '../src/data/forms.js';
import { evolutionCost } from '../src/systems/evolution.js';
import { bodyCostAt, preyValue, preyInfoOf } from '../src/systems/rules.js';

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

test('상위 단계는 하위가 2배 미만이면 쫓고, 하위는 상위를 2배 이상 클 때만 쫓는다', () => {
  const player = A(3000, 3000, 28);
  const up = A(500, 500, 10, { stage: 2 });
  const lowBig = A(560, 500, 19, { stage: 1 });
  let grid = buildGrid([up, lowBig], 64);
  assert.equal(pickIntent(up, player, grid, cfg).mode, 'chase');
  const lowHuge = A(560, 500, 25, { stage: 1 });
  const up2 = A(500, 500, 10, { stage: 2 });
  grid = buildGrid([up2, lowHuge], 64);
  const intent = pickIntent(up2, player, grid, cfg);
  assert.equal(intent.mode, 'flee');
  assert.equal(intent.target, lowHuge);
});

test('표적이 단계 규칙에서 벗어나면 즉시 다시 고른다', () => {
  const me = A(500, 500, 10, { stage: 2 }), low = A(540, 500, 15, { stage: 1 });
  const player = A(3000, 3000, 5);
  const grid = buildGrid([me, low], 64);
  assert.equal(pickIntent(me, player, grid, cfg).mode, 'chase');
  low.size = 25;
  assert.equal(pickIntent(me, player, grid, cfg, 0.01).mode, 'flee');
});

test('findMeals는 단계 규칙을 따른다: 상위가 하위를 먹고, 하위가 2배 이상 크면 하위가 먹는다', () => {
  const up = A(100, 100, 10, { stage: 2 }), low = A(115, 100, 15, { stage: 1 });
  const meals = findMeals(buildGrid([up, low], 64));
  assert.equal(meals.length, 1);
  assert.strictEqual(meals[0][0], up);
  assert.strictEqual(meals[0][1], low);
  const up2 = A(100, 100, 10, { stage: 2 }), huge = A(120, 100, 20, { stage: 1 });
  const m2 = findMeals(buildGrid([up2, huge], 64));
  assert.equal(m2.length, 1);
  assert.strictEqual(m2[0][0], huge);
  assert.strictEqual(m2[0][1], up2);
});

// ---- 적의 성장(먹기 → 요력 → 진화·몸집 강화). Phaser 없이 가짜 scene으로 돌린다. ----
function fakeScene() {
  const sprite = (x, y, key) => {
    const sp = {
      x, y, key, active: true, scaleX: 1, setOrigin: () => sp, setFlipX: () => sp,
      setDisplaySize(w) { sp.scaleX = w; return sp; },
      setTexture(k) { sp.key = k; return sp; },
      destroy() { sp.active = false; },
    };
    return sp;
  };
  return { textures: { exists: () => true }, add: { image: (x, y, key) => sprite(x, y, key) } };
}
const makeEnemy = (size, dir, stage) => new Enemy(fakeScene(), { x: 500, y: 500 }, size, dir, stage);
const prey = (size, dir, extra = {}) => ({ x: 0, y: 0, size, dir, stage: 1, ...extra });

test('1단계 적은 방위 색 미물, 2·3단계는 해당 방위·단계의 형태', () => {
  const a = makeEnemy(20, 'east', 1);
  assert.equal(a.formId, 'mimul');
  assert.equal(a.stage, 1);
  assert.equal(a.sprite.key, 'creature-mimul-east');
  assert.equal(a.special, false);
  assert.equal(a.yoryeok, 0);
  assert.deepEqual(a.diet, { east: 0, west: 0, south: 0, north: 0 });
  assert.equal(a.bodyLevel, 0);
  assert.ok(typeof a.grade === 'string');
  for (let i = 0; i < 20; i++) {
    const b = makeEnemy(30, 'south', 2);
    assert.equal(FORM_BY_ID[b.formId].stage, 2);
    assert.equal(FORM_BY_ID[b.formId].dir, 'south');
    assert.equal(b.stage, 2);
    const c = makeEnemy(40, 'north', 3);
    assert.equal(FORM_BY_ID[c.formId].stage, 3);
    assert.equal(FORM_BY_ID[c.formId].dir, 'north');
    assert.equal(typeof c.special, 'boolean');
  }
});

test('단계를 안 넘기면 예전처럼 크기로 2·3단계를 정한다', () => {
  assert.equal(makeEnemy(CONFIG.enemy.stage3Size - 1, 'east').stage, 2);
  assert.equal(makeEnemy(CONFIG.enemy.stage3Size, 'east').stage, 3);
});

test('먹으면 면적이 늘고 먹힌 쪽 점수만큼 요력, 크기만큼 식성이 쌓인다', () => {
  const e = makeEnemy(30, 'east', 2);
  const p = prey(10, 'west', { stage: 1 });
  const expected = preyValue(preyInfoOf(p));
  const before = e.size;
  const result = e.eat(p);
  assert.equal(result, null);
  assert.ok(e.size > before);
  assert.equal(e.yoryeok, expected);
  assert.equal(e.diet.west, 10);
  assert.equal(e.diet.east, 0);
  const none = e.eat({ x: 0, y: 0, size: 5 });
  assert.equal(none, null);
  assert.ok(e.yoryeok > expected);
});

test('1→2 진화: 식성 1위 방위 새끼, 크기 초기화(±jitter), 비용 차감, 식성 초기화', () => {
  const e = makeEnemy(60, 'east', 1);
  e.diet = { east: 3, west: 0, south: 50, north: 1 };
  e.yoryeok = evolutionCost(2) + 7;
  e.bodyLevel = 2;
  const keyBefore = e.sprite.key;
  assert.equal(e.autoProgress(), 'evolve');
  assert.equal(e.stage, 2);
  assert.equal(e.dir, 'south');
  assert.equal(e.formId, 'littleBird');
  assert.notEqual(e.sprite.key, keyBefore);
  assert.equal(e.sprite.key, 'creature-littleBird');
  const [lo, hi] = CONFIG.enemy.evolveJitter, base = CONFIG.levelUp.evolveResetSize;
  assert.ok(e.size >= base * lo - 1e-9 && e.size <= base * hi + 1e-9);
  assert.equal(e.yoryeok, 7);
  assert.deepEqual(e.diet, { east: 0, west: 0, south: 0, north: 0 });
  assert.equal(e.bodyLevel, 0);
  assert.equal(e.special, false);
});

test('2→3 진화: 같은 방위의 3단계, rng로 크기 범위 양끝과 특수 적 굴림을 정한다', () => {
  const lowEnd = makeEnemy(50, 'west', 2);
  lowEnd.yoryeok = evolutionCost(3);
  assert.equal(lowEnd.autoProgress(() => 0), 'evolve');
  assert.equal(lowEnd.stage, 3);
  assert.equal(FORM_BY_ID[lowEnd.formId].dir, 'west');
  assert.equal(lowEnd.dir, 'west');
  assert.ok(Math.abs(lowEnd.size - CONFIG.levelUp.evolveResetSize * CONFIG.enemy.evolveJitter[0]) < 1e-9);
  assert.equal(lowEnd.special, true);
  const highEnd = makeEnemy(50, 'west', 2);
  highEnd.yoryeok = evolutionCost(3);
  highEnd.autoProgress(() => 0.999999);
  assert.ok(Math.abs(highEnd.size - CONFIG.levelUp.evolveResetSize * CONFIG.enemy.evolveJitter[1]) < 1e-3);
  assert.equal(highEnd.special, false);
  assert.equal(highEnd.yoryeok, 0);
});

test('몸집 강화: 비용을 내고 크기 ×bodyMult, 레벨이 오르면 다음 비용이 커진다', () => {
  const e = makeEnemy(50, 'east', 3);
  e.yoryeok = bodyCostAt(0) + 5;
  assert.equal(e.autoProgress(), 'body');
  assert.ok(Math.abs(e.size - 50 * CONFIG.levelUp.bodyMult) < 1e-9);
  assert.equal(e.bodyLevel, 1);
  assert.ok(Math.abs(e.yoryeok - 5) < 1e-9);
  e.yoryeok = bodyCostAt(1) - 1;
  assert.equal(e.autoProgress(), null);
  assert.equal(e.bodyLevel, 1);
});

test('3단계는 요력이 아무리 많아도 진화하지 않고, 진화 가능하면 몸집 강화보다 진화가 먼저다', () => {
  const top = makeEnemy(50, 'east', 3);
  top.yoryeok = 1e6;
  assert.equal(top.autoProgress(), 'body');
  assert.equal(top.stage, 3);
  const e = makeEnemy(50, 'east', 1);
  e.yoryeok = evolutionCost(2) + bodyCostAt(0);
  assert.equal(e.autoProgress(), 'evolve');
});

test('eat이 진화까지 이어진다: 먹은 뒤 요력이 비용에 닿으면 진화', () => {
  const e = makeEnemy(20, 'east', 1);
  e.yoryeok = evolutionCost(2) - 1;
  assert.equal(e.eat(prey(20, 'north')), 'evolve');
  assert.equal(e.stage, 2);
  assert.equal(e.dir, 'north');
});
