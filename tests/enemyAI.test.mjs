import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { buildGrid, queryGrid, pickIntent, intentDirection, findMeals } from '../src/game/enemyAI.js';
import { EnemyFire, rollSpecial, isFatal } from '../src/game/enemyFire.js';
import { Enemy } from '../src/game/enemy.js';
import { Combat, aimTarget } from '../src/game/combat.js';
import { reversalPair } from '../src/systems/rules.js';
import { FORM_BY_ID } from '../src/data/forms.js';
import { evolutionCost } from '../src/systems/evolution.js';
import { bodyCostAt, preyValue, preyInfoOf, canEat } from '../src/systems/rules.js';

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
  const rev = A(500, 500, 10, { reversed: true });
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

test('1단계 적은 그 방위의 1단계 형태 2종 중 하나, 2·3단계는 해당 방위·단계의 형태', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const w = makeEnemy(20, 'west', 1);
    assert.equal(FORM_BY_ID[w.formId].stage, 1);
    assert.equal(FORM_BY_ID[w.formId].dir, 'west');
    assert.notEqual(w.formId, 'mimul');
    seen.add(w.formId);
  }
  assert.deepEqual([...seen].sort(), ['mokchung', 'namo']);
  const a = makeEnemy(20, 'east', 1);
  assert.ok(['hwalsa', 'jubyeoreo'].includes(a.formId));
  assert.equal(a.stage, 1);
  assert.equal(a.sprite.key, 'creature-' + a.formId);
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

test('1→2 진화: 식성 1위 방위의 입구 형태, 크기 초기화(±jitter), 비용 차감, 식성 초기화', () => {
  const e = makeEnemy(60, 'east', 1);
  e.diet = { east: 3, west: 0, south: 50, north: 1 };
  e.yoryeok = evolutionCost(2) + 7;
  e.bodyLevel = 2;
  const keyBefore = e.sprite.key;
  assert.equal(e.autoProgress(() => 0), 'evolve'); // 남녘 입구 4개 중 첫째(새끼 새)
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

test('5단계는 요력이 아무리 많아도 진화하지 않고, 진화 가능하면 몸집 강화보다 진화가 먼저다', () => {
  const top = makeEnemy(50, 'east', 5);
  top.yoryeok = 1e6;
  assert.equal(top.autoProgress(), 'body');
  assert.equal(top.stage, 5);
  const e = makeEnemy(50, 'east', 1);
  e.yoryeok = evolutionCost(2) + bodyCostAt(0);
  assert.equal(e.autoProgress(), 'evolve');
});

test('적의 자가 진화는 플레이어 단계 + selfEvolveLead까지만 한다', () => {
  const lead = CONFIG.enemy.selfEvolveLead;
  assert.equal(lead, 1);
  const withPlayer = (stage, size, dir, playerStage) => {
    const scene = fakeScene();
    scene.player = { stage: playerStage, size: 28 };
    return new Enemy(scene, { x: 500, y: 500 }, size, dir, stage);
  };
  const a = withPlayer(2, 30, 'east', 1);
  a.yoryeok = evolutionCost(3) + 5;
  assert.equal(a.autoProgress(), 'body', '플레이어 1단계 판에서 2단계 적은 3단계로 진화하지 않는다');
  assert.equal(a.stage, 2);
  const b = withPlayer(1, 30, 'east', 1);
  b.yoryeok = evolutionCost(2);
  assert.equal(b.autoProgress(), 'evolve', '플레이어 단계 + 1까지는 진화한다');
  assert.equal(b.stage, 2);
  const c = withPlayer(4, 30, 'east', 4);
  c.yoryeok = evolutionCost(5);
  assert.equal(c.autoProgress(), 'evolve');
  assert.equal(c.stage, 5);
  assert.ok(FORM_BY_ID[c.formId].stage === 5);
});

test('eat이 진화까지 이어진다: 먹은 뒤 요력이 비용에 닿으면 진화', () => {
  const e = makeEnemy(20, 'east', 1);
  e.yoryeok = evolutionCost(2) - 1;
  assert.equal(e.eat(prey(20, 'north')), 'evolve');
  assert.equal(e.stage, 2);
  assert.equal(e.dir, 'north');
});

// ---- 보물 역전(reversed): 시간이 지나도 풀리지 않던 문제 ----
// 시나리오: 2단계 적(작아도 1단계 플레이어를 먹을 수 있음)을 보물로 깎아 역전시킨다.
function fakeCombatScene(player, enemies) {
  const graphics = { clear: () => graphics, setDepth: () => graphics };
  const calls = { reversal: 0, flee: 0 };
  return {
    calls, player, enemies, progress: null,
    add: { graphics: () => graphics },
    fireButton: { showReversal: () => { calls.reversal++; } },
    fx: { flash() {}, burst() {}, reversal: () => { calls.reversal++; } },
    events: { emit() {} },
  };
}

test('역전된 적은 fleeTime 같은 시간 조건 없이 플레이어에게서 도망하고, 쫓아오지 않는다', () => {
  const player = A(300, 300, 28, { stage: 1 });
  // 규칙만 보면 2단계 적(크기 20)은 1단계 플레이어(28 < 40)를 먹을 수 있다 → 평소에는 쫓아온다.
  const normal = A(360, 300, 20, { stage: 2 });
  assert.equal(pickIntent(normal, player, buildGrid([normal], 64), cfg).mode, 'chase');
  const rev = A(360, 300, 20, { stage: 2, reversed: true });
  for (let i = 0; i < 50; i++) {
    const intent = pickIntent(rev, player, buildGrid([rev], 64), cfg, 1); // 1초씩 50번: 시간이 지나도
    assert.equal(intent.mode, 'flee');
    assert.strictEqual(intent.target, player);
    assert.ok(intentDirection(rev, intent).x > 0, '플레이어 반대쪽으로 도망');
  }
});

test('역전된 적이 감지 거리 밖이면 플레이어를 쫓지 않고, 전에 쫓던 표적도 버린다', () => {
  const player = A(300, 300, 28, { stage: 1 });
  const me = A(300 + cfg.detect + 5, 300, 20, { stage: 2 });
  const chaser = A(300 + cfg.detect - 5, 300, 20, { stage: 2 });
  assert.equal(pickIntent(chaser, player, buildGrid([chaser], 64), cfg).target, player);
  // 쫓는 도중 보물에 맞아 역전, 감지 거리 바깥으로 벗어남
  chaser.reversed = true;
  chaser.x = me.x;
  const next = pickIntent(chaser, player, buildGrid([chaser], 64), cfg, 0.01);
  assert.notEqual(next.mode === 'chase' && next.target === player, true);
  assert.equal(next.mode, 'wander');
});

test('자동 조준은 이미 역전된 적을 표적으로 삼지 않는다', () => {
  const player = A(0, 0, 28, { stage: 1 });
  const sprite = { active: true };
  const threat = A(200, 0, 20, { stage: 2, sprite });
  const flipped = A(100, 0, 20, { stage: 2, sprite, reversed: true });
  assert.strictEqual(aimTarget(0, 0, player, [flipped, threat], 1, 0), threat);
  assert.equal(aimTarget(0, 0, player, [flipped], 1, 0), null);
});

test('역전은 먹거나 진화하거나 몸집을 키우면 풀리고, 그때부터 다시 단계 규칙을 따른다', () => {
  const player = A(300, 300, 28, { stage: 1 });
  const reverse = (e) => { e.fleeFrom(player); assert.equal(e.reversed, true); return e; };

  const eater = reverse(makeEnemy(20, 'east', 2));
  eater.eat(prey(5, 'west'));
  assert.equal(eater.reversed, false, '먹으면 풀린다');

  const evolver = reverse(makeEnemy(20, 'east', 1));
  evolver.diet.south = 30;
  evolver.yoryeok = evolutionCost(2);
  assert.equal(evolver.autoProgress(), 'evolve');
  assert.equal(evolver.reversed, false, '진화하면 풀린다');
  const direct = reverse(makeEnemy(20, 'east', 1));
  direct.evolveTo(FORM_BY_ID.littleSnake);
  assert.equal(direct.reversed, false);

  const bulky = reverse(makeEnemy(20, 'east', 3));
  bulky.yoryeok = bodyCostAt(0);
  assert.equal(bulky.autoProgress(), 'body');
  assert.equal(bulky.reversed, false, '몸집을 키우면 풀린다');

  // 아무것도 안 하면 오래 두어도 그대로, 플레이어보다 커지면 풀린다.
  const idle = reverse(makeEnemy(20, 'east', 2));
  const grid = buildGrid([idle], 64);
  for (let i = 0; i < 100; i++) idle.step(player, 1 / 30, grid);
  assert.equal(idle.reversed, true);
  idle.setSize(player.size + 1);
  idle.step(player, 1 / 30, grid);
  assert.equal(idle.reversed, false);
});

test('시나리오: 보물로 깎아 역전 → 도망 → 닿으면 플레이어가 먹음 / 도망 중 뭔가를 먹으면 다시 위협', () => {
  const player = Object.assign(A(500, 500, 28, { stage: 1 }), { sprite: { active: true } });
  const enemy = makeEnemy(40, 'east', 2);
  enemy.sprite.x = 540;
  enemy.sprite.y = 500;
  const scene = fakeCombatScene(player, [enemy]);
  const combat = new Combat(scene, { grade: 'C', treasure: { level: 0 } });
  assert.equal(canEat(enemy, player), true, '처음에는 적이 나를 먹을 수 있다');
  assert.equal(aimTarget(player.x, player.y, player, [enemy], 1, 0), enemy);

  combat.hit(enemy, 28); // 40 → 12: 하위인 플레이어(28)가 상위를 먹으려면 상대가 14 이하여야 한다 → 역전
  assert.equal(enemy.reversed, true);
  assert.equal(scene.calls.reversal, 2, '역전 표시는 한 번(버튼 + 연출)');
  assert.equal(aimTarget(player.x, player.y, player, [enemy], 1, 0), null, '이제 표적이 아니다');
  combat.hit(enemy, 1); // 이미 역전된 적을 또 맞혀도 역전 표시는 다시 나오지 않는다.
  assert.equal(scene.calls.reversal, 2);

  // 시간이 한참 지나도 플레이어를 쫓지 않고 도망한다.
  const grid = buildGrid([enemy], CONFIG.hunt.detect);
  const x0 = enemy.x;
  for (let i = 0; i < 120; i++) enemy.step(player, 1 / 30, grid);
  assert.equal(enemy.reversed, true);
  assert.ok(enemy.x > x0, '플레이어 반대쪽(오른쪽)으로 멀어졌다');

  // 닿으면 단계와 상관없이 플레이어가 먹는다.
  enemy.sprite.x = player.x + 20;
  enemy.sprite.y = player.y;
  assert.ok(reversalPair(player, enemy));

  // 도망 중 뭔가를 먹으면 역전이 풀리고 단계 규칙으로 돌아간다(닿아도 역전 규칙으로는 안 먹힌다).
  enemy.eat(prey(3, 'north'));
  assert.equal(enemy.reversed, false);
  assert.equal(reversalPair(player, enemy), null);
});

test('역전이 풀린 적이 다시 나를 먹을 수 있으면 표적과 추격 대상으로 돌아온다', () => {
  const player = Object.assign(A(500, 500, 20, { stage: 1 }), { sprite: { active: true } });
  const enemy = Object.assign(A(560, 500, 15, { stage: 2, reversed: true }), { sprite: { active: true } });
  assert.equal(aimTarget(player.x, player.y, player, [enemy], 1, 0), null);
  assert.equal(pickIntent(enemy, player, buildGrid([enemy], 64), cfg).mode, 'flee');
  enemy.reversed = false; // eat·evolveTo·몸집 강화가 하는 일
  assert.equal(canEat(enemy, player), true);
  assert.strictEqual(aimTarget(player.x, player.y, player, [enemy], 1, 0), enemy);
  const intent = pickIntent(enemy, player, buildGrid([enemy], 64), cfg, 1);
  assert.equal(intent.mode, 'chase');
  assert.strictEqual(intent.target, player);
});
