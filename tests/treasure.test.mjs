import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../src/systems/progress.js';
import {
  tryUpgrade, sellPrice, upgradeCost, treasureStats, treasureTitle,
  dropChance, addToInventory, equip, sell, exchangeShards,
} from '../src/systems/treasure.js';

test('강화 결과가 성공이면 기존 여의주가 올라가고 안전 구간 실패면 유지된다', () => {
  const treasure = { level: 0 };
  assert.deepEqual(tryUpgrade(treasure, { rng: () => 0 }), {
    result: 'success', from: 0, to: 1, shards: 0,
  });
  assert.equal(treasure.level, 1);
  assert.deepEqual(tryUpgrade(treasure, { rng: () => 0.85 }), {
    result: 'fail', from: 1, to: 1, shards: 0,
  });
  assert.equal(treasure.level, 1);
});

test('성공·파손 확률의 경계와 파손된 여의주의 중복 지급 방지', () => {
  for (const [roll, result] of [[0.09999, 'break'], [0.10, 'fail']]) {
    const treasure = { level: 5 };
    const draws = [0.60, roll];
    const outcome = tryUpgrade(treasure, { rng: () => draws.shift() });
    assert.equal(draws.length, 0);
    if (result === 'break') {
      assert.deepEqual(outcome, { result: 'break', from: 5, to: null, shards: 5 });
      assert.equal(treasure.level, null);
      assert.throws(() => tryUpgrade(treasure), RangeError);
    } else {
      assert.deepEqual(outcome, { result: 'fail', from: 5, to: 5, shards: 0 });
      assert.equal(treasure.level, 5);
    }
  }
  const treasure = { level: 14 };
  assert.equal(tryUpgrade(treasure, { rng: () => 0.09999 }).to, 15);
  assert.throws(() => tryUpgrade(treasure, { rng: () => assert.fail('최고 레벨에서 추첨') }), RangeError);
});

test('판매가 기준점, 다음 단계 판매가 기준 강화 비용, 레벨별 전투 수치와 칭호', () => {
  assert.deepEqual([0, 5, 10, 15].map(sellPrice), [5, 300, 5000, 100000]);
  assert.equal(upgradeCost(4), 20);
  assert.equal(upgradeCost(9), 200);
  assert.equal(upgradeCost(14), 2000);
  assert.equal(upgradeCost(15), Infinity);
  for (let level = 0; level < 15; level++) {
    const nextPrice = sellPrice(level + 1);
    assert.ok(nextPrice > sellPrice(level));
    // 판매가를 올려도 강화 비용은 예전 곡선(costPrices) 기준 그대로다.
    assert.ok(upgradeCost(level) < nextPrice * 0.2 || level < 1);
    assert.ok(sellPrice(level + 1) >= upgradeCost(level));
    const current = treasureStats(level);
    const next = treasureStats(level + 1);
    assert.ok(current.damage > 0 && next.damage > current.damage);
    assert.ok(current.chargePower > 0 && next.chargePower > current.chargePower);
    assert.ok(Number.isInteger(current.shots) && next.shots >= current.shots);
    assert.ok(next.ways >= current.ways && next.perWay >= current.perWay);
    assert.ok(next.speedMult > current.speedMult && next.homing >= current.homing);
  }
  for (let level = 0; level <= 15; level++) {
    const s = treasureStats(level);
    assert.ok(s.ways >= 1 && s.perWay >= 1 && s.speedMult >= 1 && s.homing >= 0 && s.homing <= 1);
    assert.equal(s.shots, s.ways * s.perWay);
  }
  assert.deepEqual(treasureStats(0), { damage: 1, ways: 1, perWay: 1, speedMult: 1, homing: 0, shots: 1, chargePower: 1 });
  assert.equal(treasureStats(8).homing, 0.3);
  assert.equal(treasureStats(7).homing, 0);
  assert.deepEqual([0, 3, 5, 6, 11].map((level) => treasureStats(level).ways), [1, 2, 3, 4, 8]);
  assert.ok(Math.abs(treasureStats(15).damage - 1 * 4.6) < 1e-9);
  assert.equal(treasureTitle(7), '+7 여의주');
  assert.deepEqual([10, 11, 12, 13, 14, 15].map(treasureTitle), [
    '+10 바람 여의주', '+11 번개 여의주', '+12 천둥 여의주', '+13 폭풍 여의주', '+14 하늘 여의주', '+15 용왕 여의주',
  ]);
});

test('보관함 5칸과 장착 1칸을 따로 유지하며 가득 찬 상태에서도 장착 교환이 가능하다', () => {
  const p = createProgress();
  const treasures = [0, 1, 2, 3, 4, 5].map((level) => ({ level }));
  for (const orb of treasures.slice(0, 5)) assert.equal(addToInventory(p, orb), true);
  assert.equal(addToInventory(p, treasures[5]), false);
  assert.equal(p.treasure, null);
  assert.equal(equip(p, 1), true);
  assert.equal(p.treasure, treasures[1]);
  assert.equal(p.inventory.length, 4);
  assert.equal(addToInventory(p, treasures[1]), false);
  assert.equal(addToInventory(p, treasures[0]), false);
  assert.equal(addToInventory(p, treasures[5]), true);
  assert.equal(equip(p, 4), true);
  assert.equal(p.treasure, treasures[5]);
  assert.equal(p.inventory.length, 5);
  assert.equal(p.inventory[4], treasures[1]);
  assert.equal(sell(p, 'equipped'), 300);
  assert.equal(sell(p, 'equipped'), 0);
  assert.equal(p.treasure, null);
  assert.equal(sell(p, 0), 5);
  assert.equal(p.yoryeok, 305);
  assert.equal(p.inventory.length, 4);
  for (const slot of [-1, 4, 0.5, '0']) {
    assert.equal(equip(p, slot), false);
    assert.equal(sell(p, slot), 0);
  }
  assert.equal(p.yoryeok, 305);
  assert.equal(p.inventory.length, 4);
});

test('파손 보상의 파편을 기존 잔액에 합쳐 보호권으로 교환하고 잔여 파편을 보존한다', () => {
  const p = createProgress();
  p.protect = 1;
  p.shards = 9;
  assert.equal(exchangeShards(p), 0);
  const draws = [0.9, 0.49];
  const outcome = tryUpgrade({ level: 14 }, { rng: () => draws.shift() });
  assert.equal(outcome.shards, 14);
  p.shards += outcome.shards;
  assert.equal(exchangeShards(p), 2);
  assert.equal(p.shards, 3);
  assert.equal(p.protect, 3);
  assert.equal(exchangeShards(p), 0);
});

function seeded(initial) {
  let seed = initial;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual}% / 기대 ${expected}%`);
}

test('각 목표 10만 회: 여의주 성공·실패·파손과 실패 중 파손 비율이 기획의 ±1%p 이내', () => {
  const success = [90, 85, 80, 75, 70, 60, 55, 50, 45, 40, 30, 25, 20, 15, 10];
  const breakOnFailure = [0, 0, 0, 0, 0, 10, 12.5, 15, 17.5, 20, 30, 35, 40, 45, 50];
  const rng = seeded(0xf19e);
  const trials = 100_000;
  for (const [level, chance] of success.entries()) {
    const counts = { success: 0, fail: 0, break: 0 };
    const breakChance = (100 - chance) * breakOnFailure[level] / 100;
    for (let i = 0; i < trials; i++) {
      const { result } = tryUpgrade({ level }, { rng });
      counts[result]++;
    }
    close(counts.success * 100 / trials, chance, `+${level + 1} 성공`);
    close(counts.fail * 100 / trials, 100 - chance - breakChance, `+${level + 1} 실패`);
    close(counts.break * 100 / trials, breakChance, `+${level + 1} 파손`);
    close(counts.break * 100 / (counts.break + counts.fail), breakOnFailure[level], `+${level + 1} 실패 중 파손`);
  }
});

test('일반 처치와 보물 처치 드롭률 각 10만 회', () => {
  assert.equal(dropChance(), 0.08);
  for (const [killedByTreasure, percent] of [[false, 8], [true, 20]]) {
    const chance = dropChance({ killedByTreasure });
    assert.equal(chance, percent / 100);
    const rng = seeded(0x971);
    let drops = 0;
    for (let i = 0; i < 100_000; i++) if (rng() < chance) drops++;
    close(drops / 1000, percent, '드롭');
  }
});

test('물건 기준 API: sellPrice(item)·upgradeCost(item)은 kind와 paid를 따르고 레벨 숫자 호출과 값이 같다', () => {
  for (let level = 0; level <= 15; level++) {
    assert.equal(sellPrice({ kind: 'fan', level }), sellPrice(level));
    assert.equal(upgradeCost({ kind: 'bell', level }), upgradeCost(level));
  }
  assert.equal(sellPrice({ kind: 'seal', level: 5, paid: 55 }), 55);
  assert.equal(sellPrice({ kind: 'seal', level: 5, paid: 5000 }), 300);
});

test('보패도 보관함·장착 칸을 같은 규칙으로 쓴다: 장착을 바꾸면 물건이 통째로 맞바뀌고 kind·paid가 따라온다', () => {
  const p = createProgress();
  const fan = { kind: 'fan', level: 3, paid: 80 };
  const bell = { kind: 'bell', level: 1, paid: 28 };
  assert.equal(addToInventory(p, fan), true);
  assert.equal(addToInventory(p, bell), true);
  assert.equal(equip(p, 0), true);
  assert.equal(p.treasure, fan);
  assert.deepEqual(p.inventory, [bell]);
  assert.equal(addToInventory(p, { kind: 'mirror', level: 99 }), false, '레벨이 이상한 물건은 받지 않는다');
  assert.equal(equip(p, 0), true);
  assert.equal(p.treasure, bell);
  assert.deepEqual(p.inventory, [fan]);
  assert.equal(sell(p, 0), 58, '산 값 80이어도 표 판매가 58까지만(본전 상한은 둘 중 작은 값)');
});
