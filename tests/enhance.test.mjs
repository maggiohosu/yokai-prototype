import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../src/systems/progress.js';
import { ENHANCE } from '../src/systems/tuning-upgrade.js';
import {
  tryEnhance, getEnhanceOdds, enhanceCost, applyDegradeChoice, autoEnhance,
} from '../src/systems/enhance.js';

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps, actual + ' !≈ ' + expected);
function nearOdds(actual, expected) {
  for (const key of ['success', 'great', 'fail', 'degrade']) near(actual[key], expected[key], 1e-9);
}

function rolls(...values) {
  return () => {
    assert.ok(values.length, '예정한 횟수보다 많이 추첨했다');
    return values.shift();
  };
}

// 확률표(변경 이력 23): 인덱스 4(+5로 올리는 시도) = 성공 50·대성공 20·실패 20·퇴화 10, 인덱스 19(+20) = 4·1·55·40.
// 인덱스 4의 굴림: 총 성공 70(대성공 몫 20/70), 실패 30 중 퇴화 몫 10/30 = 33.33%.
function atLevel(level) {
  const p = createProgress();
  p.enh.vitality = level;
  return p;
}

test('실패 보너스는 다른 능력치에도 적용되고 대성공하면 초기화된다', () => {
  const p = createProgress();
  // +1 시도: 총 성공 95(대성공 20). 0.95는 실패 쪽이고 이 단계는 퇴화가 없어 추가 굴림도 없다.
  assert.deepEqual(tryEnhance(p, 'speed', { rng: rolls(0.95) }), {
    result: 'fail', from: 0, to: 0, chanceUsed: 95, pityBonusAfter: 5, needsChoice: false,
  });
  // 천장 +5%p: 총 성공 100이라 실패가 사라지고, 늘어난 성공도 대성공 몫(20/95)대로 나뉜다.
  nearOdds(getEnhanceOdds(p, 'growth'), { success: 100 * 75 / 95, great: 100 * 20 / 95, fail: 0, degrade: 0 });
  assert.deepEqual(tryEnhance(p, 'growth', { rng: rolls(0.999, 0) }), {
    result: 'great', from: 0, to: 2, chanceUsed: 100, pityBonusAfter: 0, needsChoice: false,
  });
  assert.deepEqual(p.enh, { growth: 2, speed: 0, vitality: 0 });
  assert.equal(p.pity, 0);
});

test('같은 퇴화는 한 번만 선택하며 1단계에서 B를 거절해도 A를 고를 수 있다', () => {
  const p = atLevel(4);
  const result = tryEnhance(p, 'vitality', { rng: rolls(0.80, 0.33) }); // 보호권이 없으면 곧바로 퇴화다
  assert.deepEqual(result, {
    result: 'degrade', from: 4, to: 4, chanceUsed: 70, pityBonusAfter: 5, needsChoice: true,
  });
  assert.deepEqual(applyDegradeChoice(p, 'B', 'vitality'), { ok: false });
  assert.deepEqual(applyDegradeChoice(p, 'A', 'speed'), { ok: false });
  assert.throws(() => tryEnhance(p, 'speed', { rng: rolls() }), /퇴화/);
  assert.deepEqual(autoEnhance(p, 'speed', { rng: rolls() }).reason, 'degrade');
  assert.deepEqual(applyDegradeChoice(p, 'A', 'vitality'), { ok: true });
  assert.deepEqual(applyDegradeChoice(p, 'A', 'vitality'), { ok: false });
  assert.equal(p.enh.vitality, 3);
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

test('퇴화 확률은 표의 퇴화 몫으로 굴린다: +5 시도는 실패 30 중 10(33.3%), 경계 0.33333은 퇴화·0.3334는 실패', () => {
  for (const [roll, result] of [[0.33332, 'degrade'], [0.3334, 'fail']]) {
    const p = atLevel(4);
    assert.equal(tryEnhance(p, 'vitality', { rng: rolls(0.8, roll) }).result, result, String(roll));
  }
  // 퇴화가 없는 단계는 퇴화 굴림 자체를 하지 않는다(굴림 하나만 소비).
  assert.equal(tryEnhance(atLevel(3), 'vitality', { rng: rolls(0.99) }).result, 'fail');
});

test('보호권은 선택이다: 있으면 퇴화가 나와도 쓰지 않고 선택을 기다리며, 없으면 묻지 않고 바로 퇴화다', () => {
  const p = atLevel(4);
  p.protect = 2;
  const result = tryEnhance(p, 'vitality', { rng: rolls(0.8, 0.33) });
  assert.deepEqual(result, {
    result: 'degrade', from: 4, to: 4, chanceUsed: 70, pityBonusAfter: 5, needsChoice: false, needsProtect: true,
  });
  assert.deepEqual(p.pendingProtect, { kind: 'body', stat: 'vitality' });
  assert.equal(p.protect, 2, '선택 전에는 쓰지 않는다');
  assert.equal(p.pendingDegrade, undefined, '퇴화는 아직 확정되지 않았다');
  assert.equal(p.enh.vitality, 4);
  assert.equal(p.pity, 5, '굴림은 끝났다');
  // 선택을 마치기 전에는 새 시도도, 연속 강화도 시작하지 않는다.
  assert.throws(() => tryEnhance(p, 'speed', { rng: rolls() }), /보호권/);
  assert.equal(autoEnhance(p, 'speed', { rng: rolls() }).reason, 'protect');
  // 보호권이 없으면 같은 굴림이 바로 퇴화다.
  const none = atLevel(4);
  const direct = tryEnhance(none, 'vitality', { rng: rolls(0.8, 0.33) });
  assert.equal(direct.needsChoice, true);
  assert.equal(direct.needsProtect, undefined);
  assert.equal(none.pendingDegrade, 'vitality');
  assert.equal(none.pendingProtect, undefined);
});

test('보호권이 있어도 표시 확률은 그대로다(보호권은 굴림이 아니라 굴림 뒤의 선택이라 퇴화를 0%로 보이지 않는다)', () => {
  const p = atLevel(4);
  assert.deepEqual(getEnhanceOdds(p, 'vitality'), { success: 50, great: 20, fail: 20, degrade: 10 });
  p.protect = 5;
  assert.deepEqual(getEnhanceOdds(p, 'vitality'), { success: 50, great: 20, fail: 20, degrade: 10 });
});

test("protect 'use'(연속 강화의 자동 사용)는 선택창 없이 한 장을 쓰고, 'skip'은 보호권이 있어도 퇴화다", () => {
  const used = atLevel(4);
  used.protect = 1;
  assert.deepEqual(tryEnhance(used, 'vitality', { rng: rolls(0.8, 0.33), protect: 'use' }), {
    result: 'fail', from: 4, to: 4, chanceUsed: 70, pityBonusAfter: 5, needsChoice: false, protectedUsed: true,
  });
  assert.equal(used.protect, 0);
  assert.equal(used.pendingProtect, undefined);
  assert.equal(used.pendingDegrade, undefined);
  const skipped = atLevel(4);
  skipped.protect = 1;
  const result = tryEnhance(skipped, 'vitality', { rng: rolls(0.8, 0.33), protect: 'skip' });
  assert.equal(result.needsChoice, true);
  assert.equal(skipped.protect, 1);
  assert.equal(skipped.pendingDegrade, 'vitality');
  // 퇴화가 추첨되지 않은 실패에서는 보호권을 쓰지 않는다.
  const plain = atLevel(4);
  plain.protect = 1;
  assert.equal(tryEnhance(plain, 'vitality', { rng: rolls(0.8, 0.34), protect: 'use' }).result, 'fail');
  assert.equal(plain.protect, 1);
});

test('대성공도 +20이 상한이며 최고 레벨에서는 비용 차감과 추첨이 없다', () => {
  const p = atLevel(19); // 최고 레벨이 10에서 20으로 늘었다(2026-11-24, 변경 이력 22)
  p.pity = 95;
  // 총 성공 100%(대성공 몫 1/5): 대성공 굴림 0.19는 대성공(19 < 20), 0.2는 일반 성공.
  const result = tryEnhance(p, 'vitality', { rng: rolls(0.999, 0.19) });
  assert.equal(result.chanceUsed, 100);
  assert.equal(result.result, 'great');
  assert.equal(result.to, 20); // 19 + 2 = 21이지만 상한 20
  assert.equal(p.pity, 0);
  assert.deepEqual(getEnhanceOdds(p, 'vitality'), { success: 0, great: 0, fail: 0, degrade: 0 });
  assert.throws(() => tryEnhance(p, 'vitality', { rng: rolls() }), RangeError);
  const auto = autoEnhance(p, 'vitality', { rng: rolls() });
  assert.equal(auto.reason, 'max');
  assert.deepEqual(auto.attempts, []);
  assert.equal(enhanceCost(20), Infinity);
  assert.throws(() => enhanceCost(21), RangeError);
});

test('+10은 더 이상 최고 레벨이 아니다: 비용·확률이 있고 +11로 오른다', () => {
  const p = atLevel(10);
  assert.equal(Number.isFinite(enhanceCost(10)), true);
  assert.deepEqual(getEnhanceOdds(p, 'vitality'), { success: 31.6, great: 12.4, fail: 34, degrade: 22 });
  const result = tryEnhance(p, 'vitality', { rng: rolls(0.05, 0.9) });
  assert.deepEqual([result.result, result.from, result.to], ['success', 10, 11]);
});

test('비용: 1~5레벨은 1.6배씩, 5레벨을 넘으면 2배씩(반올림 한 번)', () => {
  assert.deepEqual([0, 1, 2, 5, 9].map(enhanceCost), [20, 32, 51, 210, 3355]);
});

test('천장: 어느 레벨에서도 실패가 쌓이면 총 성공 확률이 100%에 닿고 성공한다(보호권 자동 사용으로 +20까지)', () => {
  const p = createProgress();
  p.protect = 1e9;
  let attempts = 0;
  let failures = 0;
  while (p.enh.growth < ENHANCE.outcomes.length) {
    const result = tryEnhance(p, 'growth', { rng: () => 0.999999, protect: 'use' }); // 항상 실패 쪽 굴림
    attempts++;
    if (result.result === 'fail' || result.result === 'degrade') failures++;
    assert.ok(attempts < 1000, '끝나지 않는다');
  }
  // 레벨마다 실패가 ceil((100 − 총 성공)/5)번 쌓인 다음 시도가 성공이다. 대성공(+2)이 나오지 않는 굴림(0.999999)이라 한 칸씩 오른다.
  const expected = ENHANCE.outcomes.reduce((sum, row) => sum + Math.ceil((100 - row.success - row.great) / ENHANCE.pityStep), 0);
  assert.equal(failures, expected);
  assert.equal(attempts, expected + ENHANCE.outcomes.length);
});

// ---- 연속 강화(변경 이력 23) ----

function bankroll(level, extra = {}) {
  const p = atLevel(level);
  p.yoryeok = 1e12;
  return Object.assign(p, extra);
}

test('연속 강화 기본은 20번이다(ENHANCE.autoBatch). 대성공·퇴화·보호권 사용에서 멈추지 않고 끝까지 간다', () => {
  assert.equal(ENHANCE.autoBatch, 20);
  assert.equal(ENHANCE.autoLimit, undefined, '옛 한도(200)는 autoBatch가 대신한다');
  let seed = 7;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const p = bankroll(4, { protect: 1e9 });
  const batch = autoEnhance(p, 'vitality', { rng, degrade: 'A', useProtect: true });
  assert.equal(batch.attempts.length, 20);
  assert.equal(batch.reason, 'batch');
  const kinds = new Set(batch.attempts.map((a) => a.result));
  assert.ok(kinds.has('degrade') || kinds.has('fail'), '실패·퇴화가 나와도 이어졌다');
  assert.equal(batch.summary.tries, 20);
  assert.equal(batch.summary.from, 4);
  assert.equal(batch.summary.to, p.enh.vitality);
  assert.equal(p.pendingDegrade, undefined);
  assert.equal(p.pendingProtect, undefined);
  // 요력은 시도마다 그 레벨의 비용을 낸다.
  assert.equal(batch.summary.spent, 1e12 - p.yoryeok);
});

test('연속 강화 · A 방침: 퇴화가 나올 때마다 레벨을 한 칸 낮추고 계속한다. 보호권은 쓰지 않는다', () => {
  const p = bankroll(4, { protect: 3 });
  // 1번: +5 시도에서 실패·퇴화 → A로 +4→+3. 2번: +4 시도(천장 5%p, 총 성공 80+5)에서 성공(대성공 아님).
  const { attempts, reason, summary } = autoEnhance(p, 'vitality', { rng: rolls(0.8, 0.33, 0.0, 0.99), degrade: 'A', useProtect: false, count: 2 });
  assert.deepEqual(attempts.map((a) => [a.result, a.from, a.to, a.degradeChoice]), [['degrade', 4, 3, 'A'], ['success', 3, 4, undefined]]);
  assert.equal(reason, 'batch');
  assert.equal(p.enh.vitality, 4);
  assert.equal(p.protect, 3, '쓰지 않기: 보호권이 있어도 그대로');
  assert.equal(p.pendingDegrade, undefined);
  assert.deepEqual({ ...summary, spent: 0 }, {
    tries: 2, success: 1, great: 0, fail: 0, protectUsed: 0, degrade: 1, lowered: 1, devolved: 0, from: 4, to: 4, spent: 0,
  });
  assert.equal(summary.spent, enhanceCost(4) + enhanceCost(3));
});

test('연속 강화 · 보호권 자동 사용: 퇴화가 나올 때마다 한 장씩 쓰고, 다 쓰면 고른 방식(A)으로 이어서 처리한다', () => {
  const p = bankroll(4, { protect: 1 });
  // 1번 퇴화 → 보호권 1장(레벨 유지), 2번 퇴화(천장 +5%p) → 보호권이 없어 A, 3번은 실패(퇴화 아님).
  const { attempts, summary } = autoEnhance(p, 'vitality', {
    rng: rolls(0.9, 0.1, 0.9, 0.1, 0.99, 0.99), degrade: 'A', useProtect: true, count: 3,
  });
  assert.deepEqual(attempts.map((a) => [a.result, a.protectedUsed ?? false, a.degradeChoice ?? null]), [
    ['fail', true, null], ['degrade', false, 'A'], ['fail', false, null],
  ]);
  assert.equal(p.protect, 0);
  assert.equal(p.enh.vitality, 3);
  assert.equal(summary.protectUsed, 1);
  assert.equal(summary.degrade, 1);
  assert.equal(summary.lowered, 1);
  assert.equal(summary.fail, 1);
});

test('연속 강화 · B 방침: 퇴화마다 진화 단계를 하나씩 예약하고 강화 레벨은 지킨다. 예약 수는 pendingDevolve에 쌓인다', () => {
  const p = bankroll(4, { stage: 4 });
  const { attempts, reason, summary } = autoEnhance(p, 'vitality', { rng: rolls(0.99, 0.0, 0.99, 0.0), degrade: 'B', useProtect: false, count: 2 });
  assert.deepEqual(attempts.map((a) => [a.result, a.degradeChoice]), [['degrade', 'B'], ['degrade', 'B']]);
  assert.equal(reason, 'batch');
  assert.equal(p.enh.vitality, 4, 'B는 강화 레벨을 지킨다');
  assert.equal(p.pendingDevolve, 2, '두 번 예약: 4단계 → 2단계');
  assert.equal(p.stage, 4, '단계는 진화 화면이 내린다');
  assert.equal(summary.devolved, 2);
  assert.equal(summary.degrade, 2);
  assert.equal(p.pendingDegrade, undefined);
});

test('연속 강화 · B인데 더 내릴 단계가 없으면(1단계, 또는 예약으로 다 찼으면) 퇴화를 확정하지 않고 멈춘다 — A로 몰래 바꾸지 않는다', () => {
  // 1단계: 첫 퇴화에서 곧바로 멈춘다.
  const first = bankroll(4);
  const stopped = autoEnhance(first, 'vitality', { rng: rolls(0.99, 0.0), degrade: 'B', count: 20 });
  assert.equal(stopped.reason, 'devolve');
  assert.equal(stopped.attempts.length, 1);
  assert.equal(first.enh.vitality, 4, '레벨은 낮추지 않았다');
  assert.equal(first.pendingDegrade, 'vitality', '한 번씩 고르는 A/B 창이 이어서 뜬다');
  assert.equal(first.pendingDevolve, undefined);
  assert.equal(stopped.summary.degrade, 1);
  assert.equal(stopped.summary.devolved, 0);
  assert.deepEqual(applyDegradeChoice(first, 'B', 'vitality'), { ok: false });
  assert.deepEqual(applyDegradeChoice(first, 'A', 'vitality'), { ok: true });
  // 3단계: 두 번은 예약하고(3→1) 세 번째에서 멈춘다.
  const third = bankroll(4, { stage: 3 });
  const run = autoEnhance(third, 'vitality', { rng: rolls(0.99, 0.0, 0.99, 0.0, 0.99, 0.0), degrade: 'B', count: 20 });
  assert.equal(run.reason, 'devolve');
  assert.equal(run.attempts.length, 3);
  assert.equal(third.pendingDevolve, 2);
  assert.equal(third.pendingDegrade, 'vitality');
  assert.deepEqual(applyDegradeChoice(third, 'B', 'vitality'), { ok: false });
});

test('연속 강화는 최고 레벨·요력 부족·S/S+ 한 번에서만 20번 전에 멈춘다', () => {
  // 최고 레벨: 성공만 나오는 굴림으로 +18에서 시작하면 둘째 시도에서 +20에 닿고 거기서 멈춘다(20번을 채우지 않는다).
  const max = createProgress();
  max.yoryeok = 1e12;
  max.enh.growth = 18;
  const reached = autoEnhance(max, 'growth', { rng: rolls(0, 0.99, 0, 0.99), degrade: 'A' });
  assert.equal(reached.reason, 'max');
  assert.equal(reached.attempts.length, 2);
  assert.equal(max.enh.growth, 20);
  // 요력 부족: +0(20)·+1(32)을 낼 수 있고 +2(51)에서 부족하다.
  const poor = createProgress();
  poor.yoryeok = 60;
  const gold = autoEnhance(poor, 'growth', { rng: rolls(0, 0.99, 0, 0.99, 0, 0.99), degrade: 'A' });
  assert.equal(gold.reason, 'gold');
  assert.equal(gold.attempts.length, 2);
  assert.equal(poor.yoryeok, 8);
  assert.equal(gold.summary.spent, 52);
  // 시작부터 최고 레벨이면 시도하지 않는다.
  const full = bankroll(20);
  assert.deepEqual(autoEnhance(full, 'vitality', { rng: rolls() }).attempts, []);
  assert.equal(autoEnhance(full, 'vitality', { rng: rolls() }).reason, 'max');
  // S·S+ 등급은 연속 강화여도 한 번만(ENHANCE.singleAttemptGrades).
  for (const grade of ['S', 'S+']) {
    const s = bankroll(4, { grade });
    const checked = [], paid = [];
    const one = autoEnhance(s, 'vitality', {
      rng: rolls(0.1, 0.5), degrade: 'A',
      canAfford: (cost) => { checked.push(cost); return true; },
      pay: (cost) => { paid.push(cost); },
    });
    assert.equal(one.reason, 'single');
    assert.equal(one.attempts.length, 1);
    assert.deepEqual(checked, [131]);
    assert.deepEqual(paid, [131]);
  }
  const rejected = autoEnhance(bankroll(5), 'vitality', { rng: rolls(), canAfford: () => true, pay: () => false });
  assert.deepEqual(rejected.attempts, []);
  assert.equal(rejected.reason, 'gold');
  assert.throws(() => autoEnhance(bankroll(5), 'vitality', { degrade: 'C' }), RangeError);
});

test('각 목표 10만 회: 본체 강화 네 결과의 실측이 표(성공·대성공·실패·퇴화)의 ±1%p 이내', () => {
  const trials = 100_000;
  let seed = 0x315dc6;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  function close(actual, expected, label) {
    assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual}% / 기대 ${expected}%`);
  }
  ENHANCE.outcomes.forEach((row, level) => {
    assert.deepEqual(getEnhanceOdds(atLevel(level), 'vitality'), row, '표시 확률 = 표 +' + (level + 1));
    const counts = { success: 0, great: 0, fail: 0, degrade: 0 };
    for (let i = 0; i < trials; i++) counts[tryEnhance(atLevel(level), 'vitality', { rng }).result]++;
    for (const key of Object.keys(counts)) close(counts[key] * 100 / trials, row[key], `+${level + 1} ${key}`);
  });
});
