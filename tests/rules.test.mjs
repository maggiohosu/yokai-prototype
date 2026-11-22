import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import {
  stageOf, canEat, eatPair, reversalPair, preyValue, preyInfoOf, newDiet, bodyCostAt, topDietDir, pickEvolution, nextProgress,
} from '../src/systems/rules.js';
import { FORMS } from '../src/data/forms.js';
import { evolutionCost } from '../src/systems/evolution.js';
import { spawnStage, spawnPoint } from '../src/game/world.js';
import { eatingPair } from '../src/game/actor.js';

const A = (size, stage, x = 0, y = 0) => ({ x, y, size, stage });

test('역전 표시가 난 적(단계가 높아도)은 닿으면 플레이어가 먹는다', () => {
  const player = A(40, 1, 0, 0);
  const enemy = { ...A(35, 2, 10, 0), reversed: true };
  assert.equal(eatPair(player, enemy)?.[0], enemy); // 규칙만 보면 플레이어가 먹힌다
  assertPair(reversalPair(player, enemy), player, enemy);
  assert.equal(reversalPair(player, { ...enemy, reversed: false }), null);
  assert.equal(reversalPair(player, { ...enemy, size: 45 }), null);
  assert.equal(reversalPair(player, { ...enemy, x: 200 }), null);
});

test('stageOf 기본값은 1', () => {
  assert.equal(stageOf({}), 1);
  assert.equal(stageOf({ stage: 3 }), 3);
});

test('같은 단계는 ratio 배 이상 큰 쪽이 먹고, reversed면 같은 크기도 먹는다', () => {
  const r = CONFIG.eating.ratio;
  assert.equal(canEat(A(10 * r, 2), A(10, 2)), true);
  assert.equal(canEat(A(10 * r - 0.01, 2), A(10, 2)), false);
  assert.equal(canEat(A(10, 2), A(10, 2), { reversed: true }), true);
  assert.equal(canEat(A(10, 2), A(10, 2)), false);
});

test('상위는 하위가 2배 미만일 때 먹고, 하위가 2배 이상 크면 못 먹는다', () => {
  const o = CONFIG.eating.stageOverride;
  assert.equal(canEat(A(10, 2), A(5, 1)), true);
  assert.equal(canEat(A(10, 2), A(30, 1)), false);
  assert.equal(canEat(A(10, 2), A(10 * o - 0.01, 1)), true);
  assert.equal(canEat(A(10, 2), A(10 * o, 1)), false);
});

test('하위는 상위의 2배 이상 클 때만 먹는다', () => {
  const o = CONFIG.eating.stageOverride;
  assert.equal(canEat(A(20, 1), A(10, 2)), true);
  assert.equal(canEat(A(20 - 0.01, 1), A(10, 2)), false);
  assert.equal(canEat(A(50, 1), A(10, 3)), true);
  assert.equal(o, 2);
});

function assertPair(pair, eater, eaten) {
  assert.ok(Array.isArray(pair), '쌍이 있어야 한다');
  assert.equal(pair.length, 2);
  assert.strictEqual(pair[0], eater);
  assert.strictEqual(pair[1], eaten);
}

test('eatPair는 겹침과 규칙을 함께 본다', () => {
  const small = A(10, 2, 0, 0), big = A(25, 1, 20, 0);
  assertPair(eatPair(small, big), big, small);
  assertPair(eatPair(big, small), big, small);
  const up = A(10, 2, 0, 0), low = A(15, 1, 20, 0);
  assertPair(eatPair(up, low), up, low);
  assertPair(eatPair(low, up), up, low);
  assert.equal(eatPair(A(10, 1, 0, 0), A(10, 1, 5, 0)), null);
  assert.equal(eatPair(A(10, 2, 0, 0), A(5, 1, 100, 0)), null);
});

test('eatPair: 단계가 다르면 겹친 쌍은 항상 한쪽이 먹고, 같은 단계에서 비슷하면 null, 둘 다 먹을 수 있으면 큰 쪽이 먹는다', () => {
  assert.notEqual(eatPair(A(10, 2, 0, 0), A(19.99, 1, 12, 0)), null);
  assert.notEqual(eatPair(A(10, 2, 0, 0), A(20, 1, 12, 0)), null);
  const a = A(10, 2, 0, 0), b = A(10, 2, 5, 0);
  assert.equal(eatPair(a, b), null);
  assertPair(eatPair(a, b, { reversed: true }), a, b);
  const c = A(11, 2, 0, 0);
  assertPair(eatPair(b, c, { reversed: true }), c, b);
});

test('eatingPair(기존 호출)도 같은 규칙을 따르고 ratio 1이면 역전 상태로 본다', () => {
  const player = A(20, 1, 0, 0), up = A(10, 2, 15, 0);
  assertPair(eatingPair(player, up), player, up);
  const weak = A(10, 1, 0, 0), peer = A(9.5, 1, 5, 0);
  assert.equal(eatingPair(weak, peer), null);
  assertPair(eatingPair(weak, peer, 1), weak, peer);
});

test('preyValue: 최소 1, 배율 적용', () => {
  assert.equal(preyValue({ size: 1, stage: 1, grade: 'F' }) >= 1, true);
  const base = preyValue({ size: 30, stage: 2, grade: 'C' });
  assert.ok(preyValue({ size: 30, stage: 2, grade: 'C', killedByTreasure: true }) > base);
  assert.ok(preyValue({ size: 30, stage: 2, grade: 'C', special: true }) >= base * 7);
  assert.ok(preyValue({ size: 30, stage: 3, grade: 'C' }) > base);
  assert.ok(preyValue({ size: 30, stage: 2, grade: 'S+' }) > base);
  assert.equal(Number.isInteger(base), true);
});

test('크기 60 3단계 하나 > 크기 20 1단계 10개, 크기 큰 1단계 하나도 작은 여러 개보다 낫다', () => {
  const big = preyValue({ size: 60, stage: 3, grade: 'C' });
  const smalls = 10 * preyValue({ size: 20, stage: 1, grade: 'C' });
  assert.ok(big > smalls);
  assert.ok(preyValue({ size: 60, stage: 1, grade: 'C' }) > 2 * preyValue({ size: 30, stage: 1, grade: 'C' }));
  assert.ok(preyValue({ size: 30, stage: 2 }) > preyValue({ size: 30, stage: 1 }));
});

test('preyInfoOf는 단계·등급·특수·방위를 담고 preyValue에 그대로 쓸 수 있다', () => {
  const info = preyInfoOf({ size: 30, stage: 3, grade: 'A', special: true, dir: 'east' }, true);
  assert.deepEqual(info, { size: 30, stage: 3, grade: 'A', special: true, killedByTreasure: true, dir: 'east' });
  assert.equal(preyInfoOf({ size: 5 }).stage, 1);
  assert.equal(preyInfoOf({ size: 5 }).special, false);
  assert.ok(preyValue(preyInfoOf({ size: 5 })) >= 1);
});

test('bodyCostAt은 설정 공식(기본 비용 × 증가율^레벨)이다', () => {
  const l = CONFIG.levelUp;
  assert.equal(bodyCostAt(0), l.bodyBaseCost);
  assert.ok(Math.abs(bodyCostAt(3) - l.bodyBaseCost * l.bodyCostGrowth ** 3) < 1e-9);
});

test('topDietDir: 식성 1위, 동률이면 내 방위, 모두 0이면 fallback 또는 null', () => {
  assert.equal(topDietDir({ east: 1, west: 9, south: 3, north: 0 }, 'east'), 'west');
  assert.equal(topDietDir({ east: 5, west: 5, south: 0, north: 0 }, 'west'), 'west');
  assert.equal(topDietDir({ east: 5, west: 5, south: 0, north: 0 }, 'north'), 'east');
  assert.equal(topDietDir(newDiet(), 'south'), 'south');
  assert.equal(topDietDir(newDiet()), null);
});

test('pickEvolution: 1→2는 식성 1위 방위의 새끼, 2→3은 같은 방위의 3단계', () => {
  const eater = { stage: 1, dir: 'east', diet: { east: 1, west: 0, south: 9, north: 0 } };
  const baby = pickEvolution(eater, FORMS, () => 0);
  assert.equal(baby.stage, 2);
  assert.equal(baby.dir, 'south');
  const little = { stage: 2, dir: 'north', diet: newDiet() };
  const seen = new Set();
  for (const r of [0, 0.4, 0.99]) {
    const form = pickEvolution(little, FORMS, () => r);
    assert.equal(form.stage, 3);
    assert.equal(form.dir, 'north');
    seen.add(form.id);
  }
  assert.equal(seen.size, 3);
  assert.equal(pickEvolution({ stage: 3, dir: 'east' }, FORMS), null);
  assert.equal(pickEvolution({ stage: 1, dir: 'none', diet: newDiet() }, FORMS, () => 0).stage, 2);
});

test('nextProgress: 진화가 몸집 강화보다 우선, 3단계는 몸집 강화만, 부족하면 null', () => {
  const body = bodyCostAt(0);
  assert.equal(nextProgress({ stage: 1, yoryeok: body - 1, bodyLevel: 0 }), null);
  assert.equal(nextProgress({ stage: 1, yoryeok: body, bodyLevel: 0 }), 'body');
  assert.equal(nextProgress({ stage: 1, yoryeok: evolutionCost(2), bodyLevel: 0 }), 'evolve');
  assert.equal(nextProgress({ stage: 2, yoryeok: evolutionCost(3), bodyLevel: 0 }), 'evolve');
  assert.equal(nextProgress({ stage: 3, yoryeok: evolutionCost(3) * 5, bodyLevel: 0 }), 'body');
  assert.equal(nextProgress({ stage: 1, yoryeok: body, bodyLevel: 1 }), null);
});

test('spawnStage: 구간 경계와 가중치 비율, 알 수 없는 플레이어 단계는 1단계 표', () => {
  // 플레이어 1단계: 적도 모두 1단계(사용자 지시 2026-11-23)
  for (const r of [0, 0.3, 0.6, 0.999999]) assert.equal(spawnStage(1, () => r), 1);
  const w = CONFIG.enemy.stageWeights[2];
  assert.equal(spawnStage(2, () => 0), 1);
  assert.equal(spawnStage(2, () => w[0] + 1e-9), 2);
  assert.equal(spawnStage(2, () => w[0] + w[1] + 1e-9), 3);
  assert.equal(spawnStage(2, () => 0.999999), 3);
  assert.equal(spawnStage(undefined, () => 0), 1);
  assert.equal(spawnStage(9, () => 0.999999), spawnStage(3, () => 0.999999));
  const counts = { 1: 0, 2: 0, 3: 0 };
  let seed = 12345;
  const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const N = 20000;
  for (let i = 0; i < N; i++) counts[spawnStage(3, rng)]++;
  const t = CONFIG.enemy.stageWeights[3];
  const sum = t[0] + t[1] + t[2];
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(counts[i + 1] / N - t[i] / sum) < 0.02);
});

test('spawnPoint: 상위 단계 적은 크기가 작아도 시작 때 플레이어에게서 멀리 둔다', () => {
  const player = { x: 2000, y: 2000, size: 28, stage: 1 };
  const near = [[100, 130], [100, 130]];
  const gap = (stage) => {
    const pos = spawnPoint(player, [], 20, { near: [100, 130], initial: true, stage });
    return pos ? Math.hypot(pos.x - player.x, pos.y - player.y) : null;
  };
  assert.ok(near);
  assert.equal(gap(2), null);
  const lower = gap(1);
  assert.ok(lower !== null && lower >= 100);
});
