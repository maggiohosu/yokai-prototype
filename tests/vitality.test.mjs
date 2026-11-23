import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { absorbHit, createVitality, stepVitality, vitalityMax, vitalityVisible } from '../src/systems/vitality.js';

const V = CONFIG.vitality;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);
const H = 1 / 60;

// dt 간격으로 seconds만큼 흘린다. 먹힌 시각(초)을 돌려주고, 먹히지 않았으면 null.
function run(state, max, touching, seconds, dt = H) {
  let t = 0;
  while (t < seconds - 1e-12) {
    const step = Math.min(dt, seconds - t);
    t += step;
    if (stepVitality(state, { touching, dt: step, max }).eaten) return t;
  }
  return null;
}

test('vitalityMax: baseSec(약 10ms) + 0.25초 × 레벨', () => {
  const b = CONFIG.vitality.baseSec;
  assert.ok(b > 0 && b < 0.02, '기본 생명력은 약 10ms(사용자 지시 2026-11-23)');
  near(vitalityMax(0), b);
  near(vitalityMax(1), b + 0.25);
  near(vitalityMax(10), b + 2.5);
  near(vitalityMax(-4), b);
});

test('버티는 시간: 닿아 있는 동안 게이지만큼 버티고, 0이 되는 순간에도 닿아 있으면 먹힌다', () => {
  for (const level of [0, 3, 10]) {
    const max = vitalityMax(level);
    const state = createVitality(max);
    const eatenAt = run(state, max, true, max + 1);
    assert.ok(eatenAt !== null, `레벨 ${level}: 먹혀야 한다`);
    assert.ok(eatenAt >= max - 1e-9, '게이지가 남아 있는 동안은 먹히지 않는다');
    near(eatenAt, max, H + 1e-9);
  }
  // 게이지가 바닥나기 직전까지는 안 먹힌다.
  const max = vitalityMax(0);
  const state = createVitality(max);
  assert.equal(run(state, max, true, max - 0.05), null);
  assert.ok(state.value > 0);
});

test('겹친 적이 여럿이어도 소모 속도는 1배(touching은 불리언 하나)', () => {
  const max = vitalityMax(2);
  const one = createVitality(max);
  run(one, max, true, 0.3);
  near(one.value, max - 0.3, 2e-3);
});

test('게이지가 이미 0이면 닿는 순간 먹힌다', () => {
  const state = { value: 0, sinceTouch: Infinity };
  assert.equal(stepVitality(state, { touching: true, dt: H, max: 1 }).eaten, true);
});

test('닿은 직후 regenDelaySec 동안은 회복하지 않고, 그 뒤 빈 상태에서 regenFullSec에 가득 찬다', () => {
  const max = vitalityMax(4);
  const state = createVitality(max);
  run(state, max, true, 0.5);
  const drained = state.value;
  assert.ok(drained < max);
  run(state, max, false, V.regenDelaySec - 0.01);
  near(state.value, drained, 1e-9);
  run(state, max, false, 0.01 + 1);
  near(state.value, drained + 1 * (max / V.regenFullSec), 1e-6);

  const empty = { value: 0, sinceTouch: 0 };
  run(empty, max, false, V.regenDelaySec + V.regenFullSec - 0.01);
  assert.ok(empty.value < max);
  run(empty, max, false, 0.02);
  near(empty.value, max, 1e-9);
});

test('회복은 큰 dt 한 번으로 지연을 넘겨도 지연 이후 시간만 계산한다', () => {
  const state = { value: 0, sinceTouch: 0 };
  stepVitality(state, { touching: false, dt: 1, max: 2 });
  near(state.value, (1 - V.regenDelaySec) * (2 / V.regenFullSec));
});

test('다시 닿으면 회복 지연이 처음부터다', () => {
  const max = vitalityMax(2);
  const state = createVitality(max);
  run(state, max, true, 0.2);
  run(state, max, false, 0.3);
  run(state, max, true, 0.1);
  const before = state.value;
  run(state, max, false, V.regenDelaySec - 0.02);
  near(state.value, before, 1e-9);
});

test('최대치가 줄면 현재치를 자르고, 늘면 현재치는 그대로다', () => {
  const state = createVitality(3.1);
  stepVitality(state, { touching: false, dt: H, max: 1 });
  near(state.value, 1);
  const kept = createVitality(0.6);
  stepVitality(kept, { touching: false, dt: 0, max: 3.1 });
  near(kept.value, 0.6);
});

test('absorbHit: 게이지가 충분하면 피해 0, 모자라면 모자란 비율만큼만 피해', () => {
  const full = createVitality(1);
  assert.deepEqual(absorbHit(full, 0.5), { damageRatio: 0 });
  near(full.value, 0.5);
  const low = { value: 0.2, sinceTouch: Infinity };
  const result = absorbHit(low, 0.5);
  near(result.damageRatio, 0.6);
  assert.equal(low.value, 0);
  assert.deepEqual(absorbHit({ value: 0, sinceTouch: Infinity }, 0.5), { damageRatio: 1 });
  assert.deepEqual(absorbHit(createVitality(1), 0), { damageRatio: 1 });
  // 기본값은 설정의 hitDrainSec
  const dflt = createVitality(1);
  absorbHit(dflt);
  near(dflt.value, 1 - V.hitDrainSec);
});

test('맞은 직후에도 회복을 잠시 미룬다', () => {
  const state = createVitality(2);
  absorbHit(state, 0.5);
  const after = state.value;
  run(state, 2, false, V.regenDelaySec - 0.02);
  near(state.value, after, 1e-9);
});

test('vitalityVisible: 가득 차면 숨긴다', () => {
  assert.equal(vitalityVisible(createVitality(1), 1), false);
  assert.equal(vitalityVisible({ value: 0.99, sinceTouch: 0 }, 1), true);
});
