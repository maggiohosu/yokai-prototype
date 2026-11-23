import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../src/systems/progress.js';
import {
  tryEnhance, getEnhanceOdds, enhanceCost, applyDegradeChoice, autoEnhance,
} from '../src/systems/enhance.js';

function rolls(...values) {
  return () => {
    assert.ok(values.length, '예정한 횟수보다 많이 추첨했다');
    return values.shift();
  };
}

test('실패 보너스는 다른 능력치에도 적용되고 대성공하면 초기화된다', () => {
  const p = createProgress();
  assert.deepEqual(tryEnhance(p, 'speed', { rng: rolls(0.95) }), {
    result: 'fail', from: 0, to: 0, chanceUsed: 95, pityBonusAfter: 5, needsChoice: false,
  });
  assert.deepEqual(getEnhanceOdds(p, 'growth'), { success: 95, great: 5, fail: 0, degrade: 0 });
  assert.deepEqual(tryEnhance(p, 'growth', { rng: rolls(0.999, 0) }), {
    result: 'great', from: 0, to: 2, chanceUsed: 100, pityBonusAfter: 0, needsChoice: false,
  });
  assert.deepEqual(p.enh, { growth: 2, speed: 0, vitality: 0 });
  assert.equal(p.pity, 0);
});

function atLevel(level) {
  const p = createProgress();
  p.enh.vitality = level;
  return p;
}

test('같은 퇴화는 한 번만 선택하며 1단계에서 B를 거절해도 A를 고를 수 있다', () => {
  const p = atLevel(5);
  const result = tryEnhance(p, 'vitality', { rng: rolls(0.50, 0.29) });
  assert.deepEqual(result, {
    result: 'degrade', from: 5, to: 5, chanceUsed: 50, pityBonusAfter: 5, needsChoice: true,
  });
  assert.deepEqual(applyDegradeChoice(p, 'B', 'vitality'), { ok: false });
  assert.deepEqual(applyDegradeChoice(p, 'A', 'speed'), { ok: false });
  assert.throws(() => tryEnhance(p, 'speed', { rng: rolls() }), /퇴화/);
  assert.deepEqual(autoEnhance(p, 'speed', 2), { attempts: [], reason: 'degrade' });
  assert.deepEqual(applyDegradeChoice(p, 'A', 'vitality'), { ok: true });
  assert.deepEqual(applyDegradeChoice(p, 'A', 'vitality'), { ok: false });
  assert.equal(p.enh.vitality, 4);
  assert.equal(p.pity, 5);
});

test('상위 단계의 B 선택은 강화 레벨을 보존하고 역진화를 예약한다', () => {
  const p = atLevel(9);
  p.stage = 3;
  tryEnhance(p, 'vitality', { rng: rolls(0.9, 0.1) });
  assert.deepEqual(applyDegradeChoice(p, 'B', 'vitality'), { ok: true });
  assert.equal(p.pendingDevolve, true);
  assert.equal(p.stage, 3);
  assert.equal(p.enh.vitality, 9);
  assert.equal(p.pity, 5);
});

test('보호권은 퇴화가 추첨된 경우에만 하나 소모하고 표시 확률에도 반영한다', () => {
  const p = atLevel(4);
  p.protect = 1;
  assert.deepEqual(getEnhanceOdds(p, 'vitality'), { success: 57, great: 3, fail: 40, degrade: 0 });
  assert.equal(tryEnhance(p, 'vitality', { rng: rolls(0.8, 0.60) }).result, 'fail');
  assert.equal(p.protect, 1);
  assert.deepEqual(tryEnhance(p, 'vitality', { rng: rolls(0.8, 0.59) }), {
    result: 'fail', from: 4, to: 4, chanceUsed: 65, pityBonusAfter: 10,
    needsChoice: false, protectedUsed: true,
  });
  assert.equal(p.protect, 0);
  assert.deepEqual(applyDegradeChoice(p, 'A', 'vitality'), { ok: false });
  assert.deepEqual(getEnhanceOdds(p, 'vitality'), { success: 66.5, great: 3.5, fail: 12, degrade: 18 });
});

test('대성공도 +20이 상한이며 최고 레벨에서는 비용 차감과 추첨이 없다', () => {
  const p = atLevel(19); // 최고 레벨이 10에서 20으로 늘었다(2026-11-24, 변경 이력 22)
  p.pity = 95;
  const result = tryEnhance(p, 'vitality', { rng: rolls(0.999, 0.049) });
  assert.equal(result.chanceUsed, 100);
  assert.equal(result.result, 'great');
  assert.equal(result.to, 20); // 19 + 2 = 21이지만 상한 20
  assert.equal(p.pity, 0);
  assert.deepEqual(getEnhanceOdds(p, 'vitality'), { success: 0, great: 0, fail: 0, degrade: 0 });
  assert.throws(() => tryEnhance(p, 'vitality', { rng: rolls() }), RangeError);
  assert.deepEqual(autoEnhance(p, 'vitality', 20), { attempts: [], reason: 'max' });
  assert.equal(enhanceCost(20), Infinity);
  assert.throws(() => enhanceCost(21), RangeError);
});

test('+10은 더 이상 최고 레벨이 아니다: 비용·확률이 있고 +11로 오른다', () => {
  const p = atLevel(10);
  assert.equal(Number.isFinite(enhanceCost(10)), true);
  assert.deepEqual(getEnhanceOdds(p, 'vitality'), { success: 9.5, great: 0.5, fail: 0, degrade: 90 });
  const result = tryEnhance(p, 'vitality', { rng: rolls(0.05, 0.9) });
  assert.deepEqual([result.result, result.from, result.to], ['success', 10, 11]);
});

test('자동 강화는 매 시도 현재 레벨의 비용을 지불하고 목표 또는 요력 부족에서 멈춘다', () => {
  const p = createProgress();
  p.yoryeok = 72; // 20(실패) + 20(성공) + 32(성공): 1~5레벨은 레벨마다 1.6배
  const { attempts, reason } = autoEnhance(p, 'growth', 2, { rng: rolls(0.96, 0.99, 0.05, 0, 0.5) });
  assert.deepEqual(attempts.map(({ result }) => result), ['fail', 'success', 'success']);
  assert.equal(reason, 'target');
  assert.equal(p.yoryeok, 0);
  assert.deepEqual(autoEnhance(p, 'growth', 2, { rng: rolls() }), { attempts: [], reason: 'target' });
  assert.deepEqual(autoEnhance(p, 'growth', 3, { rng: rolls() }), { attempts: [], reason: 'gold' });
  // 1~5레벨은 1.6배씩(20·32·51·82·131·210), 5레벨을 넘으면 2배씩(419·839·…). 변경 이력 22.
  assert.deepEqual([0, 1, 2, 5, 9].map(enhanceCost), [20, 32, 51, 210, 3355]);
});

test('자동 강화는 퇴화와 대성공이면 즉시 멈추고, S·S+는 일반 결과도 한 번만 시도한다', () => {
  for (const [grade, draws, reason] of [
    ['A', [0.9, 0.1], 'degrade'],
    ['C', [0.1, 0.01], 'great'],
    ['S', [0.1, 0.5], 'max'],
    ['S+', [0.9, 0.9], 'max'],
  ]) {
    const p = atLevel(5);
    p.grade = grade;
    const checked = [], paid = [];
    const batch = autoEnhance(p, 'vitality', 9, {
      rng: rolls(...draws),
      canAfford: (cost) => { checked.push(cost); return true; },
      pay: (cost) => { paid.push(cost); },
    });
    assert.equal(batch.reason, reason);
    assert.equal(batch.attempts.length, 1);
    assert.deepEqual(checked, [210]);
    assert.deepEqual(paid, [210]);
  }
  const p = atLevel(5);
  const rejected = autoEnhance(p, 'vitality', 6, {
    rng: rolls(), canAfford: () => true, pay: () => false,
  });
  assert.deepEqual(rejected, { attempts: [], reason: 'gold' });
  assert.equal(p.enh.vitality, 5);
});

test('실패에 치우친 고정 RNG와 도달 불가능한 목표도 천장과 최고 레벨에서 끝난다', () => {
  const p = createProgress();
  // +9 시도부터 퇴화 확률이 100%(2026-11-23, +10 이후는 변경 이력 22의 연장)라 보호권이 없으면 첫 실패에서 멈춘다. 항상 실패 쪽 굴림이면 천장이 100%에 닿아야 성공한다:
  // 실패 수 = 레벨 0~7이 1·2·4·6·8·10·12·14(합 57), +8 시도 16번, +9 시도 18번, +10~+19 시도가 각 18번(180)이고 퇴화(100%)는 +8 시도부터라 보호권 16 + 18 + 180 = 214장이 받는다.
  p.protect = 214;
  let attempts = 0;
  const reasons = [];
  while (p.enh.growth < 21) {
    const batch = autoEnhance(p, 'growth', 21, { rng: () => 0.999999, canAfford: () => true, pay: () => {} });
    attempts += batch.attempts.length;
    reasons.push(batch.reason);
    if (batch.reason === 'max' && p.enh.growth === 20) break;
    assert.ok(reasons.length < 10, '끝나지 않는다');
  }
  assert.equal(p.enh.growth, 20);
  assert.equal(attempts, 20 + 57 + 16 + 18 + 180); // 성공 20번 + 실패 271번
  assert.equal(p.protect, 0);
  // 한 번에 autoLimit(200)번까지만 시도하므로 두 묶음이다: 첫 묶음은 한도에서 끝나고(reason 'max', 아직 +20이 아님) 둘째 묶음이 +20에서 끝난다.
  assert.deepEqual(reasons, ['max', 'max']);
});

test('각 목표 10만 회: 본체 강화 표시 및 실측 네 결과가 기획 확률의 ±1%p 이내', () => {
  const success = [95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]; // +10 이후는 10% 바닥(2026-11-24)
  const conditionalDegrade = [0, 0, 0, 0, 60, 60, 80, 80, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]; // 파괴(퇴화) 확률 2배(2026-11-23), +10 이후는 100 상한의 연장
  const trials = 100_000;
  let seed = 0x315dc6;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  function close(actual, expected, label) {
    assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual}% / 기대 ${expected}%`);
  }
  for (const [level, chance] of success.entries()) {
    const great = chance * 0.05;
    const degrade = (100 - chance) * conditionalDegrade[level] / 100;
    const expected = { success: chance - great, great, fail: 100 - chance - degrade, degrade };
    const counts = { success: 0, great: 0, fail: 0, degrade: 0 };
    assert.deepEqual(getEnhanceOdds(atLevel(level), 'vitality'), expected);
    for (let i = 0; i < trials; i++) {
      const { result } = tryEnhance(atLevel(level), 'vitality', { rng });
      counts[result]++;
    }
    for (const [result, percent] of Object.entries(expected)) {
      close(counts[result] * 100 / trials, percent, `+${level + 1} ${result}`);
    }
    close(100 * counts.great / (counts.success + counts.great), 5, '성공 중 대성공');
    close(100 * counts.degrade / (counts.fail + counts.degrade), conditionalDegrade[level], '실패 중 퇴화');
  }
});
