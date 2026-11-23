import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import {
  stageOf, canEat, eatPair, reversalPair, preyValue, enemyPreyValue, preyInfoOf, newDiet, bodyCostAt, topDietDir, pickEvolution, nextProgress,
  stageOverrideMult,
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

test('단계 차가 클수록 하위가 이기려면 더 커야 한다: 단계 차 1·2·3·4에 2·3·4·5배(사용자 결정)', () => {
  assert.equal(CONFIG.eating.stageOverrideStep, 1);
  assert.deepEqual([1, 2, 3, 4].map(stageOverrideMult), [2, 3, 4, 5]);
  for (let gap = 1; gap <= 4; gap++) {
    const need = gap + 1;
    const up = 5; // 항상 5단계가 상위, 하위는 5 - gap단계
    const low = up - gap;
    // 하위가 상위의 need배 이상이면 하위가 먹고, 미만이면 상위가 먹는다(경계 포함).
    assert.equal(canEat(A(10 * need, low), A(10, up)), true, `gap${gap} 하위가 ${need}배`);
    assert.equal(canEat(A(10 * need - 0.01, low), A(10, up)), false, `gap${gap} 하위가 ${need}배 미만`);
    assert.equal(canEat(A(10, up), A(10 * need - 0.01, low)), true, `gap${gap} 상위가 먹는다`);
    assert.equal(canEat(A(10, up), A(10 * need, low)), false, `gap${gap} 상위가 못 먹는다`);
  }
  // 갓 진화한 5단계(크기 28)는 4단계 56, 3단계 84, 2단계 112, 1단계 140이 있어야 먹힌다.
  for (const [low, need] of [[4, 56], [3, 84], [2, 112], [1, 140]]) {
    assert.equal(canEat(A(need, low), A(28, 5)), true, `단계 ${low}`);
    assert.equal(canEat(A(need - 0.01, low), A(28, 5)), false, `단계 ${low} 미만`);
  }
  // 같은 단계는 지금처럼 ratio. 보물 역전은 단계를 무시하는 rules.reversalPair가 맡는다.
  assert.equal(canEat(A(11, 5), A(10, 5)), true);
  assert.equal(canEat(A(10.99, 5), A(10, 5)), false);
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

test('preyValue: base × (먹이 크기 / 내 크기)^2 × 단계 배율, 4·5단계 배율은 ×24 / ×176(3단계 ×16)', () => {
  const s = CONFIG.score;
  assert.deepEqual(s.stageMult, { 1: 1, 2: 4, 3: 16, 4: 24, 5: 176 });
  assert.equal(s.base, 28);
  assert.equal(s.relExp, 2);
  // 내 크기와 같은 크기의 C등급 먹이 = base × 단계 배율
  const same = (stage) => preyValue({ size: 10, stage, grade: 'C', mySize: 10 });
  assert.deepEqual([1, 2, 3, 4, 5].map(same), [28, 112, 448, 672, 4928]);
  // 먹이 크기가 두 배면 4배, 내 크기가 두 배면 1/4배(같은 먹이도 내가 커질수록 요력이 준다)
  assert.equal(preyValue({ size: 20, stage: 1, grade: 'C', mySize: 20 }), 28);
  assert.equal(preyValue({ size: 20, stage: 1, grade: 'C', mySize: 10 }), 112);
  assert.equal(preyValue({ size: 10, stage: 1, grade: 'C', mySize: 20 }), 7);
  // 내 크기를 모르면 sizeRef(시작 크기 28/3)를 쓴다
  assert.equal(preyValue({ size: 28 / 3, stage: 2, grade: 'C' }), 112);
  assert.equal(preyValue({ size: 28 / 3, stage: 2, grade: 'C', mySize: 0 }), 112);
  assert.equal(preyValue({ size: 28 / 3, stage: 2, grade: 'C', mySize: NaN }), 112);
  // 같은 단계 먹이(내 크기)로 다음 진화비를 모으는 마리 수: 3.6 / 3.6 / 4.5 / 11.9
  assert.ok(Math.abs(evolutionCost(2) / same(1) - 3.6) < 0.05);
  assert.ok(Math.abs(evolutionCost(3) / same(2) - 3.6) < 0.05);
  assert.ok(Math.abs(evolutionCost(4) / same(3) - 4.5) < 0.05);
  assert.ok(Math.abs(evolutionCost(5) / same(4) - 11.9) < 0.05);
  assert.deepEqual([evolutionCost(2), evolutionCost(3), evolutionCost(4), evolutionCost(5)], [100, 400, 2000, 8000]);
});

test('preyValue: 먹이 크기는 처음 크기라 보물에 깎여도 같다 — 내 크기만 달라지면 값이 바뀐다', () => {
  const full = { size: 60, stage: 4, grade: 'C', killedByTreasure: true };
  assert.equal(preyValue({ ...full, mySize: 30 }), Math.round(28 * 2 ** 2 * 24 * 1.5));
  assert.ok(preyValue({ ...full, mySize: 60 }) < preyValue({ ...full, mySize: 30 }));
  assert.ok(preyValue({ ...full, mySize: 15 }) > preyValue({ ...full, mySize: 30 }));
});

test('enemyPreyValue: 적이 먹어서 쌓는 요력은 예전 절대 크기 식 그대로다(플레이어 요력 곡선과 따로)', () => {
  assert.deepEqual(CONFIG.enemyScore, { base: 10, sizeRef: 20 / 3, sizeExp: 1.6, stageMult: { 1: 1, 2: 4, 3: 16, 4: 48, 5: 128 } });
  const c40 = (stage) => enemyPreyValue({ size: 40 / 3, stage, grade: 'C' }); // 시작 크기 1/3: 예전 크기 40
  assert.deepEqual([1, 2, 3, 4, 5].map(c40), [30, 121, 485, 1455, 3880]);
  assert.equal(enemyPreyValue({ size: 10, stage: 3, grade: 'C', special: true }), Math.round(10 * (10 / (20 / 3)) ** 1.6 * 16 * 8));
  assert.ok(enemyPreyValue({ size: 1, stage: 1, grade: 'F' }) >= 1);
  // 크기와 상관없이 내 크기(mySize)를 읽지 않는다: 먹는 쪽이 커져도 같은 먹이는 같은 요력이다.
  assert.equal(enemyPreyValue({ size: 12, stage: 2, mySize: 6 }), enemyPreyValue({ size: 12, stage: 2, mySize: 60 }));
  // 같은 먹이를 플레이어가 먹으면 먹는 순간의 내 크기에 따라 다르다(변경 이력 18).
  assert.ok(preyValue({ size: 12, stage: 2, mySize: 6 }) > preyValue({ size: 12, stage: 2, mySize: 60 }));
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
  const info = preyInfoOf({ size: 30, stage: 3, grade: 'A', special: true, dir: 'east' }, true, 12);
  assert.deepEqual(info, { size: 30, stage: 3, grade: 'A', special: true, killedByTreasure: true, dir: 'east', mySize: 12 });
  assert.equal(preyInfoOf({ size: 30 }).mySize, undefined);
  assert.equal(preyInfoOf({ size: 5 }).stage, 1);
  assert.equal(preyInfoOf({ size: 5 }).special, false);
  assert.ok(preyValue(preyInfoOf({ size: 5 })) >= 1);
});

test('bodyCostAt은 설정 공식(기본 비용 × enhanceCostGrowth^레벨, 레벨마다 2배)이다', () => {
  const l = CONFIG.levelUp;
  assert.equal(CONFIG.enhanceCostGrowth, 2);
  assert.equal(bodyCostAt(0), l.bodyBaseCost);
  assert.ok(Math.abs(bodyCostAt(3) - l.bodyBaseCost * CONFIG.enhanceCostGrowth ** 3) < 1e-9);
  assert.deepEqual([0, 1, 2, 3].map(bodyCostAt), [30, 60, 120, 240]);
});

test('topDietDir: 식성 1위, 동률이면 내 방위, 모두 0이면 fallback 또는 null', () => {
  assert.equal(topDietDir({ east: 1, west: 9, south: 3, north: 0 }, 'east'), 'west');
  assert.equal(topDietDir({ east: 5, west: 5, south: 0, north: 0 }, 'west'), 'west');
  assert.equal(topDietDir({ east: 5, west: 5, south: 0, north: 0 }, 'north'), 'east');
  assert.equal(topDietDir(newDiet(), 'south'), 'south');
  assert.equal(topDietDir(newDiet()), null);
});

test('pickEvolution: 식성 1위가 다른 방위면 그 방위 입구 4개 중, 같으면 지금 줄기의 다음 단계 중 무작위(줄기를 모르면 같은 방위)', () => {
  const eater = { stage: 1, dir: 'east', diet: { east: 1, west: 0, south: 9, north: 0 } };
  const entries = new Set();
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const baby = pickEvolution(eater, FORMS, () => r);
    assert.equal(baby.stage, 2);
    assert.equal(baby.dir, 'south');
    assert.equal(baby.entry, true);
    entries.add(baby.stem);
  }
  assert.deepEqual([...entries].sort(), ['S1', 'S2', 'S3', 'S4']);
  // 식성 1위 = 지금 방위: 같은 줄기의 다음 단계(청구 여우 E2 → 4단계 E2 세 형태).
  const fox = { stage: 3, formId: 'hillFox', dir: 'east', diet: { east: 5, west: 0, south: 1, north: 0 } };
  const seenFox = new Set();
  for (const r of [0, 0.4, 0.99]) {
    const form = pickEvolution(fox, FORMS, () => r);
    assert.equal(form.stage, 4);
    assert.equal(form.stem, 'E2');
    seenFox.add(form.id);
  }
  assert.deepEqual([...seenFox].sort(), ['bi', 'gumiho', 'sabisi']);
  // 식성이 모두 0이면 지금 방위·지금 줄기다.
  assert.equal(pickEvolution({ stage: 2, formId: 'littleTiger', dir: 'west', diet: newDiet() }, FORMS, () => 0).stem, 'W1');
  const little = { stage: 2, dir: 'north', diet: newDiet() };
  const seen = new Set();
  for (const r of [0, 0.4, 0.99]) {
    const form = pickEvolution(little, FORMS, () => r);
    assert.equal(form.stage, 3);
    assert.equal(form.dir, 'north');
    seen.add(form.id);
  }
  assert.equal(seen.size, 3);
  assert.equal(pickEvolution({ stage: 5, dir: 'east' }, FORMS), null);
  assert.equal(pickEvolution({ stage: 1, dir: 'none', diet: newDiet() }, FORMS, () => 0).stage, 2);
});

test('nextProgress: 진화가 몸집 강화보다 우선, 5단계는 몸집 강화만, 부족하면 null', () => {
  const body = bodyCostAt(0);
  assert.equal(nextProgress({ stage: 1, yoryeok: body - 1, bodyLevel: 0 }), null);
  assert.equal(nextProgress({ stage: 1, yoryeok: body, bodyLevel: 0 }), 'body');
  assert.equal(nextProgress({ stage: 1, yoryeok: evolutionCost(2), bodyLevel: 0 }), 'evolve');
  assert.equal(nextProgress({ stage: 2, yoryeok: evolutionCost(3), bodyLevel: 0 }), 'evolve');
  assert.equal(nextProgress({ stage: 3, yoryeok: evolutionCost(4), bodyLevel: 0 }), 'evolve');
  assert.equal(nextProgress({ stage: 4, yoryeok: evolutionCost(5), bodyLevel: 0 }), 'evolve');
  assert.equal(nextProgress({ stage: 4, yoryeok: evolutionCost(5) - 1, bodyLevel: 0 }), 'body');
  assert.equal(nextProgress({ stage: 5, yoryeok: evolutionCost(5) * 5, bodyLevel: 0 }), 'body');
  assert.equal(nextProgress({ stage: 1, yoryeok: body, bodyLevel: 1 }), null);
});

test('nextProgress: 플레이어 단계를 주면 적의 자가 진화는 min(5, 플레이어 단계 + 1) 미만일 때만(selfEvolveLead)', () => {
  const rich = (stage) => ({ stage, yoryeok: evolutionCost(stage + 1), bodyLevel: 0 });
  assert.equal(CONFIG.enemy.selfEvolveLead, 1);
  assert.equal(nextProgress(rich(1), 1), 'evolve'); // 플레이어 1단계: 적은 2단계까지
  assert.notEqual(nextProgress(rich(2), 1), 'evolve');
  assert.equal(nextProgress(rich(3), 3), 'evolve'); // 플레이어 3단계: 적은 4단계까지
  assert.notEqual(nextProgress(rich(4), 3), 'evolve');
  assert.equal(nextProgress(rich(4), 4), 'evolve'); // 5단계 용은 플레이어가 4단계가 돼야 생긴다
  assert.equal(nextProgress(rich(4), 5), 'evolve');
  assert.notEqual(nextProgress({ stage: 5, yoryeok: 1e6, bodyLevel: 0 }, 5), 'evolve');
  assert.equal(nextProgress(rich(2)), 'evolve'); // 플레이어 단계를 안 주면 상한은 pace.maxStage
});

test('spawnStage: 구간 경계와 가중치 비율, 알 수 없는 플레이어 단계는 1단계 표', () => {
  // 플레이어 1단계: 적도 모두 1단계(사용자 지시 2026-11-23)
  for (const r of [0, 0.3, 0.6, 0.999999]) assert.equal(spawnStage(1, () => r), 1);
  const w = [0.35 / 1.1, 0.45 / 1.1, 0.3 / 1.1];
  assert.equal(spawnStage(2, () => 0), 1);
  assert.equal(spawnStage(2, () => w[0] + 1e-9), 2);
  assert.equal(spawnStage(2, () => w[0] + w[1] + 1e-9), 3);
  assert.equal(spawnStage(2, () => 0.999999), 3);
  assert.equal(spawnStage(undefined, () => 0), 1);
  // 1~5단계 5행(설계 5절). 1행만 사용자 지시로 1단계 100%이고 나머지는 설계 표 그대로다.
  const table = CONFIG.enemy.stageWeights;
  assert.deepEqual(Object.keys(table), ['1', '2', '3', '4', '5']);
  assert.deepEqual(table[2], [0.35, 0.45, 0.2, 0, 0]);
  // 3단계 이후는 사용자 지시(2026-11-23: 적이 너무 약하다)로 높였다
  assert.deepEqual(table[3], [0.05, 0.15, 0.35, 0.3, 0.15]);
  assert.deepEqual(table[4], [0.02, 0.08, 0.25, 0.4, 0.25]);
  assert.deepEqual(table[5], [0, 0.04, 0.16, 0.35, 0.45]);
  for (const row of Object.values(table)) {
    assert.equal(row.length, 5);
    assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
  assert.equal(spawnStage(9, () => 0.999999), spawnStage(5, () => 0.999999)); // 5단계 위는 5단계 표
  assert.equal(spawnStage(5, () => 0.999999), 5);
  assert.equal(spawnStage(3, () => 0.999999), 5); // 3단계 표에도 5단계 적이 15%(사용자 지시: 3단계 이후 적을 강하게)
  let seed = 12345;
  const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const N = 40000;
  for (const playerStage of [2, 3, 4, 5]) {
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) counts[spawnStage(playerStage, rng)]++;
    const scaled = table[playerStage].map((weight, i) => weight * (i + 1 > playerStage ? 1.5 : 1));
    const total = scaled.reduce((a, b) => a + b, 0);
    const t = scaled.map(weight => weight / total);
    for (let i = 0; i < 5; i++) assert.ok(Math.abs(counts[i + 1] / N - t[i]) < 0.02, `플레이어 ${playerStage}단계 → 적 ${i + 1}단계`);
  }
});

test('spawnPoint: 상위 단계 적은 크기가 작아도 시작 때 플레이어에게서 멀리 둔다', () => {
  const mid = CONFIG.world.size / 2;
  const player = { x: mid, y: mid, size: 28, stage: 1 };
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
